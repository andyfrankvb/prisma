import React from 'react';
import type { TipoCoincidenciaAcervo as Precision } from './types';

interface Props {
  prefijo: string;
  valor: Precision;
  deshabilitado: boolean;
  onCambiar: (valor: Precision) => void;
}

export function TipoCoincidenciaAcervo({ prefijo, valor, deshabilitado, onCambiar }: Props) {
  return <fieldset className="acervo-precision" disabled={deshabilitado}>
    <legend>Tipo de búsqueda</legend>
    <div className="acervo-precision-opciones">
      {(['precisa', 'aproximada'] as const).map((tipo) => <label key={tipo}
        className={'acervo-precision-opcion' + (valor === tipo ? ' acervo-precision-activa' : '')}>
        <input type="radio" name={prefijo + '-precision'} value={tipo} checked={valor === tipo}
          onChange={() => onCambiar(tipo)} />
        <span>{tipo === 'precisa' ? 'Búsqueda precisa' : 'Búsqueda aproximada'}</span>
      </label>)}
    </div>
  </fieldset>;
}
