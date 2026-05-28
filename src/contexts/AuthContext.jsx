// src/contexts/AuthContext.jsx
// LimpiApp Pro — Fase 6: Autenticación
// Context global de auth: user, perfil, rol, helpers

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

// ─────────────────────────────────────────────
const AuthContext = createContext(null)
// ─────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)   // auth.User de Supabase
  const [perfil,  setPerfil]  = useState(null)   // fila de tabla `usuarios`
  const [loading, setLoading] = useState(true)   // carga inicial

  // ── Inicialización ──────────────────────────
  useEffect(() => {
    // 1. Obtener sesión actual al montar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        cargarPerfil(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // 2. Escuchar cambios (login / logout / refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          cargarPerfil(session.user.id)
        } else {
          setPerfil(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ── Carga perfil desde tabla `usuarios` ─────
  async function cargarPerfil(userId) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setPerfil(data)
    } catch (err) {
      console.error('[AuthContext] Error cargando perfil:', err.message)
      // Usuario en auth pero sin fila en usuarios → logout preventivo
      setPerfil(null)
    } finally {
      setLoading(false)
    }
  }

  // ── Acciones ────────────────────────────────
  const login = async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password })
    return result // { data, error }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    // onAuthStateChange limpia user y perfil automáticamente
  }

  // ── Helpers de rol ──────────────────────────
  const esAdmin      = perfil?.rol === 'administrador'
  const esSupervisor = perfil?.rol === 'supervisor'
  const esTrabajador = perfil?.rol === 'trabajador'
  const esCliente    = perfil?.rol === 'cliente'
  const puedeEditar  = esAdmin || esSupervisor  // puede crear/editar/eliminar
  const puedeVerRem  = esAdmin || esSupervisor  // puede ver remuneraciones

  // ── Labels UI ───────────────────────────────
  const ROL_LABELS = {
    administrador: 'Administrador',
    supervisor:    'Supervisor',
    trabajador:    'Trabajador',
    cliente:       'Cliente',
  }
  const rolLabel = perfil ? (ROL_LABELS[perfil.rol] ?? perfil.rol) : ''

  // ─────────────────────────────────────────────
  return (
    <AuthContext.Provider value={{
      user,
      perfil,
      loading,
      // Acciones
      login,
      logout,
      // Booleanos de rol
      esAdmin,
      esSupervisor,
      esTrabajador,
      esCliente,
      puedeEditar,
      puedeVerRem,
      // Presentación
      rolLabel,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook de consumo ─────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth() debe usarse dentro de <AuthProvider>')
  }
  return ctx
}
