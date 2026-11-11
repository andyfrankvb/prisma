import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AcervoFolioDetalle, FilaAcervo } from './types';

type ConsultarDetalle = (folioId: string, delegacionId: number, signal: AbortSignal) => Promise<AcervoFolioDetalle>;

type SeleccionRelacion = { tipo: 'acto' | 'antecedente'; id: string } | null;

function vinculosSeleccionados(detalle: AcervoFolioDetalle | null, seleccion: SeleccionRelacion) {
  const actos = detalle?.actos.filter((acto) => seleccion?.tipo === 'acto'
    ? acto.id === seleccion.id
    : seleccion?.tipo === 'antecedente' && acto.antecedentes_ids.includes(seleccion.id)) ?? [];
  const actosSeleccionados = new Set(actos.map((acto) => acto.id));
  const antecedentesSeleccionados = new Set(actos.flatMap((acto) => acto.antecedentes_ids));
  if (seleccion?.tipo === 'antecedente') antecedentesSeleccionados.add(seleccion.id);
  return { actosSeleccionados, antecedentesSeleccionados,
    sinAntecedente: seleccion?.tipo === 'acto' && actos.length > 0 && antecedentesSeleccionados.size === 0 };
}

/** Cada pestaña conserva su folio y su petición, incluso mientras está oculta. */
export function useDetalleAcervo(consultar: ConsultarDetalle) {
  const [seleccion, setSeleccion] = useState<FilaAcervo | null>(null);
  const [aproximado, setAproximado] = useState(false);
  const [detalle, setDetalle] = useState<AcervoFolioDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relacion, setRelacion] = useState<SeleccionRelacion>(null);
  const vinculos = useMemo(() => vinculosSeleccionados(detalle, relacion), [detalle, relacion]);
  const peticion = useRef<AbortController | null>(null);

  const cerrar = useCallback(() => {
    peticion.current?.abort();
    peticion.current = null;
    setSeleccion(null);
    setAproximado(false);
    setDetalle(null);
    setError(null);
    setRelacion(null);
    setCargando(false);
  }, []);

  const seleccionar = async (fila: FilaAcervo, sugerido: boolean, delegacion: number) => {
    peticion.current?.abort();
    const controller = new AbortController();
    peticion.current = controller;
    setSeleccion({ folio_id: fila.folio_id, folio: fila.folio });
    setAproximado(sugerido);
    setDetalle(null);
    setError(null);
    setRelacion(null);
    setCargando(true);
    try {
      const datos = await consultar(fila.folio_id, delegacion, controller.signal);
      if (peticion.current === controller && !controller.signal.aborted) setDetalle(datos);
    } catch (fallo) {
      if (peticion.current === controller && !controller.signal.aborted) {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el folio.');
      }
    } finally {
      if (peticion.current === controller) {
        peticion.current = null;
        setCargando(false);
      }
    }
  };

  const seleccionarActo = (id: string) => {
    if (!detalle?.actos.some((acto) => acto.id === id)) return;
    setRelacion((actual) => vinculosSeleccionados(detalle, actual).actosSeleccionados.has(id)
      ? null : { tipo: 'acto', id });
  };

  const seleccionarAntecedente = (id: string) => {
    if (!detalle?.antecedentes.some((antecedente) => antecedente.antecedente_id === id)) return;
    setRelacion((actual) => vinculosSeleccionados(detalle, actual).antecedentesSeleccionados.has(id)
      ? null : { tipo: 'antecedente', id });
  };

  useEffect(() => () => {
    peticion.current?.abort();
    peticion.current = null;
  }, []);

  return { seleccion, aproximado, detalle, cargando, error, ...vinculos,
    seleccionarActo, seleccionarAntecedente, cerrar, seleccionar };
}
