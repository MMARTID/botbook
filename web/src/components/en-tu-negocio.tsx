"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check } from "lucide-react";

import { useMovimientoReducido } from "@/hooks/use-movimiento-reducido";
import { PantallaBloqueo } from "@/components/pantalla-bloqueo";
import type { NicheAccent } from "@/lib/niche-landings";
import { MODELO } from "@/lib/portatil-3d";
import { GUION_GENERAL, relato, type GuionRelato } from "@/lib/relato-guiones";
import { marcarRelato } from "@/lib/relato-fijo";
import {
  ALTO_NEGOCIO_VH,
  NEGOCIO_P,
  SOLAPE_NEGOCIO_VH,
} from "@/lib/transicion-bolsillo-negocio";
import "./en-tu-negocio.css";

/**
 * «En tu negocio» de la portada (2026-09-29): va justo después de «En tu
 * bolsillo» (`llamada-scroll.tsx`) y enseña el otro lado, lo que ve el dueño.
 * Diseño hecho en Claude Design.
 *
 * Misma mecánica que «En tu bolsillo»: sección alta con escenario fijo y todo
 * colgado del progreso del scroll. Aquí el protagonista es un portátil en 3D
 * (three.js) que se abre con el scroll; en su pantalla, en HTML proyectado
 * sobre la tapa, pasan el panel, el detalle de una llamada y el asistente.
 *
 * React pinta todo el marcado (los textos están en el HTML del servidor y en
 * la lista `sr-only`); el movimiento vive en `en-tu-negocio-escena.ts`, que se
 * importa de forma dinámica cuando la sección se acerca para que three.js no
 * pese en la carga de la portada. Con `prefers-reduced-motion`, o si el
 * navegador no tiene WebGL, se pinta una versión quieta con los tres pasos.
 *
 * Desde el 2026-09-30 la sección solapa el final de «En tu bolsillo» (margen
 * negativo, ver `lib/transicion-bolsillo-negocio.ts`): su escenario fijo se
 * pone encima del teléfono tumbado, transparente; la pantalla apagada del
 * portátil nace sobre la silueta del teléfono y se estira hasta su sitio, el
 * portátil (ya abierto) se enciende alrededor, y la cámara se aleja hasta el
 * encuadre del paso 1 mientras entra el título. Por eso el texto, el rótulo y
 * el crédito empiezan invisibles (CSS) y los enciende la escena.
 * La versión quieta no solapa nada.
 *
 * El CSS (`en-tu-negocio.css`) es global pero va todo colgado de
 * `.ng-seccion`, para que sus clases cortas (`.mx-*`, `.ok`…) no se salgan de
 * la sección.
 *
 * Los teléfonos del panel son ficticios: empiezan por 79, un rango sin
 * atribuir en el Plan Nacional de Numeración (la CNMC lo guarda para móviles
 * futuros), así que no son de nadie. Nada de números reales, ni de clientes ni
 * de Alhabla.
 */

type PasoCopy = {
  numero: string;
  etiqueta: string;
  pantalla: string;
  titulo: string;
  texto: string;
  detalles: [string, string, string];
};

/** El copy de los tres pasos, con los nombres y el vocabulario del guion. */
function pasosDe(g: GuionRelato): [PasoCopy, PasoCopy, PasoCopy] {
  return [
    {
      numero: "01",
      etiqueta: "Tu panel",
      pantalla: "Panel",
      titulo: "Abres el portátil y ya sabes cómo va el día.",
      texto:
        "El panel te enseña de un vistazo si la recepción está atendiendo, cuántas llamadas ha cogido y qué citas vienen.",
      detalles: [
        "Estado de la recepción, tu número y el desvío",
        "Citas, llamadas e ingresos de los últimos 7 días",
        "Próximas citas y llamadas recientes en la misma pantalla",
      ],
    },
    {
      numero: "02",
      etiqueta: "Llamadas",
      pantalla: "Detalle de una llamada",
      titulo: "Cada llamada, con su grabación y su transcripción.",
      texto: `Abre la llamada de ${g.cliente.nombre} y ves qué pidió, por qué se le ofreció esa hora y la cita que salió de ella.`,
      detalles: [
        "La grabación completa, para escucharla cuando quieras",
        "La transcripción turno a turno",
        "La cita que salió de la llamada, ya vinculada",
      ],
    },
    {
      numero: "03",
      etiqueta: "Asistente",
      pantalla: "Tu asistente",
      titulo: "Cambia tu agenda escribiendo, como a una persona.",
      texto:
        "Pregúntale por la agenda y pídele cambios. Es el mismo asistente que te atiende por WhatsApp.",
      detalles: [
        "Te resume el día y los huecos que quedan",
        "Marca una ausencia y reparte sus citas",
        `Avisa a ${g.palabras.tusClientes.toLowerCase()} por WhatsApp sin que escribas tú`,
      ],
    },
  ];
}

/** Al pulsar un paso en la barra se cae con todo ya a la vista. */
const ANCLAS = [0.3, 0.6, 0.9] as const;
/** Los tres pasos empiezan cuando acaba el zoom out. */
const INICIO_PASOS = NEGOCIO_P.finZoom;

/**
 * A qué distancia de la pantalla se empieza a descargar three.js y el modelo:
 * dos pantallas y media, para que estén listos cuando «En tu bolsillo», que
 * va justo antes, llegue al cruce.
 */
const MARGEN_DE_CARGA = "250% 0px";

/** El color del sector en la sección, como en «En tu bolsillo». */
function estiloAcento(acento?: NicheAccent): CSSProperties | undefined {
  if (!acento) return undefined;
  return {
    "--acento": acento.strong,
    "--acento-tinta": acento.deep,
  } as CSSProperties;
}

export function EnTuNegocioScroll({
  guion = GUION_GENERAL,
  acento,
}: {
  guion?: GuionRelato;
  acento?: NicheAccent;
}) {
  const pasos = useMemo(() => pasosDe(guion), [guion]);
  const r = useMemo(() => relato(guion), [guion]);
  const { cliente, servicio, profesional } = guion;
  const nombreCliente = `${cliente.nombre} ${cliente.apellido}`;
  // Con movimiento reducido, la versión quieta llega tras montar: el servidor
  // no sabe la preferencia y pinta el escenario (ver useMovimientoReducido).
  const reducir = useMovimientoReducido();
  const [sinEscena, setSinEscena] = useState(false);
  const quieta = reducir || sinEscena;
  const seccion = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = seccion.current;
    if (quieta || !el) return;
    // Mientras el escenario está fijo se esconde «Configurar cookies», igual
    // que en «En tu bolsillo». Ver lib/relato-fijo.ts.
    const desmarcar = marcarRelato(el);
    let desmontar: (() => void) | undefined;
    let cancelado = false;
    const cerca = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        cerca.disconnect();
        import("./en-tu-negocio-escena")
          .then(({ montarEscena }) => {
            if (cancelado) return;
            // Sin WebGL, `montarEscena` lanza; si el modelo 3D no llega,
            // avisa después. En los dos casos, versión quieta.
            desmontar = montarEscena(el, () => {
              if (!cancelado) setSinEscena(true);
            });
          })
          .catch(() => {
            if (!cancelado) setSinEscena(true);
          });
      },
      { rootMargin: MARGEN_DE_CARGA }
    );
    cerca.observe(el);
    return () => {
      cancelado = true;
      cerca.disconnect();
      desmontar?.();
      desmarcar();
    };
  }, [quieta]);

  const irA = (i: number) => {
    const el = seccion.current;
    if (!el) return;
    const recorrido = el.offsetHeight - window.innerHeight;
    const top =
      window.scrollY +
      el.getBoundingClientRect().top +
      recorrido * (INICIO_PASOS + ANCLAS[i] * (1 - INICIO_PASOS));
    window.scrollTo({ top, behavior: "smooth" });
  };

  if (quieta) return <VersionQuieta pasos={pasos} acento={acento} />;

  // El estado inicial es el del paso 1; a partir de ahí lo lleva la escena.
  return (
    <section
      ref={seccion}
      id="en-tu-negocio"
      className="ng-seccion"
      style={{
        height: `${ALTO_NEGOCIO_VH}vh`,
        marginTop: `-${SOLAPE_NEGOCIO_VH}vh`,
        ...estiloAcento(acento),
      }}
      aria-labelledby="negocio-titulo"
    >
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden="true"
      >
        <symbol id="ng-i-grid" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </symbol>
        <symbol id="ng-i-cal" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </symbol>
        <symbol id="ng-i-tel" viewBox="0 0 24 24">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        </symbol>
        <symbol id="ng-i-bot" viewBox="0 0 24 24">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4M8 16h.01M16 16h.01" />
        </symbol>
        <symbol id="ng-i-msg" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 9h8M8 13h5" />
        </symbol>
        <symbol id="ng-i-gear" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
        </symbol>
        <symbol id="ng-i-card" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </symbol>
        <symbol id="ng-i-check" viewBox="0 0 24 24">
          <path d="M20 6 9 17l-5-5" />
        </symbol>
        <symbol id="ng-i-arrow" viewBox="0 0 24 24">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </symbol>
        <symbol id="ng-i-trend" viewBox="0 0 24 24">
          <path d="m22 7-8.5 8.5-5-5L2 17" />
          <path d="M16 7h6v6" />
        </symbol>
        <symbol id="ng-i-play" viewBox="0 0 24 24">
          <path d="M7 4l13 8-13 8z" />
        </symbol>
        <symbol id="ng-i-send" viewBox="0 0 24 24">
          <path d="m22 2-7 20-4-9-9-4z" />
          <path d="M22 2 11 13" />
        </symbol>
        <symbol id="ng-i-x" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12" />
        </symbol>
        <symbol id="ng-i-mic" viewBox="0 0 24 24">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
        </symbol>
        <symbol id="ng-i-fwd" viewBox="0 0 24 24">
          <path d="M15 3h6v6M21 3l-7 7M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3" />
        </symbol>
        <symbol id="ng-i-user" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </symbol>
        <symbol id="ng-i-out" viewBox="0 0 24 24">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </symbol>
      </svg>
      <div className="ng-escenario">
        <div className="ng-lienzo" />
        <div className="mx" aria-hidden="true">
          {/* La pantalla de bloqueo del relevo: la escena la desvanece al
              desbloquear (ver components/pantalla-bloqueo.tsx). */}
          <div className="mx-bloqueo">
            <PantallaBloqueo guion={guion} />
          </div>
          <div className="mx-menu">
            <b>Alhabla</b>
            <span>Archivo</span>
            <span>Editar</span>
            <span>Ver</span>
            <span>Ventana</span>
            <i className="mx-notch"></i>
            <span className="mx-hora">Mié 17:04</span>
          </div>
          <div className="mx-app">
            <aside className="mx-side">
              <div className="mx-marca">
                {/* eslint-disable-next-line @next/next/no-img-element -- isotipo local, dentro de la pantalla proyectada */}
                <img src="/brand/alhabla-isotipo.svg" alt="" />
                <div>
                  <b>Alhabla</b>
                  <small>{guion.negocio}</small>
                </div>
              </div>
              <p className="mx-grupo">OPERACIÓN</p>
              <div className="mx-item" data-nav="0">
                <svg>
                  <use href="#ng-i-grid" />
                </svg>
                Panel
              </div>
              <div className="mx-item">
                <svg>
                  <use href="#ng-i-cal" />
                </svg>
                Agenda
              </div>
              <div className="mx-item" data-nav="1">
                <svg>
                  <use href="#ng-i-tel" />
                </svg>
                Llamadas
              </div>
              <p className="mx-grupo">RECEPCIONISTA</p>
              <div className="mx-item">
                <svg>
                  <use href="#ng-i-bot" />
                </svg>
                Agente
              </div>
              <div className="mx-item" data-nav="2">
                <svg>
                  <use href="#ng-i-msg" />
                </svg>
                Asistente
              </div>
              <div className="mx-pie">
                <p className="mx-grupo">CUENTA</p>
                <div className="mx-item">
                  <svg>
                    <use href="#ng-i-gear" />
                  </svg>
                  Ajustes
                </div>
                <div className="mx-item">
                  <svg>
                    <use href="#ng-i-card" />
                  </svg>
                  Facturación
                </div>
                <div className="mx-item">
                  <svg>
                    <use href="#ng-i-out" />
                  </svg>
                  Cerrar sesión
                </div>
              </div>
            </aside>
            <div className="mx-main">
              <section className="mx-vista" data-vista="0">
                <header className="mx-cab">
                  <span className="mx-ico">
                    <svg>
                      <use href="#ng-i-grid" />
                    </svg>
                  </span>
                  <div>
                    <p className="mx-h1">Tu negocio, al día</p>
                    <p>
                      Comprueba que la recepción está lista, mira las citas que
                      entran y revisa las últimas conversaciones.
                    </p>
                  </div>
                  <span className="mx-btn">Configurar agente</span>
                </header>
                <div className="mx-card mx-estado" data-a=".16">
                  <div className="mx-ok">
                    <svg>
                      <use href="#ng-i-check" />
                    </svg>
                    Todo funcionando correctamente
                  </div>
                  <div className="mx-celdas">
                    <div className="mx-celda">
                      <span className="mx-ico s">
                        <svg>
                          <use href="#ng-i-bot" />
                        </svg>
                      </span>
                      <div>
                        <small>Recepcionista</small>
                        <b>Atendiendo llamadas</b>
                      </div>
                    </div>
                    <div className="mx-celda">
                      <span className="mx-ico s">
                        <svg>
                          <use href="#ng-i-tel" />
                        </svg>
                      </span>
                      <div>
                        <small>Tu número</small>
                        <b>+34 790 45 32 19</b>
                      </div>
                    </div>
                    <div className="mx-celda">
                      <span className="mx-ico s">
                        <svg>
                          <use href="#ng-i-fwd" />
                        </svg>
                      </span>
                      <div>
                        <small>Desvío de llamadas</small>
                        <b>Activo</b>
                      </div>
                    </div>
                    <div className="mx-celda">
                      <span className="mx-ico s">
                        <svg>
                          <use href="#ng-i-cal" />
                        </svg>
                      </span>
                      <div>
                        <small>Agenda</small>
                        <b>Google Calendar</b>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mx-card mx-stats" data-a=".19">
                  <div className="mx-fila-cab">
                    <p className="mx-h2">Últimos 7 días</p>
                    <span className="mx-chip">Jue 24 – Mié 30 sept</span>
                  </div>
                  <div className="mx-metricas">
                    <div className="mx-metrica">
                      <strong data-n={guion.semana.citas} data-a=".2"></strong>
                      <span>citas reservadas</span>
                      <em className="up">
                        <svg>
                          <use href="#ng-i-trend" />
                        </svg>
                        {guion.semana.masQueAntes} más que la semana pasada
                      </em>
                    </div>
                    <div className="mx-metrica">
                      <strong
                        data-n={guion.semana.llamadas}
                        data-a=".2"
                      ></strong>
                      <span>llamadas atendidas</span>
                      <em>
                        El{" "}
                        {Math.round(
                          (100 * guion.semana.citas) / guion.semana.llamadas
                        )}{" "}
                        % terminó en cita
                      </em>
                    </div>
                    <div className="mx-metrica">
                      <strong data-n="0" data-a=".2"></strong>
                      <span>llamadas perdidas</span>
                      <em>También fuera de horario</em>
                    </div>
                    <div className="mx-metrica">
                      <strong
                        data-n={guion.semana.ingresos}
                        data-s=" €"
                        data-a=".2"
                      ></strong>
                      <span>en citas reservadas</span>
                      <em>Por precio de servicio</em>
                    </div>
                    <div className="mx-grafico">
                      <small>Llamadas por día</small>
                      <div className="mx-barras">
                        <i
                          style={{ "--h": ".78" } as CSSProperties}
                          data-b=".21"
                        ></i>
                        <i
                          style={{ "--h": "1" } as CSSProperties}
                          data-b=".215"
                        ></i>
                        <i
                          style={{ "--h": ".89" } as CSSProperties}
                          data-b=".22"
                        ></i>
                        <i
                          style={{ "--h": ".04" } as CSSProperties}
                          data-b=".225"
                        ></i>
                        <i
                          style={{ "--h": ".56" } as CSSProperties}
                          data-b=".23"
                        ></i>
                        <i
                          style={{ "--h": ".67" } as CSSProperties}
                          data-b=".235"
                        ></i>
                        <i
                          className="hoy"
                          style={{ "--h": ".67" } as CSSProperties}
                          data-b=".24"
                        ></i>
                      </div>
                      <div className="mx-dias">
                        <span>J</span>
                        <span>V</span>
                        <span>S</span>
                        <span>D</span>
                        <span>L</span>
                        <span>M</span>
                        <span>Hoy</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mx-dos">
                  <div className="mx-card" data-a=".24">
                    <div className="mx-fila-cab">
                      <div>
                        <p className="mx-h2">Próximas citas</p>
                        <p>Lo que tu recepcionista ha agendado.</p>
                      </div>
                      <span className="mx-link">
                        Ver agenda
                        <svg>
                          <use href="#ng-i-arrow" />
                        </svg>
                      </span>
                    </div>
                    <div className="mx-lista">
                      <div className="mx-fila">
                        <span className="mx-hr">
                          {r.proximas[0].dia}
                          <br />
                          <b>{r.proximas[0].hora}</b>
                        </span>
                        <div>
                          <b>{r.proximas[0].servicio}</b>
                          <small>{r.proximas[0].quien}</small>
                        </div>
                        <span className="mx-chip">
                          {r.proximas[0].minutos} min
                        </span>
                      </div>
                      <div className="mx-fila">
                        <span className="mx-hr">
                          {r.proximas[1].dia}
                          <br />
                          <b>{r.proximas[1].hora}</b>
                        </span>
                        <div>
                          <b>{r.proximas[1].servicio}</b>
                          <small>{r.proximas[1].quien}</small>
                        </div>
                        <span className="mx-chip">
                          {r.proximas[1].minutos} min
                        </span>
                      </div>
                      <div className="mx-fila">
                        <span className="mx-hr">
                          {r.proximas[2].dia}
                          <br />
                          <b>{r.proximas[2].hora}</b>
                        </span>
                        <div>
                          <b>{r.proximas[2].servicio}</b>
                          <small>{r.proximas[2].quien}</small>
                        </div>
                        <span className="mx-chip">
                          {r.proximas[2].minutos} min
                        </span>
                      </div>
                      <div className="mx-fila">
                        <span className="mx-hr">
                          Jue
                          <br />
                          <b>17:30</b>
                        </span>
                        <div>
                          <b>{servicio.nombre}</b>
                          <small>
                            {nombreCliente} · con {profesional}
                          </small>
                        </div>
                        <span className="mx-chip pu">Nueva</span>
                      </div>
                    </div>
                  </div>
                  <div className="mx-card" data-a=".26">
                    <div className="mx-fila-cab">
                      <div>
                        <p className="mx-h2">Llamadas recientes</p>
                        <p>Toca una para leerla y escucharla.</p>
                      </div>
                      <span className="mx-link">
                        Ver historial
                        <svg>
                          <use href="#ng-i-arrow" />
                        </svg>
                      </span>
                    </div>
                    <div className="mx-lista">
                      <div className="mx-fila">
                        <span className="mx-ico s">
                          <svg>
                            <use href="#ng-i-tel" />
                          </svg>
                        </span>
                        <div>
                          <b>{nombreCliente}</b>
                          <small>Hoy, 17:02 · 2m 14s</small>
                        </div>
                        <span className="mx-chip ok">Cita reservada</span>
                      </div>
                      <div className="mx-fila">
                        <span className="mx-ico s">
                          <svg>
                            <use href="#ng-i-tel" />
                          </svg>
                        </span>
                        <div>
                          <b>+34 797 80 30 74</b>
                          <small>Hoy, 13:41 · 1m 02s</small>
                        </div>
                        <span className="mx-chip">Consulta de precios</span>
                      </div>
                      <div className="mx-fila">
                        <span className="mx-ico s">
                          <svg>
                            <use href="#ng-i-tel" />
                          </svg>
                        </span>
                        <div>
                          <b>{r.llamadas[1].quien}</b>
                          <small>Hoy, 11:20 · 1m 48s</small>
                        </div>
                        <span className="mx-chip ok">Cita movida</span>
                      </div>
                      <div className="mx-fila">
                        <span className="mx-ico s">
                          <svg>
                            <use href="#ng-i-tel" />
                          </svg>
                        </span>
                        <div>
                          <b>+34 795 08 98 37</b>
                          <small>Mar, 21:12 · 1m 31s</small>
                        </div>
                        <span className="mx-chip ok">Cita reservada</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section className="mx-vista mx-llamadas" data-vista="1">
                <header className="mx-cab">
                  <span className="mx-ico">
                    <svg>
                      <use href="#ng-i-tel" />
                    </svg>
                  </span>
                  <div>
                    <p className="mx-h1">Llamadas</p>
                    <p>
                      Todas las conversaciones de tu recepcionista, con
                      grabación y transcripción.
                    </p>
                  </div>
                  <span className="mx-btn">Analítica</span>
                </header>
                <div className="mx-lista">
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>{nombreCliente}</b>
                      <small>Hoy, 17:02 · 2m 14s</small>
                    </div>
                    <span className="mx-chip ok">Cita reservada</span>
                  </div>
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>+34 797 80 30 74</b>
                      <small>Hoy, 13:41 · 1m 02s</small>
                    </div>
                    <span className="mx-chip">Consulta de precios</span>
                  </div>
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>{r.llamadas[1].quien}</b>
                      <small>Hoy, 11:20 · 1m 48s</small>
                    </div>
                    <span className="mx-chip ok">Cita movida</span>
                  </div>
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>+34 795 08 98 37</b>
                      <small>Mar, 21:12 · 1m 31s</small>
                    </div>
                    <span className="mx-chip ok">Cita reservada</span>
                  </div>
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>{r.llamadas[3].quien}</b>
                      <small>Mar, 19:27 · 0m 58s</small>
                    </div>
                    <span className="mx-chip ok">Cita reservada</span>
                  </div>
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>+34 796 21 88 17</b>
                      <small>Mar, 14:39 · 0m 35s</small>
                    </div>
                    <span className="mx-chip">Horario</span>
                  </div>
                  <div className="mx-fila">
                    <span className="mx-ico s">
                      <svg>
                        <use href="#ng-i-tel" />
                      </svg>
                    </span>
                    <div>
                      <b>{r.llamadas[5].quien}</b>
                      <small>Lun, 10:05 · 1m 12s</small>
                    </div>
                    <span className="mx-chip ok">Cita reservada</span>
                  </div>
                </div>
                <div className="mx-velo" data-o=".345"></div>
                <div className="mx-modal" data-a=".35">
                  <div className="mx-modal-cab">
                    <div>
                      <p className="mx-h2">Hoy, 17:02 · {nombreCliente}</p>
                      <p>
                        2m 14s · Completada ·{" "}
                        <svg>
                          <use href="#ng-i-tel" />
                        </svg>
                        {cliente.telefono}
                      </p>
                    </div>
                    <span className="mx-cerrar">
                      <svg>
                        <use href="#ng-i-x" />
                      </svg>
                    </span>
                  </div>
                  <div className="mx-modal-cuerpo">
                    <div className="mx-col">
                      <div>
                        <span className="mx-chip ok">Cita reservada</span>
                      </div>
                      <div className="mx-bloque" data-a=".52">
                        <p className="mx-h3">
                          <svg>
                            <use href="#ng-i-cal" />
                          </svg>
                          Reserva vinculada
                        </p>
                        <div className="mx-reserva">
                          <span className="fecha">
                            JUE<b>1</b>
                          </span>
                          <div>
                            <b>{servicio.nombre}</b>
                            <small>
                              17:30 – {r.finCita} · con {profesional}
                            </small>
                          </div>
                          <span className="precio">{servicio.precio} €</span>
                        </div>
                        <p>Confirmación enviada por WhatsApp a las 17:03.</p>
                      </div>
                      <div className="mx-bloque" data-a=".38">
                        <p className="mx-h3">
                          <svg>
                            <use href="#ng-i-msg" />
                          </svg>
                          Resumen
                        </p>
                        <p>{r.resumen}</p>
                      </div>
                      <div className="mx-bloque" data-a=".4">
                        <p className="mx-h3">
                          <svg>
                            <use href="#ng-i-mic" />
                          </svg>
                          Grabación
                        </p>
                        <div className="mx-player">
                          <span className="mx-play">
                            <svg>
                              <use href="#ng-i-play" />
                            </svg>
                          </span>
                          <span className="mx-onda"></span>
                          <span className="mx-tiempo">00:00</span>
                        </div>
                      </div>
                    </div>
                    <div className="mx-trans" data-a=".37">
                      <p className="mx-h3">
                        <svg>
                          <use href="#ng-i-user" />
                        </svg>
                        Transcripción<span>6 turnos</span>
                      </p>
                      <div className="mx-turnos">
                        <div className="mx-turno ag" data-a=".4">
                          <small>AGENTE</small>
                          {r.saludo}
                        </div>
                        <div className="mx-turno cl" data-a=".43">
                          <small>CLIENTE</small>
                          {r.pide}
                        </div>
                        <div className="mx-turno ag" data-a=".46">
                          <small>AGENTE</small>
                          {r.ofrece}
                        </div>
                        <div className="mx-turno cl" data-a=".49">
                          <small>CLIENTE</small>
                          {r.franja}
                        </div>
                        <div className="mx-turno ag" data-a=".53">
                          <small>AGENTE</small>
                          {r.propone}
                        </div>
                        <div className="mx-turno cl" data-a=".56">
                          <small>CLIENTE</small>
                          {r.acepta}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section className="mx-vista mx-asis" data-vista="2">
                <header className="mx-cab">
                  <span className="mx-ico">
                    <svg>
                      <use href="#ng-i-msg" />
                    </svg>
                  </span>
                  <div>
                    <p className="mx-h1">Tu asistente</p>
                    <p>
                      Pregúntale por la agenda y pídele cambios: servicios,
                      equipo, horario, citas. Es el mismo asistente que te
                      atiende por WhatsApp.
                    </p>
                  </div>
                  <span className="mx-chip pu mx-beta">Beta</span>
                </header>
                <div className="mx-card mx-chat">
                  <div className="mx-mensajes">
                    <div className="mx-msg yo" data-a=".685">
                      {r.asistente.pregunta}
                      <time>17:04</time>
                    </div>
                    <div className="mx-msg bot" data-a=".705">
                      {r.asistente.respuesta}
                      <time>17:04</time>
                    </div>
                    <div className="mx-msg yo" data-a=".73">
                      {r.asistente.baja}
                      <time>17:05</time>
                    </div>
                    <div className="mx-msg bot" data-a=".75">
                      {r.asistente.analisis}
                      <div className="mx-tabla">
                        {r.asistente.tabla.map((fila) => (
                          <div key={fila.hora}>
                            <b>{fila.hora}</b>
                            <span>{fila.cita}</span>
                            {fila.libre ? (
                              <span className="mx-chip ok">
                                {guion.companera} libre
                              </span>
                            ) : (
                              <span className="mx-chip">Sin hueco</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <time>17:05</time>
                    </div>
                    <div className="mx-msg yo" data-a=".78">
                      {r.asistente.orden}
                      <time>17:06</time>
                    </div>
                    <div
                      className="mx-escribiendo"
                      data-a=".8"
                      data-hasta=".815"
                    >
                      <i></i>
                      <i></i>
                      <i></i>
                    </div>
                    <div className="mx-msg bot" data-a=".82">
                      {r.asistente.cierre}
                      <div className="mx-hecho">
                        <span>
                          <svg>
                            <use href="#ng-i-check" />
                          </svg>
                          {r.asistente.hecho[0]}
                        </span>
                        <span>
                          <svg>
                            <use href="#ng-i-check" />
                          </svg>
                          {r.asistente.hecho[1]}
                        </span>
                        <span>
                          <svg>
                            <use href="#ng-i-check" />
                          </svg>
                          {r.asistente.hecho[2]}
                        </span>
                      </div>
                      <time>17:06</time>
                    </div>
                  </div>
                  <div className="mx-escribir">
                    <span className="mx-campo">Escribe a tu asistente…</span>
                    <span className="mx-enviar">
                      <svg>
                        <use href="#ng-i-send" />
                      </svg>
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
        <div className="ng-rejilla">
          <div className="ng-texto">
            <h2 id="negocio-titulo" className="ng-antetitulo">
              En tu negocio
            </h2>
            <div className="ng-copias" aria-hidden="true">
              {pasos.map((paso, i) => (
                <div
                  key={paso.numero}
                  className="ng-copia"
                  style={{ visibility: i === 0 ? "visible" : "hidden" }}
                >
                  <p className="ng-numero">
                    {paso.numero} · {paso.etiqueta}
                  </p>
                  <h3 className="ng-titulo">{paso.titulo}</h3>
                  <p className="ng-parrafo">{paso.texto}</p>
                  <ul className="ng-detalles">
                    {paso.detalles.map((detalle) => (
                      <li
                        key={detalle}
                        className="ng-detalle"
                        style={{ opacity: 0 }}
                      >
                        <Check aria-hidden="true" strokeWidth={2.5} />
                        <span>{detalle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <nav className="ng-barra" aria-label="Pasos del panel">
              {pasos.map((paso, i) => (
                <button
                  key={paso.numero}
                  type="button"
                  className="ng-paso"
                  onClick={() => irA(i)}
                  aria-current={i === 0 ? "step" : undefined}
                  aria-label={`Ir al paso ${paso.numero}: ${paso.etiqueta}`}
                >
                  <span className="ng-pista">
                    <span className="ng-relleno" />
                  </span>
                </button>
              ))}
            </nav>
          </div>
          <div className="ng-mac" aria-hidden="true">
            <p className="ng-rotulo">
              {pasos.map((paso, i) => (
                <span
                  key={paso.numero}
                  style={{ visibility: i === 0 ? "visible" : "hidden" }}
                >
                  {paso.pantalla}
                </span>
              ))}
            </p>
            <div className="ng-hueco" />
          </div>
        </div>
        {/* Crédito que exige la licencia CC BY 4.0 del modelo: no quitar. */}
        <p className="ng-credito">
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
      <ol className="sr-only">
        {pasos.map((paso) => (
          <li key={paso.numero}>
            <strong>{paso.titulo}</strong> {paso.texto}{" "}
            {paso.detalles.join(". ")}.
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Movimiento reducido o sin WebGL: los tres pasos a la vista, sin escenario. */
function VersionQuieta({
  pasos,
  acento,
}: {
  pasos: PasoCopy[];
  acento?: NicheAccent;
}) {
  return (
    <section
      id="en-tu-negocio"
      className="border-b border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24"
      style={estiloAcento(acento)}
      aria-labelledby="negocio-titulo-quieta"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2
          id="negocio-titulo-quieta"
          className="max-w-3xl text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl"
        >
          En tu negocio: todo lo que pasa, en tu panel.
        </h2>
        <ol className="mt-10 grid gap-5 lg:grid-cols-3">
          {pasos.map((paso) => (
            <li
              key={paso.numero}
              className="rounded-3xl border border-[#e5e5e5] bg-white p-7"
            >
              <p className="text-sm font-bold text-[var(--acento-tinta,#6d28d9)]">
                {paso.numero} · {paso.etiqueta}
              </p>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-[#0a0a0a]">
                {paso.titulo}
              </h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">
                {paso.texto}
              </p>
              <ul className="mt-4 space-y-2">
                {paso.detalles.map((detalle) => (
                  <li
                    key={detalle}
                    className="flex items-start gap-2 text-sm leading-6 text-[#27272a]"
                  >
                    <Check
                      className="mt-1 h-4 w-4 shrink-0 text-[var(--acento,#8b5cf6)]"
                      aria-hidden="true"
                    />
                    {detalle}
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
