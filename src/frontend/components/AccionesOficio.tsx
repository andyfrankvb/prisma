/**
 * AccionesOficio — todo lo que se puede hacer con el oficio, en una sola zona.
 *
 * Antes esto estaba partido en dos bloques separados por media pantalla: una
 * rejilla de acciones al final del expediente y, más arriba, un grupo plegable
 * con los paneles. La gente tenía que aprenderse cuál de los dos miraba según lo
 * que quisiera hacer, y algunas cosas —turnar, mandar a firma— aparecían en los
 * dos con botones distintos.
 *
 * Ahora es una sola sección, en este orden:
 *
 *   1. Las marcas del asunto —sistemas, testamento, de conocimiento—, plegadas:
 *      describen el oficio y se tocan de vez en cuando.
 *   2. El estado: si espera firma, y las solicitudes hechas a otras áreas.
 *   3. Las acciones, hasta abajo, cada una con su explicación. Se deciden después
 *      de haber leído todo lo anterior, no antes. Son las mismas de la columna de
 *      la lista —salen de la misma función—, así que nunca ofrecen cosas
 *      distintas; el formulario de turnar ocupa su lugar mientras está abierto.
 */
import React, { useEffect, useState } from 'react';
import { theme }               from '../theme';
import { SistemasPanel }       from './SistemasPanel';
import { DeConocimientoPanel } from './DeConocimientoPanel';
import { TurnarPanel }         from './TurnarPanel';
import { DelegatoriosPanel }   from './DelegatoriosPanel';
import { TestamentoPanel }     from './TestamentoPanel';
import { PaseFirmaPanel }      from './PaseFirmaPanel';
import { BandejaDelegatorios } from './BandejaDelegatorios';
import { ListaAcciones }       from './MenuAcciones';
import type { AccionMenu }     from './MenuAcciones';
import type { Oficio }         from '../types';

interface Props {
  oficio: Oficio;
  /** Las mismas acciones que ofrece la columna de la lista. */
  acciones?: AccionMenu[];
  /** Llegó la fila actualizada del oficio: la vista la fusiona con la que tiene. */
  onActualizar?: (actualizado: Oficio) => void;
  /** El oficio dejó esta área (turnado o devuelto): la vista cierra el detalle. */
  onSalio?: () => void;
  /** Algo cambió y hay que recargar, pero el oficio sigue aquí. */
  onRefrescar?: () => void;
  /** Mostrar los delegatorios dentro del grupo. */
  conDelegatorios?: boolean;
  /** Quién puede detonar un delegatorio. */
  puedeDelegar?: boolean;
  /** Llegar con el formulario de turnar ya abierto, desde el menú de la lista. */
  abrirTurnar?: boolean;
}

export const AccionesOficio: React.FC<Props> = ({
  oficio, acciones = [], onActualizar, onSalio, onRefrescar,
  conDelegatorios = false, puedeDelegar = false, abrirTurnar = false,
}) => {
  const [turnando, setTurnando] = useState(abrirTurnar);
  const [marcas,   setMarcas]   = useState(false);
  /**
   * ¿Otra área le pidió algo a la mía sobre este oficio?
   *
   * Se necesita saberlo aquí para no decir «no hay nada que hacer» teniendo una
   * solicitud por atender un palmo más abajo, que es como se veía antes.
   */
  const [solicitudes, setSolicitudes] = useState(0);

  // Cada expediente empieza igual, salvo cuando se llegó pidiendo turnar.
  useEffect(() => { setTurnando(abrirTurnar); setMarcas(false); }, [oficio.id, abrirTurnar]);

  /**
   * «Turnar a otra área» es la única acción que pide una pantalla —elegir área,
   * justificar, adjuntar—. Se reconoce por su `id` y no por su rótulo, que es lo
   * que cambia con el tiempo, y se despliega aquí en vez de mandar a otro lado.
   */
  const lista = acciones.map((a) =>
    a.id === 'turnar' ? { ...a, onClick: () => setTurnando(true) } : a);

  /**
   * Con el visto bueno dado, «Turnar a otra área» ya no viene en la lista —el
   * oficio no se puede soltar— pero pedirle información a otra sí sigue
   * valiendo. La entrada se agrega aquí para que ese camino no desaparezca.
   */
  const puedePedir = !!oficio.puede_solicitar && !oficio.puede_turnar;
  if (puedePedir && !lista.some((a) => a.id === 'turnar')) {
    lista.push({
      id: 'turnar', label: 'Solicitar a otra área',
      descripcion: 'Pide información sin soltar el oficio. Te contestan con su documento.',
      onClick: () => setTurnando(true),
    });
  }

  // Lo que reclama atención aunque las marcas estén plegadas.
  const avisos: string[] = [];
  if (oficio.siqroo_aplica && !oficio.siqroo_control_interno) avisos.push('NCI de SIQROO pendiente');
  if (oficio.siger_aplica  && !oficio.siger_control_interno)  avisos.push('NCI de SIGER pendiente');
  if (oficio.testamento) avisos.push('Testamento en curso');
  if (oficio.resolucion) avisos.push('Resolución enviada');

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {/* Primero lo que describe el oficio y en qué va; hasta abajo lo que se
          puede hacer con él. Se decide después de haberlo leído, no antes. */}

      {/* Las marcas describen el asunto y las pone el área que lo trabaja, así
          que solo las ve quien puede tocarlas. A un área que únicamente recibió
          una solicitud sobre este oficio no le corresponden —y sin este candado
          podía desmarcarle el testamento a otra área—. Su estado igual se lee
          arriba, en «Detalle de la solicitud».

          Plegadas porque se tocan de vez en cuando; si alguna reclama atención,
          el encabezado lo dice sin necesidad de abrirlas. */}
      {oficio.puede_solicitar && (
      <div style={caja}>
        <button type="button" onClick={() => setMarcas((v) => !v)} aria-expanded={marcas} style={encabezado}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={rotulo}>Gestiones y registros</span>
            {avisos.length > 0 && !marcas && <span style={chipAviso}>{avisos.join(' · ')}</span>}
          </span>
          <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>
            {marcas ? 'Ocultar ▲' : 'Mostrar ▼'}
          </span>
        </button>

        {marcas && (
          <div style={{ marginTop: '12px' }}>
            <SistemasPanel oficio={oficio} onDone={(o) => onActualizar?.(o)} />
            {conDelegatorios && (
              <TestamentoPanel oficio={oficio} puedeDelegar={puedeDelegar} onCambio={() => onRefrescar?.()} />
            )}
            <DeConocimientoPanel oficio={oficio} onDone={(o) => onActualizar?.(o)} />
          </div>
        )}
      </div>
      )}

      {/* Estado: solo se dibujan cuando hay algo que contar. */}
      <PaseFirmaPanel oficio={oficio} />
      <DelegatoriosPanel
        oficioId={oficio.id}
        puedeDelegar={puedeDelegar}
        onCambio={() => onRefrescar?.()}
      />

      {/* Y al final, qué se puede hacer. El formulario de turnar ocupa su lugar
          mientras está abierto: no tiene sentido ofrecer otra acción a media
          captura de ésta. */}
      <div>
        <h3 style={tituloAcciones}>Acciones</h3>
        {turnando ? (
          <TurnarPanel
            oficio={oficio}
            abierto
            onCerrar={() => setTurnando(false)}
            onDone={() => { setTurnando(false); onSalio?.(); }}
            onRefrescar={() => { setTurnando(false); onRefrescar?.(); }}
          />
        ) : oficio.puede_aceptar_turno ? (
          /* La decisión de recibirlo se presenta como una pregunta con sus dos
             respuestas dentro del mismo recuadro: no son dos acciones sueltas
             entre otras, son las únicas dos salidas de una misma disyuntiva.
             Mientras no se conteste, el oficio no es del área. */
          <div style={decision}>
            <p style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 700, color: theme.colors.primaryDark }}>
              ¿Tu área se hace cargo de este oficio?
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
              Te lo turnaron y todavía no lo has recibido. Al aceptarlo podrás asignarlo o trabajarlo,
              y ya no se podrá regresar a quien te lo mandó.
            </p>
            <ListaAcciones acciones={lista} />
          </div>
        ) : (
          <>
            {/* Lo que otra área le pidió a la mía sobre este oficio. Va dentro de
                Acciones y arriba de la lista porque es trabajo que se espera de
                aquí, no un dato del expediente. */}
            <BandejaDelegatorios
              oficioId={oficio.id}
              onConteo={setSolicitudes}
              onCambio={() => onRefrescar?.()}
            />
            {/* El «no hay nada que hacer» se calla si hay una solicitud por
                atender: la habría estado contradiciendo. */}
            {!(lista.length === 0 && solicitudes > 0) && <ListaAcciones acciones={lista} />}
          </>
        )}
      </div>
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
  padding: '12px 14px', backgroundColor: theme.colors.surface,
};
const encabezado: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
  width: '100%', padding: 0, background: 'transparent', border: 'none',
  cursor: 'pointer', textAlign: 'left', fontFamily: theme.font.family,
};
const rotulo: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: theme.colors.textSecondary,
};
const tituloAcciones: React.CSSProperties = {
  margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: theme.colors.primary,
  borderBottom: `2px solid ${theme.colors.border}`, paddingBottom: '6px',
  fontFamily: theme.font.family,
};
const decision: React.CSSProperties = {
  padding: '14px 16px', borderRadius: '10px',
  backgroundColor: '#FDE8EF', border: `1px solid ${theme.colors.primary}33`,
};
const chipAviso: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: '10px',
  backgroundColor: '#FEF3C7', color: '#92400E',
};
