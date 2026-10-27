import React, { useEffect, useRef, useState } from 'react';
import { Icono } from '../../components/Icono';
import { CLASE_SECUNDARIO } from './CamposAcervo';
import {
  ANCHO_FOLIO_ACERVO,
  CLASE_CABECERA, CLASE_CELDA, CLASE_CELDA_FOLIO, CLASE_CELDA_NUMERICA,
} from './ResultadosAcervo';
import { mostrarDato, mostrarFecha, mostrarSuperficie, mostrarFoliosRpp } from './campos';
import type { AcervoFolioDetalle, FilaAcervo } from './types';

interface Props {
  seleccion: FilaAcervo | null;
  aproximado: boolean;
  detalle: AcervoFolioDetalle | null;
  cargando: boolean;
  error: string | null;
  actosSeleccionados: ReadonlySet<string>;
  antecedentesSeleccionados: ReadonlySet<string>;
  sinAntecedente: boolean;
  onSeleccionarActo: (id: string) => void;
  onSeleccionarAntecedente: (id: string) => void;
  onCerrar: () => void;
  onReintentar: () => void;
}


export function DetalleAcervo(props: Props) {
  if (!props.seleccion) return null;
  return <VentanaDetalleAcervo key={props.seleccion.folio_id} {...props} seleccion={props.seleccion} />;
}

type PestanaDetalle = 'inmueble' | 'titulares' | 'actos';
function VentanaDetalleAcervo({ seleccion, aproximado, detalle, cargando, error,
  actosSeleccionados, antecedentesSeleccionados, sinAntecedente,
  onSeleccionarActo, onSeleccionarAntecedente, onCerrar, onReintentar }: Omit<Props, 'seleccion'> & { seleccion: FilaAcervo }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [pestana, setPestana] = useState<PestanaDetalle>('inmueble');
  useEffect(() => {
    const ventana = dialogo.current!;
    const desbordamientoAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!ventana.open) ventana.showModal();
    return () => {
      if (ventana.open) ventana.close();
      document.body.style.overflow = desbordamientoAnterior;
    };
  }, []);
  const pestanas: { id: PestanaDetalle; nombre: string; cantidad?: number }[] = [
    { id: 'inmueble', nombre: 'Datos del inmueble' },
    { id: 'titulares', nombre: 'Titulares', cantidad: detalle?.total_titulares },
    { id: 'actos', nombre: 'Actos y antecedentes', cantidad: detalle?.total_actos },
  ];
  const tecladoPestana = (evento: React.KeyboardEvent<HTMLButtonElement>, actual: number) => {
    let siguiente: number | undefined;
    if (evento.key === 'ArrowRight') siguiente = (actual + 1) % pestanas.length;
    if (evento.key === 'ArrowLeft') siguiente = (actual + pestanas.length - 1) % pestanas.length;
    if (evento.key === 'Home') siguiente = 0;
    if (evento.key === 'End') siguiente = pestanas.length - 1;
    if (siguiente !== undefined) {
      evento.preventDefault();
      const id = pestanas[siguiente].id;
      setPestana(id);
      document.getElementById('acervo-detalle-tab-' + id)?.focus();
    }
  };
  const inmueble = detalle?.inmueble;
  const datos = inmueble ? [
    ['Folio GISNET', inmueble.folio_gisnet ?? inmueble.folio],
    [(inmueble.folios_rpp?.length ?? 0) > 1 ? 'Folios RPP' : 'Folio RPP', mostrarFoliosRpp(inmueble)],
    ['Propietario', inmueble.propietarios.join(' · ')],
    ['Clave catastral', mostrarDato(inmueble.clave_catastral)],
    ['Superficie total', mostrarSuperficie(inmueble.superficie_total, inmueble.unidad_superficie)],
    ['Calle', mostrarDato(inmueble.calle)], ['Colonia', mostrarDato(inmueble.colonia)],
    ['Lote', mostrarDato(inmueble.lote)], ['Manzana', mostrarDato(inmueble.manzana)],
    ['Colindancias', mostrarDato(inmueble.colindancias)], ['Localidad', mostrarDato(inmueble.localidad)],
    ['No. exterior', mostrarDato(inmueble.no_exterior)], ['No. interior', mostrarDato(inmueble.no_interior)],
    ['Super manzana', mostrarDato(inmueble.super_manzana)], ['Fraccionamiento', mostrarDato(inmueble.fraccionamiento)],
    ['Condominio', mostrarDato(inmueble.condominio)], ['Predio conocido', mostrarDato(inmueble.predio_conocido)],
  ] : [];


  return <dialog ref={dialogo} id="acervo-detalle-modal" aria-labelledby="acervo-detalle-titulo" aria-modal="true"
    onCancel={(evento) => { evento.preventDefault(); onCerrar(); }}
    onClose={(evento) => { if (!evento.currentTarget.open) onCerrar(); }}
    onClick={(evento) => {
      const limites = evento.currentTarget.getBoundingClientRect();
      if (evento.target === evento.currentTarget && (evento.clientX < limites.left || evento.clientX > limites.right
        || evento.clientY < limites.top || evento.clientY > limites.bottom)) onCerrar();
    }}>
    <section id="acervo-detalle" className="acervo-detalle-contenedor" aria-label={'Detalle del folio ' + seleccion.folio}>
      <header className="acervo-detalle-cabecera">
        <div>
          <div className="acervo-flex acervo-items-center acervo-gap-2">
            <Icono nombre="documento" size={19} color="#AB0A3D" />
            <h2 id="acervo-detalle-titulo">Folio GISNET {seleccion.folio}</h2>
            {aproximado && <span className="acervo-rounded-full acervo-bg-dorado-suave acervo-px-2 acervo-py-1 acervo-text-[10px] acervo-font-bold acervo-text-dorado-oscuro">Sugerencia</span>}
          </div>
          {detalle && <p>{detalle.delegacion.nombre}</p>}
        </div>
        <button type="button" autoFocus className={CLASE_SECUNDARIO} onClick={onCerrar}>
          <Icono nombre="cerrar" size={14} />Cerrar detalle
        </button>
      </header>
      <div className="acervo-detalle-pestanas" role="tablist" aria-label="Información del folio">
        {pestanas.map((item, indice) => <button key={item.id} type="button" role="tab"
          id={'acervo-detalle-tab-' + item.id} aria-controls={'acervo-detalle-panel-' + item.id}
          aria-selected={pestana === item.id} tabIndex={pestana === item.id ? 0 : -1}
          onKeyDown={(evento) => tecladoPestana(evento, indice)} onClick={() => setPestana(item.id)}>
          {item.nombre}{item.cantidad !== undefined && <span className="acervo-detalle-cantidad">{item.cantidad}</span>}
        </button>)}
      </div>
      <div className="acervo-detalle-scroll">
        {cargando && <p role="status" className="acervo-m-0 acervo-p-6 acervo-text-sm acervo-text-gris">Cargando información del folio…</p>}
        {error && <div role="alert" className="acervo-p-5 acervo-space-y-3">
          <p className="acervo-m-0 acervo-text-sm acervo-text-guinda">{error}</p>
          <button type="button" className={CLASE_SECUNDARIO} onClick={onReintentar}>Volver a intentar</button>
        </div>}
        {detalle && <>
          <div role="tabpanel" id="acervo-detalle-panel-inmueble" aria-labelledby="acervo-detalle-tab-inmueble" hidden={pestana !== 'inmueble'}>
            <dl className="acervo-datos-detalle">{datos.map(([etiqueta, valor]) => <div key={etiqueta}>
              <dt>{etiqueta}</dt><dd>{valor || '—'}</dd>
            </div>)}</dl>
          </div>
          <div role="tabpanel" id="acervo-detalle-panel-titulares" aria-labelledby="acervo-detalle-tab-titulares" hidden={pestana !== 'titulares'}>
            <div className="acervo-detalle-seccion"><h3>Titulares vinculados: {detalle.total_titulares}</h3></div>
            {detalle.titulares.length === 0 ? <p className="acervo-m-0 acervo-p-5 acervo-text-xs acervo-text-gris">Este folio no tiene titulares vinculados.</p>
              : <table aria-label="Titulares del folio" className="acervo-w-full acervo-border-collapse">
                <colgroup><col style={{ width: '75%' }} /><col style={{ width: '25%' }} /></colgroup>
                <thead><tr><th scope="col" className={CLASE_CABECERA}>Titular</th><th scope="col" className={CLASE_CABECERA}>Estatus</th></tr></thead>
                <tbody>{detalle.titulares.map((titular) => <tr key={titular.id}>
                  <td className={CLASE_CELDA}>{titular.nombre}</td><td className={CLASE_CELDA_NUMERICA}>
                    {titular.vigente === null ? 'Sin estatus' : titular.vigente ? 'Vigente' : 'Histórico'}
                  </td>
                </tr>)}</tbody>
              </table>}
          </div>
          <div role="tabpanel" id="acervo-detalle-panel-actos" aria-labelledby="acervo-detalle-tab-actos" hidden={pestana !== 'actos'}>
            <div className="acervo-detalle-seccion"><h3>Actos y movimientos: {detalle.total_actos}</h3></div>
      {detalle.actos.length === 0
        ? <p className="acervo-m-0 acervo-px-5 acervo-pb-5 acervo-text-xs acervo-text-gris">Este folio no tiene actos registrados.</p>
        : <div className="acervo-overflow-x-auto" tabIndex={0} aria-label="Desplazamiento de actos del folio">
          <table aria-label="Actos del folio" className="acervo-tabla-actos acervo-tabla-fija acervo-w-full acervo-border-collapse" style={{ minWidth: 920 }}>
            <colgroup>
              <col style={{ width: ANCHO_FOLIO_ACERVO }} />
              <col style={{ width: 64 }} />
              <col />
              {[104, 104, 96, 96, 72, 96, 88].map((ancho, indice) => <col key={indice} style={{ width: ancho }} />)}
            </colgroup>
            <thead><tr>{['Folio', 'Acto', 'Desc. acto', 'Prelación', 'Fecha de inscripción', 'Núm. prelación', 'Núm. consecutivo', 'Estatus', 'Estatus movimiento', 'ID movimiento']
              .map((etiqueta) => <th key={etiqueta} scope="col" className={CLASE_CABECERA}>{etiqueta}</th>)}</tr></thead>
            <tbody>{detalle.actos.map((acto) => <tr key={acto.id} tabIndex={0}
              aria-label={'Seleccionar acto ' + (acto.descripcion_acto ?? acto.acto) + ', prelación ' + mostrarDato(acto.numero_prelacion)}
              aria-selected={actosSeleccionados.has(acto.id)}
              className={'acervo-fila-interactiva ' + (actosSeleccionados.has(acto.id) ? 'acervo-fila-seleccionada' : 'hover:acervo-bg-fondo')}
              onClick={() => onSeleccionarActo(acto.id)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); onSeleccionarActo(acto.id); }
              }}>
              {[detalle.inmueble.folio, acto.acto, mostrarDato(acto.descripcion_acto), mostrarFecha(acto.fecha_prelacion),
                mostrarFecha(acto.fecha_registro), mostrarDato(acto.numero_prelacion), mostrarDato(acto.numero_consecutivo),
                mostrarDato(acto.estatus), mostrarDato(acto.estatus_movimiento), mostrarDato(acto.id_movimiento)]
                .map((valor, indice) => <td key={indice} className={indice === 0 ? CLASE_CELDA_FOLIO : indice === 1 || indice >= 3 ? CLASE_CELDA_NUMERICA : CLASE_CELDA}>{valor}</td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      <section aria-label="Antecedentes vinculados">
        <div className="acervo-cabecera-antecedentes acervo-border-0 acervo-border-t acervo-border-solid acervo-border-borde acervo-px-5 acervo-py-4">
          <h3 className="acervo-m-0 acervo-text-sm acervo-font-bold acervo-text-guinda-oscuro">Antecedentes: {detalle.total_antecedentes}</h3>
          <div className="acervo-aviso-antecedente acervo-text-xs acervo-text-gris" role="status" aria-live="polite" aria-atomic="true">
            {sinAntecedente && <span>No se identificó un antecedente para este acto.</span>}
          </div>
          <p className="acervo-m-0 acervo-text-xs acervo-text-gris">Antecedentes vinculados al folio {detalle.inmueble.folio}</p>
        </div>
        {detalle.antecedentes.length === 0
          ? <p className="acervo-m-0 acervo-px-5 acervo-pb-5 acervo-text-xs acervo-text-gris">Este folio no tiene antecedentes vinculados.</p>
          : <div className="acervo-overflow-x-auto" tabIndex={0} aria-label="Desplazamiento de antecedentes del folio">
            <table aria-label="Antecedentes del folio" className="acervo-tabla-fija acervo-w-full acervo-border-collapse" style={{ minWidth: 1000 }}>
              <colgroup>{[10, 12, 12, 14, 18, 13, 13, 8].map((ancho, indice) => <col key={indice} style={{ width: ancho + '%' }} />)}</colgroup>
              <thead><tr>{['Sección', 'Tomo', 'Volumen', 'Inscripción', 'Inscripción final', 'Foja inicial', 'Foja final', 'Acto']
                .map((etiqueta) => <th key={etiqueta} scope="col" className={CLASE_CABECERA}>{etiqueta}</th>)}</tr></thead>
              <tbody>{detalle.antecedentes.map((antecedente) => <tr key={antecedente.antecedente_id} tabIndex={0}
                aria-label={'Seleccionar antecedente, tomo ' + mostrarDato(antecedente.tomo) + ', inscripción ' + mostrarDato(antecedente.registro)}
                aria-selected={antecedentesSeleccionados.has(antecedente.antecedente_id)}
                className={'acervo-fila-interactiva ' + (antecedentesSeleccionados.has(antecedente.antecedente_id) ? 'acervo-fila-seleccionada' : 'hover:acervo-bg-fondo')}
                onClick={() => onSeleccionarAntecedente(antecedente.antecedente_id)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); onSeleccionarAntecedente(antecedente.antecedente_id); }
                }}>
                {[antecedente.seccion, antecedente.tomo, antecedente.volumen, antecedente.registro,
                  antecedente.registro_final, antecedente.foja_inicial, antecedente.foja_final, antecedente.acto]
                  .map((valor, indice) => <td key={indice} className={CLASE_CELDA_NUMERICA}>{mostrarDato(valor)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>}
      </section>

          </div>
        </>}
      </div>
    </section>
  </dialog>;
}
