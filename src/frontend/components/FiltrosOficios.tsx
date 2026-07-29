/**
 * Componente compartido: barra de filtros de la lista de oficios.
 * Se usa en las vistas de Oficial, Gestión y Jurídico para que todos los roles
 * con el módulo tengan los mismos filtros (buscador, estatus, término, fechas, SIQROO).
 */

import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { inputStyle, selectStyle, btnSecondary } from '../styles';

export interface OficiosFiltros {
  search:            string;
  estatus:           string;
  termino:           string;
  desde:             string;
  hasta:             string;
  siqroo_pendiente:  boolean;
  pendiente_firma:   boolean;
}

const ESTATUS_OPTIONS = [
  { value: '',                   label: 'Todos los estatus'   },
  { value: 'RECIBIDO',           label: 'Recibido'            },
  { value: 'ASIGNADO',           label: 'Asignado'            },
  { value: 'EN_REVISION',        label: 'En Revisión'         },
  { value: 'EN_RECONSIDERACION', label: 'En Reconsideración'  },
  { value: 'VOBO_APROBADO',      label: 'VoBo Aprobado'       },
  { value: 'FINALIZADO',         label: 'Finalizado'          },
];

export const FiltrosOficios: React.FC<{ onChange: (f: OficiosFiltros) => void }> = ({ onChange }) => {
  const [search,     setSearch]     = useState('');
  const [searchDeb,  setSearchDeb]  = useState('');
  const [estatus,    setEstatus]    = useState('');
  const [termino,    setTermino]    = useState('');
  const [desde,      setDesde]      = useState('');
  const [hasta,      setHasta]      = useState('');
  const [siqrooPend, setSiqrooPend] = useState(false);
  const [firmaPend,  setFirmaPend]  = useState(false);

  // Debounce del buscador
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Avisar al padre cuando cambia cualquier filtro
  useEffect(() => {
    onChange({ search: searchDeb, estatus, termino, desde, hasta, siqroo_pendiente: siqrooPend, pendiente_firma: firmaPend });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDeb, estatus, termino, desde, hasta, siqrooPend, firmaPend]);

  const hayFiltros = search || estatus || desde || hasta || siqrooPend || firmaPend || termino;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '10px 0' }}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Buscar en todo: folio, remitente, dependencia, documentos, término…"
        style={{ ...inputStyle, flex: '1 1 240px', minWidth: '180px' }}
        aria-label="Buscar"
      />

      <select value={estatus} onChange={(e) => setEstatus(e.target.value)} style={selectStyle} aria-label="Filtrar por estatus">
        {ESTATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select value={termino} onChange={(e) => setTermino(e.target.value)} style={selectStyle} aria-label="Filtrar por término">
        <option value="">Término: todos</option>
        <option value="con_termino">Con término</option>
        <option value="por_vencer">Por vencer (3 días)</option>
        <option value="vencidos">Vencidos</option>
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
        Desde
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ ...inputStyle, padding: '6px 8px' }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
        Hasta
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ ...inputStyle, padding: '6px 8px' }} />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
        <input type="checkbox" checked={siqrooPend} onChange={(e) => setSiqrooPend(e.target.checked)} />
        🚩 SIQROO pendiente
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
        <input type="checkbox" checked={firmaPend} onChange={(e) => setFirmaPend(e.target.checked)} />
        🖊️ Pendiente de firma
      </label>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => { setSearch(''); setSearchDeb(''); setEstatus(''); setDesde(''); setHasta(''); setSiqrooPend(false); setFirmaPend(false); setTermino(''); }}
          style={{ ...btnSecondary, padding: '7px 12px', fontSize: '0.78rem' }}
        >
          Limpiar
        </button>
      )}
    </div>
  );
};
