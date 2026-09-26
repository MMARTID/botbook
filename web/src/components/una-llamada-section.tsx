"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Phone } from "lucide-react";
import { SiApple, SiGooglecalendar } from "@icons-pack/react-simple-icons";

import { MicrosoftLogo } from "@/components/brand-icons";
import { Reveal } from "@/components/scroll-reveal";
import styles from "./una-llamada.module.css";

/**
 * «Una llamada, de principio a fin» (2026-09-26): sustituye a «Cómo
 * funciona», al reparto, a El Gestor y a los datos del sector de la portada,
 * que contaban lo mismo en cuatro bloques.
 *
 * Un teléfono fijo (sticky) y tres pasos que se leen con el scroll NATIVO:
 * el texto no se mueve por su cuenta ni se superpone, simplemente pasa. El
 * paso que cruza la «línea de lectura» decide la pantalla del teléfono — en
 * escritorio, el centro de la ventana; en móvil, el centro del hueco que
 * queda bajo el teléfono. La pantalla anterior se va de golpe y la nueva
 * entra (nunca hay dos textos a la vez), con sus piezas escalonadas.
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

export function UnaLlamadaSection() {
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
      // En móvil el teléfono tapa la parte de arriba: se lee en el hueco
      // que queda debajo.
      const bajoTelefono = escritorio.matches
        ? 0
        : (zonaTelefono.current?.getBoundingClientRect().bottom ?? 0);
      // En móvil la línea va en el tercio alto del hueco: el paso se activa
      // cuando ya cabe entero debajo del teléfono.
      const arriba = Math.max(bajoTelefono, 0);
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

  return (
    <section
      id="como-funciona"
      className="scroll-m-20 border-b border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24"
      aria-labelledby="una-llamada-titulo"
    >
      <div
        className={`mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${styles.escena}`}
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

        <div ref={zonaTelefono} className={styles.areaTelefono}>
          <div className={styles.telefono}>
            <div className={styles.hueco}>
              <span className={styles.isla} aria-hidden="true" />
              <Estado oscuro={activo === 0} />
              <div
                key={activo}
                className={styles.pantallaMarco}
                data-direccion={direccion}
              >
                {activo === 0 ? (
                  <PantallaLlamada />
                ) : activo === 1 ? (
                  <PantallaAgenda />
                ) : (
                  <PantallaWhatsApp />
                )}
              </div>
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

        <ol className={styles.areaPasos}>
          {PASOS.map((paso, i) => (
            <li
              key={paso.titulo}
              ref={(el) => {
                pasos.current[i] = el;
              }}
              className={styles.paso}
              data-activo={i === activo ? "" : undefined}
              aria-current={i === activo ? "step" : undefined}
            >
              <span className={styles.pasoNumero}>{i + 1}</span>
              <div className="min-w-0">
                <h3 className={styles.pasoTitulo}>{paso.titulo}</h3>
                <p className={styles.pasoTexto}>{paso.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Índice de escalonado para las piezas de cada pantalla. */
const esc = (i: number) => ({ ["--i" as string]: i });

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
      <div className={`${styles.llamante} ${styles.escalon}`} style={esc(0)}>
        <p className={styles.llamanteNombre}>Laura</p>
        <p className={styles.llamanteDato}>Atiende Alhabla · 00:41</p>
      </div>
      <div className={styles.transcripcion}>
        <p
          className={`${styles.burbuja} ${styles.burbujaCliente} ${styles.escalon}`}
          style={esc(1)}
        >
          <span className={styles.quien}>Laura</span>
          ¿Tenéis hueco mañana para corte y color?
        </p>
        <p
          className={`${styles.burbuja} ${styles.burbujaAlhabla} ${styles.escalon}`}
          style={esc(3)}
        >
          <span className={styles.quien}>Alhabla</span>
          Mañana a las 17:30 con Marta. ¿Te la reservo?
        </p>
        <p
          className={`${styles.burbuja} ${styles.burbujaCliente} ${styles.escalon}`}
          style={esc(5)}
        >
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
      <div
        className={`${styles.agendaCabecera} ${styles.escalon}`}
        style={esc(0)}
      >
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
        {AGENDA.map((franja, i) => (
          <div
            key={franja.hora}
            className={`${styles.franja} ${styles.escalon}`}
            style={esc(i + 1)}
          >
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
      <div className={`${styles.calendarios} ${styles.escalon}`} style={esc(7)}>
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
        <span className={`${styles.waFecha} ${styles.escalon}`} style={esc(0)}>
          Hoy
        </span>
        <p className={`${styles.waMensaje} ${styles.escalon}`} style={esc(1)}>
          Hola, Laura. Tu cita está confirmada:
          <br />
          <strong>Corte y color</strong>
          <br />
          Jueves a las 17:30 con Marta
          <br />
          Peluquería Nuria
          <span className={styles.waHora}>17:03</span>
        </p>
        <span className={`${styles.waBoton} ${styles.escalon}`} style={esc(2)}>
          Cancelar cita
        </span>
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
