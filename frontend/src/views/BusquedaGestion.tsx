import React, { useEffect, useRef, useState } from 'react';
import { Icono } from '../components/Icono';
import type { NombreIcono } from '../components/Icono';
import { gestionApi, GestionApi } from '../services/gestionApi';
import { CargaBusquedaGestion } from '../modules/gestion/CargaBusquedaGestion';
import type { Delegacion, Detalle, Fila, Filtros, Pagina, Resultado, Solicitud, Tab } from '../modules/gestion/types';
import '../modules/gestion/gestion.css';

const TABS: { id: Tab; titulo: string; icono: NombreIcono; lineas?: string[] }[] = [
  { id: 'estatus', titulo: 'Estatus de la solicitud', icono: 'historial', lineas: ['Estatus de la', 'solicitud'] },
  { id: 'solicitudes', titulo: 'Buscar solicitud', icono: 'buscar' },
  { id: 'referencias', titulo: 'Verificar referencias', icono: 'checkCirculo', lineas: ['Verificar', 'referencias'] },
  { id: 'imagen', titulo: 'Nombrar imagen', icono: 'documento' },
];
interface Estado { criterio: string; tipo: string; cargando: boolean; error: string; cancelando?: boolean; errorCancelacion?: string; mensaje?: string;
  resultado?: Resultado; pagos?: Pagina<Fila>; detalle?: Detalle; nombres?: Fila[]; filtros?: Filtros; }
interface Peticion { controller: AbortController; solicitadaCancelacion: boolean; completada: boolean; }
const inicial = (): Record<Tab, Estado> => Object.fromEntries(TABS.map(t => [t.id, {
  criterio: '', tipo: t.id === 'solicitudes' ? 'folio' : 'prelacion', cargando: false, error: '',
}])) as Record<Tab, Estado>;
const fecha = (v: string | null) => v?.slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') || '—';
const hora = (v: string | null) => v?.split(' ')[1] || '—';
const valor = (v: string | null | undefined) => v === null || v === undefined || v === '' ? '—' : v;
const importe = (v: string | null) => v && /^-?\d+(\.\d{1,2})?$/.test(v)
  ? '$' + v.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : valor(v);

interface Columna { campo: string; titulo: string; ancho: number; orden?: string; centro?: boolean; }
const folioCols: Columna[] = [
  { campo: 'prelacion', titulo: 'Prelación', ancho: 100, orden: 'prelacion', centro: true },
  { campo: 'fecha', titulo: 'Fecha', ancho: 110, orden: 'fecha', centro: true },
  { campo: 'seccion_descripcion', titulo: 'Sección', ancho: 140, orden: 'seccion' },
  { campo: 'movimientos', titulo: 'Movimiento(s)', ancho: 100, centro: true },
  { campo: 'actos_resumen', titulo: 'Acto(s)', ancho: 210 },
  { campo: 'estatus_resumen', titulo: 'Estatus', ancho: 210 },
  { campo: 'folios', titulo: 'Folio', ancho: 105 },
];
const escrituraCols: Columna[] = [folioCols[0], folioCols[1], folioCols[2],
  { campo: 'notaria_auto', titulo: 'Notaría / autoridad', ancho: 190, orden: 'notaria' },
  { campo: 'solicitante', titulo: 'Solicitante', ancho: 240, orden: 'solicitante' },
  { campo: 'num_esc_doc', titulo: 'Escritura', ancho: 180, orden: 'escritura' }];
const pagoCols: Columna[] = [folioCols[0], { ...folioCols[1], titulo: 'Fecha de solicitud' }, folioCols[3],
  { campo: 'folios', titulo: 'Folio', ancho: 100 }, { campo: 'actos_resumen', titulo: 'Acto', ancho: 190 },
  { campo: 'num_recibo', titulo: 'Núm. de recibo', ancho: 140 },
  { campo: 'fec_recibo', titulo: 'Fecha de recibo', ancho: 110, centro: true },
  { campo: 'importe_recibo', titulo: 'Importe', ancho: 110, centro: true }];

function DatosSolicitud({ data }: { data: Detalle }) {
  const s = data.solicitud;
  const cabecera: [string, string | null][] = [['Prelación', s.prelacion], ['Fecha de ingreso', fecha(s.fecha)],
    ['Hora de ingreso', hora(s.hora)], ['Sección', s.seccion_descripcion], ['Solicitante', s.solicitante],
    ['Documento', s.num_esc_doc], ['Núm. de notaría', s.num_notaria], ['Notaría / autoridad', s.notaria_auto]];
  const cols: Columna[] = [
    { campo: 'consec', titulo: 'Núm.', ancho: 65, centro: true }, { campo: 'acto_descripcion', titulo: 'Acto', ancho: 180 },
    { campo: 'nu_folio', titulo: 'Folio', ancho: 100 }, { campo: 'analista', titulo: 'Analista', ancho: 180 },
    { campo: 'fec_ana', titulo: 'Fecha de análisis', ancho: 110, centro: true },
    { campo: 'calificador', titulo: 'Calificador', ancho: 180 }, { campo: 'fec_cal', titulo: 'Fecha de calificación', ancho: 110, centro: true },
    { campo: 'estatus', titulo: 'Estatus', ancho: 190 }, { campo: 'motivo_rechazo', titulo: 'Motivo de rechazo', ancho: 200 },
  ];
  return <><dl className="g-data">{cabecera.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{valor(text)}</dd></div>)}</dl>
    <div className="g-section-head"><h3>Actos de la solicitud</h3></div>
    {data.actos.length ? <div className="g-scroll"><table><colgroup>{cols.map(c => <col key={c.campo} style={{ width: c.ancho }} />)}</colgroup>
      <thead><tr>{cols.map(c => <th key={c.campo} scope="col">{c.titulo}</th>)}</tr></thead>
      <tbody>{data.actos.map((a, i) => <tr key={`${a.consec}-${i}`}>{cols.map(c => <td key={c.campo} className={c.centro ? 'g-center' : ''}>
        {['fec_ana', 'fec_cal'].includes(c.campo) ? fecha(a[c.campo]) : valor(a[c.campo])}</td>)}</tr>)}</tbody></table></div>
      : <p className="g-empty">Sin actos vinculados a esta identidad en la fuente consultada.</p>}</>;
}

function VentanaDetalle({ data, loading, error, cerrar }: { data?: Detalle; loading: boolean; error: string; cerrar: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!d.open) d.showModal();
    return () => { if (d.open) d.close(); document.body.style.overflow = bodyOverflow; };
  }, []);
  return <dialog ref={dialog} id="g-detail-modal" aria-labelledby="g-modal-titulo"
    onClose={e => { if (!e.currentTarget.open) cerrar(); }}
    onCancel={e => { e.preventDefault(); cerrar(); }} onClick={e => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.target === e.currentTarget && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) cerrar();
    }}><section className="g-panel g-detail"><header className="g-detail-head"><h2 id="g-modal-titulo">Datos de la solicitud{data ? ' · ' + data.solicitud.prelacion : ''}</h2>
      <button type="button" className="g-button" autoFocus onClick={cerrar}>Cerrar detalle</button></header>
      <div className="g-detail-body">{loading && <p className="g-empty" role="status">Cargando solicitud…</p>}{error && <p className="g-message" role="alert">{error}</p>}
      {data && <DatosSolicitud data={data} />}</div></section></dialog>;
}

function Tabla({ titulo, pagina, columnas, cargando, filtros, cambiarPagina, ordenar, abrir, seleccionar }:
  { titulo: string; pagina: Pagina<Fila>; columnas: Columna[]; cargando: boolean; filtros?: Filtros;
    cambiarPagina: (n: number, limite?: number) => void; ordenar?: (campo: string) => void;
    abrir: (row: Fila, focus: HTMLElement) => void; seleccionar?: boolean; }) {
  return <section className="g-panel g-results"><div className="g-result-head"><h2>{titulo}</h2><span>{pagina.total} registro(s)</span></div>
    {pagina.filas.length ? <div className="g-scroll"><table><colgroup>{columnas.map(c => <col key={c.campo} style={{ width: c.ancho }} />)}<col style={{ width: seleccionar ? 100 : 65 }} /></colgroup>
      <thead><tr>{columnas.map(c => <th key={c.campo} scope="col" aria-sort={ordenar && c.orden && filtros && c.orden === filtros.orden ? filtros.direccion === 'asc' ? 'ascending' : 'descending' : undefined}>
        {ordenar && c.orden ? <button type="button" className="g-sort" disabled={cargando} onClick={() => ordenar(c.orden!)}>{c.titulo}<svg className="g-order" viewBox="0 0 10 16" aria-hidden="true"><path className="g-order-asc" d="M5 1 9 6H1Z" /><path className="g-order-desc" d="m5 15 4-5H1Z" /></svg></button> : c.titulo}</th>)}<th scope="col">{seleccionar ? 'Elegir' : 'Detalle'}</th></tr></thead>
      <tbody>{pagina.filas.map((r, i) => <tr key={`${r.id || r.origen}-${r.nu_secuen || ''}-${i}`} className={r.id ? 'g-row' : ''}
        onClick={e => { if (r.id) abrir(r, e.currentTarget); }} tabIndex={r.id ? 0 : undefined}
        onKeyDown={e => { if (e.target === e.currentTarget && r.id && ['Enter', ' '].includes(e.key)) { e.preventDefault(); abrir(r, e.currentTarget); } }}>
        {columnas.map(c => <td key={c.campo} className={c.centro ? 'g-center' : c.campo === 'folios' ? 'g-folio' : ''}>
          {['fecha', 'fec_recibo'].includes(c.campo) ? fecha(r[c.campo]) : c.campo === 'importe_recibo' ? importe(r[c.campo]) : valor(r[c.campo])}</td>)}
        <td className="g-center"><button type="button" className={seleccionar ? 'g-button' : 'g-view'} disabled={!r.id} aria-haspopup={seleccionar ? undefined : 'dialog'}
          aria-label={seleccionar ? `Seleccionar solicitud ${r.prelacion}` : `Ver solicitud ${r.prelacion}`}
          title={r.id ? 'Ver solicitud' : 'No se pudo resolver una solicitud única para este pago'}
          onClick={e => { e.stopPropagation(); abrir(r, e.currentTarget); }}>{seleccionar ? 'Elegir' : <Icono nombre="buscar" size={16} />}</button></td>
      </tr>)}</tbody></table></div> : <p className="g-empty">Sin coincidencias en la fuente consultada.</p>}
    <footer className="g-footer"><div className="g-size"><label>Registros por página <select aria-label={'Registros por página de ' + titulo} disabled={cargando} value={pagina.limite} onChange={e => cambiarPagina(1, Number(e.target.value))}>
      {[10, 25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label></div><div className="g-pagination">
      <button type="button" className="g-button" disabled={cargando || pagina.pagina <= 1} onClick={() => cambiarPagina(pagina.pagina - 1)}>Anterior</button>
      <span>Página {pagina.pagina} de {Math.max(1, Math.ceil(pagina.total / pagina.limite))}</span>
      <button type="button" className="g-button" disabled={cargando || pagina.pagina * pagina.limite >= pagina.total} onClick={() => cambiarPagina(pagina.pagina + 1)}>Siguiente</button></div></footer></section>;
}

export const BusquedaGestion: React.FC<{ cliente?: GestionApi }> = ({ cliente = gestionApi }) => {
  const [tab, setTab] = useState<Tab>('estatus');
  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([]);
  const [delegacion, setDelegacion] = useState('');
  const [catalogoError, setCatalogoError] = useState('');
  const [catalogoCargando, setCatalogoCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  const [estados, setEstados] = useState(inicial);
  const [copiado, setCopiado] = useState('');
  const [modal, setModal] = useState<{ token: number; data?: Detalle; error: string; loading: boolean; opener: HTMLElement } | null>(null);
  const controllers = useRef<Partial<Record<Tab, Peticion>>>({});
  const detalleController = useRef<AbortController>();
  const version = useRef(0);
  const modalToken = useRef(0);
  const devolverFoco = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!modal && devolverFoco.current) {
      const origen = devolverFoco.current;
      devolverFoco.current = null;
      if (origen.isConnected) origen.focus({ preventScroll: true });
    }
  }, [modal]);
  const actualizar = (t: Tab, cambios: Partial<Estado>) => setEstados(old => ({ ...old, [t]: { ...old[t], ...cambios } }));
  useEffect(() => {
    const c = new AbortController();
    setCatalogoCargando(true); setCatalogoError('');
    cliente.delegaciones(c.signal).then(d => { if (!c.signal.aborted) setDelegaciones(d); })
      .catch(e => { if (!c.signal.aborted) setCatalogoError(e.message); })
      .finally(() => { if (!c.signal.aborted) setCatalogoCargando(false); });
    return () => c.abort();
  }, [cliente, intento]);
  useEffect(() => () => { Object.values(controllers.current).forEach(c => c?.controller.abort()); detalleController.current?.abort(); }, []);

  const cerrarModal = (token?: number) => {
    if (token !== undefined && token !== modalToken.current) return;
    ++modalToken.current; detalleController.current?.abort();
    setModal(null);
  };
  const cambiarDelegacion = (d: string) => {
    ++version.current;
    Object.values(controllers.current).forEach(c => c?.controller.abort()); controllers.current = {}; cerrarModal(); setDelegacion(d); setCopiado('');
    setEstados(old => Object.fromEntries(TABS.map(t => [t.id, { criterio: old[t.id].criterio, tipo: old[t.id].tipo, cargando: false, error: '' }])) as Record<Tab, Estado>);
  };
  const abrir = async (row: Fila, opener: HTMLElement) => {
    if (!row.id) return;
    detalleController.current?.abort(); const c = new AbortController(); detalleController.current = c;
    const token = ++modalToken.current;
    devolverFoco.current = opener;
    setModal({ token, loading: true, error: '', opener });
    try {
      const data = await cliente.detalle(delegacion, row.id, c.signal);
      if (!c.signal.aborted && token === modalToken.current) setModal({ token, loading: false, error: '', data, opener });
    } catch (e) { if (!c.signal.aborted && token === modalToken.current) setModal({ token, loading: false, error: (e as Error).message, opener }); }
  };
  const elegirImagen = async (row: Fila) => {
    if (!row.id) return;
    controllers.current.imagen?.controller.abort();
    const peticion: Peticion = { controller: new AbortController(), solicitadaCancelacion: false, completada: false };
    const c = peticion.controller; controllers.current.imagen = peticion;
    const actual = () => controllers.current.imagen === peticion && !c.signal.aborted && !peticion.solicitadaCancelacion;
    actualizar('imagen', { cargando: true, cancelando: false, errorCancelacion: '', mensaje: '', error: '', nombres: undefined });
    try { const nombres = await cliente.imagenes(delegacion, row.id, c.signal); if (actual()) actualizar('imagen', { nombres }); }
    catch (e) { if (actual()) actualizar('imagen', { error: (e as Error).message }); }
    finally { peticion.completada = true; if (actual()) actualizar('imagen', { cargando: false }); }
  };
  const consultar = async (t: Tab, filtros?: Filtros) => {
    if (!delegacion) return;
    controllers.current[t]?.controller.abort();
    const peticion: Peticion = { controller: new AbortController(), solicitadaCancelacion: false, completada: false };
    const c = peticion.controller; controllers.current[t] = peticion;
    const ticket = version.current;
    const f: Filtros = filtros || { delegacion, criterio: estados[t].criterio.trim().toUpperCase(),
      tipo: t === 'solicitudes' ? estados[t].tipo : 'prelacion', pagina: 1, pagina_sugeridos: 1,
      limite: 25, orden: 'prelacion', direccion: 'asc' };
    if (!f.criterio) return;
    actualizar(t, { cargando: true, cancelando: false, errorCancelacion: '', mensaje: '', error: '', filtros: f,
      ...(!filtros ? { resultado: undefined, pagos: undefined, detalle: undefined, nombres: undefined } : {}) }); setCopiado('');
    const actual = () => controllers.current[t] === peticion && !c.signal.aborted && !peticion.solicitadaCancelacion && ticket === version.current;
    try {
      if (t === 'referencias') {
        const pagos = await cliente.referencias(delegacion, f.criterio, f.pagina, f.limite, c.signal);
        if (actual()) actualizar(t, { pagos });
      } else {
        const resultado = await cliente.buscar(f, c.signal);
        if (!actual()) return;
        actualizar(t, { resultado });
        if (['estatus', 'imagen'].includes(t) && resultado.exactos.total === 1 && resultado.exactos.filas.length === 1) {
          const id = resultado.exactos.filas[0].id;
          if (t === 'estatus') { const detalle = await cliente.detalle(delegacion, id, c.signal); if (actual()) actualizar(t, { detalle }); }
          else { const nombres = await cliente.imagenes(delegacion, id, c.signal); if (actual()) actualizar(t, { nombres }); }
        }
      }
    } catch (e) { if (actual()) actualizar(t, { error: (e as Error).message }); }
    finally { peticion.completada = true; if (actual()) actualizar(t, { cargando: false }); }
  };
  const cancelarBusqueda = async () => {
    const t = tab; const peticion = controllers.current[t];
    if (!peticion || peticion.solicitadaCancelacion || peticion.controller.signal.aborted) return;
    peticion.solicitadaCancelacion = true;
    actualizar(t, { cancelando: true, errorCancelacion: '' });
    try {
      if (!cliente.cancelarBusqueda) throw new Error('Este cliente no permite cancelar la consulta.');
      await cliente.cancelarBusqueda(peticion.controller.signal);
      if (controllers.current[t] === peticion) {
        peticion.controller.abort(); delete controllers.current[t];
        actualizar(t, { cargando: false, cancelando: false, errorCancelacion: '', mensaje: 'Búsqueda cancelada.' });
      }
    } catch (error) {
      if (controllers.current[t] === peticion && !peticion.controller.signal.aborted) {
        peticion.solicitadaCancelacion = false;
        const mensaje = (error as Error).message || 'No se pudo confirmar la cancelación. Vuelve a intentar.';
        actualizar(t, peticion.completada ? { cargando: false, cancelando: false, error: mensaje }
          : { cancelando: false, errorCancelacion: mensaje });
      }
    }
  };
  const e = estados[tab];
  const paginar = (grupo: 'exactos' | 'sugeridos' | 'pagos', pagina: number, limite?: number) => {
    if (e.filtros) void consultar(tab, { ...e.filtros, ...(limite ? { limite, pagina: 1, pagina_sugeridos: 1 } : grupo === 'sugeridos' ? { pagina_sugeridos: pagina } : { pagina }) });
  };
  const ordenar = (orden: string) => {
    if (e.filtros) void consultar(tab, { ...e.filtros, orden, direccion: orden === e.filtros.orden && e.filtros.direccion === 'asc' ? 'desc' : 'asc', pagina: 1, pagina_sugeridos: 1 });
  };
  const cambiarTab = (t: Tab) => { cerrarModal(); setTab(t); setCopiado(''); };
  const limpiar = () => { controllers.current[tab]?.controller.abort(); delete controllers.current[tab]; cerrarModal(); actualizar(tab, { ...inicial()[tab], cancelando: false, errorCancelacion: '', mensaje: '', resultado: undefined, pagos: undefined, filtros: undefined, detalle: undefined, nombres: undefined }); };
  const bloqueado = !delegacion || catalogoCargando;
  const rotulo = tab === 'solicitudes' ? e.tipo === 'folio' ? 'Número de folio' : 'Número de escritura' : tab === 'referencias' ? 'Referencia / número de recibo' : 'Número de prelación';

  return <main id="busqueda-gestion"><header className="g-header"><div className="g-header-icon"><Icono nombre="buscar" size={23} /></div><h1>Búsqueda Gestión</h1></header>
    <section className="g-panel g-contexto" aria-label="Selección de delegación"><div className="g-selection">
      <div className="g-field g-selector-delegacion"><div className="g-field-title"><span className="g-step" aria-hidden="true">1</span><label htmlFor="g-delegacion">Delegación</label></div><select id="g-delegacion" disabled={catalogoCargando || !!catalogoError} value={delegacion} onChange={event => cambiarDelegacion(event.target.value)}>
        <option value="">{catalogoCargando ? 'Cargando delegaciones…' : 'Elige una delegación'}</option>{delegaciones.map(d => <option value={d.id} key={d.id} disabled={!d.disponible}>{d.nombre}</option>)}</select></div>
      <div className="g-selector-tipo"><div role="tablist" className="g-tabs" aria-label="Tipo de búsqueda">{TABS.map((t, i) => <button key={t.id} id={'g-tab-' + t.id} className="g-tab" type="button" role="tab" aria-selected={tab === t.id} aria-label={t.titulo}
      aria-controls="g-panel-activo" tabIndex={tab === t.id ? 0 : -1} onClick={() => cambiarTab(t.id)} onKeyDown={event => {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : event.key === 'ArrowRight' ? (i + 1) % TABS.length : event.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : null;
        if (next !== null) { event.preventDefault(); cambiarTab(TABS[next].id); document.getElementById('g-tab-' + TABS[next].id)?.focus(); }
      }}><span className="g-tab-content"><Icono nombre={t.icono} size={18} /><span className="g-tab-label">{t.lineas
        ? t.lineas.map((linea, n) => <React.Fragment key={linea}>{n > 0 && <br />}{linea}</React.Fragment>)
        : t.titulo}</span></span></button>)}</div></div></div>
      {catalogoError && <p role="alert" className="g-message">{catalogoError} <button type="button" className="g-button" onClick={() => setIntento(n => n + 1)}>Volver a intentar</button></p>}</section>
    <section id="g-panel-activo" role="tabpanel" aria-labelledby={'g-tab-' + tab}><form className="g-panel g-form" onSubmit={event => { event.preventDefault(); void consultar(tab); }}>
      <h2>{TABS.find(t => t.id === tab)!.titulo}</h2><div className="g-fields">{tab === 'solicitudes' && <div className="g-field"><label htmlFor="g-tipo">Buscar por</label>
        <select id="g-tipo" value={e.tipo} disabled={bloqueado || e.cargando} onChange={event => actualizar(tab, { tipo: event.target.value })}><option value="folio">Folio</option><option value="escritura">Escritura</option></select></div>}
        <div className="g-field"><label htmlFor="g-criterio">{rotulo}</label><input id="g-criterio" required autoComplete="off" maxLength={tab === 'referencias' ? 25 : 200}
          inputMode={tab !== 'referencias' && (tab !== 'solicitudes' || e.tipo === 'folio') ? 'numeric' : 'text'} disabled={bloqueado || e.cargando}
          value={e.criterio} onChange={event => actualizar(tab, { criterio: event.target.value.toUpperCase() })} /></div></div>
      <div className="g-actions"><button type="button" className="g-button" disabled={bloqueado || e.cargando} onClick={limpiar}>Limpiar búsqueda</button>
        <button type="submit" className="g-button g-button-primary" disabled={bloqueado || e.cargando}>{e.cargando ? 'Consultando…' : tab === 'referencias' ? 'Verificar referencia' : tab === 'imagen' ? 'Consultar nombre' : 'Buscar'}</button></div></form>
      {e.mensaje && <p className="g-message" role="status">{e.mensaje}</p>}{e.error && <p className="g-message" role="alert">{e.error}</p>}
      {e.resultado && !(tab === 'estatus' && e.detalle) && !(tab === 'imagen' && e.nombres !== undefined) && <>
        <Tabla titulo="Resultados encontrados" pagina={e.resultado.exactos} columnas={tab === 'solicitudes' && e.filtros?.tipo === 'escritura' ? escrituraCols : folioCols} cargando={e.cargando} filtros={e.filtros}
          cambiarPagina={(n, l) => paginar('exactos', n, l)} ordenar={ordenar} seleccionar={tab === 'imagen'} abrir={tab === 'imagen' ? row => { void elegirImagen(row); } : abrir} />
        {e.resultado.sugeridos && <Tabla titulo="Resultados sugeridos" pagina={e.resultado.sugeridos} columnas={escrituraCols} cargando={e.cargando} filtros={e.filtros}
          cambiarPagina={(n, l) => paginar('sugeridos', n, l)} ordenar={ordenar} abrir={abrir} />}</>}
      {tab === 'referencias' && e.pagos && <Tabla titulo="Uso de la referencia / recibo" pagina={e.pagos} columnas={pagoCols} cargando={e.cargando} cambiarPagina={(n, l) => paginar('pagos', n, l)} abrir={abrir} />}
      {tab === 'estatus' && e.detalle && <section className="g-panel g-detail"><header className="g-detail-head"><h2>Datos de la solicitud · {e.detalle.solicitud.prelacion}</h2></header><DatosSolicitud data={e.detalle} /></section>}
      {tab === 'imagen' && e.nombres !== undefined && <section className="g-panel g-results g-name"><h2>Nombre de imagen</h2>
        {e.nombres.length ? e.nombres.map((n, i) => <div key={`${n.id}-${i}`} className="g-fields"><label className="g-image-label">Nombre guardado<input readOnly value={n.nom_archivo || ''} onFocus={event => event.currentTarget.select()} /></label>
          <button type="button" className="g-button" onClick={async () => { try { await navigator.clipboard.writeText(n.nom_archivo || ''); setCopiado('Nombre copiado.'); } catch { setCopiado('Selecciona el nombre y cópialo con Ctrl+C.'); } }}>Copiar nombre</button></div>)
          : <p className="g-empty">Sin nombre de imagen vinculado en la fuente consultada.</p>}<p className="g-message" role="status">{copiado}</p></section>}
    </section>
    <CargaBusquedaGestion activa={e.cargando} cancelando={!!e.cancelando} error={e.errorCancelacion || null} onCancelar={() => { void cancelarBusqueda(); }} />
    {modal && <VentanaDetalle key={modal.token} data={modal.data} loading={modal.loading} error={modal.error} cerrar={() => cerrarModal(modal.token)} />}
  </main>;
};
