import { relato, type GuionRelato } from "@/lib/relato-guiones";
import styles from "./pantalla-bloqueo.module.css";

/**
 * La pantalla de bloqueo del portátil, en el relevo de «En tu bolsillo» a
 * «En tu negocio» (ver `lib/transicion-bolsillo-negocio.ts`): mientras el
 * teléfono se convierte en la pantalla del portátil, en ese negro aparecen
 * la hora (la del teléfono, dos minutos después) y lo que de verdad le
 * llega al dueño de la cita nueva: el aviso de WhatsApp de Alhabla, con su
 * texto real y sus dos botones (`relato().avisos`). Luego la pantalla se
 * desbloquea y en el panel está esa cita.
 *
 * Se pinta dos veces con el mismo marcado: dentro del rectángulo negro de
 * «En tu bolsillo» y dentro de la pantalla HTML del portátil (`.mx`). Todo se
 * mide en `--u` (1/1200 del ancho de la pantalla), así que las dos copias
 * coinciden al píxel cuando el rectángulo llega a la pantalla del portátil.
 * Lo que aparece y cuándo lo pone `pintarBloqueo` (lib/pantalla-bloqueo.ts)
 * con los `data-bloqueo` de cada pieza; empiezan invisibles.
 */
export function PantallaBloqueo({ guion }: { guion: GuionRelato }) {
  const { avisos } = relato(guion);
  return (
    <div className={styles.bloqueo} aria-hidden="true">
      <div className={styles.contenido}>
        <div className={styles.reloj} data-bloqueo="reloj">
          <p className={styles.fecha}>Miércoles, 30 de septiembre</p>
          <p className={styles.hora}>17:04</p>
        </div>
        <ul className={styles.avisos}>
          {avisos.map((aviso, i) => (
            <li
              key={aviso.titulo}
              className={styles.aviso}
              data-bloqueo={`aviso-${i}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- isotipo local */}
              <img
                src="/brand/alhabla-isotipo.svg"
                alt=""
                className={styles.icono}
              />
              <div className={styles.cuerpo}>
                <p className={styles.app}>
                  <span>{aviso.app}</span>
                  <span>{aviso.hace}</span>
                </p>
                <p className={styles.cabecera}>
                  <b>{aviso.titulo}</b>
                </p>
                <p className={styles.texto}>{aviso.texto}</p>
                <div className={styles.botones}>
                  {aviso.botones.map((boton) => (
                    <span key={boton}>{boton}</span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
