/**
 * CorregirDatosPanel — corrige los datos que capturó la oficialía.
 *
 * Un dedazo en el remitente obligaba antes a descartar el registro y volver a
 * capturar, quemando un folio y dejando un oficio muerto en la bandeja.
 *
 * Solo aparece para quien pertenece al área donde vive el oficio, y solo
 * mientras no esté finalizado: después el documento ya salió firmado y
 * corregirlo reescribiría lo que dice un papel que ya está en manos de la
 * autoridad. El servidor vuelve a comprobar ambas cosas — esto es la comodidad,
 * no el candado.
 *
 * Cada campo corregido queda en el historial con el antes y el después.
 */
import React, { useEffect, useState } from 'react';
import { theme }                from '../theme';
import { Icono }                from './Icono';
import { SearchableSelect }     from './SearchableSelect';
import {
  corregirDatosOficio, getDependencias, getUnidadesInternas, getRemitentes,
  crearDependencia, crearUnidadInterna, crearRemitente,
  editarDependencia, editarUnidadInterna, editarRemitente,
  getPermisosCatalogos,
} from '../api';
import type { CorreccionOficio } from '../api';
import type { Oficio }          from '../types';

/**
 * Campos que se teclean a mano. Remitente, dependencia y unidad interna NO están
 * aquí: se eligen del catálogo más abajo.
 *
 * El término y «dirigido a» tampoco: el primero mueve un plazo legal y el
 * segundo cambia el oficio de área, que es lo que hace turnar.
 */
const CAMPOS: { clave: keyof CorreccionOficio; etiqueta: string; tipo?: 'fecha' | 'area' }[] = [
  { clave: 'numero_oficio_origen',  etiqueta: 'N.º de oficio de origen' },
  { clave: 'fecha_oficio',          etiqueta: 'Fecha del oficio', tipo: 'fecha' },
  { clave: 'correo_origen',         etiqueta: 'Correo de origen' },
  { clave: 'descripcion_solicitud', etiqueta: 'Asunto', tipo: 'area' },
];

/**
 * Los tres campos de catálogo se eligen de una lista, nunca se teclean.
 *
 * Escribirlos libres reintroducía el problema que la corrección venía a
 * resolver: dos formas distintas del mismo remitente conviviendo en la base, una
 * en el catálogo y otra en el expediente. Al elegirlos de la lista, el valor
 * corregido siempre existe en el catálogo.
 *
 * Y si la falta está EN el catálogo, se arregla en Catálogos —donde el cambio
 * queda para todos los registros futuros— y no oficio por oficio.
 */
interface Opcion { id: number; nombre: string }

const soloFecha = (v: any): string =>
  v ? String(v).slice(0, 10) : '';

export const CorregirDatosPanel: React.FC<{
  oficio:   Oficio;
  /** ¿El usuario pertenece al área que tiene el oficio? Lo calcula el servidor. */
  puede?:   boolean;
  onCambio?: () => void;
  /**
   * Otros controles que acompañan al de corregir, en su misma fila.
   *
   * Lo usa «Ver historial»: son las dos únicas cosas que encabezan el expediente
   * y, en renglones separados, se comían la primera pantalla completa antes de
   * que apareciera un solo dato. Se reciben aquí, y no se dibujan afuera, para
   * que compartan renglón sin que el formulario de corrección —que va debajo y a
   * todo lo ancho— quede apretado a media fila cuando se abre.
   */
  extra?:   React.ReactNode;
}> = ({ oficio, puede = false, onCambio, extra }) => {
  const [abierto,  setAbierto]  = useState(false);
  const [valores,  setValores]  = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [aviso,    setAviso]    = useState<string | null>(null);

  const [dependencias, setDependencias] = useState<Opcion[]>([]);
  const [remitentes,   setRemitentes]   = useState<Opcion[]>([]);
  const [subunidades,  setSubunidades]  = useState<Opcion[]>([]);
  /** Renombrar una entrada del catálogo cambia lo que ven todos: se reserva a
   *  quien administra catálogos. Crear una nueva sí está abierto. */
  const [puedeCatalogos, setPuedeCatalogos] = useState(false);
  /** Qué campo está en modo alta o edición: '' = ninguno. */
  const [modo,   setModo]   = useState<{ campo: string; accion: 'alta' | 'edicion' } | null>(null);
  const [textoCat, setTextoCat] = useState('');
  const [ocupado,  setOcupado]  = useState(false);

  /** Al abrir —y al cambiar de oficio— el formulario parte de lo que hay guardado. */
  useEffect(() => {
    const inicial: Record<string, string> = {};
    for (const c of CAMPOS) {
      const v = (oficio as any)[c.clave];
      inicial[c.clave] = c.tipo === 'fecha' ? soloFecha(v) : (v ?? '');
    }
    inicial.remitente          = oficio.remitente ?? '';
    inicial.dependencia_origen = oficio.dependencia_origen ?? '';
    inicial.unidad_interna     = oficio.unidad_interna ?? '';
    setValores(inicial);
    setError(null);
    setAviso(null);
  }, [oficio.id, abierto]);

  /** Los catálogos se traen solo al abrir: no hacen falta mientras esté cerrado. */
  useEffect(() => {
    if (!abierto) return;
    getDependencias().then((r) => setDependencias(r.data)).catch(() => setDependencias([]));
    getRemitentes().then((r) => setRemitentes(r.data)).catch(() => setRemitentes([]));
    getPermisosCatalogos()
      .then((r) => setPuedeCatalogos(!!r.data.puede_gestionar))
      .catch(() => setPuedeCatalogos(false));
    setModo(null);
  }, [abierto]);

  /**
   * Las sub-unidades cuelgan de la dependencia, y el oficio guarda su NOMBRE, no
   * su id: hay que localizar la dependencia en el catálogo para poder pedir las
   * suyas. Si el nombre guardado ya no existe —porque se renombró en el
   * catálogo—, la lista sale vacía, que es la señal correcta de que ese dato
   * quedó huérfano.
   */
  const dependenciaSel = dependencias.find((d) => d.nombre === valores.dependencia_origen);
  useEffect(() => {
    if (!abierto || !dependenciaSel) { setSubunidades([]); return; }
    getUnidadesInternas(dependenciaSel.id)
      .then((r) => setSubunidades(r.data))
      .catch(() => setSubunidades([]));
  }, [abierto, dependenciaSel?.id]);

  const finalizado = oficio.estatus === 'FINALIZADO';
  /**
   * Sin permiso de corregir —o ya finalizado— desaparece la corrección, pero no
   * lo que la acompaña: `extra` trae «Ver historial», que sí lo ve todo el mundo.
   * Devolverlo aquí y no dibujarlo afuera evita repetir esta condición en quien
   * usa el componente, que es como acaban diciendo cosas distintas.
   */
  if (!puede || finalizado) {
    return extra
      ? <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{extra}</div>
      : null;
  }

  /** Solo viaja lo que de verdad cambió: así el historial no se llena de ruido. */
  const TODOS: { clave: string; tipo?: string }[] = [
    ...CAMPOS,
    { clave: 'remitente' }, { clave: 'dependencia_origen' }, { clave: 'unidad_interna' },
  ];
  const cambiados = TODOS.filter((c) => {
    const original = c.tipo === 'fecha'
      ? soloFecha((oficio as any)[c.clave])
      : ((oficio as any)[c.clave] ?? '');
    return (valores[c.clave] ?? '') !== String(original);
  });

  const guardar = async () => {
    if (cambiados.length === 0) return;
    setGuardando(true); setError(null); setAviso(null);
    try {
      const datos: CorreccionOficio = {};
      for (const c of cambiados) {
        (datos as any)[c.clave] = valores[c.clave] === '' ? null : valores[c.clave];
      }
      const r = await corregirDatosOficio(oficio.id, datos);
      setAviso(r.message);
      onCambio?.();
      setAbierto(false);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar la corrección');
    } finally {
      setGuardando(false);
    }
  };


  /**
   * Alta y corrección de entradas del catálogo, desde aquí mismo.
   *
   * El nombre se manda en mayúsculas porque así lo guarda el servidor
   * (`normNombre` hace `toUpperCase`); teclearlo en minúsculas y verlo cambiar
   * al guardar desconcierta, así que se fuerza mientras se escribe.
   *
   * Al renombrar, el valor elegido en el formulario se actualiza al nombre nuevo:
   * si no, el oficio seguiría apuntando a un texto que ya no existe.
   */
  const recargarCatalogo = async (campo: string) => {
    if (campo === 'remitente') {
      const r = await getRemitentes(); setRemitentes(r.data);
    } else if (campo === 'dependencia_origen') {
      const r = await getDependencias(); setDependencias(r.data);
    } else if (dependenciaSel) {
      const r = await getUnidadesInternas(dependenciaSel.id); setSubunidades(r.data);
    }
  };

  const guardarCatalogo = async () => {
    if (!modo) return;
    const nombre = textoCat.trim().toUpperCase();
    if (!nombre) return;
    setOcupado(true); setError(null);
    try {
      const { campo, accion } = modo;
      const actual = valores[campo] ?? '';

      if (accion === 'alta') {
        if (campo === 'remitente')                 await crearRemitente(nombre);
        else if (campo === 'dependencia_origen')   await crearDependencia(nombre);
        else if (dependenciaSel)                   await crearUnidadInterna(dependenciaSel.id, nombre);
      } else {
        // Localizar el id de la entrada que se está corrigiendo por su nombre actual.
        const lista = campo === 'remitente' ? remitentes
                    : campo === 'dependencia_origen' ? dependencias
                    : subunidades;
        const fila = lista.find((o) => o.nombre === actual);
        if (!fila) throw new Error('No se encontró esa entrada en el catálogo');
        if (campo === 'remitente')               await editarRemitente(fila.id, nombre);
        else if (campo === 'dependencia_origen') await editarDependencia(fila.id, nombre);
        else                                     await editarUnidadInterna(fila.id, nombre);
      }

      await recargarCatalogo(campo);
      setValores((v) => ({ ...v, [campo]: nombre }));
      setModo(null); setTextoCat('');
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar en el catálogo');
    } finally {
      setOcupado(false);
    }
  };

  /** Selector de catálogo con sus dos acciones: agregar y —si tiene permiso— corregir. */
  const CampoCatalogo: React.FC<{
    campo: string; etiquetaTxt: string; opciones: Opcion[];
    deshabilitado?: boolean; ayuda?: string;
    alCambiar?: (v: string) => void;
  }> = ({ campo, etiquetaTxt, opciones, deshabilitado, ayuda, alCambiar }) => {
    const enModo = modo?.campo === campo;
    const actual = valores[campo] ?? '';
    return (
      <div>
        <label style={etiqueta}>{etiquetaTxt}</label>

        {deshabilitado ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
            {ayuda}
          </p>
        ) : enModo ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              value={textoCat}
              onChange={(e) => setTextoCat(e.target.value.toUpperCase())}
              placeholder={modo!.accion === 'alta' ? 'NOMBRE NUEVO' : 'NOMBRE CORREGIDO'}
              style={{ ...input, textTransform: 'uppercase' }}
            />
            <button type="button" onClick={guardarCatalogo} disabled={ocupado}
              style={{ ...btnMini, backgroundColor: theme.colors.primary, color: '#fff', border: 'none' }}>
              {ocupado ? '…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => { setModo(null); setTextoCat(''); }}
              style={btnMini}>
              <Icono nombre="cerrar" size={13} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchableSelect
                value={actual}
                options={opciones.map((o) => ({ value: o.nombre, label: o.nombre }))}
                onChange={(v) => (alCambiar ? alCambiar(v) : setValores((s) => ({ ...s, [campo]: v })))}
                placeholder="— Elige del catálogo —"
                addLabel="Agregar nuevo…"
                onAdd={() => { setModo({ campo, accion: 'alta' }); setTextoCat(''); }}
              />
            </div>
            {/* Corregir la entrada del catálogo: cambia el nombre para todos los
                registros, así que solo aparece a quien administra catálogos. */}
            {puedeCatalogos && actual && (
              <button
                type="button"
                title="Corregir este nombre en el catálogo"
                onClick={() => { setModo({ campo, accion: 'edicion' }); setTextoCat(actual); }}
                style={btnMini}
              >
                <Icono nombre="editar" size={13} color={theme.colors.gold} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const etiqueta: React.CSSProperties = {
    display: 'block', marginBottom: '4px', fontSize: '0.68rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.colors.textSecondary,
  };

  const btnMini: React.CSSProperties = {
    padding: '7px 10px', borderRadius: theme.radius.sm, cursor: 'pointer',
    border: `1px solid ${theme.colors.border}`, backgroundColor: '#fff',
    fontFamily: theme.font.family, fontSize: '0.76rem', fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: '0.85rem',
    fontFamily: theme.font.family, color: theme.colors.textPrimary,
    border: `1.5px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
    boxSizing: 'border-box', outline: 'none', backgroundColor: '#fff',
  };

  return (
    <div>
      {/* Uno en cada extremo y no juntos a la izquierda: son acciones distintas
          —enmendar un dato y consultar lo ocurrido— y separadas se distinguen sin
          leerlas. De paso, la fila deja de dejar medio renglón vacío a su derecha. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        flexWrap: 'wrap', justifyContent: 'space-between',
      }}>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'transparent', border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm, padding: '5px 11px', cursor: 'pointer',
            fontFamily: theme.font.family, fontWeight: 700, fontSize: '0.72rem',
            color: theme.colors.charcoal, whiteSpace: 'nowrap',
          }}
        >
          <Icono nombre="editar" size={13} color={theme.colors.gold} />
          {abierto ? 'Cancelar corrección' : 'Corregir datos'}
        </button>
        {extra}
      </div>

      {aviso && !abierto && (
        <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: theme.colors.alert.green, fontWeight: 600 }}>
          {aviso}
        </p>
      )}

      {abierto && (
        <div style={{
          marginTop: '10px', padding: '16px', borderRadius: '10px',
          border: `1.5px solid ${theme.colors.border}`, backgroundColor: '#FAFAF8',
        }}>
          <p style={{ margin: '0 0 14px', fontSize: '0.76rem', color: theme.colors.textSecondary, lineHeight: 1.5 }}>
            Corrige lo que se capturó mal al registrar. Cada cambio queda en el
            historial con el valor anterior y el nuevo. El término y el área
            destinataria no se editan aquí: el plazo lo fija la autoridad y el
            cambio de área se hace con «Turnar». Remitente, dependencia y unidad interna se eligen del catálogo: si la falta está en el catálogo mismo, corrígela en Catálogos para que quede bien en todos los registros.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>

            {/* ── Los tres de catálogo: se eligen, no se teclean ── */}
            <CampoCatalogo campo="remitente" etiquetaTxt="Remitente" opciones={remitentes} />

            <CampoCatalogo
              campo="dependencia_origen" etiquetaTxt="Dependencia" opciones={dependencias}
              // Cambiar de dependencia invalida la sub-unidad anterior, que
              // pertenecía a otra: se limpia en vez de quedar descolgada.
              alCambiar={(v) => setValores((s) => ({ ...s, dependencia_origen: v, unidad_interna: '' }))}
            />

            <CampoCatalogo
              campo="unidad_interna" etiquetaTxt="Unidad interna" opciones={subunidades}
              deshabilitado={!dependenciaSel}
              ayuda="Elige primero la dependencia."
            />

            {CAMPOS.map((c) => (
              <div key={c.clave} style={{ gridColumn: c.tipo === 'area' ? '1 / -1' : undefined }}>
                <label style={etiqueta}>{c.etiqueta}</label>
                {c.tipo === 'area' ? (
                  <textarea
                    rows={3}
                    value={valores[c.clave] ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                    style={{ ...input, resize: 'vertical' }}
                  />
                ) : (
                  <input
                    type={c.tipo === 'fecha' ? 'date' : 'text'}
                    value={valores[c.clave] ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                    style={input}
                  />
                )}
              </div>
            ))}
          </div>

          {error && (
            <p style={{
              margin: '12px 0 0', padding: '8px 12px', borderRadius: '6px',
              backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem',
            }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || cambiados.length === 0}
              style={{
                padding: '9px 18px', borderRadius: theme.radius.sm, border: 'none',
                backgroundColor: cambiados.length === 0 ? theme.colors.grayMid : theme.colors.primary,
                color: '#fff', fontWeight: 700, fontSize: '0.8rem', fontFamily: theme.font.family,
                cursor: cambiados.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </button>
            {/* Decir cuántos campos cambiaron evita el clic a ciegas y explica
                por qué el botón está apagado cuando no se tocó nada. */}
            <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>
              {cambiados.length === 0
                ? 'Sin cambios todavía'
                : cambiados.length === 1
                  ? '1 campo por corregir'
                  : `${cambiados.length} campos por corregir`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CorregirDatosPanel;
