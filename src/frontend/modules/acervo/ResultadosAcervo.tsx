import React from 'react';
import { Icono } from '../../components/Icono';
import { CLASE_SECUNDARIO } from './CamposAcervo';
import { mostrarDato, mostrarSuperficie, mostrarFoliosRpp } from './campos';
import { IconoOrdenAcervo } from './IconoOrdenAcervo';
import type {
  AcervoBusqueda, AcervoOrden, CampoOrdenAcervo, AntecedenteResultado, FilaAcervo, InmuebleResultado,
} from './types';

export interface ColumnaAcervo<T> {
  etiqueta: string;
  ordenarPor?: CampoOrdenAcervo;
  numerica?: boolean;
  ancho?: number;
  valor: (fila: T) => React.ReactNode;
}

// Los 23,793 folios del respaldo de Cozumel tienen como máximo 7 dígitos.
export const ANCHO_FOLIO_ACERVO = 112;
export const anchoColumnaAcervo = (porcentaje: number) =>
  `calc(${porcentaje}% - ${ANCHO_FOLIO_ACERVO * porcentaje / 100}px)`;

export const COLUMNAS_ANTECEDENTE: ColumnaAcervo<AntecedenteResultado>[] = [
  { etiqueta: 'Folio', ordenarPor: 'folio', valor: (fila) => fila.folio },
  { etiqueta: 'F.R.E.', ancho: 10, numerica: true, valor: (fila) => mostrarFoliosRpp(fila, true) },
  { etiqueta: 'Sección', ancho: 8, numerica: true, valor: (fila) => mostrarDato(fila.seccion) },
  { etiqueta: 'Tomo', ancho: 10, numerica: true, valor: (fila) => mostrarDato(fila.tomo) },
  { etiqueta: 'Volumen', ancho: 10, numerica: true, valor: (fila) => mostrarDato(fila.volumen) },
  { etiqueta: 'Inscripción', ancho: 13, numerica: true, ordenarPor: 'inscripcion', valor: (fila) => mostrarDato(fila.registro) },
  { etiqueta: 'Inscripción final', ancho: 16, numerica: true, ordenarPor: 'inscripcion_final', valor: (fila) => mostrarDato(fila.registro_final) },
  { etiqueta: 'Foja inicial', ancho: 12, numerica: true, ordenarPor: 'foja_inicial', valor: (fila) => mostrarDato(fila.foja_inicial) },
  { etiqueta: 'Foja final', ancho: 12, numerica: true, ordenarPor: 'foja_final', valor: (fila) => mostrarDato(fila.foja_final) },
  { etiqueta: 'Acto', ancho: 9, numerica: true, valor: (fila) => mostrarDato(fila.acto) },
];

export const COLUMNAS_INMUEBLE: ColumnaAcervo<InmuebleResultado>[] = [
  { etiqueta: 'Folio', ordenarPor: 'folio', valor: (fila) => fila.folio },
  { etiqueta: 'F.R.E.', ancho: 9, numerica: true, valor: (fila) => mostrarFoliosRpp(fila, true) },
  { etiqueta: 'Propietario', ancho: 20, valor: (fila) => fila.propietarios.join(' · ') || '—' },
  { etiqueta: 'Clave catastral', ordenarPor: 'clave_catastral', ancho: 13, numerica: true, valor: (fila) => mostrarDato(fila.clave_catastral) },
  { etiqueta: 'Superficie total', ordenarPor: 'superficie_total', ancho: 11, numerica: true, valor: (fila) => mostrarSuperficie(fila.superficie_total, fila.unidad_superficie) },
  { etiqueta: 'Calle', ancho: 14, valor: (fila) => mostrarDato(fila.calle) },
  { etiqueta: 'Colonia', ancho: 10, valor: (fila) => mostrarDato(fila.colonia) },
  { etiqueta: 'Lote', ordenarPor: 'lote', ancho: 5, numerica: true, valor: (fila) => mostrarDato(fila.lote) },
  { etiqueta: 'Manzana', ordenarPor: 'manzana', ancho: 6, numerica: true, valor: (fila) => mostrarDato(fila.manzana) },
  { etiqueta: 'Localidad', ancho: 12, valor: (fila) => mostrarDato(fila.localidad) },
];

export const CLASE_CABECERA = 'acervo-border-0 acervo-border-b acervo-border-solid acervo-border-borde acervo-bg-fondo acervo-px-4 acervo-py-3 acervo-text-center acervo-text-[10px] acervo-font-bold acervo-uppercase acervo-tracking-wide acervo-text-gris acervo-whitespace-nowrap';
export const CLASE_CELDA = 'acervo-border-0 acervo-border-b acervo-border-solid acervo-border-borde/60 acervo-px-4 acervo-py-3 acervo-text-left acervo-text-xs acervo-leading-5 acervo-align-top acervo-text-carbon';
export const CLASE_CELDA_NUMERICA = CLASE_CELDA + ' acervo-celda-numerica';
export const CLASE_CELDA_FOLIO = CLASE_CELDA + ' acervo-celda-folio';

interface TablaProps<T extends FilaAcervo> {
  nombre: string;
  filas: T[];
  columnas: ColumnaAcervo<T>[];
  claveFila: (fila: T) => string;
  onSeleccionar: (fila: T, aproximado: boolean, origen?: HTMLElement) => void;
  sugerida?: boolean;
  seleccionado?: string;
  orden?: AcervoOrden;
  onOrden?: (campo: CampoOrdenAcervo) => void;
  cargando?: boolean;
  anchoMinimo?: number;
}

export function TablaAcervo<T extends FilaAcervo>({
  nombre, filas, columnas, claveFila, onSeleccionar, sugerida = false, seleccionado, orden, onOrden, cargando = false, anchoMinimo = 1000,
}: TablaProps<T>) {
  return <div className="acervo-overflow-x-auto acervo-rounded-b-xl" tabIndex={0} aria-label={'Desplazamiento de ' + nombre}>
    <table aria-label={nombre} className="acervo-tabla-fija acervo-w-full acervo-border-collapse"
      style={{ minWidth: anchoMinimo }}>
      <colgroup>{columnas.map((columna, indice) => <col key={columna.etiqueta}
        style={{ width: indice === 0 ? ANCHO_FOLIO_ACERVO : anchoColumnaAcervo(columna.ancho ?? 100 / (columnas.length - 1)) }} />)}</colgroup>
      <thead><tr>{columnas.map((columna) => {
        const campo = columna.ordenarPor;
        const ordenable = Boolean(campo && onOrden);
        const direccion = orden && orden.campo === campo ? orden.direccion : undefined;
        const siguiente = direccion === 'asc' ? 'descendente' : 'ascendente';
        return <th key={columna.etiqueta} scope="col" className={CLASE_CABECERA}
          aria-sort={ordenable ? (direccion === 'asc' ? 'ascending' : direccion === 'desc' ? 'descending' : 'none') : undefined}>
          {ordenable && campo
            ? <button type="button" className="acervo-orden-cabecera" aria-disabled={cargando}
                onClick={() => { if (!cargando) onOrden?.(campo); }}
                aria-label={'Ordenar por ' + columna.etiqueta + ' ' + siguiente}
                title={'Ordenar por ' + columna.etiqueta + ' de ' + (siguiente === 'ascendente' ? 'menor a mayor' : 'mayor a menor')}>
                <span>{columna.etiqueta}</span><IconoOrdenAcervo direccion={direccion} />
              </button>
            : columna.etiqueta}
        </th>;
      })}</tr></thead>
      <tbody>{filas.map((fila) =>
          <tr key={claveFila(fila)} tabIndex={cargando ? -1 : 0}
            aria-label={'Folio ' + fila.folio} aria-selected={seleccionado === fila.folio_id} aria-disabled={cargando}
            className={'acervo-fila-interactiva ' + (seleccionado === fila.folio_id ? 'acervo-fila-seleccionada' : 'hover:acervo-bg-fondo/70')}
            onClick={(evento) => { if (!cargando) onSeleccionar(fila, sugerida, evento.currentTarget); }}
            onKeyDown={(evento) => {
              if (evento.target === evento.currentTarget && (evento.key === 'Enter' || evento.key === ' ')) {
                evento.preventDefault();
                if (!cargando) onSeleccionar(fila, sugerida, evento.currentTarget);
              }
            }}>
            {columnas.map((columna, columnaIndice) => <td key={columna.etiqueta} className={columnaIndice === 0 ? CLASE_CELDA_FOLIO : columna.numerica ? CLASE_CELDA_NUMERICA : CLASE_CELDA}>
              {columnaIndice === 0
                ? <button type="button" aria-label={'Ver folio ' + fila.folio}
                    disabled={cargando} aria-haspopup="dialog" aria-expanded={seleccionado === fila.folio_id}
                    className="acervo-border-0 acervo-bg-transparent acervo-p-0 acervo-font-inherit acervo-font-bold acervo-text-guinda acervo-underline acervo-decoration-guinda/25 acervo-underline-offset-4 acervo-cursor-pointer hover:acervo-decoration-guinda focus-visible:acervo-outline focus-visible:acervo-outline-guinda"
                    onClick={(evento) => { evento.stopPropagation(); if (!cargando) onSeleccionar(fila, sugerida, evento.currentTarget); }}>{fila.folio}</button>
                : columna.valor(fila)}
            </td>)}
          </tr>
      )}</tbody>
    </table>
  </div>;
}

interface Props<T extends FilaAcervo> extends Pick<TablaProps<T>, 'columnas' | 'claveFila' | 'onSeleccionar' | 'seleccionado' | 'orden' | 'onOrden'> {
  resultado: AcervoBusqueda<T> | null;
  cargando: boolean;
  onPagina: (pagina: number) => void;
}

export function ResultadosAcervo<T extends FilaAcervo>({
  resultado, cargando, onPagina, columnas, claveFila, onSeleccionar, seleccionado, orden, onOrden,
}: Props<T>) {
  if (cargando && !resultado) return <div role="status" className="acervo-mt-6 acervo-rounded-xl acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-p-10 acervo-text-center acervo-text-sm acervo-text-gris">Buscando coincidencias…</div>;
  if (!resultado) return <div className="acervo-mt-6 acervo-rounded-xl acervo-border acervo-border-dashed acervo-border-borde acervo-bg-white/70 acervo-p-8 acervo-text-center">
    <div className="acervo-flex acervo-justify-center acervo-text-gris"><Icono nombre="carpeta" size={28} /></div>
    <p className="acervo-mb-1 acervo-mt-3 acervo-text-sm acervo-font-bold acervo-text-carbon">Tus resultados aparecerán aquí</p>
  </div>;

  const antecedentes = resultado.unidad_resultado === 'antecedentes';
  const desde = resultado.resultados.length ? (resultado.pagina - 1) * resultado.tamano_pagina + 1 : 0;
  const hasta = desde ? desde + resultado.resultados.length - 1 : 0;
  return <section className="acervo-mt-6 acervo-space-y-4" aria-label="Resultados de la búsqueda" aria-live="polite" aria-busy={cargando}>
    <div className="acervo-rounded-xl acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-shadow-panel">
      <div className="acervo-flex acervo-flex-wrap acervo-items-center acervo-justify-between acervo-gap-3 acervo-px-5 acervo-py-4">
        <div>
          <h2 className="acervo-m-0 acervo-text-sm acervo-font-bold acervo-text-guinda-oscuro">Coincidencias de búsqueda: {resultado.total_resultados}</h2>
          <p className="acervo-mb-0 acervo-mt-1 acervo-text-xs acervo-text-gris">
            {antecedentes
              ? (resultado.total_resultados === 1 ? 'Antecedente coincidente · ' : 'Antecedentes coincidentes · ')
                + resultado.total_folios + (resultado.total_folios === 1 ? ' folio distinto.' : ' folios distintos.')
              : 'Folios que cumplen todos los datos capturados.'}
          </p>
        </div>
        <span role={cargando ? 'status' : undefined} className="acervo-estado-resultados acervo-rounded-full acervo-bg-fondo acervo-px-3 acervo-py-1.5 acervo-text-[11px] acervo-text-carbon">{cargando ? 'Actualizando…' : resultado.delegacion.nombre}</span>
      </div>
      {resultado.advertencia_rpp && resultado.total_resultados > 0 && <p role="status" className="acervo-m-0 acervo-px-5 acervo-pb-3 acervo-text-xs acervo-text-guinda">{resultado.advertencia_rpp}</p>}
      {resultado.total_resultados === 0
        ? <div className="acervo-border-0 acervo-border-t acervo-border-solid acervo-border-borde acervo-px-5 acervo-py-5">
            <p className="acervo-m-0 acervo-text-xs acervo-font-bold acervo-text-guinda">{resultado.mensaje ?? 'NO SE ENCONTRARON DATOS'}</p>
          </div>
        : <TablaAcervo nombre={antecedentes ? 'Antecedentes encontrados' : 'Inmuebles encontrados'}
            filas={resultado.resultados} columnas={columnas} claveFila={claveFila}
            onSeleccionar={onSeleccionar} seleccionado={seleccionado} orden={resultado.orden ?? orden} onOrden={onOrden} cargando={cargando} anchoMinimo={antecedentes ? 1000 : 1200} />}
      {resultado.total_resultados > 0 && <div className="acervo-flex acervo-flex-wrap acervo-items-center acervo-justify-between acervo-gap-3 acervo-px-5 acervo-py-3">
        <span className="acervo-text-[11px] acervo-text-gris">{desde ? 'Mostrando ' + desde + '–' + hasta + ' de ' + resultado.total_resultados : 'Esta página no contiene resultados.'}</span>
        <nav aria-label="Paginación" className="acervo-flex acervo-items-center acervo-gap-2">
          <button type="button" className={CLASE_SECUNDARIO} disabled={cargando || resultado.pagina <= 1} onClick={() => onPagina(resultado.pagina - 1)} aria-label="Página anterior"><Icono nombre="flechaIzq" size={14} /></button>
          <span className="acervo-text-xs acervo-text-carbon">Página {resultado.pagina} de {resultado.paginas_totales}</span>
          <button type="button" className={CLASE_SECUNDARIO} disabled={cargando || resultado.pagina >= resultado.paginas_totales} onClick={() => onPagina(resultado.pagina + 1)} aria-label="Página siguiente"><Icono nombre="flechaDer" size={14} /></button>
        </nav>
      </div>}
    </div>
    {resultado.total_resultados === 0 && resultado.aproximados.length > 0 && <div className="acervo-rounded-xl acervo-border acervo-border-solid acervo-border-dorado/40 acervo-bg-white">
      <div className="acervo-px-5 acervo-py-4">
        <h3 className="acervo-m-0 acervo-text-sm acervo-font-bold acervo-text-dorado-oscuro">Resultados sugeridos: {resultado.aproximados.length}</h3>
      </div>
      <TablaAcervo nombre="Resultados sugeridos" filas={resultado.aproximados.map((item) => item.resultado)}
        columnas={columnas} claveFila={claveFila} onSeleccionar={onSeleccionar}
        sugerida seleccionado={seleccionado} cargando={cargando} anchoMinimo={antecedentes ? 1000 : 1200} />
    </div>}
  </section>;
}
