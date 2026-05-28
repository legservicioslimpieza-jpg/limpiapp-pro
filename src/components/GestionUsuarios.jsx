// src/components/GestionUsuarios.jsx
// LimpiApp Pro — Fase 6: Autenticación
// Panel de gestión de usuarios del sistema (solo administrador)

import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

const ROL_OPCIONES = ['administrador', 'supervisor', 'trabajador', 'cliente']

const ROL_LABELS = {
  administrador: { label: '👑 Administrador', bg: '#dbeafe', text: '#1d4ed8' },
  supervisor:    { label: '🔍 Supervisor',    bg: '#dcfce7', text: '#15803d' },
  trabajador:    { label: '🧹 Trabajador',    bg: '#fef9c3', text: '#a16207' },
  cliente:       { label: '🏢 Cliente',       bg: '#f3e8ff', text: '#7c3aed' },
}

const S = {
  container: { padding: '1.5rem', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  th: { background: '#f8fafc', padding: '0.7rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e2e8f0' },
  td: { padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem', color: '#334155', verticalAlign: 'middle' },
  badge: (rol) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.2rem 0.65rem',
    borderRadius: '1rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    background: ROL_LABELS[rol]?.bg ?? '#f1f5f9',
    color: ROL_LABELS[rol]?.text ?? '#475569',
  }),
  activoBadge: (activo) => ({
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: activo ? '#22c55e' : '#e2e8f0',
    marginRight: '0.4rem',
  }),
  btn: {
    padding: '0.3rem 0.7rem',
    border: 'none',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
  },
  btnEdit: { background: '#e0f2fe', color: '#0369a1' },
  btnToggle: (activo) => ({ background: activo ? '#fef2f2' : '#f0fdf4', color: activo ? '#dc2626' : '#16a34a' }),
  emptyState: { textAlign: 'center', padding: '3rem', color: '#94a3b8' },
  alert: { padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' },
  alertInfo: { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
}

export default function GestionUsuarios() {
  const { esAdmin } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [trabajadores, setTrabajadores] = useState([])
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    if (!esAdmin) return
    cargarTodo()
  }, [esAdmin])

  async function cargarTodo() {
    setLoading(true)
    try {
      const [u, t, c] = await Promise.all([
        supabase.from('usuarios').select('*').order('created_at'),
        supabase.from('trabajadores').select('id, nombre').order('nombre'),
        supabase.from('contratos').select('id, cliente').order('cliente'),
      ])
      if (u.error) throw u.error
      setUsuarios(u.data ?? [])
      setTrabajadores(t.data ?? [])
      setContratos(c.data ?? [])
    } catch (e) {
      setError('Error cargando usuarios: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleActivo(usuario) {
    const { error } = await supabase
      .from('usuarios')
      .update({ activo: !usuario.activo })
      .eq('id', usuario.id)
    if (error) { alert('Error: ' + error.message); return }
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, activo: !u.activo } : u))
  }

  async function guardarEdicion(id, cambios) {
    const { error } = await supabase
      .from('usuarios')
      .update(cambios)
      .eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ...cambios } : u))
    setEditando(null)
  }

  if (!esAdmin) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>⛔ Solo administradores.</div>
  }

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Cargando usuarios…</div>

  return (
    <div style={S.container}>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>🔐 Gestión de Usuarios</h2>
          <p style={S.subtitle}>{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div style={{ ...S.alert, ...S.alertInfo }}>
        💡 Para <strong>crear nuevos usuarios</strong>, ve a <strong>Supabase → Authentication → Users → Add user</strong>, crea el usuario con email y contraseña, copia su UUID y agrega una fila en la tabla <code>usuarios</code> desde el SQL Editor.
      </div>

      {error && <div style={{ ...S.alert, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>{error}</div>}

      {usuarios.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👤</div>
          <p>No hay usuarios registrados aún.</p>
        </div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              {['Estado', 'Nombre', 'Email', 'Rol', 'Vinculación', 'Acciones'].map(col => (
                <th key={col} style={S.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} style={{ background: u.activo ? '#fff' : '#fafafa' }}>
                {/* Estado */}
                <td style={S.td}>
                  <span style={S.activoBadge(u.activo)} />
                  <span style={{ fontSize: '0.78rem', color: u.activo ? '#16a34a' : '#94a3b8' }}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>

                {/* Nombre */}
                <td style={{ ...S.td, fontWeight: 600 }}>
                  {editando === u.id
                    ? <EditField value={u.nombre} onSave={v => guardarEdicion(u.id, { nombre: v })} onCancel={() => setEditando(null)} />
                    : u.nombre
                  }
                </td>

                {/* Email */}
                <td style={{ ...S.td, color: '#475569', fontSize: '0.82rem' }}>{u.email}</td>

                {/* Rol */}
                <td style={S.td}>
                  <span style={S.badge(u.rol)}>{ROL_LABELS[u.rol]?.label ?? u.rol}</span>
                </td>

                {/* Vinculación */}
                <td style={{ ...S.td, fontSize: '0.8rem', color: '#64748b' }}>
                  {u.rol === 'trabajador' && u.trabajador_id && (
                    <span>👷 {trabajadores.find(t => t.id === u.trabajador_id)?.nombre ?? u.trabajador_id}</span>
                  )}
                  {u.rol === 'cliente' && u.contrato_id && (
                    <span>📋 {contratos.find(c => c.id === u.contrato_id)?.cliente ?? u.contrato_id}</span>
                  )}
                  {!u.trabajador_id && !u.contrato_id && '—'}
                </td>

                {/* Acciones */}
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  <button
                    style={{ ...S.btn, ...S.btnEdit, marginRight: '0.4rem' }}
                    onClick={() => setEditando(u.id === editando ? null : u.id)}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    style={{ ...S.btn, ...S.btnToggle(u.activo) }}
                    onClick={() => toggleActivo(u)}
                  >
                    {u.activo ? '🚫 Desactivar' : '✅ Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Sub-componente de edición inline
function EditField({ value, onSave, onCancel }) {
  const [v, setV] = useState(value)
  return (
    <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
      <input
        value={v}
        onChange={e => setV(e.target.value)}
        style={{ padding: '0.25rem 0.4rem', border: '1px solid #cbd5e1', borderRadius: '0.3rem', fontSize: '0.85rem', width: '160px' }}
        onKeyDown={e => { if (e.key === 'Enter') onSave(v); if (e.key === 'Escape') onCancel() }}
        autoFocus
      />
      <button onClick={() => onSave(v)} style={{ background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: '0.3rem', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>✓</button>
      <button onClick={onCancel} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '0.3rem', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
    </span>
  )
}
