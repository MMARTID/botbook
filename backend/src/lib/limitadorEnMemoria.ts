/**
 * Limitador de respaldo, en la memoria de cada instancia.
 *
 * El límite global usa Redis con `skipOnError: true` (server.ts): si Redis no
 * responde, la petición pasa. Es una decisión deliberada —preferimos
 * quedarnos sin límite un rato a devolver 500 en toda la API— pero en
 * `/auth/*` fallar abierto significa probar contraseñas sin freno justo
 * cuando nadie está contando (auditoría del 24-09).
 *
 * Esto no sustituye al de Redis: se queda por encima, con un techo más alto,
 * así que en marcha normal no se nota y solo muerde cuando el otro se ha
 * rendido. Al ser por instancia, el límite real se multiplica por el número
 * de instancias de Cloud Run; sigue siendo infinitamente mejor que nada.
 */

type Ventana = { hasta: number; cuenta: number };

export class LimitadorEnMemoria {
  private readonly ventanas = new Map<string, Ventana>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number
  ) {}

  /** `true` si esta petición pasa; `false` si se ha pasado del techo. */
  permite(clave: string): boolean {
    const ahora = Date.now();
    this.limpiar(ahora);
    const ventana = this.ventanas.get(clave);
    if (!ventana || ventana.hasta <= ahora) {
      this.ventanas.set(clave, { hasta: ahora + this.ventanaMs, cuenta: 1 });
      return true;
    }
    ventana.cuenta += 1;
    return ventana.cuenta <= this.maximo;
  }

  /** Barrido perezoso: sin esto el Map crecería con cada IP nueva. */
  private limpiar(ahora: number): void {
    if (this.ventanas.size < 1_000) return;
    for (const [clave, ventana] of this.ventanas) {
      if (ventana.hasta <= ahora) this.ventanas.delete(clave);
    }
  }

  /** Solo para los tests. */
  vaciar(): void {
    this.ventanas.clear();
  }
}
