/**
 * View: AdminUsuarios
 * CRUD completo de usuarios — usado dentro del Dashboard_SuperAdmin.
 */

import React, { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { Icono } from '../components/Icono';
import { theme }   from '../theme';
import { Modal }   from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  adminListarUsuarios,
  adminCrearUsuario,
  adminEditarUsuario,
  adminToggleActivo,
  adminResetPassword,
  adminListarOficinas,
} from '../api';
import type { UsuarioAdmin, OficinaAdmin } from '../api';
import type { RolUsuario } from '../types';
import { useDialogo } from '../context/DialogoContext';

const LIMIT = 20;

/**
 * Los roles del sistema, con el nombre que de verdad les corresponde.
 *
 * Las etiquetas venían de cuando la única área con flujo era la Jurídica, y ya
 * no describían lo que hacen: `DIRECTOR` decía «Dirección General» —cuando es el
 * titular de CUALQUIER área, y es lo que exigen `areasTurno` y `destinosPermitidos`
 * para que un área pueda recibir oficios— y `ENCARGADO` decía «Director Jurídico».
 * Con esos nombres, dar de alta al jefe de un área nueva parecía imposible: el
 * rol estaba ahí, pero se leía como si fuera de otra oficina.
 *
 * También faltaban dos que el servidor sí acepta —`ROLES_VALIDOS` en
 * admin.controller—: OPERATIVO, que es el rol de casi todos los analistas, y
 * PARTICULAR. No se podían crear desde aquí.
 *
 * El rol dice QUIÉN es la persona. Lo que hace en cada trámite se configura
 * aparte, en Configuración de Flujos, y es por unidad.
 */
const ROLES: RolUsuario[] = [
  'DIRECTOR', 'ENCARGADO', 'OPERATIVO', 'OFICIAL', 'JURIDICO', 'SECRETARIA', 'PARTICULAR', 'SUPERADMIN',
];

const ROL_LABEL: Record<RolUsuario, string> = {
  DIRECTOR:   'Titular del área',
  ENCARGADO:  'Encargado de área',
  OPERATIVO:  'Personal operativo',
  OFICIAL:    'Oficial de Partes',
  JURIDICO:   'Analista jurídico',
  SECRETARIA: 'Secretaría',
  PARTICULAR: 'Particular',
  SUPERADMIN: 'Super Administrador',
};

/** Una línea que explica cada rol, para no tener que adivinar cuál toca. */
const ROL_AYUDA: Record<RolUsuario, string> = {
  DIRECTOR:   'El jefe del área. Necesario para que el área reciba oficios y aparezca como destino de turnado.',
  ENCARGADO:  'Reparte el trabajo del área. Puede dirigir un área distinta a la suya.',
  OPERATIVO:  'Trabaja expedientes. Es el rol de la mayoría; se le designa como analista en Configuración de Flujos.',
  OFICIAL:    'Recibe y registra los oficios en ventanilla.',
  JURIDICO:   'Analista jurídico con rol propio. Hoy casi todos usan «Personal operativo».',
  SECRETARIA: 'Acompaña a la Dirección General y sube los documentos firmados.',
  PARTICULAR: 'Asistente de la Dirección General, sin función en el flujo.',
  SUPERADMIN: 'Administra usuarios, flujos y catálogos de todo el sistema.',
};

const ROL_COLOR: Record<RolUsuario, { bg: string; text: string }> = {
  OFICIAL:    { bg: '#FEF3C7', text: '#92400E' },
  ENCARGADO:  { bg: '#FDE8EF', text: '#AB0A3D' },
  JURIDICO:   { bg: '#D1FAE5', text: '#065F46' },
  OPERATIVO:  { bg: '#E8EEF3', text: '#3D3935' },
  SECRETARIA: { bg: '#EFEDEA', text: '#3D3935' },
  DIRECTOR:   { bg: '#EDE9E4', text: '#3D3935' },
  PARTICULAR: { bg: '#F3EDE3', text: '#B68400' },
  SUPERADMIN: { bg: '#440412', text: '#fff'    },
};

const FORM_EMPTY = {
  nombre:     '',
  email:      '',
  password:   '',
  oficina_id: '' as number | '',
  // Arranca en el rol de la mayoría: casi todas las altas son personal operativo,
  // y quien dé de alta a un titular tiene que elegirlo a propósito.
  rol:        'OPERATIVO' as RolUsuario,
};

export const AdminUsuarios: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [usuarios,      setUsuarios]      = useState<UsuarioAdmin[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [search,        setSearch]        = useState('');
  const [searchDeb,     setSearchDeb]     = useState('');
  const [filterRol,     setFilterRol]     = useState('');
  const [filterActivo,  setFilterActivo]  = useState<'all' | 'true' | 'false'>('all');
  const [loading,       setLoading]       = useState(false);
  const [listError,     setListError]     = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [oficinas, setOficinas] = useState<OficinaAdmin[]>([]);
  const dialogo = useDialogo();

  const [showCreate,  setShowCreate]  = useState(false);
  const [createForm,  setCreateForm]  = useState(FORM_EMPTY);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating,    setCreating]    = useState(false);

  const [showEdit,   setShowEdit]   = useState(false);
  const [editTarget, setEditTarget] = useState<UsuarioAdmin | null>(null);
  const [editForm,   setEditForm]   = useState(FORM_EMPTY);
  const [editError,  setEditError]  = useState<string | null>(null);
  const [editing,    setEditing]    = useState(false);

  const [showReset,   setShowReset]   = useState(false);
  const [resetTarget, setResetTarget] = useState<UsuarioAdmin | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError,  setResetError]  = useState<string | null>(null);
  const [resetting,   setResetting]   = useState(false);

  const [actionMsg, setActionMsg] = useState<string | null>(null);
  /** Advertencia del servidor tras guardar. Hoy solo una: el área ya tenía titular. */
  const [aviso,     setAviso]     = useState<string | null>(null);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true); setListError(null);
    try {
      const res = await adminListarUsuarios({
        page, limit: LIMIT,
        search: searchDeb || undefined,
        rol:    filterRol  || undefined,
        activo: filterActivo === 'all' ? undefined : filterActivo === 'true',
      });
      setUsuarios(res.data);
      setTotal(res.meta.total);
    } catch (err: any) { setListError(err.message); }
    finally { setLoading(false); }
  }, [page, searchDeb, filterRol, filterActivo]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  useEffect(() => {
    adminListarOficinas().then(({ data }) => setOficinas(data)).catch(() => {});
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearchDeb(value); setPage(1); }, 400);
  };

  // ── Create ────────────────────────────────────────────────
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.oficina_id) return;
    setCreating(true); setCreateError(null);
    try {
      const r = await adminCrearUsuario({
        nombre:     createForm.nombre,
        email:      createForm.email,
        password:   createForm.password,
        rol:        createForm.rol,
        oficina_id: Number(createForm.oficina_id),
      });
      setShowCreate(false);
      setCreateForm(FORM_EMPTY);
      setAviso(r.aviso ?? null);
      setActionMsg('Usuario creado correctamente');
      fetchUsuarios();
    } catch (err: any) { setCreateError(err.message); }
    finally { setCreating(false); }
  };

  // ── Edit ──────────────────────────────────────────────────
  const openEdit = (u: UsuarioAdmin) => {
    setEditTarget(u);
    setEditForm({ nombre: u.nombre, email: u.email, password: '', oficina_id: u.oficina_id, rol: u.rol });
    setEditError(null);
    setShowEdit(true);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditing(true); setEditError(null);
    try {
      const r = await adminEditarUsuario(editTarget.id, {
        nombre:     editForm.nombre,
        email:      editForm.email,
        rol:        editForm.rol,
        oficina_id: editForm.oficina_id ? Number(editForm.oficina_id) : undefined,
      });
      setShowEdit(false);
      setAviso(r.aviso ?? null);
      setActionMsg('Usuario actualizado correctamente');
      fetchUsuarios();
    } catch (err: any) { setEditError(err.message); }
    finally { setEditing(false); }
  };

  // ── Toggle activo ─────────────────────────────────────────
  const handleToggle = async (u: UsuarioAdmin) => {
    const accion = u.activo ? 'deshabilitar' : 'habilitar';
    const sigue = await dialogo.confirmar({
      titulo:    `${accion.charAt(0).toUpperCase() + accion.slice(1)} usuario`,
      mensaje:   `Se va a ${accion} a ${u.nombre}.`,
      confirmar: accion.charAt(0).toUpperCase() + accion.slice(1),
      peligro:   accion.toLowerCase().includes('desactiv'),
    });
    if (!sigue) return;
    try {
      const { message } = await adminToggleActivo(u.id);
      setActionMsg(message);
      fetchUsuarios();
    } catch (err: any) { setActionMsg(`Error: ${err.message}`); }
  };

  // ── Reset password ────────────────────────────────────────
  const openReset = (u: UsuarioAdmin) => {
    setResetTarget(u);
    setNewPassword('');
    setResetError(null);
    setShowReset(true);
  };

  /**
   * Genera la temporal. Ya no se escribe: la elige el servidor.
   *
   * Antes la escribía aquí el superadmin, y de ahí salían dos vicios: terminaban
   * siendo todas la misma —fácil de recordar es fácil de adivinar— y quedaba
   * escrita en el chat por donde se dictaba. `newPassword` ahora guarda lo que el
   * servidor devolvió, para mostrarlo; se ve una sola vez porque la base solo
   * conserva el hash.
   */
  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true); setResetError(null);
    try {
      const r = await adminResetPassword(resetTarget.id);
      setNewPassword(r.data.password_temporal);
      fetchUsuarios();   // refresca la marca de «temporal pendiente» en la lista
    } catch (err: any) { setResetError(err.message); }
    finally { setResetting(false); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px', backgroundColor: theme.colors.background, minHeight: '100%', fontFamily: theme.font.family }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Usuarios del Sistema
          </h2>
          <p style={{ margin: '3px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            {total} usuario{total !== 1 ? 's' : ''} registrados
          </p>
        </div>
        <button onClick={() => { setCreateForm(FORM_EMPTY); setCreateError(null); setShowCreate(true); }} style={btnPrimary}>
          + Nuevo Usuario
        </button>
      </div>

      {/* Feedback */}
      {actionMsg && (
        <div role="status" style={{ ...alertSuccess, marginBottom: '16px', cursor: 'pointer' }} onClick={() => setActionMsg(null)}>
          <Icono nombre="check" inline />{actionMsg} <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>(clic para cerrar)</span>
        </div>
      )}

      {/* Va aparte del mensaje de éxito y no lo reemplaza: el guardado SÍ ocurrió,
          pero queda algo por hacer. Fundirlos haría que uno de los dos se perdiera. */}
      {aviso && (
        <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderLeft: '4px solid #D97706', borderRadius: '8px', fontSize: '0.83rem', color: '#92400E', lineHeight: 1.5, cursor: 'pointer' }} onClick={() => setAviso(null)}>
          <Icono nombre="alerta" inline />{aviso} <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>(clic para cerrar)</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', padding: '14px 16px', backgroundColor: theme.colors.surface, borderRadius: '10px', border: `1px solid ${theme.colors.border}` }}>
        <input
          type="search"
          placeholder="Buscar nombre o email…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ ...inputStyle, width: '200px' }}
          aria-label="Buscar"
        />
        <select value={filterRol} onChange={(e) => { setFilterRol(e.target.value); setPage(1); }} style={{ ...inputStyle, width: '170px' }} aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
        </select>
        <select value={filterActivo} onChange={(e) => { setFilterActivo(e.target.value as any); setPage(1); }} style={{ ...inputStyle, width: '140px' }} aria-label="Estado">
          <option value="all">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Deshabilitados</option>
        </select>
        {(filterRol || filterActivo !== 'all' || search) && (
          <button onClick={() => { setFilterRol(''); setFilterActivo('all'); setSearch(''); setSearchDeb(''); setPage(1); }} style={btnSecondary}>
            <Icono nombre="cerrar" inline />Limpiar
          </button>
        )}
      </div>

      {listError && <div role="alert" style={alertError}>{listError}</div>}

      {/* Table — scroll horizontal en móvil */}
      <div style={{ backgroundColor: theme.colors.surface, borderRadius: '10px', border: `1px solid ${theme.colors.border}`, overflowX: 'auto', marginBottom: '16px' }}>
        <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: theme.colors.primary, color: '#fff' }}>
              {['Nombre / ID', 'Email', 'Rol', 'Oficina', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: theme.colors.textSecondary }}>Cargando…</td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: theme.colors.textSecondary }}>Sin resultados</td></tr>
            ) : (
              usuarios.map((u, i) => (
                <tr key={u.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#F9FAFB', borderBottom: `1px solid ${theme.colors.border}`, opacity: u.activo ? 1 : 0.55 }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700, color: theme.colors.textPrimary }}>{u.nombre}</div>
                    <div style={{ fontSize: '0.7rem', color: theme.colors.textSecondary }}>ID #{u.id}</div>
                  </td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}><RolBadge rol={u.rol} /></td>
                  <td style={tdStyle}>{u.oficina_nombre}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700,
                      backgroundColor: u.activo ? '#D1FAE5' : '#FEE2E2',
                      color: u.activo ? '#065F46' : '#991B1B',
                    }}>
                      {u.activo ? '● Activo' : '● Deshabilitado'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <button style={{ ...btnAction, backgroundColor: theme.colors.gold }} onClick={() => openEdit(u)} title="Editar"><Icono nombre="editar" inline />Editar</button>
                    <button style={{ ...btnAction, backgroundColor: '#3D3935' }} onClick={() => openReset(u)} title="Contraseña"><Icono nombre="candado" size={14} /></button>
                    <button
                      style={{ ...btnAction, backgroundColor: u.activo ? theme.colors.alert.red : theme.colors.alert.green }}
                      onClick={() => handleToggle(u)}
                      title={u.activo ? 'Deshabilitar' : 'Habilitar'}
                    >
                      {u.activo ? <Icono nombre="tache" size={14} /> : <Icono nombre="check" size={14} />}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>← Anterior</button>
          <span style={{ lineHeight: '36px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>Pág. {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSecondary}>Siguiente →</button>
        </div>
      )}

      {/* ── Modal: Crear ──────────────────────────────────── */}
      <Modal open={showCreate} title="Nuevo Usuario" onClose={() => setShowCreate(false)} width={520}>
        <form onSubmit={handleCreate} noValidate>
          <UserFormFields form={createForm} onChange={(f) => setCreateForm((p) => ({ ...p, ...f }))} oficinas={oficinas} showPassword />
          {createError && <div role="alert" style={alertError}>{createError}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowCreate(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={creating || !createForm.nombre || !createForm.email || !createForm.password || !createForm.oficina_id} style={btnPrimary}>
              {creating ? 'Creando…' : '+ Crear Usuario'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Editar ─────────────────────────────────── */}
      <Modal open={showEdit} title={`Editar — ${editTarget?.nombre}`} onClose={() => setShowEdit(false)} width={520}>
        <form onSubmit={handleEdit} noValidate>
          <UserFormFields form={editForm} onChange={(f) => setEditForm((p) => ({ ...p, ...f }))} oficinas={oficinas} showPassword={false} />
          {editError && <div role="alert" style={alertError}>{editError}</div>}
          <div style={modalFooter}>
            <button type="button" onClick={() => setShowEdit(false)} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={editing || !editForm.nombre || !editForm.email} style={btnPrimary}>
              {editing ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Reset Password ─────────────────────────── */}
      <Modal open={showReset} title={`Contraseña temporal — ${resetTarget?.nombre}`} onClose={() => { setShowReset(false); setNewPassword(''); }} width={440}>
        {newPassword ? (
          <div>
            <div style={{ padding: '12px 14px', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderLeft: '3px solid #D97706', borderRadius: '8px', marginBottom: '18px', fontSize: '0.82rem', color: '#92400E', lineHeight: 1.5 }}>
              <strong>Anótala ahora.</strong> El sistema guarda la contraseña cifrada, así que esta es la única vez que puede mostrarse. Si se pierde, genera otra.
            </div>
            <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Dile a {resetTarget?.nombre} que entre con
            </p>
            <div style={{ padding: '14px 16px', backgroundColor: '#F5F4F2', border: `1px solid ${theme.colors.border}`, borderRadius: '8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.02em', color: theme.colors.textPrimary, textAlign: 'center', userSelect: 'all' }}>
              {newPassword}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary, lineHeight: 1.5 }}>
              Al entrar con ella, el sistema le pedirá que elija una propia antes de dejarlo hacer cualquier otra cosa. Sus sesiones abiertas ya quedaron cerradas.
            </p>
            <div style={modalFooter}>
              <button type="button" onClick={() => { setShowReset(false); setNewPassword(''); setActionMsg('Contraseña temporal generada'); }} style={btnPrimary}>
                Ya la anoté
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReset} noValidate>
            <div style={{ padding: '12px 14px', backgroundColor: '#F5F4F2', border: `1px solid #E2DDD8`, borderLeft: `3px solid #3B82F6`, borderRadius: '8px', marginBottom: '20px', fontSize: '0.82rem', color: '#3D3935', lineHeight: 1.5 }}>
              <p style={{ margin: 0, fontWeight: 700 }}><Icono nombre="candado" inline />Generar una temporal para {resetTarget?.nombre}</p>
              <p style={{ margin: '6px 0 0' }}>
                La elige el sistema, con palabras fáciles de dictar por teléfono. Se mostrará una sola vez y cerrará las sesiones que {resetTarget?.nombre} tenga abiertas.
              </p>
            </div>
            {resetError && <div role="alert" style={alertError}>{resetError}</div>}
            <div style={modalFooter}>
              <button type="button" onClick={() => setShowReset(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={resetting} style={{ ...btnPrimary, backgroundColor: resetting ? theme.colors.grayMid : '#3D3935' }}>
                {resetting ? 'Generando…' : 'Generar contraseña temporal'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ── UserFormFields ────────────────────────────────────────────

interface FormState { nombre: string; email: string; password: string; oficina_id: number | ''; rol: RolUsuario; }

const UserFormFields: React.FC<{ form: FormState; onChange: (p: Partial<FormState>) => void; oficinas: OficinaAdmin[]; showPassword: boolean }> = ({ form, onChange, oficinas, showPassword }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
    <div>
      <label style={labelStyle}>Nombre completo <span style={{ color: theme.colors.alert.red }}>*</span></label>
      <input type="text" value={form.nombre} onChange={(e) => onChange({ nombre: e.target.value })} required placeholder="Ej. Juan Pérez García" style={{ ...inputStyle, width: '100%' }} autoComplete="name" />
    </div>
    <div>
      <label style={labelStyle}>Usuario <span style={{ color: theme.colors.alert.red }}>*</span></label>
      <input type="text" value={form.email} onChange={(e) => onChange({ email: e.target.value })} required placeholder="ej. juanperez" style={{ ...inputStyle, width: '100%' }} autoComplete="username" />
    </div>
    {showPassword && (
      <div>
        <label style={labelStyle}>Contraseña inicial <span style={{ color: theme.colors.alert.red }}>*</span></label>
        <input type="password" value={form.password} onChange={(e) => onChange({ password: e.target.value })} required minLength={8} placeholder="Mínimo 8 caracteres" style={{ ...inputStyle, width: '100%' }} autoComplete="new-password" />
      </div>
    )}
    <div>
      <label style={labelStyle}>Oficina <span style={{ color: theme.colors.alert.red }}>*</span></label>
      <select value={form.oficina_id} onChange={(e) => onChange({ oficina_id: Number(e.target.value) })} required style={{ ...inputStyle, width: '100%' }}>
        <option value="">— Selecciona —</option>
        {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>
    </div>

    {/* Rol.
        Antes no estaba: el alta mandaba 'OPERATIVO' fijo y una nota decía que el
        rol se asignaba desde Configuración de Flujos. No era cierto —esa pantalla
        asigna los roles del FLUJO: encargado, analista, oficial de partes— y por
        eso nombrar al titular de un área nueva parecía imposible desde el sistema.
        El servidor siempre aceptó los ocho roles; lo que faltaba era este campo. */}
    <div>
      <label style={labelStyle}>Rol <span style={{ color: theme.colors.alert.red }}>*</span></label>
      <select value={form.rol} onChange={(e) => onChange({ rol: e.target.value as RolUsuario })} required style={{ ...inputStyle, width: '100%' }}>
        {ROLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
      </select>
      <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary, lineHeight: 1.45 }}>
        {ROL_AYUDA[form.rol]}
      </p>
    </div>

    <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.textSecondary, backgroundColor: '#F9FAFB', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.colors.border}` }}>
      <Icono nombre="informacion" inline />El rol dice <strong>quién es</strong> la persona. Lo que hace en cada trámite —repartir, revisar, capturar— se configura aparte, en <strong>Configuración de Flujos</strong>.
    </p>
  </div>
);

// ── RolBadge ──────────────────────────────────────────────────

const RolBadge: React.FC<{ rol: RolUsuario }> = ({ rol }) => {
  const cfg = ROL_COLOR[rol] ?? { bg: '#EDE9E4', text: '#3D3935' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {ROL_LABEL[rol] ?? rol}
    </span>
  );
};

// ── Styles ────────────────────────────────────────────────────
const thStyle: React.CSSProperties      = { padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties      = { padding: '11px 16px', verticalAlign: 'middle' };
const inputStyle: React.CSSProperties   = { padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const, fontFamily: theme.font.family };
const labelStyle: React.CSSProperties   = { display: 'block', marginBottom: '5px', fontWeight: 600, fontSize: '0.8rem', color: theme.colors.charcoal };
const btnPrimary: React.CSSProperties   = { padding: '9px 20px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family };
const btnAction: React.CSSProperties    = { padding: '5px 10px', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', marginRight: '4px', fontFamily: theme.font.family };
const alertError: React.CSSProperties   = { padding: '10px 14px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px' };
const alertSuccess: React.CSSProperties = { padding: '10px 14px', backgroundColor: '#D1FAE5', color: theme.colors.alert.green, borderRadius: '6px', fontSize: '0.875rem', fontWeight: 600 };
const modalFooter: React.CSSProperties  = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' };
