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
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

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

const PHONE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const REDIRECT_CODE = "**61*";
const TEST_NUMBER = "900000000";
const DIAL_SEQUENCE = `${REDIRECT_CODE}${TEST_NUMBER}#`;
const DIAL_INTERVAL_MS = 165;
const STAGE_ANCHORS = [0.18, 0.52, 0.88] as const;

function SceneCopy({
  moment,
  y,
  visibility,
}: {
  moment: StoryMoment;
  y: MotionValue<number>;
  visibility: MotionValue<string>;
}) {
  return (
    <motion.div aria-hidden="true" style={{ y, visibility }} className="absolute inset-x-0 top-11">
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

function useDialer(progress: MotionValue<number>, isStoryActive: boolean) {
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const visibleCharactersRef = useRef(0);
  const intervalRef = useRef<number | undefined>();
  const releaseRef = useRef<number | undefined>();

  const stopTyping = useCallback(() => {
    if (intervalRef.current !== undefined) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  const typeNextCharacter = useCallback(() => {
    const nextCharacterCount = Math.min(visibleCharactersRef.current + 1, DIAL_SEQUENCE.length);
    if (nextCharacterCount === visibleCharactersRef.current) {
      stopTyping();
      return;
    }

    visibleCharactersRef.current = nextCharacterCount;
    setVisibleCharacters(nextCharacterCount);

    // Sólo el código de redirección confirma la acción en el teclado. El
    // teléfono de prueba se escribe sin llamar la atención visualmente.
    if (nextCharacterCount <= REDIRECT_CODE.length) {
      setPressedKey(DIAL_SEQUENCE[nextCharacterCount - 1]);
      if (releaseRef.current !== undefined) window.clearTimeout(releaseRef.current);
      releaseRef.current = window.setTimeout(() => setPressedKey(null), 92);
    }

    if (nextCharacterCount === DIAL_SEQUENCE.length) stopTyping();
  }, [stopTyping]);

  const startTyping = useCallback(() => {
    if (intervalRef.current !== undefined || visibleCharactersRef.current >= DIAL_SEQUENCE.length) return;
    typeNextCharacter();
    intervalRef.current = window.setInterval(typeNextCharacter, DIAL_INTERVAL_MS);
  }, [typeNextCharacter]);

  const syncDialerToScene = useCallback((latest: number) => {
    if (!isStoryActive) {
      stopTyping();
      return;
    }

    // El primer ancla es el propio paso de conexión. Si el snap vuelve a él,
    // la secuencia sigue en curso en lugar de borrarse y volver a empezar.
    if (latest < 0.27) startTyping();
    else stopTyping();
  }, [isStoryActive, startTyping, stopTyping]);

  useMotionValueEvent(progress, "change", syncDialerToScene);

  useEffect(() => {
    syncDialerToScene(progress.get());
    return () => {
      stopTyping();
      if (releaseRef.current !== undefined) window.clearTimeout(releaseRef.current);
    };
  }, [progress, stopTyping, syncDialerToScene]);

  return { pressedKey, visibleCharacters };
}

function DialedNumber({ visibleCharacters }: { visibleCharacters: number }) {

  const redirect = DIAL_SEQUENCE.slice(0, Math.min(visibleCharacters, REDIRECT_CODE.length));
  const testNumber = DIAL_SEQUENCE
    .slice(REDIRECT_CODE.length, Math.min(visibleCharacters, REDIRECT_CODE.length + TEST_NUMBER.length))
    .replace(/(\d{3})(?=\d)/g, "$1 ");
  const terminal = visibleCharacters === DIAL_SEQUENCE.length ? "#" : "";

  return (
    <p className="min-h-[1.5rem] text-center font-mono text-base font-semibold tracking-[0.12em] sm:text-xl sm:tracking-[0.16em]">
      <span className="text-[#0a0a0a]">{redirect}</span><span className="text-[#71717a]">{testNumber}</span><span className="text-[#0a0a0a]">{terminal}</span>
    </p>
  );
}

function PhoneKey({
  digit,
  isPressed,
}: {
  digit: string;
  isPressed: boolean;
}) {
  return (
    <motion.span
      className="flex h-11 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white text-sm font-bold text-[#27272a] sm:h-auto sm:aspect-square"
      animate={{
        scale: isPressed ? 0.89 : 1,
        boxShadow: isPressed ? "0 0 0 5px rgba(139, 92, 246, 0.22)" : "0 0 0 0 rgba(139, 92, 246, 0)",
      }}
      transition={{ duration: 0.09, ease: "easeOut" }}
    >
      {digit}
    </motion.span>
  );
}

function ConnectionScene({ progress, scale, visibility, isStoryActive }: { progress: MotionValue<number>; scale: MotionValue<number>; visibility: MotionValue<string>; isStoryActive: boolean }) {
  const { pressedKey, visibleCharacters } = useDialer(progress, isStoryActive);
  const dialOpacity = useTransform(progress, [0, 0.06, 0.34, 0.35], [1, 1, 1, 0]);
  const keypadOpacity = useTransform(progress, [0.13, 0.165], [1, 0]);
  const keypadY = useTransform(progress, [0.13, 0.165], [0, -18]);
  const keypadScale = useTransform(progress, [0.13, 0.165], [1, 0.96]);
  const activationOpacity = useTransform(progress, [0.18, 0.23, 0.34, 0.35], [0, 1, 1, 0]);
  const activationY = useTransform(progress, [0.18, 0.23], [18, 0]);
  const activationScale = useTransform(progress, [0.18, 0.23], [0.96, 1]);
  const routeX = useTransform(progress, [0.14, 0.25], ["-8%", "0%"]);

  return (
    <motion.div data-story-scene="connection" style={{ scale, visibility, pointerEvents: "none" }} className="absolute inset-0">
      <motion.div data-story-dial style={{ opacity: dialOpacity }} className="absolute inset-0 grid place-items-center">
        <div className="relative w-full max-w-[29rem] overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white p-4 sm:p-7">
          <div className="flex items-center justify-between border-b border-[#e5e5e5] pb-3 sm:pb-5">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6] sm:h-10 sm:w-10">
                <PhoneForwarded className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0a0a0a]">Desvío cuando no contestas</p>
                <p className="mt-0.5 text-xs text-[#52525b]">En tu línea habitual</p>
              </div>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" aria-hidden="true" />
          </div>

          <div className="mt-4 text-center sm:mt-7">
            <DialedNumber visibleCharacters={visibleCharacters} />
            <p className="mt-2 text-xs leading-5 text-[#52525b]">Código ilustrativo · Alhabla te guía según tu operadora.</p>
          </div>

          <motion.div style={{ opacity: keypadOpacity, y: keypadY, scale: keypadScale }} className="mx-auto mt-4 grid max-w-[10.5rem] grid-cols-3 gap-1.5 sm:mt-7 sm:max-w-[15rem] sm:gap-2.5" aria-hidden="true">
            {PHONE_KEYS.map((digit) => <PhoneKey key={digit} digit={digit} isPressed={pressedKey === digit} />)}
          </motion.div>

          <motion.div style={{ opacity: activationOpacity, y: activationY, scale: activationScale }} className="absolute inset-x-4 bottom-4 rounded-2xl border border-[#d8efd7] bg-[#ecf7ec] p-3.5 sm:inset-x-7 sm:bottom-7">
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

function ParallelScene({ progress, scale, visibility }: { progress: MotionValue<number>; scale: MotionValue<number>; visibility: MotionValue<string> }) {
  const approvalOpacity = useTransform(progress, [0.4, 0.49, 0.61, 0.7], [0.2, 1, 1, 0]);
  const approvalY = useTransform(progress, [0.4, 0.49], [18, 0]);
  const preparingOpacity = useTransform(progress, [0.4, 0.49], [1, 0]);
  const shimmer = useTransform(progress, [0.43, 0.59], ["0%", "100%"]);

  return (
    <motion.div data-story-scene="parallel" style={{ scale, visibility, pointerEvents: "none" }} className="absolute inset-0 grid place-items-center">
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

function OperationsScene({ progress, scale, visibility }: { progress: MotionValue<number>; scale: MotionValue<number>; visibility: MotionValue<string> }) {
  const cardOneY = useTransform(progress, [0.7, 0.79], [28, 0]);
  const cardTwoY = useTransform(progress, [0.75, 0.84], [30, 0]);
  const cardThreeY = useTransform(progress, [0.8, 0.89], [32, 0]);
  const cardOneOpacity = useTransform(progress, [0.7, 0.77], [0, 1]);
  const cardTwoOpacity = useTransform(progress, [0.75, 0.82], [0, 1]);
  const cardThreeOpacity = useTransform(progress, [0.8, 0.87], [0, 1]);
  const focusOpacity = useTransform(progress, [0.75, 0.86], [0, 1]);

  return (
    <motion.div data-story-scene="operations" style={{ scale, visibility, pointerEvents: "none" }} className="absolute inset-0 grid place-items-center">
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

export function HowItWorksScrollytelling({
  onNarrativeActiveChange,
}: {
  onNarrativeActiveChange?: (isActive: boolean) => void;
}) {
  const reducedMotion = useReducedMotion() === true;
  const sectionRef = useRef<HTMLElement | null>(null);
  const activeStageRef = useRef(0);
  const [isStoryActive, setIsStoryActive] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  // Un único scrub amortiguado interpola los keyframes sin hacer que cada
  // píxel de rueda se convierta en un render. La presencia de cada escena se
  // mantiene en el progreso crudo para que nunca se mezclen dos fases.
  const progress = scrollYProgress;
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, mass: 0.3, restDelta: 0.001 });

  // Las presencias cambian en el mismo punto y de forma discreta: cada
  // costura tiene una sola escena completa, incluso si se interrumpe el gesto.
  // El muelle sólo interpola transformaciones internas, nunca la presencia.
  const sceneOneVisibility = useTransform(progress, [0, 0.339, 0.34, 1], ["visible", "visible", "hidden", "hidden"]);
  const sceneTwoVisibility = useTransform(progress, [0, 0.339, 0.34, 0.669, 0.67, 1], ["hidden", "hidden", "visible", "visible", "hidden", "hidden"]);
  const sceneThreeVisibility = useTransform(progress, [0, 0.669, 0.67, 1], ["hidden", "hidden", "visible", "visible"]);
  const sceneOneScale = useTransform(smoothProgress, [0.3, 0.34], [1, 0.97]);
  const sceneTwoScale = useTransform(smoothProgress, [0.34, 0.38, 0.64, 0.67], [0.97, 1, 1, 0.97]);
  const sceneThreeScale = useTransform(smoothProgress, [0.67, 0.71], [0.97, 1]);
  const copyOneY = useTransform(smoothProgress, [0.3, 0.34], [0, -20]);
  const copyTwoY = useTransform(smoothProgress, [0.34, 0.38, 0.64, 0.67], [20, 0, 0, -20]);
  const copyThreeY = useTransform(smoothProgress, [0.67, 0.71], [20, 0]);
  const railOne = useTransform(smoothProgress, [0, 0.31], [1, 0]);
  const railTwo = useTransform(smoothProgress, [0.34, 0.38, 0.6, 0.64], [0, 1, 1, 0]);
  const railThree = useTransform(smoothProgress, [0.67, 0.71], [0, 1]);

  useMotionValueEvent(progress, "change", (latest) => {
    const nextStage = latest >= 0.67 ? 2 : latest >= 0.34 ? 1 : 0;
    if (activeStageRef.current === nextStage) return;
    activeStageRef.current = nextStage;
    setActiveStage(nextStage);
  });

  const navigateToStage = useCallback((stage: number) => {
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const scrollRange = section.offsetHeight - window.innerHeight;
    if (scrollRange <= 0) return;

    window.scrollTo({
      top: sectionTop + scrollRange * STAGE_ANCHORS[stage],
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [reducedMotion]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reducedMotion) {
      setIsStoryActive(false);
      return;
    }

    // El observador usa una franja de 1 % en el borde superior: activa la
    // marcación justo al fijarse la escena, sin calcular geometría por píxel.
    const observer = new IntersectionObserver(([entry]) => setIsStoryActive(entry.isIntersecting), {
      rootMargin: "0px 0px -99% 0px",
      threshold: 0,
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [reducedMotion]);

  // La cabecera exterior depende del mismo estado que inicia la marcación,
  // no de una observación independiente de toda la sección. Así se restaura
  // al abandonar el relato, al cambiar de ruta o al desmontar el componente.
  useEffect(() => {
    onNarrativeActiveChange?.(!reducedMotion && isStoryActive);
  }, [isStoryActive, onNarrativeActiveChange, reducedMotion]);

  useEffect(() => () => onNarrativeActiveChange?.(false), [onNarrativeActiveChange]);

  useEffect(() => {
    if (reducedMotion || !sectionRef.current) return;

    const section = sectionRef.current;
    let timeoutId: number | undefined;
    let snapLockId: number | undefined;
    let isSnapping = false;
    let previousScrollY = window.scrollY;
    let direction: "forward" | "backward" = "forward";

    const transitionTarget = () => {
      const rect = section.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.65 || rect.bottom < window.innerHeight * 0.35) return null;

      const sectionTop = window.scrollY + rect.top;
      const scrollRange = section.offsetHeight - window.innerHeight;
      if (scrollRange <= 0) return null;

      const currentProgress = Math.max(0, Math.min(1, (window.scrollY - sectionTop) / scrollRange));
      // El ajuste sólo existe en las dos costuras y sólo hacia delante: sirve
      // para no dejar al usuario a medio camino de una transición cuando
      // avanza por el relato. Hacia atrás NO se ajusta — un usuario que
      // scrollea hacia arriba para salir de la sección (p. ej. para volver
      // a la cabecera) cruza las mismas costuras varias veces si viene de
      // una etapa avanzada, y cada ajuste hacia atrás lo devolvía al
      // interior de la historia en vez de dejarlo salir. Dentro de cada
      // paso, y en todo el sentido "atrás", el scroll es completamente
      // libre y conserva el scrubbing en directo.
      if (direction !== "forward") return null;
      if (currentProgress >= 0.312 && currentProgress <= 0.34) return 0.4;
      if (currentProgress >= 0.642 && currentProgress <= 0.67) return 0.75;
      return null;
    };

    const snapTransition = () => {
      const targetProgress = transitionTarget();
      if (targetProgress === null) return;

      const rect = section.getBoundingClientRect();
      const sectionTop = window.scrollY + rect.top;
      const scrollRange = section.offsetHeight - window.innerHeight;
      const target = sectionTop + scrollRange * targetProgress;
      if (Math.abs(target - window.scrollY) <= 3) return;

      isSnapping = true;
      window.scrollTo({ top: target, behavior: "smooth" });
      snapLockId = window.setTimeout(() => {
        previousScrollY = window.scrollY;
        isSnapping = false;
      }, 420);
    };

    const scheduleTransitionSnap = () => {
      if (isSnapping) return;
      if (window.scrollY !== previousScrollY) direction = window.scrollY > previousScrollY ? "forward" : "backward";
      previousScrollY = window.scrollY;
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(snapTransition, 220);
    };

    const snapTransitionAfterGesture = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (!isSnapping) snapTransition();
    };

    window.addEventListener("scroll", scheduleTransitionSnap, { passive: true });
    if ("onscrollend" in window) window.addEventListener("scrollend", snapTransitionAfterGesture);
    return () => {
      window.removeEventListener("scroll", scheduleTransitionSnap);
      if ("onscrollend" in window) window.removeEventListener("scrollend", snapTransitionAfterGesture);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (snapLockId) window.clearTimeout(snapLockId);
    };
  }, [reducedMotion]);

  if (reducedMotion) return <StaticStory />;

  return (
    <section ref={sectionRef} id="como-funciona" className="relative h-[340vh] border-y border-[#e5e5e5]" aria-labelledby="how-it-works-title">
      <div className="sticky top-0 flex h-[100svh] min-h-[37rem] items-center overflow-hidden bg-[#fafafa] py-6 sm:py-10 lg:py-16">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-5 px-4 sm:gap-8 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:px-8">
          <div className="relative min-h-[17.5rem] sm:min-h-[15rem] lg:min-h-[23rem]">
            <h2 id="how-it-works-title" className="text-sm font-black uppercase tracking-[0.14em] text-[#0a0a0a]">Cómo funciona</h2>
            <SceneCopy moment={MOMENTS[0]} y={copyOneY} visibility={sceneOneVisibility} />
            <SceneCopy moment={MOMENTS[1]} y={copyTwoY} visibility={sceneTwoVisibility} />
            <SceneCopy moment={MOMENTS[2]} y={copyThreeY} visibility={sceneThreeVisibility} />
            <nav className="absolute bottom-0 left-0 right-0 flex gap-2" aria-label="Navegar por los pasos de cómo funciona">
              {[railOne, railTwo, railThree].map((opacity, index) => (
                <button
                  key={MOMENTS[index].number}
                  type="button"
                  aria-current={activeStage === index ? "step" : undefined}
                  aria-label={`Ir al paso ${MOMENTS[index].number}: ${MOMENTS[index].title}`}
                  onClick={() => navigateToStage(index)}
                  className="group flex flex-1 flex-col items-start gap-1.5 rounded-2xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2"
                >
                  <span className="relative h-1 w-full overflow-hidden rounded-full bg-[#e5e5e5] transition-[height] duration-150 group-hover:h-1.5 group-focus-visible:h-1.5">
                    <motion.span style={{ opacity }} className="absolute inset-0 bg-[#8b5cf6]" />
                  </span>
                  {/* Etiqueta real de la etapa, no un punto desnudo — siempre
                      visible (no depende del progreso de la barra) para que
                      se pueda orientar qué paso sigue antes de llegar a él. */}
                  <span
                    className={`hidden text-xs font-bold transition-colors duration-200 sm:block ${
                      activeStage === index ? "text-[#6d28d9]" : "text-[#a1a1aa]"
                    }`}
                  >
                    {MOMENTS[index].title}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div aria-hidden="true" className="relative min-h-[22rem] sm:min-h-[28rem] lg:min-h-[30rem]">
            <ConnectionScene progress={smoothProgress} scale={sceneOneScale} visibility={sceneOneVisibility} isStoryActive={isStoryActive} />
            <ParallelScene progress={smoothProgress} scale={sceneTwoScale} visibility={sceneTwoVisibility} />
            <OperationsScene progress={smoothProgress} scale={sceneThreeScale} visibility={sceneThreeVisibility} />
          </div>
        </div>
      </div>
      <ol className="sr-only">
        {MOMENTS.map((moment) => <li key={moment.number}><strong>{moment.title}.</strong> {moment.description}</li>)}
      </ol>
    </section>
  );
}
