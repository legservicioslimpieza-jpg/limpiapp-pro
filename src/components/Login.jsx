// src/components/Login.jsx
// LimpiApp Pro — Fase 6: Autenticación
// Pantalla de inicio de sesión

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

// ── Estilos inline (sin dependencia de Tailwind/CSS externo) ──
const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0f4c81 100%)',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    padding: '1rem',
  },
  card: {
    background: 'rgba(255,255,255,0.97)',
    borderRadius: '1rem',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
  },
  logo: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  logoIcon: {
    fontSize: '2.5rem',
    marginBottom: '0.5rem',
    display: 'block',
  },
  logoTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  logoSub: {
    fontSize: '0.78rem',
    color: '#64748b',
    margin: '0.25rem 0 0',
  },
  divider: {
    height: '2px',
    background: 'linear-gradient(90deg, transparent, #0f4c81, transparent)',
    margin: '0 auto 1.75rem',
    width: '60%',
    borderRadius: '2px',
  },
  fieldGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '0.35rem',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '0.65rem 0.85rem',
    border: '1.5px solid #cbd5e1',
    borderRadius: '0.5rem',
    fontSize: '0.95rem',
    color: '#0f172a',
    background: '#f8fafc',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#ef4444',
    background: '#fef2f2',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '0.5rem',
    padding: '0.6rem 0.85rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  btn: {
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #0f4c81, #1e6bb8)',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '1.25rem',
    transition: 'opacity 0.15s, transform 0.1s',
    letterSpacing: '0.3px',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  footer: {
    textAlign: 'center',
    marginTop: '1.5rem',
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  roleChips: {
    display: 'flex',
    gap: '0.4rem',
    justifyContent: 'center',
    marginTop: '0.5rem',
    flexWrap: 'wrap',
  },
  chip: {
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '1rem',
    padding: '0.2rem 0.65rem',
    fontSize: '0.7rem',
    color: '#475569',
    fontWeight: 500,
  },
}

// ── Mensajes de error legibles ────────────────
function parseError(error) {
  if (!error) return null
  const msg = error.message?.toLowerCase() ?? ''
  if (msg.includes('invalid login credentials'))
    return 'Email o contraseña incorrectos.'
  if (msg.includes('email not confirmed'))
    return 'Debes confirmar tu correo electrónico primero.'
  if (msg.includes('too many requests'))
    return 'Demasiados intentos. Espera un momento antes de reintentar.'
  if (msg.includes('network'))
    return 'Error de conexión. Verifica tu internet.'
  return 'Ocurrió un error. Intenta nuevamente.'
}

// ── Componente Login ──────────────────────────
export default function Login() {
  const { login } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [passFocus,  setPassFocus]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) {
      setError('Completa email y contraseña.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { error: authError } = await login(email.trim(), password)
      if (authError) setError(parseError(authError))
      // Si no hay error, el AuthContext onAuthStateChange redirige automáticamente
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo / Marca */}
        <div style={S.logo}>
          <span style={S.logoIcon}>🧹</span>
          <h1 style={S.logoTitle}>LimpiApp Pro</h1>
          <p style={S.logoSub}>LEG Servicios de Limpieza EIRL</p>
        </div>

        <div style={S.divider} />

        {/* Formulario */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={S.fieldGroup}>
            <label style={S.label} htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              placeholder="usuario@legservicios.cl"
              style={{
                ...S.input,
                borderColor: emailFocus ? '#0f4c81' : error ? '#ef4444' : '#cbd5e1',
                boxShadow: emailFocus ? '0 0 0 3px rgba(15,76,129,0.12)' : 'none',
              }}
              disabled={loading}
            />
          </div>

          <div style={S.fieldGroup}>
            <label style={S.label} htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setPassFocus(true)}
              onBlur={() => setPassFocus(false)}
              placeholder="••••••••"
              style={{
                ...S.input,
                borderColor: passFocus ? '#0f4c81' : error ? '#ef4444' : '#cbd5e1',
                boxShadow: passFocus ? '0 0 0 3px rgba(15,76,129,0.12)' : 'none',
              }}
              disabled={loading}
            />
          </div>

          {error && (
            <div style={S.errorBox}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}
            disabled={loading}
          >
            {loading ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Footer */}
        <div style={S.footer}>
          <div>Acceso restringido al personal autorizado</div>
          <div style={S.roleChips}>
            <span style={S.chip}>Administrador</span>
            <span style={S.chip}>Supervisor</span>
            <span style={S.chip}>Trabajador</span>
            <span style={S.chip}>Cliente</span>
          </div>
        </div>
      </div>
    </div>
  )
}
