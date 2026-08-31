"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

type Message = {
  sender: "agent" | "client";
  text: string;
  delay: number;
};

export type Conversation = {
  caller: string;
  context: string;
  messages: Message[];
  result: string;
  resultDetail: string;
  duration: number;
};

const defaultConversations: Conversation[] = [
  {
    caller: "Cliente · móvil",
    context: "Reserva de cita",
    messages: [
      { sender: "client", text: "¿Tenéis hueco para mañana por la tarde?", delay: 0.35 },
      { sender: "agent", text: "Sí, tengo 17:00 o 18:30. ¿Cuál prefieres?", delay: 2.15 },
      { sender: "client", text: "17:00, gracias.", delay: 3.75 },
    ],
    result: "Cita confirmada",
    resultDetail: "agenda actualizada al colgar",
    duration: 6600,
  },
  {
    caller: "Cliente habitual",
    context: "Cambio de cita",
    messages: [
      { sender: "client", text: "¿Puedo mover mi cita del jueves al viernes?", delay: 0.35 },
      { sender: "agent", text: "Claro. El viernes tengo libre a las 11:00.", delay: 2.15 },
      { sender: "client", text: "Genial, cámbiala por favor.", delay: 3.75 },
    ],
    result: "Cambio realizado",
    resultDetail: "agenda actualizada al colgar",
    duration: 6700,
  },
  {
    caller: "Cliente · móvil",
    context: "Consulta de servicio",
    messages: [
      { sender: "client", text: "¿Cuánto dura la limpieza facial premium?", delay: 0.35 },
      { sender: "agent", text: "Dura 60 minutos e incluye diagnóstico y masaje.", delay: 2.15 },
      { sender: "client", text: "Perfecto, quería saberlo antes de reservar.", delay: 3.75 },
    ],
    result: "Consulta resuelta",
    resultDetail: "respuesta inmediata, sin interrumpir al equipo",
    duration: 6700,
  },
];

const messageMotion = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

function ConversationScene({ conversation, reducedMotion }: { conversation: Conversation; reducedMotion: boolean }) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col px-4 pb-4 pt-3 sm:px-6 sm:pb-5"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 sm:gap-3">
        {conversation.messages.map((message) => {
          const isClient = message.sender === "client";
          return (
            <motion.div
              key={`${message.sender}-${message.text}`}
              className={`flex ${isClient ? "justify-end" : "justify-start"}`}
              variants={messageMotion}
              initial={reducedMotion ? "visible" : "hidden"}
              animate="visible"
              transition={{
                delay: reducedMotion ? 0 : message.delay,
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm font-medium leading-6 sm:max-w-[76%] ${
                  isClient
                    ? "rounded-br-sm bg-[#0a0a0a] text-white"
                    : "rounded-bl-sm border border-[#e5e5e5] bg-white text-[#0a0a0a]"
                }`}
              >
                {message.text}
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f3eeff] px-4 py-3"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reducedMotion ? 0 : 4.8, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] text-white"
          initial={reducedMotion ? false : { scale: 0.7 }}
          animate={{ scale: 1 }}
          transition={{ delay: reducedMotion ? 0 : 5.05, type: "spring", stiffness: 260, damping: 18 }}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </motion.span>
        <span className="min-w-0 text-sm font-semibold leading-5 text-[#6d28d9]">
          {conversation.result} · {conversation.resultDetail}
        </span>
      </motion.div>
    </motion.div>
  );
}

export function HeroConversation({ paused = false, conversationsOverride }: { paused?: boolean; conversationsOverride?: Conversation[] }) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = prefersReducedMotion === true;
  const conversations = conversationsOverride && conversationsOverride.length > 0 ? conversationsOverride : defaultConversations;
  const [sceneIndex, setSceneIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(42);

  useEffect(() => {
    if (reducedMotion || paused) {
      setSceneIndex(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSceneIndex((current) => (current + 1) % conversations.length);
    }, conversations[sceneIndex].duration);

    return () => window.clearTimeout(timeout);
  }, [paused, reducedMotion, sceneIndex, conversations]);

  useEffect(() => {
    setElapsedSeconds(42);

    if (reducedMotion || paused) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [paused, reducedMotion, sceneIndex]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return (
    <section
      aria-label="Ejemplos de llamadas atendidas automáticamente por Alhabla"
      className="relative flex h-full min-h-[400px] w-full flex-col overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white sm:min-h-[380px]"
    >
      <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
        </div>
        <span className="font-mono text-xs font-medium tabular-nums text-[#71717a]">
          Llamada entrante · {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </span>
      </div>

      <div className="relative flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <ConversationScene
            key={sceneIndex}
            conversation={conversations[sceneIndex]}
            reducedMotion={reducedMotion}
          />
        </AnimatePresence>
      </div>

      {/* Alternativa no auditiva a la demo de micrófono: describe la escena que
          se está mostrando ahora mismo, no una fija. */}
      <p className="sr-only" aria-live="polite">
        {`Ejemplo de llamada, ${conversations[sceneIndex].context}. `}
        {conversations[sceneIndex].messages
          .map((message) => `${message.sender === "client" ? "El cliente dice" : "Alhabla responde"}: ${message.text}`)
          .join(". ")}
        {`. Resultado: ${conversations[sceneIndex].result}, ${conversations[sceneIndex].resultDetail}.`}
      </p>

      {!reducedMotion ? (
        <div aria-hidden="true" className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {conversations.map((conversation, index) => (
            <span
              key={`${conversation.caller}-${conversation.context}`}
              className={`h-1 rounded-full transition-all duration-500 ${index === sceneIndex ? "w-5 bg-[#8b5cf6]" : "w-1.5 bg-[#8b5cf6]/20"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
