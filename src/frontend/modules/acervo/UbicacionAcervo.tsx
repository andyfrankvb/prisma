import React, { useState } from 'react';
import { Icono } from '../../components/Icono';
import { CamposAcervo } from './CamposAcervo';
import { CAMPOS_UBICACION } from './campos';
import type { CampoInmueble, FormularioInmueble } from './types';

interface Props {
  valores: FormularioInmueble;
  deshabilitado: boolean;
  onCambiar: (campo: CampoInmueble, valor: string) => void;
}

export function UbicacionAcervo({ valores, deshabilitado, onCambiar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const claseFlecha = [
    'acervo-inline-flex acervo-translate-x-0 acervo-translate-y-0 acervo-skew-x-0 acervo-skew-y-0 acervo-scale-100',
    'acervo-transition-transform acervo-duration-200 acervo-ease-in-out motion-reduce:acervo-transition-none',
    abierto ? '-acervo-rotate-90' : 'acervo-rotate-90',
  ].join(' ');

  return <>
    <h3 className="acervo-mb-4 acervo-mt-6 acervo-text-xs">
      <button type="button" id="acervo-ubicacion-boton" aria-expanded={abierto}
        aria-controls="acervo-ubicacion-campos" onClick={() => setAbierto((valor) => !valor)}
        className="acervo-inline-flex acervo-items-center acervo-gap-2 acervo-border-0 acervo-bg-transparent acervo-p-0 acervo-font-inherit acervo-text-xs acervo-font-bold acervo-text-guinda-oscuro acervo-cursor-pointer focus-visible:acervo-outline focus-visible:acervo-outline-2 focus-visible:acervo-outline-offset-2 focus-visible:acervo-outline-guinda">
        Ubicación y descripción
        <span aria-hidden="true" className={claseFlecha}><Icono nombre="flechaDer" size={16} /></span>
      </button>
    </h3>
    <div id="acervo-ubicacion-campos" hidden={!abierto}>
      <CamposAcervo prefijo="acervo-inm" campos={CAMPOS_UBICACION} valores={valores}
        deshabilitado={deshabilitado} onCambiar={onCambiar} />
    </div>
  </>;
}
