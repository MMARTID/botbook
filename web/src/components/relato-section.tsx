"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Headphones, Mic, Phone, Search } from "lucide-react";
import { SiApple, SiGoogle, SiGooglecalendar } from "@icons-pack/react-simple-icons";

import { MicrosoftLogo } from "@/components/brand-icons";
import { Reveal } from "@/components/scroll-reveal";
import { TRIAL_REASSURANCE } from "@/lib/plans";
import styles from "./relato.module.css";

/**
 * El relato de la portada (2026-09-26): de la llamada a la puesta en marcha,
 * en cinco capítulos con un único teléfono fijo (sticky) al lado.
 *
 * Los pasos se leen con el scroll NATIVO: el texto no se mueve por su
 * cuenta ni se superpone, simplemente pasa. El paso que cruza la «línea de
 * lectura» decide la pantalla del teléfono — en escritorio, el centro de la
 * ventana; en móvil, el tercio alto del hueco que queda bajo el teléfono.
 * La pantalla anterior se va de golpe y la nueva entra (nunca hay dos textos
 * a la vez), con sus piezas escalonadas.
 *
 * Sustituye a las secciones sueltas de ventajas, WhatsApp para clientes,
 * El Gestor y puesta en marcha, que ahora son capítulos de este relato.
 */

type Pantalla =
  | "llamada"
  | "agenda"
  | "confirmacion"
  | "aviso"
  | "hueco"
  | "voz"
  | "equipo"
  | "recordatorio"
  | "cambio"
  | "espera"
  | "gestorBaja"
  | "gestorCierre"
  | "alta"
  | "calendario"
  | "desvio";

type Paso = {
  titulo: string;
  texto: string;
  pantalla: Pantalla;
  plan?: string;
  escuchar?: boolean;
};

type Capitulo = { id: string; titulo: string; intro: ReactNode; pasos: Paso[] };

const CAPITULOS: Capitulo[] = [
  {
    id: "llamada",
    titulo: "Así se atiende una llamada que antes perdías.",
    intro: (
      <>
        En los salones, más de un tercio de las llamadas se quedan sin respuesta
        <a
          href="https://www.zenoti.com/thecheckin/how-track-salon-call-conversion-rate"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 align-super text-xs font-semibold text-[#6d28d9] underline-offset-2 hover:underline"
          aria-label="Fuente: Zenoti, The Check-In"
        >
          [Zenoti]
        </a>
        . Con Alhabla, cada una termina así.
      </>
    ),
    pasos: [
      {
        titulo: "Si no puedes cogerlo, contesta Alhabla",
        texto:
          "Activas un desvío en tu número de siempre y las llamadas que no atiendes pasan a Alhabla al momento, a cualquier hora y también en festivos. Saluda con el nombre de tu negocio y resuelve dudas de precios, duraciones y horarios con tus datos.",
        pantalla: "llamada",
      },
      {
        titulo: "Busca hueco en tu agenda real",
        texto:
          "Mira tu horario y tu calendario de Google, Outlook o iCloud, cuenta lo que dura el servicio y elige al profesional adecuado. Si no hay sitio, propone el hueco más cercano.",
        pantalla: "agenda",
      },
      {
        titulo: "El cliente recibe su cita por WhatsApp",
        texto:
          "La cita queda apuntada en tu calendario y al cliente le llega la confirmación al momento, con un botón por si tiene que cancelar.",
        pantalla: "confirmacion",
      },
      {
        titulo: "Y tú te enteras sin coger el teléfono",
        texto:
          "Te llega un aviso con cada cita nueva y, si alguien dejó un recado, también. En tu panel tienes la grabación y la transcripción de cada llamada.",
        pantalla: "aviso",
      },
    ],
  },
  {
    id: "diferencias",
    titulo: "No es un contestador. Es tu recepción.",
    intro:
      "Un contestador toma nota y te deja el trabajo a ti. Alhabla resuelve la llamada: informa, reserva y confirma, con las mismas reglas que pondrías tú.",
    pasos: [
      {
        titulo: "Nunca reserva a ciegas",
        texto:
          "Tu agenda manda. Comprueba horario y calendario antes de ofrecer una hora y cuenta lo que dura cada servicio: no promete huecos que no existen ni te monta dos citas a la vez.",
        pantalla: "hueco",
      },
      {
        titulo: "Suena a persona, no a robot",
        texto:
          "Voz natural en español de España que se deja interrumpir y no espera silencios largos para contestar. Y si le preguntan algo que no está en tus datos, no se lo inventa: toma un recado.",
        pantalla: "voz",
        escuchar: true,
      },
      {
        titulo: "Cada cita, con quien tú elegirías",
        texto:
          "Marcas quién es especialista en cada servicio y Alhabla reparte las citas como lo harías tú. Si el cliente pide a alguien por su nombre, con esa persona; entre dos igual de buenos, al que tenga el día más despejado.",
        pantalla: "equipo",
      },
    ],
  },
  {
    id: "clientes",
    titulo: "La cita no acaba al colgar.",
    intro:
      "Tus clientes gestionan su cita por WhatsApp, sin volver a llamar. Todo lo que cambian acaba en tu agenda sin que tengas que tocar nada.",
    pasos: [
      {
        titulo: "Un recordatorio antes de la cita",
        texto:
          "Antes de la cita le llega un aviso con el día, la hora y con quién. Menos ausencias y menos huecos muertos en tu agenda.",
        pantalla: "recordatorio",
        plan: "Pro y Scale",
      },
      {
        titulo: "Cambiar o cancelar, escribiendo",
        texto:
          "Si le surge algo, responde al mensaje y la recepcionista le busca otro hueco o cancela la cita. Y quien prefiere escribir a llamar puede reservar por WhatsApp desde el principio.",
        pantalla: "cambio",
      },
      {
        titulo: "Lista de espera",
        texto:
          "Si no hay hueco, el cliente se apunta. Cuando alguien cancela, le avisa para que lo coja y la hora no se queda vacía.",
        pantalla: "espera",
      },
    ],
  },
  {
    id: "gestor",
    titulo: "Y cuando algo cambia, se lo dices por WhatsApp.",
    intro:
      "Alhabla no solo atiende a tus clientes: también es con quien hablas tú. Le cambias una cita, el horario o un precio por WhatsApp y lo aplica en tu agenda real, sin abrir el panel.",
    pasos: [
      {
        titulo: "Si un profesional falta",
        texto:
          "«Ana está de baja hoy» y deja de ofrecer citas con ella. Si ya tenía alguna, te propone a quién moverla y tú decides con un botón.",
        pantalla: "gestorBaja",
      },
      {
        titulo: "Si cierras, o cambias un precio o el horario",
        texto:
          "«Cerramos el sábado por la tarde», «el tinte pasa a 45 €» o «los lunes abrimos a las 10». Te propone el cambio y solo lo aplica cuando pulsas «Confirmar».",
        pantalla: "gestorCierre",
      },
    ],
  },
  {
    id: "en-marcha",
    titulo: "Lo pones en marcha tú, sin técnicos.",
    intro:
      "Se configura desde el móvil, entre cliente y cliente. Y si lo dejas a medias, sigues luego donde lo dejaste.",
    pasos: [
      {
        titulo: "Das de alta tu negocio",
        texto:
          "Lo buscas en Google y rellenamos los datos básicos. Eliges tu sector y partes de sus servicios habituales —peluquería, barbería, uñas, estética o fisioterapia—; solo ajustas precios, duraciones y quién hace cada cosa.",
        pantalla: "alta",
      },
      {
        titulo: "Conectas tu calendario",
        texto:
          "Google Calendar, Outlook o iCloud. Alhabla lee tus huecos y apunta las citas donde ya las miras tú. Si algún día se desconecta, te avisa.",
        pantalla: "calendario",
      },
      {
        titulo: "Activas el desvío",
        texto:
          "Marcas un código en tu teléfono: unos 15 segundos, y te guiamos según tu operador. Tu número no cambia y no tienes que avisar a nadie.",
        pantalla: "desvio",
      },
    ],
  },
];

const PASOS = CAPITULOS.flatMap((c) => c.pasos);

export function RelatoSection({ onEscuchar }: { onEscuchar: () => void }) {
  const [activo, setActivo] = useState(0);
  const [direccion, setDireccion] = useState<"adelante" | "atras">("adelante");
  const zonaTelefono = useRef<HTMLDivElement>(null);
  const pasos = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const escritorio = window.matchMedia("(min-width: 1024px)");
    let pendiente = 0;
    let ultimo = 0;

    const medir = () => {
      pendiente = 0;
      const alto = window.innerHeight;
      // En móvil el teléfono tapa la parte de arriba: se lee en el hueco de
      // debajo, y el paso se activa en su tercio alto, cuando ya cabe entero.
      const arriba = escritorio.matches
        ? 0
        : Math.max(zonaTelefono.current?.getBoundingClientRect().bottom ?? 0, 0);
      const linea = arriba + (alto - arriba) * (escritorio.matches ? 0.5 : 0.35);

      let elegido = 0;
      pasos.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= linea) elegido = i;
      });
      if (elegido !== ultimo) {
        setDireccion(elegido > ultimo ? "adelante" : "atras");
        ultimo = elegido;
        setActivo(elegido);
      }
    };
    const pedir = () => {
      if (!pendiente) pendiente = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(pendiente);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, []);

  // Mientras se lee el relato, el botón fijo de «Configurar cookies» se
  // esconde: en móvil tapaba el texto de los pasos.
  const seccion = useRef<HTMLElement>(null);
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
  }, []);

  const { oscuro, Componente } = PANTALLAS[PASOS[activo].pantalla];
  let indice = 0;

  return (
    <section
      ref={seccion}
      id="como-funciona"
      className="scroll-m-20 border-b border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24"
      aria-label="Cómo funciona Alhabla"
    >
      <div className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${styles.escena}`}>
        <div ref={zonaTelefono} className={styles.areaTelefono}>
          <div className={styles.telefono}>
            <div className={styles.hueco}>
              <span className={styles.isla} aria-hidden="true" />
              <Estado oscuro={oscuro} />
              <div key={activo} className={styles.pantallaMarco} data-direccion={direccion}>
                <Componente />
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- render local, el marco del teléfono */}
            <img src="/telefono/frente.webp" alt="" className={styles.marco} width={1335} height={2859} />
          </div>
        </div>

        <div className={styles.areaTexto}>
          {CAPITULOS.map((capitulo, c) => (
            <div key={capitulo.id} id={c === 0 ? undefined : capitulo.id} className={styles.capitulo}>
              <Reveal className="max-w-xl">
                <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">{capitulo.titulo}</h2>
                <p className="mt-4 text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8">{capitulo.intro}</p>
              </Reveal>
              <ol className={styles.pasos}>
                {capitulo.pasos.map((paso, p) => {
                  const i = indice++;
                  const esActivo = i === activo;
                  return (
                    <li
                      key={paso.titulo}
                      ref={(el) => {
                        pasos.current[i] = el;
                      }}
                      className={styles.paso}
                      data-activo={esActivo ? "" : undefined}
                      aria-current={esActivo ? "step" : undefined}
                    >
                      <span className={styles.pasoNumero}>{p + 1}</span>
                      <div className="min-w-0">
                        <h3 className={styles.pasoTitulo}>
                          {paso.titulo}
                          {paso.plan ? <span className={styles.pasoPlan}>{paso.plan}</span> : null}
                        </h3>
                        <p className={styles.pasoTexto}>{paso.texto}</p>
                        {paso.escuchar ? (
                          <button type="button" onClick={onEscuchar} className="btn-secondary mt-5">
                            <Headphones className="h-4 w-4" aria-hidden="true" /> Escuchar una llamada
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}

          <Reveal className={styles.cierre} y={10}>
            <p className="text-base font-semibold text-[#27272a]">{TRIAL_REASSURANCE}</p>
            <Link href="/planes" className="btn-primary h-12 px-6">
              Empezar la prueba <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Pantallas ─────────────────────────────────────────────────────── */

/** Índice de escalonado para las piezas de cada pantalla. */
const esc = (i: number) => ({ ["--i" as string]: i });
const cx = (...clases: (string | false | undefined)[]) => clases.filter(Boolean).join(" ");

function Estado({ oscuro }: { oscuro: boolean }) {
  return (
    <div className={styles.estado} style={{ color: oscuro ? "#fff" : "#0a0a0a" }} aria-hidden="true">
      <span>17:02</span>
      <span>5G</span>
    </div>
  );
}

const ONDA = [30, 55, 80, 45, 95, 60, 35, 70, 50, 25, 65, 40];

function Llamada({
  etiqueta,
  dato,
  children,
}: {
  etiqueta: string;
  dato: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.pantalla, styles.llamada)} role="img" aria-label={etiqueta}>
      <div className={cx(styles.llamante, styles.escalon)} style={esc(0)}>
        <p className={styles.llamanteNombre}>Laura</p>
        <p className={styles.llamanteDato}>{dato}</p>
      </div>
      <div className={styles.transcripcion}>{children}</div>
      <div className={styles.onda} aria-hidden="true">
        {ONDA.map((alto, i) => (
          <span key={i} style={{ height: `${alto}%` }} />
        ))}
      </div>
      <span className={styles.colgar} aria-hidden="true">
        <Phone color="#fff" strokeWidth={2.4} />
      </span>
    </div>
  );
}

function Burbuja({ de, i, children }: { de: "Laura" | "Alhabla"; i: number; children: ReactNode }) {
  return (
    <p className={cx(styles.burbuja, de === "Laura" ? styles.burbujaCliente : styles.burbujaAlhabla, styles.escalon)} style={esc(i)}>
      <span className={styles.quien}>{de}</span>
      {children}
    </p>
  );
}

function PantallaLlamada() {
  return (
    <Llamada
      etiqueta="Llamada atendida por Alhabla: la clienta pide cita para mañana y Alhabla le ofrece las 17:30 con Marta."
      dato="Atiende Alhabla · 00:41"
    >
      <Burbuja de="Laura" i={1}>¿Tenéis hueco mañana para corte y color?</Burbuja>
      <Burbuja de="Alhabla" i={3}>Mañana a las 17:30 con Marta. ¿Te la reservo?</Burbuja>
      <Burbuja de="Laura" i={5}>Sí, perfecto.</Burbuja>
    </Llamada>
  );
}

function PantallaVoz() {
  return (
    <Llamada
      etiqueta="Llamada en la que la clienta interrumpe a Alhabla y esta sigue con naturalidad; luego pregunta por un servicio que no está en los datos y Alhabla toma un recado."
      dato="Atiende Alhabla · 01:12"
    >
      <Burbuja de="Alhabla" i={1}>
        El viernes tengo a las 10:00, a las 12:30 o a las…
      </Burbuja>
      <Burbuja de="Laura" i={3}>¡Las 12:30!</Burbuja>
      <Burbuja de="Alhabla" i={5}>Hecho, viernes a las 12:30.</Burbuja>
      <Burbuja de="Laura" i={7}>¿Y hacéis keratina?</Burbuja>
      <Burbuja de="Alhabla" i={9}>Eso te lo confirma Nuria. Le dejo el recado y te llama.</Burbuja>
    </Llamada>
  );
}

const AGENDA = [
  { hora: "15:00", tipo: "cita", servicio: "Alisado", cliente: "Rosa" },
  { hora: "16:00", tipo: "cita", servicio: "Mechas", cliente: "Carmen" },
  { hora: "17:00", tipo: "cita", servicio: "Corte", cliente: "Javier" },
  { hora: "17:30", tipo: "nueva", servicio: "Corte y color", cliente: "Laura" },
  { hora: "19:00", tipo: "cita", servicio: "Peinado", cliente: "Elena" },
  { hora: "19:45", tipo: "libre" },
] as const;

function CalendariosPie({ i }: { i: number }) {
  return (
    <div className={cx(styles.calendarios, styles.escalon)} style={esc(i)}>
      <SiGooglecalendar color="default" aria-hidden="true" />
      <MicrosoftLogo />
      <SiApple color="#0a0a0a" aria-hidden="true" />
      <span>Tu calendario de siempre</span>
    </div>
  );
}

function PantallaAgenda() {
  return (
    <div
      className={cx(styles.pantalla, styles.agenda)}
      role="img"
      aria-label="Agenda de mañana: la cita de Laura, corte y color a las 17:30 con Marta, entra en el hueco libre."
    >
      <div className={cx(styles.agendaCabecera, styles.escalon)} style={esc(0)}>
        <div>
          <p className={styles.agendaDia}>Mañana</p>
          <p className={styles.agendaFecha}>Jueves · Marta</p>
        </div>
        <SiGooglecalendar className={styles.agendaIcono} color="default" aria-hidden="true" />
      </div>
      <div className={styles.franjas}>
        {AGENDA.map((franja, i) => (
          <div key={franja.hora} className={cx(styles.franja, styles.escalon)} style={esc(i + 1)}>
            <span className={styles.franjaHora}>{franja.hora}</span>
            {franja.tipo === "libre" ? (
              <span className={styles.libre}>Libre</span>
            ) : (
              <span className={franja.tipo === "nueva" ? styles.citaNueva : styles.cita}>
                {franja.tipo === "nueva" ? <span className={styles.etiquetaNueva}>Nueva</span> : null}
                <span className={styles.citaTitulo}>{franja.servicio}</span>
                {franja.cliente}
              </span>
            )}
          </div>
        ))}
      </div>
      <CalendariosPie i={7} />
    </div>
  );
}

function PantallaHueco() {
  const filas = [
    { hora: "16:00", estado: "ocupado", detalle: "Mechas · Carmen" },
    { hora: "17:00", estado: "corto", detalle: "30 min libres: no cabe" },
    { hora: "17:30", estado: "cabe", detalle: "90 min libres · con Marta" },
    { hora: "19:00", estado: "ocupado", detalle: "Peinado · Elena" },
  ] as const;
  return (
    <div
      className={cx(styles.pantalla, styles.agenda)}
      role="img"
      aria-label="Alhabla busca 90 minutos para corte y color: descarta las horas ocupadas y un hueco demasiado corto, y ofrece las 17:30 con Marta."
    >
      <div className={cx(styles.buscando, styles.escalon)} style={esc(0)}>
        <span className={styles.buscandoEtiqueta}>Buscando hueco</span>
        <span className={styles.buscandoServicio}>Corte y color · 90 min</span>
      </div>
      <div className={styles.franjas}>
        {filas.map((fila, i) => (
          <div key={fila.hora} className={cx(styles.franja, styles.escalon)} style={esc(i + 1)}>
            <span className={styles.franjaHora}>{fila.hora}</span>
            <span className={fila.estado === "cabe" ? styles.citaNueva : cx(styles.cita, styles.citaDescartada)}>
              {fila.estado === "cabe" ? <span className={styles.etiquetaNueva}>Cabe</span> : null}
              <span className={styles.citaTitulo}>{fila.estado === "cabe" ? "Libre" : fila.estado === "corto" ? "Hueco corto" : "Ocupado"}</span>
              {fila.detalle}
            </span>
          </div>
        ))}
      </div>
      <CalendariosPie i={6} />
    </div>
  );
}

function PantallaEquipo() {
  const equipo = [
    { nombre: "Marta", nivel: "Especialista", elegida: true },
    { nombre: "Javier", nivel: "Lo hace", elegida: false },
    { nombre: "Elena", nivel: "Solo si lo piden", elegida: false },
  ];
  return (
    <div
      className={cx(styles.pantalla, styles.agenda)}
      role="img"
      aria-label="Reparto por especialidad: para color, Marta es especialista y se lleva la cita; Javier lo hace y Elena solo si la piden."
    >
      <div className={cx(styles.buscando, styles.escalon)} style={esc(0)}>
        <span className={styles.buscandoEtiqueta}>¿Quién hace color?</span>
        <span className={styles.buscandoServicio}>Tu equipo</span>
      </div>
      <div className={styles.equipo}>
        {equipo.map((p, i) => (
          <div key={p.nombre} className={cx(styles.miembro, p.elegida && styles.miembroElegido, styles.escalon)} style={esc(i + 1)}>
            <span className={styles.miembroInicial} aria-hidden="true">
              {p.nombre[0]}
            </span>
            <span className={styles.miembroNombre}>{p.nombre}</span>
            <span className={styles.miembroNivel}>{p.nivel}</span>
          </div>
        ))}
      </div>
      <p className={cx(styles.asignada, styles.escalon)} style={esc(5)}>
        <Check aria-hidden="true" /> Cita asignada a Marta
      </p>
    </div>
  );
}

/* WhatsApp: el mismo chat para el cliente y para el negocio. */
function Chat({
  nombre,
  sub,
  etiqueta,
  children,
}: {
  nombre: string;
  sub: string;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.pantalla, styles.whatsapp)} role="img" aria-label={etiqueta}>
      <div className={styles.waCabecera}>
        <span className={styles.waAvatar} aria-hidden="true">
          A
        </span>
        <div>
          <p className={styles.waNombre}>{nombre}</p>
          <p className={styles.waSub}>{sub}</p>
        </div>
      </div>
      <div className={styles.waChat}>
        <span className={cx(styles.waFecha, styles.escalon)} style={esc(0)}>
          Hoy
        </span>
        {children}
      </div>
      <div className={styles.waEscribir} aria-hidden="true">
        <span className={styles.waCaja}>Mensaje</span>
        <span className={styles.waMicro}>
          <Mic color="#fff" strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

function Entra({ i, hora, children }: { i: number; hora: string; children: ReactNode }) {
  return (
    <p className={cx(styles.waMensaje, styles.escalon)} style={esc(i)}>
      {children}
      <span className={styles.waHora}>{hora}</span>
    </p>
  );
}

function Sale({ i, hora, children }: { i: number; hora: string; children: ReactNode }) {
  return (
    <p className={cx(styles.waMensaje, styles.waMio, styles.escalon)} style={esc(i)}>
      {children}
      <span className={styles.waHora}>{hora}</span>
    </p>
  );
}

function Botones({ i, textos, elegido }: { i: number; textos: string[]; elegido?: number }) {
  return (
    <div className={cx(styles.waBotones, styles.escalon)} style={esc(i)}>
      {textos.map((t, n) => (
        <span key={t} className={cx(styles.waBoton, n === elegido && styles.waBotonPulsado)}>
          {t}
        </span>
      ))}
    </div>
  );
}

function PantallaConfirmacion() {
  return (
    <Chat
      nombre="Alhabla Reservas"
      sub="Cuenta de empresa"
      etiqueta="WhatsApp de confirmación a Laura: corte y color el jueves a las 17:30 con Marta, con un botón para cancelar."
    >
      <Entra i={1} hora="17:03">
        Hola, Laura. Tu cita está confirmada:
        <br />
        <strong>Corte y color</strong>
        <br />
        Jueves a las 17:30 con Marta
        <br />
        Peluquería Nuria
      </Entra>
      <Botones i={2} textos={["Cancelar cita"]} />
    </Chat>
  );
}

function PantallaAviso() {
  return (
    <Chat
      nombre="Alhabla"
      sub="Tu recepción"
      etiqueta="WhatsApp de Alhabla al negocio: aviso de la cita nueva de Laura y un recado de otro cliente que pregunta por la keratina."
    >
      <Entra i={1} hora="17:03">
        <strong>Nueva cita</strong>
        <br />
        Laura · Corte y color
        <br />
        Jueves a las 17:30 con Marta
      </Entra>
      <Entra i={3} hora="17:48">
        <strong>Recado</strong>
        <br />
        Pedro quiere saber si hacéis keratina. Le dije que se lo confirmarías tú.
      </Entra>
    </Chat>
  );
}

function PantallaRecordatorio() {
  return (
    <Chat
      nombre="Alhabla Reservas"
      sub="Cuenta de empresa"
      etiqueta="Recordatorio por WhatsApp a Laura de su cita del jueves a las 17:30 con Marta."
    >
      <Entra i={1} hora="10:00">
        <strong>Recordatorio</strong>
        <br />
        Mañana a las 17:30 tienes corte y color con Marta en Peluquería Nuria. ¡Te esperamos!
      </Entra>
      <Botones i={2} textos={["Cancelar cita"]} />
    </Chat>
  );
}

function PantallaCambio() {
  return (
    <Chat
      nombre="Alhabla Reservas"
      sub="Cuenta de empresa"
      etiqueta="Laura pide por WhatsApp pasar su cita al viernes y la recepcionista se la cambia a las 18:00."
    >
      <Sale i={1} hora="10:02">
        ¿Me la puedes pasar al viernes por la tarde?
      </Sale>
      <Entra i={3} hora="10:02">
        Claro. El viernes tengo a las 18:00 con Marta. ¿Te la cambio?
      </Entra>
      <Sale i={5} hora="10:03">
        Sí, porfa
      </Sale>
      <Entra i={7} hora="10:03">
        Hecho ✓ Viernes a las 18:00 con Marta.
      </Entra>
    </Chat>
  );
}

function PantallaEspera() {
  return (
    <Chat
      nombre="Alhabla Reservas"
      sub="Cuenta de empresa"
      etiqueta="Aviso de lista de espera por WhatsApp: se ha liberado el jueves a las 17:30 y el cliente lo coge."
    >
      <Entra i={1} hora="12:40">
        <strong>Se ha liberado un hueco</strong>
        <br />
        Jueves a las 17:30 con Marta. ¿Te lo reservo?
      </Entra>
      <Botones i={2} textos={["Sí, lo quiero", "No, gracias"]} elegido={0} />
      <Entra i={4} hora="12:41">
        Reservado ✓ Te esperamos el jueves.
      </Entra>
    </Chat>
  );
}

function PantallaGestorBaja() {
  return (
    <Chat
      nombre="Alhabla"
      sub="Tu recepción"
      etiqueta="El dueño avisa por WhatsApp de que Ana está de baja; Alhabla propone mover su cita de las 11:00 a Marcos y el dueño confirma."
    >
      <Sale i={1} hora="08:31">
        Ana está de baja hoy
      </Sale>
      <Entra i={3} hora="08:31">
        Entendido, dejo de ofrecer citas con Ana. Tenía una a las 11:00. ¿Se la paso a Marcos, que tiene hueco?
      </Entra>
      <Botones i={4} textos={["Sí, muévela", "Ya lo hago yo"]} elegido={0} />
      <Entra i={6} hora="08:32">
        Hecho ✓ La cita de las 11:00 ya está con Marcos.
      </Entra>
    </Chat>
  );
}

function PantallaGestorCierre() {
  return (
    <Chat
      nombre="Alhabla"
      sub="Tu recepción"
      etiqueta="El dueño escribe que cierran el sábado por la tarde; Alhabla propone bloquear desde las 14:00 y lo aplica al pulsar Confirmar."
    >
      <Sale i={1} hora="19:10">
        Cerramos el sábado por la tarde
      </Sale>
      <Entra i={3} hora="19:10">
        ¿Bloqueo el sábado desde las 14:00? No hay citas a esas horas.
      </Entra>
      <Botones i={4} textos={["Confirmar", "Cancelar"]} elegido={0} />
      <Entra i={6} hora="19:11">
        Hecho ✓ El sábado por la tarde ya no se ofrece.
      </Entra>
    </Chat>
  );
}

function PantallaAlta() {
  const servicios = ["Corte", "Color", "Mechas", "Peinado", "Alisado", "Tratamientos"];
  return (
    <div className={cx(styles.pantalla, styles.agenda)} role="img" aria-label="Alta del negocio: se busca «Peluquería Nuria» en Google y se proponen los servicios habituales de una peluquería.">
      <p className={cx(styles.altaTitulo, styles.escalon)} style={esc(0)}>
        Tu negocio
      </p>
      <div className={cx(styles.buscador, styles.escalon)} style={esc(1)}>
        <Search aria-hidden="true" />
        Peluquería Nuria
      </div>
      <div className={cx(styles.resultado, styles.escalon)} style={esc(2)}>
        <SiGoogle color="default" aria-hidden="true" />
        <div>
          <p className={styles.resultadoNombre}>Peluquería Nuria</p>
          <p className={styles.resultadoDato}>C/ Mayor 12 · Peluquería</p>
        </div>
        <Check className={styles.resultadoOk} aria-hidden="true" />
      </div>
      <p className={cx(styles.altaSub, styles.escalon)} style={esc(3)}>
        Servicios de tu sector
      </p>
      <div className={styles.chips}>
        {servicios.map((s, i) => (
          <span key={s} className={cx(styles.chip, styles.escalon)} style={esc(4 + i * 0.5)}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function PantallaCalendario() {
  const opciones = [
    { nombre: "Google Calendar", Icono: () => <SiGooglecalendar color="default" aria-hidden="true" />, conectado: true },
    { nombre: "Outlook", Icono: () => <MicrosoftLogo />, conectado: false },
    { nombre: "iCloud", Icono: () => <SiApple color="#0a0a0a" aria-hidden="true" />, conectado: false },
  ];
  return (
    <div className={cx(styles.pantalla, styles.agenda)} role="img" aria-label="Conectar calendario: Google Calendar conectado; también hay Outlook e iCloud.">
      <p className={cx(styles.altaTitulo, styles.escalon)} style={esc(0)}>
        Tu calendario
      </p>
      <div className={styles.proveedores}>
        {opciones.map(({ nombre, Icono, conectado }, i) => (
          <div key={nombre} className={cx(styles.proveedor, conectado && styles.proveedorConectado, styles.escalon)} style={esc(i + 1)}>
            <Icono />
            <span>{nombre}</span>
            {conectado ? (
              <span className={styles.conectado}>
                <Check aria-hidden="true" /> Conectado
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <p className={cx(styles.altaNota, styles.escalon)} style={esc(4)}>
        Las citas se apuntan donde ya miras tu agenda.
      </p>
    </div>
  );
}

function PantallaDesvio() {
  return (
    <div className={cx(styles.pantalla, styles.agenda)} role="img" aria-label="Activar el desvío: se marca el código que indica Alhabla y el desvío queda activado.">
      <p className={cx(styles.altaTitulo, styles.escalon)} style={esc(0)}>
        Desvío si no contestas
      </p>
      <p className={cx(styles.codigo, styles.escalon)} style={esc(1)}>
        **61*<span className={styles.codigoNumero}>tu número Alhabla</span>#
      </p>
      <div className={cx(styles.marcar, styles.escalon)} style={esc(2)}>
        <Phone color="#fff" strokeWidth={2.4} aria-hidden="true" />
      </div>
      <p className={cx(styles.desvioOk, styles.escalon)} style={esc(4)}>
        <Check aria-hidden="true" /> Desvío activado
      </p>
      <p className={cx(styles.altaNota, styles.escalon)} style={esc(5)}>
        Tu número de siempre no cambia.
      </p>
    </div>
  );
}

const PANTALLAS: Record<Pantalla, { oscuro: boolean; Componente: () => JSX.Element }> = {
  llamada: { oscuro: true, Componente: PantallaLlamada },
  agenda: { oscuro: false, Componente: PantallaAgenda },
  confirmacion: { oscuro: false, Componente: PantallaConfirmacion },
  aviso: { oscuro: false, Componente: PantallaAviso },
  hueco: { oscuro: false, Componente: PantallaHueco },
  voz: { oscuro: true, Componente: PantallaVoz },
  equipo: { oscuro: false, Componente: PantallaEquipo },
  recordatorio: { oscuro: false, Componente: PantallaRecordatorio },
  cambio: { oscuro: false, Componente: PantallaCambio },
  espera: { oscuro: false, Componente: PantallaEspera },
  gestorBaja: { oscuro: false, Componente: PantallaGestorBaja },
  gestorCierre: { oscuro: false, Componente: PantallaGestorCierre },
  alta: { oscuro: false, Componente: PantallaAlta },
  calendario: { oscuro: false, Componente: PantallaCalendario },
  desvio: { oscuro: false, Componente: PantallaDesvio },
};
