"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Phone } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { SiApple, SiGooglecalendar } from "@icons-pack/react-simple-icons";

import { MicrosoftLogo } from "@/components/brand-icons";
import { Reveal } from "@/components/scroll-reveal";
import styles from "./una-llamada.module.css";

/**
 * «Una llamada, de principio a fin» (2026-09-26): sustituye a «Cómo
 * funciona», al reparto, a El Gestor y a los datos del sector de la portada,
 * que contaban lo mismo en cuatro bloques.
 *
 * Un teléfono FIJO (render) y tres pasos al lado. La pantalla cambia al
 * pulsar un paso, o sola cada pocos segundos mientras la sección está a la
 * vista y nadie ha tocado nada. Nada va ligado al scroll y nunca hay dos
 * textos a la vez: la pantalla anterior se va y la nueva entra.
 */

const PASOS = [
  {
    titulo: "Si no puedes cogerlo, contesta Alhabla",
    texto:
      "Activas un desvío en tu número de siempre: solo las llamadas que no atiendes van a Alhabla, que resuelve dudas de precios y horarios con tus datos.",
  },
  {
    titulo: "Busca hueco en tu agenda real",
    texto:
      "Mira tu horario y tu calendario de Google, Outlook o iCloud antes de ofrecer una hora. Si no hay sitio, propone la más cercana.",
  },
  {
    titulo: "La cita entra y el cliente la recibe",
    texto:
      "Queda apuntada en tu calendario y al cliente le llega la confirmación por WhatsApp, con un botón por si tiene que cancelar.",
  },
] as const;

/** Lo que tarda cada pantalla en pasar sola a la siguiente. */
const DURACION_MS = 6500;

export function UnaLlamadaSection() {
  const [activo, setActivo] = useState(0);
  // En cuanto la visitante pulsa un paso, el avance automático se para para
  // siempre: manda ella.
  const [manual, setManual] = useState(false);
  const [enVista, setEnVista] = useState(false);
  const reducirMovimiento = useReducedMotion();
  const telefono = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = telefono.current;
    if (!el) return;
    const observador = new IntersectionObserver(
      ([entrada]) => setEnVista(entrada.isIntersecting),
      { threshold: 0.5 }
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const automatico = !manual && !reducirMovimiento;

  return (
    <section
      id="como-funciona"
      className="scroll-m-20 overflow-x-clip border-b border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24"
      aria-labelledby="una-llamada-titulo"
    >
      <div
        className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${styles.rejilla}`}
      >
        <Reveal className={`max-w-2xl ${styles.areaTitulo}`}>
          <h2
            id="una-llamada-titulo"
            className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl"
          >
            Así se atiende una llamada que antes perdías.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8">
            En los salones, más de un tercio de las llamadas se quedan sin
            respuesta
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
          </p>
        </Reveal>

        <ol className={`-mx-2 flex flex-col gap-2 sm:mx-0 ${styles.areaPasos}`}>
          {PASOS.map((paso, i) => {
            const esActivo = i === activo;
            return (
              <li key={paso.titulo}>
                <button
                  type="button"
                  onClick={() => {
                    setManual(true);
                    setActivo(i);
                  }}
                  aria-current={esActivo ? "step" : undefined}
                  className={`relative flex w-full gap-4 rounded-2xl px-6 py-5 text-left transition-[background-color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] active:scale-[0.99] ${
                    esActivo
                      ? "bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_8px_24px_-12px_rgba(10,10,10,0.12)] ring-1 ring-[#e5e5e5]"
                      : "hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums transition-colors duration-200 ${
                      esActivo
                        ? "bg-[#8b5cf6] text-white"
                        : "bg-[#ececef] text-[#71717a]"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-lg font-bold tracking-tight transition-colors duration-200 ${esActivo ? "text-[#0a0a0a]" : "text-[#52525b]"}`}
                    >
                      {paso.titulo}
                    </span>
                    {/* La descripción solo se enseña en el paso activo: los
                          otros quedan en una línea y la lista no pesa. */}
                    <span
                      className={`mt-1.5 text-base leading-7 text-[#52525b] ${esActivo ? "block" : "hidden"}`}
                    >
                      {paso.texto}
                    </span>
                  </span>
                  {esActivo && automatico ? (
                    <span
                      key={activo}
                      aria-hidden="true"
                      className={styles.barra}
                      style={{
                        ["--duracion" as string]: `${DURACION_MS}ms`,
                        animationPlayState: enVista ? "running" : "paused",
                      }}
                      onAnimationEnd={() =>
                        setActivo((a) => (a + 1) % PASOS.length)
                      }
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>

        <div className={styles.areaTelefono}>
          <div ref={telefono} className={styles.telefono}>
            <div className={styles.hueco}>
              <span className={styles.isla} aria-hidden="true" />
              <Estado oscuro={activo === 0} />
              {activo === 0 ? (
                <PantallaLlamada key="0" />
              ) : activo === 1 ? (
                <PantallaAgenda key="1" />
              ) : (
                <PantallaWhatsApp key="2" />
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- render local, el marco del teléfono */}
            <img
              src="/telefono/frente.webp"
              alt=""
              className={styles.marco}
              width={1335}
              height={2859}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Estado({ oscuro }: { oscuro: boolean }) {
  return (
    <div
      className={styles.estado}
      style={{ color: oscuro ? "#fff" : "#0a0a0a" }}
      aria-hidden="true"
    >
      <span>17:02</span>
      <span>5G</span>
    </div>
  );
}

const ONDA = [30, 55, 80, 45, 95, 60, 35, 70, 50, 25, 65, 40];

function PantallaLlamada() {
  return (
    <div
      className={`${styles.pantalla} ${styles.llamada}`}
      role="img"
      aria-label="Llamada atendida por Alhabla: la clienta pide cita para mañana y Alhabla le ofrece las 17:30 con Marta."
    >
      <div className={styles.llamante}>
        <p className={styles.llamanteNombre}>Laura</p>
        <p className={styles.llamanteDato}>Atiende Alhabla · 00:41</p>
      </div>
      <div className={styles.transcripcion}>
        <p className={`${styles.burbuja} ${styles.burbujaCliente}`}>
          <span className={styles.quien}>Laura</span>
          ¿Tenéis hueco mañana para corte y color?
        </p>
        <p className={`${styles.burbuja} ${styles.burbujaAlhabla}`}>
          <span className={styles.quien}>Alhabla</span>
          Mañana a las 17:30 con Marta. ¿Te la reservo?
        </p>
        <p className={`${styles.burbuja} ${styles.burbujaCliente}`}>
          <span className={styles.quien}>Laura</span>
          Sí, perfecto.
        </p>
      </div>
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

const AGENDA = [
  { hora: "15:00", tipo: "cita", servicio: "Alisado", cliente: "Rosa" },
  { hora: "16:00", tipo: "cita", servicio: "Mechas", cliente: "Carmen" },
  { hora: "17:00", tipo: "cita", servicio: "Corte", cliente: "Javier" },
  { hora: "17:30", tipo: "nueva", servicio: "Corte y color", cliente: "Laura" },
  { hora: "19:00", tipo: "cita", servicio: "Peinado", cliente: "Elena" },
  { hora: "19:45", tipo: "libre" },
] as const;

function PantallaAgenda() {
  return (
    <div
      className={`${styles.pantalla} ${styles.agenda}`}
      role="img"
      aria-label="Agenda de mañana: la cita de Laura, corte y color a las 17:30 con Marta, entra en el único hueco libre."
    >
      <div className={styles.agendaCabecera}>
        <div>
          <p className={styles.agendaDia}>Mañana</p>
          <p className={styles.agendaFecha}>Jueves · Marta</p>
        </div>
        <SiGooglecalendar
          className={styles.agendaIcono}
          color="default"
          aria-hidden="true"
        />
      </div>
      <div className={styles.franjas}>
        {AGENDA.map((franja) => (
          <div key={franja.hora} className={styles.franja}>
            <span className={styles.franjaHora}>{franja.hora}</span>
            {franja.tipo === "libre" ? (
              <span className={styles.libre}>Libre</span>
            ) : (
              <span
                className={
                  franja.tipo === "nueva" ? styles.citaNueva : styles.cita
                }
              >
                {franja.tipo === "nueva" ? (
                  <span className={styles.etiquetaNueva}>Nueva</span>
                ) : null}
                <span className={styles.citaTitulo}>{franja.servicio}</span>
                {franja.cliente}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className={styles.calendarios}>
        <SiGooglecalendar color="default" aria-hidden="true" />
        <MicrosoftLogo />
        <SiApple color="#0a0a0a" aria-hidden="true" />
        <span>Tu calendario de siempre</span>
      </div>
    </div>
  );
}

function PantallaWhatsApp() {
  return (
    <div
      className={`${styles.pantalla} ${styles.whatsapp}`}
      role="img"
      aria-label="WhatsApp de confirmación a Laura: cita de corte y color el jueves a las 17:30 con Marta, con un botón para cancelar."
    >
      <div className={styles.waCabecera}>
        <span className={styles.waAvatar} aria-hidden="true">
          A
        </span>
        <div>
          <p className={styles.waNombre}>Alhabla Reservas</p>
          <p className={styles.waSub}>Cuenta de empresa</p>
        </div>
      </div>
      <div className={styles.waChat}>
        <span className={styles.waFecha}>Hoy</span>
        <p className={styles.waMensaje}>
          Hola, Laura. Tu cita está confirmada:
          <br />
          <strong>Corte y color</strong>
          <br />
          Jueves a las 17:30 con Marta
          <br />
          Peluquería Nuria
          <span className={styles.waHora}>17:03</span>
        </p>
        <span className={styles.waBoton}>Cancelar cita</span>
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
