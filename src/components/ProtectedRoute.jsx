// src/components/ProtectedRoute.jsx
// LimpiApp Pro — Fase 6: Autenticación
// Componente de ruta protegida por rol

import { useAuth } from '../contexts/AuthContext'
import Login from './Login'

/**
 * Envuelve un componente y lo protege por autenticación y rol.
 *
 * Props:
 *   roles  — string[] con los roles permitidos.
 *            Si se omite, cualquier usuario autenticado puede acceder.
 *   children — componente a renderizar si tiene acceso.
 *
 * Ejemplos de uso en App.jsx:
 *
 *   // Solo administradores y supervisores
 *   <ProtectedRoute roles={['administrador', 'supervisor']}>
 *     <ModuloRemuneraciones />
 *   </ProtectedRoute>
 *
 *   // Cualquier usuario autenticado
 *   <ProtectedRoute>
 *     <Dashboard />
 *   </ProtectedRoute>
 */
export function ProtectedRoute({ children, roles }) {
  const { user, perfil, loading } = useAuth()

  // Mientras carga la sesión: spinner mínimo
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui',
        color: '#64748b',
        gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1.5rem' }}>⏳</span>
        <span>Cargando LimpiApp Pro…</span>
      </div>
    )
  }

  // No autenticado → pantalla de login
  if (!user) return <Login />

  // Autenticado pero sin fila en tabla usuarios
  if (!perfil) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui',
        flexDirection: 'column',
        gap: '1rem',
        color: '#64748b',
      }}>
        <span style={{ fontSize: '2rem' }}>🔐</span>
        <p>Tu cuenta no tiene perfil asignado.<br />Contacta al administrador.</p>
      </div>
    )
  }

  // Perfil inactivo
  if (!perfil.activo) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui',
        flexDirection: 'column',
        gap: '1rem',
        color: '#64748b',
      }}>
        <span style={{ fontSize: '2rem' }}>🚫</span>
        <p>Tu cuenta está desactivada.<br />Contacta al administrador.</p>
      </div>
    )
  }

  // Verificación de rol
  if (roles && !roles.includes(perfil.rol)) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui',
        flexDirection: 'column',
        gap: '1rem',
        color: '#64748b',
      }}>
        <span style={{ fontSize: '2rem' }}>⛔</span>
        <p>No tienes permiso para acceder a esta sección.</p>
        <small style={{ color: '#94a3b8' }}>Rol actual: {perfil.rol}</small>
      </div>
    )
  }

  return children
}


// ─────────────────────────────────────────────────────────────
// src/components/UserMenu.jsx
// Menú de usuario en la barra superior (nombre, rol, logout)
// ─────────────────────────────────────────────────────────────



const ROL_COLORS = {
  administrador: { bg: '#dbeafe', text: '#1d4ed8' },
  supervisor:    { bg: '#dcfce7', text: '#15803d' },
  trabajador:    { bg: '#fef9c3', text: '#a16207' },
  cliente:       { bg: '#f3e8ff', text: '#7c3aed' },
}

const ROL_ICONS = {
  administrador: '👑',
  supervisor:    '🔍',
  trabajador:    '🧹',
  cliente:       '🏢',
}

export function UserMenu() {
  const { perfil, logout, rolLabel } = useAuth()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  if (!perfil) return null

  const colors = ROL_COLORS[perfil.rol] ?? { bg: '#f1f5f9', text: '#475569' }

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    // onAuthStateChange en AuthContext limpia el estado → se muestra Login
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Botón de apertura */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          background: '#f8fafc',
          border: '1.5px solid #e2e8f0',
          borderRadius: '2rem',
          cursor: 'pointer',
          fontFamily: 'system-ui',
          fontSize: '0.85rem',
          color: '#334155',
        }}
      >
        <span>{ROL_ICONS[perfil.rol] ?? '👤'}</span>
        <span style={{ fontWeight: 600 }}>{perfil.nombre.split(' ')[0]}</span>
        <span
          style={{
            background: colors.bg,
            color: colors.text,
            padding: '0.1rem 0.5rem',
            borderRadius: '1rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {rolLabel}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>▼</span>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Overlay para cerrar */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 49,
            }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 0.4rem)',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: '200px',
            zIndex: 50,
            overflow: 'hidden',
          }}>
            {/* Header del dropdown */}
            <div style={{
              padding: '0.75rem 1rem',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                {perfil.nombre}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {perfil.email}
              </div>
            </div>

            {/* Cerrar sesión */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.65rem 1rem',
                background: 'none',
                border: 'none',
                cursor: loggingOut ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem',
                color: '#dc2626',
                fontFamily: 'system-ui',
                textAlign: 'left',
                opacity: loggingOut ? 0.6 : 1,
              }}
            >
              <span>🚪</span>
              <span>{loggingOut ? 'Cerrando…' : 'Cerrar sesión'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────
// INSTRUCCIONES: Integrar en App.jsx
// ─────────────────────────────────────────────────────────────
//
// 1. Importar AuthProvider y envolver la app:
//
//    import { AuthProvider } from './contexts/AuthContext'
//    import { ProtectedRoute } from './components/ProtectedRoute'
//    import { UserMenu } from './components/ProtectedRoute'
//
//    // En el render de App.jsx (o main.jsx):
//    <AuthProvider>
//      <ProtectedRoute>
//        <TuAppActual />
//      </ProtectedRoute>
//    </AuthProvider>
//
// 2. Agregar UserMenu en la barra de navegación superior:
//
//    <header>
//      <h1>LimpiApp Pro</h1>
//      <UserMenu />
//    </header>
//
// 3. Para secciones con restricción de rol, envolver:
//
//    <ProtectedRoute roles={['administrador', 'supervisor']}>
//      <ModuloRemuneraciones />
//    </ProtectedRoute>
//
//    <ProtectedRoute roles={['administrador']}>
//      <GestionUsuarios />
//    </ProtectedRoute>
//
// 4. Dentro de cualquier componente, usar el hook:
//
//    const { puedeEditar, esCliente, perfil } = useAuth()
//
//    // Ocultar botones de edición para clientes/trabajadores:
//    {puedeEditar && <button>Nueva incidencia</button>}
//
// ─────────────────────────────────────────────────────────────
