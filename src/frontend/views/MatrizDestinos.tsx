/**
 * MatrizDestinos — qué área le puede escribir a qué área.
 *
 * Vive dentro de Configuración de Flujos porque responde a la misma pregunta que
 * el resto de esa pantalla: quién hace qué. Antes esto estaba en el código, en
 * dos lugares que ni siquiera coincidían entre sí, así que cambiarlo obligaba a
 * tocar el programa y nadie fuera del equipo podía verlo.
 *
 * Se lee por renglón: «esta área puede dirigirse a…». Las columnas son destinos.
 * Cada casilla se guarda al momento de marcarla —no hay botón de guardar— porque
 * son cambios sueltos y aislados, y una pantalla con cincuenta casillas y un
 * único «Guardar» invita a perder lo hecho.
 *
 * La configuración guarda excepciones: todo lo que nadie ha tocado está
 * permitido. Por eso un área nueva aparece disponible sola, en vez de quedar
 * invisible hasta que alguien se acuerde de habilitarla.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Icono } from '../components/Icono';
import { theme } from '../theme';

const BASE = (import.meta as any).env?.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Unidad { id: number; nombre: string; tipo: string }
interface Celda  { unidad_origen_id: number; unidad_destino_id: number; permitido: boolean }

/** Nombre corto para los encabezados: sin él, la tabla no cabe a lo ancho. */
function abreviar(nombre: string): string {
  return nombre
    .replace(/^Dirección General$/, 'Dir. General')
    .replace(/^Dirección de Innovación.*$/, 'Informática')
    .replace(/^Dirección /, 'Dir. ')
    .replace(/^Delegación /, '');
}

export const MatrizDestinos: React.FC = () => {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [celdas,   setCeldas]   = useState<Map<string, boolean>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const clave = (o: number, d: number) => `${o}:${d}`;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`${BASE}/admin/destinos`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json() as { data: { unidades: Unidad[]; matriz: Celda[] } };
      setUnidades(data.unidades);
      setCeldas(new Map(data.matriz.map((c) => [clave(c.unidad_origen_id, c.unidad_destino_id), c.permitido])));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar la configuración de destinos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const alternar = async (origen: number, destino: number) => {
    const k = clave(origen, destino);
    const nuevo = !celdas.get(k);
    // Se pinta de inmediato: son casillas y esperar al servidor para verlas
    // cambiar hace sentir la pantalla trabada. Si falla, se revierte.
    setCeldas((prev) => new Map(prev).set(k, nuevo));
    setGuardando(k);
    try {
      const res = await fetch(`${BASE}/admin/destinos/${origen}/${destino}`, {
        method:  'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permitido: nuevo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      setCeldas((prev) => new Map(prev).set(k, !nuevo));
      setError(e?.message ?? 'No se pudo guardar el cambio');
    } finally {
      setGuardando(null);
    }
  };

  if (cargando) {
    return <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando destinos…</p>;
  }

  return (
    <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, marginBottom: '20px', overflow: 'hidden', boxShadow: theme.shadow.sm }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: '#F9F7F5' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.primaryDark }}>
          Destinos entre áreas
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          A qué áreas puede dirigirse cada una al turnar un oficio, enviar información o
          solicitarla, <strong>ya dentro del trámite</strong>. Se lee por renglón. Todo empieza
          permitido: aquí se quita lo que no aplique.
        </p>
        {/* La aclaración evita confundirla con la casilla de «Visto bueno por
            área», que se parece pero gobierna otro momento: qué correspondencia
            alcanza a capturar cada ventanilla. */}
        <p style={{ margin: '6px 0 0', fontSize: '0.74rem', color: theme.colors.grayMid }}>
          No es lo mismo que «Al registrar, también puede dirigir oficios a las direcciones
          de área»: aquella decide qué se puede capturar en cada ventanilla; ésta, a quién
          se le puede pasar el oficio después.
        </p>
      </div>

      {error && (
        <div role="alert" onClick={() => setError(null)}
          style={{ margin: '12px 20px 0', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem', cursor: 'pointer' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}

      {/* La tabla es más ancha que la pantalla en cuanto hay ocho áreas, así que
          se desplaza dentro de su propia caja y no empuja el resto de la página. */}
      <div style={{ overflowX: 'auto', padding: '14px 20px 18px' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr>
              <th style={{ ...celdaBase, textAlign: 'left', position: 'sticky', left: 0, background: theme.colors.surface, zIndex: 1 }}>
                Puede dirigirse a →
              </th>
              {unidades.map((u) => (
                <th key={u.id} style={{ ...celdaBase, minWidth: '78px', fontWeight: 700, color: theme.colors.charcoal }}>
                  {abreviar(u.nombre)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {unidades.map((origen) => (
              <tr key={origen.id}>
                <th style={{ ...celdaBase, textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: theme.colors.surface, zIndex: 1 }}>
                  {abreviar(origen.nombre)}
                </th>
                {unidades.map((destino) => {
                  if (origen.id === destino.id) {
                    // Un área no se turna a sí misma. Se marca la diagonal en vez
                    // de dejarla en blanco, para que se lea como «no aplica» y no
                    // como una casilla que alguien olvidó marcar.
                    return (
                      <td key={destino.id} style={{ ...celdaBase, color: theme.colors.grayMid, backgroundColor: '#FAFAFA' }}>
                        —
                      </td>
                    );
                  }
                  const k = clave(origen.id, destino.id);
                  return (
                    <td key={destino.id} style={celdaBase}>
                      <input
                        type="checkbox"
                        checked={celdas.get(k) ?? true}
                        disabled={guardando === k}
                        onChange={() => alternar(origen.id, destino.id)}
                        title={`${origen.nombre} → ${destino.nombre}`}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const celdaBase: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`,
  padding: '7px 9px',
  textAlign: 'center',
  fontFamily: theme.font.family,
};
