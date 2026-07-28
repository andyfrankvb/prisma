/**
 * Utilidades para mostrar, de forma sutil, cuánto se optimizó un archivo
 * al subirlo (el backend devuelve `compresion` en la respuesta de subida).
 */

export interface Compresion {
  original_bytes: number;
  final_bytes:    number;
  ahorro_pct:     number;
}

/** Formatea bytes a una unidad legible (KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Texto sutil tipo: "Optimizado: 3.38 MB → 0.25 MB (93% menos)".
 * Devuelve null si no hubo compresión (para no mostrar nada).
 */
export function textoCompresion(c?: Compresion | null): string | null {
  if (!c || !c.ahorro_pct || c.final_bytes >= c.original_bytes) return null;
  return `Optimizado: ${formatBytes(c.original_bytes)} → ${formatBytes(c.final_bytes)} (${c.ahorro_pct}% menos)`;
}
