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
  PANTALLA_HTML,
  hayNegocioEnEscena,
  pantallaDelPortatil,
  publicarTelefono,
  type TelefonoTumbado,
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
 * teléfono se tumba en su sitio, se le apaga la pantalla (fase «Vuelco») y se
 * funde con la pantalla, también apagada, del portátil de «En tu negocio»,
 * que solapa a esta sección. El reparto de los tramos y cómo se encuentran
 * están en `lib/transicion-bolsillo-negocio.ts`.
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
 * FIN_VUELCO va el vuelco, hasta INICIO_CRUCE el estirado y el resto es el
 * cruce con «En tu negocio». Todo lo de arriba (costuras, momentos, anclas)
 * va sobre el progreso de los pasos, que es el de antes estirado a 0→1.
 */
const { finPasos: FIN_PASOS, finVuelco: FIN_VUELCO, inicioCruce: INICIO_CRUCE } = BOLSILLO_P;
/**
 * El cuerpo del teléfono dentro de su imagen (public/telefono/frente.svg),
 * sin los botones ni el margen transparente: alto como fracción del alto del
 * elemento (tumbado, es el ancho de la silueta), y su ancho y el radio de sus
 * esquinas como fracción de ese alto.
 */
const CUERPO_ALTO = 2704 / 2859;
const CUERPO = { ancho: 1290 / 2704, radio: 222 / 2704 } as const;
/**
 * Tumbado, la silueta del teléfono mide esto por el alto que tenía de pie:
 * crece un poco, para que la cámara de «En tu negocio» tenga de dónde
 * alejarse. En móvil, todo el ancho de la pantalla menos el margen.
 */
const CRECE_TUMBADO = 1.2;
/** Margen mínimo, en px, entre el teléfono tumbado y el borde del escenario. */
const MARGEN_TUMBADO = 32;

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
   * Vuelco (FIN_PASOS→FIN_VUELCO): el teléfono se tumba a −90° casi en su
   * sitio, crece un poco y queda apaisado (ver `medir`), que es donde «En tu
   * negocio» pondrá la pantalla del portátil.
   * Los giros en 3D se apagan, con un balanceo leve en Y a mitad de camino.
   * En la segunda mitad del giro su pantalla se apaga: negra, como la del
   * portátil que lo releva. Todo con easing cúbico, sobre el muelle.
   */
  const tVuelco = useTransform(s, [FIN_PASOS, FIN_VUELCO], [0, 1]);
  const tv = useTransform(tVuelco, cubico);
  // Dónde y a qué escala acaba el teléfono tumbado: depende del layout, se
  // mide (ver `medir`).
  const xFinal = useMotionValue(0);
  const yFinal = useMotionValue(0);
  const escalaFinal = useMotionValue(1);
  const rotateY = useTransform([giroY, tv], ([g, t]: number[]) => g * (1 - t) - 8 * Math.sin(Math.PI * t));
  const rotateX = useTransform([giroX, tv], ([g, t]: number[]) => g * (1 - t));
  const rotate = useTransform([inclina, tv], ([r, t]: number[]) => r - 90 * t);
  // A mitad del giro el teléfono encoge un poco: en diagonal es más ancho y
  // así no se mete en la columna del texto mientras este se va.
  const scale = useTransform(
    [zoom, tv, escalaFinal],
    ([z, t, ef]: number[]) => z * (1 + (ef - 1) * t) * (1 - 0.08 * Math.sin(Math.PI * t))
  );
  const x = useTransform([deriva, tv, xFinal], ([d, t, xf]: number[]) => d * (1 - t) + xf * t);
  const y = useTransform([subida, tv, yFinal], ([sb, t, yf]: number[]) => sb * (1 - t) + yf * t);
  const originY = useTransform(tVuelco, [0, 0.25], [0.36, 0.5]);
  // El texto, el rótulo y la barra de pasos se van mientras el teléfono
  // empieza a girar; la sombra del teléfono también.
  const opacidadTexto = useTransform(tVuelco, [0.05, 0.4], [1, 0]);
  const yTexto = useTransform(tVuelco, [0.05, 0.4], [0, -24]);
  const visTexto = useTransform(tVuelco, (t) => (t >= 0.4 ? "hidden" : "visible"));
  const pantallaApagada = useTransform(tVuelco, [0.4, 0.95], [0, 1]);
  // La sombra acompaña: se estrecha al girar y se aclara al subir.
  const sombraX = useTransform(giroY, (v) => 1 - Math.abs(v) / 60);
  const sombraO = useTransform([subida, tVuelco], ([sb, t]: number[]) => (1 - 0.2 * tramo(sb, 0, -14)) * (1 - tramo(t, 0, 0.3)));
  /**
   * Estirado (FIN_VUELCO→INICIO_CRUCE): sobre la silueta del teléfono tumbado
   * nace un rectángulo negro con sus mismas esquinas, que se estira hasta la
   * pantalla del portátil (`pantallaDelPortatil`), donde «En tu negocio» la
   * releva en el cruce. Va sobre el mismo muelle que el teléfono, así que no
   * se despegan aunque el scroll vaya a saltos; el teléfono se apaga debajo
   * al empezar. Sin escena 3D no hay relevo: el teléfono se queda.
   */
  const tEstirado = useTransform(s, [FIN_VUELCO, INICIO_CRUCE], [0, 1]);
  const te = useTransform(tEstirado, cubico);
  // Cada medida nueva (ver `medir`) cambia esto, para que el rectángulo se
  // recoloque aunque el scroll no se mueva.
  const tumbado = useRef<TelefonoTumbado | null>(null);
  const medida = useMotionValue(0);
  const relevo = useTransform([te, medida], ([t]: number[]) => {
    const tel = tumbado.current;
    if (!tel || !hayNegocioEnEscena()) return null;
    const pc = pantallaDelPortatil(tel);
    const mezcla = (a: number, b: number) => a + (b - a) * t;
    const ancho = mezcla(tel.ancho, pc.ancho);
    const alto = mezcla(tel.alto, pc.alto);
    const escalaPc = pc.ancho / PANTALLA_HTML.ancho;
    return {
      left: mezcla(tel.x, pc.x) - ancho / 2,
      top: mezcla(tel.y, pc.y) - alto / 2,
      width: ancho,
      height: alto,
      arriba: mezcla(tel.radio, PANTALLA_HTML.radioArriba * escalaPc),
      abajo: mezcla(tel.radio, PANTALLA_HTML.radioAbajo * escalaPc),
    };
  });
  const relevoDisplay = useTransform(relevo, (r) => (r && tEstirado.get() > 0 ? "block" : "none"));
  const relevoLeft = useTransform(relevo, (r) => r?.left ?? 0);
  const relevoTop = useTransform(relevo, (r) => r?.top ?? 0);
  const relevoWidth = useTransform(relevo, (r) => r?.width ?? 0);
  const relevoHeight = useTransform(relevo, (r) => r?.height ?? 0);
  const relevoRadio = useTransform(relevo, (r) =>
    r ? `${r.arriba}px ${r.arriba}px ${r.abajo}px ${r.abajo}px` : "0px"
  );
  const opacidadTelefono = useTransform(tEstirado, (t) => (hayNegocioEnEscena() ? 1 - tramo(t, 0, 0.2) : 1));

  // Barra de pasos: cada tramo se llena con su parte del progreso.
  const barra1 = useTransform(pp, [0, COSTURA_1], [0, 1]);
  const barra2 = useTransform(pp, [COSTURA_1, COSTURA_2], [0, 1]);
  const barra3 = useTransform(pp, [COSTURA_2, 1], [0, 1]);

  /**
   * Mide dónde descansa el teléfono dentro del escenario (que, pegado, ocupa
   * la pantalla) y calcula dónde y a qué escala queda tumbado: a la altura a
   * la que estaba, con su silueta apaisada CRECE_TUMBADO veces su alto de
   * pie y tan centrado en su columna como quepa sin salirse del escenario.
   * Lo publica para la escena de «En tu negocio». Se repite al cambiar el
   * tamaño de algo.
   */
  useEffect(() => {
    const esc = escenario.current;
    const col = columnaTelefono.current;
    const tel = telefono.current;
    if (!esc || !col || !tel) return;
    const medir = () => {
      const ancho = esc.clientWidth;
      const h = tel.offsetHeight;
      const centroX = col.offsetLeft + tel.offsetLeft + tel.offsetWidth / 2;
      const centroY = col.offsetTop + tel.offsetTop + h / 2;
      const cabe = Math.max(0, ancho - 2 * MARGEN_TUMBADO);
      const silueta = window.innerWidth < 1024 ? cabe : Math.min(cabe, CRECE_TUMBADO * CUERPO_ALTO * h);
      const e = h > 0 ? silueta / (CUERPO_ALTO * h) : 1;
      const x = Math.max(
        MARGEN_TUMBADO + silueta / 2,
        Math.min(centroX, ancho - MARGEN_TUMBADO - silueta / 2)
      );
      xFinal.set(x - centroX);
      yFinal.set(0);
      escalaFinal.set(e);
      tumbado.current = {
        x,
        y: centroY,
        ancho: silueta,
        alto: CUERPO.ancho * silueta,
        radio: CUERPO.radio * silueta,
      };
      publicarTelefono(tumbado.current);
      medida.set(medida.get() + 1);
    };
    const observador = new ResizeObserver(medir);
    observador.observe(esc);
    observador.observe(col);
    observador.observe(tel);
    medir();
    return () => {
      observador.disconnect();
      publicarTelefono(null);
    };
  }, [reducir, xFinal, yFinal, escalaFinal, medida]);

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
                <motion.div className={styles.apagada} style={{ opacity: pantallaApagada }} />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- render local, el marco del teléfono */}
              <img src="/telefono/frente.svg" alt="" className={styles.marco} width={1335} height={2859} />
            </motion.div>
            {/* Móvil: el teléfono se corta por abajo con un degradado, que se
                va con el texto al empezar el vuelco. */}
            <motion.div className={styles.velo} style={{ opacity: opacidadTexto }} />
          </div>
        </div>
        <motion.div
          className={styles.relevo}
          aria-hidden="true"
          style={{
            display: relevoDisplay,
            left: relevoLeft,
            top: relevoTop,
            width: relevoWidth,
            height: relevoHeight,
            borderRadius: relevoRadio,
          }}
        />
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
