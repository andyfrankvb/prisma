import { useCallback, useEffect, useRef, useState } from 'react';
import type { AcervoBusqueda, AcervoOrden, CampoOrdenAcervo, FilaAcervo, TipoCoincidenciaAcervo } from './types';

type Consultar<F, R extends FilaAcervo> = (
  delegacion: number, filtros: F, pagina: number, signal: AbortSignal, orden: AcervoOrden, precision: TipoCoincidenciaAcervo,
) => Promise<AcervoBusqueda<R>>;
interface PeticionBusqueda {
  controller: AbortController;
  solicitadaCancelacion: boolean;
  completada: boolean;
}

/** Formularios independientes; una peticion vieja no puede repintar resultados. */
export function useBusquedaAcervo<F extends Record<string, string>, R extends FilaAcervo>(
  inicial: F, consultar: Consultar<F, R>, cancelarConsulta?: (signal: AbortSignal) => Promise<void>,
) {
  const [formulario, setFormulario] = useState<F>(inicial);
  const [precision, setPrecision] = useState<TipoCoincidenciaAcervo>('precisa');
  const [resultado, setResultado] = useState<AcervoBusqueda<R> | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<AcervoOrden>({ campo: 'folio', direccion: 'asc' });
  const peticion = useRef<PeticionBusqueda | null>(null);

  // Cambiar de formulario o cerrar la vista abandona la espera HTTP; nunca
  // envia una cancelacion SQL automatica. Solo cancelarBusqueda hace el POST.
  const cancelar = useCallback(() => {
    peticion.current?.controller.abort();
    peticion.current = null;
    setCargando(false);
    setCancelando(false);
    setErrorCancelacion(null);
  }, []);

  const cancelarBusqueda = async () => {
    const actual = peticion.current;
    if (!actual || actual.solicitadaCancelacion) return;
    actual.solicitadaCancelacion = true;
    setCancelando(true);
    setErrorCancelacion(null);
    try {
      if (!cancelarConsulta) throw new Error('Este cliente no permite cancelar la consulta.');
      await cancelarConsulta(actual.controller.signal);
      if (peticion.current === actual) cancelar();
    } catch (fallo) {
      if (peticion.current === actual && !actual.controller.signal.aborted) {
        actual.solicitadaCancelacion = false;
        setCancelando(false);
        const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo confirmar la cancelación. Vuelve a intentar.';
        if (actual.completada) {
          peticion.current = null;
          setCargando(false);
          setError(mensaje);
        } else setErrorCancelacion(mensaje);
      }
    }
  };

  const invalidar = useCallback(() => {
    cancelar();
    setResultado(null);
    setError(null);
  }, [cancelar]);

  const cambiar = <K extends keyof F>(campo: K, valor: F[K]) => {
    invalidar();
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  };

  const cambiarPrecision = (valor: TipoCoincidenciaAcervo) => {
    invalidar();
    setPrecision(valor);
  };

  const limpiar = () => {
    invalidar();
    setFormulario({ ...inicial });
    setPrecision('precisa');
    setOrden({ campo: 'folio', direccion: 'asc' });
  };

  const buscar = async (delegacion: number, pagina = 1, nuevoOrden = orden) => {
    cancelar();
    const actual: PeticionBusqueda = { controller: new AbortController(), solicitadaCancelacion: false, completada: false };
    peticion.current = actual;
    setError(null);
    // Conserva la tabla para mantener anchos y desplazamiento al ordenar o paginar.
    setCargando(true);
    try {
      const datos = await consultar(delegacion, { ...formulario }, pagina, actual.controller.signal, nuevoOrden, precision);
      if (peticion.current === actual && !actual.controller.signal.aborted && !actual.solicitadaCancelacion) {
        setResultado(datos);
        setOrden(datos.orden ?? nuevoOrden);
      }
    } catch (fallo) {
      if (peticion.current === actual && !actual.controller.signal.aborted && !actual.solicitadaCancelacion) {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo realizar la búsqueda.');
      }
    } finally {
      actual.completada = true;
      if (peticion.current === actual && !actual.solicitadaCancelacion) {
        peticion.current = null;
        setCargando(false);
      }
    }
  };

  const ordenar = (delegacion: number, campo: CampoOrdenAcervo) => buscar(delegacion, 1, {
    campo, direccion: orden.campo === campo && orden.direccion === 'asc' ? 'desc' : 'asc',
  });

  useEffect(() => () => { peticion.current?.controller.abort(); }, []);

  return { formulario, resultado, cargando, cancelando, errorCancelacion, error, orden, precision,
    cambiarPrecision, cambiar, buscar, ordenar, limpiar, invalidar, cancelar, cancelarBusqueda };
}
