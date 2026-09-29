#!/usr/bin/env node
// Prepara el paquete de /design-sync de la APP (frontend/, app.alhabla.ai):
// las entradas que el convertidor necesita y que una app Next.js no tiene.
// Se sincroniza desde la raíz del repo; la web pública tiene su propio
// paquete en web/.design-sync/ (ver scripts/preparar-design-sync.mjs, que
// hace el trabajo común y explica por qué son dos).
//
// Es cfg.buildCmd, así que se ejecuta solo antes de package-build.mjs.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepararPaquete } from "../scripts/preparar-design-sync.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

// Los componentes del panel leen sus datos con TanStack Query y algunos usan
// useRouter() de Next. Fuera de la app no existe ninguno de los dos contextos,
// así que las tarjetas renderizarían en blanco o reventarían. Se siembra la
// caché de Query con datos reales de ejemplo (mismas queryKey que la app) en
// lugar de mockear @/lib/api: el bundle sigue llevando el módulo de API real.
const PROVIDERS = `// GENERADO por .design-sync/prepare.mjs — no editar a mano.
"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

// Solo tipos (se borran al compilar): con ellos, tsc comprueba las semillas
// contra lib/types.ts y el prepare aborta si se desfasan, en vez de sembrar
// en silencio campos que la app ya no lee.
import type { Call, OnboardingState, Paginated } from "../src/lib/types";

/** Identificadores fijos que las previews deben usar para acertar la queryKey. */
export const PREVIEW_BUSINESS_ID = "biz-demo";
export const PREVIEW_CALL_ID = "call-demo-1";

const AHORA = new Date("2026-09-05T10:30:00.000Z");
const desplazar = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000).toISOString();

/** Una conversación ya terminada; \`hace\` son los minutos desde que empezó. */
function conversacion(
  datos: Pick<Call, "id" | "fromNumber" | "outcome" | "sentiment" | "summary"> &
    Partial<Call> & { hace: number }
): Call {
  const { hace, ...resto } = datos;
  const inicio = desplazar(-hace);
  const fin = desplazar(-hace + Math.max(1, Math.ceil((datos.durationSecs ?? 60) / 60)));
  return {
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    callId: \`demo-\${datos.id}\`,
    status: "COMPLETED",
    successful: datos.outcome === "RESOLVED",
    escalationReason: null,
    toolFailureDetected: false,
    requestedService: null,
    durationSecs: null,
    costCents: null,
    voiceProvider: "telnyx",
    startedAt: inicio,
    endedAt: fin,
    createdAt: inicio,
    updatedAt: fin,
    ...resto,
  };
}

const LLAMADAS: Call[] = [
  conversacion({
    id: PREVIEW_CALL_ID,
    hace: 38,
    fromNumber: "+34655214409",
    outcome: "RESOLVED",
    sentiment: "POSITIVE",
    summary:
      "Carmen pide hora para corte y color el jueves por la tarde. Se confirma a las 17:30 con Lucía.",
    requestedService: "Corte y color",
    durationSecs: 96,
    costCents: 11,
    transcript: {
      id: "tr-1",
      callId: PREVIEW_CALL_ID,
      fullText: "",
      createdAt: desplazar(-36),
      messages: [
        { role: "agent", content: "Peluquería Aurora, ¿en qué puedo ayudarte?" },
        { role: "user", content: "Hola, quería pedir hora para corte y color." },
        { role: "agent", content: "Claro. ¿Te viene bien el jueves a las 17:30 con Lucía?" },
        { role: "user", content: "Perfecto, el jueves a las 17:30." },
        { role: "agent", content: "Reservado. Te llega la confirmación por WhatsApp. ¡Hasta el jueves!" },
      ],
    },
    booking: {
      id: "bk-1",
      programedAt: desplazar(4290),
      durationMinutes: 90,
      numberPeople: 1,
      isCancelled: false,
      clientPhone: "+34655214409",
      serviceIds: ["svc-corte-color"],
      professional: { id: "pro-lucia", name: "Lucía" },
      services: [
        { id: "svc-corte-color", name: "Corte y color", durationMinutes: 90, priceCents: 6500 },
      ],
    },
  }),
  conversacion({
    id: "call-demo-2",
    hace: 124,
    fromNumber: "+34611078230",
    outcome: "LEAD_CAPTURED",
    sentiment: "NEUTRAL",
    summary: "Consulta por el precio de las mechas balayage y el horario del sábado.",
    requestedService: "Mechas balayage",
    durationSecs: 51,
    costCents: 6,
  }),
  conversacion({
    id: "call-demo-3",
    hace: 260,
    fromNumber: "+34699431588",
    outcome: "RESOLVED",
    sentiment: "POSITIVE",
    summary: "Pide por WhatsApp manicura semipermanente el martes a las 11:00 con Noelia.",
    voiceProvider: "whatsapp",
    booking: {
      id: "bk-3",
      programedAt: desplazar(5790),
      durationMinutes: 45,
      numberPeople: 1,
      isCancelled: false,
      clientPhone: "+34699431588",
      serviceIds: ["svc-manicura"],
      professional: { id: "pro-noelia", name: "Noelia" },
    },
  }),
  conversacion({
    id: "call-demo-4",
    hace: 410,
    fromNumber: "+34622905117",
    outcome: "ESCALATED",
    sentiment: "NEGATIVE",
    summary:
      "Pregunta por microblading de cejas, un servicio que el salón no ofrece, y pide hablar con la dueña.",
    escalationReason: "CLIENTE_LO_PIDIO",
    requestedService: "Microblading",
    durationSecs: 34,
    costCents: 4,
  }),
  conversacion({
    id: "call-demo-5",
    hace: 540,
    fromNumber: "+34638127645",
    outcome: "RESOLVED",
    sentiment: "POSITIVE",
    summary: "Cambia su cita del viernes al lunes a las 10:00.",
    durationSecs: 62,
    costCents: 7,
    booking: {
      id: "bk-5",
      programedAt: desplazar(1650),
      durationMinutes: 30,
      numberPeople: 1,
      isCancelled: true,
      rescheduledToId: "bk-5b",
      clientPhone: "+34638127645",
      serviceIds: ["svc-corte"],
    },
  }),
  conversacion({
    id: "call-demo-6",
    hace: 720,
    fromNumber: "+34677330291",
    outcome: "RESOLVED",
    sentiment: "NEUTRAL",
    summary: "Quiere saber si hay aparcamiento cerca y si aceptan pago con tarjeta.",
    durationSecs: 40,
    costCents: 5,
  }),
];

const RECIENTES: Paginated<Call> = {
  data: LLAMADAS,
  total: LLAMADAS.length,
  limit: 6,
  offset: 0,
};

// Llamada corta a propósito para la tarjeta de CallDetailModal: el modal
// acota su cuerpo a la altura de la ventana y lo hace scrollable, así que con
// la llamada larga la captura sale desplazada y sin cabecera.
const LLAMADA_CORTA: Call = {
  ...LLAMADAS[1],
  id: "call-demo-corta",
  transcript: {
    id: "tr-corta",
    callId: "call-demo-corta",
    fullText: "",
    createdAt: desplazar(-123),
    messages: [
      { role: "agent", content: "Peluquería Aurora, ¿en qué puedo ayudarte?" },
      { role: "user", content: "¿Cuánto cuestan las mechas balayage?" },
      { role: "agent", content: "Entre 90 y 120 €, según el largo. ¿Te reservo hora?" },
    ],
  },
};

// A mitad del alta: horario y servicios hechos, el resto pendiente.
const ONBOARDING: OnboardingState = {
  steps: {
    schedule: true,
    services: true,
    professionals: false,
    calendar: false,
    whatsapp: false,
    forwarding: false,
  },
  progress: 33,
  dismissedAt: null,
  completedAt: null,
  isActive: true,
  forwarding: {
    status: "ready",
    phoneNumber: null,
    confirmedAt: null,
    firstCallAt: null,
  },
  whatsapp: { status: "sin_numero", ownerWhatsappNumber: null },
};

/** queryKey -> datos. Las claves replican exactamente las de los componentes. */
const SEMILLAS: Array<[readonly unknown[], unknown]> = [
  [["recent-calls"], RECIENTES],
  [["call-detail", PREVIEW_CALL_ID], LLAMADAS[0]],
  [["call-detail", LLAMADA_CORTA.id], LLAMADA_CORTA],
  [["onboarding-state"], ONBOARDING],
];

function crearCliente() {
  const cliente = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  for (const [clave, valor] of SEMILLAS) cliente.setQueryData(clave, valor);
  return cliente;
}

// useRouter() de next/navigation lanza fuera de la app; next/link también lee
// este contexto para el prefetch. Un stub inerte basta para renderizar.
const ROUTER_INERTE = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => Promise.resolve(),
} as never;

export function PreviewProviders({ children }: { children: React.ReactNode }) {
  const [cliente] = React.useState(crearCliente);
  return (
    <AppRouterContext.Provider value={ROUTER_INERTE}>
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    </AppRouterContext.Provider>
  );
}
`;

prepararPaquete({
  proyecto: resolve(AQUI, "..", "frontend"),
  config: join(AQUI, "config.json"),
  // Valores por defecto reales de los editores, para que las previews (y el
  // agente de diseño) compongan con ellos en vez de con copias que se
  // desfasan. No generan tarjeta.
  datosExtra: [
    ["../src/components/agent-settings-editor", ["DEFAULT_AGENT_SETTINGS"]],
    [
      "../src/components/business-hours-editor",
      ["DEFAULT_BUSINESS_SCHEDULE", "getScheduleSummary"],
    ],
  ],
  providers: PROVIDERS,
});
