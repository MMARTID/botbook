"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bot,
  CalendarDays,
  Check,
  CreditCard,
  LayoutDashboard,
  MessageSquareText,
  Mic,
  PhoneCall,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { SiWhatsapp } from "@icons-pack/react-simple-icons";

import { useMovimientoReducido } from "@/hooks/use-movimiento-reducido";
import type { OwnerAssistant } from "@/lib/niche-landings";
import { MODELO } from "@/lib/portatil-3d";
import { Reveal } from "@/components/scroll-reveal";
import type { PortatilMontado } from "./gestor-mac-escena";
import styles from "./gestor-simulacion.module.css";

/**
 * «Y cuando algo cambia, se lo dices por WhatsApp» (2026-09-30): el Gestor
 * en acción. A la derecha, el iPhone con el WhatsApp del dueño (el mismo
 * render de «En tu bolsillo»); detrás, el portátil 3D de «En tu negocio» con
 * el panel reaccionando a cada cambio. La conversación se reproduce sola,
 * turno a turno, cuando la sección está a la vista, y encadena las tres
 * situaciones de `data.examples`; los botones de la cabecera saltan a una.
 *
 * Los tres guiones reproducen acciones REALES del Gestor
 * (`backend/src/modules/gestor/`): `marcar_ausencia` + `mover_cita` +
 * `avisar_cliente` (una profesional de baja), `cerrar_dia` (un festivo) y
 * `editar_servicio` (un precio). Los textos siguen el patrón del código:
 * el Gestor PROPONE («¿Confirmas? …» con Confirmar · Cancelar) y solo el
 * botón ejecuta; tras mover una cita pregunta «¿Le aviso…?» con «Sí,
 * avísale» · «Le llamo yo». Nada cambia sin pulsar Confirmar.
 *
 * Mecánica: `beat` es cuántos turnos van a la vista; un cronómetro lo
 * avanza con la espera de cada turno y, al acabar, pasa a la siguiente
 * situación. Se para fuera de pantalla y con la pestaña oculta. Con
 * movimiento reducido no hay cronómetro: cada situación se enseña entera.
 * Los hitos (`hito` en un turno) son los cambios que el panel refleja.
 *
 * El portátil es three.js y se monta al acercarse (import dinámico). En
 * móvil no se monta: allí manda el teléfono y lo que cambió en el panel se
 * resume en los chips de debajo.
 */

type Hito = "ausente" | "movida" | "avisada" | "cerrado" | "precio";

type Turno =
  | { de: "dueno"; texto: string; hora: string; espera: number; hito?: Hito }
  | { de: "boton"; texto: string; hora: string; espera: number; hito?: Hito }
  | {
      de: "gestor";
      texto: string;
      hora: string;
      botones?: [string, string];
      espera: number;
      hito?: Hito;
    }
  | { de: "escribiendo"; espera: number };

type Escenario = {
  id: "ausencia" | "cierre" | "precio";
  /** Hora del reloj del teléfono y del portátil. */
  reloj: string;
  /** `espera`: ms que pasan después de que el turno aparezca. */
  turnos: Turno[];
  /** Lo que enseña el panel al alcanzar cada hito (y los chips de móvil). */
  avisos: Partial<Record<Hito, { titulo: string; detalle: string }>>;
};

/** En el orden de `data.examples` de la landing principal. */
const ESCENARIOS: [Escenario, Escenario, Escenario] = [
  {
    id: "ausencia",
    reloj: "8:41",
    turnos: [
      { de: "dueno", texto: "Ana está de baja hoy", hora: "8:41", espera: 900 },
      { de: "escribiendo", espera: 1100 },
      {
        de: "gestor",
        texto:
          "¿Confirmas? Marcar a Ana como ausente hoy (baja): la recepcionista no le reservará nada. Ojo: ya tiene 1 cita ahí, que no se mueve sola.",
        botones: ["Confirmar", "Cancelar"],
        hora: "8:41",
        espera: 2800,
      },
      { de: "boton", texto: "Confirmar", hora: "8:42", espera: 700, hito: "ausente" },
      { de: "escribiendo", espera: 1000 },
      {
        de: "gestor",
        texto:
          "Hecho: Ana no está hoy. Su cita de las 11:00 es Carmen R., corte y peinado, y Lucía tiene hueco a esa hora. ¿Confirmas? Mover la cita de Carmen R. a Lucía, hoy a las 11:00.",
        botones: ["Confirmar", "Cancelar"],
        hora: "8:42",
        espera: 3400,
      },
      { de: "boton", texto: "Confirmar", hora: "8:42", espera: 700, hito: "movida" },
      { de: "escribiendo", espera: 1000 },
      {
        de: "gestor",
        texto:
          "Hecho: la cita de Carmen R. pasa a las 11:00 con Lucía. El calendario ya está al día. ¿Le aviso a Carmen por WhatsApp del cambio?",
        botones: ["Sí, avísale", "Le llamo yo"],
        hora: "8:43",
        espera: 2600,
      },
      { de: "boton", texto: "Sí, avísale", hora: "8:43", espera: 700 },
      { de: "escribiendo", espera: 800 },
      {
        de: "gestor",
        texto: "Avisada: Carmen ya sabe que hoy la atiende Lucía.",
        hora: "8:43",
        espera: 0,
        hito: "avisada",
      },
    ],
    avisos: {
      ausente: { titulo: "Ana, ausente hoy", detalle: "Baja · sin citas nuevas" },
      movida: { titulo: "Cita movida a Lucía", detalle: "Carmen R. · 11:00" },
      avisada: { titulo: "Carmen R. avisada", detalle: "WhatsApp enviado" },
    },
  },
  {
    id: "cierre",
    reloj: "20:12",
    turnos: [
      { de: "dueno", texto: "El lunes 12 cerramos, es festivo", hora: "20:12", espera: 900 },
      { de: "escribiendo", espera: 1100 },
      {
        de: "gestor",
        texto:
          "¿Confirmas? Cerrar el lunes 12 de octubre (festivo): la recepcionista no reservará ese día.",
        botones: ["Confirmar", "Cancelar"],
        hora: "20:12",
        espera: 2400,
      },
      { de: "boton", texto: "Confirmar", hora: "20:12", espera: 700, hito: "cerrado" },
      { de: "escribiendo", espera: 1000 },
      {
        de: "gestor",
        texto:
          "Hecho: el lunes 12 de octubre queda cerrado. No tenías citas ese día; a quien llame, la recepcionista le ofrecerá otro.",
        hora: "20:13",
        espera: 0,
      },
    ],
    avisos: {
      cerrado: { titulo: "Lunes 12 de octubre, cerrado", detalle: "Festivo · día especial" },
    },
  },
  {
    id: "precio",
    reloj: "20:15",
    turnos: [
      { de: "dueno", texto: "El corte de caballero sube a 18 €", hora: "20:15", espera: 900 },
      { de: "escribiendo", espera: 1100 },
      {
        de: "gestor",
        texto: "¿Confirmas? El servicio Corte caballero: 18 € (ahora 15 €).",
        botones: ["Confirmar", "Cancelar"],
        hora: "20:15",
        espera: 2200,
      },
      { de: "boton", texto: "Confirmar", hora: "20:15", espera: 700, hito: "precio" },
      { de: "escribiendo", espera: 1000 },
      {
        de: "gestor",
        texto:
          "Hecho: Corte caballero, 30 min, 18 €. La recepcionista ya lo dice así por teléfono.",
        hora: "20:16",
        espera: 0,
      },
    ],
    avisos: {
      precio: { titulo: "Corte caballero: 18 €", detalle: "Antes 15 € · catálogo al día" },
    },
  },
];

/** Tamaño de la pantalla del portátil (px CSS) antes de proyectarla. */
const PANTALLA_W = 1200;
const PANTALLA_H = 776;
/** Antes del primer turno de una situación y después del último. */
const PAUSA_INICIAL = 800;
const PAUSA_FINAL = 4200;
/** A qué distancia de la pantalla se empieza a descargar three.js. */
const MARGEN_DE_CARGA = "60% 0px";

function hitosAlcanzados(escenario: Escenario, beat: number): Hito[] {
  const hitos: Hito[] = [];
  for (const turno of escenario.turnos.slice(0, beat)) {
    if ("hito" in turno && turno.hito) hitos.push(turno.hito);
  }
  return hitos;
}

export function GestorSimulacionSection({ data }: { data: OwnerAssistant }) {
  // Con movimiento reducido, la versión quieta llega tras montar: el servidor
  // no sabe la preferencia (ver useMovimientoReducido).
  const reducir = useMovimientoReducido();
  const escenarioEl = useRef<HTMLDivElement>(null);
  const macEl = useRef<HTMLDivElement>(null);
  const lienzoEl = useRef<HTMLDivElement>(null);
  const pantallaEl = useRef<HTMLDivElement>(null);
  const portatil = useRef<PortatilMontado | null>(null);
  const [escenario, setEscenario] = useState(0);
  const [beat, setBeat] = useState(0);
  const [aLaVista, setALaVista] = useState(false);
  const [pestanaVisible, setPestanaVisible] = useState(true);
  const [sinMac, setSinMac] = useState(false);

  const activo = aLaVista && pestanaVisible;
  const actual = ESCENARIOS[escenario];
  const total = actual.turnos.length;
  const hitos = hitosAlcanzados(actual, beat);
  // El cronómetro y el portátil leen estos dos sin volver a suscribirse.
  const activoRef = useRef(activo);
  activoRef.current = activo;
  const reducirRef = useRef(reducir);
  reducirRef.current = reducir;

  // Solo corre con el escenario a la vista y la pestaña delante.
  useEffect(() => {
    const el = escenarioEl.current;
    if (!el) return;
    const enPantalla = new IntersectionObserver(
      ([entrada]) => setALaVista(entrada.isIntersecting),
      { threshold: 0.35 }
    );
    enPantalla.observe(el);
    const alCambiarPestana = () => setPestanaVisible(!document.hidden);
    document.addEventListener("visibilitychange", alCambiarPestana);
    return () => {
      enPantalla.disconnect();
      document.removeEventListener("visibilitychange", alCambiarPestana);
    };
  }, []);

  // Movimiento reducido: la situación entera a la vista, sin cronómetro.
  useEffect(() => {
    if (reducir) setBeat(total);
  }, [reducir, total]);

  // El cronómetro: cada turno espera lo suyo; al acabar, siguiente situación.
  useEffect(() => {
    if (reducir || !activo) return;
    const espera =
      beat === 0
        ? PAUSA_INICIAL
        : beat >= total
          ? PAUSA_FINAL
          : actual.turnos[beat - 1].espera;
    const id = window.setTimeout(() => {
      if (beat >= total) {
        setEscenario((e) => (e + 1) % ESCENARIOS.length);
        setBeat(0);
      } else {
        setBeat((b) => b + 1);
      }
    }, espera);
    return () => window.clearTimeout(id);
  }, [reducir, activo, beat, total, actual]);

  // El portátil 3D: solo en escritorio, y solo cuando la sección se acerca.
  useEffect(() => {
    const raiz = macEl.current;
    const lienzo = lienzoEl.current;
    const pantalla = pantallaEl.current;
    if (!raiz || !lienzo || !pantalla) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    let cancelado = false;
    const cerca = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        cerca.disconnect();
        import("./gestor-mac-escena")
          .then(({ montarPortatil }) => {
            if (cancelado) return;
            // Sin WebGL, `montarPortatil` lanza; si el modelo no llega,
            // avisa después. En los dos casos, la pantalla plana.
            const montado = montarPortatil({
              lienzo,
              pantallaHtml: pantalla,
              anchoHtml: PANTALLA_W,
              altoHtml: PANTALLA_H,
              alFallar: () => {
                if (!cancelado) setSinMac(true);
              },
            });
            portatil.current = montado;
            if (activoRef.current) montado.abrir(!reducirRef.current);
          })
          .catch(() => {
            if (!cancelado) setSinMac(true);
          });
      },
      { rootMargin: MARGEN_DE_CARGA }
    );
    cerca.observe(raiz);
    return () => {
      cancelado = true;
      cerca.disconnect();
      portatil.current?.desmontar();
      portatil.current = null;
    };
  }, []);

  // La tapa se abre la primera vez que la sección está a la vista.
  useEffect(() => {
    if (activo) portatil.current?.abrir(!reducir);
  }, [activo, reducir]);

  // Pantalla plana (sin 3D): a la escala que quepa en el hueco.
  useEffect(() => {
    if (!sinMac) return;
    const raiz = macEl.current;
    if (!raiz) return;
    const medir = () => {
      const r = raiz.getBoundingClientRect();
      raiz.style.setProperty(
        "--k",
        String(Math.min(r.width / PANTALLA_W, r.height / PANTALLA_H))
      );
    };
    const alCambiarTamano = new ResizeObserver(medir);
    alCambiarTamano.observe(raiz);
    medir();
    return () => alCambiarTamano.disconnect();
  }, [sinMac]);

  const elegir = (i: number) => {
    setEscenario(i);
    setBeat(reducir ? ESCENARIOS[i].turnos.length : 0);
  };

  return (
    <section className={styles.seccion} aria-labelledby="gestor-titulo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={styles.cabecera}>
          <Reveal>
            <span className="badge-soft gap-2">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {data.badge}
            </span>
            <h2 id="gestor-titulo" className={styles.titulo}>
              {data.title}
            </h2>
            <p className={styles.descripcion}>{data.description}</p>
          </Reveal>

          <Reveal delay={0.1} y={12}>
            <div className={styles.situaciones} role="group" aria-label="Situaciones de ejemplo">
              {data.examples.map((ejemplo, i) => (
                <button
                  key={ejemplo.title}
                  type="button"
                  className={styles.situacion}
                  aria-pressed={i === escenario}
                  onClick={() => elegir(i)}
                  style={{ "--p": i === escenario ? beat / total : 0 } as CSSProperties}
                >
                  <span className={styles.situacionNumero}>0{i + 1}</span>
                  <span className={styles.situacionTitulo}>{ejemplo.title}</span>
                  <span className={styles.situacionTexto}>
                    <span>{ejemplo.description}</span>
                  </span>
                  <span className={styles.progreso} aria-hidden="true">
                    <span />
                  </span>
                </button>
              ))}
            </div>
          </Reveal>
        </div>

        <div ref={escenarioEl} className={styles.escenario} aria-hidden="true">
          <div ref={macEl} className={styles.mac} data-plana={sinMac ? "" : undefined}>
            <div ref={lienzoEl} className={styles.lienzo} />
            <div ref={pantallaEl} className={styles.pantalla}>
              <PantallaMac escenario={actual} hitos={hitos} />
            </div>
          </div>

          <div className={styles.telefono}>
            <span className={styles.sombraTelefono} />
            <div className={styles.hueco}>
              <span className={styles.isla} />
              <div className={styles.estado}>
                <span>{actual.reloj}</span>
                <span>5G</span>
              </div>
              <PantallaWhatsApp escenario={actual} beat={beat} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- render local, el marco del teléfono */}
            <img src="/telefono/frente.webp" alt="" className={styles.marco} width={1335} height={2859} />
          </div>
        </div>

        <ul className={styles.hechos} aria-hidden="true">
          {hitos.map((hito) => (
            <li key={`${actual.id}-${hito}`} className={styles.hecho}>
              <Check strokeWidth={2.5} aria-hidden="true" />
              {actual.avisos[hito]?.titulo}
            </li>
          ))}
        </ul>

        <Reveal y={8}>
          <p className={styles.cierre}>{data.closing}</p>
        </Reveal>
        {/* Crédito que exige la licencia CC BY 4.0 del modelo: no quitar. */}
        <p className={styles.credito}>
          Modelo 3D{" "}
          <a href={MODELO.origen} target="_blank" rel="noopener noreferrer">
            «{MODELO.titulo}»
          </a>
          , de{" "}
          <a href={MODELO.autor} target="_blank" rel="noopener noreferrer">
            jackbaeten
          </a>{" "}
          (
          <a href={MODELO.licencia} target="_blank" rel="noopener noreferrer">
            CC BY 4.0
          </a>
          ), sin el logo y con la pantalla de Alhabla.
        </p>
      </div>

      {/* Las tres conversaciones, para quien no ve la simulación. */}
      <ol className="sr-only">
        {ESCENARIOS.map((esc, i) => (
          <li key={esc.id}>
            <strong>{data.examples[i].title}.</strong>{" "}
            {esc.turnos
              .filter((t): t is Exclude<Turno, { de: "escribiendo" }> => t.de !== "escribiendo")
              .map((t) => `${t.de === "gestor" ? "Alhabla" : "Tú"}: ${t.texto}`)
              .join(" ")}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── El WhatsApp del dueño ───────────────────────────────────────── */

function PantallaWhatsApp({ escenario, beat }: { escenario: Escenario; beat: number }) {
  const visibles = escenario.turnos.slice(0, beat);
  return (
    <div className={styles.wa}>
      <div className={styles.waCabecera}>
        <span className={styles.waAvatar}>
          {/* eslint-disable-next-line @next/next/no-img-element -- isotipo local */}
          <img src="/brand/alhabla-isotipo.svg" alt="" className={styles.waLogo} />
        </span>
        <div>
          <p className={styles.waNombre}>Alhabla</p>
          <p className={styles.waSub}>Cuenta de empresa</p>
        </div>
      </div>
      <div className={styles.waChat}>
        <span className={styles.waFecha}>Hoy</span>
        {visibles.map((turno, i) => {
          // La clave lleva la situación: al cambiar, las burbujas vuelven a
          // entrar con su animación.
          const clave = `${escenario.id}-${i}`;
          if (turno.de === "escribiendo") {
            // Los puntos solo mientras el Gestor «escribe»: el turno
            // siguiente los sustituye.
            return i === beat - 1 ? (
              <div key={clave} className={styles.escribiendo}>
                <i />
                <i />
                <i />
              </div>
            ) : null;
          }
          if (turno.de === "dueno" || turno.de === "boton") {
            return (
              <div key={clave} className={`${styles.burbuja} ${styles.burbujaDueno}`}>
                {turno.texto}
                <span className={styles.hora}>{turno.hora} ✓✓</span>
              </div>
            );
          }
          // Botones bajo la propuesta; cuando el dueño pulsa uno (el turno
          // siguiente), se queda marcado y el otro se apaga.
          const siguiente = escenario.turnos[i + 1];
          const pulsado =
            turno.botones && siguiente?.de === "boton" && beat > i + 1 ? siguiente.texto : null;
          return (
            <Fragment key={clave}>
              <div className={`${styles.burbuja} ${styles.burbujaGestor}`}>
                {turno.texto}
                <span className={styles.hora}>{turno.hora}</span>
              </div>
              {turno.botones ? (
                <div className={styles.botones}>
                  {turno.botones.map((boton) => (
                    <span
                      key={boton}
                      className={styles.boton}
                      data-pulsado={pulsado === boton ? "" : undefined}
                      data-descartado={pulsado && pulsado !== boton ? "" : undefined}
                    >
                      {boton}
                    </span>
                  ))}
                </div>
              ) : null}
            </Fragment>
          );
        })}
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

/* ── El panel del negocio (pantalla del portátil) ────────────────── */

function Item({
  icono: Icono,
  activo,
  children,
}: {
  icono: LucideIcon;
  activo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.item} data-activo={activo ? "" : undefined}>
      <Icono strokeWidth={2} />
      {children}
    </div>
  );
}

function PantallaMac({ escenario, hitos }: { escenario: Escenario; hitos: Hito[] }) {
  const ultimo = hitos[hitos.length - 1];
  const aviso = ultimo ? escenario.avisos[ultimo] : undefined;
  const enAgenda = escenario.id === "ausencia";
  return (
    <>
      <div className={styles.menu}>
        <b>Alhabla</b>
        <span>Archivo</span>
        <span>Editar</span>
        <span>Ver</span>
        <span>Ventana</span>
        <i className={styles.notch} />
        <span className={styles.menuHora}>Mié {escenario.reloj}</span>
      </div>
      <div className={styles.app}>
        <aside className={styles.lateral}>
          <div className={styles.marca}>
            {/* eslint-disable-next-line @next/next/no-img-element -- isotipo local, dentro de la pantalla proyectada */}
            <img src="/brand/alhabla-isotipo.svg" alt="" />
            <div>
              <b>Alhabla</b>
              <small>Peluquería Nuria</small>
            </div>
          </div>
          <p className={styles.grupo}>OPERACIÓN</p>
          <Item icono={LayoutDashboard}>Panel</Item>
          <Item icono={CalendarDays} activo={enAgenda}>
            Agenda
          </Item>
          <Item icono={PhoneCall}>Llamadas</Item>
          <p className={styles.grupo}>RECEPCIONISTA</p>
          <Item icono={Bot} activo={!enAgenda}>
            Agente
          </Item>
          <Item icono={MessageSquareText}>Gestor</Item>
          <div className={styles.pie}>
            <p className={styles.grupo}>CUENTA</p>
            <Item icono={Settings}>Ajustes</Item>
            <Item icono={CreditCard}>Facturación</Item>
          </div>
        </aside>
        <div className={styles.principal}>
          {enAgenda ? (
            <VistaAgenda hitos={hitos} />
          ) : (
            <VistaAgente seccion={escenario.id === "cierre" ? "horario" : "servicios"} hitos={hitos} />
          )}
          {aviso ? (
            <div key={`${escenario.id}-${ultimo}`} className={styles.aviso}>
              <SiWhatsapp color="#25D366" aria-hidden="true" />
              <div>
                <b>{aviso.titulo}</b>
                <small>{aviso.detalle} · desde WhatsApp</small>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* 1 · La agenda de hoy, por profesional. Filas de media hora desde las 9:00. */

const PROFESIONALES = ["Ana", "Marta", "Lucía"] as const;
const FILAS_DE_MEDIA_HORA = 10;
const CITAS = [
  { col: 1, inicio: 2, filas: 4, titulo: "Mechas", cliente: "Elena S." },
  { col: 1, inicio: 7, filas: 1, titulo: "Corte caballero", cliente: "Sergio P." },
  { col: 2, inicio: 1, filas: 3, titulo: "Alisado", cliente: "Rosa M." },
  { col: 2, inicio: 8, filas: 2, titulo: "Peinado", cliente: "Paula V." },
] as const;
/** La cita de Ana que se mueve a Lucía (misma hora: las 11:00). */
const CITA_DE_CARMEN = { inicio: 4, filas: 2, titulo: "Corte y peinado", cliente: "Carmen R." };

function VistaAgenda({ hitos }: { hitos: Hito[] }) {
  const ausente = hitos.includes("ausente");
  const movida = hitos.includes("movida");
  const avisada = hitos.includes("avisada");
  const celdas: ReactNode[] = [];
  for (let fila = 0; fila < FILAS_DE_MEDIA_HORA; fila++) {
    if (fila % 2 === 0) {
      celdas.push(
        <span key={`h${fila}`} className={styles.horaEtiqueta} style={{ gridRow: fila + 1 }}>
          {9 + fila / 2}:00
        </span>
      );
    }
    for (let col = 0; col < PROFESIONALES.length; col++) {
      celdas.push(
        <i
          key={`c${fila}-${col}`}
          className={styles.celda}
          style={{ gridColumn: col + 2, gridRow: fila + 1 }}
          data-media={fila % 2 ? "" : undefined}
          data-ausente={ausente && col === 0 ? "" : undefined}
        />
      );
    }
  }
  const carmen = (
    <>
      <b>{CITA_DE_CARMEN.titulo}</b>
      <small>{CITA_DE_CARMEN.cliente} · 11:00 – 12:00</small>
    </>
  );
  return (
    <>
      <header className={styles.cab}>
        <span className={styles.ico}>
          <CalendarDays strokeWidth={2} />
        </span>
        <div>
          <p className={styles.h1}>Agenda</p>
          <p>Las citas que ha reservado tu recepcionista y las que has apuntado tú.</p>
        </div>
      </header>
      <div className={styles.barra}>
        <span className={`${styles.chip} ${styles.chipActivo}`}>Hoy</span>
        <span className={styles.chip}>7 días</span>
        <span className={styles.chip}>30 días</span>
        <span className={styles.diaActual}>Miércoles, 30 de septiembre</span>
      </div>
      <div className={styles.agenda}>
        <div className={styles.columnas}>
          <span />
          {PROFESIONALES.map((nombre, col) => (
            <div key={nombre} className={styles.columnaCab} data-ausente={ausente && col === 0 ? "" : undefined}>
              {nombre}
              {ausente && col === 0 ? <span className={styles.chip}>Ausente hoy · baja</span> : null}
            </div>
          ))}
        </div>
        <div className={styles.rejilla}>
          {celdas}
          {CITAS.map((cita) => (
            <div
              key={cita.cliente}
              className={`${styles.cita} ${styles.citaGris}`}
              style={{ gridColumn: cita.col + 2, gridRow: `${cita.inicio + 1} / span ${cita.filas}` }}
            >
              <b>{cita.titulo}</b>
              <small>{cita.cliente}</small>
            </div>
          ))}
          {/* En la columna de Ana hasta que se mueve; entonces entra en la
              de Lucía, a la misma hora. */}
          <div
            className={styles.cita}
            style={{ gridColumn: 2, gridRow: `${CITA_DE_CARMEN.inicio + 1} / span ${CITA_DE_CARMEN.filas}` }}
            data-huerfana={ausente && !movida ? "" : undefined}
            data-sale={movida ? "" : undefined}
          >
            {carmen}
            {ausente && !movida ? <small>Sin quien la atienda</small> : null}
          </div>
          {movida ? (
            <div
              className={styles.cita}
              style={{ gridColumn: 4, gridRow: `${CITA_DE_CARMEN.inicio + 1} / span ${CITA_DE_CARMEN.filas}` }}
              data-entra=""
            >
              {carmen}
              {avisada ? (
                <span className={styles.etiquetaWa}>
                  <SiWhatsapp aria-hidden="true" />
                  Avisada
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* 2 y 3 · «Tu agente»: el horario (con sus días especiales) y los servicios. */

const SEMANA = [
  ["Lunes", "10:00 – 14:00 · 16:00 – 20:00"],
  ["Martes", "10:00 – 14:00 · 16:00 – 20:00"],
  ["Miércoles", "10:00 – 14:00 · 16:00 – 20:00"],
  ["Jueves", "10:00 – 14:00 · 16:00 – 20:00"],
  ["Viernes", "10:00 – 14:00 · 16:00 – 21:00"],
  ["Sábado", "9:30 – 14:00"],
  ["Domingo", null],
] as const;

const SERVICIOS = [
  { nombre: "Corte caballero", duracion: 30, precio: 15, cambia: true },
  { nombre: "Corte señora", duracion: 45, precio: 24 },
  { nombre: "Corte y color", duracion: 90, precio: 58 },
  { nombre: "Mechas", duracion: 120, precio: 75 },
  { nombre: "Alisado", duracion: 90, precio: 65 },
  { nombre: "Peinado", duracion: 45, precio: 22 },
] as const;

function VistaAgente({ seccion, hitos }: { seccion: "horario" | "servicios"; hitos: Hito[] }) {
  return (
    <>
      <header className={styles.cab}>
        <span className={styles.ico}>
          <Bot strokeWidth={2} />
        </span>
        <div>
          <p className={styles.h1}>Tu agente</p>
          <p>Configura cómo atiende, qué puede reservar y qué información utiliza al hablar con tus clientes.</p>
        </div>
        <span className={styles.botonPanel}>Probar el agente</span>
      </header>
      {seccion === "horario" ? (
        <VistaHorario cerrado={hitos.includes("cerrado")} />
      ) : (
        <VistaServicios cambiado={hitos.includes("precio")} />
      )}
    </>
  );
}

function VistaHorario({ cerrado }: { cerrado: boolean }) {
  return (
    <div className={styles.seccionPanel}>
      <p className={styles.h2}>Disponibilidad</p>
      <p>Define cuándo puede reservar tu recepcionista y cuántas citas puede confirmar a la vez.</p>
      <div className={styles.dosTarjetas}>
        <div className={`${styles.tarjeta} ${styles.tarjetaCuerpo}`}>
          <div className={styles.tarjetaCab}>
            <div>
              <p className={styles.h2}>Horario de apertura</p>
              <p>Solo ofrece huecos dentro de estas horas.</p>
            </div>
            <span className={`${styles.chip} ${styles.chipOk}`}>Sincronizado</span>
          </div>
          <div className={styles.semana}>
            {SEMANA.map(([dia, tramos]) => (
              <div key={dia} className={styles.diaFila}>
                <b>{dia}</b>
                {tramos ? <span>{tramos}</span> : <span className={styles.diaCerrado}>Cerrado</span>}
              </div>
            ))}
          </div>
        </div>
        <div className={`${styles.tarjeta} ${styles.tarjetaCuerpo}`}>
          <div className={styles.tarjetaCab}>
            <div>
              <p className={styles.h2}>Días especiales</p>
              <p>Cierres y horarios distintos a los de la semana.</p>
            </div>
          </div>
          <div className={styles.especiales}>
            <div className={styles.especial}>
              <span className={styles.fecha}>
                JUE<b>1</b>
              </span>
              <div>
                <b>Jueves 1 de octubre</b>
                <small>10:00 – 14:00 · 16:00 – 18:00</small>
              </div>
              <span className={styles.chip}>Cierra antes</span>
            </div>
            {cerrado ? (
              <div className={styles.especial} data-nuevo="">
                <span className={styles.fecha}>
                  LUN<b>12</b>
                </span>
                <div>
                  <b>Lunes 12 de octubre</b>
                  <small>Festivo</small>
                </div>
                <span className={`${styles.chip} ${styles.chipMorado}`}>Cerrado</span>
              </div>
            ) : null}
            <span className={styles.anadir}>
              <Plus strokeWidth={2.5} />
              Añadir día especial
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VistaServicios({ cambiado }: { cambiado: boolean }) {
  return (
    <div className={styles.seccionPanel}>
      <p className={styles.h2}>Catálogo y equipo</p>
      <p>Los servicios y las personas disponibles determinan qué puede ofrecer y reservar por teléfono.</p>
      <div className={`${styles.tarjeta} ${styles.tarjetaCuerpo}`} style={{ marginTop: 14 }}>
        <div className={styles.tarjetaCab}>
          <div>
            <p className={styles.h2}>Servicios</p>
            <p>Lo que la recepcionista puede ofrecer, con su duración y su precio.</p>
          </div>
          <span className={styles.chip}>{SERVICIOS.length} activos</span>
        </div>
        <div className={styles.servicios}>
          {SERVICIOS.map((servicio) => {
            const esteCambia = "cambia" in servicio && cambiado;
            return (
              <div key={servicio.nombre} className={styles.servicioFila} data-cambiado={esteCambia ? "" : undefined}>
                <div>
                  <b>{servicio.nombre}</b>
                  <small>Todo el equipo</small>
                </div>
                <span className={styles.duracion}>{servicio.duracion} min</span>
                <span className={styles.precio}>
                  {esteCambia ? (
                    <>
                      <s className={styles.precioViejo}>{servicio.precio} €</s>
                      <span className={styles.precioNuevo}>18 €</span>
                    </>
                  ) : (
                    `${servicio.precio} €`
                  )}
                </span>
                <span className={`${styles.chip} ${styles.chipOk}`}>Activo</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
