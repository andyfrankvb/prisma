import React, { useEffect, useRef } from 'react';
import { Icono } from '../../components/Icono';

interface Props {
  activa: boolean;
  cancelando: boolean;
  error: string | null;
  onCancelar: () => void;
}

export function CargaBusquedaGestion(props: Props) {
  return props.activa ? <VentanaCarga {...props} /> : null;
}

function VentanaCarga({ cancelando, error, onCancelar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const ventana = dialogo.current!;
    const origen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const desbordamientoAnterior = document.body.style.overflow;
    const rellenoAnterior = document.body.style.paddingRight;
    const anchoBarra = window.innerWidth - document.documentElement.clientWidth;
    const rellenoActual = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    if (anchoBarra > 0) document.body.style.paddingRight = (rellenoActual + anchoBarra) + 'px';
    document.body.style.overflow = 'hidden';
    if (!ventana.open) ventana.showModal();
    return () => {
      if (ventana.open) ventana.close();
      document.body.style.overflow = desbordamientoAnterior;
      document.body.style.paddingRight = rellenoAnterior;
      requestAnimationFrame(() => { if (!ventana.open && origen?.isConnected) origen.focus({ preventScroll: true }); });
    };
  }, []);
  return <dialog ref={dialogo} id="g-carga-busqueda" aria-labelledby="g-carga-titulo" aria-modal="true"
    onCancel={(evento) => { evento.preventDefault(); if (!cancelando) onCancelar(); }}>
    <div className="g-carga-contenido" aria-busy="true">
      <button type="button" autoFocus className="g-carga-cancelar" disabled={cancelando} onClick={onCancelar}>
        <Icono nombre="cerrar" size={18} />Cancelar búsqueda
      </button>
      <span className="g-carga-giro" aria-hidden="true" />
      <h2 id="g-carga-titulo" role="status">{cancelando ? 'Cancelando búsqueda…' : 'Buscando coincidencias…'}</h2>
      <p className="g-carga-error" role={error ? 'alert' : undefined}>{error ?? '\u00a0'}</p>
    </div>
  </dialog>;
}
