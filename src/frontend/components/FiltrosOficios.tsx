/**
 * Componente compartido: barra de filtros de la lista de oficios.
 * Se usa en las vistas de Oficial, Gestión y Jurídico para que todos los roles
 * con el módulo tengan los mismos filtros (buscador, estatus, término, fechas, SIQROO).
 */

import React, { useEffect, useState } from 'react';
import { Icono } from './Icono';
import { theme } from '../theme';
import { inputStyle, selectStyle, btnSecondary } from '../styles';
import { ESTATUS_META } from './oficiosEstatus';
import { getUsuarios, getResponsables } from '../api';
import type { Responsable } from '../api';
import type { Abogado } from '../types';

export interface OficiosFiltros {
  search:            string;
  estatus:           string;
  termino:           string;
  desde:             string;
  hasta:             string;
  siqroo_pendiente:  boolean;
  pendiente_firma:   boolean;
  area:              string;   // id del jefe de área (dirigido a)
  en_bandeja_de:     string;   // id de quien lo tiene ahora
  situacion:         string;   // turnado, devuelto, de conocimiento…
}

export const FiltrosOficios: React.FC<{
  onChange: (f: OficiosFiltros) => void;
  /**
   * Acción propia de cada bandeja —generar el reporte, por ejemplo— que se
   * acomoda al final de los filtros. Vive aquí y no en su propio renglón
   * porque un botón solo se comía una franja entera de la pantalla.
   */
  accion?: React.ReactNode;
}> = ({ onChange, accion }) => {
  const [search,     setSearch]     = useState('');
  const [searchDeb,  setSearchDeb]  = useState('');
  const [estatus,    setEstatus]    = useState('');
  const [termino,    setTermino]    = useState('');
  const [desde,      setDesde]      = useState('');
  const [hasta,      setHasta]      = useState('');
  const [siqrooPend, setSiqrooPend] = useState(false);
  const [firmaPend,  setFirmaPend]  = useState(false);
  const [area,       setArea]       = useState('');
  const [bandeja,    setBandeja]    = useState('');
  const [situacion,  setSituacion]  = useState('');
  const [gente,      setGente]      = useState<Responsable[]>([]);
  const [areas,      setAreas]      = useState<Abogado[]>([]);

  // Jefes de área a los que se puede dirigir un oficio: directores y delegados.
  useEffect(() => {
    Promise.all([getUsuarios({ rol: 'DIRECTOR' }), getUsuarios({ rol: 'ENCARGADO' })])
      .then(([dirs, encs]) => setAreas([...dirs, ...encs].sort((a, b) =>
        (a.oficina_nombre ?? a.nombre).localeCompare(b.oficina_nombre ?? b.nombre))))
      .catch(() => {});
    // Quiénes pueden tener un oficio en bandeja, para el filtro de monitoreo.
    getResponsables().then((r) => setGente(r.data)).catch(() => {});
  }, []);

  // Debounce del buscador
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Avisar al padre cuando cambia cualquier filtro
  useEffect(() => {
    onChange({ search: searchDeb, estatus, termino, desde, hasta, siqroo_pendiente: siqrooPend, pendiente_firma: firmaPend, area, en_bandeja_de: bandeja, situacion });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDeb, estatus, termino, desde, hasta, siqrooPend, firmaPend, area, bandeja, situacion]);

  const hayFiltros = search || estatus || desde || hasta || siqrooPend || firmaPend || termino || area || bandeja || situacion;

  return (
    <div style={{ backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '14px', boxShadow: theme.shadow.sm, padding: '10px 12px', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>

      {/* Búsqueda */}
      <div style={{ flex: '1 1 260px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#F3F4F6', borderRadius: '9px', padding: '7px 12px' }}>
        <Icono nombre="buscar" size={15} color={theme.colors.textSecondary} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar: folio, remitente, dependencia, documentos…"
          style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', fontFamily: theme.font.family, color: theme.colors.textPrimary }}
          aria-label="Buscar"
        />
      </div>

      {/* Estatus (desplegable, para no ensanchar la vista) */}
      <select value={estatus} onChange={(e) => setEstatus(e.target.value)} style={selectStyle} aria-label="Filtrar por estatus">
        <option value="">Todos los estatus</option>
        {ESTATUS_META.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {/* Área (jefe de área al que va dirigido) */}
      <select value={area} onChange={(e) => setArea(e.target.value)} style={selectStyle} aria-label="Filtrar por área">
        <option value="">Todas las áreas</option>
        {areas.map((u) => <option key={u.id} value={String(u.id)}>{u.oficina_nombre ?? u.nombre}</option>)}
      </select>

      {/* En bandeja de — para monitorear la carga de una persona */}
      <select value={bandeja} onChange={(e) => setBandeja(e.target.value)} style={selectStyle} aria-label="Filtrar por quién lo tiene">
        <option value="">En bandeja de: todos</option>
        {gente.map((u) => (
          <option key={u.id} value={String(u.id)}>
            {u.nombre}{u.area ? ` · ${u.area}` : ''}
          </option>
        ))}
      </select>

      {/* Situación — aparte del estatus, porque no son excluyentes */}
      <select value={situacion} onChange={(e) => setSituacion(e.target.value)} style={selectStyle} aria-label="Filtrar por situación">
        <option value="">Situación: todas</option>
        <option value="turnado">Llegó turnado</option>
        <option value="devuelto">Devuelto por competencia</option>
        <option value="informacion">Con información de otra área</option>
        <option value="de_conocimiento">De conocimiento</option>
        <option value="en_firma_dg">En firma del Despacho</option>
        <option value="delegatorios_pendientes">Con delegatorios pendientes</option>
      </select>

      {/* Término */}
      <select value={termino} onChange={(e) => setTermino(e.target.value)} style={selectStyle} aria-label="Filtrar por término">
        <option value="">Término: todos</option>
        <option value="con_termino">Con término</option>
        <option value="por_vencer">Por vencer (3 días)</option>
        <option value="vencidos">Vencidos</option>
      </select>

      {/* Fechas */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
        Desde
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ ...inputStyle, padding: '6px 8px' }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
        Hasta
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ ...inputStyle, padding: '6px 8px' }} />
      </label>

      {/* SIQROO / firma */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
        <input type="checkbox" checked={siqrooPend} onChange={(e) => setSiqrooPend(e.target.checked)} />
        NCI pendiente
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
        <input type="checkbox" checked={firmaPend} onChange={(e) => setFirmaPend(e.target.checked)} />
        Pendiente de firma
      </label>

      {hayFiltros && (
        <button
          type="button"
          onClick={() => { setSearch(''); setSearchDeb(''); setEstatus(''); setDesde(''); setHasta(''); setSiqrooPend(false); setFirmaPend(false); setTermino(''); setArea(''); setBandeja(''); setSituacion(''); }}
          style={{ ...btnSecondary, padding: '7px 12px', fontSize: '0.78rem' }}
        >
          Limpiar
        </button>
      )}

      {accion && <span style={{ marginLeft: 'auto' }}>{accion}</span>}
    </div>
  );
};
