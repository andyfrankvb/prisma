import React, { useEffect, useRef, useState } from 'react';
import { Icono } from '../components/Icono';
import { acervoApi } from '../services/acervoApi';
import type { AcervoApi } from '../services/acervoApi';
import {
  ANTECEDENTE_VACIO, INMUEBLE_VACIO, CAMPOS_ANTECEDENTE,
  CAMPOS_IDENTIFICACION, filtrosAntecedente, filtrosInmueble,
} from '../modules/acervo/campos';
import { CamposAcervo, CLASE_INPUT, CLASE_PRIMARIO, CLASE_SECUNDARIO } from '../modules/acervo/CamposAcervo';
import { ResultadosAcervo, COLUMNAS_ANTECEDENTE, COLUMNAS_INMUEBLE } from '../modules/acervo/ResultadosAcervo';
import { DetalleAcervo } from '../modules/acervo/DetalleAcervo';
import { CargaBusquedaAcervo } from '../modules/acervo/CargaBusquedaAcervo';
import { TipoCoincidenciaAcervo } from '../modules/acervo/TipoCoincidenciaAcervo';
import { UbicacionAcervo } from '../modules/acervo/UbicacionAcervo';
import { useBusquedaAcervo } from '../modules/acervo/useBusquedaAcervo';
import { useDetalleAcervo } from '../modules/acervo/useDetalleAcervo';
import type {
  AcervoDelegacion, FilaAcervo, TipoBusqueda,
} from '../modules/acervo/types';
import '../modules/acervo/acervo.css';

interface Props { cliente?: AcervoApi; }

/** Consulta del acervo; la ruta y la API exigen sesión y acceso al módulo. */
export const BusquedaAcervo: React.FC<Props> = ({ cliente = acervoApi }) => {
  const [tab, setTab] = useState<TipoBusqueda>('antecedente');
  const [delegaciones, setDelegaciones] = useState<AcervoDelegacion[]>([]);
  const [delegacionId, setDelegacionId] = useState('');
  const [catalogoCargando, setCatalogoCargando] = useState(true);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [intentoCatalogo, setIntentoCatalogo] = useState(0);

  const cancelarConsulta = (signal: AbortSignal) => cliente.cancelarBusqueda
    ? cliente.cancelarBusqueda(signal) : Promise.reject(new Error('Este cliente no permite cancelar la consulta.'));

  const antecedentes = useBusquedaAcervo(ANTECEDENTE_VACIO,
    (delegacion, campos, pagina, signal, orden, precision) => cliente.antecedentes(filtrosAntecedente(delegacion, campos, pagina, orden, precision), signal), cancelarConsulta);
  const inmuebles = useBusquedaAcervo(INMUEBLE_VACIO,
    (delegacion, campos, pagina, signal, orden, precision) => cliente.inmuebles(filtrosInmueble(delegacion, campos, pagina, precision, orden), signal), cancelarConsulta);

  const detalleAntecedente = useDetalleAcervo(cliente.detalle);
  const detalleInmueble = useDetalleAcervo(cliente.detalle);
  const detalleActivo = tab === 'antecedente' ? detalleAntecedente : detalleInmueble;
  const busquedaActiva = tab === 'antecedente' ? antecedentes : inmuebles;
  const {
    seleccion, aproximado: seleccionAproximada, detalle,
    cargando: detalleCargando, error: detalleError,
  } = detalleActivo;

  useEffect(() => {
    const controller = new AbortController();
    setCatalogoCargando(true);
    setCatalogoError(null);
    cliente.delegaciones(controller.signal)
      .then((datos) => { if (!controller.signal.aborted) setDelegaciones(datos); })
      .catch((fallo: Error) => {
        if (!controller.signal.aborted) setCatalogoError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las delegaciones.');
      })
      .finally(() => { if (!controller.signal.aborted) setCatalogoCargando(false); });
    return () => controller.abort();
  }, [cliente, intentoCatalogo]);

  const abridorDetalle = useRef<HTMLElement | null>(null);
  const cerrarDetalle = () => {
    const devolverFoco = Boolean(detalleActivo.seleccion);
    detalleActivo.cerrar();
    if (devolverFoco) {
      const origen = abridorDetalle.current;
      requestAnimationFrame(() => { if (origen?.isConnected) origen.focus({ preventScroll: true }); });
    }
  };

  const cambiarDelegacion = (valor: string) => {
    detalleAntecedente.cerrar();
    detalleInmueble.cerrar();
    antecedentes.invalidar();
    inmuebles.invalidar();
    if (!delegaciones.find(d => String(d.id) === valor)?.rpp_disponible) inmuebles.cambiar('folio_rpp', '');
    setDelegacionId(valor);
  };

  const cambiarTab = (valor: TipoBusqueda) => {
    antecedentes.cancelar();
    inmuebles.cancelar();
    setTab(valor);
  };

  const tecladoTab = (evento: React.KeyboardEvent<HTMLButtonElement>) => {
    let siguiente: TipoBusqueda | null = null;
    if (evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') siguiente = tab === 'antecedente' ? 'inmueble' : 'antecedente';
    if (evento.key === 'Home') siguiente = 'antecedente';
    if (evento.key === 'End') siguiente = 'inmueble';
    if (siguiente) {
      evento.preventDefault();
      cambiarTab(siguiente);
      document.getElementById('acervo-tab-' + siguiente)?.focus();
    }
  };

  const seleccionarFolio = (fila: FilaAcervo, aproximado: boolean, origen?: HTMLElement) => {
    abridorDetalle.current = origen ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (detalleActivo.seleccion?.folio_id === fila.folio_id) cerrarDetalle();
    else return detalleActivo.seleccionar(fila, aproximado, Number(delegacionId));
  };

  const delegacion = delegaciones.find((item) => String(item.id) === delegacionId);
  const sinDelegacion = !delegacion || catalogoCargando;
  const claseTab = (activo: boolean) => [
    'acervo-relative acervo-inline-flex acervo-min-h-12 acervo-items-center acervo-justify-center acervo-gap-2 acervo-rounded-t-xl acervo-border acervo-border-solid acervo-border-borde acervo-border-t-[3px] acervo-px-4 acervo-py-3 acervo-font-inherit acervo-text-xs acervo-font-bold acervo-cursor-pointer sm:acervo-px-6 sm:acervo-text-sm',
    'focus-visible:acervo-outline focus-visible:acervo-outline-2 focus-visible:acervo-outline-offset-2 focus-visible:acervo-outline-guinda',
    activo ? 'acervo-z-10 acervo-border-t-guinda acervo-border-b-white acervo-bg-white acervo-text-guinda-oscuro'
      : 'acervo-border-t-transparent acervo-bg-fondo acervo-text-gris hover:acervo-text-guinda',
  ].join(' ');


  return <div id="busqueda-acervo">
    <div className="acervo-mx-auto acervo-max-w-[1360px] acervo-px-4 acervo-py-6 sm:acervo-px-6">
      <header className="acervo-mb-5 acervo-flex acervo-flex-wrap acervo-items-start acervo-justify-between acervo-gap-3">
        <div className="acervo-flex acervo-items-center acervo-gap-3">
          <div className="acervo-flex acervo-h-11 acervo-w-11 acervo-shrink-0 acervo-items-center acervo-justify-center acervo-rounded-xl acervo-bg-guinda-suave acervo-text-guinda"><Icono nombre="buscar" size={23} /></div>
          <div>
            <h1 className="acervo-m-0 acervo-text-xl acervo-font-black acervo-text-guinda-oscuro sm:acervo-text-2xl">Búsqueda Acervo</h1>
          </div>
        </div>
      </header>

      <section aria-label="Delegación y tipo de búsqueda" className="acervo-contexto-busqueda acervo-rounded-xl acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-p-5 acervo-shadow-panel">
        <div className="acervo-mb-4 acervo-flex acervo-items-center acervo-gap-2">
          <span className="acervo-flex acervo-h-6 acervo-w-6 acervo-items-center acervo-justify-center acervo-rounded-full acervo-bg-guinda acervo-text-[10px] acervo-font-bold acervo-text-white">1</span>
          <h2 className="acervo-m-0 acervo-text-sm acervo-font-bold acervo-text-guinda-oscuro">Selecciona la delegación</h2>
        </div>
        <div className="acervo-seleccion-busqueda">
          <div className="acervo-selector-delegacion">
            <label htmlFor="acervo-delegacion" className="acervo-mb-1.5 acervo-block acervo-text-xs acervo-font-bold acervo-text-carbon">Delegación</label>
            <select id="acervo-delegacion" value={delegacionId} disabled={catalogoCargando || Boolean(catalogoError)}
              className={CLASE_INPUT + (delegacionId ? ' acervo-delegacion-activa' : '')} onChange={(evento) => cambiarDelegacion(evento.target.value)}>
              <option value="">{catalogoCargando ? 'Cargando delegaciones…' : 'Elige una delegación'}</option>
              {delegaciones.map((item) => <option key={item.id} value={item.id} disabled={item.disponible === false}>
                {item.id + ' · ' + item.nombre + (item.disponible === false ? ' (sin datos conectados)' : '')}
              </option>)}
            </select>
          </div>
          <div className="acervo-selector-tipo">
            <div role="tablist" aria-label="Tipo de búsqueda" className="acervo-flex acervo-gap-2 acervo-pestanas-cabecera">
              <button type="button" role="tab" id="acervo-tab-antecedente" aria-controls="acervo-panel-antecedente"
                aria-selected={tab === 'antecedente'} tabIndex={tab === 'antecedente' ? 0 : -1}
                className={claseTab(tab === 'antecedente')} onKeyDown={tecladoTab} onClick={() => cambiarTab('antecedente')}>
                <Icono nombre="documento" size={16} />Por antecedente
              </button>
              <button type="button" role="tab" id="acervo-tab-inmueble" aria-controls="acervo-panel-inmueble"
                aria-selected={tab === 'inmueble'} tabIndex={tab === 'inmueble' ? 0 : -1}
                className={claseTab(tab === 'inmueble')} onKeyDown={tecladoTab} onClick={() => cambiarTab('inmueble')}>
                <Icono nombre="edificio" size={16} />Por inmueble
              </button>
            </div>
          </div>
        </div>
        {catalogoError && <div role="alert" className="acervo-mt-4 acervo-flex acervo-flex-wrap acervo-items-center acervo-gap-3">
          <p className="acervo-m-0 acervo-text-xs acervo-text-guinda">{catalogoError}</p>
          <button type="button" className={CLASE_SECUNDARIO} onClick={() => setIntentoCatalogo((valor) => valor + 1)}>Volver a intentar</button>
        </div>}
      </section>

      <div role="tabpanel" id="acervo-panel-antecedente" aria-labelledby="acervo-tab-antecedente" hidden={tab !== 'antecedente'}>
        <form className="acervo-formulario-busqueda acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-p-5 acervo-shadow-panel"
          onSubmit={(evento) => { evento.preventDefault(); cerrarDetalle(); void antecedentes.buscar(Number(delegacionId)); }}>
          <div className="acervo-cabecera-formulario">
            <h2 className="acervo-m-0 acervo-text-sm acervo-font-bold acervo-text-guinda-oscuro">Datos del antecedente</h2>
            <TipoCoincidenciaAcervo prefijo="acervo-ant" valor={antecedentes.precision} deshabilitado={sinDelegacion}
              onCambiar={(valor) => { cerrarDetalle(); antecedentes.cambiarPrecision(valor); }} />
          </div>
          <CamposAcervo prefijo="acervo-ant" columnas={5} campos={CAMPOS_ANTECEDENTE} valores={antecedentes.formulario} deshabilitado={sinDelegacion}
            onCambiar={(campo, valor) => { cerrarDetalle(); antecedentes.cambiar(campo, valor); }} />
          {antecedentes.error && <p role="alert" className="acervo-mb-0 acervo-mt-4 acervo-text-xs acervo-font-semibold acervo-text-guinda">{antecedentes.error}</p>}
          <div className="acervo-mt-5 acervo-flex acervo-flex-wrap acervo-items-center acervo-justify-end acervo-gap-3 acervo-border-0 acervo-border-t acervo-border-solid acervo-border-borde acervo-pt-4">
            <div className="acervo-flex acervo-flex-wrap acervo-gap-2">
              <button type="button" className={CLASE_SECUNDARIO} onClick={() => { cerrarDetalle(); antecedentes.limpiar(); }}>Limpiar búsqueda</button>
              <button type="submit" className={CLASE_PRIMARIO} disabled={sinDelegacion || antecedentes.cargando}><Icono nombre="buscar" size={15} />{antecedentes.cargando ? 'Buscando…' : 'Buscar antecedente'}</button>
            </div>
          </div>
        </form>
        <ResultadosAcervo resultado={antecedentes.resultado} cargando={antecedentes.cargando}
          orden={antecedentes.orden} onOrden={(campo) => { void antecedentes.ordenar(Number(delegacionId), campo); }}
          columnas={COLUMNAS_ANTECEDENTE} claveFila={(fila) => fila.antecedente_id} seleccionado={detalleAntecedente.seleccion?.folio_id}
          onSeleccionar={(fila, aproximado, origen) => { void seleccionarFolio(fila, aproximado, origen); }}
          onPagina={(pagina) => { cerrarDetalle(); void antecedentes.buscar(Number(delegacionId), pagina); }} />
      </div>

      <div role="tabpanel" id="acervo-panel-inmueble" aria-labelledby="acervo-tab-inmueble" hidden={tab !== 'inmueble'}>
        <form className="acervo-formulario-busqueda acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-p-5 acervo-shadow-panel"
          onSubmit={(evento) => { evento.preventDefault(); cerrarDetalle(); void inmuebles.buscar(Number(delegacionId)); }}>
          <div className="acervo-cabecera-formulario">
            <h2 className="acervo-m-0 acervo-text-sm acervo-font-bold acervo-text-guinda-oscuro">Identificación del inmueble</h2>
            <TipoCoincidenciaAcervo prefijo="acervo-inm" valor={inmuebles.precision} deshabilitado={sinDelegacion}
              onCambiar={(valor) => { cerrarDetalle(); inmuebles.cambiarPrecision(valor); }} />
          </div>
          <CamposAcervo prefijo="acervo-inm" columnas={5} campos={CAMPOS_IDENTIFICACION.map(campo => campo.nombre === 'folio_rpp'
              ? { ...campo, deshabilitado: delegacion?.rpp_disponible !== true, placeholder: delegacion && !delegacion.rpp_disponible ? 'No disponible' : undefined } : campo)}
            valores={inmuebles.formulario} deshabilitado={sinDelegacion}
            onCambiar={(campo, valor) => { cerrarDetalle(); inmuebles.cambiar(campo, valor); }} />
          <UbicacionAcervo valores={inmuebles.formulario} deshabilitado={sinDelegacion}
            onCambiar={(campo, valor) => { cerrarDetalle(); inmuebles.cambiar(campo, valor); }} />
          {inmuebles.error && <p role="alert" className="acervo-mb-0 acervo-mt-4 acervo-text-xs acervo-font-semibold acervo-text-guinda">{inmuebles.error}</p>}
          <div className="acervo-mt-5 acervo-flex acervo-flex-wrap acervo-items-center acervo-justify-end acervo-gap-3 acervo-border-0 acervo-border-t acervo-border-solid acervo-border-borde acervo-pt-4">
            <div className="acervo-flex acervo-flex-wrap acervo-gap-2">
              <button type="button" className={CLASE_SECUNDARIO} onClick={() => { cerrarDetalle(); inmuebles.limpiar(); }}>Limpiar búsqueda</button>
              <button type="submit" className={CLASE_PRIMARIO} disabled={sinDelegacion || inmuebles.cargando}><Icono nombre="buscar" size={15} />{inmuebles.cargando ? 'Buscando…' : 'Buscar inmueble'}</button>
            </div>
          </div>
        </form>
        <ResultadosAcervo resultado={inmuebles.resultado} cargando={inmuebles.cargando}
          orden={inmuebles.orden} onOrden={(campo) => { cerrarDetalle(); void inmuebles.ordenar(Number(delegacionId), campo); }}
          columnas={COLUMNAS_INMUEBLE} claveFila={(fila) => fila.folio_id} seleccionado={detalleInmueble.seleccion?.folio_id}
          onSeleccionar={(fila, aproximado, origen) => { void seleccionarFolio(fila, aproximado, origen); }}
          onPagina={(pagina) => { cerrarDetalle(); void inmuebles.buscar(Number(delegacionId), pagina); }} />
      </div>

      <CargaBusquedaAcervo activa={busquedaActiva.cargando} cancelando={busquedaActiva.cancelando}
        error={busquedaActiva.errorCancelacion} onCancelar={() => { void busquedaActiva.cancelarBusqueda(); }} />

      <DetalleAcervo seleccion={seleccion} aproximado={seleccionAproximada} detalle={detalle}
        cargando={detalleCargando} error={detalleError} onCerrar={cerrarDetalle}
        actosSeleccionados={detalleActivo.actosSeleccionados} antecedentesSeleccionados={detalleActivo.antecedentesSeleccionados}
        sinAntecedente={detalleActivo.sinAntecedente} onSeleccionarActo={detalleActivo.seleccionarActo}
        onSeleccionarAntecedente={detalleActivo.seleccionarAntecedente}
        onReintentar={() => { if (seleccion) void detalleActivo.seleccionar(seleccion, seleccionAproximada, Number(delegacionId)); }} />
    </div>
  </div>;
};
