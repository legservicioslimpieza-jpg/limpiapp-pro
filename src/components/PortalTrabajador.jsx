// src/components/PortalTrabajador.jsx
// LimpiApp Pro — Fase 7: Portal Trabajador
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

const clp = (n) => n != null ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n) : '—'
const fmtFecha = (iso) => { if (!iso) return '—'; return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
const fmtHora  = (iso) => { if (!iso) return '—'; return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) }
const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const iniciales = (n='') => n.split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase()
const parsePeriodo = (p) => {
  if(!p) return '—'
  const parts = p.split('-')
  const mes  = parts[0].length === 4 ? parseInt(parts[1]) : parseInt(parts[0])
  const anio = parts[0].length === 4 ? parts[0] : parts[1]
  return `${MESES[mes] ?? p} ${anio}`
}

const T = {
  card: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'0.875rem', padding:'1rem 1.1rem', marginBottom:'0.75rem' },
  label: { fontSize:'0.72rem', color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' },
  row: { display:'flex', justifyContent:'space-between', alignItems:'center' },
  divider: { height:'1px', background:'#f1f5f9', margin:'0.75rem 0' },
  tag: (bg,color) => ({ display:'inline-block', padding:'0.15rem 0.6rem', borderRadius:'1rem', fontSize:'0.72rem', fontWeight:700, background:bg, color:color }),
}

// ═══════════════════════════════════════════════
// TAB INICIO
// ═══════════════════════════════════════════════
function TabInicio({ trabajador, contratos, perfil }) {
  const hoy = new Date()
  const mesActual = hoy.getMonth() + 1
  const anioActual = hoy.getFullYear()
  const [resumen, setResumen] = useState(null)

  useEffect(() => {
    async function cargar() {
      const inicio = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`
      const siguiente = mesActual===12 ? `${anioActual+1}-01-01` : `${anioActual}-${String(mesActual+1).padStart(2,'0')}-01`
      const { data } = await supabase.from('asistencia').select('*').eq('trabajador_id', perfil.trabajador_id)
      if (data) {
        setResumen({
          dias: data.length,
          extras: data.reduce((s,r)=>s+(r.horas_extra||0),0),
          atrasos: data.filter(r=>(r.atraso_minutos||0)>0).length
        })
      }
    }
    if (perfil?.trabajador_id) cargar()
  }, [perfil])

  return (
    <div style={{padding:'1rem'}}>
      <div style={{...T.card, borderLeft:'4px solid #0f4c81'}}>
        <p style={{margin:0,fontSize:'0.82rem',color:'#64748b'}}>Bienvenido/a,</p>
        <p style={{margin:'0.2rem 0 0',fontSize:'1.05rem',fontWeight:700,color:'#0f172a'}}>{trabajador?.nombre ?? perfil.nombre}</p>
        <p style={{margin:'0.2rem 0 0',fontSize:'0.78rem',color:'#64748b'}}>{trabajador?.cargo ?? '—'} · {MESES[mesActual]} {anioActual}</p>
      </div>

      <p style={{...T.label, marginBottom:'0.5rem'}}>Resumen este mes</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.5rem',marginBottom:'1rem'}}>
        {[{icon:'📅',val:resumen?.dias??'—',lbl:'Días'},{icon:'⏱',val:resumen?.extras!=null?`${resumen.extras}h`:'—',lbl:'Hrs extra'},{icon:'⚠️',val:resumen?.atrasos??'—',lbl:'Atrasos'}].map(({icon,val,lbl})=>(
          <div key={lbl} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'0.75rem',padding:'0.7rem 0.5rem',textAlign:'center'}}>
            <div style={{fontSize:'1.2rem'}}>{icon}</div>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'#0f172a',marginTop:'0.2rem'}}>{val}</div>
            <div style={{fontSize:'0.68rem',color:'#94a3b8',marginTop:'0.1rem'}}>{lbl}</div>
          </div>
        ))}
      </div>

      <p style={{...T.label, marginBottom:'0.5rem'}}>Mis contratos</p>
      {contratos.length===0 && <div style={{...T.card,textAlign:'center',color:'#94a3b8',fontSize:'0.85rem'}}>Sin contratos asignados</div>}
      {contratos.map(a=>(
        <div key={a.contrato_id??a.id} style={T.card}>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#0f172a'}}>{a.contratos?.cliente ?? a.contrato_id}</div>
          <div style={{fontSize:'0.78rem',color:'#64748b',marginTop:'0.2rem'}}>{a.contratos?.instalacion??''}</div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB LIQUIDACIONES
// ═══════════════════════════════════════════════
function TabLiquidaciones({ trabajadorId, nombreTrabajador }) {
  const [liquidaciones, setLiquidaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [firmando, setFirmando] = useState(null)
function imprimirLiq(liq) {
  const w = window.open('','_blank')
  w.document.write(`<!DOCTYPE html><html><head><title>Liquidación ${liq.periodo}</title>
  <style>body{font-family:Arial;font-size:13px;padding:20px;max-width:600px;margin:0 auto}
  h2{color:#1e3a8a;margin-bottom:4px}h3{color:#64748b;font-weight:normal;margin:0 0 16px}
  .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9}
  .section{background:#f8fafc;padding:10px 14px;border-radius:8px;margin-bottom:12px}
  .total{font-weight:bold;font-size:15px}.liquido{background:#dbeafe;padding:12px;border-radius:8px;display:flex;justify-content:space-between;font-size:16px;font-weight:bold;color:#1d4ed8}
  @media print{@page{margin:12mm}}</style></head><body>
  <h2>Liquidación de Sueldo</h2>
  <h3>LEG Servicios de Limpieza EIRL · RUT 78.086.977-1</h3>
  <div class="section">
    <div class="row"><span>Trabajador</span><span>${liq.firmado_por??''}</span></div>
    <div class="row"><span>Período</span><span>${parsePeriodo(liq.periodo)}</span></div>
    <div class="row"><span>Días trabajados</span><span>${liq.dias_trabajados}</span></div>
  </div>
  <div class="section">
    <p style="font-weight:bold;color:#15803d;margin:0 0 6px">HABERES</p>
    ${[['Sueldo base',liq.sueldo_base],['Sueldo proporcional',liq.sueldo_proporcional],['Gratificación',liq.gratificacion],['Horas extra',liq.horas_extra_valor],['Bono asistencia',liq.bono_asistencia],['Bono movilización',liq.bono_movilizacion],['Bono colación',liq.bono_colacion]].filter(([,v])=>v!=null&&v!==0).map(([k,v])=>`<div class="row"><span>${k}</span><span>${clp(v)}</span></div>`).join('')}
    <div class="row total"><span>Total haberes</span><span>${clp(liq.total_haberes)}</span></div>
  </div>
  <div class="section">
    <p style="font-weight:bold;color:#dc2626;margin:0 0 6px">DESCUENTOS</p>
    ${[['AFP',liq.cotiz_afp],['Salud (7%)',liq.cotiz_salud],['Cesantía',liq.ces_trabajador],['IUSC',liq.iusc]].filter(([,v])=>v!=null&&v!==0).map(([k,v])=>`<div class="row"><span>${k}</span><span>-${clp(v)}</span></div>`).join('')}
    <div class="row total"><span>Total descuentos</span><span>-${clp(liq.total_descuentos)}</span></div>
  </div>
  <div class="liquido"><span>LÍQUIDO A PAGAR</span><span>${clp(liq.liquido)}</span></div>
  ${liq.firmado_at?`<p style="margin-top:16px;color:#15803d;font-size:12px">✅ Recibido conforme el ${fmtFecha(liq.firmado_at)} por ${liq.firmado_por}</p>`:''}
  </body></html>`)
  w.document.close()
  setTimeout(()=>w.print(),800)
}
  
  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('liquidaciones').select('*').eq('trabajador_id', trabajadorId).order('periodo', { ascending: false })
      setLiquidaciones(data ?? [])
      setLoading(false)
    }
    cargar()
  }, [trabajadorId])

  async function firmar(liq) {
    setFirmando(liq.id)
    const { error } = await supabase.from('liquidaciones').update({ firmado_at: new Date().toISOString(), firmado_por: nombreTrabajador }).eq('id', liq.id)
    if (!error) {
      setLiquidaciones(prev => prev.map(l => l.id===liq.id ? {...l, firmado_at: new Date().toISOString(), firmado_por: nombreTrabajador} : l))
    }
    setFirmando(null)
  }

  if (loading) return <div style={{padding:'2rem',textAlign:'center',color:'#94a3b8'}}>Cargando liquidaciones…</div>
  if (liquidaciones.length===0) return (
    <div style={{padding:'2rem',textAlign:'center'}}>
      <div style={{fontSize:'2rem',marginBottom:'0.5rem'}}>💰</div>
      <p style={{color:'#94a3b8',fontSize:'0.85rem'}}>Aún no hay liquidaciones registradas.</p>
    </div>
  )

  return (
    <div style={{padding:'1rem'}}>
      {liquidaciones.map(liq => {
        const firmado = !!liq.firmado_at
        const abierto = expandido===liq.id
        return (
          <div key={liq.id} style={{...T.card,cursor:'pointer'}} onClick={()=>setExpandido(abierto?null:liq.id)}>
            <div style={T.row}>
              <div>
                <div style={{fontWeight:700,fontSize:'0.95rem',color:'#0f172a'}}>{parsePeriodo(liq.periodo)}</div>
                <div style={{fontSize:'0.82rem',color:'#64748b',marginTop:'0.15rem'}}>Líquido: <strong style={{color:'#0f172a'}}>{clp(liq.liquido)}</strong></div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'0.3rem'}}>
                <span style={T.tag(firmado?'#dcfce7':'#fef9c3', firmado?'#15803d':'#a16207')}>{firmado?'✓ Firmado':'⏳ Pendiente'}</span>
                <span style={{fontSize:'0.75rem',color:'#94a3b8'}}>{abierto?'▲':'▼'}</span>
              </div>
            </div>

            {abierto && (
  <div style={{marginTop:'0.75rem'}}>
    <div style={T.divider}/>

    {/* Botón imprimir */}
    <button onClick={e=>{e.stopPropagation(); imprimirLiq(liq)}}
      style={{width:'100%',padding:'0.5rem',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'0.6rem',fontSize:'0.8rem',fontWeight:600,color:'#475569',cursor:'pointer',marginBottom:'0.75rem'}}>
      🖨 Imprimir liquidación
    </button>

    {/* Haberes */}
    <div style={{background:'#f0fdf4',borderRadius:'0.6rem',padding:'0.6rem 0.75rem',marginBottom:'0.5rem'}}>
      <p style={{...T.label,color:'#15803d',marginBottom:'0.4rem'}}>Haberes</p>
      {[['Sueldo base',liq.sueldo_base],['Sueldo proporcional',liq.sueldo_proporcional],['Gratificación',liq.gratificacion],['Horas extra',liq.horas_extra_valor],['Bono asistencia',liq.bono_asistencia],['Bono movilización',liq.bono_movilizacion],['Bono colación',liq.bono_colacion],['Otros haberes',liq.otros_haberes]].filter(([,v])=>v!=null&&v!==0).map(([k,v])=>(
        <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'0.2rem 0',borderBottom:'1px solid #dcfce7'}}>
          <span style={{fontSize:'0.8rem',color:'#166534'}}>{k}</span>
          <span style={{fontSize:'0.8rem',fontWeight:600,color:'#166534'}}>{clp(v)}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',padding:'0.3rem 0',marginTop:'0.2rem'}}>
        <span style={{fontSize:'0.82rem',fontWeight:700,color:'#15803d'}}>Total haberes</span>
        <span style={{fontSize:'0.82rem',fontWeight:700,color:'#15803d'}}>{clp(liq.total_haberes)}</span>
      </div>
    </div>

    {/* Descuentos */}
    <div style={{background:'#fef2f2',borderRadius:'0.6rem',padding:'0.6rem 0.75rem',marginBottom:'0.5rem'}}>
      <p style={{...T.label,color:'#dc2626',marginBottom:'0.4rem'}}>Descuentos legales</p>
      {[['AFP',liq.cotiz_afp],['Salud (7%)',liq.cotiz_salud],['Cesantía',liq.ces_trabajador],['IUSC',liq.iusc],['Otros',liq.otros_descuentos]].filter(([,v])=>v!=null&&v!==0).map(([k,v])=>(
        <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'0.2rem 0',borderBottom:'1px solid #fecaca'}}>
          <span style={{fontSize:'0.8rem',color:'#991b1b'}}>{k}</span>
          <span style={{fontSize:'0.8rem',fontWeight:600,color:'#991b1b'}}>-{clp(v)}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',padding:'0.3rem 0',marginTop:'0.2rem'}}>
        <span style={{fontSize:'0.82rem',fontWeight:700,color:'#dc2626'}}>Total descuentos</span>
        <span style={{fontSize:'0.82rem',fontWeight:700,color:'#dc2626'}}>-{clp(liq.total_descuentos)}</span>
      </div>
    </div>

    {/* Líquido */}
    <div style={{background:'#eff6ff',borderRadius:'0.6rem',padding:'0.75rem',marginBottom:'0.75rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontWeight:700,color:'#1d4ed8',fontSize:'0.95rem'}}>Líquido a pagar</span>
      <span style={{fontSize:'1.2rem',fontWeight:700,color:'#1d4ed8'}}>{clp(liq.liquido)}</span>
    </div>

    {/* Firma */}
    {firmado ? (
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'0.6rem',padding:'0.6rem 0.85rem',fontSize:'0.78rem',color:'#15803d'}}>
        ✅ Recibido conforme el {fmtFecha(liq.firmado_at)} por {liq.firmado_por}
      </div>
    ) : (
      <button onClick={e=>{e.stopPropagation();firmar(liq)}} disabled={firmando===liq.id}
        style={{width:'100%',padding:'0.7rem',background:firmando===liq.id?'#e2e8f0':'#0f4c81',color:'#fff',border:'none',borderRadius:'0.6rem',fontWeight:700,fontSize:'0.9rem',cursor:'pointer'}}>
        {firmando===liq.id?'Registrando…':'✅ Confirmar recepción'}
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
// TAB ASISTENCIA
// ═══════════════════════════════════════════════
function TabAsistencia({ trabajadorId }) {
  const hoy = new Date()
  const [mes, setMes]   = useState(hoy.getMonth()+1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      const inicio = `${anio}-${String(mes).padStart(2,'0')}-01`
      const siguiente = mes===12 ? `${anio+1}-01-01` : `${anio}-${String(mes+1).padStart(2,'0')}-01`
      const { data } = await supabase.from('asistencia').select('*').eq('trabajador_id', trabajadorId).gte('fecha', inicio).lt('fecha', siguiente).order('fecha')
      setRegistros(data??[])
      setLoading(false)
    }
    cargar()
  }, [trabajadorId, mes, anio])

  function cambiarMes(d) {
    let m=mes+d, a=anio
    if(m<1){m=12;a--} if(m>12){m=1;a++}
    setMes(m); setAnio(a)
  }

  const totalExtras = registros.reduce((s,r)=>s+(r.horas_extra||0),0)
  const totalAtraso = registros.reduce((s,r)=>s+(r.atraso_minutos||0),0)

  return (
    <div style={{padding:'1rem'}}>
      <div style={{...T.row,marginBottom:'1rem'}}>
        <button onClick={()=>cambiarMes(-1)} style={{background:'#f1f5f9',border:'none',borderRadius:'0.5rem',padding:'0.4rem 0.75rem',cursor:'pointer',fontSize:'1rem'}}>‹</button>
        <span style={{fontWeight:700,color:'#0f172a'}}>{MESES[mes]} {anio}</span>
        <button onClick={()=>cambiarMes(1)}  style={{background:'#f1f5f9',border:'none',borderRadius:'0.5rem',padding:'0.4rem 0.75rem',cursor:'pointer',fontSize:'1rem'}}>›</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.5rem',marginBottom:'1rem'}}>
        {[{val:registros.length,lbl:'Días',color:'#0f4c81'},{val:`${totalExtras}h`,lbl:'Extra',color:'#15803d'},{val:totalAtraso>0?`${totalAtraso}m`:'0',lbl:'Atraso',color:totalAtraso>0?'#dc2626':'#15803d'}].map(({val,lbl,color})=>(
          <div key={lbl} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'0.75rem',padding:'0.6rem 0.4rem',textAlign:'center'}}>
            <div style={{fontSize:'1.05rem',fontWeight:700,color}}>{val}</div>
            <div style={{fontSize:'0.68rem',color:'#94a3b8',marginTop:'0.1rem'}}>{lbl}</div>
          </div>
        ))}
      </div>
      {loading && <div style={{textAlign:'center',color:'#94a3b8',fontSize:'0.85rem'}}>Cargando…</div>}
      {!loading && registros.length===0 && <div style={{textAlign:'center',color:'#94a3b8',fontSize:'0.85rem',padding:'1rem'}}>Sin registros para este período.</div>}
      {registros.map(r=>(
        <div key={r.id} style={{...T.card,padding:'0.75rem 1rem'}}>
          <div style={T.row}>
            <div>
              <div style={{fontWeight:700,fontSize:'0.85rem',color:'#0f172a'}}>{fmtFecha(r.fecha)}{r.es_feriado&&<span style={{...T.tag('#e0f2fe','#0369a1'),marginLeft:'0.4rem'}}>Feriado</span>}</div>
              <div style={{fontSize:'0.78rem',color:'#64748b',marginTop:'0.2rem'}}>{r.hora_entrada??'—'} → {r.hora_salida??'—'}</div>
            </div>
            <div style={{textAlign:'right'}}>
              {(r.horas_extra||0)>0 && <div style={{fontSize:'0.78rem',color:'#15803d',fontWeight:700}}>+{r.horas_extra}h extra</div>}
              {(r.atraso_minutos||0)>0 && <div style={{fontSize:'0.78rem',color:'#dc2626',fontWeight:700}}>{r.atraso_minutos}min atraso</div>}
              {!(r.horas_extra)&&!(r.atraso_minutos)&&<div style={{fontSize:'0.78rem',color:'#15803d'}}>✓ Normal</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB HORARIO
// ═══════════════════════════════════════════════
function TabHorario({ trabajadorId }) {
  const [horarios, setHorarios] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('horarios').select('*, contratos(cliente,instalacion)').eq('trabajador_id', trabajadorId)
      setHorarios(data??[])
      setLoading(false)
    }
    cargar()
  }, [trabajadorId])

  if (loading) return <div style={{padding:'2rem',textAlign:'center',color:'#94a3b8'}}>Cargando horarios…</div>
  if (horarios.length===0) return (
    <div style={{padding:'2rem',textAlign:'center'}}>
      <div style={{fontSize:'2rem',marginBottom:'0.5rem'}}>🕐</div>
      <p style={{color:'#94a3b8',fontSize:'0.85rem'}}>Sin horarios programados.</p>
    </div>
  )

  return (
    <div style={{padding:'1rem'}}>
      {horarios.map(h=>(
        <div key={h.id} style={T.card}>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#0f172a',marginBottom:'0.3rem'}}>{h.contratos?.cliente??h.contrato_id}</div>
          <div style={{fontSize:'0.78rem',color:'#64748b',marginBottom:'0.6rem'}}>{h.contratos?.instalacion??''}</div>
          <div style={T.divider}/>
          <div style={{...T.row,flexWrap:'wrap',gap:'0.3rem',marginTop:'0.6rem'}}>
            <div style={{fontSize:'0.78rem',color:'#475569'}}>
              {typeof h.dias_semana==='string' ? h.dias_semana : Array.isArray(h.dias_semana) ? h.dias_semana.join(' · ') : h.dias_semana}
            </div>
            <div style={{fontSize:'0.78rem',fontWeight:700,color:'#0f4c81'}}>{h.hora_entrada} → {h.hora_salida}</div>
          </div>
          <div style={{marginTop:'0.5rem'}}><span style={T.tag('#eff6ff','#1d4ed8')}>{h.turno??'Turno regular'}</span></div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════
// PORTAL PRINCIPAL
// ═══════════════════════════════════════════════
const TABS = [
  {id:'inicio',        icon:'🏠', label:'Inicio'},
  {id:'liquidaciones', icon:'💰', label:'Mis Pagos'},
  {id:'asistencia',    icon:'📅', label:'Asistencia'},
  {id:'horario',       icon:'🕐', label:'Horario'},
]

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
        supabase.from('trabajadores').select('*').eq('id', perfil.trabajador_id).single(),
        supabase.from('asignaciones').select('*, contratos(cliente,instalacion)').eq('trabajador_id', perfil.trabajador_id),
      ])
      setTrabajador(tw.data)
      setContratos(asig.data??[])
      setLoading(false)
    }
    cargar()
  }, [perfil])

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#94a3b8',fontFamily:'system-ui'}}>Cargando portal…</div>

  return (
    <div style={{minHeight:'100vh',background:'#f8fafc',fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:'68px'}}>

      {/* Header */}
      <header style={{background:'linear-gradient(135deg,#0f172a 0%,#0f4c81 100%)',padding:'1rem 1rem 1.25rem',color:'#fff'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.9rem',color:'#fff',border:'2px solid rgba(255,255,255,0.35)'}}>
              {iniciales(perfil.nombre)}
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:'0.95rem'}}>{(trabajador?.nombre??perfil.nombre).split(' ').slice(0,2).join(' ')}</div>
              <div style={{fontSize:'0.72rem',opacity:0.75}}>{trabajador?.cargo??'Trabajador'} · LEG Servicios</div>
            </div>
          </div>
          <button onClick={logout} style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:'0.5rem',padding:'0.35rem 0.7rem',color:'#fff',fontSize:'0.78rem',cursor:'pointer'}}>Salir</button>
        </div>
      </header>

      {/* Contenido */}
      <main>
        {tab==='inicio'        && <TabInicio trabajador={trabajador} contratos={contratos} perfil={perfil}/>}
        {tab==='liquidaciones' && <TabLiquidaciones trabajadorId={perfil.trabajador_id} nombreTrabajador={trabajador?.nombre??perfil.nombre}/>}
        {tab==='asistencia'    && <TabAsistencia trabajadorId={perfil.trabajador_id}/>}
        {tab==='horario'       && <TabHorario trabajadorId={perfil.trabajador_id}/>}
      </main>

      {/* Barra inferior */}
      <nav style={{position:'fixed',bottom:0,paddingBottom:'env(safe-area-inset-bottom)',left:0,right:0,background:'#fff',borderTop:'1px solid #e2e8f0',display:'flex',zIndex:100}}>
        {TABS.map(({id,icon,label})=>{
          const activo=tab===id
          return (
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,border:'none',background:'none',padding:'0.6rem 0.25rem 0.5rem',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.15rem',borderTop:activo?'2px solid #0f4c81':'2px solid transparent'}}>
              <span style={{fontSize:'1.2rem'}}>{icon}</span>
              <span style={{fontSize:'0.65rem',fontWeight:activo?700:400,color:activo?'#0f4c81':'#94a3b8'}}>{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
