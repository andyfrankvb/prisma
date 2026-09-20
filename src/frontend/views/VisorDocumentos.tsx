/**
 * View: VisorDocumentos
 * File: src/frontend/views/VisorDocumentos.tsx
 *
 * Migrado vía Strangler Fig desde SID (libros-lista.component.html/ts +
 * visor.component.html/ts): dos pestañas de búsqueda — "Libros" (por
 * oficina/sección/tomo, navegando página a página) e "Inscripciones" (por
 * número de inscripción, con rango) — cada una con su panel de búsqueda a
 * la izquierda y su tabla de resultados a la derecha; al abrir un
 * documento aparece el modal visor (VisorModal), también fiel a SID.
 *
 * Lo nuevo de VISAR (curaduría, transcripción IA, varias versiones de
 * digitalización, marca de agua dinámica) se conserva dentro del modal,
 * en un cajón adicional — el diseño y la forma de buscar/abrir/interactuar
 * con el documento son los de SID, no los de VISAR.
 */
import React, { useEffect, useState } from 'react';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import * as s from '../components/visor/estilosSid';
import { BuscadorLibros } from '../components/visor/BuscadorLibros';
import { TablaLibros } from '../components/visor/TablaLibros';
import { BuscadorInscripciones } from '../components/visor/BuscadorInscripciones';
import { TablaInscripciones } from '../components/visor/TablaInscripciones';
import { VisorModal } from '../components/visor/VisorModal';
import type { VisorModalItem } from '../components/visor/VisorModal';
import {
  getDelegaciones, getSecciones, getLibros, getFojasDeTomo,
  buscarInscripciones, mergeRangoPdf,
} from '../services/visorApi';
import type {
  VisorDelegacion, VisorSeccion, VisorLibroResumen, VisorFoja, VisorInscripcionConTomo,
} from '../types';

type Tab = 'libros' | 'inscripciones';

export const VisorDocumentos: React.FC = () => {
  const [tab, setTab] = useState<Tab>('libros');

  const [delegaciones, setDelegaciones] = useState<VisorDelegacion[]>([]);
  const [secciones, setSecciones] = useState<VisorSeccion[]>([]);

  useEffect(() => {
    getDelegaciones().then(setDelegaciones).catch(() => {});
    getSecciones().then(setSecciones).catch(() => {});
  }, []);

  // ── Estado: pestaña Libros ──────────────────────────────────────────────────
  const [libDelegacionId, setLibDelegacionId] = useState('');
  const [libSeccionId, setLibSeccionId] = useState('');
  const [libTomoQuery, setLibTomoQuery] = useState('');
  const [libros, setLibros] = useState<VisorLibroResumen[]>([]);
  const [cargandoLibros, setCargandoLibros] = useState(false);
  const [libroSeleccionado, setLibroSeleccionado] = useState<VisorLibroResumen | null>(null);
  const [fojasDelLibro, setFojasDelLibro] = useState<VisorFoja[]>([]);
  const [cargandoFojas, setCargandoFojas] = useState(false);
  const [rangoDesde, setRangoDesde] = useState('');
  const [rangoHasta, setRangoHasta] = useState('');
  const [descargandoRango, setDescargandoRango] = useState(false);

  const buscarLibros = async () => {
    if (!libDelegacionId) return;
    setCargandoLibros(true);
    setLibroSeleccionado(null);
    setFojasDelLibro([]);
    try {
      setLibros(await getLibros(Number(libDelegacionId), libSeccionId ? Number(libSeccionId) : undefined, libTomoQuery));
    } finally { setCargandoLibros(false); }
  };

  const seleccionarLibro = async (libro: VisorLibroResumen) => {
    setLibroSeleccionado(libro);
    setRangoDesde(''); setRangoHasta('');
    setCargandoFojas(true);
    try {
      setFojasDelLibro(await getFojasDeTomo(libro.id));
    } finally { setCargandoFojas(false); }
  };

  const descargarRangoLibro = async () => {
    if (!libroSeleccionado || !rangoDesde || !rangoHasta) return;
    setDescargandoRango(true);
    try {
      const blob = await mergeRangoPdf(libroSeleccionado.id, Number(rangoDesde), Number(rangoHasta));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tomo_${libroSeleccionado.numero_romano}_${rangoDesde}-${rangoHasta}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setDescargandoRango(false); }
  };

  // ── Estado: pestaña Inscripciones ───────────────────────────────────────────
  const [inscDelegacionId, setInscDelegacionId] = useState('');
  const [inscSeccionId, setInscSeccionId] = useState('');
  const [inscTomoQuery, setInscTomoQuery] = useState('');
  const [inscInscripcionQuery, setInscInscripcionQuery] = useState('');
  const [inscLimite, setInscLimite] = useState('300');
  const [inscripciones, setInscripciones] = useState<VisorInscripcionConTomo[]>([]);
  const [cargandoInscripciones, setCargandoInscripciones] = useState(false);
  const [inscripcionSeleccionada, setInscripcionSeleccionada] = useState<VisorInscripcionConTomo | null>(null);
  const [inscBusquedaId, setInscBusquedaId] = useState(0);

  const buscarInscripcionesTab = async () => {
    if (!inscDelegacionId) return;
    setCargandoInscripciones(true);
    setInscripcionSeleccionada(null);
    try {
      const data = await buscarInscripciones({
        delegacionId: Number(inscDelegacionId),
        seccionId:    inscSeccionId ? Number(inscSeccionId) : undefined,
        tomo:         inscTomoQuery,
        inscripcion:  inscInscripcionQuery,
        limit:        Number(inscLimite),
      });
      setInscripciones(data);
      setInscBusquedaId((n) => n + 1);
    } finally { setCargandoInscripciones(false); }
  };

  // ── Modal visor ──────────────────────────────────────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalItems, setModalItems] = useState<VisorModalItem[]>([]);
  const [modalIndice, setModalIndice] = useState(0);
  const [modalCacheKey, setModalCacheKey] = useState<string | number | null>(null);

  const abrirDesdeLibro = (indice: number) => {
    const items: VisorModalItem[] = fojasDelLibro.map((f) => ({
      key: f.id, fojaId: f.id, titulo: `Foja ${f.numero_foja}`, detalle: f.inscripcion ?? undefined,
    }));
    setModalItems(items);
    setModalIndice(indice);
    setModalCacheKey(libroSeleccionado?.id ?? null);
    setModalAbierto(true);
  };

  const verRangoLibro = () => {
    if (!rangoDesde) return;
    const indice = Math.max(0, Math.min(fojasDelLibro.length - 1, Number(rangoDesde) - 1));
    abrirDesdeLibro(indice);
  };

  const abrirDesdeInscripcion = (insc: VisorInscripcionConTomo) => {
    const conFoja = inscripciones.filter((i) => i.foja_id !== null);
    const items: VisorModalItem[] = conFoja.map((i) => ({
      key: i.id, fojaId: i.foja_id as number,
      titulo: `Tomo ${i.numero_romano} · Inscripción ${String(i.numero_inscripcion).padStart(4, '0')}`,
      detalle: i.asignacion,
    }));
    const indice = conFoja.findIndex((i) => i.id === insc.id);
    if (indice < 0) return;
    setModalItems(items);
    setModalIndice(indice);
    setModalCacheKey(`insc-${inscBusquedaId}`);
    setModalAbierto(true);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', fontFamily: theme.font.family }}>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.3rem', fontWeight: 900, color: theme.colors.primaryDark, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icono nombre="documento" size={22} color={theme.colors.primary} />Visor de Documentos
      </h1>

      <div style={s.tabsWrap}>
        <button style={s.tab(tab === 'libros')} onClick={() => setTab('libros')}>
          <Icono nombre="documento" size={14} color={tab === 'libros' ? '#fff' : theme.colors.textSecondary} />Libros
        </button>
        <button style={s.tab(tab === 'inscripciones')} onClick={() => setTab('inscripciones')}>
          <Icono nombre="etiqueta" size={14} color={tab === 'inscripciones' ? '#fff' : theme.colors.textSecondary} />Inscripciones
        </button>
      </div>

      {tab === 'libros' && (
        <div style={s.grid}>
          <BuscadorLibros
            delegaciones={delegaciones} secciones={secciones}
            delegacionId={libDelegacionId} seccionId={libSeccionId} tomoQuery={libTomoQuery}
            onDelegacionChange={setLibDelegacionId} onSeccionChange={setLibSeccionId} onTomoQueryChange={setLibTomoQuery}
            onBuscar={buscarLibros} buscando={cargandoLibros}
            libroSeleccionado={libroSeleccionado} fojas={fojasDelLibro} cargandoFojas={cargandoFojas}
            indiceActual={-1} onAbrirFoja={abrirDesdeLibro}
            rangoDesde={rangoDesde} rangoHasta={rangoHasta} onRangoDesdeChange={setRangoDesde} onRangoHastaChange={setRangoHasta}
            onVerRango={verRangoLibro} onDescargarRango={descargarRangoLibro} descargando={descargandoRango}
          />
          <TablaLibros libros={libros} seleccionado={libroSeleccionado} cargando={cargandoLibros} onSeleccionar={seleccionarLibro} />
        </div>
      )}

      {tab === 'inscripciones' && (
        <div style={s.grid}>
          <BuscadorInscripciones
            delegaciones={delegaciones} secciones={secciones}
            delegacionId={inscDelegacionId} seccionId={inscSeccionId} tomoQuery={inscTomoQuery}
            inscripcionQuery={inscInscripcionQuery} limite={inscLimite}
            onDelegacionChange={setInscDelegacionId} onSeccionChange={setInscSeccionId} onTomoQueryChange={setInscTomoQuery}
            onInscripcionQueryChange={setInscInscripcionQuery} onLimiteChange={setInscLimite}
            onBuscar={buscarInscripcionesTab} buscando={cargandoInscripciones}
            seleccionada={inscripcionSeleccionada}
            onVer={() => inscripcionSeleccionada && abrirDesdeInscripcion(inscripcionSeleccionada)}
            onLimpiar={() => setInscripcionSeleccionada(null)}
          />
          <TablaInscripciones
            inscripciones={inscripciones} seleccionada={inscripcionSeleccionada} cargando={cargandoInscripciones}
            onSeleccionar={setInscripcionSeleccionada} onAbrir={abrirDesdeInscripcion}
          />
        </div>
      )}

      <VisorModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        items={modalItems}
        indiceActual={modalIndice}
        onCambiarIndice={setModalIndice}
        cacheKey={modalCacheKey}
      />
    </div>
  );
};

export default VisorDocumentos;
