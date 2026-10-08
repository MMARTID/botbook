"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Languages, Lock, Pause, Play } from "lucide-react";
import { getBillingSummary, getCatalogoDeIdiomas, previsualizarIdiomas, updateMyBusiness } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type {
  AgentLanguage,
  AgentSettings,
  Business,
  FamiliaDeVoces,
  PlanFeatureKey,
  PrincipalDelCatalogo,
  RequisitoDelPlan,
  VozDelPanel,
} from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-settings";
import { BarraGuardar, Insignia } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

type CampoDeOpciones = "tone" | "primaryGoal" | "responseStyle" | "escalation";

const CAMPOS: Array<{ clave: CampoDeOpciones; titulo: string; texto: string; opciones: Array<[string, string, string]> }> = [
  {
    clave: "tone",
    titulo: "Tono de voz",
    texto: "Cómo debe sonar durante la llamada.",
    opciones: [
      ["warm", "Cercano", "Natural y empático"],
      ["professional", "Profesional", "Formal y seguro"],
      ["direct", "Ágil", "Práctico y directo"],
    ],
  },
  {
    clave: "primaryGoal",
    titulo: "Objetivo principal",
    texto: "Qué debe priorizar el agente.",
    opciones: [
      ["bookings", "Conseguir reservas", "Guiar la llamada hacia una cita"],
      ["customer_service", "Atender consultas", "Resolver y reservar si procede"],
      ["lead_capture", "Captar oportunidades", "Recoger datos para seguimiento"],
    ],
  },
  {
    clave: "responseStyle",
    titulo: "Estilo de respuesta",
    texto: "Cuánto debe extenderse al responder.",
    opciones: [
      ["concise", "Breve", "Una o dos frases"],
      ["balanced", "Equilibrado", "Algo más de contexto"],
    ],
  },
  {
    clave: "escalation",
    titulo: "Cuando no pueda resolverlo",
    texto: "Protocolo seguro ante información desconocida.",
    opciones: [
      ["take_message", "Tomar un recado", "Nombre, teléfono y motivo"],
      ["request_callback", "Solicitar devolución", "Pedir datos para llamar después"],
    ],
  },
];

function Opcion({
  elegida,
  titulo,
  detalle,
  onClick,
}: {
  elegida: boolean;
  titulo: string;
  detalle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegida}
      onClick={onClick}
      className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
        elegida ? "border-morado bg-lavado" : "border-linea bg-superficie"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-tinta">{titulo}</span>
        {detalle ? <span className="mt-px block text-[13px] text-muted">{detalle}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${elegida ? "border-morado bg-morado shadow-[inset_0_0_0_4px_rgb(var(--superficie))]" : "border-linea-fuerte bg-superficie"}`}
      />
    </button>
  );
}

/** Lo que se pregunta antes de ir a los planes con cambios sin guardar. */
export const CONFIRMACION_IR_A_LOS_PLANES =
  "Tienes cambios sin guardar en «Cómo atiende». Si vas ahora a los planes, se pierden. ¿Ir a los planes?";

/** Enlace a los planes desde lo que el plan no incluye. Sale de la
 * pantalla: con cambios sin guardar, pregunta antes (la barra de guardar no
 * protege de la navegación). */
function EnlaceALosPlanes({
  hayCambios,
  className,
  children,
}: {
  hayCambios: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href="/ajustes/facturacion"
      onClick={(evento) => {
        if (hayCambios && !window.confirm(CONFIRMACION_IR_A_LOS_PLANES)) evento.preventDefault();
      }}
      className={className}
    >
      {children}
    </Link>
  );
}

/** Un idioma principal que el plan no incluye: con su candado y el enlace
 * para ampliar el plan, a la vista en vez de oculto. Es un enlace, no una
 * opción que se pueda marcar. Desde el 2026-10-07 ninguno lo exige; sale
 * con el catálogo del backend anterior (catalán, euskera y gallego). */
function OpcionBloqueada({ titulo, texto, hayCambios }: { titulo: string; texto: string; hayCambios: boolean }) {
  return (
    <EnlaceALosPlanes
      hayCambios={hayCambios}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-linea bg-superficie px-3.5 py-2.5 text-left transition-colors duration-200 hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-apagado">{titulo}</span>
        <span className="mt-px block text-[13px] font-semibold text-morado-tinta underline underline-offset-[3px]">{texto}</span>
      </span>
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
        <Lock className="h-4 w-4" />
      </span>
    </EnlaceALosPlanes>
  );
}

/** Una sola muestra de voz sonando a la vez. `parar` la corta (p. ej.
 * cuando su tarjeta deja de verse). */
function useMuestraDeVoz() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const parar = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setSonando(null);
  }, []);

  const alternar = (voz: VozDelPanel) => {
    audio.current?.pause();
    if (sonando === voz.id) {
      setSonando(null);
      return;
    }
    const nueva = new Audio(voz.muestra);
    const terminar = () => setSonando((actual) => (actual === voz.id ? null : actual));
    nueva.addEventListener("ended", terminar);
    nueva.addEventListener("error", terminar);
    audio.current = nueva;
    setSonando(voz.id);
    // play() devuelve una promesa que se rechaza si el navegador no deja
    // reproducir; envuelta, tampoco rompe si lanza o no devuelve nada.
    Promise.resolve()
      .then(() => nueva.play())
      .catch(terminar);
  };
  return { sonando, alternar, parar };
}

/** Una voz: se escucha con el círculo y se elige con el resto de la fila
 * (dos botones hermanos: un botón no puede ir dentro de otro). */
function OpcionDeVoz({
  voz,
  elegida,
  sonando,
  conPorDefecto,
  onElegir,
  onEscuchar,
}: {
  voz: VozDelPanel;
  elegida: boolean;
  sonando: boolean;
  /** Si lleva la insignia «Por defecto» cuando lo es. */
  conPorDefecto: boolean;
  onElegir: () => void;
  onEscuchar: () => void;
}) {
  return (
    <div
      className={`flex min-h-[60px] items-center gap-1.5 rounded-2xl border py-1 pl-2 pr-3.5 ${
        elegida ? "border-morado bg-lavado" : "border-linea bg-superficie"
      }`}
    >
      <button
        type="button"
        onClick={onEscuchar}
        aria-label={sonando ? `Parar la muestra de ${voz.nombre}` : `Escuchar a ${voz.nombre}`}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-morado transition-colors hover:text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
          elegida ? "bg-superficie" : "bg-lavado"
        }`}
      >
        {sonando ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={elegida}
        onClick={onElegir}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-bold text-tinta">{voz.nombre}</span>
            {conPorDefecto && voz.porDefecto ? <Insignia tono="neutro">Por defecto</Insignia> : null}
          </span>
          <span className="mt-px block text-[13px] text-muted">{voz.descripcion}</span>
        </span>
        <span
          aria-hidden="true"
          className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${elegida ? "border-morado bg-morado shadow-[inset_0_0_0_4px_rgb(var(--superficie))]" : "border-linea-fuerte bg-superficie"}`}
        />
      </button>
    </div>
  );
}

const GENEROS: ReadonlyArray<[AgentSettings["voiceGender"], string]> = [
  ["femenina", "Mujer"],
  ["masculina", "Hombre"],
];

/**
 * «¿Con qué voz atiende?» con las voces que da el backend para el principal.
 * Las Ultra (las nativas del principal): Mujer u Hombre, las recomendadas de
 * ese género y el resto tras «Ver todas las voces». Las de Soniox (con
 * catalán, euskera o gallego de principal): Marta y Sergio, las dos, sin
 * «Por defecto» (sin selector de género, las dos lo serían).
 *
 * Con `bloqueo` (un plan sin «elegir_voz», desde el 2026-10-07): Mujer u
 * Hombre y la de por defecto de ese género, con su muestra, y en vez de
 * «Ver todas las voces» el enlace con candado a los planes. La guardada y
 * la que atiende siguen a la vista aunque no sean la de por defecto: quien
 * eligió voz en Pro y bajó de plan la conserva y puede volver a ella.
 */
function SelectorDeVoz({
  voces,
  familia,
  vozQueAtiende,
  conservada,
  genero,
  bloqueo,
  hayCambios,
  sonando,
  onEscuchar,
  onParar,
  onElegir,
  onGenero,
}: {
  voces: VozDelPanel[];
  familia: FamiliaDeVoces;
  vozQueAtiende: string | undefined;
  /** La voz guardada: con candado, se puede volver a ella. */
  conservada: string | undefined;
  genero: AgentSettings["voiceGender"];
  /** Lo que exige elegir otra que la de por defecto si el plan no lo
   * incluye; null si se elige entre todas. */
  bloqueo: RequisitoDelPlan | null;
  /** Si hay algo sin guardar en la pantalla (lo pregunta el candado). */
  hayCambios: boolean;
  sonando: string | null;
  onEscuchar: (voz: VozDelPanel) => void;
  /** Corta la muestra que suena. */
  onParar: () => void;
  onElegir: (voz: VozDelPanel) => void;
  onGenero: (genero: AgentSettings["voiceGender"]) => void;
}) {
  const [todas, setTodas] = useState(false);
  const porGenero = familia === "ultra";
  const delGenero = porGenero ? voces.filter((voz) => voz.genero === genero) : voces;
  // Las que el plan deja elegir: todas o, con candado, la de por defecto
  // (y la guardada y la que atiende, si las conserva).
  const elegibles = bloqueo
    ? delGenero.filter((voz) => voz.porDefecto || voz.id === vozQueAtiende || voz.id === conservada)
    : delGenero;
  // Plegadas, las recomendadas y la que atiende (aunque no lo sea), para
  // que la elegida siempre esté a la vista.
  const aLaVista =
    porGenero && !bloqueo && !todas ? elegibles.filter((voz) => voz.recomendada || voz.id === vozQueAtiende) : elegibles;
  const hayMas = porGenero && !bloqueo && (todas || aLaVista.length < delGenero.length);
  // El otro género vuelve a enseñar solo sus recomendadas; el mismo no
  // cambia nada.
  const cambiarGenero = (valor: AgentSettings["voiceGender"]) => {
    if (valor === genero) return;
    setTodas(false);
    onGenero(valor);
  };

  // Una muestra no sigue sonando sin su tarjeta a la vista (al plegar,
  // cambiar de género o de lista): no quedaría botón para pararla.
  const idsALaVista = aLaVista.map((voz) => voz.id).join(" ");
  useEffect(() => {
    if (sonando !== null && !idsALaVista.split(" ").includes(sonando)) onParar();
  }, [sonando, idsALaVista, onParar]);
  useEffect(() => onParar, [onParar]);

  return (
    <>
      {porGenero ? (
        <div
          role="radiogroup"
          aria-label="Voz de mujer o de hombre"
          className="mb-3 flex w-full gap-1 rounded-full border border-linea bg-relleno p-1 sm:inline-flex sm:w-auto"
        >
          {GENEROS.map(([valor, texto]) => {
            const elegido = genero === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={elegido}
                onClick={() => cambiarGenero(valor)}
                className={`min-h-11 flex-1 rounded-full px-6 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado sm:flex-none ${
                  elegido ? "bg-lavado text-morado-tinta ring-1 ring-inset ring-lavado-borde" : "text-apagado hover:text-tinta"
                }`}
              >
                {texto}
              </button>
            );
          })}
        </div>
      ) : null}
      <div id="lista-de-voces" role="radiogroup" aria-labelledby="pregunta-voz" className="grid gap-2 sm:grid-cols-2">
        {aLaVista.map((voz) => (
          <OpcionDeVoz
            key={voz.id}
            voz={voz}
            elegida={vozQueAtiende === voz.id}
            sonando={sonando === voz.id}
            conPorDefecto={porGenero}
            onElegir={() => onElegir(voz)}
            onEscuchar={() => onEscuchar(voz)}
          />
        ))}
      </div>
      {hayMas ? (
        <button
          type="button"
          aria-expanded={todas}
          aria-controls="lista-de-voces"
          onClick={() => setTodas(!todas)}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-linea bg-superficie px-4 text-sm font-semibold text-tinta transition-colors duration-200 hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado sm:w-auto"
        >
          {todas ? "Ver solo las recomendadas" : `Ver todas las voces (${delGenero.length})`}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${todas ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
      {bloqueo ? (
        <EnlaceALosPlanes
          hayCambios={hayCambios}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-linea bg-superficie px-4 text-sm font-semibold text-morado-tinta underline-offset-[3px] transition-colors duration-200 hover:bg-relleno hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado sm:w-auto"
        >
          <Lock className="h-4 w-4 shrink-0 text-morado" aria-hidden="true" />
          {bloqueo.texto}
        </EnlaceALosPlanes>
      ) : null}
    </>
  );
}

/**
 * Idioma y voz, guiado por el catálogo del backend (GET /business/me/idiomas)
 * y su vista previa (POST …/previsualizar): el panel no repite las reglas.
 * Desde el 2026-10-05 el dueño solo elige el idioma principal (español o una
 * lengua cooficial a la vista; los extranjeros bajo «Otro idioma») y la voz,
 * escuchándolas antes; el panel dice cuántos idiomas habla con ese principal.
 * Desde el 2026-10-07 el principal es libre en todos los planes, y elegir
 * entre todas las voces exige «elegir_voz» (Pro y Scale): sin ella, Mujer u
 * Hombre y la voz por defecto de cada uno, con el enlace con candado a los
 * planes; la voz que el negocio ya tiene la conserva. Lo que exige cada cosa
 * lo dice el backend (`requiere`, `requiereParaElegirVoz`).
 */
function IdiomaYVoz({
  ajustes,
  guardado,
  hayCambios,
  setAjustes,
  planFeatures,
}: {
  ajustes: AgentSettings;
  /** Lo guardado: el principal y la voz que ya tiene no se bloquean aunque
   * el plan ya no los incluya (el backend solo mira el plan al cambiarlos). */
  guardado: AgentSettings;
  /** Si hay algo sin guardar en la pantalla (no solo el idioma y la voz). */
  hayCambios: boolean;
  setAjustes: (ajustes: AgentSettings) => void;
  /** Las funciones del plan (GET /billing/summary); sin cargar, nada se
   * bloquea (lo valida también el backend, y su motivo sale al guardar). */
  planFeatures: PlanFeatureKey[] | undefined;
}) {
  const catalogo = useQuery({
    queryKey: ["idiomas-catalogo"],
    queryFn: getCatalogoDeIdiomas,
    staleTime: Infinity,
  });
  // `languages` va porque el backend anterior lo exige; el nuevo solo mira
  // el principal.
  const seleccion = {
    languages: ajustes.languages,
    voiceLanguage: ajustes.voiceLanguage,
    voiceGender: ajustes.voiceGender,
    voz: ajustes.voz,
  };
  const vista = useQuery({
    queryKey: ["idiomas-vista-previa", seleccion],
    queryFn: () => previsualizarIdiomas(seleccion),
    placeholderData: keepPreviousData,
  });
  const [otroAbierto, setOtroAbierto] = useState<boolean | null>(null);
  const { sonando, alternar, parar } = useMuestraDeVoz();
  // La última voz elegida de cada género, para recuperarla al volver a él:
  // mirar las voces de hombre no debe borrar la de mujer que se tenía.
  const vozPorGenero = useRef<Partial<Record<AgentSettings["voiceGender"], string>>>({});
  useEffect(() => {
    if (ajustes.voz) vozPorGenero.current[ajustes.voiceGender] = ajustes.voz;
  }, [ajustes.voz, ajustes.voiceGender]);

  const datos = catalogo.data;
  const etiqueta = (codigo: AgentLanguage) => datos?.etiquetas[codigo] ?? codigo;
  const obligatorio = datos?.obligatorio.codigo ?? "es-ES";
  const principal = ajustes.voiceLanguage;
  // Un principal guardado que ya no se ofrece sigue a la vista, bajo «Otro
  // idioma», para no cambiarlo sin que el dueño lo elija.
  const principales: PrincipalDelCatalogo[] = datos
    ? datos.principales.some((opcion) => opcion.codigo === principal)
      ? datos.principales
      : [...datos.principales, { codigo: principal, etiqueta: etiqueta(principal), tipo: "extranjero", familia: "ultra", voces: [] }]
    : [];
  const ofrecido = principales.find((opcion) => opcion.codigo === principal);
  // «voz_idioma» la mandan solo a Pro y Scale el backend del 05-10 y el de
  // antes (y el nuevo, durante el despliegue): con el plan en caché de un
  // backend anterior y la vista previa del nuevo, que pide «elegir_voz», un
  // Pro no debe ver candado. QUITAR con las otras claves transitorias
  // (featuresParaLaApp en backend/src/lib/planFeatures.ts).
  const incluye = (funcion: PlanFeatureKey) =>
    planFeatures === undefined ||
    planFeatures.includes(funcion) ||
    (funcion === "elegir_voz" && planFeatures.includes("voz_idioma"));
  // Hoy ningún principal lo exige; el backend anterior, catalán, euskera y
  // gallego («lenguas_locales»).
  const bloqueada = (opcion: PrincipalDelCatalogo) =>
    Boolean(opcion.requiere && !incluye(opcion.requiere.funcion) && opcion.codigo !== guardado.voiceLanguage);
  const aLaVista = principales.filter((opcion) => opcion.tipo !== "extranjero");
  const extranjeros = principales.filter((opcion) => opcion.tipo === "extranjero");
  const enOtro = ofrecido?.tipo === "extranjero";
  const otroVisible = otroAbierto ?? enOtro;

  // Las voces las da la vista previa del principal; mientras llega (o si
  // falla), las del catálogo, que son las mismas.
  const vistaAlDia = vista.isPlaceholderData ? undefined : vista.data;
  const voces = vistaAlDia?.voces ?? ofrecido?.voces ?? [];
  const familia = vistaAlDia?.familia ?? ofrecido?.familia ?? "ultra";
  const vozQueAtiende =
    voces.find((voz) => voz.id === ajustes.voz)?.id ??
    vistaAlDia?.voz ??
    voces.find((voz) => voz.porDefecto && voz.genero === ajustes.voiceGender)?.id;
  const genero = voces.find((voz) => voz.id === vozQueAtiende)?.genero ?? ajustes.voiceGender;
  // Elegir otra que la de por defecto, si el plan no lo incluye. Sin el
  // campo (backend anterior), nada se bloquea: ese backend tampoco lo mira.
  const requisitoDeVoz = vistaAlDia?.requiereParaElegirVoz ?? ofrecido?.requiereParaElegirVoz ?? null;
  const bloqueoDeVoz = requisitoDeVoz && !incluye(requisitoDeVoz.funcion) ? requisitoDeVoz : null;

  const lista = (codigos: AgentLanguage[]) => {
    const nombres = codigos.map((codigo, indice) => (indice === 0 ? etiqueta(codigo) : etiqueta(codigo).toLowerCase()));
    return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} o ${nombres[nombres.length - 1]}` : nombres[0];
  };
  // El orden de las etiquetas es el canónico del catálogo.
  const ordenar = (idiomas: AgentLanguage[]) =>
    Object.keys(datos?.etiquetas ?? {}).filter((codigo) => idiomas.includes(codigo));

  const elegirPrincipal = (codigo: AgentLanguage) => {
    if (codigo === principal) return;
    const opcion = principales.find((candidato) => candidato.codigo === codigo);
    // Los idiomas que habla con él los da el catálogo. El backend anterior
    // no los manda: el obligatorio y él, que acepta y corrige al guardar.
    // Al volver al principal guardado, los guardados tal cual: así no
    // aparece la barra de guardar sin ningún cambio a la vista aunque lo
    // guardado sea de antes (languages de cuando se elegían).
    // La voz elegida se conserva: si no es de las del principal nuevo, la
    // vista previa enseña la que atiende y el backend la descarta al
    // guardar; si se vuelve, vuelve.
    const languages =
      codigo === guardado.voiceLanguage ? guardado.languages : (opcion?.idiomas ?? ordenar([obligatorio, codigo]));
    setAjustes({ ...ajustes, voiceLanguage: codigo, languages });
  };
  const elegirGenero = (valor: AgentSettings["voiceGender"]) => {
    if (valor === genero) return;
    // La que se eligió de ese género, si está entre las de ahora y el plan
    // deja elegirla; si no, la de por defecto. Con candado, solo la de por
    // defecto o la guardada: la recordada puede ser una que se conservaba y
    // ya se cambió al guardar (el backend la rechazaría).
    const recordada = vozPorGenero.current[valor];
    const vuelve = voces.find(
      (candidata) =>
        candidata.id === recordada &&
        candidata.genero === valor &&
        (!bloqueoDeVoz || candidata.porDefecto || candidata.id === guardado.voz)
    )?.id;
    setAjustes({ ...ajustes, voiceGender: valor, voz: vuelve });
  };

  // La vista previa del principal elegido. Al cambiarlo, la anterior sigue
  // en `vista.data` (keepPreviousData) hasta que llega la nueva: sus avisos
  // y su saludo serían los del principal de antes, junto a la entradilla
  // del nuevo y en la misma región viva. Al cambiar solo la voz, se queda.
  const vistaDelPrincipal = vista.data?.voiceLanguage === principal ? vista.data : undefined;
  // Cuántos idiomas habla con el principal elegido: el catálogo lo sabe sin
  // esperar a la vista previa; con el backend anterior, la vista previa.
  const entradilla = ofrecido?.entradilla ?? vistaDelPrincipal?.entradilla;
  // Un principal guardado que el plan ya no incluye (bajó de plan) se
  // conserva, pero si se cambia no se puede volver a él sin cambiar de plan.
  const guardadoDelCatalogo = principales.find((opcion) => opcion.codigo === guardado.voiceLanguage);
  const pierdeElGuardado =
    principal !== guardado.voiceLanguage &&
    planFeatures !== undefined &&
    Boolean(guardadoDelCatalogo?.requiere && !incluye(guardadoDelCatalogo.requiere.funcion));
  // Lo mismo con una voz elegida que el plan ya no deja elegir (bajó de
  // plan): se conserva, pero si atiende otra no se puede volver a ella.
  const vozGuardada = guardadoDelCatalogo?.voces.find((voz) => voz.id === guardado.voz);
  const requisitoDeLaGuardada = guardadoDelCatalogo?.requiereParaElegirVoz;
  const pierdeLaVoz =
    vozGuardada !== undefined &&
    !vozGuardada.porDefecto &&
    vozQueAtiende !== undefined &&
    vozQueAtiende !== vozGuardada.id &&
    planFeatures !== undefined &&
    Boolean(requisitoDeLaGuardada && !incluye(requisitoDeLaGuardada.funcion));
  const avisos = [
    ...(pierdeElGuardado
      ? [`Tu plan ya no incluye el ${etiqueta(guardado.voiceLanguage).toLowerCase()}: si guardas este cambio, no podrás volver a elegirlo sin cambiar de plan.`]
      : []),
    ...(pierdeLaVoz && vozGuardada
      ? [`Tu plan ya no incluye elegir la voz: si guardas este cambio, no podrás volver a ${vozGuardada.nombre} sin cambiar de plan.`]
      : []),
    ...(vistaDelPrincipal?.avisos ?? []),
  ];

  const opcionDePrincipal = (opcion: PrincipalDelCatalogo) => (
    <Opcion key={opcion.codigo} elegida={principal === opcion.codigo} titulo={opcion.etiqueta} onClick={() => elegirPrincipal(opcion.codigo)} />
  );
  const aLaVistaLibres = aLaVista.filter((opcion) => !bloqueada(opcion));
  const aLaVistaBloqueadas = aLaVista.filter(bloqueada);

  return (
    <fieldset className="min-w-0">
      <legend className="text-base font-bold text-tinta">Idioma y voz</legend>
      <p className="mb-2.5 mt-0.5 text-sm text-muted">En qué idioma saluda y con qué voz atiende.</p>

      <p id="pregunta-principal" className="mb-2 mt-1 text-sm font-semibold text-tinta">
        Idioma principal
      </p>
      <div role="radiogroup" aria-labelledby="pregunta-principal" className="flex flex-col gap-2">
        {aLaVistaLibres.map(opcionDePrincipal)}
      </div>
      {aLaVistaBloqueadas.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {aLaVistaBloqueadas.map((opcion) => (
            <li key={opcion.codigo}>
              <OpcionBloqueada titulo={opcion.etiqueta} texto={opcion.requiere?.texto ?? ""} hayCambios={hayCambios} />
            </li>
          ))}
        </ul>
      ) : null}
      {extranjeros.length ? (
        <>
          <button
            type="button"
            aria-expanded={otroVisible}
            aria-controls="principal-en-otro-idioma"
            onClick={() => setOtroAbierto(!otroVisible)}
            className={`mt-2 flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
              enOtro ? "border-morado bg-lavado" : "border-linea bg-superficie"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span id="titulo-otro-idioma" className="block text-[15px] font-bold text-tinta">
                Otro idioma
              </span>
              <span className="mt-px block text-[13px] text-muted">
                {enOtro ? `Saluda en ${etiqueta(principal).toLowerCase()}` : lista(extranjeros.map((opcion) => opcion.codigo))}
              </span>
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-apagado transition-transform duration-200 motion-reduce:transition-none ${otroVisible ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {/* Montado siempre: es el destino de aria-controls. */}
          <div id="principal-en-otro-idioma">
            {otroVisible ? (
              <>
                <div role="radiogroup" aria-labelledby="titulo-otro-idioma" className="mt-2 grid gap-2 sm:grid-cols-2">
                  {extranjeros.filter((opcion) => !bloqueada(opcion)).map(opcionDePrincipal)}
                </div>
                {extranjeros.some(bloqueada) ? (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {extranjeros.filter(bloqueada).map((opcion) => (
                      <li key={opcion.codigo}>
                        <OpcionBloqueada titulo={opcion.etiqueta} texto={opcion.requiere?.texto ?? ""} hayCambios={hayCambios} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Siempre montados: un lector de pantalla solo anuncia los cambios de
          una región viva que ya estaba en la página. */}
      <div role="status" aria-live="polite">
        {entradilla ? (
          <p className="mt-3 flex items-start gap-2.5 rounded-[14px] border border-linea bg-relleno px-3.5 py-3 text-sm leading-[1.55] text-tinta">
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-morado" aria-hidden="true" />
            <span>{entradilla}</span>
          </p>
        ) : null}
        {avisos.length ? (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-[14px] border border-lavado-borde bg-lavado px-3.5 py-3 text-sm leading-[1.55] text-morado-tinta">
            {avisos.map((avisoDeIdioma) => (
              <li key={avisoDeIdioma}>{avisoDeIdioma}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <p id="pregunta-voz" className="mb-2 mt-5 text-sm font-semibold text-tinta">
        ¿Con qué voz atiende?
      </p>
      {voces.length ? (
        <SelectorDeVoz
          // Otro principal vuelve a enseñar solo las recomendadas. Sin el
          // género en la clave: al cambiarlo, el foco sigue en su botón.
          key={`${familia}-${principal}`}
          voces={voces}
          familia={familia}
          vozQueAtiende={vozQueAtiende}
          conservada={guardado.voz}
          genero={genero}
          bloqueo={bloqueoDeVoz}
          hayCambios={hayCambios}
          sonando={sonando}
          onEscuchar={alternar}
          onParar={parar}
          onElegir={(voz) => setAjustes({ ...ajustes, voz: voz.id, voiceGender: voz.genero })}
          onGenero={elegirGenero}
        />
      ) : (
        // Un principal que ya no se ofrece no tiene voces que elegir: sigue
        // el género.
        <div role="radiogroup" aria-labelledby="pregunta-voz" className="grid grid-cols-2 gap-2">
          {GENEROS.map(([valor, titulo]) => (
            <Opcion
              key={valor}
              elegida={ajustes.voiceGender === valor}
              titulo={titulo}
              onClick={() => setAjustes({ ...ajustes, voiceGender: valor })}
            />
          ))}
        </div>
      )}

      {vistaDelPrincipal ? (
        <p className="mt-4 rounded-[14px] border border-linea bg-relleno px-3.5 py-3 text-sm leading-[1.55] text-apagado">
          Saluda así: <span className="text-tinta">«{vistaDelPrincipal.saludo}»</span>
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Cómo atiende: cada opción es una fila que se elige con un toque y lleva
 * su explicación. Lo que el plan no incluye (elegir entre todas las voces,
 * en Inicio) se ve con su candado (lo valida también el backend).
 */
export function ComportamientoMovil({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const resumen = useQuery({ queryKey: ["billing-summary"], queryFn: getBillingSummary });

  // Por contenido: un refresco del negocio al volver a la app no debe
  // borrar lo que se estaba eligiendo.
  const firmaGuardada = JSON.stringify({ ...DEFAULT_AGENT_SETTINGS, ...business.agentSettings });
  const guardado = useMemo(() => JSON.parse(firmaGuardada) as AgentSettings, [firmaGuardada]);
  const [ajustes, setAjustes] = useState(guardado);
  useEffect(() => setAjustes(guardado), [guardado]);

  const guardar = useMutation({
    mutationFn: () => updateMyBusiness({ agentSettings: ajustes }),
    onSuccess: (negocio) => {
      queryClient.setQueryData(["my-business"], negocio);
      avisar("Comportamiento del agente actualizado.");
    },
    // El motivo del backend si lo da para el dueño (p. ej. el 403 de elegir
    // la voz si el plan no lo incluye y el candado no salió).
    onError: (error) => avisar(describeApiError(error, "No se pudo guardar el comportamiento del agente."), "error"),
  });
  const hayCambios = JSON.stringify(ajustes) !== firmaGuardada;

  return (
    <PantallaDeAjuste titulo="Cómo atiende" subtitulo="El tono, el objetivo y el modo en que gestiona cada conversación.">
      <div className="flex flex-col gap-[22px]">
        {CAMPOS.map((campo) => (
          <fieldset key={campo.clave} className="min-w-0">
            <legend className="text-base font-bold text-tinta">{campo.titulo}</legend>
            <p className="mb-2.5 mt-0.5 text-sm text-muted">{campo.texto}</p>
            <div role="radiogroup" aria-label={campo.titulo} className="flex flex-col gap-2">
              {campo.opciones.map(([valor, titulo, detalle]) => (
                <Opcion
                  key={valor}
                  elegida={ajustes[campo.clave] === valor}
                  titulo={titulo}
                  detalle={detalle}
                  onClick={() => setAjustes({ ...ajustes, [campo.clave]: valor })}
                />
              ))}
            </div>
          </fieldset>
        ))}

        <IdiomaYVoz
          ajustes={ajustes}
          guardado={guardado}
          hayCambios={hayCambios}
          setAjustes={setAjustes}
          planFeatures={resumen.data?.planFeatures}
        />
      </div>
      <BarraGuardar
        visible={hayCambios}
        etiqueta="Guardar comportamiento"
        guardando={guardar.isPending}
        onGuardar={() => guardar.mutate()}
        onDescartar={() => setAjustes(guardado)}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}
