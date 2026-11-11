/**
 * Días hábiles — versión del navegador.
 *
 * Es el gemelo de `src/utils/dias-habiles.ts`, que es donde el servidor calcula
 * los vencimientos. Está duplicado porque el frontend se monta como
 * `src_frontend/` dentro del contenedor y no alcanza a `src/utils`, no porque
 * sean reglas distintas: **si una cambia, la otra tiene que cambiar igual**, o el
 * contador dirá una cosa y el vencimiento guardado dirá otra.
 *
 * Hoy solo se descartan sábados y domingos. El catálogo de días festivos todavía
 * no existe en ninguno de los dos lados; cuando exista, hay que alimentarlo aquí
 * y allá.
 */

/** ¿Es día hábil? Sábado y domingo no lo son. */
export function esHabil(fecha: Date): boolean {
  const dia = fecha.getDay();
  return dia !== 0 && dia !== 6;
}

/**
 * Convierte `2026-09-04` a una fecha local a medianoche.
 *
 * No se usa `new Date(cadena)` a secas: esa forma interpreta la fecha como UTC y
 * en Quintana Roo el resultado se corre un día entero, así que el contador
 * mostraría un día de más o de menos.
 */
export function aFechaLocal(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Días hábiles entre dos fechas, sin contar el día de inicio y contando el final.
 * Misma definición que `diasHabilesEntre` del servidor.
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

export interface CuentaPlazo {
  /** 'restan' antes del vencimiento, 'hoy' el mismo día, 'vencido' después. */
  estado: 'restan' | 'hoy' | 'vencido';
  /** Días hábiles que faltan, o que ya pasaron desde el vencimiento. */
  dias:   number;
}

/**
 * Cuánto falta —o cuánto lleva pasado— un vencimiento, en días hábiles.
 *
 * Se cuenta en hábiles y no en naturales porque así se fijó el plazo: un término
 * que cae en viernes no está «vencido hace 2 días» el domingo, porque en ese par
 * de días nadie pudo trabajar.
 */
export function cuentaPlazo(iso?: string | null): CuentaPlazo | null {
  if (!iso) return null;
  const hoy   = new Date(); hoy.setHours(0, 0, 0, 0);
  const vence = aFechaLocal(iso);

  if (vence.getTime() === hoy.getTime()) return { estado: 'hoy', dias: 0 };
  if (vence > hoy) return { estado: 'restan',  dias: diasHabilesEntre(hoy, vence) };
  return { estado: 'vencido', dias: diasHabilesEntre(vence, hoy) };
}
