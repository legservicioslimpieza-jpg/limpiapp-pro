// src/AppRouter.jsx
// LimpiApp Pro — Fase 7
// Enrutador por rol: admin/supervisor → ERP, trabajador → Portal, cliente → próximo Fase 8

import { useAuth } from './contexts/AuthContext'
import PortalTrabajador from './components/PortalTrabajador'
// import PortalCliente from './components/PortalCliente'  // ← Fase 8

// ── Loading pantalla ────────────────────────────
function CargandoApp() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: '1rem',
      fontFamily: 'system-ui', color: '#64748b',
      background: '#f8fafc',
    }}>
      <span style={{ fontSize: '2rem' }}>🧹</span>
      <span style={{ fontWeight: 600, color: '#334155' }}>LimpiApp Pro</span>
      <span style={{ fontSize: '0.85rem' }}>Cargando…</span>
    </div>
  )
}

// ── Sin acceso ──────────────────────────────────
function SinAcceso({ perfil }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: '0.75rem',
      fontFamily: 'system-ui', color: '#64748b',
    }}>
      <span style={{ fontSize: '2rem' }}>⛔</span>
      <p style={{ margin: 0, color: '#334155', fontWeight: 600 }}>Acceso no habilitado</p>
      <p style={{ margin: 0, fontSize: '0.85rem' }}>
        El portal para el rol <strong>{perfil?.rol}</strong> aún no está disponible.
      </p>
      <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
        Contacta al administrador: admin@legservicios.cl
      </p>
    </div>
  )
}

// ── AppRouter ───────────────────────────────────
/**
 * Uso en App.jsx (o main.jsx):
 *
 *   import { AuthProvider } from './contexts/AuthContext'
 *   import AppRouter from './AppRouter'
 *
 *   function App() {
 *     return (
 *       <AuthProvider>
 *         <AppRouter>
 *           <TuERPActual />   ← solo lo ven admin y supervisor
 *         </AppRouter>
 *       </AuthProvider>
 *     )
 *   }
 */
export default function AppRouter({ children }) {
  const { user, perfil, loading } = useAuth()

  // Cargando sesión
  if (loading) return <CargandoApp />

  // No autenticado → children debe incluir <Login /> o se importa aquí
  // Como ProtectedRoute ya envuelve la app, esto raramente ocurre aquí,
  // pero por seguridad:
  if (!user || !perfil) {
    // Importar Login dinámicamente o retornar null (ProtectedRoute lo maneja)
    return null
  }

  // ── Enrutamiento por rol ──────────────────────
  switch (perfil.rol) {

    case 'administrador':
    case 'supervisor':
      // ERP completo — el componente App original
      return children

    case 'trabajador':
      return <PortalTrabajador />

    case 'cliente':
      // return <PortalCliente />  // ← Fase 8
      return <SinAcceso perfil={perfil} />

    default:
      return <SinAcceso perfil={perfil} />
  }
}
