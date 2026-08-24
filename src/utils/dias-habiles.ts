/**
 * Días hábiles.
 *
 * Hoy solo se descartan sábados y domingos. Los días festivos oficiales
 * requerirían un catálogo que alguien mantenga cada año; cuando exista, basta
 * con alimentar `FESTIVOS` desde la base y el resto sigue funcionando igual.
 */

/** Festivos en formato AAAA-MM-DD. Vacío mientras no haya catálogo. */
const FESTIVOS = new Set<string>();

const aClave = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ¿Es día hábil? Sábado y domingo no lo son. */
export function esHabil(fecha: Date): boolean {
  const dia = fecha.getDay();
  if (dia === 0 || dia === 6) return false;
  return !FESTIVOS.has(aClave(fecha));
}

/**
 * La fecha que resulta de avanzar `dias` hábiles desde `desde`.
 * El día de partida no cuenta: sumar 1 desde un viernes da el lunes.
 */
export function sumarDiasHabiles(desde: Date, dias: number): Date {
  const fecha = new Date(desde.getTime());
  fecha.setHours(0, 0, 0, 0);
  let restantes = dias;
  while (restantes > 0) {
    fecha.setDate(fecha.getDate() + 1);
    if (esHabil(fecha)) restantes--;
  }
  return fecha;
}

/**
 * Días hábiles transcurridos entre dos fechas, sin contar el día de inicio.
 * Se usa para decir «lleva 3 días» en la pantalla.
 */
export function diasHabilesEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde.getTime()); a.setHours(0, 0, 0, 0);
  const b = new Date(hasta.getTime()); b.setHours(0, 0, 0, 0);
  if (b <= a) return 0;

  let cuenta = 0;
  const cursor = new Date(a.getTime());
  while (cursor < b) {
    cursor.setDate(cursor.getDate() + 1);
    if (esHabil(cursor)) cuenta++;
  }
  return cuenta;
}

/** Solo la fecha, sin hora, en el formato que espera una columna DATE. */
export function aFechaSql(fecha: Date): string {
  return aClave(fecha);
}
