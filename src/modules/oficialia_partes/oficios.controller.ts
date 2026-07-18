/**
 * Controller: Oficialía de Partes — Oficios
 * Module:     oficialia_partes
 * File:       src/modules/oficialia_partes/oficios.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET    /oficios
 *  POST   /oficios
 *  PATCH  /oficios/:id/asignar
 *  POST   /oficios/:id/subir-proyecto
 *  PATCH  /oficios/:id/vobo
 *  POST   /oficios/:id/finalizar
 */

import { Request, Response, NextFunction } from 'express';
import { db }           from '../../db';
import { storage }      from '../../services/storage.service';
import { processOcr }   from '../../services/ocr.service';
import { notifyVoboAprobado } from '../../notifications/notification.dispatcher';
import { AppError }     from '../../utils/AppError';
import { logger }       from '../../utils/logger';
import { RolUsuario, EstatusOficio } from './oficios.types';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Inserts a row in auditoria_estados */
async function createAuditLog(
  trx: any,
  oficio_id: number,
  estado_anterior: EstatusOficio | null,
  estado_nuevo: EstatusOficio,
  usuario_id: number,
): Promise<void> {
  await trx('auditoria_estados').insert({
    oficio_id,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    fecha_cambio: new Date(),
  });
}

/** Returns the current estatus of an oficio or throws 404 */
async function getOficioOrFail(trx: any, id: number) {
  const oficio = await trx('oficios').where({ id }).first();
  if (!oficio) throw new AppError('Oficio no encontrado', 404);
  return oficio;
}

/**
 * Verifica si el usuario puede actuar como ENCARGADO en Oficialía de Partes.
 * Acepta rol ENCARGADO nativo O usuario configurado como ENCARGADO en flujos.
 */
async function canActAsEncargado(user: any): Promise<boolean> {
  if (user.rol === 'ENCARGADO') return true;
  try {
    const row = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO' })
      .select('usuario_id')
      .first();
    return row?.usuario_id === user.id;
  } catch {
    return false;
  }
}

// ─── POST /oficios/analizar-pdf ──────────────────────────────────────────────

/**
 * Analiza un PDF con IA y devuelve los campos extraídos para pre-llenar el formulario.
 * NO guarda nada — solo extrae y devuelve.
 *
 * Roles permitidos: OFICIAL
 * Body: multipart/form-data con campo "pdf"
 */
export async function analizarPdf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('El archivo PDF es obligatorio', 400);
    }

    const { extractFieldsFromPdf } = await import('../../services/ai-extract.service');

    // El OCR (Tesseract) y la extracción con IA pueden tardar mucho —o fallar—
    // en PDFs escaneados/grandes. En cualquiera de esos casos respondemos con
    // baja confianza (campos vacíos) para que el gateway no corte la petición
    // con 504 y el usuario simplemente capture los datos a mano en el paso 2.
    const fallback = { confianza: 'baja' as const };
    const ANALISIS_TIMEOUT_MS = 25_000;

    const timeout = new Promise<typeof fallback>((resolve) =>
      setTimeout(() => resolve(fallback), ANALISIS_TIMEOUT_MS),
    );

    // El análisis nunca rechaza: ante error devuelve el fallback. Así Promise.race
    // siempre resuelve (HTTP 200) y no hay unhandled rejection tardío.
    const analisis = extractFieldsFromPdf(req.file.buffer).catch((err) => {
      logger.warn({ err }, 'Análisis de PDF falló; se devuelven campos vacíos');
      return fallback;
    });

    const fields = await Promise.race([analisis, timeout]);

    res.json({ data: fields });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios ────────────────────────────────────────────────────────────

/**
 * Listado de oficios filtrado según el rol del usuario autenticado.
 *
 * Roles y visibilidad:
 *  OFICIAL     → solo los oficios de su oficina registrados por él mismo
 *  ENCARGADO   → todos los oficios de su delegación (oficina_registro_id)
 *  JURIDICO    → oficios donde tiene una asignación activa
 *  SECRETARIA  → oficios con estatus VOBO_APROBADO o FINALIZADO
 *  DIRECTOR    → oficios con estatus VOBO_APROBADO o FINALIZADO
 */
export async function listarOficios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    let query = db('oficios')
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
          FROM asignaciones_juridicas
          ORDER BY oficio_id, id DESC
        ) as ultima_asignacion`),
        'ultima_asignacion.oficio_id', 'oficios.id'
      )
      .leftJoin('usuarios as abogado_u', 'abogado_u.id', 'ultima_asignacion.abogado_id')
      .select(
        'oficios.*',
        'abogado_u.nombre as abogado_nombre',
        'abogado_u.id as abogado_id',
      );

    // Verificar si el usuario es el ENCARGADO configurado en flujos
    const encargadoId = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO' })
      .select('usuario_id')
      .first()
      .then((r: any) => r?.usuario_id ?? null)
      .catch(() => null);

    const esEncargadoFlujo = encargadoId !== null && user.id === encargadoId;

    switch (user.rol as RolUsuario) {
      case 'OFICIAL':
        query = query
          .where('oficios.unidad_registro_id', user.oficina_id)
          .andWhere('oficios.oficial_registro_id', user.id);
        break;

      case 'OPERATIVO': {
        // Comportamiento híbrido:
        //   · Con asignaciones jurídicas → actúa como JURIDICO (ve sus oficios asignados)
        //   · Sin asignaciones           → actúa como OFICIAL  (ve lo que él mismo registró)
        //
        // DISTINCT ON en la subquery evita filas duplicadas cuando el mismo usuario
        // fue asignado, reasignado y vuelto a asignar al mismo oficio.
        const asignacionOperativo = await db('asignaciones_juridicas')
          .where({ abogado_id: user.id })
          .first();

        if (asignacionOperativo) {
          // Subquery global: DISTINCT ON sobre todas las asignaciones (sin filtrar por usuario)
          // para obtener la asignación más reciente por oficio. Luego filtra por usuario.
          // Esto evita que un abogado reasignado siga viendo el oficio en su bandeja.
          query = query
            .join(
              db.raw(`(
                SELECT oficio_id
                FROM (
                  SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
                  FROM asignaciones_juridicas
                  ORDER BY oficio_id, id DESC
                ) AS ultima_asignacion_global
                WHERE abogado_id = ?
              ) AS mis_asignaciones`, [user.id]),
              'mis_asignaciones.oficio_id',
              'oficios.id',
            );
        } else {
          query = query
            .where('oficios.unidad_registro_id', user.oficina_id)
            .andWhere('oficios.oficial_registro_id', user.id);
        }
        break;
      }

      case 'ENCARGADO':
        // Director Jurídico — ve todos los oficios del sistema sin filtro de oficina
        break;

      case 'DIRECTOR':
        if (esEncargadoFlujo) {
          // Es el ENCARGADO configurado en flujos — ve todos los oficios
          break;
        }
        // La Directora General ve TODOS los oficios en cualquier estatus
        // (los ingresados, los firmados, etc.) para supervisión general.
        if ((user as any).unidad_tipo === 'DIRECCION_GENERAL') {
          break;
        }
        // Director de área — solo oficios ya aprobados/finalizados
        query = query.whereIn('oficios.estatus', [
          'VOBO_APROBADO',
          'FINALIZADO',
        ] as EstatusOficio[]);
        break;

      case 'JURIDICO':
        // DISTINCT ON global: primero obtiene la asignación más reciente por oficio
        // (sin filtrar por usuario), luego filtra. Garantiza que un abogado reasignado
        // deja de ver el oficio inmediatamente, sin duplicados en paginación.
        query = query
          .join(
            db.raw(`(
              SELECT oficio_id
              FROM (
                SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
                FROM asignaciones_juridicas
                ORDER BY oficio_id, id DESC
              ) AS ultima_asignacion_global
              WHERE abogado_id = ?
            ) AS mis_asignaciones`, [user.id]),
            'mis_asignaciones.oficio_id',
            'oficios.id',
          );
        break;

      case 'SECRETARIA':
        // Secretaría — ve todos los oficios del sistema
        break;

      default: {
        // Para cualquier otro rol, verificar si tiene asignaciones como jurídico
        const tieneAsignaciones = await db('asignaciones_juridicas')
          .where({ abogado_id: user.id })
          .first();
        if (tieneAsignaciones) {
          query = query
            .join(
              db.raw(`(
                SELECT oficio_id
                FROM (
                  SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
                  FROM asignaciones_juridicas
                  ORDER BY oficio_id, id DESC
                ) AS ultima_asignacion_global
                WHERE abogado_id = ?
              ) AS mis_asignaciones`, [user.id]),
              'mis_asignaciones.oficio_id',
              'oficios.id',
            );
        } else {
          throw new AppError('Rol no autorizado', 403);
        }
        break;
      }
    }

    // Optional query-string filters
    const page   = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
    const limit  = Math.min(100, parseInt(String(req.query.limit ?? 20), 10));
    const offset = (page - 1) * limit;

    if (req.query.estatus) {
      query = query.andWhere('oficios.estatus', req.query.estatus as string);
    }

    // Full-text search on folio, remitente, dependencia, texto OCR y texto del proyecto
    if (req.query.search) {
      const term = `%${req.query.search}%`;
      // LEFT JOIN gestiones_contestacion para poder buscar en texto_proyecto.
      // DISTINCT evita filas duplicadas si hubiera múltiples gestiones por oficio.
      query = query
        .leftJoin('gestiones_contestacion as gc', 'gc.oficio_id', 'oficios.id')
        .distinct()
        .andWhere((q) =>
          q.whereILike('oficios.folio', term)
           .orWhereILike('oficios.remitente', term)
           .orWhereILike('oficios.dependencia_origen', term)
           .orWhereILike('oficios.descripcion_solicitud', term)
           .orWhereILike('oficios.texto_ocr', term)
           .orWhereILike('gc.texto_proyecto', term),
        );
    }

    // Date-range filter on fecha_registro
    if (req.query.desde) {
      query = query.andWhere('oficios.fecha_registro', '>=', new Date(req.query.desde as string));
    }
    if (req.query.hasta) {
      // Include the full hasta day
      const hasta = new Date(req.query.hasta as string);
      hasta.setHours(23, 59, 59, 999);
      query = query.andWhere('oficios.fecha_registro', '<=', hasta);
    }

    // Count: clonar la query sin el SELECT para evitar error de GROUP BY en PostgreSQL
    const countRows = await query.clone().clearSelect().count('oficios.id as count');
    const total     = Number((countRows[0] as any)?.count ?? 0);
    const rows      = await query.orderBy('oficios.fecha_registro', 'desc').limit(limit).offset(offset);

    // Compute dias_restantes client-side to avoid DB timezone issues
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oficios = rows.map((o: any) => {
      let dias_restantes: number | null = null;
      if (o.tiene_termino && o.fecha_vencimiento) {
        const vence = new Date(o.fecha_vencimiento);
        vence.setHours(0, 0, 0, 0);
        dias_restantes = Math.ceil((vence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }
      return { ...o, dias_restantes };
    });

    res.json({
      data:  oficios,
      meta:  { total, page, limit },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios ───────────────────────────────────────────────────────────

/**
 * Registro de nuevo oficio.
 *
 * Validaciones:
 *  - folio único en la tabla
 *  - archivo PDF obligatorio
 *  - fecha_vencimiento requerida cuando tiene_termino === true
 *
 * Acciones:
 *  - Guarda el PDF en storage
 *  - Inserta el oficio
 *  - Crea registro de auditoría (null → RECIBIDO)
 */
export async function crearOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const {
      remitente,
      dependencia_origen,
      dirigido_a_id,
      descripcion_solicitud,
      tiene_termino,
      fecha_vencimiento,
    } = req.body;

    // ── Validaciones ──────────────────────────────────────────
    if (!req.file) {
      throw new AppError('El archivo PDF es obligatorio', 400);
    }

    if (tiene_termino === true || tiene_termino === 'true') {
      if (!fecha_vencimiento) {
        throw new AppError(
          'fecha_vencimiento es requerida cuando tiene_termino es verdadero',
          400,
        );
      }
    }

    // ── Generar folio automático ──────────────────────────────
    // Formato: OF-{OFICINA_ID}-{AÑO}-{SECUENCIA 4 dígitos}
    // Ejemplo: OF-1-2026-0012
    const anio = new Date().getFullYear();

    // Contar oficios del año en curso para esta oficina → secuencia
    const [{ seq }] = await db('oficios')
      .where('unidad_registro_id', user.oficina_id)
      .whereRaw(`EXTRACT(YEAR FROM fecha_registro) = ?`, [anio])
      .count('id as seq');

    const secuencia = String(Number(seq) + 1).padStart(4, '0');
    const folio     = `OF-${user.oficina_id}-${anio}-${secuencia}`;

    // Garantizar unicidad en caso de concurrencia
    const existing = await db('oficios').where({ folio }).first();
    if (existing) {
      // Fallback: usar timestamp para desempate
      const ts = Date.now().toString().slice(-4);
      throw new AppError(`Folio ${folio} ya existe, intenta de nuevo`, 409);
    }

    // ── Guardar PDF ───────────────────────────────────────────
    const pdf_original_path = await storage.save(req.file, 'oficios/originales');

    // ── Transacción ───────────────────────────────────────────
    const oficio = await db.transaction(async (trx) => {
      const [newOficio] = await trx('oficios')
        .insert({
          folio,
          remitente,
          dependencia_origen,
          dirigido_a_id,
          oficial_registro_id:  user.id,
          unidad_registro_id:   user.oficina_id,
          fecha_registro:       new Date(),
          descripcion_solicitud,
          tiene_termino:        Boolean(tiene_termino),
          fecha_vencimiento:    fecha_vencimiento ?? null,
          pdf_original_path,
          estatus:              'RECIBIDO' as EstatusOficio,
        })
        .returning('*');

      await createAuditLog(trx, newOficio.id, null, 'RECIBIDO', user.id);

      return newOficio;
    });

    // ── OCR asíncrono — no bloquea la respuesta ───────────────
    // Se lanza en background; el oficio ya está guardado
    processOcr(oficio.id, oficio.pdf_original_path).catch((err) =>
      logger.error({ err, oficio_id: oficio.id }, 'OCR background task failed'),
    );

    res.status(201).json({ data: oficio });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/reasignar ────────────────────────────────────────────

/**
 * El encargado reasigna un oficio a otro abogado del área jurídica.
 *
 * Roles permitidos: ENCARGADO
 * Body: { abogado_id: number, motivo?: string }
 *
 * Acciones:
 *  - Marca la asignación anterior como inactiva (activa = false)
 *  - Crea una nueva asignación activa
 *  - Regresa el estatus a ASIGNADO
 *  - Crea registro de auditoría
 */
export async function reasignarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!(await canActAsEncargado(user))) {
      throw new AppError('Solo el ENCARGADO puede reasignar oficios', 403);
    }
    const oficio_id = parseInt(req.params.id, 10);
    const { abogado_id, motivo } = req.body;

    if (!abogado_id) {
      throw new AppError('abogado_id es requerido', 400);
    }

    // Verificar que el nuevo abogado existe y está activo (sin restricción de rol)
    const abogado = await db('usuarios').where({ id: abogado_id, activo: true }).first();
    if (!abogado) {
      throw new AppError('El abogado indicado no existe o está inactivo', 404);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      const estatusPermitidos: EstatusOficio[] = [
        'ASIGNADO', 'EN_REVISION', 'EN_RECONSIDERACION',
      ];
      if (!estatusPermitidos.includes(oficio.estatus)) {
        throw new AppError(
          `No se puede reasignar un oficio con estatus ${oficio.estatus}`,
          422,
        );
      }

      // Verificar que no se reasigna al mismo abogado
      const asignacionActual = await trx('asignaciones_juridicas')
        .where({ oficio_id })
        .orderBy('id', 'desc')
        .first();

      if (asignacionActual && asignacionActual.abogado_id === Number(abogado_id)) {
        throw new AppError('El oficio ya está asignado a ese abogado', 422);
      }

      // Crear nueva asignación (sin columna activa)
      await trx('asignaciones_juridicas').insert({
        oficio_id,
        abogado_id,
        asignado_por_id:  user.id,
        fecha_asignacion: new Date(),
        observaciones:    motivo ?? null,
      });

      // Regresar estatus a ASIGNADO
      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'ASIGNADO' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'ASIGNADO', user.id);
    });

    res.json({ message: 'Oficio reasignado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/asignar ──────────────────────────────────────────────

/**
 * El encargado asigna el oficio a un abogado del área jurídica.
 *
 * Roles permitidos: ENCARGADO
 * Body: { abogado_id: number, observaciones?: string }
 *
 * Acciones:
 *  - Actualiza estatus → ASIGNADO
 *  - Crea registro en asignaciones_juridicas
 *  - Crea registro de auditoría
 */
export async function asignarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!(await canActAsEncargado(user))) {
      throw new AppError('Solo el ENCARGADO puede asignar oficios', 403);
    }

    const oficio_id    = parseInt(req.params.id, 10);
    const { abogado_id, observaciones } = req.body;

    if (!abogado_id) {
      throw new AppError('abogado_id es requerido', 400);
    }

    // Verificar que el abogado existe y está activo (sin restricción de rol)
    const abogado = await db('usuarios').where({ id: abogado_id, activo: true }).first();
    if (!abogado) {
      throw new AppError('El abogado indicado no existe o está inactivo', 404);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'ASIGNADO' as EstatusOficio });

      await trx('asignaciones_juridicas').insert({
        oficio_id,
        abogado_id,
        asignado_por_id:  user.id,
        fecha_asignacion: new Date(),
        observaciones:    observaciones ?? null,
      });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'ASIGNADO', user.id);
    });

    res.json({ message: 'Oficio asignado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios/:id/subir-proyecto ────────────────────────────────────────

/**
 * El abogado sube su borrador de contestación (Word o PDF).
 *
 * Roles permitidos: JURIDICO
 * Body: multipart/form-data con campo "file"
 *
 * Acciones:
 *  - Guarda el archivo en storage
 *  - Crea / actualiza registro en gestiones_contestacion
 *  - Actualiza estatus → EN_REVISION
 *  - Crea registro de auditoría
 */
export async function subirProyecto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (user.rol !== 'JURIDICO' && user.rol !== 'OPERATIVO' && user.rol !== 'OFICIAL') {
      throw new AppError('Solo el área jurídica puede subir proyectos', 403);
    }

    if (!req.file) {
      throw new AppError('El archivo del proyecto es obligatorio', 400);
    }

    const oficio_id = parseInt(req.params.id, 10);

    const asignacion = await db('asignaciones_juridicas')
      .where({ oficio_id, abogado_id: user.id })
      .orderBy('id', 'desc')
      .first();

    if (!asignacion) {
      throw new AppError('No tienes una asignación para este oficio', 403);
    }

    const proyecto_url = await storage.save(req.file, 'oficios/proyectos');

    // ── Extraer texto del Word con mammoth ────────────────────
    let texto_proyecto: string | null = null;
    const isWord = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(req.file.mimetype);

    if (isWord) {
      try {
        const mammoth = await import('mammoth');
        const result  = await mammoth.extractRawText({ buffer: req.file.buffer });
        texto_proyecto = result.value?.trim() ?? null;
        logger.info({ oficio_id, chars: texto_proyecto?.length }, 'Word text extracted');
      } catch (err: any) {
        logger.warn({ err: err.message, oficio_id }, 'mammoth extraction failed');
      }
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      // Calcular versión del proyecto
      const gestionExistente = await trx('gestiones_contestacion')
        .where({ oficio_id }).first();
      const version = gestionExistente ? (gestionExistente.version_proyecto ?? 1) + 1 : 1;

      if (gestionExistente) {
        await trx('gestiones_contestacion')
          .where({ oficio_id })
          .update({ proyecto_url, texto_proyecto, version_proyecto: version, vobo_encargado: false });
      } else {
        await trx('gestiones_contestacion').insert({
          oficio_id, proyecto_url, texto_proyecto,
          version_proyecto: version, vobo_encargado: false,
        });
      }

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'EN_REVISION' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'EN_REVISION', user.id);
    });

    res.json({ message: 'Proyecto subido correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/reconsiderar ─────────────────────────────────────────

/**
 * El encargado rechaza el borrador y solicita correcciones.
 *
 * Roles permitidos: ENCARGADO
 * Body: { comentario: string }
 *
 * Acciones:
 *  - Guarda comentario en comentarios_reconsideracion
 *  - Actualiza estatus → EN_RECONSIDERACION
 *  - Crea registro de auditoría
 */
export async function reconsiderarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!(await canActAsEncargado(user))) {
      throw new AppError('Solo el ENCARGADO puede solicitar reconsideración', 403);
    }

    const oficio_id  = parseInt(req.params.id, 10);
    const { comentario } = req.body;

    if (!comentario?.trim()) {
      throw new AppError('El comentario de corrección es obligatorio', 400);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (!['EN_REVISION', 'EN_RECONSIDERACION'].includes(oficio.estatus)) {
        throw new AppError(
          `El oficio debe estar EN_REVISION para solicitar reconsideración (estatus: ${oficio.estatus})`,
          422,
        );
      }

      // Obtener versión actual del proyecto
      const gestion = await trx('gestiones_contestacion').where({ oficio_id }).first();
      const version = gestion?.version_proyecto ?? 1;

      await trx('comentarios_reconsideracion').insert({
        oficio_id,
        encargado_id: user.id,
        comentario:   comentario.trim(),
        fecha:        new Date(),
        version,
        resuelto:     false,
      });

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'EN_RECONSIDERACION' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'EN_RECONSIDERACION', user.id);
    });

    res.json({ message: 'Reconsideración solicitada. El jurídico recibirá los comentarios.' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios/:id/comentarios ─────────────────────────────────────────────

/**
 * Obtiene los comentarios de reconsideración de un oficio.
 * Roles: ENCARGADO, JURIDICO, DIRECTOR
 */
export async function getComentarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const comentarios = await db('comentarios_reconsideracion as cr')
      .join('usuarios as u', 'u.id', 'cr.encargado_id')
      .where('cr.oficio_id', oficio_id)
      .select(
        'cr.id', 'cr.comentario', 'cr.fecha',
        'cr.version', 'cr.resuelto',
        'u.nombre as encargado_nombre',
      )
      .orderBy('cr.fecha', 'asc');

    res.json({ data: comentarios });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios/:id/historial ──────────────────────────────────────────────

/**
 * Historial de movimientos (auditoría de estados) de un oficio, para la línea
 * temporal: cada cambio de estado con quién lo hizo y cuándo.
 */
export async function getHistorial(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const historial = await db('auditoria_estados as a')
      .join('usuarios as u', 'u.id', 'a.usuario_id')
      .where('a.oficio_id', oficio_id)
      .select(
        'a.id', 'a.estado_anterior', 'a.estado_nuevo', 'a.fecha_cambio',
        'u.nombre as usuario_nombre',
      )
      .orderBy('a.fecha_cambio', 'asc');

    res.json({ data: historial });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/vobo ─────────────────────────────────────────────────

/**
 * El encargado aprueba el borrador (Visto Bueno).
 *
 * Roles permitidos: ENCARGADO
 *
 * Acciones:
 *  - Actualiza gestiones_contestacion: vobo_encargado = true, fecha_vobo = now
 *  - Actualiza estatus → VOBO_APROBADO
 *  - Crea registro de auditoría
 *  - Notifica a secretaría
 */
export async function aprobarVobo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!(await canActAsEncargado(user))) {
      throw new AppError('Solo el ENCARGADO puede otorgar el VoBo', 403);
    }

    const oficio_id = parseInt(req.params.id, 10);

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (!['EN_REVISION', 'EN_RECONSIDERACION'].includes(oficio.estatus)) {
        throw new AppError(
          `El oficio debe estar EN_REVISION o EN_RECONSIDERACION para otorgar VoBo (estatus actual: ${oficio.estatus})`,
          422,
        );
      }

      const gestion = await trx('gestiones_contestacion')
        .where({ oficio_id })
        .first();

      if (!gestion) {
        throw new AppError('No existe un proyecto de contestación para este oficio', 422);
      }

      const fecha_vobo = new Date();

      await trx('gestiones_contestacion')
        .where({ oficio_id })
        .update({ vobo_encargado: true, fecha_vobo });

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'VOBO_APROBADO' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'VOBO_APROBADO', user.id);
    });

    // Notificar a secretaría fuera de la transacción (no crítico)
    const oficioParaNotif = await db('oficios')
      .where({ id: oficio_id })
      .select('id', 'folio', 'dependencia_origen')
      .first();

    if (oficioParaNotif) {
      await notifyVoboAprobado(oficioParaNotif).catch((err) =>
        logger.error({ err, oficio_id }, 'Error al notificar VoBo a secretaría'),
      );
    }

    res.json({ message: 'VoBo otorgado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios/:id/finalizar ─────────────────────────────────────────────

/**
 * Secretaría sube el documento escaneado y firmado, cerrando el flujo.
 *
 * Roles permitidos: SECRETARIA
 * Body: multipart/form-data con campo "file"
 *
 * Acciones:
 *  - Guarda el PDF firmado en storage
 *  - Actualiza gestiones_contestacion: escaneo_firmado_url, subido_por_secretaria_id
 *  - Actualiza estatus → FINALIZADO
 *  - Crea registro de auditoría
 */
export async function finalizarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (user.rol !== 'SECRETARIA') {
      throw new AppError('Solo SECRETARIA puede finalizar oficios', 403);
    }

    if (!req.file) {
      throw new AppError('El archivo escaneado y firmado es obligatorio', 400);
    }

    const oficio_id = parseInt(req.params.id, 10);

    const escaneo_firmado_url = await storage.save(req.file, 'oficios/firmados');

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (oficio.estatus !== 'VOBO_APROBADO') {
        throw new AppError(
          `El oficio debe tener VoBo aprobado para finalizar (estatus actual: ${oficio.estatus})`,
          422,
        );
      }

      await trx('gestiones_contestacion')
        .where({ oficio_id })
        .update({
          escaneo_firmado_url,
          subido_por_secretaria_id: user.id,
        });

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'FINALIZADO' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'FINALIZADO', user.id);
    });

    res.json({ message: 'Oficio finalizado correctamente' });
  } catch (err) {
    next(err);
  }
}
