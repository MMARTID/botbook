"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  cubicBezier,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Check, Mic, Phone } from "lucide-react";
import { SiApple, SiGooglecalendar } from "@icons-pack/react-simple-icons";

import { MicrosoftLogo } from "@/components/brand-icons";
import { useMovimientoReducido } from "@/hooks/use-movimiento-reducido";
import { marcarRelato } from "@/lib/relato-fijo";
import {
  ALTO_BOLSILLO_VH,
  BOLSILLO_P,
  ESQUINA,
  hayNegocioEnEscena,
  publicarEsquinaTelefono,
} from "@/lib/transicion-bolsillo-negocio";
import styles from "./llamada-scroll.module.css";

/**
 * «En tu bolsillo» de la portada (2026-09-26; ancla #como-funciona, a la que
 * apunta el menú): una llamada de principio a fin
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
 *
 * Desde el 2026-09-30 la sección no termina: al acabar el tercer paso el
 * teléfono se vuelca (fase «Vuelco») y se funde con el portátil de «En tu
 * negocio», que solapa a esta sección. El reparto de los tramos y la esquina
 * en la que se encuentran están en `lib/transicion-bolsillo-negocio.ts`.
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
  [0.68, 0.72, 0.76],
];
/** Al pulsar un paso en la barra se cae con todo ya a la vista. */
const ANCLAS = [0.3, 0.62, 0.88] as const;

/**
 * Los tres pasos ocupan el progreso 0→FIN_PASOS de la sección; de ahí a
 * INICIO_CRUCE va el vuelco, y el resto es el cruce con «En tu negocio».
 * Todo lo de arriba (costuras, momentos, anclas) va sobre el progreso de los
 * pasos, que es el de antes estirado a 0→1.
 */
const { finPasos: FIN_PASOS, inicioCruce: INICIO_CRUCE } = BOLSILLO_P;
/** El teléfono se apaga en la primera parte del cruce, con el escenario aún fijo. */
const FIN_FUNDIDO = INICIO_CRUCE + (1 - INICIO_CRUCE) * 0.6;
/** A cuánto crece el teléfono al volcarse (en móvil, menos: no cabe). */
const ESCALA_VUELCO = 2.6;
const ESCALA_VUELCO_MOVIL = 1.8;
/**
 * El marco (public/telefono/frente.webp) no llena su imagen: margen
 * transparente a la derecha y arriba, y radio de sus esquinas, como fracción
 * del ancho y del alto del elemento. Medidos sobre el render.
 */
const MARCO = { derecha: 17 / 1335, arriba: 78 / 2859, radio: 230 / 1335 } as const;

/** Ida y vuelta para movimiento en pantalla (ease-in-out fuerte). */
const suave = cubicBezier(0.65, 0, 0.35, 1);
/** Ease-in-out cúbico, el del vuelco. */
const cubico = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const acotar = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
/** Posición de `v` dentro del tramo [a, b], acotada a [0, 1]. */
const tramo = (v: number, a: number, b: number) => acotar((v - a) / (b - a));

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
  // Con movimiento reducido, la versión quieta llega tras montar: el servidor
  // no sabe la preferencia y pinta el escenario (ver useMovimientoReducido).
  const reducir = useMovimientoReducido();
  const movil = useEsMovil();
  const seccion = useRef<HTMLElement>(null);
  const escenario = useRef<HTMLDivElement>(null);
  const columnaTelefono = useRef<HTMLDivElement>(null);
  const telefono = useRef<HTMLDivElement>(null);
  const [paso, setPaso] = useState(0);
  const { scrollYProgress: p } = useScroll({ target: seccion, offset: ["start start", "end end"] });
  const s = useSpring(p, { stiffness: 220, damping: 32, mass: 0.3, restDelta: 0.001 });
  // El progreso de los tres pasos (0→FIN_PASOS estirado a 0→1), crudo y
  // suavizado: es lo que ven las costuras, las pantallas y los textos.
  const pp = useTransform(p, (v) => Math.min(1, v / FIN_PASOS));
  const sp = useTransform(s, (v) => Math.min(1, v / FIN_PASOS));
  /**
   * La salida del escenario, solo cuando «En tu negocio» no lo releva (sin
   * WebGL o sin modelo, esa sección va quieta y no solapa a esta).
   *
   * `p` llega a 1 justo cuando el escenario deja de estar pegado, y a partir
   * de ahí queda todavía una pantalla entera de scroll en la que el escenario
   * se va hacia arriba: es como funciona `position: sticky`, no se puede
   * quitar. Para que no parezca una avería, ese tramo es una despedida: el
   * escenario se desvanece y sube un poco mientras entra la sección
   * siguiente. Con la escena 3D delante no hace falta: el cruce acaba con el
   * escenario aún fijo y el de «En tu negocio» encima.
   */
  const { scrollYProgress: salida } = useScroll({
    target: seccion,
    offset: ["end end", "end start"],
  });
  const opacidadSalida = useTransform(salida, (v) => (hayNegocioEnEscena() ? 1 : 1 - tramo(v, 0, 0.55)));
  const ySalida = useTransform(salida, (v) => (hayNegocioEnEscena() ? 0 : -64 * v));

  useMotionValueEvent(pp, "change", (v) => {
    const siguiente = v >= COSTURA_2 ? 2 : v >= COSTURA_1 ? 1 : 0;
    setPaso((actual) => (actual === siguiente ? actual : siguiente));
  });

  // Presencia discreta en las costuras, sobre el progreso crudo.
  const vis1 = useTransform(pp, [0, COSTURA_1 - 0.001, COSTURA_1, 1], ["visible", "visible", "hidden", "hidden"]);
  const vis2 = useTransform(
    pp,
    [0, COSTURA_1 - 0.001, COSTURA_1, COSTURA_2 - 0.001, COSTURA_2, 1],
    ["hidden", "hidden", "visible", "visible", "hidden", "hidden"]
  );
  const vis3 = useTransform(pp, [0, COSTURA_2 - 0.001, COSTURA_2, 1], ["hidden", "hidden", "visible", "visible"]);

  // El texto de cada paso sale hacia arriba y el siguiente entra desde abajo.
  const copy1Y = useTransform(sp, [0.3, COSTURA_1], [0, -20]);
  const copy2Y = useTransform(sp, [COSTURA_1, 0.36, 0.64, COSTURA_2], [20, 0, 0, -20]);
  const copy3Y = useTransform(sp, [COSTURA_2, 0.69], [20, 0]);

  // El teléfono se balancea durante todo el recorrido. En móvil, con menos
  // amplitud: allí el teléfono llena su hueco y no puede irse lejos.
  const k = movil ? 0.45 : 1;
  const giroY = useTransform(sp, [0, 0.08, COSTURA_1, COSTURA_2, 0.95, 1], [-12, -6, 9, -9, 4, 4].map((v) => v * k), { ease: suave });
  const giroX = useTransform(sp, [0, 0.08, 1], [6 * k, 3 * k, 3 * k]);
  const deriva = useTransform(sp, [0, COSTURA_1, COSTURA_2, 1], [-18, 14, -14, 0].map((v) => v * k), { ease: suave });
  const subida = useTransform(sp, [0, COSTURA_1, COSTURA_2, 1], [0, -10, -2, -12].map((v) => v * k), { ease: suave });
  const inclina = useTransform(sp, [0, COSTURA_1, COSTURA_2, 1], [-1.5, 1.2, -1.2, 0].map((v) => v * k), { ease: suave });
  // Paso 2: se acerca al hueco mientras el buscador recorre la agenda.
  const zoom = useTransform(sp, [0.43, 0.48, 0.56, 0.61], [1, movil ? 1.06 : 1.16, movil ? 1.06 : 1.16, 1], { ease: suave });

  /**
   * Vuelco (FIN_PASOS→INICIO_CRUCE): el teléfono se tumba a −90°, crece y se
   * va hacia la esquina inferior derecha hasta que solo se ve su esquina
   * superior izquierda (la de arriba a la derecha del marco de pie), que es
   * donde «En tu negocio» pondrá la esquina de la tapa del portátil. Los
   * giros en 3D se apagan, con un balanceo en Y a mitad de camino, y el zoom
   * pasa por un pico extra del 10 %. Todo con easing cúbico, sobre el muelle.
   */
  const tVuelco = useTransform(s, [FIN_PASOS, INICIO_CRUCE], [0, 1]);
  const tv = useTransform(tVuelco, cubico);
  // A dónde tiene que ir el centro del teléfono para que la esquina caiga en
  // su sitio: depende del layout, se mide (ver `medir`).
  const xFinal = useMotionValue(0);
  const yFinal = useMotionValue(0);
  const rotateY = useTransform([giroY, tv], ([g, t]: number[]) => g * (1 - t) - 12 * Math.sin(Math.PI * t));
  const rotateX = useTransform([giroX, tv], ([g, t]: number[]) => g * (1 - t));
  const rotate = useTransform([inclina, tv], ([r, t]: number[]) => r - 90 * t);
  const escalaVuelco = movil ? ESCALA_VUELCO_MOVIL : ESCALA_VUELCO;
  const scale = useTransform(
    [zoom, tv],
    ([z, t]: number[]) => z * (1 + (escalaVuelco - 1) * t) * (1 + 0.1 * Math.sin(Math.PI * t))
  );
  const x = useTransform([deriva, tv, xFinal], ([d, t, xf]: number[]) => d + xf * t);
  const y = useTransform([subida, tv, yFinal], ([sb, t, yf]: number[]) => sb * (1 - t) + yf * t);
  const originY = useTransform(tVuelco, [0, 0.25], [0.36, 0.5]);
  // El texto, el rótulo y la barra de pasos se van en el primer cuarto del
  // vuelco; la sombra del teléfono también.
  const opacidadTexto = useTransform(tVuelco, [0, 0.25], [1, 0]);
  const yTexto = useTransform(tVuelco, [0, 0.25], [0, -24]);
  const visTexto = useTransform(tVuelco, (t) => (t >= 0.25 ? "hidden" : "visible"));
  // La sombra acompaña: se estrecha al girar y se aclara al subir.
  const sombraX = useTransform(giroY, (v) => 1 - Math.abs(v) / 60);
  const sombraO = useTransform([subida, tVuelco], ([sb, t]: number[]) => (1 - 0.2 * tramo(sb, 0, -14)) * (1 - tramo(t, 0, 0.25)));
  // En el cruce, el teléfono se apaga bajo el lienzo 3D de «En tu negocio»
  // (sobre el progreso crudo, como el lienzo). Sin escena, se queda.
  const opacidadTelefono = useTransform(p, (v) => (hayNegocioEnEscena() ? 1 - tramo(v, INICIO_CRUCE, FIN_FUNDIDO) : 1));

  // Barra de pasos: cada tramo se llena con su parte del progreso.
  const barra1 = useTransform(pp, [0, COSTURA_1], [0, 1]);
  const barra2 = useTransform(pp, [COSTURA_1, COSTURA_2], [0, 1]);
  const barra3 = useTransform(pp, [COSTURA_2, 1], [0, 1]);

  /**
   * Mide dónde descansa el teléfono dentro del escenario (que, pegado, ocupa
   * la pantalla) y calcula el desplazamiento que lo deja, tumbado y a escala,
   * con su esquina en ESQUINA. Publica esa esquina y su radio para la escena
   * de «En tu negocio». Se repite al cambiar el tamaño de algo.
   */
  useEffect(() => {
    const esc = escenario.current;
    const col = columnaTelefono.current;
    const tel = telefono.current;
    if (!esc || !col || !tel) return;
    const medir = () => {
      const ancho = esc.clientWidth;
      const alto = esc.clientHeight;
      const w = tel.offsetWidth;
      const h = tel.offsetHeight;
      const centroX = col.offsetLeft + tel.offsetLeft + w / 2;
      const centroY = col.offsetTop + tel.offsetTop + h / 2;
      const e = window.innerWidth < 1024 ? ESCALA_VUELCO_MOVIL : ESCALA_VUELCO;
      const esquinaX = ESQUINA.x * ancho;
      const esquinaY = ESQUINA.y * alto;
      // La esquina de arriba a la derecha del marco, tras girar −90° y
      // escalar sobre el centro, queda a (−(½ − arriba)·h, −(½ − derecha)·w)·e
      // del centro: arriba a la izquierda del teléfono tumbado.
      xFinal.set(esquinaX - centroX + e * (0.5 - MARCO.arriba) * h);
      yFinal.set(esquinaY - centroY + e * (0.5 - MARCO.derecha) * w);
      publicarEsquinaTelefono({ x: esquinaX, y: esquinaY, radio: MARCO.radio * w * e });
    };
    const observador = new ResizeObserver(medir);
    observador.observe(esc);
    observador.observe(col);
    observador.observe(tel);
    medir();
    return () => {
      observador.disconnect();
      publicarEsquinaTelefono(null);
    };
  }, [reducir, xFinal, yFinal]);

  // Mientras el escenario está fijo, el botón de «Configurar cookies» se
  // esconde (tapaba la barra de pasos en móvil). Ver lib/relato-fijo.ts.
  useEffect(() => {
    const el = seccion.current;
    if (!el) return;
    return marcarRelato(el);
  }, [reducir]);

  const irA = useCallback(
    (i: number) => {
      const el = seccion.current;
      if (!el) return;
      const recorrido = el.offsetHeight - window.innerHeight;
      const top = window.scrollY + el.getBoundingClientRect().top + recorrido * ANCLAS[i] * FIN_PASOS;
      window.scrollTo({ top, behavior: reducir ? "auto" : "smooth" });
    },
    [reducir]
  );

  if (reducir) return <VersionQuieta />;

  return (
    <section
      ref={seccion}
      id="como-funciona"
      className={styles.seccion}
      style={{ height: `${ALTO_BOLSILLO_VH}vh` }}
      aria-labelledby="llamada-titulo"
    >
      <motion.div ref={escenario} className={styles.escenario} style={{ opacity: opacidadSalida, y: ySalida }}>
        <div className={styles.rejilla}>
          <motion.div className={styles.columnaTexto} style={{ opacity: opacidadTexto, y: yTexto, visibility: visTexto }}>
            <h2 id="llamada-titulo" className={styles.antetitulo}>
              En tu bolsillo
            </h2>
            <div className={styles.copias} aria-hidden="true">
              <Copia paso={PASOS[0]} y={copy1Y} visibility={vis1} p={sp} momentos={MOMENTOS[0]} />
              <Copia paso={PASOS[1]} y={copy2Y} visibility={vis2} p={sp} momentos={MOMENTOS[1]} />
              <Copia paso={PASOS[2]} y={copy3Y} visibility={vis3} p={sp} momentos={MOMENTOS[2]} />
            </div>
            <nav className={styles.barraPasos} aria-label="Pasos de la llamada">
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
          </motion.div>

          <div ref={columnaTelefono} className={styles.columnaTelefono} aria-hidden="true">
            <motion.span className={styles.brillo} style={{ opacity: opacidadTexto }} />
            <motion.p className={styles.rotulo} style={{ opacity: opacidadTexto, y: yTexto }}>
              <motion.span style={{ visibility: vis1 }}>{PASOS[0].pantalla}</motion.span>
              <motion.span style={{ visibility: vis2 }}>{PASOS[1].pantalla}</motion.span>
              <motion.span style={{ visibility: vis3 }}>{PASOS[2].pantalla}</motion.span>
            </motion.p>
            <motion.div
              ref={telefono}
              className={styles.telefono}
              style={{
                x,
                y,
                rotateY,
                rotateX,
                rotate,
                scale,
                originY,
                opacity: opacidadTelefono,
                transformPerspective: 1400,
              }}
            >
              <motion.div className={styles.sombra} style={{ scaleX: sombraX, opacity: sombraO }} />
              <div className={styles.hueco}>
                <span className={styles.isla} />
                <motion.div className={styles.capa} style={{ visibility: vis1 }}>
                  <Estado oscuro />
                  <PantallaLlamada p={sp} />
                </motion.div>
                <motion.div className={styles.capa} style={{ visibility: vis2 }}>
                  <Estado oscuro={false} />
                  <PantallaAgenda p={sp} />
                </motion.div>
                <motion.div className={styles.capa} style={{ visibility: vis3 }}>
                  <Estado oscuro={false} />
                  <PantallaWhatsApp p={sp} />
                </motion.div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- render local, el marco del teléfono */}
              <img src="/telefono/frente.webp" alt="" className={styles.marco} width={1335} height={2859} />
            </motion.div>
            {/* Móvil: el teléfono se corta por abajo con un degradado, que se
                va con el texto al empezar el vuelco. */}
            <motion.div className={styles.velo} style={{ opacity: opacidadTexto }} />
          </div>
        </div>
      </motion.div>

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
        <span className={styles.waAvatar}>
          {/* eslint-disable-next-line @next/next/no-img-element -- isotipo local */}
          <img src="/brand/alhabla-isotipo.svg" alt="" className={styles.waLogo} />
        </span>
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
        <Aparece p={p} a={0.71} className={styles.waBoton}>
          Guardar contacto
        </Aparece>
        <Aparece p={p} a={0.75} className={`${styles.waMensaje} ${styles.waMio}`}>
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
          En tu bolsillo: una llamada, de principio a fin.
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
