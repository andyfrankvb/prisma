/**
 * Templates: Email & In-App notification content
 * File: src/notifications/templates.ts
 *
 * All templates are pure functions — no side effects.
 */

import type { NotificationEventType } from './notification.types';

interface TemplateVars {
  folio:             string;
  dependencia_origen: string;
  fecha_vencimiento?: string | null;
  nombre_destinatario?: string;
  // Campos para notificaciones de eventos/tareas
  tarea_titulo?:  string;
  evento_titulo?: string;
  autor_nombre?:  string;
}

interface RenderedTemplate {
  subject: string;
  html:    string;
  text:    string;
  /** Short title for in-app push */
  inAppTitle: string;
  /** Short body for in-app push */
  inAppBody:  string;
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────

function htmlWrap(accentColor: string, icon: string, subject: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:${accentColor};padding:24px 32px;text-align:center;">
              <span style="font-size:2rem;">${icon}</span>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:1.1rem;font-weight:700;">
                Oficialía de Partes
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;padding:16px 32px;text-align:center;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:0.75rem;color:#9CA3AF;">
                Este es un mensaje automático del Sistema de Gestión de Oficios.<br/>
                Por favor no responda a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// ── Template: DEADLINE_1_DAY ──────────────────────────────────────────────────

function templateDeadline1Day(vars: TemplateVars): RenderedTemplate {
  const subject    = `⚠️ URGENTE: Oficio ${vars.folio} vence en 24 horas`;
  const inAppTitle = `⚠️ Oficio ${vars.folio} vence mañana`;
  const inAppBody  = `El oficio de ${vars.dependencia_origen} requiere respuesta inmediata.`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#003366;font-size:1.1rem;">Aviso de Vencimiento Próximo</h2>
    <p style="color:#374151;line-height:1.6;">
      Estimado/a <strong>${vars.nombre_destinatario ?? 'usuario'}</strong>,
    </p>
    <p style="color:#374151;line-height:1.6;">
      El siguiente oficio <strong>vence en menos de 24 horas</strong> y requiere atención inmediata:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td style="padding:6px 0;"><strong>Folio:</strong></td><td>${vars.folio}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Dependencia:</strong></td><td>${vars.dependencia_origen}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Fecha límite:</strong></td><td style="color:#92400E;font-weight:700;">${vars.fecha_vencimiento ?? '—'}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      Por favor ingrese al sistema y complete la gestión correspondiente a la brevedad.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.APP_URL ?? '#'}/dashboard"
         style="background:#003366;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        Ir al Sistema
      </a>
    </div>`;

  return {
    subject,
    inAppTitle,
    inAppBody,
    html: htmlWrap('#F59E0B', '⚠️', subject, bodyHtml),
    text: `URGENTE: El oficio ${vars.folio} de ${vars.dependencia_origen} vence el ${vars.fecha_vencimiento ?? '—'}. Ingrese al sistema para atenderlo.`,
  };
}

// ── Template: DEADLINE_OVERDUE ────────────────────────────────────────────────

function templateDeadlineOverdue(vars: TemplateVars): RenderedTemplate {
  const subject    = `🚨 VENCIDO: Oficio ${vars.folio} superó su fecha límite`;
  const inAppTitle = `🚨 Oficio ${vars.folio} está VENCIDO`;
  const inAppBody  = `El oficio de ${vars.dependencia_origen} superó su fecha límite sin respuesta.`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#EF4444;font-size:1.1rem;">⚠ Oficio Vencido Sin Respuesta</h2>
    <p style="color:#374151;line-height:1.6;">
      Estimado/a <strong>${vars.nombre_destinatario ?? 'usuario'}</strong>,
    </p>
    <p style="color:#374151;line-height:1.6;">
      El siguiente oficio ha <strong>superado su fecha límite de respuesta</strong>:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEE2E2;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td style="padding:6px 0;"><strong>Folio:</strong></td><td>${vars.folio}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Dependencia:</strong></td><td>${vars.dependencia_origen}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Fecha límite:</strong></td><td style="color:#EF4444;font-weight:700;">${vars.fecha_vencimiento ?? '—'}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      Se requiere acción inmediata. Este incidente puede generar consecuencias legales o administrativas.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.APP_URL ?? '#'}/dashboard"
         style="background:#EF4444;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        Atender Ahora
      </a>
    </div>`;

  return {
    subject,
    inAppTitle,
    inAppBody,
    html: htmlWrap('#EF4444', '🚨', subject, bodyHtml),
    text: `VENCIDO: El oficio ${vars.folio} de ${vars.dependencia_origen} superó su fecha límite (${vars.fecha_vencimiento ?? '—'}). Requiere atención urgente.`,
  };
}

// ── Template: VOBO_APROBADO ───────────────────────────────────────────────────

function templateVoboAprobado(vars: TemplateVars): RenderedTemplate {
  const subject    = `📝 Documento listo para firma: ${vars.folio}`;
  const inAppTitle = `📝 Oficio ${vars.folio} listo para firma`;
  const inAppBody  = `El encargado ha dado el visto bueno. Ya puede descargar el archivo para firma autógrafa.`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#003366;font-size:1.1rem;">Documento Aprobado — Listo para Firma</h2>
    <p style="color:#374151;line-height:1.6;">
      Estimada Secretaría,
    </p>
    <p style="color:#374151;line-height:1.6;">
      El encargado ha otorgado el <strong>Visto Bueno</strong> al siguiente oficio.
      Ya puede proceder a descargar el documento para firma autógrafa:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#D1FAE5;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td style="padding:6px 0;"><strong>Folio:</strong></td><td>${vars.folio}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Dependencia:</strong></td><td>${vars.dependencia_origen}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      Una vez firmado, por favor escanee el documento y súbalo al sistema para cerrar el expediente.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.APP_URL ?? '#'}/dashboard/gestion"
         style="background:#10B981;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        Ir a Gestión
      </a>
    </div>`;

  return {
    subject,
    inAppTitle,
    inAppBody,
    html: htmlWrap('#10B981', '📝', subject, bodyHtml),
    text: `El oficio ${vars.folio} de ${vars.dependencia_origen} tiene VoBo aprobado. Descargue el documento para firma autógrafa.`,
  };
}

// ── Template: TAREA_EN_REVISION ───────────────────────────────────────────────

function templateTareaEnRevision(vars: TemplateVars): RenderedTemplate {
  const tarea  = vars.tarea_titulo  ?? 'Sin título';
  const evento = vars.evento_titulo ?? 'Sin evento';
  const autor  = vars.autor_nombre  ?? 'Un operativo';

  const subject    = `📋 Tarea enviada a revisión: ${tarea}`;
  const inAppTitle = 'Tarea enviada a revisión';
  const inAppBody  = `${autor} envió avance en la tarea "${tarea}" del evento "${evento}"`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#003366;font-size:1.1rem;">Avance enviado a revisión</h2>
    <p style="color:#374151;line-height:1.6;">
      <strong>${autor}</strong> ha enviado un avance para revisión en la siguiente tarea:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td style="padding:6px 0;"><strong>Tarea:</strong></td><td>${tarea}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Evento:</strong></td><td>${evento}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      Por favor revise el avance y apruébelo o devuélvalo con comentarios.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.APP_URL ?? '#'}/dashboard"
         style="background:#003366;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        Revisar Avance
      </a>
    </div>`;

  return {
    subject,
    inAppTitle,
    inAppBody,
    html: htmlWrap('#3B82F6', '📋', subject, bodyHtml),
    text: `${autor} envió avance en la tarea "${tarea}" del evento "${evento}". Ingrese al sistema para revisarlo.`,
  };
}

// ── Template: TAREA_DEVUELTA ──────────────────────────────────────────────────

function templateTareaDevuelta(vars: TemplateVars): RenderedTemplate {
  const tarea = vars.tarea_titulo ?? 'Sin título';

  const subject    = `↩️ Tarea devuelta: ${tarea}`;
  const inAppTitle = 'Tarea devuelta';
  const inAppBody  = `Tu avance en "${tarea}" fue devuelto con comentarios`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#92400E;font-size:1.1rem;">Avance devuelto con comentarios</h2>
    <p style="color:#374151;line-height:1.6;">
      Tu avance en la siguiente tarea fue revisado y devuelto:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td style="padding:6px 0;"><strong>Tarea:</strong></td><td>${tarea}</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      Por favor revise los comentarios del revisor y actualice su avance.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.APP_URL ?? '#'}/dashboard"
         style="background:#F59E0B;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        Ver Comentarios
      </a>
    </div>`;

  return {
    subject,
    inAppTitle,
    inAppBody,
    html: htmlWrap('#F59E0B', '↩️', subject, bodyHtml),
    text: `Tu avance en "${tarea}" fue devuelto con comentarios. Ingrese al sistema para ver los detalles.`,
  };
}

// ── Template: TAREA_COMPLETADA ────────────────────────────────────────────────

function templateTareaCompletada(vars: TemplateVars): RenderedTemplate {
  const tarea = vars.tarea_titulo ?? 'Sin título';

  const subject    = `✅ Tarea aprobada: ${tarea}`;
  const inAppTitle = 'Tarea aprobada';
  const inAppBody  = `Tu avance en "${tarea}" fue aprobado. La tarea está completada`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#065F46;font-size:1.1rem;">¡Avance aprobado!</h2>
    <p style="color:#374151;line-height:1.6;">
      Tu avance en la siguiente tarea fue aprobado exitosamente:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#D1FAE5;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td style="padding:6px 0;"><strong>Tarea:</strong></td><td>${tarea}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Estado:</strong></td><td style="color:#065F46;font-weight:700;">Completada ✓</td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      La tarea ha sido marcada como completada. ¡Buen trabajo!
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.APP_URL ?? '#'}/dashboard"
         style="background:#10B981;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        Ver Tarea
      </a>
    </div>`;

  return {
    subject,
    inAppTitle,
    inAppBody,
    html: htmlWrap('#10B981', '✅', subject, bodyHtml),
    text: `Tu avance en "${tarea}" fue aprobado. La tarea está completada.`,
  };
}

// ── Public render function ────────────────────────────────────────────────────

export function renderTemplate(
  event: NotificationEventType,
  vars:  TemplateVars,
): RenderedTemplate {
  switch (event) {
    case 'DEADLINE_1_DAY':   return templateDeadline1Day(vars);
    case 'DEADLINE_OVERDUE': return templateDeadlineOverdue(vars);
    case 'VOBO_APROBADO':    return templateVoboAprobado(vars);
    case 'TAREA_EN_REVISION': return templateTareaEnRevision(vars);
    case 'TAREA_DEVUELTA':    return templateTareaDevuelta(vars);
    case 'TAREA_COMPLETADA':  return templateTareaCompletada(vars);
    default:
      throw new Error(`No template defined for event: ${event}`);
  }
}
