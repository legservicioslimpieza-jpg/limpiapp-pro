import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isConfigured } from "./supabase.js";

/* ─── Paleta ERP corporativa ────────────────────────────────── */
const C = {
  pageBg:"#f0f2f5", surface:"#ffffff", surfaceAlt:"#f8faff",
  border:"#e5e7eb", borderLight:"#f3f4f6",
  accent:"#2563eb", accentHover:"#1d4ed8", accentBg:"#eff6ff", accentText:"#1d4ed8",
  green:"#15803d",  greenBg:"#f0fdf4",  greenBorder:"#bbf7d0",
  yellow:"#b45309", yellowBg:"#fffbeb", yellowBorder:"#fde68a",
  red:"#b91c1c",    redBg:"#fef2f2",    redBorder:"#fecaca",
  purple:"#6d28d9", purpleBg:"#f5f3ff", purpleBorder:"#ddd6fe",
  cyan:"#0e7490",   cyanBg:"#ecfeff",   cyanBorder:"#a5f3fc",
  orange:"#c2410c", orangeBg:"#fff7ed", orangeBorder:"#fed7aa",
  text:"#111827", textMuted:"#6b7280", textDim:"#9ca3af",
  shadow:"0 1px 3px rgba(0,0,0,0.08)", shadowMd:"0 4px 12px rgba(0,0,0,0.08)",
};

const PTAG = {
  DIARIA:     {bg:C.greenBg,  text:C.green,      border:C.greenBorder},
  SEMANAL:    {bg:C.accentBg, text:C.accentText,  border:"#bfdbfe"},
  QUINCENAL:  {bg:C.cyanBg,   text:C.cyan,        border:C.cyanBorder},
  MENSUAL:    {bg:C.purpleBg, text:C.purple,      border:C.purpleBorder},
  TRIMESTRAL: {bg:C.yellowBg, text:C.yellow,      border:C.yellowBorder},
  SEMESTRAL:  {bg:C.orangeBg, text:C.orange,      border:C.orangeBorder},
  ANUAL:      {bg:C.redBg,    text:C.red,         border:C.redBorder},
};
const ECTAG = {
  Vigente:    {bg:C.greenBg,  text:C.green,  border:C.greenBorder},
  Postulación:{bg:C.yellowBg, text:C.yellow, border:C.yellowBorder},
  Renovación: {bg:C.purpleBg, text:C.purple, border:C.purpleBorder},
  Inactivo:   {bg:"#f9fafb",  text:C.textMuted, border:C.border},
};
const ESTAG = {
  Abierta:     {bg:C.redBg,    text:C.red,    border:C.redBorder},
  "En Proceso":{bg:C.yellowBg, text:C.yellow, border:C.yellowBorder},
  Cerrada:     {bg:C.greenBg,  text:C.green,  border:C.greenBorder},
};

/* ─── Formatters ────────────────────────────────────────────── */
const clp = n => `$${Math.round(n||0).toLocaleString("es-CL")}`;
const pct = n => `${((n||0)*100).toFixed(2)}%`;

/* ─── Íconos ────────────────────────────────────────────────── */
const Icon = {
  dashboard:    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  contratos:    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  dependencias: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  trabajadores: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  checklist:    <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  incidencias:  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  supervisiones:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  remuneraciones:<svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  informes:     <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
};

const TABS = [
  {key:"dashboard",      label:"Dashboard",      icon:Icon.dashboard},
  {key:"contratos",      label:"Contratos",      icon:Icon.contratos},
  {key:"dependencias",   label:"Dependencias",   icon:Icon.dependencias},
  {key:"trabajadores",   label:"Trabajadores",   icon:Icon.trabajadores},
  {key:"checklist",      label:"Checklist",      icon:Icon.checklist},
  {key:"incidencias",    label:"Incidencias",    icon:Icon.incidencias},
  {key:"supervisiones",  label:"Supervisiones",  icon:Icon.supervisiones},
  {key:"remuneraciones", label:"Remuneraciones", icon:Icon.remuneraciones},
  {key:"informes",       label:"Informes IA",    icon:Icon.informes},
];

/* ─── Componentes base ──────────────────────────────────────── */
function Tag({text, scheme}) {
  const s = scheme||{bg:"#f3f4f6",text:C.textMuted,border:C.border};
  return <span style={{background:s.bg,color:s.text,border:`1px solid ${s.border}`,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",letterSpacing:"0.3px"}}>{text}</span>;
}
function KPICard({label,value,sub,color}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px",boxShadow:C.shadow}}>
      <p style={{color:C.textMuted,fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:8}}>{label}</p>
      <p style={{color:color||C.text,fontSize:26,fontWeight:700,lineHeight:1,marginBottom:4}}>{value}</p>
      {sub&&<p style={{color:C.textDim,fontSize:11,marginTop:6}}>{sub}</p>}
    </div>
  );
}
function PageHeader({title,subtitle,action}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
      <div>
        <h1 style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 3px"}}>{title}</h1>
        {subtitle&&<p style={{color:C.textMuted,fontSize:12,margin:0}}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Panel({children,title,count,action,noPad}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,boxShadow:C.shadow,overflow:"hidden",marginBottom:16}}>
      {(title||action)&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",borderBottom:`1px solid ${C.borderLight}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {title&&<span style={{fontWeight:600,fontSize:13,color:C.text}}>{title}</span>}
            {count!==undefined&&<span style={{background:C.accentBg,color:C.accent,fontSize:11,fontWeight:600,padding:"1px 7px",borderRadius:10}}>{count}</span>}
          </div>
          {action}
        </div>
      )}
      <div style={noPad?{}:{padding:"16px 18px"}}>{children}</div>
    </div>
  );
}
function DataTable({cols,rows,empty="Sin registros"}) {
  if(!rows.length) return <div style={{textAlign:"center",color:C.textMuted,padding:"36px 0",fontSize:13}}>—<br/>{empty}</div>;
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",fontSize:13}}>
        <thead>
          <tr style={{background:C.surfaceAlt}}>
            {cols.map(c=><th key={c.key} style={{color:C.textMuted,fontWeight:500,fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",padding:"10px 16px",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={i} style={{borderBottom:`1px solid ${C.borderLight}`}}>
              {cols.map(c=><td key={c.key} style={{padding:"10px 16px",color:C.text,verticalAlign:"middle"}}>{c.render?c.render(r):r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function FormCard({children,accent,onSave,onCancel,saveLabel="Guardar"}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${accent||C.accent}`,borderRadius:8,padding:20,marginBottom:16,boxShadow:`0 0 0 3px ${(accent||C.accent)}14`}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>{children}</div>
      <div style={{display:"flex",gap:8,paddingTop:8,borderTop:`1px solid ${C.borderLight}`}}>
        <PrimaryBtn onClick={onSave} color={accent}>{saveLabel}</PrimaryBtn>
        <SecondaryBtn onClick={onCancel}>Cancelar</SecondaryBtn>
      </div>
    </div>
  );
}
function FL({label,children,span}) {
  return (
    <div style={span?{gridColumn:"1/-1"}:{}}>
      <label style={{display:"block",color:C.textMuted,fontSize:11,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5}}>{label}</label>
      {children}
    </div>
  );
}
const INP={width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",color:C.text,fontSize:13,boxSizing:"border-box"};
function PrimaryBtn({onClick,children,disabled,color,small}){
  return <button onClick={onClick} disabled={disabled} style={{background:disabled?"#e5e7eb":(color||C.accent),color:"#fff",border:"none",borderRadius:6,padding:small?"5px 12px":"7px 16px",fontSize:12,fontWeight:600,cursor:disabled?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:5}}>{children}</button>;
}
function SecondaryBtn({onClick,children,small}){
  return <button onClick={onClick} style={{background:C.surface,color:C.textMuted,border:`1px solid ${C.border}`,borderRadius:6,padding:small?"5px 12px":"7px 14px",fontSize:12,fontWeight:500,cursor:"pointer"}}>{children}</button>;
}
function DangerBtn({onClick,children}){
  return <button onClick={onClick} style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{children}</button>;
}
function AlertBanner({type,message}){
  const s=type==="warning"?{bg:C.yellowBg,border:C.yellowBorder,text:C.yellow,icon:"⚠"}:{bg:C.redBg,border:C.redBorder,text:C.red,icon:"✕"};
  return <div style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:7,padding:"10px 16px",marginBottom:16,display:"flex",gap:10,alignItems:"center"}}><span style={{color:s.text,fontWeight:700}}>{s.icon}</span><span style={{color:s.text,fontSize:12}}>{message}</span></div>;
}
function Spinner(){
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.pageBg,gap:14}}>
    <div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <p style={{color:C.textMuted,fontSize:13}}>Conectando con Supabase…</p>
  </div>;
}

/* ─── Hook de datos ─────────────────────────────────────────── */
const TABLES=["trabajadores","contratos","dependencias","checklist","evidencias","incidencias","supervisiones","tasas_afp","parametros_legales","liquidaciones"];

function useData(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [dbMode,setDbMode]=useState(false);

  const loadAll=useCallback(async()=>{
    if(!isConfigured){setData({});setLoading(false);return;}
    setLoading(true);
    try{
      const res=await Promise.all(TABLES.map(t=>supabase.from(t).select("*").order("id")));
      const d={};
      TABLES.forEach((t,i)=>{d[t]=res[i].data||[];});
      setData(d);setDbMode(true);
    }catch{setData({});}
    setLoading(false);
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  const save=useCallback(async(table,record,isUpdate=false)=>{
    if(!isConfigured||!dbMode)return false;
    const{error}=isUpdate?await supabase.from(table).update(record).eq("id",record.id):await supabase.from(table).insert(record);
    if(error){alert("Error: "+error.message);return false;}
    await loadAll();return true;
  },[dbMode,loadAll]);

  const saveRem=useCallback(async(record)=>{
    if(!isConfigured||!dbMode)return false;
    const{error}=await supabase.from("liquidaciones").upsert(record,{onConflict:"periodo,trabajador_id,contrato_id"});
    if(error){alert("Error: "+error.message);return false;}
    await loadAll();return true;
  },[dbMode,loadAll]);

  return{data,loading,dbMode,insert:(t,r)=>save(t,r,false),update:(t,r)=>save(t,r,true),saveRem,reload:loadAll};
}

function genId(p){return `${p}${Date.now()}`;}

/* ─── Selector de contrato ──────────────────────────────────── */
function ContractSelector({contratos,selected,onSelect}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{color:C.textMuted,fontSize:12,whiteSpace:"nowrap"}}>Vista:</span>
      <select value={selected||""} onChange={e=>onSelect(e.target.value)}
        style={{...INP,width:"auto",minWidth:180,padding:"6px 10px",fontSize:12,cursor:"pointer",background:C.surfaceAlt}}>
        <option value="">Todos los contratos</option>
        {contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
      </select>
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────── */
function Dashboard({data,contratoId}){
  const hoy=new Date().toISOString().slice(0,10);
  const chks=(contratoId?data.checklist.filter(c=>c.contrato_id===contratoId):data.checklist).filter(c=>c.activa);
  const diaria=chks.filter(c=>c.periodicidad==="DIARIA");
  const evHoy=(contratoId?data.evidencias.filter(e=>e.contrato_id===contratoId):data.evidencias).filter(e=>e.fecha_hora?.startsWith(hoy));
  const incs=contratoId?data.incidencias.filter(i=>i.contrato_id===contratoId):data.incidencias;
  const incAb=incs.filter(i=>i.estado==="Abierta").length;
  const sups=contratoId?data.supervisiones.filter(s=>s.contrato_id===contratoId):data.supervisiones;
  const cumPr=sups.length?Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length):0;
  const ct=contratoId?data.contratos.find(c=>c.id===contratoId):null;
  const xPer=chks.reduce((a,c)=>({...a,[c.periodicidad]:(a[c.periodicidad]||0)+1}),{});

  return(
    <div>
      <PageHeader title="Dashboard operacional"
        subtitle={ct?`${ct.cliente} · ${ct.instalacion} · ${ct.direccion}`:"LEG Servicios de Limpieza — Vista consolidada"} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
        <KPICard label="Cumplimiento" value={`${cumPr}%`} sub="Prom. supervisiones" color={cumPr>=90?C.green:cumPr>=70?C.yellow:C.red}/>
        <KPICard label="Ejecución hoy" value={`${evHoy.length}/${diaria.length}`} sub="Tareas diarias" color={C.accent}/>
        <KPICard label="Incidencias abiertas" value={incAb} sub={incAb===0?"Sin pendientes":"Requieren atención"} color={incAb>0?C.red:C.green}/>
        <KPICard label="Contratos vigentes" value={data.contratos.filter(c=>c.activo&&c.estado==="Vigente").length} sub="Activos"/>
        <KPICard label="Trabajadores" value={data.trabajadores.filter(t=>t.activo).length} sub="Activos"/>
        <KPICard label="Dependencias" value={contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId&&d.activo).length:data.dependencias.filter(d=>d.activo).length} sub="En control"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <Panel title="Distribución de tareas" noPad>
          <div style={{padding:"14px 18px"}}>
            {Object.keys(PTAG).filter(p=>xPer[p]).map(p=>(
              <div key={p} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{flex:1,background:C.borderLight,borderRadius:3,height:6,overflow:"hidden"}}>
                  <div style={{width:`${((xPer[p]||0)/chks.length)*100}%`,height:"100%",background:PTAG[p].text,borderRadius:3}}/>
                </div>
                <Tag text={p} scheme={PTAG[p]}/>
                <span style={{color:C.textMuted,fontSize:12,minWidth:22,textAlign:"right",fontWeight:600}}>{xPer[p]}</span>
              </div>
            ))}
            {!chks.length&&<p style={{color:C.textDim,fontSize:13}}>Sin tareas</p>}
          </div>
        </Panel>
        <Panel title="Incidencias recientes" noPad>
          <div style={{padding:"4px 0"}}>
            {incs.slice(-5).reverse().map(inc=>{
              const dep=data.dependencias.find(d=>d.id===inc.dep_id);
              const ctt=data.contratos.find(c=>c.id===inc.contrato_id);
              return(
                <div key={inc.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",borderBottom:`1px solid ${C.borderLight}`}}>
                  <div>
                    <p style={{color:C.text,fontWeight:500,marginBottom:2}}>{inc.tipo}</p>
                    <p style={{color:C.textDim,fontSize:11}}>{ctt?.cliente?.split(" ").slice(0,2).join(" ")} · {dep?.nombre}</p>
                  </div>
                  <Tag text={inc.estado} scheme={ESTAG[inc.estado]}/>
                </div>
              );
            })}
            {!incs.length&&<p style={{color:C.textDim,fontSize:13,padding:"16px 18px"}}>Sin incidencias</p>}
          </div>
        </Panel>
      </div>
      <Panel title="Últimas evidencias" noPad>
        <DataTable
          cols={[
            {key:"tarea",label:"Tarea",render:r=>{const c=data.checklist.find(ch=>ch.id===r.checklist_id);return<span style={{fontWeight:500}}>{c?.tarea||"—"}</span>;}},
            {key:"contrato",label:"Contrato",render:r=>{const c=data.contratos.find(ct=>ct.id===r.contrato_id);return<span style={{color:C.textMuted}}>{c?.cliente?.split(" ").slice(0,3).join(" ")}</span>;}},
            {key:"trabajador",label:"Trabajador",render:r=>{const t=data.trabajadores.find(w=>w.id===r.trabajador_id);return t?.nombre.split(" ").slice(0,2).join(" ")||"—";}},
            {key:"hora",label:"Hora",render:r=><span style={{color:C.textMuted,fontVariantNumeric:"tabular-nums"}}>{r.fecha_hora?.split("T")[1]?.slice(0,5)||"—"}</span>},
            {key:"estado",label:"Estado",render:r=><Tag text={r.cumplido?"Cumplido":"Pendiente"} scheme={r.cumplido?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:C.redBg,text:C.red,border:C.redBorder}}/>},
          ]}
          rows={[...evHoy].reverse().slice(0,6)}
          empty="No hay evidencias registradas hoy"
        />
      </Panel>
    </div>
  );
}

/* ─── Contratos ─────────────────────────────────────────────── */
const ESTADOS_CT=["Vigente","Postulación","Renovación","Inactivo"];
function Contratos({data,insert,update}){
  const [form,setForm]=useState(null);
  const isNew=form&&!data.contratos.find(c=>c.id===form.id);
  const openNew=()=>setForm({id:genId("CT"),cliente:"",instalacion:"",direccion:"",supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||"",estado:"Vigente",activo:true});
  const save=async()=>{if(!form.cliente.trim())return;const ok=isNew?await insert("contratos",form):await update("contratos",form);if(ok)setForm(null);};
  return(
    <div>
      <PageHeader title="Contratos" subtitle={`${data.contratos.length} registrados`} action={<PrimaryBtn onClick={openNew}>+ Nuevo contrato</PrimaryBtn>}/>
      {form&&(
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel={isNew?"Crear":"Actualizar"}>
          <FL label="Cliente / Institución"><input style={INP} value={form.cliente} onChange={e=>setForm({...form,cliente:e.target.value})} placeholder="Ej: Seremi de Transportes"/></FL>
          <FL label="Instalación"><input style={INP} value={form.instalacion} onChange={e=>setForm({...form,instalacion:e.target.value})} placeholder="Ej: Sucursal Arica"/></FL>
          <FL label="Dirección"><input style={INP} value={form.direccion} onChange={e=>setForm({...form,direccion:e.target.value})} placeholder="Ej: Chacabuco Nº901"/></FL>
          <FL label="Estado"><select style={INP} value={form.estado} onChange={e=>setForm({...form,estado:e.target.value,activo:["Vigente","Renovación"].includes(e.target.value)})}>{ESTADOS_CT.map(s=><option key={s}>{s}</option>)}</select></FL>
          <FL label="Supervisor"><select style={INP} value={form.supervisor_id||""} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Sin asignar —</option>{data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></FL>
          <FL label="ID Licitación"><input style={INP} value={form.licitacion_id||""} onChange={e=>setForm({...form,licitacion_id:e.target.value})} placeholder="Ej: 892200-1-LE26"/></FL>
        </FormCard>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"id",label:"ID",render:r=><code style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 6px",fontSize:11,color:C.textMuted}}>{r.id}</code>},
            {key:"cliente",label:"Cliente",render:r=><span style={{fontWeight:500}}>{r.cliente}</span>},
            {key:"instalacion",label:"Instalación",render:r=><span style={{color:C.textMuted}}>{r.instalacion}</span>},
            {key:"estado",label:"Estado",render:r=><Tag text={r.estado} scheme={ECTAG[r.estado]}/>},
            {key:"deps",label:"Dep.",render:r=><span style={{color:C.textMuted}}>{data.dependencias.filter(d=>d.contrato_id===r.id).length}</span>},
            {key:"tareas",label:"Tareas",render:r=><span style={{color:C.textMuted}}>{data.checklist.filter(c=>c.contrato_id===r.id).length}</span>},
            {key:"edit",label:"",render:r=><button onClick={()=>setForm({...r})} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>},
          ]}
          rows={data.contratos}
        />
      </Panel>
    </div>
  );
}

/* ─── Dependencias ──────────────────────────────────────────── */
function Dependencias({data,contratoId,insert,update}){
  const [form,setForm]=useState(null);
  const [filtroC,setFiltroC]=useState(contratoId||"");
  useEffect(()=>{if(contratoId)setFiltroC(contratoId);},[contratoId]);
  const rows=filtroC?data.dependencias.filter(d=>d.contrato_id===filtroC):data.dependencias;
  const isNew=form&&!data.dependencias.find(d=>d.id===form.id);
  const openNew=()=>{const ctId=filtroC||data.contratos[0]?.id||"";setForm({id:genId("DEP"),contrato_id:ctId,nombre:"",qr:"",activo:true});};
  const save=async()=>{if(!form.nombre.trim())return;const ok=isNew?await insert("dependencias",{...form,qr:form.qr||`QR-${form.id}`}):await update("dependencias",form);if(ok)setForm(null);};
  return(
    <div>
      <PageHeader title="Dependencias" subtitle="Áreas y espacios por contrato"
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select value={filtroC} onChange={e=>setFiltroC(e.target.value)} style={{...INP,width:"auto",padding:"6px 10px",fontSize:12,background:C.surfaceAlt}}>
            <option value="">Todos los contratos</option>
            {data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
          <PrimaryBtn onClick={openNew}>+ Nueva</PrimaryBtn>
        </div>}
      />
      {form&&(
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel={isNew?"Crear":"Actualizar"} accent={C.purple}>
          <FL label="Contrato"><select style={INP} value={form.contrato_id} onChange={e=>setForm({...form,contrato_id:e.target.value})}>{data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}</select></FL>
          <FL label="Nombre del área"><input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Baños Piso 1"/></FL>
        </FormCard>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"contrato",label:"Contrato",render:r=>{const c=data.contratos.find(ct=>ct.id===r.contrato_id);return<span style={{color:C.textMuted}}>{c?.cliente?.split(" ").slice(0,3).join(" ")}</span>;}},
            {key:"nombre",label:"Área / Dependencia",render:r=><span style={{fontWeight:500}}>{r.nombre}</span>},
            {key:"tareas",label:"Tareas",render:r=><span style={{color:C.textMuted}}>{data.checklist.filter(c=>c.dep_id===r.id).length}</span>},
            {key:"activo",label:"Estado",render:r=><Tag text={r.activo?"Activa":"Inactiva"} scheme={r.activo?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:"#f9fafb",text:C.textMuted,border:C.border}}/>},
            {key:"edit",label:"",render:r=><button onClick={()=>setForm({...r})} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>},
          ]}
          rows={rows}
          empty="No hay dependencias para este filtro"
        />
      </Panel>
    </div>
  );
}

/* ─── Trabajadores ──────────────────────────────────────────── */
const AFP_LIST=["NO COTIZA","CAPITAL","CUPRUM","HABITAT","PLANVITAL","PROVIDA","MODELO","UNO"];
const SALUD_LIST=["FONASA","ISAPRE BANMEDICA","ISAPRE COLMENA","ISAPRE CONSALUD","ISAPRE CRUZ BLANCA","ISAPRE NUEVA MASVIDA","ISAPRE VIDA TRES"];
function Trabajadores({data,insert,update}){
  const [form,setForm]=useState(null);
  const [tab,setTab]=useState("datos");
  const isNew=form&&!data.trabajadores.find(t=>t.id===form.id);
  const openNew=()=>{setTab("datos");setForm({id:genId("TR"),nombre:"",cargo:"Auxiliar Aseo",telefono:"",email:"",activo:true,rut:"",sueldo_base:500000,tipo_contrato:"PLAZO FIJO",afp:"MODELO",salud:"FONASA",bono_asistencia:0,bono_movilizacion:0,bono_colacion:0,metodo_gratificacion:"25% MENSUAL",estado:"ACTIVO"});};
  const save=async()=>{if(!form.nombre.trim())return;const ok=isNew?await insert("trabajadores",form):await update("trabajadores",form);if(ok)setForm(null);};
  return(
    <div>
      <PageHeader title="Trabajadores" subtitle={`${data.trabajadores.filter(t=>t.activo).length} activos`} action={<PrimaryBtn onClick={openNew}>+ Nuevo trabajador</PrimaryBtn>}/>
      {form&&(
        <div style={{background:C.surface,border:`1px solid ${C.accent}`,borderRadius:8,padding:20,marginBottom:16,boxShadow:`0 0 0 3px ${C.accent}14`}}>
          <div style={{display:"flex",gap:8,marginBottom:16,borderBottom:`1px solid ${C.borderLight}`,paddingBottom:12}}>
            {["datos","remuneracion"].map(t=><button key={t} onClick={()=>setTab(t)} style={{background:tab===t?C.accent:"transparent",color:tab===t?"#fff":C.textMuted,border:`1px solid ${tab===t?C.accent:C.border}`,borderRadius:6,padding:"5px 14px",fontSize:12,cursor:"pointer",fontWeight:tab===t?600:400}}>{t==="datos"?"Datos personales":"Remuneración"}</button>)}
          </div>
          {tab==="datos"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <FL label="Nombre completo"><input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre Apellido Apellido"/></FL>
              <FL label="RUT"><input style={INP} value={form.rut||""} onChange={e=>setForm({...form,rut:e.target.value})} placeholder="12.345.678-9"/></FL>
              <FL label="Cargo"><select style={INP} value={form.cargo} onChange={e=>setForm({...form,cargo:e.target.value})}><option>Auxiliar Aseo</option><option>Supervisor</option><option>Supervisora</option><option>Jefe de Turno</option></select></FL>
              <FL label="Tipo contrato"><select style={INP} value={form.tipo_contrato||"PLAZO FIJO"} onChange={e=>setForm({...form,tipo_contrato:e.target.value})}><option>PLAZO FIJO</option><option>INDEFINIDO</option><option>HONORARIOS</option></select></FL>
              <FL label="Teléfono"><input style={INP} value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} placeholder="+569XXXXXXXX"/></FL>
              <FL label="Email"><input style={INP} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="correo@empresa.cl"/></FL>
            </div>
          )}
          {tab==="remuneracion"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <FL label="Sueldo base ($)"><input type="number" style={INP} value={form.sueldo_base||0} onChange={e=>setForm({...form,sueldo_base:Number(e.target.value)})}/></FL>
              <FL label="Método gratificación"><select style={INP} value={form.metodo_gratificacion||"25% MENSUAL"} onChange={e=>setForm({...form,metodo_gratificacion:e.target.value})}><option>25% MENSUAL</option><option>SIN GRATIFICACIÓN</option></select></FL>
              <FL label="AFP"><select style={INP} value={form.afp||"MODELO"} onChange={e=>setForm({...form,afp:e.target.value})}>{AFP_LIST.map(a=><option key={a}>{a}</option>)}</select></FL>
              <FL label="Salud"><select style={INP} value={form.salud||"FONASA"} onChange={e=>setForm({...form,salud:e.target.value})}>{SALUD_LIST.map(s=><option key={s}>{s}</option>)}</select></FL>
              <FL label="Bono asistencia ($)"><input type="number" style={INP} value={form.bono_asistencia||0} onChange={e=>setForm({...form,bono_asistencia:Number(e.target.value)})}/></FL>
              <FL label="Bono movilización ($)"><input type="number" style={INP} value={form.bono_movilizacion||0} onChange={e=>setForm({...form,bono_movilizacion:Number(e.target.value)})}/></FL>
              <FL label="Bono colación ($)"><input type="number" style={INP} value={form.bono_colacion||0} onChange={e=>setForm({...form,bono_colacion:Number(e.target.value)})}/></FL>
            </div>
          )}
          <div style={{display:"flex",gap:8,paddingTop:8,borderTop:`1px solid ${C.borderLight}`}}>
            <PrimaryBtn onClick={save} color={C.green}>{isNew?"Crear trabajador":"Actualizar"}</PrimaryBtn>
            <SecondaryBtn onClick={()=>setForm(null)}>Cancelar</SecondaryBtn>
          </div>
        </div>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"nombre",label:"Nombre",render:r=><span style={{fontWeight:500}}>{r.nombre}</span>},
            {key:"rut",label:"RUT",render:r=><span style={{color:C.textMuted,fontVariantNumeric:"tabular-nums"}}>{r.rut||"—"}</span>},
            {key:"cargo",label:"Cargo",render:r=><Tag text={r.cargo} scheme={r.cargo==="Supervisor"||r.cargo==="Supervisora"?{bg:C.purpleBg,text:C.purple,border:C.purpleBorder}:{bg:C.accentBg,text:C.accentText,border:"#bfdbfe"}}/>},
            {key:"sueldo",label:"Sueldo Base",render:r=><span style={{fontVariantNumeric:"tabular-nums",color:C.text}}>{r.sueldo_base?clp(r.sueldo_base):"—"}</span>},
            {key:"afp",label:"AFP",render:r=><span style={{color:C.textMuted}}>{r.afp||"—"}</span>},
            {key:"activo",label:"Estado",render:r=><Tag text={r.activo?"Activo":"Inactivo"} scheme={r.activo?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:"#f9fafb",text:C.textMuted,border:C.border}}/>},
            {key:"edit",label:"",render:r=><button onClick={()=>{setTab("datos");setForm({...r});}} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>},
          ]}
          rows={data.trabajadores}
        />
      </Panel>
    </div>
  );
}

/* ─── Checklist ─────────────────────────────────────────────── */
function Checklist({data,contratoId,insert}){
  const [filtro,setFiltro]=useState("TODAS");
  const [form,setForm]=useState(null);
  const hoy=new Date().toISOString().slice(0,10);
  const chks=contratoId?data.checklist.filter(c=>c.contrato_id===contratoId):data.checklist;
  const rows=filtro==="TODAS"?chks:chks.filter(c=>c.periodicidad===filtro);
  const marcar=async(chkId,cId)=>{await insert("evidencias",{id:`EV${Date.now()}`,checklist_id:chkId,trabajador_id:data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora")?.id||data.trabajadores[0]?.id,contrato_id:cId,fecha_hora:new Date().toISOString(),observacion:"",cumplido:true});};
  const openNew=()=>{const deps=contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId):data.dependencias;setForm({id:genId("CHK"),dep_id:deps[0]?.id||"",contrato_id:contratoId||data.contratos[0]?.id||"",tarea:"",periodicidad:"DIARIA",obligatoria:true,activa:true});};
  const save=async()=>{if(!form.tarea.trim())return;const ok=await insert("checklist",form);if(ok)setForm(null);};
  const completadas=chks.filter(c=>c.periodicidad==="DIARIA"&&data.evidencias.some(e=>e.checklist_id===c.id&&e.fecha_hora?.startsWith(hoy)));
  return(
    <div>
      <PageHeader title="Checklist de tareas" subtitle={`${chks.length} tareas · ${completadas.length} completadas hoy`}
        action={<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {["TODAS",...Object.keys(PTAG)].map(p=><button key={p} onClick={()=>setFiltro(p)} style={{background:filtro===p?(PTAG[p]?.text||C.accent):"transparent",color:filtro===p?"#fff":(PTAG[p]?.text||C.textMuted),border:`1px solid ${filtro===p?"transparent":C.border}`,borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:500}}>{p}</button>)}
          <PrimaryBtn onClick={openNew} small>+ Tarea</PrimaryBtn>
        </div>}
      />
      {form&&(
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel="Crear tarea" accent={C.green}>
          <FL label="Contrato"><select style={INP} value={form.contrato_id} onChange={e=>{const deps=data.dependencias.filter(d=>d.contrato_id===e.target.value);setForm({...form,contrato_id:e.target.value,dep_id:deps[0]?.id||""});}}>{data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}</select></FL>
          <FL label="Dependencia"><select style={INP} value={form.dep_id} onChange={e=>setForm({...form,dep_id:e.target.value})}>{data.dependencias.filter(d=>d.contrato_id===form.contrato_id).map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}</select></FL>
          <FL label="Descripción de la tarea" span><input style={INP} value={form.tarea} onChange={e=>setForm({...form,tarea:e.target.value})} placeholder="Ej: Limpieza y desinfección de baños"/></FL>
          <FL label="Periodicidad"><select style={INP} value={form.periodicidad} onChange={e=>setForm({...form,periodicidad:e.target.value})}>{Object.keys(PTAG).map(p=><option key={p}>{p}</option>)}</select></FL>
        </FormCard>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"tarea",label:"Tarea",render:r=><span style={{fontWeight:500}}>{r.tarea}</span>},
            {key:"ctt",label:"Contrato",render:r=>{const c=data.contratos.find(ct=>ct.id===r.contrato_id);return<span style={{color:C.textMuted,fontSize:12}}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>;}},
            {key:"dep",label:"Área",render:r=>{const d=data.dependencias.find(dep=>dep.id===r.dep_id);return<span style={{color:C.textMuted}}>{d?.nombre||"—"}</span>;}},
            {key:"per",label:"Frecuencia",render:r=><Tag text={r.periodicidad} scheme={PTAG[r.periodicidad]}/>},
            {key:"ev",label:"Hoy",render:r=>{
              if(r.periodicidad!=="DIARIA")return<span style={{color:C.textDim}}>—</span>;
              const n=data.evidencias.filter(e=>e.checklist_id===r.id&&e.fecha_hora?.startsWith(hoy)).length;
              return n>0?<Tag text="✓ Hecho" scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>:<button onClick={()=>marcar(r.id,r.contrato_id)} style={{background:C.accentBg,color:C.accent,border:"1px solid #bfdbfe",borderRadius:5,padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>Marcar ✓</button>;
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
const TIPOS=["Falta Insumos","Daño infraestructura","Accidente laboral","Limpieza deficiente","Otro"];
function Incidencias({data,contratoId,insert,update}){
  const [form,setForm]=useState(null);
  const incs=contratoId?data.incidencias.filter(i=>i.contrato_id===contratoId):data.incidencias;
  const ab=incs.filter(i=>i.estado==="Abierta").length;
  const openNew=()=>{const deps=contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId):data.dependencias;setForm({id:genId("IN"),contrato_id:contratoId||data.contratos.find(c=>c.activo)?.id||"",dep_id:deps[0]?.id||"",fecha_hora:new Date().toISOString(),tipo:"Falta Insumos",descripcion:"",estado:"Abierta",trabajador_id:data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora")?.id||data.trabajadores[0]?.id||""});};
  const save=async()=>{if(!form.descripcion.trim())return;const ok=await insert("incidencias",form);if(ok)setForm(null);};
  const cambiarEstado=async(inc,estado)=>update("incidencias",{...inc,estado});
  return(
    <div>
      <PageHeader title="Incidencias" subtitle={`${incs.length} total · ${ab} abiertas`} action={<DangerBtn onClick={openNew}>+ Reportar</DangerBtn>}/>
      {ab>0&&<AlertBanner type="warning" message={`${ab} incidencia${ab>1?"s":""} abierta${ab>1?"s":""} requieren atención.`}/>}
      {form&&(
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel="Registrar" accent={C.red}>
          <FL label="Contrato"><select style={INP} value={form.contrato_id} onChange={e=>{const deps=data.dependencias.filter(d=>d.contrato_id===e.target.value);setForm({...form,contrato_id:e.target.value,dep_id:deps[0]?.id||""});}}>{data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}</select></FL>
          <FL label="Dependencia"><select style={INP} value={form.dep_id} onChange={e=>setForm({...form,dep_id:e.target.value})}>{data.dependencias.filter(d=>d.contrato_id===form.contrato_id).map(d=><option key={d.id} value={d.id}>{d.nombre}</option>)}</select></FL>
          <FL label="Tipo"><select style={INP} value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></FL>
          <FL label="Trabajador"><select style={INP} value={form.trabajador_id} onChange={e=>setForm({...form,trabajador_id:e.target.value})}>{data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></FL>
          <FL label="Descripción" span><textarea rows={3} style={{...INP,resize:"vertical"}} value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Describe la incidencia…"/></FL>
        </FormCard>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"tipo",label:"Tipo",render:r=><span style={{fontWeight:500}}>{r.tipo}</span>},
            {key:"contrato",label:"Contrato",render:r=>{const c=data.contratos.find(ct=>ct.id===r.contrato_id);return<span style={{color:C.textMuted,fontSize:12}}>{c?.cliente?.split(" ").slice(0,2).join(" ")}</span>;}},
            {key:"dep",label:"Área",render:r=>{const d=data.dependencias.find(dep=>dep.id===r.dep_id);return<span style={{color:C.textMuted}}>{d?.nombre}</span>;}},
            {key:"desc",label:"Descripción",render:r=><span style={{color:C.textMuted}}>{r.descripcion||"—"}</span>},
            {key:"fecha",label:"Fecha",render:r=><span style={{color:C.textMuted,fontSize:12}}>{r.fecha_hora?.replace("T"," ").slice(0,16)}</span>},
            {key:"estado",label:"Estado",render:r=><select value={r.estado} onChange={e=>cambiarEstado(r,e.target.value)} style={{background:(ESTAG[r.estado]?.bg||"#f9fafb"),color:(ESTAG[r.estado]?.text||C.textMuted),border:`1px solid ${ESTAG[r.estado]?.border||C.border}`,borderRadius:5,padding:"3px 8px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{["Abierta","En Proceso","Cerrada"].map(s=><option key={s}>{s}</option>)}</select>},
          ]}
          rows={incs}
          empty="Sin incidencias registradas"
        />
      </Panel>
    </div>
  );
}

/* ─── Supervisiones ─────────────────────────────────────────── */
function Supervisiones({data,contratoId,insert}){
  const [form,setForm]=useState(null);
  const sups=contratoId?data.supervisiones.filter(s=>s.contrato_id===contratoId):data.supervisiones;
  const cumPr=sups.length?Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length):0;
  const openNew=()=>setForm({id:genId("SV"),contrato_id:contratoId||data.contratos.find(c=>c.activo)?.id||"",supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||data.trabajadores[0]?.id||"",fecha:new Date().toISOString().slice(0,10),cumplimiento:90,observacion:""});
  const save=async()=>{const ok=await insert("supervisiones",form);if(ok)setForm(null);};
  return(
    <div>
      <PageHeader title="Supervisiones" subtitle={`${sups.length} registradas · Cumplimiento promedio: ${cumPr}%`} action={<PrimaryBtn onClick={openNew} color={C.purple}>+ Nueva supervisión</PrimaryBtn>}/>
      {form&&(
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel="Guardar" accent={C.purple}>
          <FL label="Contrato"><select style={INP} value={form.contrato_id} onChange={e=>setForm({...form,contrato_id:e.target.value})}>{data.contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}</select></FL>
          <FL label="Fecha"><input type="date" style={INP} value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})}/></FL>
          <FL label={`Cumplimiento: ${form.cumplimiento}%`}>
            <div style={{paddingTop:6}}>
              <input type="range" min={0} max={100} value={form.cumplimiento} onChange={e=>setForm({...form,cumplimiento:Number(e.target.value)})} style={{width:"100%",accentColor:C.purple}}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                <span style={{fontSize:10,color:C.textDim}}>0%</span>
                <span style={{fontSize:11,fontWeight:700,color:form.cumplimiento>=90?C.green:form.cumplimiento>=70?C.yellow:C.red}}>{form.cumplimiento}%</span>
                <span style={{fontSize:10,color:C.textDim}}>100%</span>
              </div>
            </div>
          </FL>
          <FL label="Supervisor"><select style={INP} value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}>{data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></FL>
          <FL label="Observaciones" span><textarea rows={3} style={{...INP,resize:"vertical"}} value={form.observacion} onChange={e=>setForm({...form,observacion:e.target.value})} placeholder="Novedades y puntos de mejora…"/></FL>
        </FormCard>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"fecha",label:"Fecha",render:r=><span style={{fontVariantNumeric:"tabular-nums",fontWeight:500}}>{r.fecha}</span>},
            {key:"contrato",label:"Contrato",render:r=>{const c=data.contratos.find(ct=>ct.id===r.contrato_id);return<span style={{color:C.textMuted,fontSize:12}}>{c?.cliente?.split(" ").slice(0,3).join(" ")}</span>;}},
            {key:"supervisor",label:"Supervisor",render:r=>{const s=data.trabajadores.find(t=>t.id===r.supervisor_id);return s?.nombre.split(" ").slice(0,2).join(" ")||"—";}},
            {key:"cum",label:"Cumplimiento",render:r=>(
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:80,background:C.borderLight,borderRadius:3,height:5,overflow:"hidden"}}>
                  <div style={{width:`${r.cumplimiento}%`,height:"100%",borderRadius:3,background:r.cumplimiento>=90?C.green:r.cumplimiento>=70?C.yellow:C.red}}/>
                </div>
                <span style={{fontWeight:700,fontSize:12,color:r.cumplimiento>=90?C.green:r.cumplimiento>=70?C.yellow:C.red}}>{r.cumplimiento}%</span>
              </div>
            )},
            {key:"obs",label:"Observación",render:r=><span style={{color:C.textMuted}}>{r.observacion||"—"}</span>},
          ]}
          rows={sups}
          empty="Sin supervisiones registradas"
        />
      </Panel>
    </div>
  );
}

/* ─── MÓDULO REMUNERACIONES ─────────────────────────────────── */
function calcularLiquidacion(trabajador, params, tasas, input) {
  const { dias_trabajados, horas_extra, otros_haberes, otros_descuentos, contrato_id, periodo } = input;
  const afpRate = tasas.find(a => a.nombre === trabajador.afp) || { tasa_trabajador: 0, sis: 0 };

  // Sueldo proporcional
  const sueldo_prop = Math.round((trabajador.sueldo_base || 0) * dias_trabajados / 30);

  // Gratificación mensual (método 25% mensual, tope 4.75 UTM/12)
  let gratificacion = 0;
  if (trabajador.metodo_gratificacion === "25% MENSUAL") {
    const tope_grat = Math.round(4.75 * (params.utm || 68034) / 12);
    gratificacion = Math.min(Math.round(sueldo_prop * 0.25), tope_grat);
  }

  // Horas extra (50% de recargo sobre valor hora ordinaria)
  const valor_hora = Math.round((trabajador.sueldo_base || 0) / (params.horas_mensuales || 180));
  const horas_extra_valor = Math.round(valor_hora * 1.5 * (horas_extra || 0));

  // Bonos (asistencia solo si trabajó mes completo)
  const bono_asis = dias_trabajados >= 30 ? (trabajador.bono_asistencia || 0) : 0;
  const bono_movil = trabajador.bono_movilizacion || 0;
  const bono_cola = trabajador.bono_colacion || 0;

  // Total haberes
  const total_haberes = sueldo_prop + gratificacion + horas_extra_valor + bono_asis + bono_movil + bono_cola + (otros_haberes || 0);

  // Renta imponible (tope = 84.3 UF)
  const tope_imp = Math.round((params.tope_imponible_uf || 84.3) * (params.uf || 38894));
  const rem_imponible = Math.min(sueldo_prop + gratificacion + horas_extra_valor, tope_imp);

  // Descuentos legales
  const tasa_afp = afpRate.tasa_trabajador || 0;
  const cotiz_afp = Math.round(rem_imponible * tasa_afp);
  const cotiz_salud = Math.round(rem_imponible * 0.07);
  const ces_trabajador = Math.round(rem_imponible * 0.006);
  const total_descuentos = cotiz_afp + cotiz_salud + ces_trabajador + (otros_descuentos || 0);

  // Líquido
  const liquido = total_haberes - total_descuentos;

  // Costo empresa
  const sis = Math.round(rem_imponible * (afpRate.sis || 0));
  const ces_empleador = Math.round(rem_imponible * 0.024);
  const costo_empresa = total_haberes + sis + ces_empleador;

  return {
    periodo, trabajador_id: trabajador.id, contrato_id: contrato_id || null,
    dias_trabajados: dias_trabajados || 30, horas_extra: horas_extra || 0,
    otros_haberes: otros_haberes || 0, otros_descuentos: otros_descuentos || 0,
    sueldo_base: trabajador.sueldo_base || 0, sueldo_proporcional: sueldo_prop,
    gratificacion, horas_extra_valor, bono_asistencia: bono_asis,
    bono_movilizacion: bono_movil, bono_colacion: bono_cola,
    total_haberes, rem_imponible, afp: trabajador.afp,
    tasa_afp, cotiz_afp, cotiz_salud, ces_trabajador,
    total_descuentos, liquido, sis, ces_empleador, costo_empresa,
  };
}

function SlipRow({ label, value, bold, color, indent, divider }) {
  return (
    <>
      {divider && <tr><td colSpan={2} style={{ borderTop: `1px solid ${C.border}`, padding: "4px 0" }} /></tr>}
      <tr>
        <td style={{ padding: "4px 12px 4px 0", color: indent ? C.textMuted : C.text, fontSize: 13, paddingLeft: indent ? 16 : 0 }}>{label}</td>
        <td style={{ padding: "4px 0", textAlign: "right", fontWeight: bold ? 700 : 400, color: color || C.text, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{value}</td>
      </tr>
    </>
  );
}

function Remuneraciones({ data, saveRem }) {
  const hoy = new Date();
  const periodoDefault = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const [tId, setTId] = useState("");
  const [cId, setCId] = useState("");
  const [periodo, setPeriodo] = useState(periodoDefault);
  const [dias, setDias] = useState(30);
  const [hextra, setHextra] = useState(0);
  const [otrosH, setOtrosH] = useState(0);
  const [otrosD, setOtrosD] = useState(0);
  const [res, setRes] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const slipRef = useRef();

  const params = (data.parametros_legales || [])[0];
  const tasas = data.tasas_afp || [];
  const liqList = data.liquidaciones || [];
  const trabajador = data.trabajadores.find(t => t.id === tId);

  const calcular = () => {
    if (!trabajador || !params) { alert("Selecciona un trabajador y verifica que los parámetros legales estén cargados."); return; }
    setRes(calcularLiquidacion(trabajador, params, tasas, { dias_trabajados: dias, horas_extra: hextra, otros_haberes: otrosH, otros_descuentos: otrosD, contrato_id: cId, periodo }));
    setSaved(false);
  };

  const guardar = async () => {
    if (!res) return;
    setSaving(true);
    const ok = await saveRem(res);
    if (ok) setSaved(true);
    setSaving(false);
  };

  const imprimir = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Liquidación ${periodo}</title><style>body{font-family:sans-serif;font-size:13px;padding:20px}table{width:100%;border-collapse:collapse}td{padding:4px 8px}h2{margin-bottom:4px}hr{margin:8px 0}</style></head><body>${slipRef.current?.innerHTML}</body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div>
      <PageHeader title="Remuneraciones" subtitle="Liquidaciones de sueldo · Ley del Trabajo Chile" />

      {!params && <AlertBanner type="warning" message="No se encontraron parámetros legales (UF, UTM, IMM). Ejecuta el SQL de remuneraciones en Supabase." />}

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>

        {/* ── Calculadora ── */}
        <Panel title="Calculadora de liquidación">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FL label="Trabajador(a)">
              <select style={INP} value={tId} onChange={e => { setTId(e.target.value); setRes(null); }}>
                <option value="">— Seleccionar —</option>
                {data.trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            {trabajador && (
              <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", fontSize: 12 }}>
                <p style={{ color: C.textMuted }}><b style={{ color: C.text }}>Sueldo base:</b> {clp(trabajador.sueldo_base)}</p>
                <p style={{ color: C.textMuted }}><b style={{ color: C.text }}>AFP:</b> {trabajador.afp} · <b style={{ color: C.text }}>Salud:</b> {trabajador.salud}</p>
                <p style={{ color: C.textMuted }}><b style={{ color: C.text }}>Gratificación:</b> {trabajador.metodo_gratificacion}</p>
              </div>
            )}
            <FL label="Contrato (opcional)">
              <select style={INP} value={cId} onChange={e => setCId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {data.contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Período (AAAA-MM)">
              <input style={INP} value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="2026-05" />
            </FL>
            <FL label={`Días trabajados: ${dias}`}>
              <input type="range" min={1} max={30} value={dias} onChange={e => setDias(Number(e.target.value))} style={{ width: "100%", accentColor: C.accent }} />
            </FL>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FL label="Horas extra"><input type="number" min={0} style={INP} value={hextra} onChange={e => setHextra(Number(e.target.value))} /></FL>
              <FL label="Otros haberes ($)"><input type="number" min={0} style={INP} value={otrosH} onChange={e => setOtrosH(Number(e.target.value))} /></FL>
              <FL label="Otros descuentos ($)"><input type="number" min={0} style={INP} value={otrosD} onChange={e => setOtrosD(Number(e.target.value))} /></FL>
            </div>
            {params && (
              <div style={{ background: C.accentBg, border: "1px solid #bfdbfe", borderRadius: 6, padding: "8px 12px", fontSize: 11 }}>
                <p style={{ color: C.accentText }}><b>UF:</b> {clp(params.uf)} · <b>UTM:</b> {clp(params.utm)} · <b>IMM:</b> {clp(params.imm)}</p>
                <p style={{ color: C.accentText }}><b>Período:</b> {params.periodo}</p>
              </div>
            )}
            <PrimaryBtn onClick={calcular} color={C.accent} disabled={!tId}>⚡ Calcular liquidación</PrimaryBtn>
          </div>
        </Panel>

        {/* ── Liquidación ── */}
        <div>
          {res ? (
            <Panel title={`Liquidación · ${periodo} · ${trabajador?.nombre}`}
              action={
                <div style={{ display: "flex", gap: 8 }}>
                  <SecondaryBtn onClick={imprimir} small>🖨 Imprimir</SecondaryBtn>
                  {!saved
                    ? <PrimaryBtn onClick={guardar} disabled={saving} color={C.green} small>{saving ? "Guardando…" : "💾 Guardar"}</PrimaryBtn>
                    : <Tag text="✓ Guardada" scheme={{ bg: C.greenBg, text: C.green, border: C.greenBorder }} />}
                </div>
              }
            >
              <div ref={slipRef}>
                <div style={{ marginBottom: 16, padding: "12px 16px", background: C.surfaceAlt, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  <p style={{ fontWeight: 700, fontSize: 14, color: C.text }}>LEG Servicios de Limpieza EIRL</p>
                  <p style={{ color: C.textMuted, fontSize: 12 }}>RUT Empresa: 78.086.977-1 · Arica, Región de Arica y Parinacota</p>
                  <hr style={{ margin: "8px 0", border: "none", borderTop: `1px solid ${C.border}` }} />
                  <p style={{ color: C.text, fontSize: 12 }}><b>Trabajador/a:</b> {trabajador?.nombre} · <b>RUT:</b> {trabajador?.rut || "—"}</p>
                  <p style={{ color: C.text, fontSize: 12 }}><b>Cargo:</b> {trabajador?.cargo} · <b>Contrato:</b> {trabajador?.tipo_contrato} · <b>Período:</b> {periodo}</p>
                  <p style={{ color: C.text, fontSize: 12 }}><b>Días trabajados:</b> {res.dias_trabajados} · <b>AFP:</b> {res.afp} · <b>Salud:</b> {trabajador?.salud}</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* HABERES */}
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 12, color: C.green, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Haberes</p>
                    <table style={{ width: "100%" }}>
                      <tbody>
                        <SlipRow label="Sueldo base" value={clp(res.sueldo_base)} />
                        {res.dias_trabajados < 30 && <SlipRow label={`Sueldo proporcional (${res.dias_trabajados}/30)`} value={clp(res.sueldo_proporcional)} indent />}
                        <SlipRow label="Gratificación legal" value={clp(res.gratificacion)} indent />
                        {res.horas_extra_valor > 0 && <SlipRow label={`Horas extra (${res.horas_extra} hrs)`} value={clp(res.horas_extra_valor)} indent />}
                        {res.bono_asistencia > 0 && <SlipRow label="Bono asistencia" value={clp(res.bono_asistencia)} indent />}
                        {res.bono_movilizacion > 0 && <SlipRow label="Bono movilización" value={clp(res.bono_movilizacion)} indent />}
                        {res.bono_colacion > 0 && <SlipRow label="Bono colación" value={clp(res.bono_colacion)} indent />}
                        {res.otros_haberes > 0 && <SlipRow label="Otros haberes" value={clp(res.otros_haberes)} indent />}
                        <SlipRow label="TOTAL HABERES" value={clp(res.total_haberes)} bold color={C.green} divider />
                        <SlipRow label="Renta imponible" value={clp(res.rem_imponible)} indent />
                      </tbody>
                    </table>
                  </div>

                  {/* DESCUENTOS */}
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 12, color: C.red, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Descuentos legales</p>
                    <table style={{ width: "100%" }}>
                      <tbody>
                        <SlipRow label={`AFP ${res.afp} (${pct(res.tasa_afp)})`} value={clp(res.cotiz_afp)} />
                        <SlipRow label="Salud (7.00%)" value={clp(res.cotiz_salud)} />
                        <SlipRow label="Seguro Cesantía trab. (0.60%)" value={clp(res.ces_trabajador)} />
                        {res.otros_descuentos > 0 && <SlipRow label="Otros descuentos" value={clp(res.otros_descuentos)} />}
                        <SlipRow label="TOTAL DESCUENTOS" value={clp(res.total_descuentos)} bold color={C.red} divider />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* LÍQUIDO */}
                <div style={{ marginTop: 16, padding: "14px 20px", background: C.accentBg, border: `2px solid ${C.accent}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: C.accent }}>LÍQUIDO A PAGAR</span>
                  <span style={{ fontWeight: 800, fontSize: 22, color: C.accent, fontVariantNumeric: "tabular-nums" }}>{clp(res.liquido)}</span>
                </div>

                {/* COSTO EMPRESA */}
                <div style={{ marginTop: 12, padding: "12px 16px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  <p style={{ fontWeight: 600, fontSize: 12, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Costo empresa</p>
                  <table style={{ width: "100%" }}>
                    <tbody>
                      <SlipRow label="Total haberes" value={clp(res.total_haberes)} />
                      <SlipRow label={`SIS ${res.afp} (${pct(tasas.find(a=>a.nombre===res.afp)?.sis||0)})`} value={clp(res.sis)} />
                      <SlipRow label="Seguro Cesantía empl. (2.40%)" value={clp(res.ces_empleador)} />
                      <SlipRow label="COSTO TOTAL EMPRESA" value={clp(res.costo_empresa)} bold color={C.purple} divider />
                    </tbody>
                  </table>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel>
              <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
                <p style={{ fontWeight: 600, marginBottom: 6, color: C.text }}>Calculadora de liquidaciones</p>
                <p style={{ fontSize: 12 }}>Selecciona un trabajador, ingresa los datos del mes y haz clic en "Calcular liquidación"</p>
              </div>
            </Panel>
          )}

          {/* Historial */}
          <Panel title="Historial de liquidaciones" count={liqList.length} noPad>
            <DataTable
              cols={[
                {key:"periodo",   label:"Período",    render:r=><span style={{fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{r.periodo}</span>},
                {key:"trabajador",label:"Trabajador",  render:r=>{const t=data.trabajadores.find(w=>w.id===r.trabajador_id);return t?.nombre.split(" ").slice(0,2).join(" ")||"—";}},
                {key:"contrato",  label:"Contrato",    render:r=>{const c=data.contratos.find(ct=>ct.id===r.contrato_id);return<span style={{color:C.textMuted,fontSize:12}}>{c?.cliente?.split(" ").slice(0,2).join(" ")||"—"}</span>;}},
                {key:"dias",      label:"Días",        render:r=><span style={{color:C.textMuted}}>{r.dias_trabajados}</span>},
                {key:"haberes",   label:"Total Haberes",render:r=><span style={{fontVariantNumeric:"tabular-nums"}}>{clp(r.total_haberes)}</span>},
                {key:"desc",      label:"Descuentos",  render:r=><span style={{color:C.red,fontVariantNumeric:"tabular-nums"}}>{clp(r.total_descuentos)}</span>},
                {key:"liquido",   label:"Líquido",     render:r=><span style={{fontWeight:700,color:C.accent,fontVariantNumeric:"tabular-nums"}}>{clp(r.liquido)}</span>},
                {key:"costo",     label:"Costo Empresa",render:r=><span style={{color:C.purple,fontVariantNumeric:"tabular-nums"}}>{clp(r.costo_empresa)}</span>},
              ]}
              rows={[...liqList].reverse()}
              empty="Sin liquidaciones generadas"
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ─── Informes IA ───────────────────────────────────────────── */
function InformesIA({data,contratoId}){
  const [tipo,setTipo]=useState("operacional");
  const [informe,setInforme]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const ct=contratoId?data.contratos.find(c=>c.id===contratoId):null;
  const hoy=new Date().toISOString().slice(0,10);
  const chks=(ct?data.checklist.filter(c=>c.contrato_id===ct.id):data.checklist).filter(c=>c.activa);
  const evHoy=(ct?data.evidencias.filter(e=>e.contrato_id===ct.id):data.evidencias).filter(e=>e.fecha_hora?.startsWith(hoy));
  const sups=ct?data.supervisiones.filter(s=>s.contrato_id===ct.id):data.supervisiones;
  const incs=(ct?data.incidencias.filter(i=>i.contrato_id===ct.id):data.incidencias).filter(i=>i.estado==="Abierta");
  const cumPr=sups.length?Math.round(sups.reduce((a,s)=>a+s.cumplimiento,0)/sups.length):0;
  const sup=data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora");
  const aux=data.trabajadores.find(t=>t.cargo!=="Supervisor"&&t.cargo!=="Supervisora");
  const prompts={
    operacional:`Genera un informe operacional diario profesional para LEG Servicios de Limpieza.\n\nContrato: ${ct?.cliente||"Todos los contratos"}\nInstalación: ${ct?.instalacion||""} — ${ct?.direccion||""}\nTrabajador: ${aux?.nombre||"—"}\nSupervisor: ${sup?.nombre||"—"}\nTareas diarias ejecutadas hoy: ${evHoy.length} de ${chks.filter(c=>c.periodicidad==="DIARIA").length}\nCumplimiento promedio supervisiones: ${cumPr}%\nIncidencias abiertas: ${incs.length} (${incs.map(i=>i.tipo).join(", ")||"ninguna"})\nDependencias: ${ct?data.dependencias.filter(d=>d.contrato_id===ct.id).length:data.dependencias.length}\n\nRedacta en español, estilo formal y profesional, con secciones: Resumen ejecutivo, Actividades realizadas, Incidencias, Recomendaciones. Máximo 350 palabras.`,
    licitacion:`Redacta un párrafo técnico convincente para una licitación pública de aseo${ct?` para ${ct.cliente}`:""}, describiendo el sistema de control y trazabilidad de LEG Servicios de Limpieza: registro digital de evidencias con timestamp, checklist por dependencia con periodicidades configurables, sistema de incidencias con seguimiento de estados, supervisiones con % de cumplimiento verificable, y módulo de remuneraciones integrado con cálculo de liquidaciones según normativa laboral chilena. El sistema opera en tiempo real desde dispositivos móviles. Estilo formal y convincente, máximo 200 palabras en español.`,
    analisis:`Analiza los datos operacionales de LEG Servicios de Limpieza${ct?` — ${ct.cliente}`:""} y entrega exactamente 3 observaciones clave y 3 recomendaciones concretas y accionables:\n- ${evHoy.length} de ${chks.filter(c=>c.periodicidad==="DIARIA").length} tareas diarias completadas hoy\n- ${data.incidencias.length} incidencias totales, ${incs.length} actualmente abiertas\n- Tipos: ${[...new Set(data.incidencias.map(i=>i.tipo))].join(", ")||"ninguno"}\n- Cumplimiento promedio: ${cumPr}%\n\nSé específico, práctico y directo. En español.`,
  };
  const generar=async()=>{setLoading(true);setInforme("");setError("");try{const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompts[tipo]}]})});const json=await res.json();if(json.error)throw new Error(json.error.message);setInforme(json.content?.map(b=>b.text||"").join("")||"Sin respuesta.");}catch(e){setError("Error al conectar. Verifica tu conexión.");}setLoading(false);};
  const tipos=[{key:"operacional",label:"Informe diario"},{key:"licitacion",label:"Texto licitación"},{key:"analisis",label:"Análisis y recomendaciones"}];
  return(
    <div>
      <PageHeader title="Informes con IA" subtitle="Generación automática de documentos profesionales a partir de datos reales"/>
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {tipos.map(t=><button key={t.key} onClick={()=>setTipo(t.key)} style={{background:tipo===t.key?C.accent:C.surface,color:tipo===t.key?"#fff":C.textMuted,border:`1px solid ${tipo===t.key?C.accent:C.border}`,borderRadius:6,padding:"8px 18px",fontSize:13,cursor:"pointer",fontWeight:tipo===t.key?600:400}}>{t.label}</button>)}
      </div>
      <PrimaryBtn onClick={generar} disabled={loading}>{loading?"Generando…":"⚡ Generar con IA"}</PrimaryBtn>
      {error&&<AlertBanner type="error" message={error}/>}
      {informe&&(
        <Panel title="Documento generado" action={<button onClick={()=>navigator.clipboard?.writeText(informe)} style={{color:C.accent,background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 12px",fontSize:12,cursor:"pointer"}}>Copiar texto</button>}>
          <div style={{color:C.text,fontSize:13,lineHeight:1.9,whiteSpace:"pre-wrap",maxWidth:760}}>{informe}</div>
        </Panel>
      )}
    </div>
  );
}

/* ─── App principal ─────────────────────────────────────────── */
export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [contratoId,setContratoId]=useState("");
  const {data,loading,dbMode,insert,update,saveRem}=useData();

  if(loading||!data)return<Spinner/>;

  const contratos=data.contratos||[];
  const incAb=(contratoId?data.incidencias?.filter(i=>i.contrato_id===contratoId&&i.estado==="Abierta"):data.incidencias?.filter(i=>i.estado==="Abierta"))?.length||0;

  return(
    <div style={{minHeight:"100vh",background:C.pageBg,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif"}}>
      {/* ── Barra superior ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{width:30,height:30,background:C.accent,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14}}>L</div>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:C.text,letterSpacing:"-0.3px"}}>LimpiApp Pro</div>
              <div style={{fontSize:10,color:C.textDim,lineHeight:1}}>LEG Servicios de Limpieza</div>
            </div>
          </div>
          <ContractSelector contratos={contratos} selected={contratoId} onSelect={setContratoId}/>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:dbMode?C.green:C.yellow}}/>
            <span style={{fontSize:11,color:C.textMuted}}>{dbMode?"Supabase conectado":"Modo demo"}</span>
          </div>
        </div>
        {/* Tabs */}
        <div style={{maxWidth:1280,margin:"0 auto",padding:"0 24px",display:"flex",gap:0,overflowX:"auto"}}>
          {TABS.map(t=>{const active=tab===t.key;return(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",borderBottom:active?`2px solid ${C.accent}`:"2px solid transparent",color:active?C.accent:C.textMuted,padding:"10px 14px",fontSize:12,cursor:"pointer",fontWeight:active?600:400,whiteSpace:"nowrap",flexShrink:0}}>
              <span style={{opacity:active?1:0.6}}>{t.icon}</span>{t.label}
              {t.key==="incidencias"&&incAb>0&&<span style={{background:C.red,color:"#fff",borderRadius:9,fontSize:10,padding:"1px 5px",fontWeight:700,marginLeft:2}}>{incAb}</span>}
            </button>
          );})}
        </div>
      </div>
      {/* ── Contenido ── */}
      <div style={{maxWidth:1280,margin:"0 auto",padding:"28px 24px"}}>
        {!isConfigured&&<AlertBanner type="warning" message="Modo demostración — configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel."/>}
        {tab==="dashboard"      &&<Dashboard      data={data} contratoId={contratoId}/>}
        {tab==="contratos"      &&<Contratos       data={data} insert={insert} update={update}/>}
        {tab==="dependencias"   &&<Dependencias    data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="trabajadores"   &&<Trabajadores    data={data} insert={insert} update={update}/>}
        {tab==="checklist"      &&<Checklist       data={data} contratoId={contratoId} insert={insert}/>}
        {tab==="incidencias"    &&<Incidencias     data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="supervisiones"  &&<Supervisiones   data={data} contratoId={contratoId} insert={insert}/>}
        {tab==="remuneraciones" &&<Remuneraciones  data={data} saveRem={saveRem}/>}
        {tab==="informes"       &&<InformesIA      data={data} contratoId={contratoId}/>}
      </div>
    </div>
  );
}
