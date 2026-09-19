/**
 * Types: Máquinas
 * File: src/modules/maquinas/maquinas.types.ts
 *
 * Migrado desde SID (src/app/services/maquina.service.ts + backend
 * Http/Controllers/MaquinaController.php). Mismo contrato: numero_maquina
 * único por oficina, libre indica disponibilidad.
 */

export interface Maquina {
  id_maquina:     number;
  numero_maquina: string;
  oficina:        string;
  libre:          boolean;
  fecha_registro: string;
}

/** Payload de alta y de edición — la edición reemplaza el recurso completo,
 *  igual que el `update()` validado del legacy (PUT, no PATCH parcial). */
export interface MaquinaPayload {
  numero_maquina: string;
  oficina:        string;
  libre:          boolean;
}

export interface FiltrosMaquina {
  search?: string;
  libre?:  boolean;
}
