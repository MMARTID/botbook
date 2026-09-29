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

/** Identificadores fijos que las previews deben usar para acertar la queryKey. */
export const PREVIEW_BUSINESS_ID = "biz-demo";
export const PREVIEW_CALL_ID = "call-demo-1";

const AHORA = new Date("2026-09-05T10:30:00.000Z");
const desplazar = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000).toISOString();

const LLAMADAS = [
  {
    id: PREVIEW_CALL_ID,
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-1",
    fromNumber: "+34 655 21 44 09",
    status: "completed",
    outcome: "BOOKED",
    sentiment: "POSITIVE",
    summary:
      "Carmen pide hora para corte y color el jueves por la tarde. Se confirma a las 17:30 con Lucía.",
    successful: true,
    durationSecs: 96,
    costCents: 11,
    startedAt: desplazar(-38),
    endedAt: desplazar(-36),
    createdAt: desplazar(-38),
    updatedAt: desplazar(-36),
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
        { role: "agent", content: "Reservado. Te llega la confirmación por SMS. ¡Hasta el jueves!" },
      ],
    },
    booking: {
      id: "bk-1",
      programedAt: desplazar(4290),
      durationMinutes: 90,
      numberPeople: 1,
    },
  },
  {
    id: "call-demo-2",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-2",
    fromNumber: "+34 611 07 82 30",
    status: "completed",
    outcome: "INFO",
    sentiment: "NEUTRAL",
    summary: "Consulta por el precio de las mechas balayage y el horario del sábado.",
    successful: true,
    durationSecs: 51,
    costCents: 6,
    startedAt: desplazar(-124),
    endedAt: desplazar(-123),
    createdAt: desplazar(-124),
    updatedAt: desplazar(-123),
  },
  {
    id: "call-demo-3",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-3",
    fromNumber: "+34 699 43 15 88",
    status: "completed",
    outcome: "BOOKED",
    sentiment: "POSITIVE",
    summary: "Manicura semipermanente el martes a las 11:00 con Noelia.",
    successful: true,
    durationSecs: 73,
    costCents: 8,
    startedAt: desplazar(-260),
    endedAt: desplazar(-259),
    createdAt: desplazar(-260),
    updatedAt: desplazar(-259),
  },
  {
    id: "call-demo-4",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-4",
    fromNumber: "+34 622 90 51 17",
    status: "completed",
    outcome: "NO_HELP",
    sentiment: "NEGATIVE",
    summary: "Pregunta por microblading de cejas, un servicio que el salón no ofrece.",
    successful: false,
    durationSecs: 34,
    costCents: 4,
    startedAt: desplazar(-410),
    endedAt: desplazar(-409),
    createdAt: desplazar(-410),
    updatedAt: desplazar(-409),
  },
  {
    id: "call-demo-5",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-5",
    fromNumber: "+34 638 12 76 45",
    status: "completed",
    outcome: "BOOKED",
    sentiment: "POSITIVE",
    summary: "Cambia su cita del viernes al lunes a las 10:00.",
    successful: true,
    durationSecs: 62,
    costCents: 7,
    startedAt: desplazar(-540),
    endedAt: desplazar(-539),
    createdAt: desplazar(-540),
    updatedAt: desplazar(-539),
  },
  {
    id: "call-demo-6",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-6",
    fromNumber: "+34 677 33 02 91",
    status: "completed",
    outcome: "INFO",
    sentiment: "NEUTRAL",
    summary: "Quiere saber si hay aparcamiento cerca y si aceptan pago con tarjeta.",
    successful: true,
    durationSecs: 40,
    costCents: 5,
    startedAt: desplazar(-720),
    endedAt: desplazar(-719),
    createdAt: desplazar(-720),
    updatedAt: desplazar(-719),
  },
];

/** queryKey -> datos. Las claves replican exactamente las de los componentes. */
const SEMILLAS: Array<[readonly unknown[], unknown]> = [
  [["recent-calls"], { data: LLAMADAS, total: LLAMADAS.length, limit: 6, offset: 0 }],
  [["call-detail", PREVIEW_CALL_ID], LLAMADAS[0]],
  // Llamada corta a propósito para la tarjeta de CallDetailModal: el modal
  // acota su cuerpo a la altura de la ventana y lo hace scrollable, así que
  // con la llamada larga la captura sale desplazada y sin cabecera.
  [
    ["call-detail", "call-demo-corta"],
    {
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
    },
  ],
  [
    ["onboarding-state"],
    {
      steps: { schedule: true, services: true, professionals: false, calendar: false },
      progress: 50,
      dismissedAt: null,
      completedAt: null,
      isActive: true,
    },
  ],
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
