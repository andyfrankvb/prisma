/**
 * TurnarPanel — la única puerta para meter a otra área en un oficio.
 *
 * Antes esto vivía en cuatro lugares que hacían casi lo mismo: el turnado, el
 * delegatorio, la casilla de Resolución y el mecanismo de testamentos. Cada uno
 * con su botón, su formulario y su nombre, y ninguno decía en qué se diferenciaba
 * de los otros. Aquí son tres opciones de una misma cosa, y la única diferencia
 * que la gente tiene que entender es si el oficio se va o se queda:
 *
 *   · Solicitud a otra área — el oficio SE QUEDA. La otra área trabaja y contesta
 *     con su documento, que regresa a «Solicitudes a otras áreas». Admite varias
 *     áreas a la vez: así se piden los testamentos a las cuatro delegaciones.
 *   · Enviar información — el oficio SE VA, ya trabajado, y no tiene que
 *     regresar. Quien lo mandó lo sigue viendo en la pestaña Todo.
 *   · No es competencia de mi área — el oficio SE VA completo y deja de verse:
 *     nunca fue de esta área. Es la única que reescribe el «Dirigido a».
 *
 * Las dos últimas van a un solo destino, porque un oficio solo se puede ir a un
 * lugar; la primera admite varios. Por eso la lista cambia de casillas a botones
 * redondos según lo que se elija.
 *
 * A qué áreas se puede escribir lo decide la configuración del SuperAdmin, no
 * este componente: aquí solo se pinta lo que el servidor manda.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { theme }                    from '../theme';
import {
  getAreasDestino, turnarOficio, crearDelegatorios,
} from '../api';
import type { AreaDestino }         from '../api';
import type { Oficio }              from '../types';
import { useDialogo }               from '../context/DialogoContext';

type Opcion = 'SOLICITUD' | 'INFORMACION' | 'COMPETENCIA';

const OPCIONES: { valor: Opcion; titulo: string; detalle: string }[] = [
  {
    valor:   'SOLICITUD',
    titulo:  'Solicitud a otra área',
    detalle: 'El oficio se queda contigo. El área trabaja y te contesta con su documento.',
  },
  {
    valor:   'INFORMACION',
    titulo:  'Enviar información a otra área',
    detalle: 'Tu área ya trabajó su parte y manda lo hecho. No tienen que regresártelo.',
  },
  {
    valor:   'COMPETENCIA',
    titulo:  'No es competencia de mi área',
    detalle: 'El oficio se va completo, allá inicia su trámite y deja de aparecerte.',
  },
];

export const TurnarPanel: React.FC<{
  oficio: Oficio;
  /** El oficio dejó el área: la vista cierra el detalle. */
  onDone?: () => void;
  /** Algo cambió y hay que recargar, pero el oficio sigue aquí. */
  onRefrescar?: () => void;
  /**
   * Abierto desde fuera. Cuando el expediente controla la apertura —la tarjeta
   * «Turnar a otra área» de la rejilla de acciones—, este panel se queda solo con
   * el formulario: su encabezado y su botón serían un segundo disparador para lo
   * mismo, a un palmo de distancia.
   */
  abierto?: boolean;
  onCerrar?: () => void;
}> = ({ oficio, onDone, onRefrescar, abierto: abiertoExterno, onCerrar }) => {
  const controlado = abiertoExterno !== undefined;
  const [abiertoPropio, setAbierto] = useState(false);
  const abierto = controlado ? !!abiertoExterno : abiertoPropio;
  const [areas,     setAreas]     = useState<AreaDestino[]>([]);
  const [opcion,    setOpcion]    = useState<Opcion>('SOLICITUD');
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [motivo,    setMotivo]    = useState('');
  const [archivo,   setArchivo]   = useState<File | null>(null);
  const [resolucion, setResolucion] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const dialogo = useDialogo();

  /** Deja el formulario en blanco. No avisa a nadie: solo vacía lo tecleado. */
  const reiniciar = () => {
    setOpcion('SOLICITUD'); setSeleccion([]);
    setMotivo(''); setArchivo(null); setResolucion(false); setError(null);
  };

  /**
   * Cerrar de verdad: vacía y avisa a quien lo abrió.
   *
   * Va aparte de `reiniciar` porque el efecto que limpia al cambiar de oficio
   * corre también al montar, y si ese avisara, el panel le diría a su padre que
   * se cerró en el mismo instante en que acababa de abrirlo. Turnar dejaba de
   * funcionar por eso.
   */
  const cerrar = () => {
    setAbierto(false); onCerrar?.();
    reiniciar();
  };

  useEffect(() => {
    if (abierto && areas.length === 0) {
      getAreasDestino(oficio.id).then((r) => setAreas(r.data)).catch(() => {});
    }
  }, [abierto, areas.length, oficio.id]);

  // Al cambiar de oficio se vacía el formulario, para no turnar el equivocado.
  useEffect(() => { setAbierto(false); reiniciar(); setAreas([]); }, [oficio.id]);

  // Cambiar de opción no debe arrastrar varias áreas a una que solo admite una:
  // se conserva la primera marcada, que es la que la persona eligió antes.
  useEffect(() => {
    if (opcion !== 'SOLICITUD') setSeleccion((prev) => prev.slice(0, 1));
    setArchivo(null);
  }, [opcion]);

  const { direcciones, delegaciones } = useMemo(() => ({
    direcciones:  areas.filter((a) => a.tipo !== 'DELEGACION'),
    delegaciones: areas.filter((a) => a.tipo === 'DELEGACION'),
  }), [areas]);

  if (!oficio.puede_solicitar) return null;

  /**
   * Soltar el oficio —enviarlo o pasarlo por no competencia— deja de ofrecerse
   * cuando ya tiene visto bueno o está a firma: el área lo trabajó y lo aprobó,
   * así que mandarlo por no competencia contradiría el expediente y tiraría el
   * proyecto. Pedir información sí sigue valiendo: puede faltar un dato para
   * poder firmar.
   */
  const puedeSoltar = !!oficio.puede_turnar;
  const opciones = puedeSoltar ? OPCIONES : OPCIONES.filter((o) => o.valor === 'SOLICITUD');

  const varias   = opcion === 'SOLICITUD';
  const necesitaDocumento = opcion === 'INFORMACION';
  const listo = seleccion.length > 0 && motivo.trim().length > 0
             && (!necesitaDocumento || !!archivo);

  /**
   * «Resolución» dejó de ser una casilla aparte. Siempre fue esto por debajo
   * —un envío de información a la Dirección General— pero con su propio botón,
   * sin justificación escrita y sin documento, así que había dos caminos para
   * lo mismo. Aquí es un matiz del envío: aparece solo cuando encaja.
   */
  const destinoEsDG = seleccion.length === 1
    && areas.find((a) => a.id === seleccion[0])?.tipo === 'DIRECCION_GENERAL';
  const ofreceResolucion = opcion === 'INFORMACION' && destinoEsDG && !oficio.resolucion;

  /**
   * Qué trae marcado el oficio, dicho y no repetido.
   *
   * Las cuatro casillas ya tienen sus propios paneles arriba —«Registro en
   * sistemas» y «Testamento»—, así que ponerlas otra vez aquí dejaba dos juegos
   * de controles para lo mismo en la misma pantalla. Lo que hace falta al turnar
   * no es volver a marcarlas: es acordarse de que existen. Por eso aquí solo se
   * nombra lo que está puesto, y cuando no hay nada se dice dónde se marca.
   */
  const marcadas = [
    oficio.testamento      && 'Testamento',
    oficio.fre_incorporado && 'FRE',
    oficio.siqroo_aplica   && 'SIQROO',
    oficio.siger_aplica    && 'SIGER',
  ].filter(Boolean) as string[];

  const nombresElegidos = seleccion
    .map((id) => areas.find((a) => a.id === id)?.nombre)
    .filter(Boolean)
    .join(', ');

  const enviar = async () => {
    if (!listo) return;

    const sigue = await dialogo.confirmar({
      titulo:  OPCIONES.find((o) => o.valor === opcion)!.titulo,
      mensaje: opcion === 'SOLICITUD'
        ? `Se pedirá información sobre el oficio ${oficio.folio} a ${nombresElegidos}. El oficio se queda en tu bandeja hasta que contesten.`
        : opcion === 'INFORMACION'
          ? `Se enviará lo que trabajó tu área sobre el oficio ${oficio.folio} a «${nombresElegidos}», que continuará el seguimiento.`
          : `El oficio ${oficio.folio} dejará tu área y pasará a «${nombresElegidos}», donde iniciará su trámite. Dejará de aparecerte.`,
      confirmar: opcion === 'SOLICITUD' ? 'Solicitar' : 'Enviar',
      peligro:   opcion === 'COMPETENCIA',
    });
    if (!sigue) return;

    setSaving(true); setError(null);
    try {
      if (opcion === 'SOLICITUD') {
        // El oficio se queda: la vista solo recarga, no cierra el detalle.
        await crearDelegatorios(oficio.id, motivo.trim(), seleccion);
        cerrar();
        onRefrescar?.();
      } else {
        await turnarOficio(
          oficio.id, seleccion[0], motivo.trim(), opcion, archivo,
          ofreceResolucion && resolucion,
        );
        cerrar();
        onDone?.();
      }
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo completar el envío');
    } finally {
      setSaving(false);
    }
  };

  /** Un bloque de áreas con su rótulo. La separación es visual, no funcional:
   *  se puede elegir de ambos lados a la vez cuando la opción admite varias. */
  const bloque = (rotulo: string, lista: AreaDestino[]) => {
    if (!lista.length) return null;
    return (
      <div style={{ display: 'grid', gap: '5px' }}>
        <span style={rotuloBloque}>{rotulo}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '2px 14px' }}>
          {lista.map((a) => {
            const marcada = seleccion.includes(a.id);
            return (
              <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.8rem', cursor: 'pointer', padding: '3px 0' }}>
                <input
                  type={varias ? 'checkbox' : 'radio'}
                  name={`destino-${oficio.id}`}
                  checked={marcada}
                  onChange={(e) => setSeleccion((prev) => {
                    if (!varias) return [a.id];
                    return e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id);
                  })}
                />
                <span>
                  {a.nombre}
                  {/* El área se lista aunque le falte titular: esconderla la hacía
                      desaparecer sin que nadie supiera por qué. */}
                  {!a.titular_id && (
                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#B45309' }}>
                      Sin titular activo
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  // Controlado desde fuera y cerrado: no hay nada que dibujar. Quien lo abre es
  // la tarjeta «Turnar a otra área» de la rejilla de acciones.
  if (controlado && !abierto) return null;

  return (
    <div style={caja}>
      {/* El encabezado y su botón solo cuando el panel se manda solo. Bajo el
          control del expediente serían un segundo disparador para lo mismo, a un
          palmo de la tarjeta que ya lo abrió. */}
      {!controlado && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <span style={titulo}>Turnar a otra área</span>
            <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
              Pide información sin soltarlo, manda lo que ya trabajaste, o pásalo a quien le corresponde.
            </span>
          </div>
          {!abierto && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setAbierto(true)} style={btnSec}>Turnar a otra área</button>
            </div>
          )}
        </div>
      )}

      {!abierto && error && (
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>
      )}

      {abierto && (
        <div style={{ display: 'grid', gap: '14px', marginTop: controlado ? 0 : '14px' }}>
          {/* La opción se elige primero: define si el oficio se va o se queda,
              cuántas áreas se pueden marcar y qué se pide más abajo. */}
          <div style={{ display: 'grid', gap: '6px' }}>
            <span style={rotuloBloque}>Elegir competencia</span>
            {!puedeSoltar && (
              <span style={{ fontSize: '0.73rem', color: theme.colors.textSecondary, marginBottom: '2px' }}>
                Este oficio ya tiene visto bueno: puedes pedirle información a otra área, pero ya no
                soltarlo. Si algo está mal, regrésalo con «Reconsiderar».
              </span>
            )}
            {opciones.map((o) => (
              <label key={o.valor} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.79rem', cursor: 'pointer' }}>
                <input
                  type="radio" name={`opcion-${oficio.id}`}
                  checked={opcion === o.valor}
                  onChange={() => setOpcion(o.valor)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>{o.titulo}</strong>
                  <span style={{ display: 'block', color: theme.colors.textSecondary, fontSize: '0.73rem' }}>
                    {o.detalle}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {/* El recordatorio va ARRIBA de las áreas: si el oficio es un
              testamento, eso es lo que hace que corresponda pedirle a las cuatro
              delegaciones. Debajo de la lista llegaría cuando ya se eligió a mano. */}
          <div style={{
            fontSize: '0.76rem', padding: '8px 11px', borderRadius: '6px',
            backgroundColor: marcadas.length ? '#F3F4F6' : '#FEF3C7',
            color: marcadas.length ? theme.colors.textSecondary : '#92400E',
          }}>
            {marcadas.length
              ? <>Este oficio está marcado como <strong>{marcadas.join(' · ')}</strong>.</>
              : <>Sin marcas. Si es testamento o lleva FRE, SIQROO o SIGER, márcalo arriba antes de turnarlo:
                  es lo que deja dicha la razón del envío.</>}
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            <span style={{ ...rotuloBloque, letterSpacing: '0.05em' }}>
              {varias ? 'Áreas destino' : 'Área destino'}
            </span>
            {areas.length === 0
              ? <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textSecondary }}>
                  Tu área no tiene ningún destino habilitado.
                </p>
              : <>
                  {bloque('Direcciones',  direcciones)}
                  {bloque('Delegaciones', delegaciones)}
                </>}
          </div>

          <div>
            <label style={etiqueta}>
              {opcion === 'SOLICITUD' ? '¿Qué información se solicita?' : 'Justificación'}
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.toUpperCase())}
              rows={2}
              placeholder={
                opcion === 'SOLICITUD'   ? 'DESCRIBE LO QUE NECESITAS DEL ÁREA…'
              : opcion === 'INFORMACION' ? '¿QUÉ SE ENVÍA Y HASTA DÓNDE TRABAJÓ TU ÁREA?'
              :                            '¿POR QUÉ CORRESPONDE A ESA ÁREA?'}
              style={{ ...input, resize: 'vertical', textTransform: 'uppercase' }}
            />
          </div>

          {necesitaDocumento && (
            <div>
              <label style={etiqueta}>
                Documento con lo trabajado <span style={{ color: theme.colors.alert.red }}>*</span>
              </label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                style={{ ...input, padding: '6px 8px' }}
              />
            </div>
          )}

          {ofreceResolucion && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.79rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={resolucion}
                onChange={(e) => setResolucion(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <span>
                <strong>Es una resolución</strong>
                <span style={{ display: 'block', color: theme.colors.textSecondary, fontSize: '0.73rem' }}>
                  Deja constancia de que el asunto lo resuelve la Dirección General, para poder
                  contarlas después sin leer cada oficio.
                </span>
              </span>
            </label>
          )}

          {error && <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={cerrar} style={btnSec}>Cancelar</button>
            <button
              type="button"
              onClick={enviar}
              disabled={saving || !listo}
              style={{ ...btnPri, opacity: (saving || !listo) ? 0.5 : 1 }}
            >
              {saving ? 'Enviando…'
                : opcion === 'SOLICITUD'
                  ? `Solicitar${seleccion.length > 1 ? ` a ${seleccion.length}` : ''}`
                  : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '8px',
  padding: '14px', marginBottom: '14px', backgroundColor: theme.colors.background,
};
const titulo: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const rotuloBloque: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: theme.colors.charcoal,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const etiqueta: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: theme.colors.charcoal,
};
const input: React.CSSProperties = {
  padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px',
  fontSize: '0.82rem', fontFamily: theme.font.family, boxSizing: 'border-box', width: '100%',
};
const btnPri: React.CSSProperties = {
  padding: '7px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#fff',
  backgroundColor: theme.colors.primary, border: 'none', borderRadius: '6px',
  cursor: 'pointer', fontFamily: theme.font.family,
};
const btnSec: React.CSSProperties = {
  padding: '6px 12px', fontSize: '0.74rem', fontWeight: 700, color: theme.colors.primary,
  backgroundColor: '#fff', border: `1px solid ${theme.colors.primary}`, borderRadius: '6px',
  cursor: 'pointer', fontFamily: theme.font.family,
};
