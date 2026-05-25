import { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "./supabase.js";
import Remuneraciones from "./Remuneraciones.jsx";
/* ─── Paleta ERP corporativa (fondo claro) ──────────────────── */
const C = {
  pageBg:      "#f0f2f5",
  surface:     "#ffffff",
  surfaceAlt:  "#f8faff",
  border:      "#e5e7eb",
  borderLight: "#f3f4f6",
  accent:      "#2563eb",
  accentHover: "#1d4ed8",
  accentBg:    "#eff6ff",
  accentText:  "#1d4ed8",
  green:       "#15803d",  greenBg:  "#f0fdf4",  greenBorder:  "#bbf7d0",
  yellow:      "#b45309",  yellowBg: "#fffbeb",  yellowBorder: "#fde68a",
  red:         "#b91c1c",  redBg:    "#fef2f2",  redBorder:    "#fecaca",
  purple:      "#6d28d9",  purpleBg: "#f5f3ff",  purpleBorder: "#ddd6fe",
  cyan:        "#0e7490",  cyanBg:   "#ecfeff",  cyanBorder:   "#a5f3fc",
  orange:      "#c2410c",  orangeBg: "#fff7ed",  orangeBorder: "#fed7aa",
  text:        "#111827",
  textMuted:   "#6b7280",
  textDim:     "#9ca3af",
  shadow:      "0 1px 3px rgba(0,0,0,0.08)",
  shadowMd:    "0 4px 12px rgba(0,0,0,0.08)",
};

/* ─── Colores de periodicidad ───────────────────────────────── */
const PTAG = {
  DIARIA:      { bg:C.greenBg,  text:C.green,  border:C.greenBorder  },
  SEMANAL:     { bg:C.accentBg, text:C.accentText, border:"#bfdbfe"  },
  QUINCENAL:   { bg:C.cyanBg,   text:C.cyan,   border:C.cyanBorder   },
  MENSUAL:     { bg:C.purpleBg, text:C.purple, border:C.purpleBorder },
  TRIMESTRAL:  { bg:C.yellowBg, text:C.yellow, border:C.yellowBorder },
  SEMESTRAL:   { bg:C.orangeBg, text:C.orange, border:C.orangeBorder },
  ANUAL:       { bg:C.redBg,    text:C.red,    border:C.redBorder    },
};

const ESTADO_CONTRATO_TAG = {
  Vigente:     { bg:C.greenBg,  text:C.green,  border:C.greenBorder  },
  Postulación: { bg:C.yellowBg, text:C.yellow, border:C.yellowBorder },
  Renovación:  { bg:C.purpleBg, text:C.purple, border:C.purpleBorder },
  Inactivo:    { bg:"#f9fafb",  text:C.textMuted, border:C.border    },
};

const ECOLOR = {
  Abierta:    { bg:C.redBg,    text:C.red,    border:C.redBorder    },
  "En Proceso":{ bg:C.yellowBg, text:C.yellow, border:C.yellowBorder },
  Cerrada:    { bg:C.greenBg,  text:C.green,  border:C.greenBorder  },
};

/* ─── Íconos SVG inline ─────────────────────────────────────── */
const Icon = {
  dashboard:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  contratos:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  dependencias: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  trabajadores: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  checklist:    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  incidencias:  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  supervisiones:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  informes:     <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
};

const TABS = [
  { key:"dashboard",     label:"Dashboard",     icon:Icon.dashboard    },
  { key:"contratos",     label:"Contratos",     icon:Icon.contratos    },
  { key:"dependencias",  label:"Dependencias",  icon:Icon.dependencias },
  { key:"trabajadores",  label:"Trabajadores",  icon:Icon.trabajadores },
  { key:"checklist",     label:"Checklist",     icon:Icon.checklist    },
  { key:"incidencias",   label:"Incidencias",   icon:Icon.incidencias  },
  { key:"supervisiones", label:"Supervisiones", icon:Icon.supervisiones},
  { key:"informes",      label:"Informes IA",   icon:Icon.informes     },
  { key:"remuneraciones", label:"Remuneraciones" },
];

/* ─── Componentes base ERP ──────────────────────────────────── */
function Tag({ text, scheme }) {
  const s = scheme || { bg:"#f3f4f6", text:C.textMuted, border:C.border };
  return <span style={{ background:s.bg, color:s.text, border:`1px solid ${s.border}`, fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:4, whiteSpace:"nowrap", letterSpacing:"0.3px" }}>{text}</span>;
}

function KPICard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"18px 20px", boxShadow:C.shadow }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <p style={{ color:C.textMuted, fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:8 }}>{label}</p>
          <p style={{ color:color||C.text, fontSize:26, fontWeight:700, lineHeight:1, marginBottom:4 }}>{value}</p>
          {sub && <p style={{ color:C.textDim, fontSize:11, marginTop:6 }}>{sub}</p>}
        </div>
        {icon && <div style={{ color:C.textDim, opacity:0.5 }}>{icon}</div>}
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
      <div>
        <h1 style={{ color:C.text, fontSize:18, fontWeight:600, margin:"0 0 3px" }}>{title}</h1>
        {subtitle && <p style={{ color:C.textMuted, fontSize:12, margin:0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Panel({ children, title, count, action, noPad }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:C.shadow, overflow:"hidden", marginBottom:16 }}>
      {(title||action) && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderBottom:`1px solid ${C.borderLight}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {title && <span style={{ fontWeight:600, fontSize:13, color:C.text }}>{title}</span>}
            {count !== undefined && <span style={{ background:C.accentBg, color:C.accent, fontSize:11, fontWeight:600, padding:"1px 7px", borderRadius:10 }}>{count}</span>}
          </div>
          {action}
        </div>
      )}
      <div style={noPad?{}:{ padding:"16px 18px" }}>{children}</div>
    </div>
  );
}

function DataTable({ cols, rows, empty="Sin registros" }) {
  if (!rows.length) return (
    <div style={{ textAlign:"center", color:C.textMuted, padding:"40px 0", fontSize:13 }}>
      <div style={{ fontSize:28, marginBottom:8 }}>—</div>{empty}
    </div>
  );
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", fontSize:13 }}>
        <thead>
          <tr style={{ background:C.surfaceAlt }}>
            {cols.map(c=><th key={c.key} style={{ color:C.textMuted, fontWeight:500, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px", padding:"10px 16px", textAlign:"left", borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i} style={{ borderBottom:`1px solid ${C.borderLight}`, transition:"background 0.1s" }}>
              {cols.map(c=><td key={c.key} style={{ padding:"10px 16px", color:C.text, verticalAlign:"middle" }}>{c.render?c.render(r):r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormCard({ children, accent, onSave, onCancel, saveLabel="Guardar" }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${accent||C.accent}`, borderRadius:8, padding:20, marginBottom:16, boxShadow:"0 0 0 3px " + (accent||C.accent) + "14" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>{children}</div>
      <div style={{ display:"flex", gap:8, paddingTop:4, borderTop:`1px solid ${C.borderLight}` }}>
        <PrimaryBtn onClick={onSave} color={accent}>{saveLabel}</PrimaryBtn>
        <SecondaryBtn onClick={onCancel}>Cancelar</SecondaryBtn>
      </div>
    </div>
  );
}

function FL({ label, children, span }) {
  return (
    <div style={span?{ gridColumn:"1/-1" }:{}}>
      <label style={{ display:"block", color:C.textMuted, fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

const INP = {
  width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:6,
  padding:"7px 10px", color:C.text, fontSize:13, boxSizing:"border-box",
  transition:"border-color 0.15s, box-shadow 0.15s",
};

function PrimaryBtn({ onClick, children, disabled, color, small }) {
  const bg = color || C.accent;
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:disabled?"#e5e7eb":bg, color:"#fff", border:"none", borderRadius:6, padding:small?"5px 12px":"7px 16px", fontSize:12, fontWeight:600, cursor:disabled?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5, letterSpacing:"0.2px" }}>
      {children}
    </button>
  );
}

function SecondaryBtn({ onClick, children, small }) {
  return (
    <button onClick={onClick} style={{ background:C.surface, color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:6, padding:small?"5px 12px":"7px 14px", fontSize:12, fontWeight:500, cursor:"pointer" }}>
      {children}
    </button>
  );
}

function DangerBtn({ onClick, children, small }) {
  return (
    <button onClick={onClick} style={{ background:C.redBg, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:6, padding:small?"5px 12px":"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:C.pageBg, gap:14 }}>
      <div style={{ width:36, height:36, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color:C.textMuted, fontSize:13 }}>Conectando con Supabase…</p>
    </div>
  );
}

function AlertBanner({ type, message }) {
  const s = type==="warning" ? { bg:C.yellowBg, border:C.yellowBorder, text:C.yellow, icon:"⚠" }
           : type==="error"   ? { bg:C.redBg,    border:C.redBorder,    text:C.red,    icon:"✕" }
           :                    { bg:C.accentBg,  border:"#bfdbfe",      text:C.accent, icon:"ℹ" };
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:7, padding:"10px 16px", marginBottom:16, display:"flex", gap:10, alignItems:"center" }}>
      <span style={{ color:s.text, fontWeight:700, fontSize:14 }}>{s.icon}</span>
      <span style={{ color:s.text, fontSize:12 }}>{message}</span>
    </div>
  );
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
      const res = await Promise.all(TABLES.map(t => supabase.from(t).select("*").order("id")));
      const d = {};
      TABLES.forEach((t,i) => { d[t] = res[i].data || []; });
      setData(d); setDbMode(true);
    } catch { setData({}); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const save = useCallback(async (table, record, isUpdate=false) => {
    if (!isConfigured || !dbMode) return false;
    const { error } = isUpdate
      ? await supabase.from(table).update(record).eq("id", record.id)
      : await supabase.from(table).insert(record);
    if (error) { alert("Error: " + error.message); return false; }
    await loadAll(); return true;
  }, [dbMode, loadAll]);

  return {
    data, loading, dbMode,
    insert: (t,r) => save(t,r,false),
    update: (t,r) => save(t,r,true),
    reload: loadAll,
  };
}

function genId(prefix) { return `${prefix}${Date.now()}`; }

/* ─── Selector de contrato ──────────────────────────────────── */
function ContractSelector({ contratos, selected, onSelect }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ color:C.textMuted, fontSize:12, whiteSpace:"nowrap" }}>Vista:</span>
      <select value={selected||""} onChange={e=>onSelect(e.target.value)}
        style={{ ...INP, width:"auto", minWidth:180, padding:"6px 10px", fontSize:12, cursor:"pointer", background:C.surfaceAlt }}>
        <option value="">Todos los contratos</option>
        {contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
      </select>
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────── */
function Dashboard({ data, contratoId }) {
  const hoy = new Date().toISOString().slice(0,10);
  const chks  = (contratoId ? data.checklist.filter(c=>c.contrato_id===contratoId) : data.checklist).filter(c=>c.activa);
  const diaria= chks.filter(c=>c.periodicidad==="DIARIA");
  const evHoy = (contratoId ? data.evidencias.filter(e=>e.contrato_id===contratoId) : data.evidencias).filter(e=>e.fecha_hora?.startsWith(hoy));
  const incs  = contratoId ? data.incidencias.filter(i=>i.contrato_id===contratoId) : data.incidencias;
  const incAb = incs.filter(i=>i.estado==="Abierta").length;
  const sups  = contratoId ? data.supervisiones.filter(s=>s.contrato_id===contratoId) : data.supervisiones;
  const cumPr = sups.length ? Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length) : 0;
  const ct    = contratoId ? data.contratos.find(c=>c.id===contratoId) : null;
  const xPer  = chks.reduce((a,c)=>({...a,[c.periodicidad]:(a[c.periodicidad]||0)+1}),{});

  return (
    <div>
      <PageHeader
        title="Dashboard operacional"
        subtitle={ct ? `${ct.cliente} · ${ct.instalacion} · ${ct.direccion}` : "LEG Servicios de Limpieza — Vista consolidada"}
      />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:20 }}>
        <KPICard label="Cumplimiento" value={`${cumPr}%`} sub="Prom. supervisiones" color={cumPr>=90?C.green:cumPr>=70?C.yellow:C.red} />
        <KPICard label="Ejecución hoy" value={`${evHoy.length}/${diaria.length}`} sub="Tareas diarias" color={C.accent} />
        <KPICard label="Incidencias abiertas" value={incAb} sub={incAb===0?"Sin pendientes":"Requieren atención"} color={incAb>0?C.red:C.green} />
        <KPICard label="Contratos vigentes" value={data.contratos.filter(c=>c.activo&&c.estado==="Vigente").length} sub="Activos" />
        <KPICard label="Trabajadores" value={data.trabajadores.filter(t=>t.activo).length} sub="Activos" />
        <KPICard label="Dependencias" value={contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId&&d.activo).length:data.dependencias.filter(d=>d.activo).length} sub="En control" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <Panel title="Distribución de tareas" noPad>
          <div style={{ padding:"14px 18px" }}>
            {Object.keys(PTAG).filter(p=>xPer[p]).map(p=>(
              <div key={p} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ flex:1, background:C.borderLight, borderRadius:3, height:6, overflow:"hidden" }}>
                  <div style={{ width:`${((xPer[p]||0)/chks.length)*100}%`, height:"100%", background:PTAG[p].text, borderRadius:3, transition:"width 0.4s" }} />
                </div>
                <Tag text={p} scheme={PTAG[p]} />
                <span style={{ color:C.textMuted, fontSize:12, minWidth:22, textAlign:"right", fontWeight:600 }}>{xPer[p]}</span>
              </div>
            ))}
            {!chks.length && <p style={{ color:C.textDim, fontSize:13 }}>Sin tareas para este contrato</p>}
          </div>
        </Panel>

        <Panel title="Incidencias recientes" noPad>
          <div style={{ padding:"4px 0" }}>
            {incs.slice(-5).reverse().map(inc=>{
              const dep = data.dependencias.find(d=>d.id===inc.dep_id);
              const ctt = data.contratos.find(c=>c.id===inc.contrato_id);
              return (
                <div key={inc.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 18px", borderBottom:`1px solid ${C.borderLight}` }}>
                  <div>
                    <p style={{ color:C.text, fontWeight:500, marginBottom:2 }}>{inc.tipo}</p>
                    <p style={{ color:C.textDim, fontSize:11 }}>{ctt?.cliente?.split(" ").slice(0,2).join(" ")} · {dep?.nombre}</p>
                  </div>
                  <Tag text={inc.estado} scheme={ECOLOR[inc.estado]} />
                </div>
              );
            })}
            {!incs.length && <p style={{ color:C.textDim, fontSize:13, padding:"16px 18px" }}>Sin incidencias registradas</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Últimas evidencias registradas" noPad>
        <DataTable
          cols={[
            { key:"tarea",      label:"Tarea",      render:r=>{ const c=data.checklist.find(ch=>ch.id===r.checklist_id); return <span style={{ fontWeight:500 }}>{c?.tarea||"—"}</span>; } },
            { key:"contrato",   label:"Contrato",   render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted }}>{c?.cliente?.split(" ").slice(0,3).join(" ")}</span>; } },
            { key:"trabajador", label:"Trabajador", render:r=>{ const t=data.trabajadores.find(w=>w.id===r.trabajador_id); return t?.nombre.split(" ").slice(0,2).join(" ")||"—"; } },
            { key:"hora",       label:"Hora",       render:r=><span style={{ color:C.textMuted, fontVariantNumeric:"tabular-nums" }}>{r.fecha_hora?.split("T")[1]?.slice(0,5)||"—"}</span> },
            { key:"estado",     label:"Estado",     render:r=><Tag text={r.cumplido?"Cumplido":"Pendiente"} scheme={r.cumplido?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:C.redBg,text:C.red,border:C.redBorder}} /> },
          ]}
          rows={[...evHoy].reverse().slice(0,6)}
          empty="No hay evidencias registradas hoy"
        />
      </Panel>
    </div>
  );
}

/* ─── Contratos ─────────────────────────────────────────────── */
const ESTADOS_CONTRATO = ["Vigente","Postulación","Renovación","Inactivo"];
function Contratos({ data, insert, update }) {
  const [form, setForm] = useState(null);
  const isNew = form && !data.contratos.find(c=>c.id===form.id);

  const openNew = () => setForm({ id:genId("CT"), cliente:"", instalacion:"", direccion:"", supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||"", estado:"Vigente", activo:true });
  const save = async () => {
    if (!form.cliente.trim()) return;
    const ok = isNew ? await insert("contratos",form) : await update("contratos",form);
    if (ok) setForm(null);
  };

  return (
    <div>
      <PageHeader title="Contratos" subtitle={`${data.contratos.length} contratos registrados`}
        action={<PrimaryBtn onClick={openNew}>+ Nuevo contrato</PrimaryBtn>} />

      {form && (
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel={isNew?"Crear contrato":"Actualizar"} accent={C.accent}>
          <FL label="Cliente / Institución">
            <input style={INP} value={form.cliente} onChange={e=>setForm({...form,cliente:e.target.value})} placeholder="Ej: Seremi de Transportes" />
          </FL>
          <FL label="Instalación">
            <input style={INP} value={form.instalacion} onChange={e=>setForm({...form,instalacion:e.target.value})} placeholder="Ej: Sucursal Arica" />
          </FL>
          <FL label="Dirección">
            <input style={INP} value={form.direccion} onChange={e=>setForm({...form,direccion:e.target.value})} placeholder="Ej: Chacabuco Nº901" />
          </FL>
          <FL label="Estado">
            <select style={INP} value={form.estado} onChange={e=>setForm({...form,estado:e.target.value,activo:["Vigente","Renovación"].includes(e.target.value)})}>
              {ESTADOS_CONTRATO.map(s=><option key={s}>{s}</option>)}
            </select>
          </FL>
          <FL label="Supervisor responsable">
            <select style={INP} value={form.supervisor_id||""} onChange={e=>setForm({...form,supervisor_id:e.target.value})}>
              <option value="">— Sin asignar —</option>
              {data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </FL>
          <FL label="ID Licitación (opcional)">
            <input style={INP} value={form.licitacion_id||""} onChange={e=>setForm({...form,licitacion_id:e.target.value})} placeholder="Ej: 892200-1-LE26" />
          </FL>
        </FormCard>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            { key:"id",         label:"ID",         render:r=><code style={{ background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 6px", fontSize:11, color:C.textMuted }}>{r.id}</code> },
            { key:"cliente",    label:"Cliente",    render:r=><span style={{ fontWeight:500 }}>{r.cliente}</span> },
            { key:"instalacion",label:"Instalación",render:r=><span style={{ color:C.textMuted }}>{r.instalacion}</span> },
            { key:"direccion",  label:"Dirección",  render:r=><span style={{ color:C.textMuted }}>{r.direccion}</span> },
            { key:"estado",     label:"Estado",     render:r=><Tag text={r.estado} scheme={ESTADO_CONTRATO_TAG[r.estado]} /> },
            { key:"deps",       label:"Dep.",        render:r=><span style={{ color:C.textMuted, fontVariantNumeric:"tabular-nums" }}>{data.dependencias.filter(d=>d.contrato_id===r.id).length}</span> },
            { key:"tareas",     label:"Tareas",     render:r=><span style={{ color:C.textMuted, fontVariantNumeric:"tabular-nums" }}>{data.checklist.filter(c=>c.contrato_id===r.id).length}</span> },
            { key:"edit",       label:"",           render:r=><button onClick={()=>setForm({...r})} style={{ color:C.accent, background:"none", border:"none", cursor:"pointer", fontSize:12, fontWeight:500 }}>Editar</button> },
          ]}
          rows={data.contratos}
        />
      </Panel>
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
    const ctId = filtroC||data.contratos[0]?.id||"";
    setForm({ id:genId("DEP"), contrato_id:ctId, nombre:"", qr:"", activo:true });
  };
  const save = async () => {
    if (!form.nombre.trim()) return;
    const ok = isNew ? await insert("dependencias",{...form,qr:form.qr||`QR-${form.id}`}) : await update("dependencias",form);
    if (ok) setForm(null);
  };

  return (
    <div>
      <PageHeader title="Dependencias" subtitle="Áreas y espacios por contrato"
        action={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <select value={filtroC} onChange={e=>setFiltroC(e.target.value)}
              style={{ ...INP, width:"auto", padding:"6px 10px", fontSize:12, background:C.surfaceAlt }}>
              <option value="">Todos los contratos</option>
              {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
            </select>
            <PrimaryBtn onClick={openNew}>+ Nueva</PrimaryBtn>
          </div>
        }
      />

      {form && (
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel={isNew?"Crear dependencia":"Actualizar"} accent={C.purple}>
          <FL label="Contrato">
            <select style={INP} value={form.contrato_id} onChange={e=>setForm({...form,contrato_id:e.target.value})}>
              {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
            </select>
          </FL>
          <FL label="Nombre del área">
            <input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Baños Piso 1, Cocina y Comedor…" />
          </FL>
        </FormCard>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            { key:"contrato", label:"Contrato",  render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted }}>{c?.cliente?.split(" ").slice(0,3).join(" ")}</span>; } },
            { key:"nombre",   label:"Área / Dependencia", render:r=><span style={{ fontWeight:500 }}>{r.nombre}</span> },
            { key:"tareas",   label:"Tareas",    render:r=><span style={{ color:C.textMuted }}>{data.checklist.filter(c=>c.dep_id===r.id).length}</span> },
            { key:"activo",   label:"Estado",    render:r=><Tag text={r.activo?"Activa":"Inactiva"} scheme={r.activo?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:"#f9fafb",text:C.textMuted,border:C.border}} /> },
            { key:"edit",     label:"",          render:r=><button onClick={()=>setForm({...r})} style={{ color:C.accent, background:"none", border:"none", cursor:"pointer", fontSize:12, fontWeight:500 }}>Editar</button> },
          ]}
          rows={rows}
          empty="No hay dependencias para este filtro"
        />
      </Panel>
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
      <PageHeader title="Trabajadores" subtitle={`${data.trabajadores.filter(t=>t.activo).length} activos`}
        action={<PrimaryBtn onClick={()=>setForm({ id:genId("TR"), nombre:"", cargo:"Auxiliar Aseo", telefono:"", email:"", activo:true })}>+ Nuevo trabajador</PrimaryBtn>} />

      {form && (
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel={isNew?"Crear trabajador":"Actualizar"}>
          <FL label="Nombre completo"><input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre Apellido Apellido" /></FL>
          <FL label="Cargo">
            <select style={INP} value={form.cargo} onChange={e=>setForm({...form,cargo:e.target.value})}>
              <option>Auxiliar Aseo</option><option>Supervisor</option><option>Supervisora</option><option>Jefe de Turno</option>
            </select>
          </FL>
          <FL label="Teléfono"><input style={INP} value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} placeholder="+569XXXXXXXX" /></FL>
          <FL label="Email"><input style={INP} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="correo@empresa.cl" /></FL>
        </FormCard>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            { key:"nombre",   label:"Nombre",    render:r=><span style={{ fontWeight:500 }}>{r.nombre}</span> },
            { key:"cargo",    label:"Cargo",     render:r=><Tag text={r.cargo} scheme={r.cargo==="Supervisor"||r.cargo==="Supervisora"?{bg:C.purpleBg,text:C.purple,border:C.purpleBorder}:{bg:C.accentBg,text:C.accentText,border:"#bfdbfe"}} /> },
            { key:"telefono", label:"Teléfono",  render:r=><span style={{ color:C.textMuted }}>{r.telefono||"—"}</span> },
            { key:"email",    label:"Email",     render:r=><span style={{ color:C.textMuted }}>{r.email||"—"}</span> },
            { key:"activo",   label:"Estado",    render:r=><Tag text={r.activo?"Activo":"Inactivo"} scheme={r.activo?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:"#f9fafb",text:C.textMuted,border:C.border}} /> },
            { key:"edit",     label:"",          render:r=><button onClick={()=>setForm({...r})} style={{ color:C.accent, background:"none", border:"none", cursor:"pointer", fontSize:12, fontWeight:500 }}>Editar</button> },
          ]}
          rows={data.trabajadores}
        />
      </Panel>
    </div>
  );
}

/* ─── Checklist ─────────────────────────────────────────────── */
function Checklist({ data, contratoId, insert }) {
  const [filtro, setFiltro] = useState("TODAS");
  const [form, setForm] = useState(null);
  const hoy = new Date().toISOString().slice(0,10);

  const chks = contratoId ? data.checklist.filter(c=>c.contrato_id===contratoId) : data.checklist;
  const rows = filtro==="TODAS" ? chks : chks.filter(c=>c.periodicidad===filtro);

  const marcar = async (chkId, cId) => {
    await insert("evidencias",{
      id:`EV${Date.now()}`,
      checklist_id:chkId,
      trabajador_id:data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora")?.id||data.trabajadores[0]?.id,
      contrato_id:cId,
      fecha_hora:new Date().toISOString(),
      observacion:"",cumplido:true,
    });
  };

  const openNew = () => {
    const deps = contratoId ? data.dependencias.filter(d=>d.contrato_id===contratoId) : data.dependencias;
    setForm({ id:genId("CHK"), dep_id:deps[0]?.id||"", contrato_id:contratoId||data.contratos[0]?.id||"", tarea:"", periodicidad:"DIARIA", obligatoria:true, activa:true });
  };
  const save = async () => {
    if (!form.tarea.trim()) return;
    const ok = await insert("checklist",form);
    if (ok) setForm(null);
  };

  const completadas = chks.filter(c=>c.periodicidad==="DIARIA"&&data.evidencias.some(e=>e.checklist_id===c.id&&e.fecha_hora?.startsWith(hoy)));

  return (
    <div>
      <PageHeader title="Checklist de tareas"
        subtitle={`${chks.length} tareas · ${completadas.length} completadas hoy`}
        action={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ display:"flex", gap:4 }}>
              {["TODAS",...Object.keys(PTAG)].map(p=>(
                <button key={p} onClick={()=>setFiltro(p)} style={{ background:filtro===p?(PTAG[p]?.text||C.accent):"transparent", color:filtro===p?"#fff":(PTAG[p]?.text||C.textMuted), border:`1px solid ${filtro===p?"transparent":C.border}`, borderRadius:5, padding:"4px 10px", fontSize:11, cursor:"pointer", fontWeight:500 }}>{p}</button>
              ))}
            </div>
            <PrimaryBtn onClick={openNew} small>+ Tarea</PrimaryBtn>
          </div>
        }
      />

      {form && (
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel="Crear tarea" accent={C.green}>
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
          <FL label="Descripción de la tarea" span>
            <input style={INP} value={form.tarea} onChange={e=>setForm({...form,tarea:e.target.value})} placeholder="Ej: Limpieza y desinfección de baños" />
          </FL>
          <FL label="Periodicidad">
            <select style={INP} value={form.periodicidad} onChange={e=>setForm({...form,periodicidad:e.target.value})}>
              {Object.keys(PTAG).map(p=><option key={p}>{p}</option>)}
            </select>
          </FL>
        </FormCard>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            { key:"tarea",  label:"Tarea",       render:r=><span style={{ fontWeight:500 }}>{r.tarea}</span> },
            { key:"ctt",    label:"Contrato",    render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted, fontSize:12 }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
            { key:"dep",    label:"Área",         render:r=>{ const d=data.dependencias.find(dep=>dep.id===r.dep_id); return <span style={{ color:C.textMuted }}>{d?.nombre||"—"}</span>; } },
            { key:"per",    label:"Frecuencia",  render:r=><Tag text={r.periodicidad} scheme={PTAG[r.periodicidad]} /> },
            { key:"ev",     label:"Hoy",          render:r=>{
              if (r.periodicidad!=="DIARIA") return <span style={{ color:C.textDim }}>—</span>;
              const n=data.evidencias.filter(e=>e.checklist_id===r.id&&e.fecha_hora?.startsWith(hoy)).length;
              return n>0
                ? <Tag text={`✓ Completada`} scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}} />
                : <button onClick={()=>marcar(r.id,r.contrato_id)} style={{ background:C.accentBg, color:C.accent, border:`1px solid #bfdbfe`, borderRadius:5, padding:"3px 10px", fontSize:11, cursor:"pointer", fontWeight:600 }}>Marcar ✓</button>;
            }},
          ]}
          rows={rows}
          empty="No hay tareas para este filtro"
        />
      </Panel>
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
    const deps = contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId):data.dependencias;
    setForm({ id:genId("IN"), contrato_id:contratoId||data.contratos.find(c=>c.activo)?.id||"", dep_id:deps[0]?.id||"", fecha_hora:new Date().toISOString(), tipo:"Falta Insumos", descripcion:"", estado:"Abierta", trabajador_id:data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora")?.id||data.trabajadores[0]?.id||"" });
  };
  const save = async () => {
    if (!form.descripcion.trim()) return;
    const ok = await insert("incidencias",form);
    if (ok) setForm(null);
  };
  const cambiarEstado = async (inc,estado) => { await update("incidencias",{...inc,estado}); };

  return (
    <div>
      <PageHeader title="Incidencias" subtitle={`${incs.length} total · ${abiertas} abiertas`}
        action={<DangerBtn onClick={openNew}>+ Reportar incidencia</DangerBtn>} />

      {abiertas>0 && <AlertBanner type="warning" message={`Hay ${abiertas} incidencia${abiertas>1?"s":""} abierta${abiertas>1?"s":""} que requieren atención.`} />}

      {form && (
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel="Registrar incidencia" accent={C.red}>
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
          <FL label="Tipo de incidencia">
            <select style={INP} value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
              {TIPOS.map(t=><option key={t}>{t}</option>)}
            </select>
          </FL>
          <FL label="Trabajador que reporta">
            <select style={INP} value={form.trabajador_id} onChange={e=>setForm({...form,trabajador_id:e.target.value})}>
              {data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </FL>
          <FL label="Descripción detallada" span>
            <textarea rows={3} style={{ ...INP,resize:"vertical" }} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Describe la incidencia con el mayor detalle posible…" />
          </FL>
        </FormCard>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            { key:"tipo",    label:"Tipo",        render:r=><span style={{ fontWeight:500 }}>{r.tipo}</span> },
            { key:"contrato",label:"Contrato",    render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted, fontSize:12 }}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>; } },
            { key:"dep",     label:"Área",        render:r=>{ const d=data.dependencias.find(dep=>dep.id===r.dep_id); return <span style={{ color:C.textMuted }}>{d?.nombre}</span>; } },
            { key:"desc",    label:"Descripción", render:r=><span style={{ color:C.textMuted }}>{r.descripcion||"—"}</span> },
            { key:"fecha",   label:"Fecha",       render:r=><span style={{ color:C.textMuted, fontSize:12, fontVariantNumeric:"tabular-nums" }}>{r.fecha_hora?.replace("T"," ").slice(0,16)}</span> },
            { key:"estado",  label:"Estado",      render:r=>(
              <select value={r.estado} onChange={e=>cambiarEstado(r,e.target.value)}
                style={{ background:(ECOLOR[r.estado]?.bg||"#f9fafb"), color:(ECOLOR[r.estado]?.text||C.textMuted), border:`1px solid ${ECOLOR[r.estado]?.border||C.border}`, borderRadius:5, padding:"3px 8px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                {["Abierta","En Proceso","Cerrada"].map(s=><option key={s}>{s}</option>)}
              </select>
            )},
          ]}
          rows={incs}
          empty="Sin incidencias registradas"
        />
      </Panel>
    </div>
  );
}

/* ─── Supervisiones ─────────────────────────────────────────── */
function Supervisiones({ data, contratoId, insert }) {
  const [form, setForm] = useState(null);
  const sups = contratoId ? data.supervisiones.filter(s=>s.contrato_id===contratoId) : data.supervisiones;
  const cumPr = sups.length ? Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length) : 0;

  const openNew = () => setForm({ id:genId("SV"), contrato_id:contratoId||data.contratos.find(c=>c.activo)?.id||"", supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||data.trabajadores[0]?.id||"", fecha:new Date().toISOString().slice(0,10), cumplimiento:90, observacion:"" });
  const save = async () => { const ok = await insert("supervisiones",form); if(ok) setForm(null); };

  return (
    <div>
      <PageHeader title="Supervisiones" subtitle={`${sups.length} registradas · Cumplimiento promedio: ${cumPr}%`}
        action={<PrimaryBtn onClick={openNew} color={C.purple}>+ Nueva supervisión</PrimaryBtn>} />

      {form && (
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel="Guardar supervisión" accent={C.purple}>
          <FL label="Contrato">
            <select style={INP} value={form.contrato_id} onChange={e=>setForm({...form,contrato_id:e.target.value})}>
              {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
            </select>
          </FL>
          <FL label="Fecha">
            <input type="date" style={INP} value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})} />
          </FL>
          <FL label={`Nivel de cumplimiento: ${form.cumplimiento}%`}>
            <div style={{ paddingTop:6 }}>
              <input type="range" min={0} max={100} value={form.cumplimiento} onChange={e=>setForm({...form,cumplimiento:Number(e.target.value)})} style={{ width:"100%", accentColor:C.purple }} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                <span style={{ fontSize:10, color:C.textDim }}>0%</span>
                <span style={{ fontSize:11, fontWeight:700, color:form.cumplimiento>=90?C.green:form.cumplimiento>=70?C.yellow:C.red }}>{form.cumplimiento}%</span>
                <span style={{ fontSize:10, color:C.textDim }}>100%</span>
              </div>
            </div>
          </FL>
          <FL label="Supervisor">
            <select style={INP} value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}>
              {data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </FL>
          <FL label="Observaciones del supervisor" span>
            <textarea rows={3} style={{ ...INP,resize:"vertical" }} value={form.observacion} onChange={e=>setForm({...form,observacion:e.target.value})} placeholder="Novedades, aspectos positivos, puntos de mejora…" />
          </FL>
        </FormCard>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            { key:"fecha",      label:"Fecha",        render:r=><span style={{ fontVariantNumeric:"tabular-nums", fontWeight:500 }}>{r.fecha}</span> },
            { key:"contrato",   label:"Contrato",     render:r=>{ const c=data.contratos.find(ct=>ct.id===r.contrato_id); return <span style={{ color:C.textMuted, fontSize:12 }}>{c?.cliente?.split(" ").slice(0,3).join(" ")}</span>; } },
            { key:"supervisor", label:"Supervisor",   render:r=>{ const s=data.trabajadores.find(t=>t.id===r.supervisor_id); return s?.nombre.split(" ").slice(0,2).join(" ")||"—"; } },
            { key:"cum",        label:"Cumplimiento", render:r=>(
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:80, background:C.borderLight, borderRadius:3, height:5, overflow:"hidden" }}>
                  <div style={{ width:`${r.cumplimiento}%`, height:"100%", borderRadius:3, background:r.cumplimiento>=90?C.green:r.cumplimiento>=70?C.yellow:C.red }} />
                </div>
                <span style={{ fontWeight:700, fontSize:12, fontVariantNumeric:"tabular-nums", color:r.cumplimiento>=90?C.green:r.cumplimiento>=70?C.yellow:C.red }}>{r.cumplimiento}%</span>
              </div>
            )},
            { key:"obs", label:"Observación", render:r=><span style={{ color:C.textMuted }}>{r.observacion||"—"}</span> },
          ]}
          rows={sups}
          empty="Sin supervisiones registradas"
        />
      </Panel>
    </div>
  );
}

/* ─── Informes IA ───────────────────────────────────────────── */
function InformesIA({ data, contratoId }) {
  const [tipo, setTipo]       = useState("operacional");
  const [informe, setInforme] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const ct    = contratoId ? data.contratos.find(c=>c.id===contratoId) : null;
  const hoy   = new Date().toISOString().slice(0,10);
  const chks  = (ct?data.checklist.filter(c=>c.contrato_id===ct.id):data.checklist).filter(c=>c.activa);
  const evHoy = (ct?data.evidencias.filter(e=>e.contrato_id===ct.id):data.evidencias).filter(e=>e.fecha_hora?.startsWith(hoy));
  const sups  = ct?data.supervisiones.filter(s=>s.contrato_id===ct.id):data.supervisiones;
  const incs  = (ct?data.incidencias.filter(i=>i.contrato_id===ct.id):data.incidencias).filter(i=>i.estado==="Abierta");
  const cumPr = sups.length?Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length):0;
  const sup   = data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora");
  const aux   = data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora");

  const prompts = {
    operacional:`Genera un informe operacional diario profesional para LEG Servicios de Limpieza.\n\nContrato: ${ct?.cliente||"Todos los contratos"}\nInstalación: ${ct?.instalacion||""} — ${ct?.direccion||""}\nTrabajador: ${aux?.nombre||"—"}\nSupervisor: ${sup?.nombre||"—"}\nTareas ejecutadas hoy: ${evHoy.length} de ${chks.filter(c=>c.periodicidad==="DIARIA").length} (diarias)\nCumplimiento promedio supervisiones: ${cumPr}%\nIncidencias abiertas: ${incs.length} (${incs.map(i=>i.tipo).join(", ")||"ninguna"})\nDependencias bajo control: ${ct?data.dependencias.filter(d=>d.contrato_id===ct.id).length:data.dependencias.length}\n\nRedacta en español, estilo formal y profesional, con secciones: Resumen ejecutivo, Actividades realizadas, Incidencias, Recomendaciones. Máximo 350 palabras.`,
    licitacion:`Redacta un párrafo técnico convincente para una licitación pública de aseo${ct?` para ${ct.cliente}`:""}, describiendo el sistema de control y trazabilidad de LEG Servicios de Limpieza: registro digital de evidencias con timestamp, checklist por dependencia con periodicidades configurables (diaria/semanal/quincenal/mensual/trimestral), sistema de incidencias con seguimiento de estados (Abierta/En Proceso/Cerrada), supervisiones con % de cumplimiento verificable, y trazabilidad completa por trabajador, área y fecha. El sistema opera en tiempo real desde dispositivos móviles y permite generar informes automáticos. Estilo formal y convincente, máximo 200 palabras en español.`,
    analisis:`Analiza los datos operacionales de LEG Servicios de Limpieza${ct?` — contrato ${ct.cliente}`:""}:\n- ${evHoy.length} de ${chks.filter(c=>c.periodicidad==="DIARIA").length} tareas diarias completadas hoy\n- ${data.incidencias.length} incidencias totales, ${incs.length} actualmente abiertas\n- Tipos de incidencias: ${[...new Set(data.incidencias.map(i=>i.tipo))].join(", ")||"ninguno"}\n- Cumplimiento promedio supervisiones: ${cumPr}%\n- ${chks.length} tareas activas en el sistema\n\nEntrega exactamente 3 observaciones clave y 3 recomendaciones concretas y accionables. Sé específico, directo y práctico. En español.`,
  };

  const generar = async () => {
    setLoading(true); setInforme(""); setError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompts[tipo]}]})});
      const json = await res.json();
      if(json.error) throw new Error(json.error.message);
      setInforme(json.content?.map(b=>b.text||"").join("")||"Sin respuesta.");
    } catch(e){ setError("Error al conectar con la IA. Verifica tu conexión."); }
    setLoading(false);
  };

  const tipos = [
    { key:"operacional", label:"Informe diario" },
    { key:"licitacion",  label:"Texto licitación" },
    { key:"analisis",    label:"Análisis y recomendaciones" },
  ];

  return (
    <div>
      <PageHeader title="Informes con IA" subtitle="Generación automática de documentos profesionales a partir de datos reales" />

      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {tipos.map(t=>(
          <button key={t.key} onClick={()=>setTipo(t.key)} style={{ background:tipo===t.key?C.accent:C.surface, color:tipo===t.key?"#fff":C.textMuted, border:`1px solid ${tipo===t.key?C.accent:C.border}`, borderRadius:6, padding:"8px 18px", fontSize:13, cursor:"pointer", fontWeight:tipo===t.key?600:400, boxShadow:tipo===t.key?C.shadow:"none" }}>
            {t.label}
          </button>
        ))}
      </div>

      <PrimaryBtn onClick={generar} disabled={loading}>{loading?"Generando documento…":"⚡ Generar con IA"}</PrimaryBtn>

      {error && <AlertBanner type="error" message={error} />}

      {informe && (
        <Panel title="Documento generado" action={<button onClick={()=>navigator.clipboard?.writeText(informe)} style={{ color:C.accent, background:"none", border:`1px solid ${C.border}`, borderRadius:5, padding:"4px 12px", fontSize:12, cursor:"pointer" }}>Copiar texto</button>}>
          <div style={{ color:C.text, fontSize:13, lineHeight:1.9, whiteSpace:"pre-wrap", maxWidth:760 }}>{informe}</div>
        </Panel>
      )}
    </div>
  );
}

/* ─── App principal ─────────────────────────────────────────── */
export default function App() {
  const [tab, setTab]               = useState("dashboard");
  const [contratoId, setContratoId] = useState("");
  const { data, loading, dbMode, insert, update } = useData();

  if (loading || !data) return <Spinner />;

  const contratos = data.contratos || [];
  const incAb = (contratoId
    ? data.incidencias?.filter(i=>i.contrato_id===contratoId&&i.estado==="Abierta")
    : data.incidencias?.filter(i=>i.estado==="Abierta"))?.length || 0;

  return (
    <div style={{ minHeight:"100vh", background:C.pageBg, fontFamily:"inherit" }}>

      {/* ── Barra superior ──────────────────────────────────── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:54, gap:16 }}>

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div style={{ width:30, height:30, background:C.accent, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14 }}>L</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:C.text, letterSpacing:"-0.3px" }}>LimpiApp Pro</div>
              <div style={{ fontSize:10, color:C.textDim, lineHeight:1 }}>LEG Servicios de Limpieza</div>
            </div>
          </div>

          {/* Selector de contrato */}
          <ContractSelector contratos={contratos} selected={contratoId} onSelect={setContratoId} />

          {/* Estado conexión */}
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:dbMode?C.green:C.yellow }} />
            <span style={{ fontSize:11, color:C.textMuted }}>{dbMode?"Supabase conectado":"Modo demo"}</span>
          </div>
        </div>

        {/* ── Navegación por pestañas ── */}
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 24px", display:"flex", gap:0, overflowX:"auto" }}>
          {TABS.map(t=>{
            const active = tab===t.key;
            return (
              <button key={t.key} onClick={()=>setTab(t.key)} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", borderBottom:active?`2px solid ${C.accent}`:"2px solid transparent", color:active?C.accent:C.textMuted, padding:"10px 14px", fontSize:12, cursor:"pointer", fontWeight:active?600:400, whiteSpace:"nowrap", transition:"color 0.15s, border-color 0.15s", flexShrink:0 }}>
                <span style={{ opacity:active?1:0.6 }}>{t.icon}</span>
                {t.label}
                {t.key==="incidencias"&&incAb>0&&<span style={{ background:C.red, color:"#fff", borderRadius:9, fontSize:10, padding:"1px 5px", fontWeight:700, marginLeft:2 }}>{incAb}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Contenido principal ─────────────────────────────── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"28px 24px" }}>
        {!isConfigured && <AlertBanner type="warning" message="Modo demostración — los datos no se guardan. Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel para activar la base de datos." />}
        {tab==="dashboard"    && <Dashboard     data={data} contratoId={contratoId} />}
        {tab==="contratos"    && <Contratos      data={data} insert={insert} update={update} />}
        {tab==="dependencias" && <Dependencias   data={data} contratoId={contratoId} insert={insert} update={update} />}
        {tab==="trabajadores" && <Trabajadores   data={data} insert={insert} update={update} />}
        {tab==="checklist"    && <Checklist      data={data} contratoId={contratoId} insert={insert} />}
        {tab==="incidencias"  && <Incidencias    data={data} contratoId={contratoId} insert={insert} update={update} />}
        {tab==="supervisiones"&& <Supervisiones  data={data} contratoId={contratoId} insert={insert} />}
        {tab==="informes"     && <InformesIA     data={data} contratoId={contratoId} />}
        {tab==="remuneraciones" && <Remuneraciones data={data} contratoId={contratoId} />}
      </div>
    </div>
  );
}
