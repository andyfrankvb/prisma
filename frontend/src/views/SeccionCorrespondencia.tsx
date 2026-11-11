/**
 * SeccionCorrespondencia — el módulo Control de Correspondencia.
 *
 * Cuatro pestañas, cuatro preguntas distintas sobre la misma tabla:
 *
 *   · Armando   los que estoy preparando y todavía no salen
 *   · Traigo    los que están bajo mi custodia AHORA. Es la que convierte esto en
 *               control y no en historial: si algo se pierde, aquí se ve quién lo
 *               tenía al último.
 *   · Para mí   los que vienen en camino, con su código a la vista
 *   · Todos     el histórico
 *
 * Todos los colores salen del tema, sin literales, para que el día que se haga el
 * modo oscuro este módulo ya esté listo y la deuda no crezca.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { theme } from '../theme';
import { Icono } from '../components/Icono';
import { Modal } from '../components/Modal';
import { PDFPreviewer } from '../components/PDFPreviewer';
import { HistorialModal } from '../components/HistorialModal';
import { SearchableSelect } from '../components/SearchableSelect';
import { GuiaPaqueteImpresa } from '../components/GuiaPaqueteImpresa';
import { useDialogo } from '../context/DialogoContext';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  getPaquetes, getPaquete, getDestinatariosPaquete, crearPaquete,
  agregarAPaquete, quitarDePaquete, cerrarPaquete, cancelarPaquete, getEtiquetaPaquete,
  buscarOficiosParaPaquete,
} from '../api';
import type { Paquete, VistaPaquetes, OficioEnPaquete, MovimientoPaquete } from '../api';

type Candidato = {
  id: number; folio: string; numero_oficio_origen: string | null;
  remitente: string; dependencia_origen: string | null;
  fecha_oficio: string | null; descripcion_solicitud: string | null;
  estatus: string; fecha_registro: string;
  dirigido_a_nombre: string | null;
};

type Detalle = Paquete & { oficios: OficioEnPaquete[]; recorrido: MovimientoPaquete[] };

const PESTANAS: { clave: VistaPaquetes; texto: string }[] = [
  { clave: 'armando', texto: 'Armando'  },
  { clave: 'traigo',  texto: 'Traigo'   },
  { clave: 'para_mi', texto: 'Para mí'  },
  { clave: 'todos',   texto: 'Todos'    },
];

const COLOR_ESTADO: Record<string, { fondo: string; texto: string }> = {
  ABIERTO:     { fondo: theme.colors.background,  texto: theme.colors.charcoal },
  EN_TRANSITO: { fondo: '#FDF6E7',                texto: theme.colors.gold },
  ENTREGADO:   { fondo: '#E9F5ED',                texto: theme.colors.alert.green },
  CANCELADO:   { fondo: theme.colors.background,  texto: theme.colors.grayMid },
};
const NOMBRE_ESTADO: Record<string, string> = {
  ABIERTO: 'Armando', EN_TRANSITO: 'En tránsito',
  ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
};
// Lenguaje formal: el recorrido es la bitácora del paquete y se lee en pantalla
// y en papel. Debe mantenerse igual en EscaneoPaquete.tsx, que muestra lo mismo.
const ETIQUETA_MOV: Record<string, string> = {
  CREADO: 'Integrado', CERRADO: 'Enviado', TRASLADO: 'En traslado',
  RELEVO: 'Entrega ofrecida', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
};

export const SeccionCorrespondencia: React.FC = () => {
  const isMobile = useIsMobile();
  const dialogo  = useDialogo();

  const [vista,    setVista]    = useState<VistaPaquetes>('armando');
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [aviso,    setAviso]    = useState<string | null>(null);

  const [detalle,  setDetalle]  = useState<Detalle | null>(null);

  // Armar uno nuevo
  const [creando,  setCreando]  = useState(false);
  const [personas, setPersonas] = useState<{ id: number; nombre: string; unidad: string | null }[]>([]);
  const [destino,  setDestino]  = useState('');
  const [nota,     setNota]     = useState('');

  // Agregar oficios
  const [buscandoOficio, setBuscandoOficio] = useState(false);
  const [busca,     setBusca]     = useState('');
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  // Lo que no está en PRISMA: un acuse, un plano, una USB. Viaja en el mismo
  // sobre y dejarlo fuera del registro sería perder de vista lo que se mueve.
  const [libre, setLibre] = useState('');
  // Qué carátula se está viendo para cotejar. Null = solo la lista.
  const [viendo, setViendo] = useState<Candidato | null>(null);
  // El historial del oficio, con el MISMO componente del detalle del oficio.
  const [historial, setHistorial] = useState<Candidato | null>(null);

  // La guía para imprimir y pegar al sobre. Guarda los datos del paquete al
  // momento de cerrarlo: el detalle se recarga enseguida y no conviene que la
  // guía cambie de contenido mientras está en pantalla.
  const [etiqueta, setEtiqueta] = useState<{
    folio: string; codigo: string; qr: string; url: string;
    remitente: string; unidadOrigen: string;
    destinatario: string; unidadDestino: string;
    documentos: number; observaciones: string | null; fecha: string;
    /** Entregado: la guía ya no se imprime, se ve como acuse con su contenido. */
    entregado: boolean;
    contenido: OficioEnPaquete[];
  } | null>(null);

  const notificar = (m: string) => { setAviso(m); setTimeout(() => setAviso(null), 5000); };

  /**
   * Imprime SOLO la guía de papel (GuiaPaqueteImpresa), no la pantalla.
   * Sin esto, `window.print()` manda al papel toda la pantalla, incluido el
   * código de recepción — y ese código es justo lo que no debe ir en el sobre:
   * quien lo trae en la mano podría darse por destinatario.
   * La regla vive en frontend/src/global.css (body.imprimiendo-etiqueta).
   */
  const imprimirEtiqueta = () => {
    document.body.classList.add('imprimiendo-etiqueta');
    const limpiar = () => {
      document.body.classList.remove('imprimiendo-etiqueta');
      window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);
    window.print();
    // Respaldo: algunos navegadores no disparan `afterprint` si se cancela
    // el diálogo, y la pantalla se quedaría en blanco al volver.
    setTimeout(limpiar, 1000);
  };

  const cargar = useCallback(() => {
    setCargando(true); setError(null);
    getPaquetes(vista)
      .then((r) => setPaquetes(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [vista]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirDetalle = (id: number) => {
    getPaquete(id).then((r) => setDetalle(r.data)).catch((e) => setError(e.message));
  };
  const refrescarDetalle = () => { if (detalle) abrirDetalle(detalle.id); cargar(); };

  // ── Armar ──────────────────────────────────────────────────────────────────

  const abrirCrear = () => {
    setCreando(true); setDestino(''); setNota('');
    if (!personas.length) getDestinatariosPaquete().then((r) => setPersonas(r.data)).catch(() => {});
  };

  const guardarNuevo = async () => {
    if (!destino) return;
    try {
      const r = await crearPaquete(Number(destino), nota.trim() || undefined);
      setCreando(false);
      notificar(r.message);
      setVista('armando');
      cargar();
      abrirDetalle(r.data.id);
    } catch (e: any) { setError(e.message); }
  };

  // ── Oficios dentro ─────────────────────────────────────────────────────────

  const buscarOficios = async (texto: string) => {
    setBusca(texto);
    if (texto.trim().length < 2) { setCandidatos([]); return; }
    try {
      const r = await buscarOficiosParaPaquete(texto.trim());
      setCandidatos(r.data);
    } catch { setCandidatos([]); }
  };

  const meter = async (que: { oficio_id?: number; descripcion?: string }) => {
    if (!detalle) return;
    try {
      const r = await agregarAPaquete(detalle.id, que);
      notificar(r.message);
      setBusca(''); setCandidatos([]); setLibre(''); setBuscandoOficio(false); setViendo(null);
      refrescarDetalle();
    } catch (e: any) { setError(e.message); }
  };

  const sacar = async (contenidoId: number) => {
    if (!detalle) return;
    try { await quitarDePaquete(detalle.id, contenidoId); refrescarDetalle(); }
    catch (e: any) { setError(e.message); }
  };

  // ── Cerrar: aquí nace el código y el QR ────────────────────────────────────

  const cerrar = async () => {
    if (!detalle) return;
    const sigue = await dialogo.confirmar({
      titulo:    'Cerrar el paquete',
      mensaje:   `«${detalle.folio}» quedará listo para salir. Ya no se le podrán agregar ni quitar oficios, `
               + 'y se generará el código que el destinatario dará al recibirlo.',
      confirmar: 'Cerrar e imprimir',
    });
    if (!sigue) return;

    try {
      const r = await cerrarPaquete(detalle.id);
      // La dirección la manda el servidor, no se arma aquí con
      // `window.location.origin`: trabajando en local eso produce un QR con
      // «localhost», que al escanearlo apunta al propio teléfono y no lleva a
      // ningún lado. Se imprimiría un papel con una dirección inservible.
      const qr = await QRCode.toDataURL(r.data.url_qr, { width: 520, margin: 1 });
      setEtiqueta({
        folio: r.data.folio, codigo: r.data.codigo, qr, url: r.data.url_qr,
        entregado: false,
        contenido: detalle.oficios,
        remitente:     detalle.creado_por_nombre    ?? '—',
        unidadOrigen:  detalle.unidad_origen_nombre ?? '—',
        destinatario:  detalle.destinatario_nombre,
        unidadDestino: detalle.destinatario_unidad  ?? '—',
        documentos:    detalle.oficios.length,
        observaciones: detalle.observaciones,
        fecha:         new Date().toLocaleString('es-MX', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      });
      notificar(r.message);
      refrescarDetalle();
    } catch (e: any) { setError(e.message); }
  };

  /**
   * Vuelve a mostrar la guía de un paquete que ya salió. El QR se dibuja otra vez
   * con el MISMO token, así que el papel reimpreso equivale al original.
   */
  const verGuia = async () => {
    if (!detalle) return;
    try {
      const r  = await getEtiquetaPaquete(detalle.id);
      const qr = await QRCode.toDataURL(r.data.url_qr, { width: 520, margin: 1 });
      setEtiqueta({
        folio: r.data.folio, codigo: r.data.codigo ?? '', qr, url: r.data.url_qr,
        entregado: r.data.estado === 'ENTREGADO',
        contenido: detalle.oficios,
        remitente:     detalle.creado_por_nombre    ?? '—',
        unidadOrigen:  detalle.unidad_origen_nombre ?? '—',
        destinatario:  detalle.destinatario_nombre,
        unidadDestino: detalle.destinatario_unidad  ?? '—',
        documentos:    detalle.oficios.length,
        observaciones: detalle.observaciones,
        // La fecha de la guía es la de salida del paquete, no la de hoy: una
        // reimpresión no cambia cuándo se envió.
        fecha: new Date(detalle.cerrado_en ?? detalle.creado_en).toLocaleString('es-MX', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      });
    } catch (e: any) { setError(e.message); }
  };

  const cancelar = async () => {
    if (!detalle) return;
    const sigue = await dialogo.confirmar({
      titulo:    'Cancelar el paquete',
      mensaje:   'Los oficios que lleva quedarán libres para ir en otro. Esto solo se puede antes de que salga.',
      confirmar: 'Cancelar el paquete',
      peligro:   true,
    });
    if (!sigue) return;
    try {
      const r = await cancelarPaquete(detalle.id, '');
      notificar(r.message);
      setDetalle(null); cargar();
    } catch (e: any) { setError(e.message); }
  };

  const conteo = useMemo(() => paquetes.length, [paquetes]);

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px', fontFamily: theme.font.family,
                  maxWidth: '1100px', margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: theme.colors.primaryDark }}>
            Control de Correspondencia
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: '0.85rem', color: theme.colors.textSecondary, maxWidth: '58ch' }}>
            Arma un paquete con los oficios que van para una persona, imprime su código
            y sigue por dónde va hasta que lo reciba.
          </p>
        </div>
        <button onClick={abrirCrear} style={btnPrimario}>
          <Icono nombre="mas" size={14} strokeWidth={2.4} />Armar paquete
        </button>
      </div>

      {aviso && (
        <div role="status" style={{ ...bloqueAviso, backgroundColor: '#E9F5ED', color: theme.colors.alert.green }}>
          <Icono nombre="checkCirculo" inline />{aviso}
        </div>
      )}
      {error && (
        <div role="alert" onClick={() => setError(null)}
             style={{ ...bloqueAviso, backgroundColor: '#FDECEF', color: theme.colors.primary, cursor: 'pointer' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}

      {/* ── Pestañas ── */}
      <div role="tablist" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap',
                                   borderBottom: `1px solid ${theme.colors.border}`, marginBottom: '18px' }}>
        {PESTANAS.map((p) => (
          <button key={p.clave} role="tab" aria-selected={vista === p.clave}
                  onClick={() => setVista(p.clave)}
                  style={vista === p.clave ? pestanaActiva : pestana}>
            {p.texto}
            {vista === p.clave && conteo > 0 && (
              <span style={contador}>{conteo}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Lista ── */}
      {cargando ? (
        <p style={{ color: theme.colors.textSecondary }}>Cargando…</p>
      ) : paquetes.length === 0 ? (
        <div style={vacio}>
          <p style={{ margin: 0, fontWeight: 700, color: theme.colors.textPrimary }}>
            {TEXTO_VACIO[vista].titulo}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.86rem' }}>{TEXTO_VACIO[vista].detalle}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {paquetes.map((p) => (
            <button key={p.id} onClick={() => abrirDetalle(p.id)} style={tarjeta}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <strong style={{ color: theme.colors.primaryDark, fontSize: '0.95rem' }}>{p.folio}</strong>
                <Insignia estado={p.estado} />
                <span style={{ fontSize: '0.78rem', color: theme.colors.grayMid }}>
                  {p.cuantos_oficios} {p.cuantos_oficios === 1 ? 'oficio' : 'oficios'}
                </span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
                Para <strong style={{ color: theme.colors.textPrimary }}>{p.destinatario_nombre}</strong>
                {p.destinatario_unidad && ` · ${p.destinatario_unidad}`}
              </div>
              {p.custodio_nombre && p.estado === 'EN_TRANSITO' && (
                <div style={{ marginTop: '3px', fontSize: '0.8rem', color: theme.colors.grayMid }}>
                  Lo trae {p.custodio_nombre}
                </div>
              )}
              {/* El código solo llega en la vista «para mí»: es de quien recibe. */}
              {p.codigo_recepcion && (
                <div style={cajaCodigo}>
                  Tu código para recibirlo: <strong style={{ letterSpacing: '0.2em' }}>{p.codigo_recepcion}</strong>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Armar uno nuevo ── */}
      <Modal open={creando} title="Armar paquete" onClose={() => setCreando(false)} width={480}>
        <div style={{ display: 'grid', gap: '14px', marginBottom: '18px' }}>
          <div>
            <label style={rotulo}>¿Para quién es? <span style={{ color: theme.colors.alert.red }}>*</span></label>
            {/* Con buscador: la lista de destinatarios es larga (decenas de personas)
                y se busca indistintamente por nombre o por área, porque la etiqueta
                de cada opción lleva ambos («Nombre · Área»). */}
            <SearchableSelect
              value={destino}
              options={personas.map((p) => ({
                value: String(p.id),
                label: `${p.nombre}${p.unidad ? ` · ${p.unidad}` : ''}`,
              }))}
              onChange={setDestino}
              placeholder="— Elige a la persona —"
            />
            <p style={pie}>
              Un paquete va dirigido a una sola persona. Si a la misma oficina van documentos
              para tres, arma tres paquetes: viajan juntos pero se rastrean por separado.
            </p>
          </div>
          <div>
            <label style={rotulo}>Observaciones</label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)}
                      style={{ ...campo, height: '68px', resize: 'vertical' }}
                      placeholder="Opcional" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={() => setCreando(false)} style={btnSecundario}>Cancelar</button>
          <button onClick={guardarNuevo} disabled={!destino} style={btnPrimario}>Crear</button>
        </div>
      </Modal>

      {/* ── Detalle ── */}
      <Modal open={!!detalle} title={detalle ? `Paquete ${detalle.folio}` : ''}
             onClose={() => setDetalle(null)} width={620}>
        {detalle && (
          <div style={{ display: 'grid', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Insignia estado={detalle.estado} />
              <span style={{ fontSize: '0.86rem', color: theme.colors.textSecondary }}>
                Para <strong style={{ color: theme.colors.textPrimary }}>{detalle.destinatario_nombre}</strong>
              </span>
            </div>

            {detalle.codigo_recepcion && (
              <div style={cajaCodigo}>
                Tu código para recibirlo: <strong style={{ letterSpacing: '0.2em' }}>{detalle.codigo_recepcion}</strong>
              </div>
            )}

            {/* Qué lleva */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                <span style={rotuloSeccion}>Lleva {detalle.oficios.length} {detalle.oficios.length === 1 ? 'oficio' : 'oficios'}</span>
                {detalle.estado === 'ABIERTO' && (
                  <button onClick={() => setBuscandoOficio(true)} style={btnTexto}>
                    <Icono nombre="mas" size={13} />Agregar contenido
                  </button>
                )}
              </div>
              {detalle.oficios.length === 0 ? (
                <p style={{ ...pie, marginTop: '8px' }}>
                  Todavía no lleva nada. Agrégale al menos un oficio antes de cerrarlo.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '4px', marginTop: '8px' }}>
                  {detalle.oficios.map((o) => (
                    <div key={o.contenido_id} style={renglonOficio}>
                      <div style={{ minWidth: 0 }}>
                        {o.folio ? (
                          <>
                            <strong style={{ fontSize: '0.84rem', color: theme.colors.primaryDark }}>{o.folio}</strong>
                            <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                              {o.remitente}{o.dependencia_origen ? ` · ${o.dependencia_origen}` : ''}
                            </div>
                          </>
                        ) : (
                          <>
                            <strong style={{ fontSize: '0.84rem', color: theme.colors.charcoal }}>
                              {o.descripcion}
                            </strong>
                            <div style={{ fontSize: '0.72rem', color: theme.colors.grayMid }}>
                              No está registrado en PRISMA
                            </div>
                          </>
                        )}
                      </div>
                      {detalle.estado === 'ABIERTO' && (
                        <button onClick={() => sacar(o.contenido_id)} title="Quitar del paquete"
                                style={{ ...btnTexto, color: theme.colors.gold }}>Quitar</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recorrido */}
            {detalle.recorrido.length > 0 && (
              <div>
                <span style={rotuloSeccion}>Recorrido del paquete</span>
                <div style={{ display: 'grid', gap: '2px', marginTop: '8px' }}>
                  {detalle.recorrido.map((m) => (
                    <div key={m.id} style={renglonRecorrido}>
                      <span style={{ fontWeight: 700, color: theme.colors.charcoal }}>
                        {ETIQUETA_MOV[m.tipo] ?? m.tipo}
                      </span>
                      <span style={{ color: theme.colors.textSecondary }}>
                        {m.quien ?? '—'}
                        {m.declarado && (
                          <span title="Se identificó escribiendo su nombre, sin cuenta en el sistema"
                                style={marcaDeclarado}>declarado</span>
                        )}
                      </span>
                      <span style={{ color: theme.colors.grayMid, fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                        {new Date(m.registrado_en).toLocaleString('es-MX',
                          { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acciones */}
            {detalle.estado === 'ABIERTO' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={cancelar} style={{ ...btnSecundario, color: theme.colors.gold,
                                                    borderColor: theme.colors.gold }}>
                  Cancelar paquete
                </button>
                <button onClick={cerrar} disabled={detalle.oficios.length === 0} style={btnPrimario}>
                  Cerrar e imprimir código
                </button>
              </div>
            )}

            {/* Ya salió: la guía se puede volver a ver cuantas veces haga falta —
                el papel se pierde o se arruga y reimprimirlo no cambia nada, es el
                mismo token. Un paquete cancelado no tiene guía que mostrar. */}
            {detalle.estado !== 'ABIERTO' && detalle.estado !== 'CANCELADO' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={verGuia} style={btnSecundario}>
                  <Icono nombre="documento" size={14} />
                  {detalle.estado === 'ENTREGADO' ? 'Ver acuse' : 'Ver guía'}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Buscar un oficio para meterlo ── */}
      {/* ── Agregar contenido ───────────────────────────────────────────────
          Panel a la IZQUIERDA con el visor a la derecha, al revés que en el
          módulo de oficios —donde el documento va a la izquierda y el expediente
          a la derecha—. Aquí lo que manda es la lista: se está eligiendo de
          varios candidatos, y la carátula solo sirve para confirmar cuál es.
          Por eso la lista se queda quieta en su lugar y el documento aparece al
          lado, en vez de taparla como haría una ventana centrada. */}
      {buscandoOficio && (
        <>
          {/* Fondo. Cierra todo al tocarlo, como cualquier ventana del sistema. */}
          <div onClick={() => { setBuscandoOficio(false); setBusca(''); setCandidatos([]); setLibre(''); setViendo(null); }}
               style={fondoCapa} />

          <div style={{ ...panelIzq, right: viendo && !isMobile ? 'calc(50vw + 6px)' : undefined,
                        width: viendo && !isMobile ? 'auto' : (isMobile ? 'auto' : '620px') }}>
            <div style={barraPanel}>
              <span style={tituloPanel}>Agregar contenido al paquete</span>
              <button onClick={() => { setBuscandoOficio(false); setBusca(''); setCandidatos([]); setLibre(''); setViendo(null); }}
                      aria-label="Cerrar" style={btnCerrarPanel}>×</button>
            </div>

            <div style={cuerpoPanel}>
              <p style={{ ...pie, marginTop: 0 }}>
                Busca un oficio ya registrado, o describe abajo algo que no esté en el sistema.
              </p>
              <input value={busca} onChange={(e) => buscarOficios(e.target.value)} autoFocus
                     placeholder="Busca por folio, número de origen, remitente o dependencia…"
                     style={campo} />

              <div style={{ marginTop: '12px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {busca.trim().length < 2 ? (
                  <p style={pie}>Escribe al menos dos letras.</p>
                ) : candidatos.length === 0 ? (
                  <p style={pie}>Ningún oficio coincide. Los que ya viajan en otro paquete no aparecen.</p>
                ) : candidatos.map((o) => (
                  <div key={o.id} style={{ ...renglonCandidato,
                                           backgroundColor: viendo?.id === o.id ? theme.colors.background : 'transparent' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.86rem', color: theme.colors.primaryDark }}>{o.folio}</strong>
                        {o.numero_oficio_origen && (
                          <span style={{ fontSize: '0.78rem', color: theme.colors.charcoal, fontWeight: 600 }}>
                            {o.numero_oficio_origen}
                          </span>
                        )}
                        {o.fecha_oficio && (
                          <span style={{ fontSize: '0.74rem', color: theme.colors.grayMid }}>
                            {new Date(`${String(o.fecha_oficio).slice(0, 10)}T00:00:00`)
                              .toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                        {o.remitente}{o.dependencia_origen ? ` · ${o.dependencia_origen}` : ''}
                      </span>
                      {o.descripcion_solicitud?.trim() && (
                        <span style={{ fontSize: '0.75rem', color: theme.colors.grayMid,
                                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.descripcion_solicitud.trim().slice(0, 120)}
                        </span>
                      )}
                    </div>

                    {/* El ojo abre la carátula al lado. Va separado del resto del
                        renglón: mirar para cotejar no es lo mismo que agregar, y
                        con un solo blanco de toque se agregaría el equivocado. */}
                    <button onClick={() => setViendo(viendo?.id === o.id ? null : o)}
                            title="Ver la carátula del oficio"
                            style={{ ...btnIcono, color: viendo?.id === o.id ? theme.colors.gold : theme.colors.grayMid }}>
                      <Icono nombre="ojo" size={17} />
                    </button>
                    <button onClick={() => setHistorial(o)}
                            title="Ver el historial del oficio"
                            style={{ ...btnIcono, color: theme.colors.grayMid }}>
                      <Icono nombre="historial" size={17} />
                    </button>
                    <button onClick={() => meter({ oficio_id: o.id })} style={btnAgregarChico}>
                      Agregar
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${theme.colors.border}` }}>
                <label style={rotulo}>¿Va algo que no está en PRISMA?</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input value={libre} onChange={(e) => setLibre(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter' && libre.trim()) meter({ descripcion: libre.trim() }); }}
                         placeholder="Ej. Acuse original sellado, plano del predio…"
                         style={{ ...campo, flex: '1 1 240px' }} />
                  <button onClick={() => meter({ descripcion: libre.trim() })}
                          disabled={!libre.trim()} style={btnPrimario}>Agregar</button>
                </div>
              </div>
            </div>
          </div>

          {/* El visor, a la derecha. */}
          {viendo && !isMobile && (
            <div style={panelDer}>
              <div style={{ ...barraPanel, background: `linear-gradient(135deg, ${theme.colors.goldLight} 0%, ${theme.colors.gold} 100%)` }}>
                <span style={tituloPanel}>Carátula · {viendo.folio}</span>
                <button onClick={() => setViendo(null)} aria-label="Cerrar la carátula"
                        style={btnCerrarPanel}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: '12px', backgroundColor: '#F0F0EC', overflow: 'auto' }}>
                {/* `/api/v1/files/...`, no `/files/...`: aquella ruta la sirve
                    nginx para las URLs guardadas en la base, y el endpoint por id
                    del oficio vive donde está montado el router. Con la otra el
                    visor decía «documento no disponible» sobre archivos que sí
                    estaban en disco. */}
                <PDFPreviewer
                  url={`/api/v1/files/${viendo.id}/original`}
                  title={viendo.folio}
                  height="calc(100vh - 176px)"
                  hideExtractedText
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* El historial, con el mismo componente que abre «Ver historial» dentro del
          expediente. Un segundo historial paralelo se separaría del original en
          cuanto uno de los dos cambiara. */}
      {/* Encima del panel de agregar, que vive en 1210 mientras el `Modal` común
          usa 1000: sin envolverlo, el historial se abría por debajo y quedaba a
          medias detrás de la lista. */}
      {historial && (
        <div style={{ position: 'relative', zIndex: 1300 }}>
        <HistorialModal
          oficio={{ id: historial.id, folio: historial.folio,
                    estatus: historial.estatus as any, fecha_registro: historial.fecha_registro }}
          open
          onClose={() => setHistorial(null)}
        />
        </div>
      )}

      {/* ── La guía: para pegar al sobre mientras viaja; como acuse si ya llegó ── */}
      <Modal open={!!etiqueta} title={etiqueta?.entregado ? 'Paquete entregado' : 'Guía del paquete'}
             onClose={() => setEtiqueta(null)} width={420}>
        {etiqueta && etiqueta.entregado && (
          /* Ya llegó: la guía no se imprime —el sobre está abierto y el código
             cumplió su función—. Lo que importa ahora es qué documentos llegaron,
             así que la ventana muestra el contenido. */
          <div>
            <p style={{ margin: 0, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: theme.colors.gold }}>
              Entregado
            </p>
            <p style={{ margin: '2px 0 12px', fontSize: '1.05rem', fontWeight: 800,
                        color: theme.colors.primaryDark }}>{etiqueta.folio}</p>

            <div style={{ ...bloqueEtiqueta, marginTop: 0 }}>
              <div style={rotuloEtiqueta}>Entregado a</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{etiqueta.destinatario}</div>
              <div style={{ fontSize: '0.8rem', color: theme.colors.textSecondary }}>{etiqueta.unidadDestino}</div>
            </div>

            <div style={{ ...bloqueEtiqueta }}>
              <div style={rotuloEtiqueta}>
                {etiqueta.contenido.length === 1 ? 'Documento entregado' : 'Documentos entregados'}
              </div>
              <div style={{ display: 'grid', gap: '6px', marginTop: '4px' }}>
                {etiqueta.contenido.map((o) => (
                  <div key={o.contenido_id} style={{ fontSize: '0.84rem' }}>
                    {o.folio ? (
                      <>
                        <strong>{o.folio}</strong>
                        {o.remitente && (
                          <span style={{ color: theme.colors.textSecondary }}> · {o.remitente}</span>
                        )}
                      </>
                    ) : o.descripcion}
                  </div>
                ))}
              </div>
              {etiqueta.observaciones && (
                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                  {etiqueta.observaciones}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setEtiqueta(null)} style={btnSecundario}>Cerrar</button>
            </div>
          </div>
        )}
        {/* La versión de papel: invisible en pantalla, es lo único que sale al
            imprimir. Ver GuiaPaqueteImpresa y global.css (#guia-impresion). */}
        {etiqueta && !etiqueta.entregado && (
          <GuiaPaqueteImpresa
            folio={etiqueta.folio} fecha={etiqueta.fecha} qr={etiqueta.qr} url={etiqueta.url}
            remitente={etiqueta.remitente} unidadOrigen={etiqueta.unidadOrigen}
            destinatario={etiqueta.destinatario} unidadDestino={etiqueta.unidadDestino}
            observaciones={etiqueta.observaciones} contenido={etiqueta.contenido}
          />
        )}
        {etiqueta && !etiqueta.entregado && (
          <div>
            {/* Guía de envío, al estilo de una paquetería: de un vistazo se ve de
                dónde sale, a dónde va y qué lleva. El código de recepción NO va
                aquí (ver más abajo). */}
            <div id="etiqueta-para-imprimir" style={hojaEtiqueta}>
              <div style={filaEtiqueta}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em',
                              textTransform: 'uppercase', color: theme.colors.gold }}>
                    Control de Correspondencia
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '1.15rem', fontWeight: 800,
                              color: theme.colors.primaryDark }}>{etiqueta.folio}</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.68rem', color: theme.colors.textSecondary }}>
                  <div style={rotuloEtiqueta}>Fecha de envío</div>
                  <div style={{ fontWeight: 700, color: theme.colors.textPrimary }}>{etiqueta.fecha}</div>
                </div>
              </div>

              <div style={bloqueEtiqueta}>
                <div style={rotuloEtiqueta}>De</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{etiqueta.remitente}</div>
                <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>{etiqueta.unidadOrigen}</div>
              </div>

              <div style={{ ...bloqueEtiqueta, backgroundColor: theme.colors.background }}>
                <div style={rotuloEtiqueta}>Para</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{etiqueta.destinatario}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{etiqueta.unidadDestino}</div>
              </div>

              <div style={bloqueEtiqueta}>
                <div style={rotuloEtiqueta}>Contenido</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  {etiqueta.documentos === 1 ? '1 documento' : `${etiqueta.documentos} documentos`}
                </div>
                {etiqueta.observaciones && (
                  <div style={{ marginTop: '4px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                    {etiqueta.observaciones}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <img src={etiqueta.qr} alt={`Código del paquete ${etiqueta.folio}`}
                     style={{ width: '170px', height: '170px', display: 'block', margin: '0 auto' }} />
                <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                  Escanea este código con la cámara para registrar que lo traes.
                </p>
                {/* La dirección a la vista: si algún día el QR sale con «localhost»
                    o con un servidor equivocado, se ve ANTES de imprimir y pegar el
                    papel en un sobre que ya salió. */}
                <p style={{ margin: '4px 0 0', fontSize: '0.62rem', color: theme.colors.grayMid,
                            wordBreak: 'break-all' }}>
                  {etiqueta.url}
                </p>
              </div>
            </div>

            {/* El código NO va en la etiqueta a propósito: si estuviera impreso en el
                sobre, cualquiera que lo tuviera en la mano podría darse por
                destinatario, y es lo único que distingue recibir de transportar. */}
            {etiqueta.codigo && (
              <div style={{ ...cajaCodigo, marginTop: '14px' }}>
                Código de recepción: <strong style={{ letterSpacing: '0.2em' }}>{etiqueta.codigo}</strong>
                <div style={{ marginTop: '4px', fontSize: '0.76rem', fontWeight: 400 }}>
                  Lo tiene el destinatario en su pantalla. No lo imprimas en el sobre.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setEtiqueta(null)} style={btnSecundario}>Cerrar</button>
              <button onClick={imprimirEtiqueta} style={btnPrimario}>
                <Icono nombre="documento" size={14} />Imprimir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ── Piezas ───────────────────────────────────────────────────────────────────

const Insignia: React.FC<{ estado: string }> = ({ estado }) => {
  const c = COLOR_ESTADO[estado] ?? COLOR_ESTADO.ABIERTO;
  return (
    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem',
                   fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                   backgroundColor: c.fondo, color: c.texto, whiteSpace: 'nowrap' }}>
      {NOMBRE_ESTADO[estado] ?? estado}
    </span>
  );
};

const TEXTO_VACIO: Record<VistaPaquetes, { titulo: string; detalle: string }> = {
  armando: { titulo: 'No estás armando ningún paquete',
             detalle: 'Usa «Armar paquete» para preparar uno con los oficios que van a una persona.' },
  traigo:  { titulo: 'No traes ningún paquete',
             detalle: 'Aquí aparecen los que están bajo tu custodia después de escanear su código.' },
  para_mi: { titulo: 'No viene nada en camino para ti',
             detalle: 'Cuando alguien te mande un paquete, aparecerá aquí con tu código para recibirlo.' },
  todos:   { titulo: 'Todavía no hay paquetes',
             detalle: 'El primero que se arme aparecerá en esta lista.' },
};

// ── Estilos ──────────────────────────────────────────────────────────────────

const btnPrimario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '9px 16px', borderRadius: theme.radius.sm, border: 'none',
  backgroundColor: theme.colors.primary, color: theme.colors.white,
  fontFamily: theme.font.family, fontSize: '0.8rem', fontWeight: 700,
  letterSpacing: '0.03em', cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnSecundario: React.CSSProperties = {
  padding: '8px 15px', borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`, backgroundColor: 'transparent',
  color: theme.colors.textSecondary, fontFamily: theme.font.family,
  fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnTexto: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: theme.font.family, fontSize: '0.76rem', fontWeight: 700,
  color: theme.colors.primary, padding: 0,
};
const pestana: React.CSSProperties = {
  padding: '9px 16px', background: 'transparent', border: 'none',
  borderBottom: '2px solid transparent', cursor: 'pointer',
  fontFamily: theme.font.family, fontSize: '0.82rem', fontWeight: 700,
  color: theme.colors.textSecondary,
};
const pestanaActiva: React.CSSProperties = {
  ...pestana, color: theme.colors.primary, borderBottomColor: theme.colors.primary,
};
const contador: React.CSSProperties = {
  marginLeft: '7px', padding: '1px 7px', borderRadius: '20px', fontSize: '0.68rem',
  backgroundColor: theme.colors.primary, color: theme.colors.white,
};
const tarjeta: React.CSSProperties = {
  width: '100%', textAlign: 'left', padding: '14px 16px',
  borderRadius: '10px', border: `1px solid ${theme.colors.border}`,
  backgroundColor: theme.colors.surface, cursor: 'pointer',
  fontFamily: theme.font.family,
};
const vacio: React.CSSProperties = {
  padding: '34px 20px', textAlign: 'center', borderRadius: '10px',
  border: `1px dashed ${theme.colors.border}`, color: theme.colors.textSecondary,
};
const bloqueAviso: React.CSSProperties = {
  padding: '10px 14px', borderRadius: '8px', fontSize: '0.84rem',
  fontWeight: 600, marginBottom: '14px',
};
const cajaCodigo: React.CSSProperties = {
  marginTop: '10px', padding: '10px 14px', borderRadius: '8px',
  backgroundColor: '#FDF6E7', color: theme.colors.gold,
  fontSize: '0.84rem', fontWeight: 700,
};
const rotulo: React.CSSProperties = {
  display: 'block', marginBottom: '5px', fontWeight: 700,
  fontSize: '0.8rem', color: theme.colors.charcoal,
};
const rotuloSeccion: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: theme.colors.grayMid,
};
const campo: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: theme.radius.sm,
  border: `1px solid ${theme.colors.border}`, fontSize: '0.88rem',
  fontFamily: theme.font.family, boxSizing: 'border-box',
};
const pie: React.CSSProperties = {
  margin: '6px 0 0', fontSize: '0.76rem', color: theme.colors.textSecondary,
};
const renglonOficio: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
  padding: '9px 12px', borderRadius: '7px', border: `1px solid ${theme.colors.border}`,
};
const renglonCandidato: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
  padding: '10px 8px', borderBottom: `1px solid ${theme.colors.border}`,
  textAlign: 'left', fontFamily: theme.font.family,
};
const renglonRecorrido: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px',
  alignItems: 'baseline', padding: '6px 0', fontSize: '0.82rem',
  borderBottom: `1px solid ${theme.colors.border}`,
};
const marcaDeclarado: React.CSSProperties = {
  marginLeft: '7px', padding: '1px 6px', borderRadius: '10px', fontSize: '0.64rem',
  fontWeight: 700, backgroundColor: theme.colors.background, color: theme.colors.grayMid,
};
const fondoCapa: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(61,57,53,0.45)', zIndex: 1200,
};
/** Mismo encaje que el panel del expediente: 70 arriba (58 del encabezado + 12). */
const panelIzq: React.CSSProperties = {
  position: 'fixed', top: 70, bottom: 12, left: 12, zIndex: 1210,
  backgroundColor: theme.colors.surface, borderRadius: '12px', overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(61,57,53,0.10), 0 16px 44px rgba(61,57,53,0.24)',
  display: 'flex', flexDirection: 'column', maxWidth: 'calc(100vw - 24px)',
};
const panelDer: React.CSSProperties = {
  position: 'fixed', top: 70, bottom: 12, right: 12, left: 'calc(50vw + 6px)',
  zIndex: 1210, backgroundColor: theme.colors.surface, borderRadius: '12px',
  overflow: 'hidden', boxShadow: '0 2px 8px rgba(61,57,53,0.10), 0 16px 44px rgba(61,57,53,0.24)',
  display: 'flex', flexDirection: 'column',
};
const barraPanel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '10px', padding: '9px 18px', flexShrink: 0,
  backgroundColor: theme.colors.primaryDark, color: theme.colors.white,
};
const tituloPanel: React.CSSProperties = {
  fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const btnCerrarPanel: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)', border: 'none', color: theme.colors.white,
  fontSize: '1.05rem', cursor: 'pointer', lineHeight: 1, flexShrink: 0,
  width: '24px', height: '24px', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const cuerpoPanel: React.CSSProperties = {
  flex: 1, minHeight: 0, padding: '18px 20px', display: 'flex', flexDirection: 'column',
};
const btnIcono: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px',
  display: 'flex', alignItems: 'center', flexShrink: 0,
};
const btnAgregarChico: React.CSSProperties = {
  padding: '6px 12px', borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.primary}`,
  backgroundColor: 'transparent', color: theme.colors.primary, fontFamily: theme.font.family,
  fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
};

const hojaEtiqueta: React.CSSProperties = {
  padding: '16px', borderRadius: '10px', textAlign: 'left',
  border: `2px solid ${theme.colors.charcoal}`, backgroundColor: theme.colors.white,
};

const filaEtiqueta: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  gap: '12px', paddingBottom: '10px', borderBottom: `1px solid ${theme.colors.border}`,
};

const bloqueEtiqueta: React.CSSProperties = {
  padding: '8px 10px', marginTop: '8px', borderRadius: '6px',
  border: `1px solid ${theme.colors.border}`,
};

const rotuloEtiqueta: React.CSSProperties = {
  fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: theme.colors.grayMid, marginBottom: '2px',
};

export default SeccionCorrespondencia;
