"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarCheck2, Check, PhoneCall } from "lucide-react";
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
      { sender: "client", text: "Hola, ¿tenéis hueco mañana para corte y color?", delay: 0.35 },
      { sender: "agent", text: "Sí. Puedo reservarte a las 16:30 o a las 18:00.", delay: 2.15 },
      { sender: "client", text: "A las 16:30, perfecto 😊", delay: 3.75 },
    ],
    result: "Cita confirmada",
    resultDetail: "Mañana · 16:30 · Corte + color",
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
    resultDetail: "Viernes · 11:00 · Agenda actualizada",
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
    resultDetail: "Respuesta inmediata · Sin interrumpir al equipo",
    duration: 6700,
  },
];

const messageMotion = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

function VoiceActivity({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-5 items-center gap-[3px]"
    >
      {[7, 13, 9, 17, 11, 15, 8].map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          className="w-[2px] rounded-full bg-[#2c7334]/70"
          style={{ height }}
          animate={reducedMotion ? undefined : { scaleY: [0.45, 1, 0.6, 0.9, 0.45] }}
          transition={{ duration: 1.1, delay: index * 0.08, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function ConversationScene({ conversation, reducedMotion }: { conversation: Conversation; reducedMotion: boolean }) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col px-4 pb-4 pt-[5.1rem] sm:px-7 sm:pb-6 sm:pt-[6.3rem]"
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#687267] sm:text-[10px]">
          {conversation.context}
        </p>
        <div className="flex items-center gap-2 text-[9px] font-medium text-[#687267] sm:text-[10px]">
          <VoiceActivity reducedMotion={reducedMotion} />
          Voz activa
        </div>
      </div>

      <div className="relative flex flex-1 flex-col gap-2.5 sm:gap-3">
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
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div className={`max-w-[84%] sm:max-w-[76%] ${isClient ? "text-right" : "text-left"}`}>
                <span className="mb-1 block px-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8b9a7f] sm:text-[9px]">
                  {isClient ? "Cliente" : "AsistAI"}
                </span>
                <div
                  className={`rounded-xl border px-3 py-2 text-[11px] leading-[1.45] backdrop-blur-xl sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-[13px] ${
                    isClient
                      ? "rounded-br-sm border-white/70 bg-white/60 text-[#17211c] shadow-[0_4px_16px_rgba(30,43,34,0.05)]"
                      : "rounded-bl-sm border-[#dce7d2]/70 bg-[#eef6dc]/60 text-[#17211c] shadow-[0_4px_16px_rgba(44,115,52,0.05)]"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            </motion.div>
          );
        })}

        <motion.div
          className="mt-auto flex items-center gap-2.5 border-t border-[#dce7d2] px-1 pt-2.5 sm:gap-3 sm:pt-3"
          initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: reducedMotion ? 0 : 4.8, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2c7334] text-white shadow-[0_4px_12px_rgba(44,115,52,0.16)] sm:h-8 sm:w-8"
            initial={reducedMotion ? false : { rotate: -12, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: reducedMotion ? 0 : 5.05, type: "spring", stiffness: 260, damping: 18 }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </motion.span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-[#17211c] sm:text-[13px]">{conversation.result}</span>
            <span className="mt-0.5 block truncate text-[9px] text-[#687267] sm:text-[11px]">{conversation.resultDetail}</span>
          </span>
          <CalendarCheck2 className="ml-auto h-4 w-4 shrink-0 text-[#2c7334]" />
        </motion.div>
      </div>
    </motion.div>
  );
}

export function HeroConversation({ paused = false, conversationsOverride }: { paused?: boolean; conversationsOverride?: Conversation[] }) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = prefersReducedMotion === true;
  const conversations = conversationsOverride && conversationsOverride.length > 0 ? conversationsOverride : defaultConversations;
  const [sceneIndex, setSceneIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(1);

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
    setElapsedSeconds(1);

    if (reducedMotion || paused) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [paused, reducedMotion, sceneIndex]);

  return (
    <section
      aria-label="Ejemplos de llamadas atendidas automáticamente por AsistAI"
      className="relative h-full min-h-[310px] w-full overflow-hidden rounded-2xl border border-[#dce7d2] bg-[radial-gradient(circle_at_15%_20%,rgba(184,217,110,0.15),transparent_30%),radial-gradient(circle_at_85%_25%,rgba(44,115,52,0.08),transparent_34%),linear-gradient(145deg,#f8faf5_0%,#eef2eb_52%,#f1f5ed_100%)] shadow-[0_12px_40px_rgba(30,43,34,0.08)] sm:min-h-[380px] sm:rounded-2xl"
    >
      <div aria-hidden="true" className="absolute -left-12 top-20 h-40 w-40 rounded-full bg-[#b8d96e]/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-10 top-4 h-44 w-44 rounded-full bg-[#2c7334]/12 blur-3xl" />
      <div aria-hidden="true" className="absolute bottom-0 left-1/3 h-36 w-52 rounded-full bg-[#b8d96e]/15 blur-3xl" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.4),transparent_45%,rgba(255,255,255,0.25))]" />

      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between border-b border-[#dce7d2] px-1 pb-2.5 sm:inset-x-6 sm:top-5 sm:px-0 sm:pb-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#2c7334] text-white shadow-[0_4px_14px_rgba(44,115,52,0.16)] sm:h-9 sm:w-9">
            <PhoneCall className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-[#2c7334]/40"
              animate={reducedMotion ? undefined : { scale: [1, 1.45], opacity: [0.55, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
          </span>
          <span>
            <span className="block text-xs font-semibold text-[#17211c] sm:text-sm">Llamada telefónica</span>
            <span className="mt-0.5 block text-[9px] font-medium text-[#687267] sm:text-[10px]">
              {conversations[sceneIndex].caller}
            </span>
          </span>
        </div>
        <span className="font-mono text-[10px] font-medium tabular-nums text-[#687267] sm:text-xs">
          00:{String(elapsedSeconds).padStart(2, "0")}
        </span>
      </div>

      <div aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <ConversationScene
            key={sceneIndex}
            conversation={conversations[sceneIndex]}
            reducedMotion={reducedMotion}
          />
        </AnimatePresence>
      </div>

      <p className="sr-only">
        Un cliente solicita una cita. AsistAI ofrece horarios disponibles y confirma automáticamente la reserva.
      </p>

      {!reducedMotion ? (
        <div aria-hidden="true" className="absolute bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 gap-1 sm:bottom-2">
          {conversations.map((conversation, index) => (
            <span
              key={`${conversation.caller}-${conversation.context}`}
              className={`h-1 rounded-full transition-all duration-500 ${index === sceneIndex ? "w-5 bg-[#2c7334]" : "w-1.5 bg-[#2c7334]/20"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
