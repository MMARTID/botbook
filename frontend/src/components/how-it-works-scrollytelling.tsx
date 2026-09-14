"use client";

import {
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  PhoneCall,
  PhoneForwarded,
  Sparkles,
} from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useMotionTemplate,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useRef } from "react";

type StoryMoment = {
  number: string;
  title: string;
  description: string;
};

const MOMENTS: StoryMoment[] = [
  {
    number: "01",
    title: "Conexión",
    description: "Activa el desvío desde tu número de siempre. Tus clientes no tienen que aprender nada nuevo.",
  },
  {
    number: "02",
    title: "En paralelo",
    description: "Mientras el nuevo número se prepara, dejas definidos tus servicios, horarios y agenda.",
  },
  {
    number: "03",
    title: "Libertad operativa",
    description: "Las llamadas se resuelven en segundo plano y tu equipo vuelve a centrarse en quien tiene delante.",
  },
];

const PHONE_DIGITS = ["*", "*", "6", "1", "*", "9", "0", "0", "0", "0", "0", "0", "0", "0", "0", "#"];

function SceneCopy({
  moment,
  opacity,
  y,
}: {
  moment: StoryMoment;
  opacity: MotionValue<number>;
  y: MotionValue<number>;
}) {
  return (
    <motion.div aria-hidden="true" style={{ opacity, y }} className="absolute inset-x-0 top-11">
      <p className="text-sm font-bold tabular-nums text-[#6d28d9]">{moment.number} · {moment.title}</p>
      <h3 className="mt-4 max-w-md text-3xl font-black leading-[1.06] tracking-[-0.035em] text-[#0a0a0a] sm:text-5xl">
        {moment.title === "Conexión"
          ? "Tu número sigue siendo tu número."
          : moment.title === "En paralelo"
            ? "Todo queda listo antes de la primera llamada."
            : "El teléfono deja de interrumpir tu trabajo."}
      </h3>
      <p className="mt-5 max-w-md text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8">{moment.description}</p>
    </motion.div>
  );
}

function PhoneKey({
  digit,
  index,
  progress,
}: {
  digit: string;
  index: number;
  progress: MotionValue<number>;
}) {
  const start = 0.05 + index * 0.012;
  const press = useTransform(progress, [start, start + 0.014, start + 0.036], [0, 1, 0]);
  const scale = useTransform(press, [0, 1], [1, 0.89]);
  const glow = useTransform(press, [0, 1], ["rgba(139, 92, 246, 0)", "rgba(139, 92, 246, 0.22)"]);
  const boxShadow = useMotionTemplate`0 0 0 5px ${glow}`;

  return (
    <motion.span
      className="flex aspect-square items-center justify-center rounded-xl border border-[#e5e5e5] bg-white text-sm font-bold text-[#27272a]"
      style={{ scale, boxShadow }}
    >
      {digit}
    </motion.span>
  );
}

function ConnectionScene({ progress, opacity, scale }: { progress: MotionValue<number>; opacity: MotionValue<number>; scale: MotionValue<number> }) {
  const dialOpacity = useTransform(progress, [0, 0.06, 0.32, 0.34], [1, 1, 1, 0]);
  const activationOpacity = useTransform(progress, [0.17, 0.22, 0.3, 0.34], [0, 1, 1, 0]);
  const routeX = useTransform(progress, [0.14, 0.25], ["-8%", "0%"]);

  return (
    <motion.div data-story-scene="connection" style={{ opacity, scale }} className="absolute inset-0">
      <motion.div data-story-dial style={{ opacity: dialOpacity }} className="absolute inset-0 grid place-items-center">
        <div className="relative w-full max-w-[29rem] overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-[#e5e5e5] pb-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                <PhoneForwarded className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0a0a0a]">Desvío cuando no contestas</p>
                <p className="mt-0.5 text-xs text-[#52525b]">En tu línea habitual</p>
              </div>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" aria-hidden="true" />
          </div>

          <div className="mt-7 text-center">
            <p className="font-mono text-lg font-semibold tracking-[0.16em] text-[#0a0a0a] sm:text-xl">**61*900 000 000#</p>
            <p className="mt-2 text-xs leading-5 text-[#52525b]">Código ilustrativo · Alhabla te guía según tu operadora.</p>
          </div>

          <div className="mx-auto mt-7 grid max-w-[15rem] grid-cols-4 gap-2.5" aria-hidden="true">
            {PHONE_DIGITS.map((digit, index) => <PhoneKey key={`${digit}-${index}`} digit={digit} index={index} progress={progress} />)}
          </div>

          <motion.div style={{ opacity: activationOpacity }} className="absolute inset-x-5 bottom-5 rounded-2xl border border-[#d8efd7] bg-[#ecf7ec] p-3.5 sm:inset-x-7 sm:bottom-7">
            <span className="flex items-center gap-2 text-sm font-bold text-[#2c7334]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Desvío activado</span>
            <p className="mt-1 text-xs leading-5 text-[#2c7334]">Tu línea deriva las llamadas cuando no puedes atender.</p>
          </motion.div>
        </div>
      </motion.div>

      <motion.div style={{ opacity: activationOpacity, x: routeX }} className="absolute -right-3 top-10 hidden items-center gap-2 rounded-full border border-[#ddd6fe] bg-white px-3 py-2 text-xs font-bold text-[#6d28d9] shadow-[0_16px_36px_-26px_rgba(109,40,217,0.65)] sm:flex">
        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Tu llamada sigue su ruta
      </motion.div>
    </motion.div>
  );
}

function SettingsRow({
  label,
  value,
  progress,
  at,
  icon: Icon,
}: {
  label: string;
  value: string;
  progress: MotionValue<number>;
  at: number;
  icon: typeof CalendarCheck2;
}) {
  const opacity = useTransform(progress, [at, at + 0.05], [0.35, 1]);
  const y = useTransform(progress, [at, at + 0.05], [14, 0]);
  const x = useTransform(progress, [at, at + 0.05], [-8, 0]);

  return (
    <motion.div style={{ opacity, y, x }} className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-[#52525b]">{label}</span><span className="mt-0.5 block truncate text-sm font-bold text-[#0a0a0a]">{value}</span></span>
      <Check className="h-4 w-4 shrink-0 text-[#2c7334]" aria-label={`${label} configurado`} />
    </motion.div>
  );
}

function ParallelScene({ progress, opacity, scale }: { progress: MotionValue<number>; opacity: MotionValue<number>; scale: MotionValue<number> }) {
  const approvalOpacity = useTransform(progress, [0.4, 0.49, 0.61, 0.7], [0.2, 1, 1, 0]);
  const approvalY = useTransform(progress, [0.4, 0.49], [18, 0]);
  const preparingOpacity = useTransform(progress, [0.4, 0.49], [1, 0]);
  const shimmer = useTransform(progress, [0.43, 0.59], ["0%", "100%"]);

  return (
    <motion.div data-story-scene="parallel" style={{ opacity, scale }} className="absolute inset-0 grid place-items-center">
      <div className="w-full max-w-[36rem] sm:grid sm:grid-cols-[1.18fr_0.82fr] sm:items-center sm:gap-4">
        <div className="rounded-3xl border border-[#e5e5e5] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[#e5e5e5] pb-5">
            <div><p className="text-sm font-bold text-[#0a0a0a]">Tu recepcionista</p><p className="mt-1 text-xs text-[#52525b]">Información que usará al atender</p></div>
            <div className="relative flex h-6 items-center">
              <motion.span style={{ opacity: preparingOpacity }} className="rounded-full bg-[#f3eeff] px-2.5 py-1 text-[11px] font-bold text-[#6d28d9]">Preparando</motion.span>
              <motion.span style={{ opacity: approvalOpacity }} className="absolute right-0 inline-flex items-center gap-1 rounded-full bg-[#ecf7ec] px-2.5 py-1 text-[11px] font-bold text-[#2c7334] sm:hidden"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Lista</motion.span>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            <SettingsRow label="Servicios" value="Corte, color y tratamientos" progress={progress} at={0.4} icon={ClipboardCheck} />
            <SettingsRow label="Horario" value="L–S · 09:30 a 20:00" progress={progress} at={0.47} icon={CalendarCheck2} />
            <SettingsRow label="Agenda" value="Google Calendar conectado" progress={progress} at={0.54} icon={CalendarCheck2} />
          </div>
        </div>

        <motion.div style={{ opacity: approvalOpacity, y: approvalY }} className="relative mt-4 hidden overflow-hidden rounded-3xl border border-[#0a0a0a] bg-[#0a0a0a] p-5 text-white shadow-[0_20px_42px_-30px_rgba(0,0,0,0.72)] sm:mt-0 sm:block sm:p-5">
          <motion.span style={{ left: shimmer }} className="absolute top-0 h-full w-24 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden="true" />
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0a0a0a]"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.13em] text-white/60">Número de Alhabla</p>
          <p className="mt-2 text-xl font-black tracking-tight">Aprobado para atender</p>
          <div className="mt-8 flex items-center gap-2 border-t border-white/15 pt-4 text-sm font-semibold text-white/85"><CheckCircle2 className="h-4 w-4 text-[#a78bfa]" aria-hidden="true" /> Listo cuando termines de configurar</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function OperationsScene({ progress, opacity, scale }: { progress: MotionValue<number>; opacity: MotionValue<number>; scale: MotionValue<number> }) {
  const cardOneY = useTransform(progress, [0.7, 0.79], [28, 0]);
  const cardTwoY = useTransform(progress, [0.75, 0.84], [30, 0]);
  const cardThreeY = useTransform(progress, [0.8, 0.89], [32, 0]);
  const cardOneOpacity = useTransform(progress, [0.7, 0.77], [0, 1]);
  const cardTwoOpacity = useTransform(progress, [0.75, 0.82], [0, 1]);
  const cardThreeOpacity = useTransform(progress, [0.8, 0.87], [0, 1]);
  const focusOpacity = useTransform(progress, [0.75, 0.86], [0, 1]);

  return (
    <motion.div data-story-scene="operations" style={{ opacity, scale }} className="absolute inset-0 grid place-items-center">
      <div className="w-full max-w-[36rem] overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5e5e5] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><PhoneCall className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-bold text-[#0a0a0a]">Llamadas gestionadas</span><span className="block text-xs text-[#52525b]">Mientras sigues con tu negocio</span></span></div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2c7334]"><span className="h-2 w-2 rounded-full bg-[#2c7334]" aria-hidden="true" /> En marcha</span>
        </div>
        <div className="space-y-2.5 bg-[#fafafa] p-4 sm:p-5">
          <motion.div style={{ y: cardOneY, opacity: cardOneOpacity }} className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><CalendarCheck2 className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#0a0a0a]">Cita confirmada</span><span className="block text-xs text-[#52525b]">Jueves · 17:30 · Corte y peinado</span></span><CheckCircle2 className="h-4 w-4 text-[#2c7334]" aria-hidden="true" /></motion.div>
          <motion.div style={{ y: cardTwoY, opacity: cardTwoOpacity }} className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><PhoneForwarded className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#0a0a0a]">Cambio de cita</span><span className="block text-xs text-[#52525b]">Movida al viernes · 11:00</span></span><ChevronRight className="h-4 w-4 text-[#a1a1aa]" aria-hidden="true" /></motion.div>
          <motion.div style={{ y: cardThreeY, opacity: cardThreeOpacity }} className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-3.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#0a0a0a]">Recado preparado</span><span className="block text-xs text-[#52525b]">Consulta que requiere a tu equipo</span></span><ChevronRight className="h-4 w-4 text-[#a1a1aa]" aria-hidden="true" /></motion.div>
        </div>
      </div>
      <motion.div style={{ opacity: focusOpacity }} className="absolute -bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[#ddd6fe] bg-white px-4 py-2 text-xs font-bold text-[#6d28d9] shadow-[0_16px_36px_-26px_rgba(109,40,217,0.65)] sm:flex"><Check className="h-3.5 w-3.5" aria-hidden="true" /> El equipo recupera el foco</motion.div>
    </motion.div>
  );
}

function StaticStory() {
  return (
    <section id="como-funciona" className="border-y border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24" aria-labelledby="how-it-works-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="how-it-works-title" className="max-w-3xl text-3xl font-black leading-[1.06] tracking-[-0.035em] sm:text-5xl">Cómo funciona</h2>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {MOMENTS.map((moment) => <li key={moment.number} className="rounded-3xl border border-[#e5e5e5] bg-white p-6"><p className="text-sm font-bold text-[#6d28d9]">{moment.number} · {moment.title}</p><p className="mt-5 text-lg font-bold text-[#0a0a0a]">{moment.description}</p></li>)}
        </ol>
      </div>
    </section>
  );
}

export function HowItWorksScrollytelling() {
  const reducedMotion = useReducedMotion() === true;
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { damping: 30, stiffness: 150, mass: 0.25 });

  // Los cruces son breves pero dejan una distancia suficiente para que el scroll
  // manual no convierta un cambio de estado en un corte visual.
  const sceneOneOpacity = useTransform(progress, [0, 0.07, 0.3, 0.37], [1, 1, 1, 0]);
  const sceneTwoOpacity = useTransform(progress, [0.3, 0.37, 0.63, 0.7], [0, 1, 1, 0]);
  const sceneThreeOpacity = useTransform(progress, [0.63, 0.7, 0.94, 1], [0, 1, 1, 1]);
  const sceneOneScale = useTransform(progress, [0.3, 0.37], [1, 0.97]);
  const sceneTwoScale = useTransform(progress, [0.3, 0.37, 0.63, 0.7], [0.97, 1, 1, 0.97]);
  const sceneThreeScale = useTransform(progress, [0.63, 0.7], [0.97, 1]);
  const copyOneY = useTransform(progress, [0.3, 0.37], [0, -20]);
  const copyTwoY = useTransform(progress, [0.3, 0.37, 0.63, 0.7], [20, 0, 0, -20]);
  const copyThreeY = useTransform(progress, [0.63, 0.7], [20, 0]);
  const railOne = useTransform(progress, [0, 0.37], [1, 0]);
  const railTwo = useTransform(progress, [0.3, 0.37, 0.63, 0.7], [0, 1, 1, 0]);
  const railThree = useTransform(progress, [0.63, 0.7], [0, 1]);

  if (reducedMotion) return <StaticStory />;

  return (
    <section ref={sectionRef} id="como-funciona" className="relative h-[340vh] border-y border-[#e5e5e5]" aria-labelledby="how-it-works-title">
      <div className="sticky top-0 flex h-[100svh] min-h-[37rem] items-center overflow-hidden bg-[#fafafa] py-6 sm:py-10 lg:py-16">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-5 px-4 sm:gap-8 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:px-8">
          <div className="relative min-h-[13.5rem] sm:min-h-[15rem] lg:min-h-[17.5rem]">
            <h2 id="how-it-works-title" className="text-sm font-black uppercase tracking-[0.14em] text-[#0a0a0a]">Cómo funciona</h2>
            <SceneCopy moment={MOMENTS[0]} opacity={sceneOneOpacity} y={copyOneY} />
            <SceneCopy moment={MOMENTS[1]} opacity={sceneTwoOpacity} y={copyTwoY} />
            <SceneCopy moment={MOMENTS[2]} opacity={sceneThreeOpacity} y={copyThreeY} />
            <div className="absolute bottom-0 left-0 right-0 flex gap-2" aria-hidden="true">
              {[railOne, railTwo, railThree].map((opacity, index) => <span key={index} className="relative h-1 flex-1 overflow-hidden rounded-full bg-[#e5e5e5]"><motion.span style={{ opacity }} className="absolute inset-0 bg-[#8b5cf6]" /></span>)}
            </div>
          </div>

          <div aria-hidden="true" className="relative min-h-[25rem] sm:min-h-[28rem] lg:min-h-[30rem]">
            <ConnectionScene progress={progress} opacity={sceneOneOpacity} scale={sceneOneScale} />
            <ParallelScene progress={progress} opacity={sceneTwoOpacity} scale={sceneTwoScale} />
            <OperationsScene progress={progress} opacity={sceneThreeOpacity} scale={sceneThreeScale} />
          </div>
        </div>
      </div>
      <ol className="sr-only">
        {MOMENTS.map((moment) => <li key={moment.number}><strong>{moment.title}.</strong> {moment.description}</li>)}
      </ol>
    </section>
  );
}
