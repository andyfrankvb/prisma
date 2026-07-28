/**
 * Types: Notification Service
 * File: src/notifications/notification.types.ts
 */

export type NotificationChannel = 'email' | 'inapp';

export type NotificationEventType =
  | 'DEADLINE_1_DAY'
  | 'DEADLINE_OVERDUE'
  | 'VOBO_APROBADO'
  | 'TAREA_COMENTARIO'
  | 'TAREA_ESTADO'
  | 'TAREA_FECHA_COMPROMISO'
  | 'TAREA_ASIGNADA'
  | 'TRAMITE_NUEVO'
  | 'TRAMITE_APROBADO'
  | 'TRAMITE_RECHAZADO'
  | 'TRAMITE_FINALIZADO'
  | 'TRAMITE_DEVUELTO_DELEGADO'
  | 'TRAMITE_DEVUELTO_JURIDICO'
  | 'TRAMITE_NUEVO_COMENTARIO'
  | 'TAREA_EN_REVISION'
  | 'TAREA_DEVUELTA'
  | 'TAREA_COMPLETADA'
  | 'TAREA_EN_REVISION_DG'
  | 'TAREA_APROBADA_N1'
  | 'TAREA_COMPLETADA_DG'
  | 'TAREA_DEVUELTA_DG';

export interface NotificationPayload {
  event:       NotificationEventType;
  oficio_id?:  number;
  folio?:      string;
  dependencia_origen?: string;
  fecha_vencimiento?: string | null;
  // Campos para notificaciones de eventos/tareas
  tarea_id?:      number;
  evento_titulo?: string;
  tarea_titulo?:  string;
  autor_nombre?:  string;
  /** Resolved recipient user IDs — populated by the dispatcher */
  recipients?: RecipientInfo[];
}

export interface RecipientInfo {
  user_id:    number;
  nombre:     string;
  email:      string;
  oficina_id: number;
}

export interface EmailMessage {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
}

export interface InAppMessage {
  user_id:        number;
  type:           NotificationEventType;
  title:          string;
  body:           string;
  oficio_id?:     number;
  folio?:         string;
  tarea_id?:      number;
  evento_titulo?: string;
  tramite_id?:    number;
  read:           boolean;
  created_at:     Date;
}
