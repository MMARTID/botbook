"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import { getBillingSummary, getCatalogoDeIdiomas, previsualizarIdiomas, updateMyBusiness } from "@/lib/api";
import type { AgentLanguage, AgentSettings, Business } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-settings";
import { BarraGuardar } from "@/components/movil/piezas";
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

/**
 * Idioma y voz, guiado por el catálogo del backend (GET /business/me/idiomas)
 * y su vista previa (POST …/previsualizar): el panel no repite las reglas.
 * Dos preguntas de negocio en vez del modelo de datos: en qué idioma saluda
 * (español o una lengua cooficial, que decide la voz) y qué otros idiomas
 * habla (solo los que esa voz puede hablar).
 */
function IdiomaYVoz({
  ajustes,
  setAjustes,
  bloqueado,
}: {
  ajustes: AgentSettings;
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
  };
  const vista = useQuery({
    queryKey: ["idiomas-vista-previa", seleccion],
    queryFn: () => previsualizarIdiomas(seleccion),
    placeholderData: keepPreviousData,
  });

  const datos = catalogo.data;
  const etiqueta = (codigo: AgentLanguage) => datos?.etiquetas[codigo] ?? codigo;
  const obligatorio = datos?.obligatorio.codigo ?? "es-ES";
  const principal = ajustes.voiceLanguage;
  const ofrecido = datos?.principales.find((opcion) => opcion.codigo === principal);
  // Un principal guardado que ya no se ofrece (inglés o francés de antes)
  // sigue a la vista para no cambiarlo sin que el dueño lo elija.
  const principales = datos
    ? ofrecido
      ? datos.principales
      : [...datos.principales, { codigo: principal, etiqueta: etiqueta(principal), secundariosCompatibles: [], vozMultilingue: false }]
    : [];
  const compatibles = ofrecido?.secundariosCompatibles ?? [];
  // El orden de las etiquetas es el canónico del catálogo: guardar en ese
  // orden evita que la barra de guardar salga sin cambios reales.
  const ordenar = (idiomas: AgentLanguage[]) =>
    Object.keys(datos?.etiquetas ?? {}).filter((codigo) => idiomas.includes(codigo));

  const elegirPrincipal = (codigo: AgentLanguage) => {
    const opcion = datos?.principales.find((candidato) => candidato.codigo === codigo);
    const otros = ajustes.languages.filter(
      (idioma) => idioma !== obligatorio && idioma !== principal && opcion?.secundariosCompatibles.includes(idioma)
    );
    setAjustes({ ...ajustes, voiceLanguage: codigo, languages: ordenar([obligatorio, codigo, ...otros]) });
  };
  const alternarSecundario = (codigo: AgentLanguage) => {
    const activos = ajustes.languages.includes(codigo)
      ? ajustes.languages.filter((idioma) => idioma !== codigo)
      : [...ajustes.languages, codigo];
    setAjustes({ ...ajustes, languages: ordenar(activos) });
  };

  const entradilla =
    vista.data?.entradilla ??
    (ajustes.languages.length === 1 ? "Atiende siempre en español." : "Sigue en el idioma de quien llama.");

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
            Voz {ajustes.voiceGender === "masculina" ? "masculina" : "femenina"} · saluda en{" "}
            {etiqueta(principal).toLowerCase()}
          </p>
        </>
      ) : (
        <>
          <p id="pregunta-saludo" className="mb-2 mt-1 text-sm font-semibold text-tinta">
            ¿En qué idioma saluda?
          </p>
          <div role="radiogroup" aria-labelledby="pregunta-saludo" className="flex flex-col gap-2">
            {principales.map((opcion) => (
              <Opcion
                key={opcion.codigo}
                elegida={principal === opcion.codigo}
                titulo={opcion.etiqueta}
                detalle={opcion.vozMultilingue ? "Con otra voz, que habla todos tus idiomas" : undefined}
                onClick={() => elegirPrincipal(opcion.codigo)}
              />
            ))}
          </div>

          <p id="pregunta-otros" className="mb-2 mt-5 text-sm font-semibold text-tinta">
            ¿Qué otros idiomas habla?
          </p>
          <div role="group" aria-labelledby="pregunta-otros" className="flex flex-col gap-2">
            {principal !== obligatorio ? (
              <Opcion forma="check" elegida titulo={etiqueta(obligatorio)} detalle="Siempre" disabled onClick={() => undefined} />
            ) : null}
            {compatibles.map((codigo) => (
              <Opcion
                key={codigo}
                forma="check"
                elegida={ajustes.languages.includes(codigo)}
                titulo={etiqueta(codigo)}
                onClick={() => alternarSecundario(codigo)}
              />
            ))}
          </div>
          <p className="mt-2 text-sm leading-5 text-muted">
            Activa solo los que atiendes a menudo: cuantos menos haya, mejor entiende a quien llama.
          </p>

          {/* Siempre montado: un lector de pantalla solo anuncia los cambios
              de una región viva que ya estaba en la página. */}
          <div role="status" aria-live="polite">
            {vista.data?.avisos.length ? (
              <ul className="mt-3 flex flex-col gap-1.5 rounded-[14px] border border-lavado-borde bg-lavado px-3.5 py-3 text-sm leading-[1.55] text-morado-tinta">
                {vista.data.avisos.map((avisoDeIdioma) => (
                  <li key={avisoDeIdioma}>{avisoDeIdioma}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <p id="pregunta-voz" className="mb-2 mt-5 text-sm font-semibold text-tinta">
            Voz
          </p>
          <div role="radiogroup" aria-labelledby="pregunta-voz" className="grid grid-cols-2 gap-2">
            {(
              [
                ["femenina", "Femenina"],
                ["masculina", "Masculina"],
              ] as const
            ).map(([valor, titulo]) => (
              <Opcion
                key={valor}
                elegida={ajustes.voiceGender === valor}
                titulo={titulo}
                onClick={() => setAjustes({ ...ajustes, voiceGender: valor })}
              />
            ))}
          </div>

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

        <IdiomaYVoz ajustes={ajustes} setAjustes={setAjustes} bloqueado={bloqueado} />
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
