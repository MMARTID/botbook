"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  cubicBezier,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Check, Mic, Phone } from "lucide-react";
import { SiApple, SiGooglecalendar } from "@icons-pack/react-simple-icons";

import { MicrosoftLogo } from "@/components/brand-icons";
import styles from "./llamada-scroll.module.css";

/**
 * «Cómo funciona» de la portada (2026-09-26): una llamada de principio a fin
 * en tres pasos, con la misma mecánica scroll-driven que
 * `HowItWorksScrollytelling` — sección alta, escenario fijo y TODO lo que se
 * mueve colgado del progreso del scroll: el teléfono se balancea y se
 * acerca, la conversación y la agenda se van rellenando, y el texto de cada
 * paso suma sus detalles a la vez que la pantalla los enseña.
 *
 * Reglas (heredadas de «Cómo funciona» y de la revisión del 2026-09-26):
 * - La PRESENCIA de cada paso cambia de golpe en la costura (1/3 y 2/3),
 *   sobre el progreso crudo: nunca conviven dos textos ni dos pantallas, y
 *   la pantalla nunca se apaga — el contenido del paso nuevo ya está a la
 *   vista en la costura.
 * - Todo lo demás va sobre un muelle suave del mismo progreso. El teléfono
 *   usa además una curva de ida y vuelta (`suave`) con los extremos en las
 *   costuras, para que el cambio de pantalla caiga en el punto de giro.
 * - Un render plano aguanta ~12° de giro en Y sin delatarse: el resto del
 *   movimiento es deriva lateral, subida y una leve inclinación.
 * - Nada fuerza la posición del scroll salvo el clic en la barra de pasos.
 */

type PasoCopy = {
  numero: string;
  etiqueta: string;
  pantalla: string;
  titulo: string;
  texto: string;
  detalles: [string, string, string];
};

const PASOS: [PasoCopy, PasoCopy, PasoCopy] = [
  {
    numero: "01",
    etiqueta: "Contesta",
    pantalla: "Lo que oye tu clienta",
    titulo: "Si no puedes cogerlo, contesta Alhabla.",
    texto:
      "Cuando no puedes coger el teléfono, la llamada salta a Alhabla tras unos tonos. Saluda con el nombre de tu negocio y atiende como lo haría tu recepción.",
    detalles: [
      "Tus clientes marcan el número de siempre",
      "A cualquier hora, también en festivos",
      "Resuelve precios, duraciones y horarios con tus datos",
    ],
  },
  {
    numero: "02",
    etiqueta: "Busca hueco",
    pantalla: "Tu agenda",
    titulo: "Busca hueco en tu agenda real.",
    texto:
      "Antes de ofrecer una hora mira tu horario y tu calendario de Google, Outlook o iCloud. Nunca reserva a ciegas ni te monta dos citas a la vez.",
    detalles: [
      "Cuenta lo que dura el servicio y descarta lo ocupado y los huecos cortos",
      "Elige al profesional adecuado; si no hay sitio, propone el hueco más cercano",
      "Ofrece la hora y solo reserva cuando el cliente dice que sí",
    ],
  },
  {
    numero: "03",
    etiqueta: "Confirma",
    pantalla: "El WhatsApp de tu clienta",
    titulo: "La cita entra y todos se enteran.",
    texto:
      "Queda apuntada en tu calendario sin que hayas tenido que soltar lo que estabas haciendo.",
    detalles: [
      "Al cliente le llega la confirmación por WhatsApp al momento",
      "A ti te llega el aviso de la cita nueva",
      "En tu panel tienes la grabación y la transcripción de la llamada",
    ],
  },
];

const COSTURA_1 = 1 / 3;
const COSTURA_2 = 2 / 3;
/** Momento en que aparece cada detalle del texto, paso a paso. */
const MOMENTOS: [number, number, number][] = [
  [0.04, 0.12, 0.2],
  [0.4, 0.47, 0.54],
  [0.7, 0.76, 0.82],
];
/** Al pulsar un paso en la barra se cae con todo ya a la vista. */
const ANCLAS = [0.3, 0.62, 0.92] as const;

/** Ida y vuelta para movimiento en pantalla (ease-in-out fuerte). */
const suave = cubicBezier(0.65, 0, 0.35, 1);

/** Aparece en [a, a + d] subiendo un poco: opacidad y desplazamiento. */
function useAparece(p: MotionValue<number>, a: number, d = 0.03, desde = 10) {
  const opacity = useTransform(p, [a, a + d], [0, 1]);
  const y = useTransform(p, [a, a + d], [desde, 0]);
  return { opacity, y };
}

function useEsMovil() {
  const [movil, setMovil] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const cambiar = () => setMovil(mq.matches);
    cambiar();
    mq.addEventListener("change", cambiar);
    return () => mq.removeEventListener("change", cambiar);
  }, []);
  return movil;
}

export function LlamadaScroll() {
  const reducir = useReducedMotion() === true;
  const movil = useEsMovil();
  const seccion = useRef<HTMLElement>(null);
  const [paso, setPaso] = useState(0);
  const { scrollYProgress: p } = useScroll({ target: seccion, offset: ["start start", "end end"] });
  const s = useSpring(p, { stiffness: 220, damping: 32, mass: 0.3, restDelta: 0.001 });

  useMotionValueEvent(p, "change", (v) => {
    const siguiente = v >= COSTURA_2 ? 2 : v >= COSTURA_1 ? 1 : 0;
    setPaso((actual) => (actual === siguiente ? actual : siguiente));
  });

  // Presencia discreta en las costuras, sobre el progreso crudo.
  const vis1 = useTransform(p, [0, COSTURA_1 - 0.001, COSTURA_1, 1], ["visible", "visible", "hidden", "hidden"]);
  const vis2 = useTransform(
    p,
    [0, COSTURA_1 - 0.001, COSTURA_1, COSTURA_2 - 0.001, COSTURA_2, 1],
    ["hidden", "hidden", "visible", "visible", "hidden", "hidden"]
  );
  const vis3 = useTransform(p, [0, COSTURA_2 - 0.001, COSTURA_2, 1], ["hidden", "hidden", "visible", "visible"]);

  // El texto de cada paso sale hacia arriba y el siguiente entra desde abajo.
  const copy1Y = useTransform(s, [0.3, COSTURA_1], [0, -20]);
  const copy2Y = useTransform(s, [COSTURA_1, 0.36, 0.64, COSTURA_2], [20, 0, 0, -20]);
  const copy3Y = useTransform(s, [COSTURA_2, 0.69], [20, 0]);

  // El teléfono se balancea durante todo el recorrido. En móvil, con menos
  // amplitud: allí el teléfono llena su hueco y no puede irse lejos.
  const k = movil ? 0.45 : 1;
  const giroY = useTransform(s, [0, 0.08, COSTURA_1, COSTURA_2, 0.95, 1], [-12, -6, 9, -9, 4, 4].map((v) => v * k), { ease: suave });
  const giroX = useTransform(s, [0, 0.08, 1], [6 * k, 3 * k, 3 * k]);
  const deriva = useTransform(s, [0, COSTURA_1, COSTURA_2, 1], [-18, 14, -14, 0].map((v) => v * k), { ease: suave });
  const subida = useTransform(s, [0, 0.08, COSTURA_1, COSTURA_2, 1], [40, 0, -10, -2, -12].map((v) => v * k), { ease: suave });
  const inclina = useTransform(s, [0, COSTURA_1, COSTURA_2, 1], [-1.5, 1.2, -1.2, 0].map((v) => v * k), { ease: suave });
  // Paso 2: se acerca al hueco mientras el buscador recorre la agenda.
  const zoom = useTransform(s, [0.43, 0.48, 0.56, 0.61], [1, movil ? 1.06 : 1.16, movil ? 1.06 : 1.16, 1], { ease: suave });
  // La sombra acompaña: se estrecha al girar y se aclara al subir.
  const sombraX = useTransform(giroY, (v) => 1 - Math.abs(v) / 60);
  const sombraO = useTransform(subida, [40, 0, -14], [0.35, 1, 0.8]);

  // Barra de pasos: cada tramo se llena con su parte del progreso.
  const barra1 = useTransform(p, [0, COSTURA_1], [0, 1]);
  const barra2 = useTransform(p, [COSTURA_1, COSTURA_2], [0, 1]);
  const barra3 = useTransform(p, [COSTURA_2, 1], [0, 1]);

  // Mientras el escenario está fijo, el botón de «Configurar cookies» se
  // esconde (tapaba la barra de pasos en móvil). Ver google-analytics.tsx.
  useEffect(() => {
    const el = seccion.current;
    if (!el) return;
    const raiz = document.documentElement;
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) raiz.setAttribute("data-relato", "");
      else raiz.removeAttribute("data-relato");
    });
    observador.observe(el);
    return () => {
      observador.disconnect();
      raiz.removeAttribute("data-relato");
    };
  }, [reducir]);

  const irA = useCallback(
    (i: number) => {
      const el = seccion.current;
      if (!el) return;
      const recorrido = el.offsetHeight - window.innerHeight;
      const top = window.scrollY + el.getBoundingClientRect().top + recorrido * ANCLAS[i];
      window.scrollTo({ top, behavior: reducir ? "auto" : "smooth" });
    },
    [reducir]
  );

  if (reducir) return <VersionQuieta />;

  return (
    <section ref={seccion} id="como-funciona" className={styles.seccion} aria-labelledby="llamada-titulo">
      <div className={styles.escenario}>
        <div className={styles.rejilla}>
          <div className={styles.columnaTexto}>
            <h2 id="llamada-titulo" className={styles.antetitulo}>
              Cómo funciona
            </h2>
            <div className={styles.copias} aria-hidden="true">
              <Copia paso={PASOS[0]} y={copy1Y} visibility={vis1} p={s} momentos={MOMENTOS[0]} />
              <Copia paso={PASOS[1]} y={copy2Y} visibility={vis2} p={s} momentos={MOMENTOS[1]} />
              <Copia paso={PASOS[2]} y={copy3Y} visibility={vis3} p={s} momentos={MOMENTOS[2]} />
            </div>
            <nav className={styles.barraPasos} aria-label="Pasos de cómo funciona">
              {[barra1, barra2, barra3].map((relleno, i) => (
                <button
                  key={PASOS[i].numero}
                  type="button"
                  onClick={() => irA(i)}
                  aria-current={paso === i ? "step" : undefined}
                  aria-label={`Ir al paso ${PASOS[i].numero}: ${PASOS[i].etiqueta}`}
                  className={styles.botonPaso}
                >
                  <span className={styles.pista}>
                    <motion.span className={styles.relleno} style={{ scaleX: relleno }} />
                  </span>
                  <span className={styles.etiquetaPaso} data-activo={paso === i ? "" : undefined}>
                    {PASOS[i].numero} · {PASOS[i].etiqueta}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className={styles.columnaTelefono} aria-hidden="true">
            <p className={styles.rotulo}>
              <motion.span style={{ visibility: vis1 }}>{PASOS[0].pantalla}</motion.span>
              <motion.span style={{ visibility: vis2 }}>{PASOS[1].pantalla}</motion.span>
              <motion.span style={{ visibility: vis3 }}>{PASOS[2].pantalla}</motion.span>
            </p>
            <motion.div
              className={styles.telefono}
              style={{
                x: deriva,
                y: subida,
                rotateY: giroY,
                rotateX: giroX,
                rotate: inclina,
                scale: zoom,
                originY: 0.36,
                transformPerspective: 1400,
              }}
            >
              <motion.div className={styles.sombra} style={{ scaleX: sombraX, opacity: sombraO }} />
              <div className={styles.hueco}>
                <span className={styles.isla} />
                <motion.div className={styles.capa} style={{ visibility: vis1 }}>
                  <Estado oscuro />
                  <PantallaLlamada p={s} />
                </motion.div>
                <motion.div className={styles.capa} style={{ visibility: vis2 }}>
                  <Estado oscuro={false} />
                  <PantallaAgenda p={s} />
                </motion.div>
                <motion.div className={styles.capa} style={{ visibility: vis3 }}>
                  <Estado oscuro={false} />
                  <PantallaWhatsApp p={s} />
                </motion.div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- render local, el marco del teléfono */}
              <img src="/telefono/frente.webp" alt="" className={styles.marco} width={1335} height={2859} />
            </motion.div>
          </div>
        </div>
      </div>

      <ol className="sr-only">
        {PASOS.map((pc) => (
          <li key={pc.numero}>
            <strong>{pc.titulo}</strong> {pc.texto} {pc.detalles.join(". ")}.
          </li>
        ))}
      </ol>
    </section>
  );
}

function Copia({
  paso,
  y,
  visibility,
  p,
  momentos,
}: {
  paso: PasoCopy;
  y: MotionValue<number>;
  visibility: MotionValue<string>;
  p: MotionValue<number>;
  momentos: [number, number, number];
}) {
  return (
    <motion.div className={styles.copia} style={{ y, visibility }}>
      <p className={styles.numero}>
        {paso.numero} · {paso.etiqueta}
      </p>
      <h3 className={styles.titulo}>{paso.titulo}</h3>
      <p className={styles.texto}>{paso.texto}</p>
      <ul className={styles.detalles}>
        {paso.detalles.map((d, i) => (
          <Detalle key={d} p={p} a={momentos[i]}>
            {d}
          </Detalle>
        ))}
      </ul>
    </motion.div>
  );
}

function Detalle({ p, a, children }: { p: MotionValue<number>; a: number; children: ReactNode }) {
  const { opacity, y } = useAparece(p, a, 0.03, 8);
  return (
    <motion.li className={styles.detalle} style={{ opacity, y }}>
      <Check className={styles.detalleIcono} aria-hidden="true" />
      <span>{children}</span>
    </motion.li>
  );
}

/* ── Pantallas ───────────────────────────────────────────────────── */

function Estado({ oscuro }: { oscuro: boolean }) {
  return (
    <div className={styles.estado} style={{ color: oscuro ? "#fff" : "#0a0a0a" }}>
      <span>17:02</span>
      <span>5G</span>
    </div>
  );
}

function Aparece({
  p,
  a,
  className,
  children,
}: {
  p: MotionValue<number>;
  a: number;
  className?: string;
  children: ReactNode;
}) {
  const { opacity, y } = useAparece(p, a, 0.025, 12);
  return (
    <motion.div className={className} style={{ opacity, y }}>
      {children}
    </motion.div>
  );
}

const ONDA = [0.3, 0.55, 0.8, 0.45, 0.95, 0.6, 0.35, 0.7, 0.5, 0.25, 0.65, 0.4];

function BarraOnda({ p, i, base }: { p: MotionValue<number>; i: number; base: number }) {
  // La onda «habla» con el scroll mientras dura la conversación.
  const escala = useTransform(p, (v) =>
    v < 0.05 || v > 0.3 ? base * 0.35 : 0.25 + 0.75 * Math.abs(Math.sin(v * 140 + i * 0.9)) * base
  );
  return <motion.span style={{ scaleY: escala }} />;
}

function PantallaLlamada({ p }: { p: MotionValue<number> }) {
  // Antes de descolgar: «Llamada entrante». Después, el contador corre con
  // el scroll.
  const entrante = useTransform(p, [0, 0.025, 0.03], [1, 1, 0]);
  const enCurso = useTransform(p, [0.025, 0.03], [0, 1]);
  const contador = useTransform(p, [0.03, COSTURA_1], [0, 48], { clamp: true });
  const reloj = useTransform(contador, (v) => `Alhabla · 00:${String(Math.round(v)).padStart(2, "0")}`);

  return (
    <div className={`${styles.pantalla} ${styles.llamada}`}>
      <div className={styles.llamante}>
        <p className={styles.llamanteNombre}>Laura</p>
        <div className={styles.llamanteDatoCaja}>
          <motion.p className={styles.llamanteDato} style={{ opacity: entrante }}>
            Llamada entrante…
          </motion.p>
          <motion.p className={styles.llamanteDato} style={{ opacity: enCurso }}>
            {reloj}
          </motion.p>
        </div>
      </div>
      <div className={styles.transcripcion}>
        <Aparece p={p} a={0.05} className={`${styles.burbuja} ${styles.burbujaAlhabla}`}>
          <span className={styles.quien}>Alhabla</span>
          Hola, gracias por llamar a Peluquería Nuria. ¿En qué te ayudo?
        </Aparece>
        <Aparece p={p} a={0.1} className={`${styles.burbuja} ${styles.burbujaCliente}`}>
          <span className={styles.quien}>Laura</span>
          ¿Tenéis hueco mañana para corte y color?
        </Aparece>
        <Aparece p={p} a={0.16} className={`${styles.burbuja} ${styles.burbujaAlhabla}`}>
          <span className={styles.quien}>Alhabla</span>
          Claro, son unos 90 minutos. ¿A qué hora te viene mejor?
        </Aparece>
        <Aparece p={p} a={0.22} className={`${styles.burbuja} ${styles.burbujaCliente}`}>
          <span className={styles.quien}>Laura</span>
          Por la tarde, si puede ser.
        </Aparece>
        <Aparece p={p} a={0.27} className={`${styles.burbuja} ${styles.burbujaAlhabla}`}>
          <span className={styles.quien}>Alhabla</span>
          Un momento, que te lo miro.
        </Aparece>
      </div>
      <div className={styles.onda}>
        {ONDA.map((base, i) => (
          <BarraOnda key={i} p={p} i={i} base={base} />
        ))}
      </div>
      <span className={styles.colgar}>
        <Phone color="#fff" strokeWidth={2.4} />
      </span>
    </div>
  );
}

const FILAS = [
  { hora: "15:00", titulo: "Ocupado", detalle: "Alisado · Rosa" },
  { hora: "16:00", titulo: "Ocupado", detalle: "Mechas · Carmen" },
  { hora: "17:00", titulo: "Hueco corto", detalle: "30 min libres: no cabe" },
  { hora: "17:30", titulo: "Libre", detalle: "90 min · con Marta" },
  { hora: "19:00", titulo: "Ocupado", detalle: "Peinado · Elena" },
  { hora: "20:00", titulo: "Cerrado", detalle: "Fin de la jornada" },
] as const;

/** La fila que sirve y el momento en que el buscador pasa por cada una. */
const LIBRE = 3;
const REVISA = [0.43, 0.455, 0.48, 0.505] as const;

function PantallaAgenda({ p }: { p: MotionValue<number> }) {
  // El marcador baja fila a fila; las que no valen se apagan al pasar.
  const marcadorY = useTransform(p, [0.41, ...REVISA], ["0%", "0%", "100%", "200%", "300%"]);
  const marcador = useTransform(p, [0.41, 0.43, 0.5, 0.515], [0, 1, 1, 0]);
  // «Libre» se va y «Nueva» entra sin cruzarse: nunca dos textos a la vez.
  const libre = useTransform(p, [0.51, 0.511], [1, 0]);
  const reservada = useTransform(p, [0.512, 0.53], [0, 1]);
  const reservadaEscala = useTransform(p, [0.512, 0.54], [0.94, 1]);

  return (
    <div className={`${styles.pantalla} ${styles.agenda}`}>
      <Aparece p={p} a={0.336} className={styles.buscando}>
        <span className={styles.buscandoEtiqueta}>Buscando hueco · mañana</span>
        <span className={styles.buscandoServicio}>Corte y color · 90 min</span>
      </Aparece>
      <div className={styles.franjas}>
        <motion.span className={styles.marcador} style={{ y: marcadorY, opacity: marcador }} />
        {FILAS.map((fila, i) => (
          <Fila key={fila.hora} p={p} i={i}>
            <span className={styles.franjaHora}>{fila.hora}</span>
            {i === LIBRE ? (
              <span className={styles.celda}>
                <motion.span className={styles.cita} style={{ opacity: libre }}>
                  <span className={styles.citaTitulo}>{fila.titulo}</span>
                  {fila.detalle}
                </motion.span>
                <motion.span className={styles.citaNueva} style={{ opacity: reservada, scale: reservadaEscala }}>
                  <span className={styles.etiquetaNueva}>Nueva</span>
                  <span className={styles.citaTitulo}>Corte y color</span>
                  Laura · con Marta
                </motion.span>
              </span>
            ) : (
              <span className={styles.cita}>
                <span className={styles.citaTitulo}>{fila.titulo}</span>
                {fila.detalle}
              </span>
            )}
          </Fila>
        ))}
      </div>
      <Aparece p={p} a={0.55} className={styles.calendarios}>
        <SiGooglecalendar color="default" />
        <MicrosoftLogo />
        <SiApple color="#0a0a0a" />
        <span>Guardada en tu calendario</span>
      </Aparece>
    </div>
  );
}

function Fila({ p, i, children }: { p: MotionValue<number>; i: number; children: ReactNode }) {
  const { opacity, y } = useAparece(p, 0.338 + i * 0.008, 0.02, 10);
  // Las filas que el buscador descarta se apagan al pasar por ellas.
  const revisa: number | undefined = REVISA[i];
  const apagado = useTransform(
    p,
    revisa === undefined ? [0, 1] : [revisa, revisa + 0.01],
    revisa === undefined || i === LIBRE ? [1, 1] : [1, 0.45]
  );
  const opacidad = useTransform([opacity, apagado], ([a, b]: number[]) => a * b);
  return (
    <motion.div className={styles.franja} style={{ opacity: opacidad, y }}>
      {children}
    </motion.div>
  );
}

function PantallaWhatsApp({ p }: { p: MotionValue<number> }) {
  return (
    <div className={`${styles.pantalla} ${styles.whatsapp}`}>
      <div className={styles.waCabecera}>
        <span className={styles.waAvatar}>A</span>
        <div>
          <p className={styles.waNombre}>Alhabla Reservas</p>
          <p className={styles.waSub}>Cuenta de empresa</p>
        </div>
      </div>
      <div className={styles.waChat}>
        <Aparece p={p} a={0.668} className={styles.waFecha}>
          Hoy
        </Aparece>
        <Aparece p={p} a={0.672} className={styles.waMensaje}>
          Hola, Laura. Tu cita está confirmada:
          <br />
          <strong>Corte y color</strong>
          <br />
          Jueves a las 17:30 con Marta
          <br />
          Peluquería Nuria
          <span className={styles.waHora}>17:03</span>
        </Aparece>
        <Aparece p={p} a={0.73} className={styles.waBoton}>
          Guardar contacto
        </Aparece>
        <Aparece p={p} a={0.79} className={`${styles.waMensaje} ${styles.waMio}`}>
          ¡Genial, gracias!
          <span className={styles.waHora}>17:04 ✓✓</span>
        </Aparece>
      </div>
      <div className={styles.waEscribir}>
        <span className={styles.waCaja}>Mensaje</span>
        <span className={styles.waMicro}>
          <Mic color="#fff" strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

/** Movimiento reducido: los tres pasos a la vista, sin escenario fijo. */
function VersionQuieta() {
  return (
    <section id="como-funciona" className="border-y border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24" aria-labelledby="llamada-titulo-quieta">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="llamada-titulo-quieta" className="max-w-3xl text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">
          Cómo funciona: una llamada, de principio a fin.
        </h2>
        <ol className="mt-10 grid gap-5 lg:grid-cols-3">
          {PASOS.map((pc) => (
            <li key={pc.numero} className="rounded-3xl border border-[#e5e5e5] bg-white p-7">
              <p className="text-sm font-bold text-[#6d28d9]">
                {pc.numero} · {pc.etiqueta}
              </p>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-[#0a0a0a]">{pc.titulo}</h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">{pc.texto}</p>
              <ul className="mt-4 space-y-2">
                {pc.detalles.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm leading-6 text-[#27272a]">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-[#8b5cf6]" aria-hidden="true" />
                    {d}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
