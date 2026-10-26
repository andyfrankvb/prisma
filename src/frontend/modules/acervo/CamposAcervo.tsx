import React from 'react';
import type { CampoFormulario } from './campos';

export const CLASE_INPUT = 'acervo-box-border acervo-w-full acervo-rounded-md acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-px-3 acervo-py-2.5 acervo-font-inherit acervo-text-sm acervo-text-carbon acervo-outline-none acervo-transition-colors focus:acervo-border-guinda focus:acervo-ring-2 focus:acervo-ring-guinda/10 disabled:acervo-bg-fondo disabled:acervo-cursor-not-allowed';
export const CLASE_PRIMARIO = 'acervo-inline-flex acervo-items-center acervo-justify-center acervo-gap-2 acervo-rounded-md acervo-border-0 acervo-bg-guinda acervo-px-5 acervo-py-3 acervo-font-inherit acervo-text-sm acervo-font-bold acervo-text-white acervo-cursor-pointer hover:acervo-bg-guinda-oscuro focus-visible:acervo-outline focus-visible:acervo-outline-2 focus-visible:acervo-outline-offset-2 focus-visible:acervo-outline-guinda disabled:acervo-opacity-50 disabled:acervo-cursor-not-allowed';
export const CLASE_SECUNDARIO = 'acervo-inline-flex acervo-items-center acervo-justify-center acervo-gap-2 acervo-rounded-md acervo-border acervo-border-solid acervo-border-borde acervo-bg-white acervo-px-4 acervo-py-2.5 acervo-font-inherit acervo-text-sm acervo-font-semibold acervo-text-carbon acervo-cursor-pointer hover:acervo-bg-fondo focus-visible:acervo-outline focus-visible:acervo-outline-2 focus-visible:acervo-outline-offset-2 focus-visible:acervo-outline-guinda disabled:acervo-opacity-50 disabled:acervo-cursor-not-allowed';

interface Props<K extends string> {
  prefijo: string;
  campos: CampoFormulario<K>[];
  valores: Record<K, string>;
  onCambiar: (campo: K, valor: string) => void;
  deshabilitado: boolean;
  columnas?: 4 | 5;
}

export function CamposAcervo<K extends string>({ prefijo, campos, valores, onCambiar, deshabilitado, columnas = 4 }: Props<K>) {
  return <div className={'acervo-grid acervo-gap-4 sm:acervo-grid-cols-2 ' + (columnas === 5 ? 'lg:acervo-grid-cols-5' : 'lg:acervo-grid-cols-4')}>
    {campos.map((campo) => {
      const id = prefijo + '-' + campo.nombre;
      return <div key={campo.nombre} className={campo.nombre === 'colindancias' ? 'sm:acervo-col-span-2' : ''}>
        <label htmlFor={id} className="acervo-block acervo-mb-1.5 acervo-text-xs acervo-font-bold acervo-text-carbon">{campo.etiqueta}</label>
        <input id={id} name={campo.nombre} type="text" value={valores[campo.nombre]}
          maxLength={campo.maximo ?? 200}
          inputMode={campo.modo ?? 'text'} autoComplete="off" autoCapitalize="characters" disabled={deshabilitado}
          className={CLASE_INPUT}
          onChange={(evento) => {
            const input = evento.currentTarget;
            const escrito = input.value;
            const mayusculas = escrito.toUpperCase();
            // Conserva el cursor y la selección al editar en medio del texto.
            // Ajusta las posiciones si una letra se expande al pasar a mayúsculas.
            if (mayusculas !== escrito) {
              const inicio = input.selectionStart;
              const fin = input.selectionEnd;
              const direccion = input.selectionDirection;
              input.value = mayusculas;
              if (inicio !== null && fin !== null) {
                input.setSelectionRange(escrito.slice(0, inicio).toUpperCase().length,
                  escrito.slice(0, fin).toUpperCase().length, direccion ?? 'none');
              }
            }
            onCambiar(campo.nombre, mayusculas);
          }} />
      </div>;
    })}
  </div>;
}
