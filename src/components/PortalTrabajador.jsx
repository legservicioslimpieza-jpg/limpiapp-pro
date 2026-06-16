// src/components/PortalTrabajador.jsx
// LimpiApp Pro — Fase 7: Portal Trabajador
// Vista móvil personal para Martha, Samuel, Sebastián y Ana

import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Utilidades ───────────────────────────────────
const clp = (n) =>
  n != null
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
    : '—'

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const fmtHora = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

const MESES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const iniciales = (nombre = '') =>
  nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()

// ── Tokens de estilo compartidos ─────────────────
const T = {
  card: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '0.875rem',
    padding: '1rem 1.1rem',
    marginBottom: '0.75rem',
  },
  label: { fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  value: { fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0.15rem 0 0' },
  tag: (color) => ({
    display: 'inline-block',
    padding: '0.15rem 0.6rem',
    borderRadius: '1rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    ...color,
  }),
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: '1px', background: '#f1f5f9', margin: '0.75rem 0' },
}

const TAG_FIRMADO   = { background: '#dcfce7', color: '#15803d' }
const TAG_PENDIENTE = { background: '#fef9c3', color: '#a16207' }

// ═══════════════════════════════════════════════
// TAB: INICIO
// ═══════════════════════════════════════════════
function TabInicio({ trabajador, contratos, perfil }) {
  const hoy = new Date()
  const mesActual = hoy.getMonth() + 1
  const anioActual = hoy.getFullYear()

  const [resumen, setResumen] = useState(null)

  useEffect(() => {
    async function cargar() {
      // Resumen de asistencia del mes actual
      const { data } = await supabase
        .from('asistencia')
        .select('dias_trabajados, horas_extra, atraso_minutos, es_feriado')
        .eq('trabajador_id', perfil.trabajador_id)
        .gte('fecha', `${anioActual}-${String(mesActual).padStart(2, '0')}-01`)
        .lt('fecha', `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-01`)

      if (data) {
        const dias = data.length
        const extras = data.reduce((s, r) => s + (r.horas_extra ?? 0), 0)
        const atrasos = data.filter(r => (r.atraso_minutos ?? 0) > 0).length
        setResumen({ dias, extras, atrasos })
      }
    }
    if (perfil?.trabajador_id) cargar()
  }, [perfil])

  return (
    <div style={{ padding: '1rem' }}>
      {/* Bienvenida */}
      <div style={{ ...T.card, borderLeft: '4px solid #0f4c81' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>Bienvenido/a,</p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
          {trabajador?.nombre ?? perfil.nombre}
        </p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
          {trabajador?.cargo ?? '—'} · {MESES[mesActual]} {anioActual}
        </p>
      </div>

      {/* Resumen del mes */}
      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
        Resumen este mes
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: 'Días', val: resumen?.dias ?? '—', icon: '📅' },
          { label: 'Hrs extra', val: resumen?.extras != null ? `${resumen.extras}h` : '—', icon: '⏱' },
          { label: 'Atrasos', val: resumen?.atrasos ?? '—', icon: '⚠️' },
        ].map(({ label, val, icon }) => (
          <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.7rem 0.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem' }}>{icon}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginTop: '0.2rem' }}>{val}</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.1rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Mis contratos */}
      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
        Mis contratos
      </p>
      {contratos.length === 0 && (
        <div style={{ ...T.card, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          Sin contratos asignados
        </div>
      )}
      {contratos.map((a) => (
        <div key={a.contrato_id ?? a.id} style={T.card}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
            {a.contratos?.cliente ?? a.contrato_id}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
            {a.contratos?.instalacion ?? ''}
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: LIQUIDACIONES
// ═══════════════════════════════════════════════
function TabLiquidaciones({ trabajadorId, nombreTrabajador }) {
  const [liquidaciones, setLiquidaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [firmando, setFirmando] = useState(null)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('liquidaciones')
        .select('*')
        .eq('trabajador_id', trabajadorId)
        .order('periodo_anio', { ascending: false })
        .order('periodo_mes', { ascending: false })
      setLiquidaciones(data ?? [])
      setLoading(false)
    }
    cargar()
  }, [trabajadorId])

  async function firmar(liq) {
    setFirmando(liq.id)
    const { error } = await supabase
      .from('liquidaciones')
      .update({ firmado_at: new Date().toISOString(), firmado_por: nombreTrabajador })
      .eq('id', liq.id)
    if (!error) {
      setLiquidaciones(prev =>
        prev.map(l => l.id === liq.id
          ? { ...l, firmado_at: new Date().toISOString(), firmado_por: nombreTrabajador }
          : l
        )
      )
    } else {
      alert('Error al firmar: ' + error.message)
    }
    setFirmando(null)
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Cargando liquidaciones…</div>

  if (liquidaciones.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💰</div>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aún no hay liquidaciones registradas.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      {liquidaciones.map((liq) => {
        const firmado = !!liq.firmado_at
        const abierto = expandido === liq.id
        const periodo = `${MESES[liq.periodo_mes] ?? liq.periodo_mes} ${liq.periodo_anio}`

        return (
          <div key={liq.id} style={{ ...T.card, cursor: 'pointer' }}
            onClick={() => setExpandido(abierto ? null : liq.id)}>

            {/* Cabecera */}
            <div style={T.row}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{periodo}</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.15rem' }}>
                  Líquido: <strong style={{ color: '#0f172a' }}>{clp(liq.liquido_pagar)}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <span style={T.tag(firmado ? TAG_FIRMADO : TAG_PENDIENTE)}>
                  {firmado ? '✓ Firmado' : '⏳ Pendiente'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{abierto ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Detalle expandible */}
            {abierto && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={T.divider} />

                {/* Haberes */}
                <p style={{ ...T.label, marginBottom: '0.4rem' }}>Haberes</p>
                {[
                  ['Sueldo base',       liq.sueldo_base],
                  ['Horas extra',       liq.monto_horas_extra],
                  ['Bono asistencia',   liq.bono_asistencia],
                  ['Gratificación',     liq.gratificacion],
                  ['Colación',          liq.colacion],
                  ['Movilización',      liq.movilizacion],
                  ['Total haberes',     liq.total_haberes],
                ].filter(([, v]) => v != null && v !== 0).map(([k, v]) => (
                  <div key={k} style={{ ...T.row, marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>{k}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{clp(v)}</span>
                  </div>
                ))}

                <div style={T.divider} />

                {/* Descuentos */}
                <p style={{ ...T.label, marginBottom: '0.4rem' }}>Descuentos legales</p>
                {[
                  ['AFP',              liq.descuento_afp],
                  ['Salud (7%)',        liq.descuento_salud],
                  ['Cesantía (CES)',    liq.descuento_ces],
                  ['IUSC',             liq.descuento_iusc],
                  ['Otros descuentos', liq.otros_descuentos],
                  ['Total descuentos', liq.total_descuentos],
                ].filter(([, v]) => v != null && v !== 0).map(([k, v]) => (
                  <div key={k} style={{ ...T.row, marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>{k}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>-{clp(v)}</span>
                  </div>
                ))}

                <div style={T.divider} />

                {/* Líquido final */}
                <div style={{ ...T.row, marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>Líquido a pagar</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f4c81' }}>{clp(liq.liquido_pagar)}</span>
                </div>

                {/* Firma / acuse */}
                {firmado ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.6rem', padding: '0.6rem 0.85rem', fontSize: '0.78rem', color: '#15803d' }}>
                    ✅ Recibido conforme el {fmtFecha(liq.firmado_at)} por {liq.firmado_por}
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); firmar(liq) }}
                    disabled={firmando === liq.id}
                    style={{
                      width: '100%', padding: '0.7rem',
                      background: firmando === liq.id ? '#e2e8f0' : '#0f4c81',
                      color: '#fff', border: 'none', borderRadius: '0.6rem',
                      fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                    }}
                  >
                    {firmando === liq.id ? 'Registrando…' : '✅ Confirmar recepción'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: ASISTENCIA
// ═══════════════════════════════════════════════
function TabAsistencia({ trabajadorId }) {
  const hoy = new Date()
  const [mes, setMes]   = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`
      const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`

      const { data } = await supabase
        .from('asistencia')
        .select('*')
        .eq('trabajador_id', trabajadorId)
        .gte('fecha', inicio)
        .lt('fecha', siguiente)
        .order('fecha')

      setRegistros(data ?? [])
      setLoading(false)
    }
    cargar()
  }, [trabajadorId, mes, anio])

  function cambiarMes(delta) {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes < 1)  { nuevoMes = 12; nuevoAnio-- }
    if (nuevoMes > 12) { nuevoMes = 1;  nuevoAnio++ }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const totalDias   = registros.length
  const totalExtras = registros.reduce((s, r) => s + (r.horas_extra ?? 0), 0)
  const totalAtraso = registros.reduce((s, r) => s + (r.atraso_minutos ?? 0), 0)

  return (
    <div style={{ padding: '1rem' }}>
      {/* Selector mes */}
      <div style={{ ...T.row, marginBottom: '1rem' }}>
        <button onClick={() => cambiarMes(-1)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{MESES[mes]} {anio}</span>
        <button onClick={() => cambiarMes(1)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '1rem' }}>›</button>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: 'Días',      val: totalDias,                           color: '#0f4c81' },
          { label: 'Hrs extra', val: `${totalExtras}h`,                   color: '#15803d' },
          { label: 'Atraso',   val: totalAtraso > 0 ? `${totalAtraso}m` : '0', color: totalAtraso > 0 ? '#dc2626' : '#15803d' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.6rem 0.4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.1rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Cargando…</div>}

      {!loading && registros.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '1rem' }}>
          Sin registros para este período.
        </div>
      )}

      {/* Lista de registros */}
      {registros.map((r) => (
        <div key={r.id} style={{ ...T.card, padding: '0.75rem 1rem' }}>
          <div style={T.row}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                {fmtFecha(r.fecha)}
                {r.es_feriado && <span style={{ ...T.tag({ background: '#e0f2fe', color: '#0369a1' }), marginLeft: '0.4rem' }}>Feriado</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                {fmtHora(r.hora_entrada)} → {fmtHora(r.hora_salida)}
                {r.colacion_minutos ? ` · Col ${r.colacion_minutos}min` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {(r.horas_extra ?? 0) > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 700 }}>+{r.horas_extra}h extra</div>
              )}
              {(r.atraso_minutos ?? 0) > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700 }}>{r.atraso_minutos}min atraso</div>
              )}
              {!(r.horas_extra) && !(r.atraso_minutos) && (
                <div style={{ fontSize: '0.78rem', color: '#15803d' }}>✓ Normal</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: HORARIO
// ═══════════════════════════════════════════════
function TabHorario({ trabajadorId }) {
  const [horarios, setHorarios] = useState([])
  const [loading, setLoading] = useState(true)

  const DIAS_MAP = {
    L: 'Lun', M: 'Mar', X: 'Mié', J: 'Jue', V: 'Vie', S: 'Sáb', D: 'Dom'
  }

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('horarios')
        .select('*, contratos(cliente, instalacion)')
        .eq('trabajador_id', trabajadorId)
      setHorarios(data ?? [])
      setLoading(false)
    }
    cargar()
  }, [trabajadorId])

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Cargando horarios…</div>

  if (horarios.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🕐</div>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Sin horarios programados.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      {horarios.map((h) => (
        <div key={h.id} style={T.card}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: '0.3rem' }}>
            {h.contratos?.cliente ?? h.contrato_id}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.6rem' }}>
            {h.contratos?.instalacion ?? ''}
          </div>
          <div style={T.divider} />
          <div style={{ ...T.row, flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.6rem' }}>
            {/* Días de la semana — el campo puede ser string 'LMXJVSD' o array */}
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              {typeof h.dias_semana === 'string'
                ? h.dias_semana.split('').map(d => DIAS_MAP[d] ?? d).join(' · ')
                : Array.isArray(h.dias_semana)
                  ? h.dias_semana.join(' · ')
                  : h.dias_semana
              }
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f4c81' }}>
              {h.hora_entrada} → {h.hora_salida}
              {h.colacion_minutos ? ` (col. ${h.colacion_minutos}min)` : ''}
            </div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={T.tag({ background: '#eff6ff', color: '#1d4ed8' })}>
              {h.turno ?? 'Turno regular'}
            </span>
          </div>
        </div>
      ))}

      <div style={{ ...T.card, background: '#fffbeb', border: '1px solid #fde68a', marginTop: '0.5rem' }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400e' }}>
          📌 Los días feriados se trabajan normalmente según contrato.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// COMPONENTE PRINCIPAL: PortalTrabajador
// ═══════════════════════════════════════════════
const TABS = [
  { id: 'inicio',        icon: '🏠', label: 'Inicio' },
  { id: 'liquidaciones', icon: '💰', label: 'Mis Pagos' },
  { id: 'asistencia',    icon: '📅', label: 'Asistencia' },
  { id: 'horario',       icon: '🕐', label: 'Horario' },
]

// ── Fase 3A.0: Gate de cambio de clave obligatorio ──────────
function ForzarCambioClave({ perfil, logout }) {
  const [p1, setP1]   = useState('')
  const [p2, setP2]   = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (p1.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return }
    if (p1 !== p2)     { setErr('Las contraseñas no coinciden.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 })
      if (error) throw error
      await supabase.rpc('marcar_clave_cambiada')
      window.location.reload()   // recarga: AuthContext recarga perfil (ya sin la bandera)
    } catch (e) {
      setErr(e.message || 'No se pudo cambiar la contraseña. Intente nuevamente.')
      setBusy(false)
    }
  }

  const inp = { width: '100%', padding: '0.7rem 0.8rem', fontSize: '1rem', border: '1px solid #cbd5e1', borderRadius: '0.6rem', boxSizing: 'border-box', marginTop: '0.3rem' }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Segoe UI', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0f4c81 100%)', padding: '1.25rem 1rem', color: '#fff' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>Seguridad de su cuenta</div>
        <div style={{ fontSize: '0.78rem', opacity: 0.8 }}>LEG Servicios de Limpieza</div>
      </header>
      <div style={{ padding: '1.1rem', maxWidth: 460, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.875rem', padding: '1.1rem' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem' }}>Bienvenido(a){perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}</div>
          <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, marginTop: '0.5rem' }}>
            Por seguridad, debe <b>cambiar su contraseña</b> antes de continuar. Esta clave es
            <b> personal e intransferible</b>: nadie de la empresa la conoce ni puede recuperarla por usted.
          </p>
          <div style={{ marginTop: '0.9rem' }}>
            <label style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Nueva contraseña</label>
            <input type="password" style={inp} value={p1} onChange={e => setP1(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          <div style={{ marginTop: '0.7rem' }}>
            <label style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Repetir contraseña</label>
            <input type="password" style={inp} value={p2} onChange={e => setP2(e.target.value)} placeholder="Repita la nueva contraseña" autoComplete="new-password" />
          </div>
          {err && <div style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '0.6rem' }}>{err}</div>}
          <button onClick={submit} disabled={busy}
            style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', fontSize: '0.95rem', fontWeight: 700, color: '#fff', background: busy ? '#94a3b8' : '#0f4c81', border: 'none', borderRadius: '0.6rem', cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Cambiar contraseña y continuar'}
          </button>
          <button onClick={logout} style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem', fontSize: '0.82rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PortalTrabajador() {
  const { perfil, logout } = useAuth()
  const [tab, setTab] = useState('inicio')
  const [trabajador, setTrabajador] = useState(null)
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!perfil?.trabajador_id) { setLoading(false); return }

    async function cargar() {
      const [tw, asig] = await Promise.all([
        supabase
          .from('trabajadores')
          .select('*')
          .eq('id', perfil.trabajador_id)
          .single(),
        supabase
          .from('asignaciones')
          .select('*, contratos(cliente, instalacion)')
          .eq('trabajador_id', perfil.trabajador_id),
      ])
      setTrabajador(tw.data)
      setContratos(asig.data ?? [])
      setLoading(false)
    }
    cargar()
  }, [perfil])

  // Fase 3A.0: registrar primer login (idempotente; la hora la pone el servidor vía now())
  useEffect(() => {
    if (!perfil?.id) return

    ;(async () => {
      try {
        await supabase.rpc('registrar_primer_login')
      } catch (e) {
        console.warn('No se pudo registrar primer login', e)
      }
    })()
  }, [perfil?.id])

  // Fase 3A.0: gate de cambio de clave obligatorio — bloquea el portal hasta cambiarla
  if (perfil?.cambio_clave_obligatorio) {
    return <ForzarCambioClave perfil={perfil} logout={logout} />
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8', fontFamily: 'system-ui' }}>
        Cargando portal…
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      paddingBottom: '68px', // espacio para barra inferior
    }}>

      {/* ── Header ───────────────────────────── */}
      <header style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #0f4c81 100%)',
        padding: '1rem 1rem 1.25rem',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Avatar initials */}
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.9rem', color: '#fff',
              border: '2px solid rgba(255,255,255,0.35)',
            }}>
              {iniciales(perfil.nombre)}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                {(trabajador?.nombre ?? perfil.nombre).split(' ').slice(0, 2).join(' ')}
              </div>
              <div style={{ fontSize: '0.72rem', opacity: 0.75 }}>
                {trabajador?.cargo ?? 'Trabajador'} · LEG Servicios
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '0.5rem', padding: '0.35rem 0.7rem',
              color: '#fff', fontSize: '0.78rem', cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* ── Contenido del tab activo ─────────── */}
      <main>
        {tab === 'inicio'        && <TabInicio trabajador={trabajador} contratos={contratos} perfil={perfil} />}
        {tab === 'liquidaciones' && <TabLiquidaciones trabajadorId={perfil.trabajador_id} nombreTrabajador={trabajador?.nombre ?? perfil.nombre} />}
        {tab === 'asistencia'    && <TabAsistencia trabajadorId={perfil.trabajador_id} />}
        {tab === 'horario'       && <TabHorario trabajadorId={perfil.trabajador_id} />}
      </main>

      {/* ── Barra de navegación inferior ─────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        zIndex: 100,
      }}>
        {TABS.map(({ id, icon, label }) => {
          const activo = tab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1, border: 'none', background: 'none',
                padding: '0.6rem 0.25rem 0.5rem',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '0.15rem',
                borderTop: activo ? '2px solid #0f4c81' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{icon}</span>
              <span style={{
                fontSize: '0.65rem', fontWeight: activo ? 700 : 400,
                color: activo ? '#0f4c81' : '#94a3b8',
              }}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
