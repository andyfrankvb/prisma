/**
 * View: Dashboard_Gestion
 * Master-Detail table for ENCARGADO, SECRETARIA, and DIRECTOR roles.
 *
 * Features:
 *  - Search by folio / remitente
 *  - Date-range filter
 *  - Traffic-light deadline indicator
 *  - Export to Excel (CSV)
 *  - ENCARGADO: Assign abogado modal + VoBo action
 *  - SECRETARIA: Download project + Upload signed PDF modal
 */

import React, { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { theme } from '../theme';
import { StatusBadge }  from '../components/StatusBadge';
import { TerminoTimer } from '../components/TerminoTimer';
import { Modal }        from '../components/Modal';
import { OficioDetalle } from '../components/OficioDetalle';
import { SistemasChips } from '../components/SistemasPanel';
import { AccionesOficio } from '../components/AccionesOficio';
import { useDialogo } from '../context/DialogoContext';
import { useAuth }      from '../context/AuthContext';
import { useIsMobile }  from '../hooks/useIsMobile';
import {
  getOficios,
  getAbogados,
  getCandidatosAsignacion,
  asignarOficio,
  reasignarOficio,
  subirProyecto,
  aprobarVobo,
  finalizarOficio,
  reconsiderarOficio,
  mandarAPaseFirma,
  devolverPaseFirma,
  aceptarTurno,
  devolverTurno,
  getComentarios,
  getOficioDocumentos,
} from '../api';
import type { Oficio, Abogado, EstatusOficio } from '../types';
import type { ComentarioReconsideracion, OficioDocumento } from '../api';
import { textoCompresion } from '../utils/compresion';
import { FiltrosOficios } from '../components/FiltrosOficios';
import { PestanasBandeja, PasoChip, totalDeConteos, leerVistaFijada, alternarVistaFijada } from '../components/PestanasBandeja';
import { MenuAcciones } from '../components/MenuAcciones';
import { OrdenColumna } from '../components/OrdenColumna';
import type { OrdenLista } from '../components/OrdenColumna';
import type { AccionMenu } from '../components/MenuAcciones';
import type { VistaBandeja } from '../components/PestanasBandeja';
import type { OficiosFiltros } from '../components/FiltrosOficios';
import { ESTATUS_META } from '../components/oficiosEstatus';

const LIMIT = 100;   // tope del backend; la lista se recorre con scroll (sin paginación)

export const Dashboard_Gestion: React.FC = () => {
  const { user } = useAuth();
  const rol = user?.rol;
  const isMobile = useIsMobile();

  // Verificar si el usuario es el ENCARGADO configurado en flujos
  const [esEncargado, setEsEncargado] = useState(rol === 'ENCARGADO');
  const dialogo = useDialogo();

  useEffect(() => {
    if (rol === 'ENCARGADO') { setEsEncargado(true); return; }
    if (!user) return;
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL ?? '/api/v1'}/usuarios/mis-roles-flujo`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((body: any) => {
        const roles: any[] = body.data ?? [];
        const esEl = roles.some(
          (r: any) => r.modulo_clave === 'oficialia_partes' && r.rol_flujo === 'ENCARGADO'
        );
        setEsEncargado(esEl);
      })
      .catch(() => {});
  }, [user, rol]);

  // ── List state ────────────────────────────────────────────
  const [oficios,   setOficios]   = useState<Oficio[]>([]);
  const [total,     setTotal]     = useState(0);
  const [conteos,   setConteos]   = useState<Record<string, number>>({});
  const [miPendientes, setMiPendientes] = useState(0);
  const [deOtrasAreas, setDeOtrasAreas] = useState(0);
  // Pestaña activa: el histórico del área, lo que espera algo de mí, o el archivo.
  // Arranca en la que la persona haya fijado, si fijó alguna.
  const [vistaFijada, setVistaFijada] = useState<VistaBandeja | null>(() => leerVistaFijada(user?.id));
  const [vista, setVista] = useState<VistaBandeja>(() => leerVistaFijada(user?.id) ?? 'todo');
  // Orden de la lista. Vacío = el de siempre, por fecha de ingreso descendente.
  const [orden, setOrden] = useState<OrdenLista | null>(null);
  const miBandeja = vista === 'mia';
  /**
   * ¿Vale la pena mostrar la columna «Delegación»?
   *
   * A quien solo alcanza a ver su propia área —una delegación, por ejemplo— la
   * columna le repite el mismo nombre en todos los renglones y le quita ancho a
   * lo que sí cambia. Se muestra únicamente cuando hay más de un área a la vista,
   * como le pasa a quien es encargado de dos.
   */
  const variasAreas = new Set(
    oficios.map((o) => o.delegacion_nombre).filter(Boolean),
  ).size > 1;
  /**
   * Columnas visibles. Se arma aquí y no dentro del `<thead>` para que el
   * `colSpan` de los renglones vacíos salga de la misma lista: cuando estaban
   * por separado, cada columna que se escondía dejaba la tabla descuadrada.
   */
  const columnas: { texto: string; orden?: string }[] = [
    { texto: '' },
    { texto: 'Folio',         orden: 'folio' },
    { texto: 'N° de origen' },
    ...(variasAreas ? [{ texto: 'Delegación' }] : []),
    { texto: 'Remitente' },
    { texto: 'Ingreso',       orden: 'ingreso' },
    { texto: 'Término',       orden: 'termino' },
    { texto: 'Estatus',       orden: 'estatus' },
    ...(miBandeja ? [{ texto: 'Qué sigue' }] : []),
    { texto: 'Sistemas',      orden: 'sistemas' },
    // En «Mi bandeja» esta columna repetiría el nombre del propio usuario en
    // todos los renglones.
    ...(miBandeja ? [] : [{ texto: 'En bandeja de', orden: 'bandeja' }]),
    { texto: 'Acciones' },
  ];

  const [page,      setPage]      = useState(1);
  const [filtros,   setFiltros]   = useState<OficiosFiltros>({ search: '', estatus: '', termino: '', desde: '', hasta: '', siqroo_pendiente: false, pendiente_firma: false, area: '', en_bandeja_de: '', situacion: '' });
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Selected oficio (detail panel) ───────────────────────
  const [selected, setSelected] = useState<Oficio | null>(null);
  /**
   * Abrir el expediente con «Acciones del oficio» ya desplegado. Lo piden las
   * acciones del renglón que necesitan un formulario —turnar, mandar a firma—:
   * sin esto, la persona llegaba al detalle y tenía que buscar el panel a mano.
   */
  const [abrirAcciones, setAbrirAcciones] = useState(false);

  // ── Assign modal (ENCARGADO) ──────────────────────────────
  const [showAssign,    setShowAssign]    = useState(false);
  const [abogados,      setAbogados]      = useState<Abogado[]>([]);
  const [abogadoId,     setAbogadoId]     = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [assignError,   setAssignError]   = useState<string | null>(null);
  const [assigning,     setAssigning]     = useState(false);

  // ── Trabajar modal (ENCARGADO sube su propio proyecto) ────
  const [showTrabajar,  setShowTrabajar]  = useState(false);
  const [trabajarFile,  setTrabajarFile]  = useState<File | null>(null);
  const [trabajarError, setTrabajarError] = useState<string | null>(null);
  const [trabajando,    setTrabajando]    = useState(false);

  // ── Reassign modal (ENCARGADO) ────────────────────────────
  const [showReassign,    setShowReassign]    = useState(false);
  const [reassignAbogadoId, setReassignAbogadoId] = useState('');
  const [reassignMotivo,  setReassignMotivo]  = useState('');
  const [reassignError,   setReassignError]   = useState<string | null>(null);
  const [reassigning,     setReassigning]     = useState(false);

  // ── Upload signed PDF modal (SECRETARIA) ─────────────────
  const [showUpload,   setShowUpload]   = useState(false);
  const [signedFile,   setSignedFile]   = useState<File | null>(null);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);

  // ── Reconsideración modal (ENCARGADO) ─────────────────────
  const [showRecon,      setShowRecon]      = useState(false);
  const [reconComentario,setReconComentario]= useState('');
  const [reconError,     setReconError]     = useState<string | null>(null);
  const [reconLoading,   setReconLoading]   = useState(false);
  const [comentarios,    setComentarios]    = useState<ComentarioReconsideracion[]>([]);
  const [loadingComents, setLoadingComents] = useState(false);

  // ── Action feedback ───────────────────────────────────────
  const [actionMsg, setActionMsg] = useState<string | null>(null);


  /**
   * Qué puede hacerse con este oficio ahora mismo. Son las mismas condiciones que
   * antes decidían qué botón se pintaba; reunirlas aquí evita que la columna de
   * acciones crezca a lo ancho y descuadre la tabla.
   */
  /**
   * Las acciones que no piden formulario se ejecutan desde el propio menú, con
   * su diálogo de confirmación. Antes abrían el expediente para que la persona
   * buscara el botón dentro de un panel; ahora el panel solo informa.
   */
  const handleMandarFirma = async (o: Oficio) => {
    const sigue = await dialogo.confirmar({
      titulo:    'Mandar a firma de la Dirección General',
      mensaje:   `El oficio ${o.folio} conserva su visto bueno y sigue siendo de tu área, pero lo firmará la Directora General. Se avisará a la Dirección General.`,
      confirmar: 'Mandar a firma',
    });
    if (!sigue) return;
    try { await mandarAPaseFirma(o.id); fetchOficios(); }
    catch (e: any) { setListError(e?.message ?? 'No se pudo mandar a firma'); }
  };

  const handleRegresarSinFirmar = async (o: Oficio) => {
    const motivo = await dialogo.pedirTexto({
      titulo:      'Regresar sin firmar',
      mensaje:     'El oficio vuelve con quien lo mandó, conservando su visto bueno. Se le informará el motivo.',
      etiqueta:    '¿Qué hay que corregir?',
      placeholder: 'ESCRIBE QUÉ HAY QUE CORREGIR…',
      confirmar:   'Regresar',
      peligro:     true,
    });
    if (!motivo) return;
    try { await devolverPaseFirma(o.id, motivo); fetchOficios(); }
    catch (e: any) { setListError(e?.message ?? 'No se pudo regresar el oficio'); }
  };

  const handleAceptarTurno = async (o: Oficio) => {
    const sigue = await dialogo.confirmar({
      titulo:    'Aceptar el oficio',
      mensaje:   `Tu área se hace cargo del oficio ${o.folio}. Después de aceptarlo ya no podrás regresarlo a quien te lo turnó; si no le compete, tendrás que turnarlo a la que corresponda.`,
      confirmar: 'Aceptar',
    });
    if (!sigue) return;
    try { await aceptarTurno(o.id); fetchOficios(); }
    catch (e: any) { setListError(e?.message ?? 'No se pudo aceptar el oficio'); }
  };

  /** El rótulo es «Reconsiderar petición»; por debajo deshace el turno. */
  const handleReconsiderarPeticion = async (o: Oficio) => {
    const razon = await dialogo.pedirTexto({
      titulo:      'Reconsiderar petición',
      mensaje:     'Se regresará a quien te lo turnó y se le informará el motivo.',
      etiqueta:    '¿Por qué no le compete a tu área?',
      placeholder: 'ESCRIBE EL MOTIVO…',
      confirmar:   'Regresar',
      peligro:     true,
    });
    if (!razon) return;
    try { await devolverTurno(o.id, razon); setSelected(null); fetchOficios(); }
    catch (e: any) { setListError(e?.message ?? 'No se pudo regresar el oficio'); }
  };

  const accionesDe = (o: Oficio): AccionMenu[] => {
    const acc: AccionMenu[] = [];
    const estatus = o.estatus as EstatusOficio;

    /**
     * Mientras el área no haya aceptado el oficio, no hay nada más que decidir:
     * o se hace cargo, o lo regresa. Ofrecer «Asignar» o «Trabajar» antes daba a
     * entender que ya era suyo, y repartirlo entre su gente sin haberlo aceptado
     * dejaba el paso de aceptación sin sentido.
     */
    const porAceptar = !!o.puede_aceptar_turno;

    // Orquestación — solo el encargado, y solo en los oficios de su propia área.
    // Ser encargado se sabe de forma global; sin la segunda condición, un área
    // que conserva la vista de lo que mandó a otra vería «Asignar» sobre un
    // oficio que ya no es suyo.
    if (esEncargado && o.es_de_mi_area && !porAceptar) {
      if (estatus === 'RECIBIDO') {
        acc.push({ label: 'Asignar', descripcion: 'Repártelo a alguien de tu equipo para que lo trabaje.', onClick: () => { setSelected(o); setShowAssign(true); } });
        acc.push({ label: 'Trabajar', descripcion: 'Quédatelo tú y sube el proyecto de contestación.', onClick: () => { setSelected(o); setShowTrabajar(true); } });
      }
      // Si lo mandaron a corregir y no hay analista —o si lo regresaron desde
      // arriba, que le toca a él responder— corrige el propio encargado.
      if (estatus === 'EN_RECONSIDERACION' && (!o.abogado_nombre || o.reconsideracion_al_encargado)) {
        acc.push({ label: 'Corregir', descripcion: 'Sube la corrección que te pidieron.', onClick: () => { setSelected(o); setShowTrabajar(true); } });
      }
      if ((['ASIGNADO', 'EN_REVISION', 'EN_RECONSIDERACION'] as EstatusOficio[]).includes(estatus)) {
        acc.push({ label: 'Reasignar', descripcion: 'Pásalo a otra persona de tu equipo.', onClick: () => { handleSelectOficio(o); setShowReassign(true); } });
      }
    }

    // Aprobación — quien tiene la autoridad en esa área. Si algo la frena, la
    // acción se muestra apagada con el motivo, en vez de desaparecer: si no, la
    // persona lee «te toca el visto bueno» y no encuentra dónde darlo.
    // Solo EN_REVISION: hay un proyecto esperando revisión. En reconsideración el
    // turno es de quien tiene que corregir, y ofrecer «Aprobar» ahí invitaba a dar
    // por bueno el proyecto que uno mismo acaba de rechazar.
    if (o.es_aprobador && estatus === 'EN_REVISION') {
      acc.push({
        label: 'Aprobar', tono: 'positivo',
        descripcion: 'Da el visto bueno al proyecto para que siga a firma.',
        bloqueada: o.puede_vobo ? null : o.bloqueo,
        onClick: () => handleVobo(o),
      });
    }

    /**
     * Regresar a corregir alcanza a más gente que aprobar: además de quien da el
     * visto bueno, el titular del área y quien tiene la carga del firmado, que
     * son los últimos en ver el oficio antes de que salga. Aprobar sigue siendo
     * del aprobador; esto solo permite frenarlo.
     */
    const puedeRegresarlo = o.puede_reconsiderar ?? o.es_aprobador;
    // EN_RECONSIDERACION queda fuera: ya está regresado y esperando la corrección.
    // Volver a regresarlo solo reescribiría la observación anterior.
    if (puedeRegresarlo && estatus === 'EN_REVISION') {
      acc.push({ label: 'Reconsiderar', tono: 'atencion', descripcion: 'Regrésalo a quien lo redactó con tus observaciones.', onClick: () => { handleSelectOficio(o); setShowRecon(true); } });
    }
    // Ya aprobado pero aún sin firmar: todavía se puede regresar al jurídico. Y a
    // firma también, que es cuando la Directora General lo tiene enfrente.
    if (puedeRegresarlo && estatus === 'VOBO_APROBADO') {
      acc.push({ label: 'Reconsiderar', tono: 'atencion', descripcion: 'Regrésalo a quien lo redactó con tus observaciones.', onClick: () => { handleSelectOficio(o); setShowRecon(true); } });
    }

    // Consultar el proyecto. Un oficio de conocimiento no tiene.
    // Se ofrece cuando el archivo existe, sin importar el estatus: un oficio
    // turnado vuelve a RECIBIDO y aun así puede traer el borrador de la otra área.
    if (!o.de_conocimiento && o.tiene_proyecto
        && ((esEncargado && o.es_de_mi_area) || o.puede_vobo)) {
      acc.push({ label: 'Ver proyecto', tono: 'neutro', descripcion: 'Abre el borrador de la contestación.', onClick: () => abrirArchivo(`/api/v1/files/${o.id}/proyecto`) });
    }

    if (estatus === 'VOBO_APROBADO' && (o.puede_finalizar || (o.es_aprobador && o.bloqueo))) {
      acc.push({
        label: 'Subir firmado',
        descripcion: 'Sube el documento ya firmado y cierra el trámite.',
        bloqueada: o.puede_finalizar ? null : o.bloqueo,
        onClick: () => { setSelected(o); setShowUpload(true); },
      });
    }
    if (estatus === 'FINALIZADO' && !o.de_conocimiento) {
      acc.push({ label: 'Ver firmado', tono: 'neutro', descripcion: 'Abre el documento ya firmado.', onClick: () => abrirArchivo(`/api/v1/files/${o.id}/firmado`) });
    }

    /**
     * Lo que mueve el oficio de área o lo manda a firma.
     *
     * Desde la lista no se podía hacer nada de esto: había que abrir el
     * expediente, desplegar «Acciones del oficio» y buscar el panel. Aquí se
     * ofrece desde el renglón y se abre el expediente ya con el panel desplegado,
     * porque las tres piden datos —el área destino, la justificación, el
     * documento— y eso no cabe en un menú.
     *
     * No se repiten dentro del expediente: allá ya están en su propio panel, con
     * su formulario. Tenerlas dos veces en la misma pantalla sería el mismo
     * problema que ya corregimos con las casillas.
     */
    if (o.puede_aceptar_turno) {
      acc.push({ id: 'aceptar', label: 'Aceptar', tono: 'positivo', descripcion: 'Tu área se hace cargo. Después ya no podrás regresarlo.', onClick: () => handleAceptarTurno(o) });
    }
    if (o.puede_devolver_turno) {
      // Solo el rótulo: por debajo deshace el turno, no toca la reconsideración
      // del proyecto, que es otro paso y otro endpoint.
      /**
       * No se puede regresar un oficio sobre el que ya se le pidió información a
       * otras áreas: allá hay gente trabajando para alguien que estaría por
       * soltarlo. El servidor ya lo impedía; aquí se dice el motivo en vez de
       * esconder la acción, que dejaba la pantalla con «Aceptar» como única
       * salida sin explicar por qué.
       */
      const conSolicitudes = Number(o.delegatorios_pendientes ?? 0);
      acc.push({
        id: 'reconsiderar-peticion', label: 'Reconsiderar petición', tono: 'atencion',
        descripcion: 'Regrésalo a quien te lo turnó, con el motivo.',
        bloqueada: conSolicitudes > 0
          ? (conSolicitudes === 1
              ? 'Ya le pediste información a un área sobre este oficio. Cancela esa solicitud antes de regresarlo.'
              : `Ya le pediste información a ${conSolicitudes} áreas sobre este oficio. Cancela esas solicitudes antes de regresarlo.`)
          : null,
        onClick: () => handleReconsiderarPeticion(o),
      });
    }
    if (o.puede_mandar_firma) {
      acc.push({ label: 'Mandar a firma de la DG', descripcion: 'Lo firma la Directora General; el oficio sigue siendo de tu área.', onClick: () => handleMandarFirma(o) });
    }
    if (o.puede_devolver_pase_firma) {
      acc.push({ label: 'Regresar sin firmar', tono: 'atencion', descripcion: 'Devuélvelo al área para que corrijan antes de firmarlo.', onClick: () => handleRegresarSinFirmar(o) });
    }
    // La única que sigue abriendo el expediente: necesita elegir área, escribir
    // la justificación y a veces adjuntar un documento, y eso no cabe en un menú.
    if (o.puede_turnar && !porAceptar) {
      acc.push({
        id: 'turnar', label: 'Turnar a otra área',
        descripcion: 'Pide información sin soltarlo, manda lo que ya trabajaste, o pásalo a quien le corresponde.',
        // En la lista abre el expediente; dentro del expediente, el propio panel
        // lo intercepta y despliega el formulario sin ir a ningún lado.
        onClick: () => { setSelected(o); setAbrirAcciones(true); },
      });
    }

    return acc;
  };

  const fetchOficios = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await getOficios({
        mi_bandeja: vista === 'mia' || undefined,
        de_otras_areas: vista === 'otras_areas' || undefined,
        orden:            orden?.columna,
        dir:              orden?.sentido,
        page, limit: LIMIT,
        search:           filtros.search || undefined,
        estatus:          vista === 'finalizados' ? 'FINALIZADO' : (filtros.estatus || undefined),
        termino:          filtros.termino || undefined,
        desde:            filtros.desde || undefined,
        hasta:            filtros.hasta || undefined,
        siqroo_pendiente: filtros.siqroo_pendiente || undefined,
        pendiente_firma:  filtros.pendiente_firma || undefined,
        dirigido_a_id:    filtros.area ? Number(filtros.area) : undefined,
        en_bandeja_de:    filtros.en_bandeja_de ? Number(filtros.en_bandeja_de) : undefined,
        situacion:        filtros.situacion || undefined,
      });
      setOficios(res.data);
      setTotal(res.meta.total);
      setConteos(((res.meta as any).conteos ?? {}) as Record<string, number>);
      setMiPendientes(Number((res.meta as any).mi_bandeja ?? 0));
      setDeOtrasAreas(Number((res.meta as any).de_otras_areas ?? 0));
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filtros, vista, orden]);

  useEffect(() => { fetchOficios(); }, [fetchOficios]);

  // Si el detalle está abierto, se mantiene al día cuando la lista se recarga:
  // así los cambios hechos desde las acciones se reflejan sin cerrarlo.
  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return prev;
      const fresco = oficios.find((o) => o.id === prev.id);
      return fresco ? { ...prev, ...fresco } : prev;
    });
  }, [oficios]);

  // Load candidatos when assign or reassign modal opens.
  // Usuarios de la unidad del encargado que tienen el módulo de oficios habilitado.
  useEffect(() => {
    if ((showAssign || showReassign) && abogados.length === 0) {
      getCandidatosAsignacion()
        .then((data) => setAbogados(data))
        .catch(() => {});
    }
  }, [showAssign, showReassign]);

  // ── Handlers ──────────────────────────────────────────────

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !abogadoId) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await asignarOficio(selected.id, { abogado_id: Number(abogadoId), observaciones: observaciones || undefined });
      setShowAssign(false);
      setAbogadoId(''); setObservaciones('');
      setActionMsg('Oficio asignado correctamente');
      fetchOficios();
    } catch (err: any) {
      setAssignError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleReassign = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !reassignAbogadoId) return;
    setReassigning(true);
    setReassignError(null);
    try {
      await reasignarOficio(selected.id, { abogado_id: Number(reassignAbogadoId), motivo: reassignMotivo || undefined });
      setShowReassign(false);
      setReassignAbogadoId(''); setReassignMotivo('');
      setActionMsg('Oficio reasignado correctamente');
      fetchOficios();
    } catch (err: any) {
      setReassignError(err.message);
    } finally {
      setReassigning(false);
    }
  };

  const handleVobo = async (oficio: Oficio) => {
    const sigue = await dialogo.confirmar({
      titulo:    'Otorgar visto bueno',
      mensaje:   `Se aprueba el proyecto de contestación del oficio ${oficio.folio} y pasa a firma.`,
      confirmar: 'Otorgar VoBo',
    });
    if (!sigue) return;
    try {
      await aprobarVobo(oficio.id);
      setActionMsg('VoBo otorgado correctamente');
      fetchOficios();
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    }
  };

  // El encargado sube su propio proyecto de contestación (trabaja el oficio directo)
  const handleTrabajar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !trabajarFile) { setTrabajarError('Selecciona el archivo del proyecto'); return; }
    setTrabajando(true); setTrabajarError(null);
    try {
      await subirProyecto(selected.id, trabajarFile);
      setShowTrabajar(false); setTrabajarFile(null);
      setActionMsg('Proyecto subido. Queda en revisión para el VoBo del delegado.');
      fetchOficios();
    } catch (err: any) { setTrabajarError(err.message); }
    finally { setTrabajando(false); }
  };

  // Abre/descarga un archivo protegido (requiere token). Un <a href> normal no
  // envía el Authorization, por eso hay que traerlo con fetch y abrir el blob.
  const abrirArchivo = async (url: string) => {
    setActionMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(res.status === 404 ? 'El documento aún no está disponible' : `No se pudo abrir (HTTP ${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch (err: any) {
      setActionMsg(err.message || 'No se pudo abrir el documento');
    }
  };

  // Cargar comentarios cuando se selecciona un oficio EN_RECONSIDERACION
  const handleSelectOficio = (oficio: Oficio) => {
    setSelected(oficio);
    setComentarios([]);
    if (['EN_RECONSIDERACION', 'EN_REVISION'].includes(oficio.estatus)) {
      setLoadingComents(true);
      getComentarios(oficio.id)
        .then(({ data }) => setComentarios(data))
        .catch(() => {})
        .finally(() => setLoadingComents(false));
    }
  };

  const handleReconsiderar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !reconComentario.trim()) return;
    setReconLoading(true);
    setReconError(null);
    try {
      await reconsiderarOficio(selected.id, reconComentario.trim());
      setShowRecon(false);
      setReconComentario('');
      setActionMsg('Correcciones enviadas al jurídico');
      fetchOficios();
    } catch (err: any) {
      setReconError(err.message);
    } finally {
      setReconLoading(false);
    }
  };

  const handleUploadSigned = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !signedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const resp = await finalizarOficio(selected.id, signedFile);
      const aviso = textoCompresion(resp.compresion);
      setShowUpload(false);
      setSignedFile(null);
      setActionMsg('Oficio finalizado correctamente' + (aviso ? ` · 📉 ${aviso}` : ''));
      fetchOficios();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Fecha "sólo día" (columna DATE) sin desfase por zona horaria.
  const soloFecha = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : s;
  };

  const exportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // El reporte sale de lo que la persona está viendo: la pestaña manda igual
      // que los filtros de la barra. Si no, el Excel diría una cosa y la pantalla otra.
      const filtroBase = {
        mi_bandeja:       vista === 'mia' || undefined,
        de_otras_areas:   vista === 'otras_areas' || undefined,
        search:           filtros.search || undefined,
        estatus:          vista === 'finalizados' ? 'FINALIZADO' : (filtros.estatus || undefined),
        termino:          filtros.termino || undefined,
        desde:            filtros.desde || undefined,
        hasta:            filtros.hasta || undefined,
        siqroo_pendiente: filtros.siqroo_pendiente || undefined,
        pendiente_firma:  filtros.pendiente_firma || undefined,
        dirigido_a_id:    filtros.area ? Number(filtros.area) : undefined,
        en_bandeja_de:    filtros.en_bandeja_de ? Number(filtros.en_bandeja_de) : undefined,
        situacion:        filtros.situacion || undefined,
      };
      // Traer TODOS los resultados filtrados (no solo la página visible)
      const todos: Oficio[] = [];
      for (let pagina = 1; ; pagina++) {
        const res = await getOficios({ ...filtroBase, page: pagina, limit: 100 });
        todos.push(...res.data);
        if (res.data.length === 0 || todos.length >= res.meta.total) break;
      }

      const headers = [
        'N° OFICIO INTERNO', 'N° OFICIO ORIGEN', 'DIRECCIÓN O DEPENDENCIA', 'SUBUNIDAD',
        'FECHA DEL OFICIO', 'FECHA ACUSE', 'DIRIGIDO', 'EN BANDEJA DE', 'ASUNTO',
      ];
      const rows = todos.map((o) => [
        o.folio,
        o.numero_oficio_origen ?? '',
        o.dependencia_origen ?? '',
        o.unidad_interna ?? '',
        o.fecha_oficio ? soloFecha(o.fecha_oficio) : '',
        new Date(o.fecha_registro).toLocaleDateString('es-MX'),
        // El destinatario del documento, no a quién se le turnó después.
        o.dirigido_a_original_nombre ?? o.dirigido_a_nombre ?? '',
        // Quién lo tiene ahora: el mismo dato que muestra la bandeja en pantalla.
        o.en_bandeja_de ?? '',
        o.descripcion_solicitud ?? '',
      ]);

      // Etiquetas legibles de los filtros para el encabezado del reporte.
      const terminoLabel: Record<string, string> = { con_termino: 'Con término', por_vencer: 'Por vencer (3 días)', vencidos: 'Vencidos' };
      const estatusLabel = vista === 'finalizados'
        ? 'Finalizado'
        : (filtros.estatus ? (ESTATUS_META.find((m) => m.value === filtros.estatus)?.label ?? filtros.estatus) : 'Todos');
      const rangoFechas  = (filtros.desde || filtros.hasta) ? `${filtros.desde || 'inicio'} a ${filtros.hasta || 'hoy'}` : 'Todas';
      const areaNombre   = filtros.area ? (todos[0]?.delegacion_nombre ?? todos[0]?.dirigido_a_nombre ?? `ID ${filtros.area}`) : 'Todas';
      // Los mismos rótulos que las pestañas: el reporte tiene que decir de dónde
      // salió con las palabras que la persona vio en pantalla al generarlo.
      const VISTA_LABEL: Record<string, string> = {
        todo: 'Recepción', mia: 'Mi bandeja', finalizados: 'Finalizados',
        otras_areas: 'Turnados',
      };
      const filtrosList: [string, string][] = [
        ['Vista', VISTA_LABEL[vista] ?? 'Recepción'],
        ['Búsqueda', filtros.search || '—'],
        ['Estatus', estatusLabel],
        ['Área (dirigido a)', areaNombre],
        ['Término', filtros.termino ? (terminoLabel[filtros.termino] ?? filtros.termino) : 'Todos'],
        ['Rango de fechas (ingreso)', rangoFechas],
        ['NCI pendiente (SIQROO/SIGER)', filtros.siqroo_pendiente ? 'Sí' : 'No'],
        ['Pendiente de firma', filtros.pendiente_firma ? 'Sí' : 'No'],
      ];

      // Excel real (.xlsx) con estilos: filtros minimalistas arriba, tabla de resultados abajo.
      const ExcelJS = (await import('exceljs')).default;
      const GUINDA = 'FF7A1330';
      const GRIS   = 'FF6B7280';
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Reporte', { views: [{ showGridLines: false }] });
      ws.columns = [{ width: 14 }, { width: 16 }, { width: 26 }, { width: 18 }, { width: 12 }, { width: 11 }, { width: 22 }, { width: 22 }, { width: 40 }];

      // Título
      ws.mergeCells(1, 1, 1, headers.length);
      const tCell = ws.getCell(1, 1);
      tCell.value = 'REPORTE DE OFICIOS';
      tCell.font = { bold: true, size: 16, color: { argb: GUINDA } };
      const subCell = ws.getCell(2, 1);
      subCell.value = `Generado: ${new Date().toLocaleString('es-MX')}  ·  ${todos.length} registro(s)`;
      subCell.font = { size: 9, color: { argb: GRIS } };

      // Filtros aplicados (rótulo + pares etiqueta / valor)
      const rotCell = ws.getCell(4, 1);
      rotCell.value = 'FILTROS APLICADOS';
      rotCell.font = { bold: true, size: 11, color: { argb: GUINDA } };
      filtrosList.forEach(([k, v], i) => {
        const fila = 5 + i;
        const ck = ws.getCell(fila, 1); ck.value = k; ck.font = { bold: true, color: { argb: GRIS } };
        ws.mergeCells(fila, 2, fila, 4);
        ws.getCell(fila, 2).value = v;
      });

      // Tabla de resultados (una fila en blanco de separación)
      const filaHead = 5 + filtrosList.length + 1;
      const hr = ws.getRow(filaHead);
      headers.forEach((h, i) => {
        const c = hr.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GUINDA } };
        c.alignment = { vertical: 'middle', wrapText: true };
      });
      rows.forEach((r, i) => {
        const row = ws.getRow(filaHead + 1 + i);
        r.forEach((val, ci) => {
          const c = row.getCell(ci + 1);
          c.value = val as any;
          c.font = { size: 9 };
          c.alignment = { vertical: 'top', wrapText: true };
          c.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        });
      });

      // Impresión: tamaño Carta, horizontal, ajustar al ancho de una hoja, encabezado repetido.
      ws.pageSetup = {
        paperSize: 1,                 // 1 = Carta (Letter)
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      };
      ws.pageSetup.printTitlesRow = `${filaHead}:${filaHead}`;

      const buf  = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `reporte_oficios_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setListError('No se pudo exportar el reporte: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', backgroundColor: theme.colors.background, overflow: 'hidden' }}>

      {/* ── Master panel ──────────────────────────────────── */}
      <div style={{
        flex: selected ? (isMobile ? '1' : '0 0 55%') : '1',
        // En móvil, al abrir un oficio se oculta la lista y el detalle ocupa todo
        display: (isMobile && selected) ? 'none' : 'flex',
        flexDirection: 'column', overflow: 'hidden', transition: 'flex 0.2s',
      }}>

        {/* Header */}
        <div style={{ padding: '10px 24px 0', backgroundColor: theme.colors.surface, borderBottom: `1px solid ${theme.colors.border}` }}>
          {/* Filtros a todo lo ancho: el total que mostraba la tarjeta ya vive en
              el número de la pestaña «Todo». */}
          <div style={{ display: 'flex', marginBottom: '12px' }}>
            <div style={{ flex: '1 1 100%', display: 'flex' }}>
              <FiltrosOficios
                onChange={(f) => { setFiltros(f); setPage(1); }}
                accion={
                  <button
                    onClick={exportCSV}
                    disabled={exporting}
                    style={{ ...btnSecondary, padding: '7px 14px', fontSize: '0.78rem', whiteSpace: 'nowrap',
                             opacity: exporting ? 0.45 : 1,
                             cursor: exporting ? 'wait' : 'pointer' }}
                    title="Genera un Excel con los oficios que estás viendo, con la pestaña y los filtros aplicados"
                  >
                    {exporting ? '⏳ Generando…' : '⬇ Generar reporte'}
                  </button>
                }
              />
            </div>
          </div>
        </div>

        {/* Feedback banner */}
        {actionMsg && (
          <div
            role="status"
            style={{ padding: '10px 24px', backgroundColor: '#D1FAE5', color: theme.colors.alert.green, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => setActionMsg(null)}
          >
            ✓ {actionMsg} &nbsp;<span style={{ opacity: 0.6 }}>(clic para cerrar)</span>
          </div>
        )}

        {listError && <div role="alert" style={{ ...alertStyle, margin: '12px 24px' }}>{listError}</div>}

        {/* Las pestañas se apoyan en el recuadro de abajo: la activa rompe la
            línea y se abre hacia él, así se lee como una sola pieza. */}
        <PestanasBandeja
          vista={vista}
          onCambiar={(v) => { setVista(v); setPage(1); }}
          totalTodo={totalDeConteos(conteos)}
          totalMia={miPendientes}
          totalFinalizados={conteos.FINALIZADO ?? 0}
          /* Solo lo que la lista puede mostrar. Sumarle aparte las solicitudes
             dejaba la pestaña con un número que no correspondía a ningún renglón:
             el servidor ya las cuenta dentro de «de otras áreas». */
          totalOtrasAreas={deOtrasAreas}
          fijada={vistaFijada}
          onFijar={(v) => setVistaFijada(alternarVistaFijada(user?.id, v, vistaFijada))}
        />


        {/* Table — scroll horizontal en móvil para no romper el layout */}
        {/* `0 1 auto` y no `flex: 1`: con pocos oficios el recuadro termina donde
            acaban los renglones, en vez de estirarse con media pantalla en blanco.
            Con muchos se encoge hasta el alto disponible y hace su propio scroll. */}
        <div className="scroll-x" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', margin: '0 24px 24px', border: `1px solid ${theme.colors.border}`, borderTop: 'none', borderRadius: '0 0 14px 14px', backgroundColor: theme.colors.surface, boxShadow: theme.shadow.sm }}>
          <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ backgroundColor: theme.colors.surface }}>
                {columnas.map((c) => (
                  <th key={c.texto} style={thStyle}>
                    {c.orden
                      ? <OrdenColumna
                          texto={c.texto}
                          columna={c.orden}
                          orden={orden}
                          onOrden={(o) => { setOrden(o); setPage(1); }}
                        />
                      : c.texto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columnas.length} style={{ textAlign: 'center', padding: '32px', color: theme.colors.textSecondary }}>Cargando…</td></tr>
              ) : oficios.length === 0 ? (
                <tr><td colSpan={columnas.length} style={{ textAlign: 'center', padding: '32px', color: theme.colors.textSecondary }}>{miBandeja ? 'No tienes nada pendiente por ahora.' : 'Sin registros'}</td></tr>
              ) : (
                oficios.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => handleSelectOficio(o)}
                    style={{
                      backgroundColor: selected?.id === o.id ? '#EFF6FF' : i % 2 === 0 ? '#fff' : '#F9FAFB',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Traffic light dot */}
                    <td style={{ ...tdStyle, width: '8px', padding: '0 0 0 12px' }}>
                      <TrafficDot tiene_termino={o.tiene_termino} dias={o.dias_restantes ?? null} />
                    </td>
                    <td style={tdStyle}><strong>{o.folio}</strong></td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                      {o.numero_oficio_origen ?? '—'}
                    </td>
                    {variasAreas && (
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: theme.colors.textSecondary }}>{o.delegacion_nombre ?? '—'}</td>
                    )}
                    <td style={tdStyle}>{o.remitente}</td>
                    <td style={tdStyle}>{new Date(o.fecha_registro).toLocaleDateString('es-MX')}</td>
                    <td style={tdStyle}><TerminoTimer tiene_termino={o.tiene_termino} fecha_vencimiento={o.fecha_vencimiento} termino_tipo={o.termino_tipo} vence_en={o.vence_en} horas_restantes={o.horas_restantes} /></td>
                    <td style={tdStyle}><StatusBadge estatus={o.estatus as EstatusOficio} turnado={!!o.turnos_recibidos} devuelto={!!o.llego_por_devolucion} deConocimiento={!!o.de_conocimiento} enPaseFirma={!!o.en_pase_firma} /></td>
                    {miBandeja && (
                      <td style={tdStyle}><PasoChip paso={o.mi_paso} /></td>
                    )}
                    <td style={tdStyle}>
                      <SistemasChips oficio={o} />
                    </td>
                    {!miBandeja && (
                      <td style={tdStyle}>
                        {o.en_bandeja_de ? (
                          <span style={{ fontSize: '0.78rem', color: theme.colors.textPrimary, fontWeight: 600 }}>
                            👤 {o.en_bandeja_de}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>—</span>
                        )}
                      </td>
                    )}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <MenuAcciones acciones={accionesDe(o)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* La lista se recorre con scroll. Aviso si hay más de los cargados. */}
        {total > oficios.length && (
          <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.74rem', color: theme.colors.textSecondary, borderTop: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface }}>
            Mostrando {oficios.length} de {total} · acota con los filtros para ver el resto
          </div>
        )}
      </div>

      {/* ── Detail panel ──────────────────────────────────── */}
      {selected && (
        <div style={{ flex: isMobile ? '1' : '0 0 45%', borderLeft: `1px solid ${theme.colors.border}`, backgroundColor: theme.colors.surface, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.primary }}>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
              Detalle — {selected.folio}
            </h2>
            <button onClick={() => { setSelected(null); setAbrirAcciones(false); }} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }} aria-label="Cerrar detalle">×</button>
          </div>
          <div style={{ padding: '20px', flex: 1 }}>
            <OficioDetalle
              oficio={selected}
              onCambio={fetchOficios}
              /* Una sola zona al final del expediente: las acciones, el
                 formulario de turnar, las marcas y el estado. Antes iban en dos
                 bloques separados por media pantalla, y había que aprenderse cuál
                 miraba uno según lo que quisiera hacer. */
              accionesFinales={
                <AccionesOficio
                  oficio={selected}
                  acciones={accionesDe(selected)}
                  abrirTurnar={abrirAcciones}
                  conDelegatorios
                  puedeDelegar={!!selected.puede_solicitar}
                  onActualizar={(o) => { setSelected((prev) => prev ? { ...prev, ...o } : o); fetchOficios(); }}
                  onSalio={() => { setSelected(null); setAbrirAcciones(false); fetchOficios(); }}
                  onRefrescar={() => fetchOficios()}
                />
              }
            />
            {/* La línea de tiempo ahora vive dentro del modal "Ver historial". */}
          </div>
        </div>
      )}

      {/* ── Assign Modal ──────────────────────────────────── */}
      <Modal open={showAssign} title={`Asignar Oficio — ${selected?.folio}`} onClose={() => { setShowAssign(false); setAssignError(null); }}>
        <form onSubmit={handleAssign} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Abogado <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <select value={abogadoId} onChange={(e) => setAbogadoId(e.target.value)} style={{ ...inputStyle, width: '100%' }} required>
              <option value="">— Selecciona un abogado —</option>
              {abogados.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre} ({a.email})</option>
              ))}
            </select>
            {abogados.length === 0 && (
              <p style={{ margin: '8px 0 0', padding: '10px 12px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.78rem' }}>
                No hay analistas jurídicos en tu área. Se consideran analistas quienes tienen habilitado
                el módulo «Recepción de Oficios» y no están designados como oficial de partes ni encargado.
                Pídele al administrador que habilite el módulo a quien corresponda.
              </p>
            )}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Observaciones</label>
            <textarea style={{ ...inputStyle, width: '100%', height: '80px', resize: 'vertical', textTransform: 'uppercase' }} value={observaciones} onChange={(e) => setObservaciones(e.target.value.toUpperCase())} placeholder="INSTRUCCIONES ADICIONALES…" />
          </div>
          {assignError && <div role="alert" style={alertStyle}>{assignError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => setShowAssign(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={assigning || !abogadoId} style={btnPrimary}>{assigning ? 'Asignando…' : 'Confirmar Asignación'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Trabajar el oficio (encargado sube su propio proyecto) */}
      <Modal open={showTrabajar} title={`Trabajar Oficio — ${selected?.folio}`} onClose={() => { setShowTrabajar(false); setTrabajarError(null); setTrabajarFile(null); }}>
        <form onSubmit={handleTrabajar} noValidate>
          <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
            Subí tu <strong>proyecto de contestación</strong>. Quedará en revisión para que el <strong>delegado</strong> otorgue el VoBo.
          </p>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Proyecto de contestación <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setTrabajarFile(e.target.files?.[0] ?? null)}
              style={{ display: 'block', fontSize: '0.85rem', marginTop: '6px' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>PDF o Word</p>
          </div>
          {trabajarError && <div role="alert" style={alertStyle}>{trabajarError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => { setShowTrabajar(false); setTrabajarFile(null); }} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={trabajando || !trabajarFile} style={btnPrimary}>{trabajando ? 'Subiendo…' : 'Subir proyecto'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Reconsideración Modal ─────────────────────────── */}
      <Modal
        open={showRecon}
        title={`Solicitar Reconsideración — ${selected?.folio}`}
        onClose={() => { setShowRecon(false); setReconComentario(''); setReconError(null); }}
      >
        <form onSubmit={handleReconsiderar} noValidate>
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#FFFBEB',
            border: `1px solid #FDE68A`,
            borderLeft: `3px solid ${theme.colors.alert.yellow}`,
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.82rem',
            color: '#78350F',
          }}>
            <p style={{ margin: 0, fontWeight: 700 }}>⚠️ El proyecto requiere correcciones</p>
            <p style={{ margin: '4px 0 0' }}>
              El oficio pasará a estado <strong>En Reconsideración</strong>. El jurídico recibirá tus comentarios y deberá subir una nueva versión.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: theme.colors.charcoal }}>
              Comentarios de corrección <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={reconComentario}
              onChange={(e) => setReconComentario(e.target.value.toUpperCase())}
              required
              rows={5}
              placeholder="DESCRIBE QUÉ DEBE CORREGIR EL JURÍDICO EN SU PROYECTO DE CONTESTACIÓN…"
              style={{
                textTransform: 'uppercase',
                width: '100%', padding: '10px 12px',
                border: `1.5px solid ${theme.colors.border}`,
                borderRadius: theme.radius.sm,
                fontSize: '0.875rem',
                fontFamily: theme.font.family,
                resize: 'vertical',
                boxSizing: 'border-box' as const,
              }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              {reconComentario.length} caracteres
            </p>
          </div>

          {reconError && (
            <div role="alert" style={{ padding: '10px 14px', backgroundColor: '#FDE8EF', color: theme.colors.primary, borderRadius: theme.radius.sm, fontSize: '0.875rem', marginBottom: '12px', borderLeft: `3px solid ${theme.colors.primary}` }}>
              {reconError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => { setShowRecon(false); setReconComentario(''); setReconError(null); }}
              style={{ padding: '9px 18px', backgroundColor: '#fff', color: theme.colors.primary, border: `1.5px solid ${theme.colors.primary}`, borderRadius: theme.radius.sm, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: theme.font.family }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reconLoading || !reconComentario.trim()}
              style={{
                padding: '9px 20px',
                backgroundColor: reconLoading || !reconComentario.trim() ? theme.colors.grayMid : theme.colors.alert.yellow,
                color: '#78350F',
                border: 'none',
                borderRadius: theme.radius.sm,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: reconLoading || !reconComentario.trim() ? 'not-allowed' : 'pointer',
                fontFamily: theme.font.family,
              }}
            >
              {reconLoading ? 'Enviando…' : '⚠️ Enviar Correcciones'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Reassign Modal ────────────────────────────────── */}
      <Modal
        open={showReassign}
        title={`Reasignar Oficio — ${selected?.folio}`}
        onClose={() => { setShowReassign(false); setReassignAbogadoId(''); setReassignMotivo(''); setReassignError(null); }}
      >
        <form onSubmit={handleReassign} noValidate>
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#FFF7ED',
            border: `1px solid #FED7AA`,
            borderLeft: `3px solid ${theme.colors.gold}`,
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.82rem',
            color: '#92400E',
          }}>
            <p style={{ margin: 0, fontWeight: 700 }}>🔄 Reasignación de oficio</p>
            <p style={{ margin: '4px 0 0' }}>
              La asignación actual quedará inactiva y el oficio regresará a estado <strong>Asignado</strong> con el nuevo jurídico.
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Nuevo abogado <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <select
              value={reassignAbogadoId}
              onChange={(e) => setReassignAbogadoId(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
              required
            >
              <option value="">— Selecciona un abogado —</option>
              {abogados.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre} ({a.email})</option>
              ))}
            </select>
            {abogados.length === 0 && (
              <p style={{ margin: '8px 0 0', padding: '10px 12px', borderRadius: '6px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.78rem' }}>
                No hay analistas jurídicos en tu área. Se consideran analistas quienes tienen habilitado
                el módulo «Recepción de Oficios» y no están designados como oficial de partes ni encargado.
                Pídele al administrador que habilite el módulo a quien corresponda.
              </p>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Motivo de reasignación</label>
            <textarea
              style={{ ...inputStyle, width: '100%', height: '80px', resize: 'vertical', textTransform: 'uppercase' }}
              value={reassignMotivo}
              onChange={(e) => setReassignMotivo(e.target.value.toUpperCase())}
              placeholder="INDICA EL MOTIVO DEL CAMBIO DE ASIGNACIÓN…"
            />
          </div>

          {reassignError && <div role="alert" style={alertStyle}>{reassignError}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => { setShowReassign(false); setReassignAbogadoId(''); setReassignMotivo(''); setReassignError(null); }}
              style={btnSecondary}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reassigning || !reassignAbogadoId}
              style={{ ...btnPrimary, backgroundColor: reassigning || !reassignAbogadoId ? theme.colors.grayMid : theme.colors.gold }}
            >
              {reassigning ? 'Reasignando…' : '🔄 Confirmar Reasignación'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Upload Signed PDF Modal ───────────────────────── */}
      <Modal open={showUpload} title={`Subir Documento Firmado — ${selected?.folio}`} onClose={() => { setShowUpload(false); setSignedFile(null); setUploadError(null); }}>
        <form onSubmit={handleUploadSigned} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Documento escaneado y firmado (PDF) <span style={{ color: theme.colors.alert.red }}>*</span></label>
            <input type="file" accept="application/pdf" onChange={(e) => setSignedFile(e.target.files?.[0] ?? null)} style={{ fontSize: '0.875rem' }} aria-required="true" />
            {signedFile && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.alert.green }}>✓ {signedFile.name}</p>}
          </div>
          {uploadError && <div role="alert" style={alertStyle}>{uploadError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => setShowUpload(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={uploading || !signedFile} style={btnPrimary}>{uploading ? 'Subiendo…' : 'Finalizar Oficio'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const TrafficDot: React.FC<{ tiene_termino: boolean; dias: number | null }> = ({ tiene_termino, dias }) => {
  let color = theme.colors.alert.green;
  if (tiene_termino && dias !== null) {
    if (dias <= 1) color = theme.colors.alert.red;
    else if (dias <= 3) color = theme.colors.alert.yellow;
  }
  return <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} aria-hidden="true" />;
};

// ── Styles ────────────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties      = { padding: '13px 14px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.colors.textSecondary, borderBottom: `2px solid ${theme.colors.border}` };
const tdStyle: React.CSSProperties      = { padding: '11px 14px', verticalAlign: 'middle' };
const inputStyle: React.CSSProperties   = { padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const };
const labelStyle: React.CSSProperties   = { display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.875rem' };
const btnPrimary: React.CSSProperties   = { padding: '9px 20px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' };
const btnAction: React.CSSProperties    = { padding: '5px 12px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginRight: '4px' };
const alertStyle: React.CSSProperties   = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
