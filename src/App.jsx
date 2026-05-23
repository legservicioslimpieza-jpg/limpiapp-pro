import { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "./supabase.js";

/* ─── Paleta ────────────────────────────────────────────────── */
const C = {
  bg:"#0f1117", surface:"#1a1d27", border:"#2a2e42",
  accent:"#3b82f6", accentLight:"#60a5fa",
  green:"#22c55e", yellow:"#eab308", red:"#ef4444", purple:"#a855f7",
  text:"#f0f2f8", textMuted:"#8b92ad", textDim:"#525872",
};
const PCOLOR = { DIARIA:C.green, SEMANAL:C.accent, QUINCENAL:"#06b6d4", MENSUAL:C.purple, TRIMESTRAL:C.yellow, SEMESTRAL:"#f97316", ANUAL:C.red };
const ECOLOR = { Abierta:C.red, "En Proceso":C.yellow, Cerrada:C.green };
const ESTADOS_CONTRATO = ["Vigente","Postulación","Renovación","Inactivo"];

/* ─── Componentes base ──────────────────────────────────────── */
function Badge({ text, color }) {
  return <span style={{ background:color+"22", color, fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:4, letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{text}</span>;
}
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 20px" }}>
      <div style={{ color:C.textMuted, fontSize:11, marginBottom:6, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.8px" }}>{label}</div>
      <div style={{ color:color||C.text, fontSize:28, fontWeight:700, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ color:C.textDim, fontSize:12, marginTop:6 }}>{sub}</div>}
    </div>
  );
}
function SHeader({ title, count }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
      <h2 style={{ color:C.text, fontSize:16, fontWeight:600, margin:0 }}>{title}</h2>
      {count !== undefined && <span style={{ background:C.accent+"22", color:C.accentLight, fontSize:12, padding:"1px 8px", borderRadius:10, fontWeight:600 }}>{count}</span>}
    </div>
  );
}
function DataTable({ cols, rows, empty="Sin registros" }) {
  if (!rows.length) return <div style={{ textAlign:"center", color:C.textDim, padding:"40px 0", fontSize:14 }}>{empty}</div>;
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead><tr>{cols.map(c=><th key={c.key} style={{ color:C.textMuted, fontWeight:500, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px", padding:"8px 12px", textAlign:"left", borderBottom:`1px solid ${C.border}` }}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r,i)=><tr key={i} style={{ borderBottom:`1px solid ${C.border}22` }}>{cols.map(c=><td key={c.key} style={{ padding:"10px 12px", color:C.text, verticalAlign:"middle" }}>{c.render?c.render(r):r[c.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
function Card({ children, accent }) {
  return <div style={{ background:C.surface, border:`1px solid ${accent?accent+"55":C.border}`, borderRadius:12, padding:20, marginBottom:16 }}>{children}</div>;
}
function FL({ label, children }) {
  return <div><label style={{ color:C.textMuted, fontSize:12, display:"block", marginBottom:4 }}>{label}</label>{children}</div>;
}
const INP = { width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", color:C.text, fontSize:13, boxSizing:"border-box" };
function Btn({ onClick, color=C.accent, children, disabled, small }) {
  return <button onClick={onClick} disabled={disabled} style={{ background:disabled?C.border:color, color:"#fff", border:"none", borderRadius:8, padding:small?"5px 12px":"8px 18px", fontSize:small?12:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer" }}>{children}</button>;
}
function BtnOut({ onClick, children }) {
  return <button onClick={onClick} style={{ background:"transparent", color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 16px", fontSize:13, cursor:"pointer" }}>{children}</button>;
}
function Spinner() {
  return <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:16 }}>
    <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <span style={{ color:C.textMuted, fontSize:14 }}>Conectando con Supabase…</span>
  </div>;
}
function DemoBanner() {
  return <div style={{ background:C.yellow+"18", border:`1px solid ${C.yellow}44`, borderRadius:10, padding:"12px 18px", marginBottom:20, display:"flex", gap:12 }}>
    <span>⚠️</span>
    <div><div style={{ color:C.yellow, fontWeight:600, fontSize:13 }}>Modo demo — datos no guardados</div>
    <div style={{ color:C.textMuted, fontSize:12, marginTop:2 }}>Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel para guardar datos reales.</div></div>
  </div>;
}

/* ─── Hook de datos ─────────────────────────────────────────── */
const TABLES = ["trabajadores","contratos","dependencias","checklist","evidencias","incidencias","supervisiones"];
function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbMode, setDbMode] = useState(false);

  const loadAll = useCallback(async () => {
    if (!isConfigured) { setData({}); setLoading(false); return; }
    setLoading(true);
    try {
      const results = await Promise.all(TABLES.map(t => supabase.from(t).select("*").order("id")));
      const loaded = {};
      TABLES.forEach((t, i) => { loaded[t] = results[i].data || []; });
      setData(loaded);
      setDbMode(true);
    } catch { setData({}); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const save = useCallback(async (table, record, isUpdate=false) => {
    if (isConfigured && dbMode) {
      const { error } = isUpdate
        ? await supabase.from(table).update(record).eq("id", record.id)
        : await supabase.from(table).insert(record);
      if (error) { alert("Error: " + error.message); return false; }
      await loadAll();
      return true;
    }
    return false;
  }, [dbMode, loadAll]);

  const remove = useCallback(async (table, id) => {
    if (isConfigured && dbMode) {
      await supabase.from(table).delete().eq("id", id);
      await loadAll();
    }
  }, [dbMode, loadAll]);

  const insert = (table, record) => save(table, record, false);
  const update = (table, record) => save(table, record, true);
  return { data, loading, dbMode, insert, update, remove, reload: loadAll };
}

function genId(prefix, list=[]) {
  const n = (list?.length||0) + 1;
  return `${prefix}${String(n).padStart(3,"0")}`;
}

/* ─── Selector de contrato ──────────────────────────────────── */
function ContractSelector({ contratos, selected, onSelect }) {
  const activos = contratos.filter(c => c.activo);
  const col = { Vigente:C.green, Postulación:C.yellow, Renovación:C.purple, Inactivo:C.textDim };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ color:C.textMuted, fontSize:12, whiteSpace:"nowrap" }}>Contrato activo:</span>
      <select value={selected||""} onChange={e=>onSelect(e.target.value)}
        style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", color:C.text, fontSize:13, cursor:"pointer", maxWidth:220 }}>
        <option value="">— Todos —</option>
        {contratos.map(c=><option key={c.id} value={c.id}>{c.cliente} ({c.estado})</option>)}
      </select>
      {selected && (() => { const ct = contratos.find(c=>c.id===selected); return ct ? <Badge text={ct.estado} color={col[ct.estado]||C.textMuted} /> : null; })()}
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────── */
function Dashboard({ data, contratoId }) {
  const hoy = new Date().toISOString().slice(0,10);
  const chks = contratoId ? data.checklist.filter(c=>c.contrato_id===contratoId&&c.activa) : data.checklist.filter(c=>c.activa);
  const evHoy = contratoId
    ? data.evidencias.filter(e=>e.contrato_id===contratoId&&e.fecha_hora?.startsWith(hoy))
    : data.evidencias.filter(e=>e.fecha_hora?.startsWith(hoy));
  const incs = contratoId ? data.incidencias.filter(i=>i.contrato_id===contratoId) : data.incidencias;
  const incAb = incs.filter(i=>i.estado==="Abierta").length;
  const sups = contratoId ? data.supervisiones.filter(s=>s.contrato_id===contratoId) : data.supervisiones;
  const cumPr = sups.length ? Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length) : 0;
  const xPer = chks.reduce((a,c)=>({...a,[c.periodicidad]:(a[c.periodicidad]||0)+1}),{});
  const ct = contratoId ? data.contratos.find(c=>c.id===contratoId) : null;

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ color:C.text, fontSize:20, fontWeight:700, margin:"0 0 4px" }}>Dashboard operacional</h1>
        <p style={{ color:C.textMuted, margin:0, fontSize:13 }}>
          {ct ? `${ct.cliente} — ${ct.instalacion}` : `${data.contratos.filter(c=>c.activo).length} contratos vigentes · LEG Servicios de Limpieza`}
        </p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
        <StatCard label="Cumplimiento" value={`${cumPr}%`} sub="Supervisiones" color={cumPr>=90?C.green:cumPr>=70?C.yellow:C.red} />
        <StatCard label="Tareas hoy" value={`${evHoy.length}/${chks.filter(c=>c.periodicidad==="DIARIA").length}`} sub="registradas" color={C.accentLight} />
        <StatCard label="Incidencias" value={incAb} sub="abiertas" color={incAb>0?C.red:C.green} />
        <StatCard label="Contratos" value={data.contratos.filter(c=>c.activo&&c.estado==="Vigente").length} sub="vigentes" />
        <StatCard label="Trabajadores" value={data.trabajadores.filter(t=>t.activo).length} sub="activos" />
        <StatCard label="Dependencias" value={contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId&&d.activo).length:data.dependencias.filter(d=>d.activo).length} sub="en control" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <Card>
          <SHeader title="Tareas por periodicidad" />
          {Object.keys(PCOLOR).filter(p=>xPer[p]).map(p=>(
            <div key={p} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <div style={{ flex:1, background:C.border, borderRadius:4, height:7, overflow:"hidden" }}>
                <div style={{ width:`${(xPer[p]/chks.length)*100}%`, height:"100%", background:PCOLOR[p], borderRadius:4 }} />
              </div>
              <Badge text={p} color={PCOLOR[p]} />
              <span style={{ color:C.textMuted, fontSize:13, minWidth:20, textAlign:"right" }}>{xPer[p]}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SHeader title="Incidencias recientes" />
          {incs.slice(-4).reverse().map(inc=>{
            const dep=data.dependencias.find(d=>d.id===inc.dep_id);
            const ctt=data.contratos.find(c=>c.id===inc.contrato_id);
            return <div key={inc.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${C.border}22` }}>
              <div>
                <div style={{ color:C.text, fontSize:13, fontWeight:500 }}>{inc.tipo}</div>
                <div style={{ color:C.textDim, fontSize:11 }}>{ctt?.cliente} · {dep?.nombre}</div>
              </div>
              <Badge text={inc.estado} color={ECOLOR[inc.estado]} />
            </div>;
          })}
          {!incs.length && <p style={{ color:C.textDim, fontSize:13 }}>Sin incidencias</p>}
        </Card>
      </div>
      <Card>
        <SHeader title="Últimas evidencias" />
        <DataTable
          cols={[
            { key:"tarea",      label:"Tarea",       render:r=>{ const c=data.checklist.find(ch=>ch.id===r.checklist_id); return c?.tarea||"—"; } },
            { key:"contrato",   label:"Contrato",    render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
            { key:"trabajador", label:"Trabajador",  render:r=>{ const t=data.trabajadores.find(w=>w.id===r.trabajador_id); return t?.nombre.split(" ").slice(0,2).join(" ")||"—"; } },
            { key:"hora",       label:"Hora",        render:r=><span style={{ color:C.textMuted }}>{r.fecha_hora?.split("T")[1]?.slice(0,5)||"—"}</span> },
            { key:"estado",     label:"Estado",      render:r=><Badge text={r.cumplido?"Cumplido":"Pendiente"} color={r.cumplido?C.green:C.red} /> },
          ]}
          rows={[...evHoy].reverse().slice(0,6)}
        />
      </Card>
    </div>
  );
}

/* ─── Contratos ─────────────────────────────────────────────── */
function Contratos({ data, insert, update, remove }) {
  const [form, setForm] = useState(null);
  const isNew = form && !data.contratos.find(c=>c.id===form.id);
  const colE = { Vigente:C.green, Postulación:C.yellow, Renovación:C.purple, Inactivo:C.textDim };

  const openNew = () => setForm({ id:genId("CT",data.contratos), cliente:"", instalacion:"", direccion:"", supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor")?.id||"", estado:"Vigente", activo:true });
  const save = async () => {
    if (!form.cliente.trim()) return;
    const ok = isNew ? await insert("contratos",form) : await update("contratos",form);
    if (ok) setForm(null);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <SHeader title="Contratos" count={data.contratos.length} />
        <Btn onClick={openNew}>+ Nuevo contrato</Btn>
      </div>
      {form && (
        <Card accent={C.accent}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <FL label="Cliente / Institución"><input style={INP} value={form.cliente} onChange={e=>setForm({...form,cliente:e.target.value})} placeholder="Ej: Seremi de Transportes" /></FL>
            <FL label="Instalación"><input style={INP} value={form.instalacion} onChange={e=>setForm({...form,instalacion:e.target.value})} placeholder="Ej: Sucursal Arica" /></FL>
            <FL label="Dirección"><input style={INP} value={form.direccion} onChange={e=>setForm({...form,direccion:e.target.value})} placeholder="Ej: Chacabuco Nº901" /></FL>
            <FL label="Estado">
              <select style={INP} value={form.estado} onChange={e=>setForm({...form,estado:e.target.value,activo:e.target.value==="Vigente"||e.target.value==="Renovación"})}>
                {ESTADOS_CONTRATO.map(s=><option key={s}>{s}</option>)}
              </select>
            </FL>
            <FL label="Supervisor">
              <select style={INP} value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}>
                <option value="">— Sin asignar —</option>
                {data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            <FL label="Licitación ID (opcional)"><input style={INP} value={form.licitacion_id||""} onChange={e=>setForm({...form,licitacion_id:e.target.value})} placeholder="Ej: 892200-1-LE26" /></FL>
          </div>
          <div style={{ display:"flex", gap:8 }}><Btn onClick={save} color={C.green}>Guardar</Btn><BtnOut onClick={()=>setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key:"id",         label:"ID",          render:r=><span style={{ fontFamily:"monospace", color:C.textDim, fontSize:11 }}>{r.id}</span> },
          { key:"cliente",    label:"Cliente" },
          { key:"instalacion",label:"Instalación", render:r=><span style={{ color:C.textMuted }}>{r.instalacion}</span> },
          { key:"direccion",  label:"Dirección",   render:r=><span style={{ color:C.textMuted }}>{r.direccion}</span> },
          { key:"estado",     label:"Estado",      render:r=><Badge text={r.estado} color={colE[r.estado]||C.textMuted} /> },
          { key:"deps",       label:"Deps",        render:r=><span style={{ color:C.textMuted }}>{data.dependencias.filter(d=>d.contrato_id===r.id).length}</span> },
          { key:"tareas",     label:"Tareas",      render:r=><span style={{ color:C.textMuted }}>{data.checklist.filter(c=>c.contrato_id===r.id).length}</span> },
          { key:"edit",       label:"",            render:r=><button onClick={()=>setForm({...r})} style={{ background:"transparent", color:C.textDim, border:"none", cursor:"pointer", fontSize:12 }}>Editar</button> },
        ]}
        rows={data.contratos}
      />
    </div>
  );
}

/* ─── Dependencias ──────────────────────────────────────────── */
function Dependencias({ data, contratoId, insert, update }) {
  const [form, setForm] = useState(null);
  const [filtroC, setFiltroC] = useState(contratoId||"");
  useEffect(()=>{ if(contratoId) setFiltroC(contratoId); },[contratoId]);

  const rows = filtroC ? data.dependencias.filter(d=>d.contrato_id===filtroC) : data.dependencias;
  const isNew = form && !data.dependencias.find(d=>d.id===form.id);

  const openNew = () => {
    const ctId = filtroC || data.contratos[0]?.id || "";
    const n = data.dependencias.filter(d=>d.contrato_id===ctId).length + 1;
    setForm({ id:`DEP-${ctId}-${String(n).padStart(2,"0")}`, contrato_id:ctId, nombre:"", qr:"", activo:true });
  };
  const save = async () => {
    if (!form.nombre.trim()) return;
    const qr = form.qr || `QR-${form.id}`;
    const ok = isNew ? await insert("dependencias",{...form,qr}) : await update("dependencias",form);
    if (ok) setForm(null);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <SHeader title="Dependencias" count={rows.length} />
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={filtroC} onChange={e=>setFiltroC(e.target.value)}
            style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", color:C.text, fontSize:12, cursor:"pointer" }}>
            <option value="">Todos los contratos</option>
            {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
          <Btn onClick={openNew}>+ Nueva</Btn>
        </div>
      </div>
      {form && (
        <Card accent={C.purple}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <FL label="Contrato">
              <select style={INP} value={form.contrato_id} onChange={e=>setForm({...form,contrato_id:e.target.value})}>
                {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Nombre del área"><input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Baños Piso 1" /></FL>
          </div>
          <div style={{ display:"flex", gap:8 }}><Btn onClick={save} color={C.purple}>Guardar</Btn><BtnOut onClick={()=>setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key:"id",         label:"ID",       render:r=><span style={{ fontFamily:"monospace", color:C.textDim, fontSize:11 }}>{r.id}</span> },
          { key:"contrato",   label:"Contrato", render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
          { key:"nombre",     label:"Área / Dependencia" },
          { key:"tareas",     label:"Tareas",   render:r=><span style={{ color:C.textMuted }}>{data.checklist.filter(c=>c.dep_id===r.id).length}</span> },
          { key:"activo",     label:"Estado",   render:r=><Badge text={r.activo?"Activa":"Inactiva"} color={r.activo?C.green:C.textDim} /> },
          { key:"edit",       label:"",         render:r=><button onClick={()=>setForm({...r})} style={{ background:"transparent", color:C.textDim, border:"none", cursor:"pointer", fontSize:12 }}>Editar</button> },
        ]}
        rows={rows}
      />
    </div>
  );
}

/* ─── Trabajadores ──────────────────────────────────────────── */
function Trabajadores({ data, insert, update }) {
  const [form, setForm] = useState(null);
  const isNew = form && !data.trabajadores.find(t=>t.id===form.id);
  const save = async () => {
    if (!form.nombre.trim()) return;
    const ok = isNew ? await insert("trabajadores",form) : await update("trabajadores",form);
    if (ok) setForm(null);
  };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <SHeader title="Trabajadores" count={data.trabajadores.length} />
        <Btn onClick={()=>setForm({ id:genId("TR",data.trabajadores), nombre:"", cargo:"Auxiliar Aseo", telefono:"", email:"", activo:true })}>+ Nuevo</Btn>
      </div>
      {form && (
        <Card accent={C.accent}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <FL label="Nombre completo"><input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre Apellido Apellido" /></FL>
            <FL label="Cargo"><select style={INP} value={form.cargo} onChange={e=>setForm({...form,cargo:e.target.value})}><option>Auxiliar Aseo</option><option>Supervisor</option><option>Jefe de Turno</option></select></FL>
            <FL label="Teléfono"><input style={INP} value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} placeholder="+569XXXXXXXX" /></FL>
            <FL label="Email"><input style={INP} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="correo@empresa.cl" /></FL>
          </div>
          <div style={{ display:"flex", gap:8 }}><Btn onClick={save} color={C.green}>Guardar</Btn><BtnOut onClick={()=>setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key:"id",       label:"ID",       render:r=><span style={{ fontFamily:"monospace", color:C.textDim, fontSize:11 }}>{r.id}</span> },
          { key:"nombre",   label:"Nombre" },
          { key:"cargo",    label:"Cargo",    render:r=><Badge text={r.cargo} color={r.cargo==="Supervisor"||r.cargo==="Supervisora"?C.purple:C.accent} /> },
          { key:"telefono", label:"Teléfono", render:r=><span style={{ color:C.textMuted }}>{r.telefono||"—"}</span> },
          { key:"email",    label:"Email",    render:r=><span style={{ color:C.textMuted }}>{r.email||"—"}</span> },
          { key:"activo",   label:"Estado",   render:r=><Badge text={r.activo?"Activo":"Inactivo"} color={r.activo?C.green:C.red} /> },
          { key:"edit",     label:"",         render:r=><button onClick={()=>setForm({...r})} style={{ background:"transparent", color:C.textDim, border:"none", cursor:"pointer", fontSize:12 }}>Editar</button> },
        ]}
        rows={data.trabajadores}
      />
    </div>
  );
}

/* ─── Checklist ─────────────────────────────────────────────── */
function Checklist({ data, contratoId, insert }) {
  const [filtro, setFiltro] = useState("TODAS");
  const [form, setForm] = useState(null);
  const hoy = new Date().toISOString().slice(0,10);

  const chks = contratoId
    ? data.checklist.filter(c=>c.contrato_id===contratoId)
    : data.checklist;
  const rows = filtro==="TODAS" ? chks : chks.filter(c=>c.periodicidad===filtro);

  const marcar = async (chkId, contratoId) => {
    await insert("evidencias", {
      id: `EV${Date.now()}`,
      checklist_id: chkId,
      trabajador_id: data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora")?.id||data.trabajadores[0]?.id,
      contrato_id: contratoId,
      fecha_hora: new Date().toISOString(),
      observacion: "",
      cumplido: true,
    });
  };

  const openNew = () => {
    const depsFiltradas = contratoId ? data.dependencias.filter(d=>d.contrato_id===contratoId) : data.dependencias;
    setForm({ id:`CHK${Date.now()}`, dep_id:depsFiltradas[0]?.id||"", contrato_id:contratoId||data.contratos[0]?.id||"", tarea:"", periodicidad:"DIARIA", obligatoria:true, activa:true });
  };

  const save = async () => {
    if (!form.tarea.trim()) return;
    const ok = await insert("checklist", form);
    if (ok) setForm(null);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <SHeader title="Checklist" count={chks.length} />
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {["TODAS","DIARIA","SEMANAL","QUINCENAL","MENSUAL","TRIMESTRAL"].map(p=>(
            <button key={p} onClick={()=>setFiltro(p)} style={{ background:filtro===p?(PCOLOR[p]||C.accent):"transparent", color:filtro===p?"#fff":C.textMuted, border:`1px solid ${filtro===p?"transparent":C.border}`, borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", fontWeight:500 }}>{p}</button>
          ))}
          <Btn onClick={openNew} small>+ Tarea</Btn>
        </div>
      </div>
      {form && (
        <Card accent={C.green}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <FL label="Contrato">
              <select style={INP} value={form.contrato_id} onChange={e=>{
                const deps=data.dependencias.filter(d=>d.contrato_id===e.target.value);
                setForm({...form,contrato_id:e.target.value,dep_id:deps[0]?.id||""});
              }}>
                {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Dependencia / Área">
              <select style={INP} value={form.dep_id} onChange={e=>setForm({...form,dep_id:e.target.value})}>
                {data.dependencias.filter(d=>d.contrato_id===form.contrato_id).map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </FL>
            <div style={{ gridColumn:"1/-1" }}>
              <FL label="Descripción de la tarea"><input style={INP} value={form.tarea} onChange={e=>setForm({...form,tarea:e.target.value})} placeholder="Ej: Limpieza y desinfección de baños" /></FL>
            </div>
            <FL label="Periodicidad">
              <select style={INP} value={form.periodicidad} onChange={e=>setForm({...form,periodicidad:e.target.value})}>
                {Object.keys(PCOLOR).map(p=><option key={p}>{p}</option>)}
              </select>
            </FL>
          </div>
          <div style={{ display:"flex", gap:8 }}><Btn onClick={save} color={C.green}>Guardar tarea</Btn><BtnOut onClick={()=>setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key:"tarea",    label:"Tarea" },
          { key:"contrato", label:"Contrato", render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted, fontSize:12 }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
          { key:"dep",      label:"Área",     render:r=>{ const d=data.dependencias.find(dep=>dep.id===r.dep_id); return <span style={{ color:C.textMuted }}>{d?.nombre||"—"}</span>; } },
          { key:"per",      label:"Frecuencia", render:r=><Badge text={r.periodicidad} color={PCOLOR[r.periodicidad]||C.textMuted} /> },
          { key:"ev",       label:"Hoy",      render:r=>{
            const n=data.evidencias.filter(e=>e.checklist_id===r.id&&e.fecha_hora?.startsWith(hoy)).length;
            return r.periodicidad==="DIARIA"
              ? (n>0 ? <span style={{ color:C.green, fontWeight:700 }}>✓ {n}</span>
                     : <button onClick={()=>marcar(r.id,r.contrato_id)} style={{ background:C.green+"22", color:C.green, border:`1px solid ${C.green}44`, borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer", fontWeight:600 }}>Marcar ✓</button>)
              : <span style={{ color:C.textDim, fontSize:12 }}>—</span>;
          }},
        ]}
        rows={rows}
        empty="Sin tareas para este filtro"
      />
    </div>
  );
}

/* ─── Incidencias ───────────────────────────────────────────── */
const TIPOS = ["Falta Insumos","Daño infraestructura","Accidente laboral","Limpieza deficiente","Otro"];
function Incidencias({ data, contratoId, insert, update }) {
  const [form, setForm] = useState(null);
  const incs = contratoId ? data.incidencias.filter(i=>i.contrato_id===contratoId) : data.incidencias;
  const abiertas = incs.filter(i=>i.estado==="Abierta").length;

  const openNew = () => {
    const deps = contratoId ? data.dependencias.filter(d=>d.contrato_id===contratoId) : data.dependencias;
    setForm({ id:`IN${Date.now()}`, contrato_id:contratoId||data.contratos.find(c=>c.activo)?.id||"", dep_id:deps[0]?.id||"", fecha_hora:new Date().toISOString(), tipo:"Falta Insumos", descripcion:"", estado:"Abierta", trabajador_id:data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora")?.id||data.trabajadores[0]?.id||"" });
  };

  const save = async () => {
    if (!form.descripcion.trim()) return;
    const ok = await insert("incidencias", form);
    if (ok) setForm(null);
  };

  const cambiarEstado = async (inc, estado) => { await update("incidencias",{...inc,estado}); };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <SHeader title="Incidencias" count={incs.length} />
          {abiertas>0&&<Badge text={`${abiertas} abiertas`} color={C.red} />}
        </div>
        <Btn onClick={openNew} color={C.red}>+ Reportar</Btn>
      </div>
      {form && (
        <Card accent={C.red}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <FL label="Contrato">
              <select style={INP} value={form.contrato_id} onChange={e=>{
                const deps=data.dependencias.filter(d=>d.contrato_id===e.target.value);
                setForm({...form,contrato_id:e.target.value,dep_id:deps[0]?.id||""});
              }}>
                {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Dependencia">
              <select style={INP} value={form.dep_id} onChange={e=>setForm({...form,dep_id:e.target.value})}>
                {data.dependencias.filter(d=>d.contrato_id===form.contrato_id).map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </FL>
            <FL label="Tipo"><select style={INP} value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></FL>
            <FL label="Trabajador que reporta">
              <select style={INP} value={form.trabajador_id} onChange={e=>setForm({...form,trabajador_id:e.target.value})}>
                {data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            <div style={{ gridColumn:"1/-1" }}><FL label="Descripción"><textarea rows={3} style={{ ...INP,resize:"vertical" }} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Describe la incidencia…" /></FL></div>
          </div>
          <div style={{ display:"flex", gap:8 }}><Btn onClick={save} color={C.red}>Registrar</Btn><BtnOut onClick={()=>setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key:"tipo",    label:"Tipo" },
          { key:"contrato",label:"Contrato", render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted, fontSize:12 }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
          { key:"dep",     label:"Área",    render:r=>{ const d=data.dependencias.find(dep=>dep.id===r.dep_id); return <span style={{ color:C.textMuted }}>{d?.nombre}</span>; } },
          { key:"desc",    label:"Descripción", render:r=><span style={{ color:C.textMuted }}>{r.descripcion||"—"}</span> },
          { key:"fecha",   label:"Fecha",   render:r=><span style={{ color:C.textDim, fontSize:12 }}>{r.fecha_hora?.replace("T"," ").slice(0,16)}</span> },
          { key:"estado",  label:"Estado",  render:r=>(
            <select value={r.estado} onChange={e=>cambiarEstado(r,e.target.value)}
              style={{ background:ECOLOR[r.estado]+"22", color:ECOLOR[r.estado], border:`1px solid ${ECOLOR[r.estado]}44`, borderRadius:6, padding:"3px 8px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {["Abierta","En Proceso","Cerrada"].map(s=><option key={s}>{s}</option>)}
            </select>
          )},
        ]}
        rows={incs}
      />
    </div>
  );
}

/* ─── Supervisiones ─────────────────────────────────────────── */
function Supervisiones({ data, contratoId, insert }) {
  const [form, setForm] = useState(null);
  const sups = contratoId ? data.supervisiones.filter(s=>s.contrato_id===contratoId) : data.supervisiones;

  const openNew = () => setForm({ id:`SV${Date.now()}`, contrato_id:contratoId||data.contratos.find(c=>c.activo)?.id||"", supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||data.trabajadores[0]?.id||"", fecha:new Date().toISOString().slice(0,10), cumplimiento:90, observacion:"" });
  const save = async () => { const ok = await insert("supervisiones",form); if(ok) setForm(null); };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <SHeader title="Supervisiones" count={sups.length} />
        <Btn onClick={openNew} color={C.purple}>+ Nueva</Btn>
      </div>
      {form && (
        <Card accent={C.purple}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <FL label="Contrato">
              <select style={INP} value={form.contrato_id} onChange={e=>setForm({...form,contrato_id:e.target.value})}>
                {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Fecha"><input type="date" style={INP} value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})} /></FL>
            <FL label={`Cumplimiento: ${form.cumplimiento}%`}>
              <input type="range" min={0} max={100} value={form.cumplimiento} onChange={e=>setForm({...form,cumplimiento:Number(e.target.value)})} style={{ width:"100%", accentColor:C.purple }} />
            </FL>
            <FL label="Supervisor">
              <select style={INP} value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}>
                {data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            <div style={{ gridColumn:"1/-1" }}><FL label="Observaciones"><textarea rows={3} style={{ ...INP,resize:"vertical" }} value={form.observacion} onChange={e=>setForm({...form,observacion:e.target.value})} placeholder="Novedades de la supervisión…" /></FL></div>
          </div>
          <div style={{ display:"flex", gap:8 }}><Btn onClick={save} color={C.purple}>Guardar</Btn><BtnOut onClick={()=>setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key:"fecha",      label:"Fecha",        render:r=><span style={{ color:C.textMuted }}>{r.fecha}</span> },
          { key:"contrato",   label:"Contrato",     render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted, fontSize:12 }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
          { key:"supervisor", label:"Supervisor",   render:r=>{ const s=data.trabajadores.find(t=>t.id===r.supervisor_id); return s?.nombre.split(" ").slice(0,2).join(" ")||"—"; } },
          { key:"cum",        label:"Cumplimiento", render:r=>(
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:70, background:C.border, borderRadius:4, height:6 }}>
                <div style={{ width:`${r.cumplimiento}%`, height:"100%", borderRadius:4, background:r.cumplimiento>=90?C.green:r.cumplimiento>=70?C.yellow:C.red }} />
              </div>
              <span style={{ fontWeight:700, color:r.cumplimiento>=90?C.green:r.cumplimiento>=70?C.yellow:C.red }}>{r.cumplimiento}%</span>
            </div>
          )},
          { key:"obs", label:"Observación", render:r=><span style={{ color:C.textMuted }}>{r.observacion||"—"}</span> },
        ]}
        rows={sups}
      />
    </div>
  );
}

/* ─── Informes IA ───────────────────────────────────────────── */
function InformesIA({ data, contratoId }) {
  const [tipo, setTipo] = useState("operacional");
  const [informe, setInforme] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ct = contratoId ? data.contratos.find(c=>c.id===contratoId) : null;
  const hoy = new Date().toISOString().slice(0,10);
  const chks = ct ? data.checklist.filter(c=>c.contrato_id===ct.id) : data.checklist;
  const evHoy = ct ? data.evidencias.filter(e=>e.contrato_id===ct.id&&e.fecha_hora?.startsWith(hoy)) : data.evidencias.filter(e=>e.fecha_hora?.startsWith(hoy));
  const sups = ct ? data.supervisiones.filter(s=>s.contrato_id===ct.id) : data.supervisiones;
  const cumPr = sups.length ? Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length) : 0;
  const incs = ct ? data.incidencias.filter(i=>i.contrato_id===ct.id&&i.estado==="Abierta") : data.incidencias.filter(i=>i.estado==="Abierta");
  const sup = data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora");
  const aux = data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora");

  const prompts = {
    operacional:`Genera un informe operacional diario profesional para LEG Servicios de Limpieza.\n\nContrato: ${ct?.cliente||"Todos los contratos"}, ${ct?.instalacion||""}, ${ct?.direccion||""}\nTrabajador(a): ${aux?.nombre||"Martha Ynes Vera Barboza"}\nSupervisor: ${sup?.nombre||"Luis Ernesto Guzman Loyola"}\nTareas ejecutadas hoy: ${evHoy.length} de ${chks.filter(c=>c.periodicidad==="DIARIA").length}\nCumplimiento promedio: ${cumPr}%\nIncidencias abiertas: ${incs.length} (${incs.map(i=>i.tipo).join(", ")||"ninguna"})\nDependencias: ${ct?data.dependencias.filter(d=>d.contrato_id===ct.id).length:data.dependencias.length}\n\nRedacta en español, estilo formal, secciones: Resumen ejecutivo, Actividades realizadas, Incidencias, Recomendaciones. Máximo 350 palabras.`,
    licitacion:`Redacta un párrafo técnico convincente para incluir en una licitación pública de aseo, describiendo el sistema de control y trazabilidad operacional de LEG Servicios de Limpieza${ct?` aplicado en ${ct.cliente}`:""}: registro digital de evidencias, checklist por dependencia con periodicidades (diaria/semanal/quincenal/mensual/trimestral), sistema de incidencias con seguimiento de estados, supervisiones con % de cumplimiento verificable, códigos QR por área, y trazabilidad completa por trabajador y fecha. Estilo formal, convincente, máximo 200 palabras en español.`,
    analisis:`Analiza los datos de LEG Servicios de Limpieza${ct?` para ${ct.cliente}`:""} y entrega 3 observaciones clave y 3 recomendaciones concretas:\n- ${evHoy.length} de ${chks.filter(c=>c.periodicidad==="DIARIA").length} tareas diarias ejecutadas hoy\n- ${data.incidencias.length} incidencias totales, ${incs.length} abiertas\n- Tipos: ${[...new Set(data.incidencias.map(i=>i.tipo))].join(", ")||"ninguno"}\n- Cumplimiento promedio supervisiones: ${cumPr}%\n\nSé específico y práctico. En español.`,
  };

  const generar = async () => {
    setLoading(true); setInforme(""); setError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompts[tipo]}]})});
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setInforme(json.content?.map(b=>b.text||"").join("")||"Sin respuesta.");
    } catch(e) { setError("Error al generar. Verifica tu conexión."); }
    setLoading(false);
  };

  const tipos=[{key:"operacional",label:"Informe diario"},{key:"licitacion",label:"Texto para licitación"},{key:"analisis",label:"Análisis y recomendaciones"}];

  return (
    <div>
      <div style={{ marginBottom:20 }}><SHeader title="Informes con IA" /><p style={{ color:C.textMuted, fontSize:13, margin:0 }}>Genera documentos profesionales basados en los datos operacionales reales del sistema.</p></div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {tipos.map(t=><button key={t.key} onClick={()=>setTipo(t.key)} style={{ background:tipo===t.key?C.accent:C.surface, color:tipo===t.key?"#fff":C.textMuted, border:`1px solid ${tipo===t.key?C.accent:C.border}`, borderRadius:8, padding:"8px 16px", fontSize:13, cursor:"pointer", fontWeight:500 }}>{t.label}</button>)}
      </div>
      <Btn onClick={generar} disabled={loading}>{loading?"Generando…":"⚡ Generar con IA"}</Btn>
      {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:10, padding:16, marginTop:16, color:C.red, fontSize:13 }}>{error}</div>}
      {informe && (
        <Card accent={C.accent}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ color:C.accentLight, fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" }}>Informe generado</span>
            <button onClick={()=>navigator.clipboard?.writeText(informe)} style={{ background:"transparent", color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", fontSize:12, cursor:"pointer" }}>Copiar</button>
          </div>
          <div style={{ color:C.text, fontSize:13, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{informe}</div>
        </Card>
      )}
    </div>
  );
}

/* ─── App principal ─────────────────────────────────────────── */
const TABS=[
  {key:"dashboard",     label:"Dashboard"},
  {key:"contratos",     label:"Contratos"},
  {key:"dependencias",  label:"Dependencias"},
  {key:"trabajadores",  label:"Trabajadores"},
  {key:"checklist",     label:"Checklist"},
  {key:"incidencias",   label:"Incidencias"},
  {key:"supervisiones", label:"Supervisiones"},
  {key:"informes",      label:"Informes IA"},
];

export default function App() {
  const [tab, setTab]             = useState("dashboard");
  const [contratoId, setContratoId] = useState("");
  const { data, loading, dbMode, insert, update, remove } = useData();

  if (loading || !data) return <Spinner />;

  const incAb = (contratoId ? data.incidencias?.filter(i=>i.contrato_id===contratoId&&i.estado==="Abierta") : data.incidencias?.filter(i=>i.estado==="Abierta"))?.length || 0;
  const contratos = data.contratos || [];

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'IBM Plex Mono','Courier New',monospace", color:C.text }}>
      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 20px", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height:52, gap:12, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, background:C.accent, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff" }}>L</div>
            <span style={{ color:C.text, fontWeight:700, fontSize:15 }}>LimpiApp Pro</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <ContractSelector contratos={contratos} selected={contratoId} onSelect={setContratoId} />
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, background:dbMode?C.green:C.yellow, borderRadius:"50%" }} />
              <span style={{ color:C.textMuted, fontSize:11 }}>{dbMode?"Supabase":"Demo"}</span>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:"flex", gap:2, overflowX:"auto" }}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{ background:"transparent", color:tab===t.key?C.accentLight:C.textMuted, border:"none", borderBottom:tab===t.key?`2px solid ${C.accentLight}`:"2px solid transparent", padding:"10px 14px", fontSize:12, cursor:"pointer", fontWeight:tab===t.key?600:400, whiteSpace:"nowrap" }}>
              {t.label}
              {t.key==="incidencias"&&incAb>0&&<span style={{ marginLeft:6, background:C.red, color:"#fff", borderRadius:10, fontSize:10, padding:"1px 5px", fontWeight:700 }}>{incAb}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth:1020, margin:"0 auto", padding:"24px 20px" }}>
        {!isConfigured && <DemoBanner />}
        {tab==="dashboard"     && <Dashboard      data={data} contratoId={contratoId} />}
        {tab==="contratos"     && <Contratos       data={data} insert={insert} update={update} remove={remove} />}
        {tab==="dependencias"  && <Dependencias    data={data} contratoId={contratoId} insert={insert} update={update} />}
        {tab==="trabajadores"  && <Trabajadores    data={data} insert={insert} update={update} />}
        {tab==="checklist"     && <Checklist       data={data} contratoId={contratoId} insert={insert} />}
        {tab==="incidencias"   && <Incidencias     data={data} contratoId={contratoId} insert={insert} update={update} />}
        {tab==="supervisiones" && <Supervisiones   data={data} contratoId={contratoId} insert={insert} />}
        {tab==="informes"      && <InformesIA      data={data} contratoId={contratoId} />}
      </div>
    </div>
  );
}
