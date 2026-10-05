"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Lock, Pause, Play } from "lucide-react";
import { getBillingSummary, getCatalogoDeIdiomas, previsualizarIdiomas, updateMyBusiness } from "@/lib/api";
import type { AgentLanguage, AgentSettings, Business, FamiliaDeVoces, PrincipalDelCatalogo, VozDelPanel } from "@/lib/types";
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
  disabled,
  onClick,
  forma = "radio",
}: {
  elegida: boolean;
  titulo: string;
  detalle?: string;
  disabled?: boolean;
  onClick: () => void;
  forma?: "radio" | "check";
}) {
  return (
    <button
      type="button"
      role={forma === "radio" ? "radio" : "checkbox"}
      aria-checked={elegida}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:cursor-not-allowed disabled:opacity-60 ${
        elegida ? "border-morado bg-lavado" : "border-linea bg-superficie"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-tinta">{titulo}</span>
        {detalle ? <span className="mt-px block text-[13px] text-muted">{detalle}</span> : null}
      </span>
      {forma === "radio" ? (
        <span
          aria-hidden="true"
          className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${elegida ? "border-morado bg-morado shadow-[inset_0_0_0_4px_rgb(var(--superficie))]" : "border-linea-fuerte bg-superficie"}`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${elegida ? "bg-morado text-white" : "bg-relleno-fuerte text-transparent"}`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
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
 * «¿Con qué voz atiende?» con las voces que da el backend para la selección
 * actual. Las Ultra (las nativas del idioma del saludo): Mujer u Hombre, las
 * recomendadas de ese género y el resto tras «Ver todas las voces». Las de
 * Soniox (con una lengua cooficial activa): Marta y Sergio, las dos, sin
 * «Por defecto» (sin selector de género, las dos lo serían).
 */
function SelectorDeVoz({
  voces,
  familia,
  vozQueAtiende,
  genero,
  sonando,
  onEscuchar,
  onParar,
  onElegir,
  onGenero,
}: {
  voces: VozDelPanel[];
  familia: FamiliaDeVoces;
  vozQueAtiende: string | undefined;
  genero: AgentSettings["voiceGender"];
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
  // Plegadas, las recomendadas y la que atiende (aunque no lo sea), para
  // que la elegida siempre esté a la vista.
  const aLaVista = porGenero && !todas ? delGenero.filter((voz) => voz.recomendada || voz.id === vozQueAtiende) : delGenero;
  const hayMas = porGenero && (todas || aLaVista.length < delGenero.length);
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
    </>
  );
}

/**
 * Idioma y voz, guiado por el catálogo del backend (GET /business/me/idiomas)
 * y su vista previa (POST …/previsualizar): el panel no repite las reglas.
 * Tres preguntas de negocio en vez del modelo de datos: en qué idioma saluda
 * (español o una lengua cooficial a la vista; los extranjeros bajo «Otro
 * idioma»), qué otros idiomas habla (con saludo en español, como mucho una
 * lengua cooficial) y con qué voz, escuchándolas antes de elegir.
 */
function IdiomaYVoz({
  ajustes,
  guardado,
  setAjustes,
  bloqueado,
}: {
  ajustes: AgentSettings;
  /** Lo guardado: para avisar de la lengua cooficial que se dejaría de
   * atender al guardar. */
  guardado: AgentSettings;
  setAjustes: (ajustes: AgentSettings) => void;
  bloqueado: boolean;
}) {
  const catalogo = useQuery({
    queryKey: ["idiomas-catalogo"],
    queryFn: getCatalogoDeIdiomas,
    staleTime: Infinity,
  });
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
  const saludo = ajustes.voiceLanguage;
  // Un saludo guardado que ya no se ofrece sigue a la vista, bajo «Otro
  // idioma», para no cambiarlo sin que el dueño lo elija.
  const principales: PrincipalDelCatalogo[] = datos
    ? datos.principales.some((opcion) => opcion.codigo === saludo)
      ? datos.principales
      : [
          ...datos.principales,
          { codigo: saludo, etiqueta: etiqueta(saludo), tipo: "extranjero", otrosIdiomas: [], familia: "ultra", voces: [] },
        ]
    : [];
  const ofrecido = principales.find((opcion) => opcion.codigo === saludo);
  const aLaVista = principales.filter((opcion) => opcion.tipo !== "extranjero");
  const extranjeros = principales.filter((opcion) => opcion.tipo === "extranjero");
  const saludaEnOtro = ofrecido?.tipo === "extranjero";
  const otroVisible = otroAbierto ?? saludaEnOtro;

  // `??` en los campos nuevos del catálogo (cooficiales, otrosIdiomas):
  // Vercel publica la app antes de que Cloud Run sirva el backend que los
  // envía, y en ese rato el catálogo llega con la forma anterior.
  const cooficiales = (datos?.cooficiales ?? []).map((opcion) => opcion.codigo);
  const cooficialDe = (idiomas: AgentLanguage[]) => idiomas.find((idioma) => cooficiales.includes(idioma)) ?? null;
  const cooficial = cooficialDe(ajustes.languages);
  const otros = ofrecido?.otrosIdiomas ?? [];
  const otrasCooficiales = otros.filter((codigo) => cooficiales.includes(codigo));
  const otrosExtranjeros = otros.filter((codigo) => !cooficiales.includes(codigo));

  // Las voces las da la vista previa de la selección actual; mientras
  // llega (o si falla), las del catálogo: las de la cooficial activa o, sin
  // ella, las del saludo (el contrato de GET /business/me/idiomas).
  const vistaAlDia = vista.isPlaceholderData ? undefined : vista.data;
  const delCatalogo = principales.find((opcion) => opcion.codigo === (cooficial ?? saludo));
  const voces = vistaAlDia?.voces ?? delCatalogo?.voces ?? [];
  const familia = vistaAlDia?.familia ?? delCatalogo?.familia ?? "ultra";
  const vozQueAtiende =
    voces.find((voz) => voz.id === ajustes.voz)?.id ??
    vistaAlDia?.voz ??
    voces.find((voz) => voz.porDefecto && voz.genero === ajustes.voiceGender)?.id;
  const genero = voces.find((voz) => voz.id === vozQueAtiende)?.genero ?? ajustes.voiceGender;
  const nombreDeLaVoz = voces.find((voz) => voz.id === vozQueAtiende)?.nombre;

  const lista = (codigos: AgentLanguage[], conjuncion: string) => {
    const nombres = codigos.map((codigo, indice) => (indice === 0 ? etiqueta(codigo) : etiqueta(codigo).toLowerCase()));
    return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} ${conjuncion} ${nombres[nombres.length - 1]}` : nombres[0];
  };
  // El orden de las etiquetas es el canónico del catálogo: guardar en ese
  // orden evita que la barra de guardar salga sin cambios reales.
  const ordenar = (idiomas: AgentLanguage[]) =>
    Object.keys(datos?.etiquetas ?? {}).filter((codigo) => idiomas.includes(codigo));

  const elegirSaludo = (codigo: AgentLanguage) => {
    if (codigo === saludo) return;
    const admitidos = principales.find((candidato) => candidato.codigo === codigo)?.otrosIdiomas as AgentLanguage[] | undefined;
    // Siguen los activos que admite el saludo nuevo (su `otrosIdiomas`, del
    // catálogo): de catalán a español, el catalán sigue activo y saluda en
    // castellano; con el catalán activo, saludar en inglés o en euskera lo
    // quita, y si estaba guardado lo dice el aviso de lo que se deja de
    // atender. Es la misma regla venga de donde venga. La voz elegida se
    // conserva: si no es de las del saludo nuevo, la vista previa enseña la
    // que atiende y el backend la descarta al guardar; si se vuelve, vuelve.
    const siguen = ajustes.languages.filter(
      (idioma) => idioma !== obligatorio && idioma !== codigo && (!admitidos || admitidos.includes(idioma))
    );
    setAjustes({ ...ajustes, voiceLanguage: codigo, languages: ordenar([obligatorio, codigo, ...siguen]) });
  };
  const alternarIdioma = (codigo: AgentLanguage) => {
    const esCooficial = cooficiales.includes(codigo);
    const activos = ajustes.languages.includes(codigo)
      ? ajustes.languages.filter((idioma) => idioma !== codigo)
      : // Como mucho una lengua cooficial: marcar una desmarca la otra.
        [...ajustes.languages.filter((idioma) => !(esCooficial && cooficiales.includes(idioma))), codigo];
    // La voz elegida se conserva también aquí: con la cooficial atienden
    // Marta o Sergio (la vista previa lo enseña) y, al quitarla, vuelve.
    setAjustes({ ...ajustes, languages: ordenar(activos) });
  };
  const elegirGenero = (valor: AgentSettings["voiceGender"]) => {
    if (valor === genero) return;
    // La que se eligió de ese género, si está entre las de ahora; si no,
    // la de por defecto.
    const recordada = vozPorGenero.current[valor];
    const vuelve = voces.find((candidata) => candidata.id === recordada && candidata.genero === valor)?.id;
    setAjustes({ ...ajustes, voiceGender: valor, voz: vuelve });
  };

  // La lengua cooficial que se dejaría de atender al guardar (quitada a
  // mano o al elegir un saludo que no la admite): en Cataluña, atender
  // en catalán es una obligación.
  const dejaDeAtender = guardado.languages.filter(
    (idioma) => cooficiales.includes(idioma) && !ajustes.languages.includes(idioma)
  );
  const avisos = [
    ...(dejaDeAtender.length ? [`Al guardar, dejará de atender en ${lista(dejaDeAtender, "y").toLowerCase()}.`] : []),
    ...(vista.data?.avisos ?? []),
  ];

  const entradilla =
    vista.data?.entradilla ??
    (ajustes.languages.length === 1 ? "Atiende siempre en español." : "Sigue en el idioma de quien llama.");

  const casilla = (codigo: AgentLanguage) => (
    <Opcion
      key={codigo}
      forma="check"
      elegida={ajustes.languages.includes(codigo)}
      titulo={etiqueta(codigo)}
      onClick={() => alternarIdioma(codigo)}
    />
  );

  return (
    <fieldset className="min-w-0">
      <legend className="text-base font-bold text-tinta">Idioma y voz</legend>
      <p className="mb-2.5 mt-0.5 text-sm text-muted">{entradilla}</p>
      {bloqueado ? (
        <>
          <div className="mb-3 flex items-start gap-2.5 rounded-[14px] border border-lavado-borde bg-lavado px-3.5 py-3 text-morado-tinta">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-[13px] leading-[1.55]">
              Elegir la voz y los idiomas está disponible en los planes Pro y Scale.{" "}
              <Link href="/ajustes/facturacion" className="font-bold underline underline-offset-[3px]">
                Ampliar plan
              </Link>
            </p>
          </div>
          {/* Sin la función en el plan no hay nada que elegir: lo activo en
              pastillas y la voz en una línea, en vez de controles apagados. */}
          <div className="flex flex-wrap gap-2">
            {ajustes.languages.map((idioma) => (
              <span
                key={idioma}
                className="inline-flex min-h-11 items-center rounded-full border border-lavado-borde bg-lavado px-3.5 text-sm font-semibold text-morado-tinta"
              >
                {etiqueta(idioma)}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {nombreDeLaVoz ? `Voz de ${nombreDeLaVoz}` : `Voz ${ajustes.voiceGender === "masculina" ? "masculina" : "femenina"}`} ·
            saluda en {etiqueta(saludo).toLowerCase()}
          </p>
        </>
      ) : (
        <>
          <p id="pregunta-saludo" className="mb-2 mt-1 text-sm font-semibold text-tinta">
            ¿En qué idioma saluda?
          </p>
          <div role="radiogroup" aria-labelledby="pregunta-saludo" className="flex flex-col gap-2">
            {aLaVista.map((opcion) => (
              <Opcion
                key={opcion.codigo}
                elegida={saludo === opcion.codigo}
                titulo={opcion.etiqueta}
                onClick={() => elegirSaludo(opcion.codigo)}
              />
            ))}
          </div>
          {extranjeros.length ? (
            <>
              <button
                type="button"
                aria-expanded={otroVisible}
                aria-controls="saludo-en-otro-idioma"
                onClick={() => setOtroAbierto(!otroVisible)}
                className={`mt-2 flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                  saludaEnOtro ? "border-morado bg-lavado" : "border-linea bg-superficie"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span id="titulo-otro-idioma" className="block text-[15px] font-bold text-tinta">
                    Otro idioma
                  </span>
                  <span className="mt-px block text-[13px] text-muted">
                    {saludaEnOtro ? `Saluda en ${etiqueta(saludo).toLowerCase()}` : lista(extranjeros.map((opcion) => opcion.codigo), "o")}
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-apagado transition-transform duration-200 motion-reduce:transition-none ${otroVisible ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {/* Montado siempre: es el destino de aria-controls. */}
              <div id="saludo-en-otro-idioma">
                {otroVisible ? (
                  <div role="radiogroup" aria-labelledby="titulo-otro-idioma" className="mt-2 grid gap-2 sm:grid-cols-2">
                    {extranjeros.map((opcion) => (
                      <Opcion
                        key={opcion.codigo}
                        elegida={saludo === opcion.codigo}
                        titulo={opcion.etiqueta}
                        onClick={() => elegirSaludo(opcion.codigo)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <p id="pregunta-otros" className="mb-2 mt-5 text-sm font-semibold text-tinta">
            ¿Qué otros idiomas habla?
          </p>
          <div role="group" aria-labelledby="pregunta-otros" className="flex flex-col gap-2">
            {saludo !== obligatorio ? (
              <Opcion forma="check" elegida titulo={etiqueta(obligatorio)} detalle="Siempre" disabled onClick={() => undefined} />
            ) : null}
            {otrasCooficiales.length ? (
              <>
                <p className="mt-1 text-[13px] font-semibold text-apagado">Lengua cooficial · solo una a la vez</p>
                {otrasCooficiales.map(casilla)}
                <p className="mt-2 text-[13px] font-semibold text-apagado">Para clientes extranjeros</p>
              </>
            ) : null}
            {otrosExtranjeros.map(casilla)}
          </div>
          <p className="mt-2 text-sm leading-5 text-muted">
            Activa solo los que atiendes a menudo: cuantos menos haya, mejor entiende a quien llama.
          </p>

          {/* Siempre montado: un lector de pantalla solo anuncia los cambios
              de una región viva que ya estaba en la página. */}
          <div role="status" aria-live="polite">
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
              // Otra lista (otro saludo o la cooficial) vuelve a enseñar
              // solo las recomendadas. Sin el género en la clave: al
              // cambiarlo, el foco sigue en su botón.
              key={`${familia}-${cooficial ?? saludo}`}
              voces={voces}
              familia={familia}
              vozQueAtiende={vozQueAtiende}
              genero={genero}
              sonando={sonando}
              onEscuchar={alternar}
              onParar={parar}
              onElegir={(voz) => setAjustes({ ...ajustes, voz: voz.id, voiceGender: voz.genero })}
              onGenero={elegirGenero}
            />
          ) : (
            // Un saludo que ya no se ofrece no tiene voces que elegir: sigue
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

          {vista.data ? (
            <p className="mt-4 rounded-[14px] border border-linea bg-relleno px-3.5 py-3 text-sm leading-[1.55] text-apagado">
              Saluda así: <span className="text-tinta">«{vista.data.saludo}»</span>
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}

/**
 * Cómo atiende: cada opción es una fila que se elige con un toque y lleva
 * su explicación. El idioma y la voz se bloquean, con su aviso, en los
 * planes que no los incluyen (lo valida también el backend).
 */
export function ComportamientoMovil({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const resumen = useQuery({ queryKey: ["billing-summary"], queryFn: getBillingSummary });
  const bloqueado = resumen.data !== undefined && !resumen.data.planFeatures?.includes("voz_idioma");

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
    onError: () => avisar("No se pudo guardar el comportamiento del agente.", "error"),
  });

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

        <IdiomaYVoz ajustes={ajustes} guardado={guardado} setAjustes={setAjustes} bloqueado={bloqueado} />
      </div>
      <BarraGuardar
        visible={JSON.stringify(ajustes) !== firmaGuardada}
        etiqueta="Guardar comportamiento"
        guardando={guardar.isPending}
        onGuardar={() => guardar.mutate()}
        onDescartar={() => setAjustes(guardado)}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}
