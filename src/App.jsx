import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isConfigured } from "./supabase.js";
import { useAuth } from "./contexts/AuthContext.jsx";
import Login from "./components/Login.jsx";
import PortalTrabajador from "./components/PortalTrabajador.jsx";
import { UserMenu } from "./components/ProtectedRoute.jsx";

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
  {key:"contratos",      label:"C. Costo",      icon:Icon.contratos},
  {key:"dependencias",   label:"Dependencias",   icon:Icon.dependencias},
  {key:"trabajadores",   label:"Trabajadores",   icon:Icon.trabajadores},
  {key:"evidencias",     label:"Evidencias",     icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>},
  {key:"qr",             label:"QR Operacional", icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/></svg>},
  {key:"asistencia",     label:"Asistencia",     icon:Icon.checklist},
  {key:"checklist",      label:"Checklist",      icon:Icon.checklist},
  {key:"incidencias",    label:"Incidencias",    icon:Icon.incidencias},
  {key:"supervisiones",  label:"Supervisiones",  icon:Icon.supervisiones},
  {key:"remuneraciones", label:"Remuneraciones", icon:Icon.remuneraciones},
  {key:"cumplimiento",   label:"Cumplimiento",   icon:Icon.incidencias},
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
              {cols.map(c=><td key={c.key} style={{padding:"10px 16px",color:C.text,verticalAlign:"middle"}}>{c.render?c.render(r,i):r[c.key]}</td>)}
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
const TABLES=["trabajadores","contratos","dependencias","checklist","evidencias","incidencias","supervisiones","tasas_afp","parametros_legales","liquidaciones","asignaciones","tabla_iusc","horarios","asistencia","feriados_chile","obligaciones_mensuales"];

function useData(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [dbMode,setDbMode]=useState(false);

  const loadAll=useCallback(async()=>{
    if(!isConfigured){setData({});setLoading(false);return;}
    setLoading(true);
    try{
      const res=await Promise.allSettled(TABLES.map(t=>supabase.from(t).select("*").order("id")));
      const d={};
      TABLES.forEach((t,i)=>{d[t]=res[i].status==="fulfilled"?(res[i].value.data||[]):[];});
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
/* ─── Días Hábiles Chile (Lun-Sáb, excl. domingos y feriados) ── */
// Feriados se cargan desde tabla feriados_chile en Supabase
// Fallback hardcodeado para cuando la tabla no está disponible
const FERIADOS_FALLBACK = new Set([
  '2026-01-01','2026-04-03','2026-04-04','2026-05-01','2026-05-21',
  '2026-06-29','2026-07-16','2026-08-15','2026-09-18','2026-09-19',
  '2026-10-12','2026-10-31','2026-11-01','2026-12-08','2026-12-25',
]);
function buildFeriadosSet(feriadosDB=[]) {
  if(feriadosDB.length>0) return new Set(feriadosDB.map(f=>f.fecha?.split('T')[0]));
  return FERIADOS_FALLBACK;
}
function esDiaHabil(f, feriadosSet=FERIADOS_FALLBACK){
  if(f.getDay()===0) return false; // Domingo
  return !feriadosSet.has(f.toISOString().split('T')[0]);
}
function sumarDiasHabiles(fechaBase, n, feriadosSet=FERIADOS_FALLBACK){
  let f=new Date(fechaBase); f.setHours(12,0,0,0);
  f.setDate(f.getDate()+1);
  let count=0;
  while(count<n){ if(esDiaHabil(f,feriadosSet)) count++; if(count<n) f.setDate(f.getDate()+1); }
  return f;
}
function diasHabilesEntre(desde, hasta, feriadosSet=FERIADOS_FALLBACK){
  let f=new Date(desde); f.setHours(12,0,0,0); f.setDate(f.getDate()+1);
  const h=new Date(hasta); h.setHours(12,0,0,0);
  let count=0;
  while(f<=h){ if(esDiaHabil(f,feriadosSet)) count++; f.setDate(f.getDate()+1); }
  return count;
}
function calcAlertaLicitacion(termino, diasAlerta=60, feriadosSet=FERIADOS_FALLBACK){
  if(!termino) return null;
  const hoy=new Date(); hoy.setHours(12,0,0,0);
  const fin=new Date(termino.split('T')[0]+'T12:00:00');
  const diasCal=Math.round((fin-hoy)/(1000*60*60*24));
  const diasHab=diasHabilesEntre(hoy,fin,feriadosSet);
  let nivel='normal';
  if(diasCal<=0)                               nivel='vencida';
  else if(diasHab<=Math.round(diasAlerta*0.5)) nivel='roja';
  else if(diasHab<=Math.round(diasAlerta*0.7)) nivel='naranja';
  else if(diasHab<=diasAlerta)                 nivel='amarilla';
  return {diasCal, diasHab, nivel};
}
function calcAlertaFiniquito(fechaSeparacion, feriadosSet=FERIADOS_FALLBACK){
  if(!fechaSeparacion) return null;
  const base=new Date(fechaSeparacion.split('T')[0]+'T12:00:00');
  const hoy=new Date(); hoy.setHours(12,0,0,0);
  const legal=sumarDiasHabiles(base,10,feriadosSet);
  const objetivo=sumarDiasHabiles(base,8,feriadosSet);
  const diasRestLegal=diasHabilesEntre(hoy,legal,feriadosSet);
  const diasRestObj=diasHabilesEntre(hoy,objetivo,feriadosSet);
  const diasTranscurridos=diasHabilesEntre(base,hoy,feriadosSet);
  let semaforo='verde';
  if(diasRestLegal<=0)    semaforo='vencido';
  else if(diasRestObj<=0) semaforo='rojo';
  else if(diasRestObj<=2) semaforo='naranja';
  else if(diasRestObj<=5) semaforo='amarillo';
  const fmtD=d=>d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'});
  return {legal,objetivo,diasRestLegal,diasRestObj,diasTranscurridos,semaforo,fmtLegal:fmtD(legal),fmtObjetivo:fmtD(objetivo)};
}

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

      {/* ── Panel de Alertas Críticas ── */}
      {(()=>{
        const hoy=new Date(); hoy.setHours(12,0,0,0);
        const feriadosSet=buildFeriadosSet(data.feriados_chile||[]);

        // PANEL 1: Vencimiento de licitaciones
        const alertasLic=(data.contratos||[]).filter(c=>c.fecha_termino_contrato&&c.activo).map(c=>{
          const a=calcAlertaLicitacion(c.fecha_termino_contrato, c.dias_alerta||60, feriadosSet);
          return{...c, alerta:a};
        }).filter(c=>c.alerta&&c.alerta.nivel!=='normal').sort((a,b)=>a.alerta.diasCal-b.alerta.diasCal);

        // PANEL 2: Finiquitos pendientes por trabajador (fecha_separacion individual)
        const alertasFin=(data.trabajadores||[]).filter(t=>
          t.fecha_separacion && t.finiquito_estado && t.finiquito_estado!=='firmado' && t.finiquito_estado!=='na'
        ).map(t=>{
          const af=calcAlertaFiniquito(t.fecha_separacion, feriadosSet);
          return{...t, af};
        }).filter(t=>t.af).sort((a,b)=>a.af.diasRestLegal-b.af.diasRestLegal);

        if(!alertasLic.length && !alertasFin.length) return null;

        const NIVEL={
          vencida: {bg:'#f5f3ff',text:'#6d28d9',icon:'⚫',label:'Vencida'},
          roja:    {bg:'#fef2f2',text:'#991b1b',icon:'🚨',label:'Crítico'},
          naranja: {bg:'#fff7ed',text:'#9a3412',icon:'🟠',label:'Urgente'},
          amarilla:{bg:'#fefce8',text:'#92400e',icon:'⚠️',label:'Atención'},
        };
        const SEM={
          vencido: {bg:'#f5f3ff',text:'#6d28d9',icon:'⚫'},
          rojo:    {bg:'#fef2f2',text:'#991b1b',icon:'🔴'},
          naranja: {bg:'#fff7ed',text:'#9a3412',icon:'🟠'},
          amarillo:{bg:'#fefce8',text:'#92400e',icon:'🟡'},
          verde:   {bg:'#f0fdf4',text:'#166534',icon:'🟢'},
        };
        return(
          <div style={{marginBottom:20,display:'flex',flexDirection:'column',gap:12}}>

            {/* PANEL 2 — Finiquitos por trabajador */}
            {alertasFin.length>0&&(
              <div style={{background:'#fef2f2',border:'2px solid #fca5a5',borderRadius:8,padding:'12px 16px'}}>
                <p style={{fontWeight:700,color:'#991b1b',fontSize:13,marginBottom:10}}>🚨 FINIQUITOS PENDIENTES</p>
                {alertasFin.map((t,i)=>{
                  const s=SEM[t.af.semaforo]||SEM.verde;
                  const dia=Math.min(t.af.diasTranscurridos+1,10);
                  return(
                    <div key={i} style={{background:s.bg,border:`1px solid`,borderColor:s.text+'40',borderRadius:6,padding:'10px 12px',marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div>
                          <span style={{fontWeight:700,color:s.text,fontSize:13}}>{s.icon} {t.nombre}</span>
                          <span style={{fontSize:11,color:s.text,marginLeft:8}}>Separación: {new Date(t.fecha_separacion.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}</span>
                          {t.motivo_termino&&<span style={{fontSize:11,color:s.text,marginLeft:8}}>· {t.motivo_termino}</span>}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:s.text,whiteSpace:'nowrap'}}>
                          {t.af.diasRestLegal<=0?'⚫ VENCIDO':`Día ${dia} de 10`}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:s.text,marginTop:6,display:'flex',gap:16}}>
                        <span>🎯 Objetivo empresa: <b>{t.af.fmtObjetivo}</b></span>
                        <span>⚖️ Máximo legal: <b>{t.af.fmtLegal}</b></span>
                        <span>{t.af.diasRestLegal>0?`${t.af.diasRestLegal} día(s) hábil(es) restante(s)`:'PLAZO VENCIDO'}</span>
                      </div>
                      <div style={{fontSize:11,color:s.text,marginTop:4,display:'flex',gap:12}}>
                        <span style={{opacity:0.7}}>Estado: <b>{t.finiquito_estado||'pendiente'}</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* PANEL 1 — Vencimiento licitaciones */}
            {alertasLic.length>0&&(
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'12px 16px'}}>
                <p style={{fontWeight:700,color:'#92400e',fontSize:13,marginBottom:8}}>⚠️ VENCIMIENTO DE LICITACIONES</p>
                {alertasLic.map((c,i)=>{
                  const n=NIVEL[c.alerta.nivel]||NIVEL.amarilla;
                  const trab=(data.asignaciones||[]).filter(a=>a.contrato_id===c.id&&a.afecta_remuneracion!==false&&a.estado_asig==='activa').length;
                  return(
                    <div key={i} style={{background:n.bg,borderRadius:6,padding:'8px 12px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <span style={{fontWeight:600,color:n.text}}>{n.icon} {c.id} — {c.cliente}</span>
                        <span style={{fontSize:11,color:n.text,marginLeft:8}}>
                          Vence {new Date(c.fecha_termino_contrato.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}
                        </span>
                        {trab>0&&<span style={{fontSize:11,color:n.text,marginLeft:8}}>· {trab} trabajador(es) activo(s)</span>}
                        {c.probabilidad_renovacion&&<span style={{fontSize:11,color:n.text,marginLeft:8}}>· Renovación: {c.probabilidad_renovacion}</span>}
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:n.text,whiteSpace:'nowrap'}}>
                        {c.alerta.diasCal<=0?'VENCIDA':`${c.alerta.diasHab} d. háb.`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* PANEL 3 — Cumplimiento mensual */}
            {(()=>{
              const oblsAlert=(data.obligaciones_mensuales||[]).filter(o=>{
                if(o.estado==='pagado') return false;
                const vence=new Date(o.fecha_vence); vence.setHours(12,0,0,0);
                const diasCal=Math.round((vence-hoy)/(1000*60*60*24));
                return diasCal<=5;
              }).sort((a,b)=>new Date(a.fecha_vence)-new Date(b.fecha_vence));
              if(!oblsAlert.length) return null;
              return(
                <div style={{background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:8,padding:'12px 16px'}}>
                  <p style={{fontWeight:700,color:'#6d28d9',fontSize:13,marginBottom:8}}>💼 VENCIMIENTOS TRIBUTARIOS Y PREVISIONALES</p>
                  {oblsAlert.map((o,i)=>{
                    const vence=new Date(o.fecha_vence); vence.setHours(12,0,0,0);
                    const diasCal=Math.round((vence-hoy)/(1000*60*60*24));
                    const col=diasCal<0?'#dc2626':diasCal===0?'#dc2626':diasCal<=2?'#c2410c':'#b45309';
                    const ico=diasCal<0?'⚫':diasCal===0?'🔴':diasCal<=2?'🟠':'⚠️';
                    return(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #ede9fe'}}>
                        <span style={{fontSize:12,color:'#5b21b6'}}>{ico} {o.nombre}</span>
                        <span style={{fontSize:12,fontWeight:700,color:col}}>
                          {diasCal<0?`Vencida ${Math.abs(diasCal)}d`:diasCal===0?'HOY':`${diasCal} días`}
                          <span style={{fontSize:10,fontWeight:400,color:'#6d28d9',marginLeft:6}}>{vence.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
        <KPICard label="Cumplimiento" value={`${cumPr}%`} sub="Prom. supervisiones" color={cumPr>=90?C.green:cumPr>=70?C.yellow:C.red}/>
        <KPICard label="Ejecución hoy" value={`${evHoy.length}/${diaria.length}`} sub="Tareas diarias" color={C.accent}/>
        <KPICard label="Incidencias abiertas" value={incAb} sub={incAb===0?"Sin pendientes":"Requieren atención"} color={incAb>0?C.red:C.green}/>
        <KPICard label="Contratos vigentes" value={data.contratos.filter(c=>c.activo&&c.estado==="Vigente").length} sub="Activos"/>
        <KPICard label="Trabajadores activos" value={data.trabajadores.filter(t=>t.activo).length} sub={`Desvinculados: ${data.trabajadores.filter(t=>!t.activo&&t.estado==='DESVINCULADO').length}`} color={C.accent}/>
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

/* ─── Centros de Costo (Contratos) ──────────────────────────── */
const ESTADOS_CT=["Vigente","Postulación","Renovación","Inactivo"];
const TIPO_CENTRO_TAG={
  'LICITACION': {bg:'#eff6ff',text:'#1d4ed8',border:'#bfdbfe',label:'Licitación'},
  'CORPORATIVO':{bg:'#f5f3ff',text:'#7c3aed',border:'#ddd6fe',label:'Corporativo'},
  'EVENTUAL':   {bg:'#fef9c3',text:'#b45309',border:'#fde68a',label:'Eventual'},
};
const FINANC_TAG={
  'financiado':         {bg:'#f0fdf4',text:'#15803d',border:'#86efac',icon:'🟢'},
  'parcial':            {bg:'#fef9c3',text:'#b45309',border:'#fde68a',icon:'🟡'},
  'sin_financiamiento': {bg:'#fef2f2',text:'#dc2626',border:'#fca5a5',icon:'🔴'},
  'en_riesgo':          {bg:'#fff7ed',text:'#c2410c',border:'#fed7aa',icon:'🟠'},
  'cerrado':            {bg:'#f9fafb',text:'#94a3b8',border:'#e2e8f0',icon:'⚫'},
};
function Contratos({data,insert,update}){
  const [form,setForm]=useState(null);
  const isNew=form&&!data.contratos.find(c=>c.id===form.id);
  const openNew=()=>setForm({id:genId("CT"),cliente:"",instalacion:"",direccion:"",supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||"",estado:"Vigente",activo:true,tipo_centro_costo:"LICITACION",estado_financiero:"financiado"});
  const save=async()=>{if(!form.cliente.trim())return;const ok=isNew?await insert("contratos",form):await update("contratos",form);if(ok)setForm(null);};
  const nLic=data.contratos.filter(c=>!c.tipo_centro_costo||c.tipo_centro_costo==="LICITACION").length;
  const nCorp=data.contratos.filter(c=>c.tipo_centro_costo==="CORPORATIVO").length;
  const nEvt=data.contratos.filter(c=>c.tipo_centro_costo==="EVENTUAL").length;
  return(
    <div>
      <PageHeader title="Centros de Costo" subtitle={`${nLic} licitacion${nLic!==1?'es':''} · ${nCorp} corporativo${nCorp!==1?'s':''} · ${nEvt} eventual${nEvt!==1?'es':''}`} action={<PrimaryBtn onClick={openNew}>+ Nuevo centro</PrimaryBtn>}/>
      {form&&(
        <FormCard onSave={save} onCancel={()=>setForm(null)} saveLabel={isNew?"Crear":"Actualizar"}>
          <FL label="Cliente / Institución"><input style={INP} value={form.cliente} onChange={e=>setForm({...form,cliente:e.target.value})} placeholder="Ej: Seremi de Transportes"/></FL>
          <FL label="Instalación"><input style={INP} value={form.instalacion} onChange={e=>setForm({...form,instalacion:e.target.value})} placeholder="Ej: Sucursal Arica"/></FL>
          <FL label="Dirección"><input style={INP} value={form.direccion} onChange={e=>setForm({...form,direccion:e.target.value})} placeholder="Ej: Chacabuco Nº901"/></FL>
          <FL label="Tipo de centro"><select style={INP} value={form.tipo_centro_costo||"LICITACION"} onChange={e=>setForm({...form,tipo_centro_costo:e.target.value})}><option value="LICITACION">Licitación</option><option value="CORPORATIVO">Corporativo</option><option value="EVENTUAL">Eventual</option></select></FL>
          <FL label="Estado"><select style={INP} value={form.estado} onChange={e=>setForm({...form,estado:e.target.value,activo:["Vigente","Renovación"].includes(e.target.value)})}>{ESTADOS_CT.map(s=><option key={s}>{s}</option>)}</select></FL>
          <FL label="Financiamiento"><select style={INP} value={form.estado_financiero||"financiado"} onChange={e=>setForm({...form,estado_financiero:e.target.value})}><option value="financiado">🟢 Financiado</option><option value="parcial">🟡 Parcial</option><option value="sin_financiamiento">🔴 Sin financiamiento</option><option value="en_riesgo">🟠 En riesgo</option><option value="cerrado">⚫ Cerrado</option></select></FL>
          <FL label="Fecha inicio licitación"><input type="date" style={INP} value={form.fecha_inicio_contrato||""} onChange={e=>setForm({...form,fecha_inicio_contrato:e.target.value})}/></FL>
          <FL label="Fecha término licitación"><input type="date" style={INP} value={form.fecha_termino_contrato||""} onChange={e=>setForm({...form,fecha_termino_contrato:e.target.value})}/></FL>
          <FL label="Probabilidad renovación"><select style={INP} value={form.probabilidad_renovacion||"media"} onChange={e=>setForm({...form,probabilidad_renovacion:e.target.value})}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option><option value="descartada">Descartada</option></select></FL>
          <FL label="Estado renovación"><select style={INP} value={form.estado_renovacion||"pendiente"} onChange={e=>setForm({...form,estado_renovacion:e.target.value})}><option value="vigente">Vigente</option><option value="en evaluacion">En evaluación</option><option value="pendiente">Pendiente</option><option value="adjudicada otra">Adjudicada otra empresa</option><option value="renovada">Renovada</option><option value="cerrada">Cerrada</option></select></FL>
          <FL label="Días de alerta (aviso anticipado)"><input type="number" min={30} max={180} style={INP} value={form.dias_alerta||60} onChange={e=>setForm({...form,dias_alerta:Number(e.target.value)})}/></FL>
          <FL label="Supervisor"><select style={INP} value={form.supervisor_id||""} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Sin asignar —</option>{data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></FL>
          <FL label="ID Licitación"><input style={INP} value={form.licitacion_id||""} onChange={e=>setForm({...form,licitacion_id:e.target.value})} placeholder="Ej: 892200-1-LE26"/></FL>
        </FormCard>
      )}
      <Panel noPad>
        <DataTable
          cols={[
            {key:"id",label:"ID",render:r=><code style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 6px",fontSize:11,color:C.textMuted}}>{r.id}</code>},
            {key:"tipo",label:"Tipo",render:r=>{const t=TIPO_CENTRO_TAG[r.tipo_centro_costo||"LICITACION"]||TIPO_CENTRO_TAG["LICITACION"];return<Tag text={t.label} scheme={{bg:t.bg,text:t.text,border:t.border}}/>;}},
            {key:"cliente",label:"Cliente",render:r=><span style={{fontWeight:500}}>{r.cliente}</span>},
            {key:"instalacion",label:"Instalación",render:r=><span style={{color:C.textMuted,fontSize:12}}>{r.instalacion}</span>},
            {key:"estado",label:"Estado",render:r=><Tag text={r.estado} scheme={ECTAG[r.estado]}/>},
            {key:"financ",label:"Financiamiento",render:r=>{const f=FINANC_TAG[r.estado_financiero||"financiado"]||FINANC_TAG["financiado"];return<span style={{fontSize:11,color:f.text,background:f.bg,border:`1px solid ${f.border}`,borderRadius:4,padding:"2px 8px",display:"inline-block",whiteSpace:"nowrap"}}>{f.icon} {(r.estado_financiero||"financiado").replace(/_/g," ")}</span>;}},
            {key:"vence",label:"Vencimiento",render:r=>{
              if(!r.fecha_termino_contrato) return <span style={{color:C.textMuted,fontSize:11}}>—</span>;
              const a=calcAlertaLicitacion(r.fecha_termino_contrato, r.dias_alerta||60);
              const COL={vencida:'#7c3aed',roja:'#dc2626',naranja:'#c2410c',amarilla:'#b45309',normal:'#15803d'};
              const ICO={vencida:'⚫',roja:'🚨',naranja:'🟠',amarilla:'⚠️',normal:'✅'};
              const col=COL[a.nivel]; const ico=ICO[a.nivel];
              return(
                <div style={{fontSize:11}}>
                  <span style={{color:C.textMuted}}>{new Date(r.fecha_termino_contrato).toLocaleDateString('es-CL')}</span>
                  <br/><span style={{color:col,fontWeight:600}}>{ico} {a.diasCal<=0?'Vencida':`${a.diasHab} d. háb.`}</span>
                </div>
              );
            }},
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
function Trabajadores({data,insert,update,contratoId}){
  const [form,setForm]=useState(null);
  const [tab,setTab]=useState("datos");
  const isNew=form&&!data.trabajadores.find(t=>t.id===form.id);
  const asignadosIds=contratoId?(data.asignaciones||[]).filter(a=>a.contrato_id===contratoId&&a.activo).map(a=>a.trabajador_id):null;
  const trabajadoresFiltrados=asignadosIds?data.trabajadores.filter(t=>asignadosIds.includes(t.id)):data.trabajadores;
  const openNew=()=>{setTab("datos");setForm({id:genId("TR"),nombre:"",cargo:"Auxiliar Aseo",telefono:"",email:"",activo:true,rut:"",sueldo_base:500000,tipo_contrato:"PLAZO FIJO",afp:"MODELO",salud:"FONASA",bono_asistencia:0,bono_movilizacion:0,bono_colacion:0,metodo_gratificacion:"25% MENSUAL",estado:"ACTIVO",fecha_inicio:""});};
  const save=async()=>{if(!form.nombre.trim())return;const ok=isNew?await insert("trabajadores",form):await update("trabajadores",form);if(ok)setForm(null);};
  return(
    <div>
      <PageHeader title="Trabajadores" subtitle={contratoId ? `${trabajadoresFiltrados.filter(t=>t.activo).length} asignados` : `${data.trabajadores.filter(t=>t.activo).length} activos`} action={<PrimaryBtn onClick={openNew}>+ Nuevo trabajador</PrimaryBtn>}/>
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
              <FL label="Fecha ingreso a la empresa"><input type="date" style={INP} value={form.fecha_inicio||""} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/></FL>
              {/* Desvinculación */}
              <FL label="Fecha separación laboral"><input type="date" style={INP} value={form.fecha_separacion||""} onChange={e=>setForm({...form,fecha_separacion:e.target.value||null})}/></FL>
              {form.fecha_separacion&&<>
                <FL label="Motivo término"><select style={INP} value={form.motivo_termino||""} onChange={e=>setForm({...form,motivo_termino:e.target.value})}><option value="">— Seleccionar —</option><option value="Art. 159 N°4 Vencimiento plazo">Art. 159 N°4 Vencimiento plazo</option><option value="Art. 161 Necesidades empresa">Art. 161 Necesidades empresa</option><option value="Art. 159 N°1 Mutuo acuerdo">Art. 159 N°1 Mutuo acuerdo</option><option value="Art. 160 Falta grave">Art. 160 Falta grave</option></select></FL>
                <FL label="Estado finiquito"><select style={INP} value={form.finiquito_estado||"pendiente"} onChange={e=>setForm({...form,finiquito_estado:e.target.value})}><option value="pendiente">⏳ Pendiente</option><option value="preparado">📄 Preparado</option><option value="disponible">✅ Disponible trabajador</option><option value="firmado">✍️ Firmado</option></select></FL>
              </>}
            </div>
          )}
          {tab==="remuneracion"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <FL label="Sueldo base ($)"><input type="number" style={INP} value={form.sueldo_base||0} onChange={e=>setForm({...form,sueldo_base:Number(e.target.value)})}/></FL>
              <FL label="Método gratificación">
                <select style={INP} value={form.metodo_gratificacion||"25% MENSUAL"} onChange={e=>setForm({...form,metodo_gratificacion:e.target.value})}>
                  <option value="25% MENSUAL">25% mensual (tope legal UTM)</option>
                  <option value="ANTICIPO PORCENTAJE">Anticipo porcentaje (%)</option>
                  <option value="ANTICIPO MONTO FIJO">Anticipo monto fijo ($)</option>
                  <option value="SIN GRATIFICACIÓN">Sin gratificación (pago anual)</option>
                </select>
              </FL>
              {form.metodo_gratificacion==="ANTICIPO PORCENTAJE" && (
                <FL label="Porcentaje de gratificación (%)">
                  <input type="number" min={0} max={100} step={0.01} style={INP}
                    value={form.gratificacion_porcentaje||25}
                    onChange={e=>setForm({...form,gratificacion_porcentaje:Number(e.target.value)})}
                    placeholder="Ej: 8.33"/>
                </FL>
              )}
              {form.metodo_gratificacion==="ANTICIPO MONTO FIJO" && (
                <FL label="Monto fijo mensual ($)">
                  <input type="number" min={0} style={INP}
                    value={form.gratificacion_monto||0}
                    onChange={e=>setForm({...form,gratificacion_monto:Number(e.target.value)})}
                    placeholder="Ej: 50000"/>
                </FL>
              )}
              <FL label="AFP"><select style={INP} value={form.afp||"MODELO"} onChange={e=>setForm({...form,afp:e.target.value})}>{AFP_LIST.map(a=><option key={a}>{a}</option>)}</select></FL>
              <FL label="Salud"><select style={INP} value={form.salud||"FONASA"} onChange={e=>setForm({...form,salud:e.target.value})}>{SALUD_LIST.map(s=><option key={s}>{s}</option>)}</select></FL>
              <FL label="Bono asistencia ($)"><input type="number" style={INP} value={form.bono_asistencia||0} onChange={e=>setForm({...form,bono_asistencia:Number(e.target.value)})}/></FL>
              <FL label="Bono movilización ($)"><input type="number" style={INP} value={form.bono_movilizacion||0} onChange={e=>setForm({...form,bono_movilizacion:Number(e.target.value)})}/></FL>
              <FL label="Bono colación ($)"><input type="number" style={INP} value={form.bono_colacion||0} onChange={e=>setForm({...form,bono_colacion:Number(e.target.value)})}/></FL>
              <FL label="Tipo de trabajador">
                <select style={INP} value={form.pensionado?"pensionado":"activo"} onChange={e=>setForm({...form,pensionado:e.target.value==="pensionado"})}>
                  <option value="activo">Activo (cotiza AFP y CES)</option>
                  <option value="pensionado">Pensionado (exento AFP y CES)</option>
                </select>
              </FL>
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
            {key:"afp",label:"AFP",render:r=>r.pensionado?<Tag text="PENSIONADO" scheme={{bg:C.purpleBg,text:C.purple,border:C.purpleBorder}}/>:<span style={{color:C.textMuted}}>{r.afp||"—"}</span>},
            {key:"ingreso",label:"Ingreso",render:r=>{
              if(!r.fecha_inicio) return <span style={{color:C.textMuted}}>—</span>;
              const parts=r.fecha_inicio.split('T')[0].split('-');
              const fecha=`${parts[2]}/${parts[1]}/${parts[0]}`;
              const hoy=new Date(); const ini=new Date(r.fecha_inicio);
              const meses=Math.floor((hoy-ini)/(1000*60*60*24*30.44));
              const anios=Math.floor(meses/12); const mRest=meses%12;
              const antig=anios>0?`${anios}a ${mRest}m`:`${meses}m`;
              return <span style={{color:C.textMuted,fontSize:12}}>{fecha}<br/><span style={{color:C.green,fontWeight:600}}>{antig}</span></span>;
            }},
            {key:"activo",label:"Estado",render:r=><Tag text={r.activo?"Activo":"Inactivo"} scheme={r.activo?{bg:C.greenBg,text:C.green,border:C.greenBorder}:{bg:"#f9fafb",text:C.textMuted,border:C.border}}/>},
            {key:"edit",label:"",render:r=><button onClick={()=>{setTab("datos");setForm({...r});}} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>},
          ]}
          rows={trabajadoresFiltrados}
        />
      </Panel>
    </div>
  );
}

/* ─── Checklist ─────────────────────────────────────────────── */
/* ─── Lightbox para fotos ─────────────────────────────────── */
function Lightbox({ url, onClose }) {
  useEffect(()=>{
    const handler = e => { if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  },[onClose]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",maxWidth:"95vw",maxHeight:"95vh"}}>
        <img src={url} alt="Evidencia" style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:8,boxShadow:"0 0 60px rgba(0,0,0,0.8)"}}/>
        <button onClick={onClose} style={{position:"absolute",top:-16,right:-16,background:"#fff",border:"none",borderRadius:"50%",width:32,height:32,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>×</button>
      </div>
    </div>
  );
}

/* ─── QR Components ──────────────────────────────────────────── */

/* Modo QR — interfaz trabajador cuando escanea el QR */
function ModoQR({ depId, data, insert, loading }) {
  const [tId, setTId] = useState('');
  const [marcadas, setMarcadas] = useState(new Set());
  const [gps, setGps] = useState(null);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [obs, setObs] = useState('');
  const [fotos, setFotos] = useState([]); // hasta 3 fotos

  const dep = (data.dependencias||[]).find(d=>d.id===depId);
  const contrato = dep?(data.contratos||[]).find(c=>c.id===dep.contrato_id):null;
  const tareas = dep?(data.checklist||[]).filter(t=>t.dep_id===dep.id&&t.activa):[];
  const trabajadoresContrato = dep
    ? (data.asignaciones||[]).filter(a=>a.contrato_id===dep.contrato_id&&a.activo)
        .map(a=>(data.trabajadores||[]).find(t=>t.id===a.trabajador_id))
        .filter(t=>t&&t.cargo!=="Gerente y Supervisor"&&t.cargo!=="Representante Legal")
    : [];

  useEffect(()=>{
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(
      p=>setGps({lat:p.coords.latitude.toFixed(6),lng:p.coords.longitude.toFixed(6)}),
      ()=>{}
    );
  },[]);

  const toggle = (id) => setMarcadas(prev=>{
    const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;
  });

  const agregarFoto = async (e) => {
    if(fotos.length>=3) return;
    const file = e.target.files[0];
    if(!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    await new Promise(r=>img.onload=r);
    const maxW=1024, scale=Math.min(1,maxW/img.width);
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(img.width*scale);
    canvas.height=Math.round(img.height*scale);
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",0.75));
    const preview=URL.createObjectURL(blob);
    setFotos(prev=>[...prev,{blob,preview}]);
    URL.revokeObjectURL(url);
    e.target.value=""; // reset input para permitir otra foto
  };

  const quitarFoto = (idx) => setFotos(prev=>prev.filter((_,i)=>i!==idx));

  const subirFotos = async (evId) => {
    if(!fotos.length) return null;
    const urls=[];
    for(let i=0;i<fotos.length;i++){
      try{
        const nombre=`${evId}_${i}.jpg`;
        const {error}=await supabase.storage.from("evidencias-fotos").upload(nombre,fotos[i].blob,{contentType:"image/jpeg",upsert:true});
        if(!error){
          const {data}=supabase.storage.from("evidencias-fotos").getPublicUrl(nombre);
          urls.push(data.publicUrl);
        }
      }catch{}
    }
    return urls.length ? JSON.stringify(urls) : null;
  };

  const registrar = async () => {
    if(!tId||marcadas.size===0){alert("Selecciona tu nombre y al menos una tarea completada.");return;}
    setEnviando(true);
    const ahora = new Date().toISOString();
    let fotoUrl = null;
    let primerEv = true;
    for(const chkId of marcadas){
      const evId=`EV${Date.now()}${Math.random().toString(36).slice(2,6)}`;
      if(primerEv && fotos.length){ fotoUrl = await subirFotos(evId); primerEv=false; }
      await insert("evidencias",{
        id:evId, checklist_id:chkId, trabajador_id:tId,
        contrato_id:dep.contrato_id, fecha_hora:ahora,
        observacion:obs||"Registrado vía QR", cumplido:true,
        via_qr:true, latitud:gps?.lat||null, longitud:gps?.lng||null,
        foto:fotoUrl,
      });
      await new Promise(r=>setTimeout(r,50));
    }
    setConfirmado(true); setEnviando(false);
  };

  const mS = {minHeight:"100vh",background:"#0f172a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"24px 16px",fontFamily:"Arial,sans-serif"};
  const card = {background:"#1e293b",borderRadius:12,padding:"20px",width:"100%",maxWidth:420,marginBottom:16};
  const btnG = {background:"#16a34a",color:"#fff",border:"none",borderRadius:10,padding:"16px 24px",fontSize:18,fontWeight:700,width:"100%",cursor:"pointer"};
  const btnD = {background:"#374151",color:"#9ca3af",border:"none",borderRadius:10,padding:"16px 24px",fontSize:18,fontWeight:700,width:"100%",cursor:"not-allowed"};

  if(loading)return<div style={{...mS,justifyContent:"center"}}><div style={{color:"#fff",fontSize:20}}>Cargando...</div></div>;
  if(!dep||!contrato)return<div style={mS}><div style={{color:"#f87171",fontSize:18,textAlign:"center"}}>❌ QR inválido o dependencia no encontrada.<br/>Contacta al supervisor.</div></div>;

  if(confirmado){
    const t=data.trabajadores.find(w=>w.id===tId);
    const ahora=new Date();
    return(
      <div style={mS}>
        <div style={{...card,textAlign:"center",border:"2px solid #16a34a"}}>
          <div style={{fontSize:64,marginBottom:8}}>✅</div>
          <div style={{color:"#4ade80",fontSize:22,fontWeight:700,marginBottom:8}}>¡Registrado!</div>
          <div style={{color:"#fff",fontSize:16,marginBottom:4}}>{t?.nombre||"—"}</div>
          <div style={{color:"#94a3b8",fontSize:14,marginBottom:4}}>{dep.nombre}</div>
          <div style={{color:"#94a3b8",fontSize:14,marginBottom:4}}>{contrato.cliente}</div>
          <div style={{color:"#4ade80",fontSize:15,fontWeight:600,marginBottom:4}}>
            {ahora.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})} hrs — {ahora.toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"})}
          </div>
          <div style={{color:"#94a3b8",fontSize:13}}>{marcadas.size} tarea{marcadas.size!==1?"s":""} registrada{marcadas.size!==1?"s":""}</div>
          {gps&&<div style={{color:"#4ade80",fontSize:12,marginTop:4}}>📍 GPS registrado</div>}
          {fotos.length>0&&<div style={{color:"#4ade80",fontSize:12,marginTop:4}}>📷 {fotos.length} foto{fotos.length>1?"s":""} subida{fotos.length>1?"s":""} al servidor</div>}
        </div>
        <button style={{...btnG,maxWidth:420}} onClick={()=>{setConfirmado(false);setMarcadas(new Set());setObs('');}}>
          + Registrar otra tarea
        </button>
      </div>
    );
  }

  return(
    <div style={mS}>
      {/* Header */}
      <div style={{textAlign:"center",marginBottom:16,width:"100%",maxWidth:420}}>
        <div style={{color:"#3b82f6",fontSize:13,fontWeight:600,letterSpacing:1,marginBottom:4}}>LIMPIAPP PRO · LEG SERVICIOS DE LIMPIEZA</div>
        <div style={{color:"#fff",fontSize:22,fontWeight:700,marginBottom:2}}>{dep.nombre}</div>
        <div style={{color:"#94a3b8",fontSize:14}}>{contrato.cliente}</div>
        <div style={{color:"#64748b",fontSize:12,marginTop:4}}>
          {new Date().toLocaleDateString("es-CL",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}
        </div>
      </div>

      {/* Selector trabajador */}
      <div style={card}>
        <div style={{color:"#94a3b8",fontSize:13,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Trabajador(a)</div>
        <select
          style={{width:"100%",background:"#0f172a",color:"#fff",border:"1px solid #374151",borderRadius:8,padding:"12px",fontSize:16}}
          value={tId} onChange={e=>setTId(e.target.value)}>
          <option value="">— Selecciona tu nombre —</option>
          {trabajadoresContrato.map(t=>(
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
      </div>

      {/* Tareas */}
      <div style={card}>
        <div style={{color:"#94a3b8",fontSize:13,marginBottom:12,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>
          Tareas a registrar ({tareas.length} en esta área)
        </div>
        {tareas.length===0&&<div style={{color:"#64748b",fontSize:14}}>No hay tareas activas para esta área.</div>}
        {tareas.map(t=>(
          <div key={t.id}
            onClick={()=>toggle(t.id)}
            style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"1px solid #334155",cursor:"pointer"}}>
            <div style={{width:28,height:28,borderRadius:6,border:`2px solid ${marcadas.has(t.id)?"#16a34a":"#475569"}`,
              background:marcadas.has(t.id)?"#16a34a":"transparent",
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
              {marcadas.has(t.id)&&<span style={{color:"#fff",fontSize:18,fontWeight:700}}>✓</span>}
            </div>
            <div style={{flex:1}}>
              <div style={{color:marcadas.has(t.id)?"#4ade80":"#f1f5f9",fontSize:15,lineHeight:1.4}}>{t.tarea}</div>
              <div style={{color:"#64748b",fontSize:12,marginTop:2}}>{t.periodicidad}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fotos evidencia — hasta 3 */}
      <div style={card}>
        <div style={{color:"#94a3b8",fontSize:13,marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>
          📷 Fotos del área ({fotos.length}/3)
        </div>
        {/* Miniaturas */}
        {fotos.length>0&&(
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            {fotos.map((f,i)=>(
              <div key={i} style={{position:"relative"}}>
                <img src={f.preview} alt={`foto ${i+1}`} style={{width:80,height:80,objectFit:"cover",borderRadius:8,border:"2px solid #16a34a"}}/>
                <button onClick={()=>quitarFoto(i)}
                  style={{position:"absolute",top:-6,right:-6,background:"#ef4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
            ))}
          </div>
        )}
        {/* Botón agregar foto */}
        {fotos.length<3&&(
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#0f172a",border:"2px dashed #374151",borderRadius:8,padding:"14px",cursor:"pointer"}}>
            <span style={{fontSize:20}}>📷</span>
            <div>
              <div style={{color:"#94a3b8",fontSize:14}}>{fotos.length===0?"Tomar foto del área limpia":"Agregar otra foto"}</div>
              <div style={{color:"#64748b",fontSize:11}}>{fotos.length===0?"Opcional — recomendado para respaldo":""}</div>
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={agregarFoto} style={{display:"none"}}/>
          </label>
        )}
        {fotos.length>0&&<div style={{color:"#4ade80",fontSize:12,marginTop:6}}>✓ {fotos.length} foto{fotos.length>1?"s":""} lista{fotos.length>1?"s":""} para subir</div>}
      </div>

      {/* Observación */}
      <div style={card}>
        <div style={{color:"#94a3b8",fontSize:13,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Observación (opcional)</div>
        <input
          style={{width:"100%",background:"#0f172a",color:"#fff",border:"1px solid #374151",borderRadius:8,padding:"10px",fontSize:14,boxSizing:"border-box"}}
          value={obs} onChange={e=>setObs(e.target.value)}
          placeholder="Ej: requirió producto adicional, vidrios muy sucios..."/>
        {gps&&<div style={{color:"#4ade80",fontSize:12,marginTop:8}}>📍 GPS: {gps.lat}, {gps.lng}</div>}
        {!gps&&<div style={{color:"#64748b",fontSize:12,marginTop:8}}>⚠️ GPS no disponible — se registrará sin coordenadas</div>}
      </div>

      {/* Botón registrar */}
      <div style={{width:"100%",maxWidth:420}}>
        <button
          style={tId&&marcadas.size>0?btnG:btnD}
          onClick={registrar} disabled={enviando||!tId||marcadas.size===0}>
          {enviando?"Registrando...": tId&&marcadas.size>0?`✓ Registrar ${marcadas.size} tarea${marcadas.size!==1?"s":""}`:"Selecciona nombre y tareas"}
        </button>
        <div style={{color:"#475569",fontSize:12,textAlign:"center",marginTop:8}}>
          Registro seguro · {new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})} hrs
        </div>
      </div>
    </div>
  );
}

/* Tab QR — panel administrador */
/* ─── Helper fotos múltiples ────────────────────────────────── */
function parseFotos(foto) {
  if (!foto) return [];
  try { const arr = JSON.parse(foto); return Array.isArray(arr) ? arr : [foto]; }
  catch { return [foto]; }
}

/* ─── Módulo Evidencias ──────────────────────────────────────── */
function TabEvidencias({ data, contratoId }) {
  const hoy = new Date().toLocaleDateString("en-CA", {timeZone:"America/Santiago"});
  const hace7 = new Date(Date.now()-7*86400000).toLocaleDateString("en-CA", {timeZone:"America/Santiago"});
  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(hoy);
  const [filtroT, setFiltroT] = useState("");
  const [filtroC, setFiltroC] = useState(contratoId||"");
  const [soloFoto, setSoloFoto] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const evidencias = (data.evidencias||[])
    .filter(e => {
      const fechaE = new Date(e.fecha_hora).toLocaleDateString("en-CA",{timeZone:"America/Santiago"});
      return fechaE >= desde && fechaE <= hasta
        && (!filtroT || e.trabajador_id === filtroT)
        && (!filtroC || e.contrato_id === filtroC)
        && (!soloFoto || e.foto);
    })
    .sort((a,b) => b.fecha_hora.localeCompare(a.fecha_hora));

  const getNombre = (id, arr, key="nombre") => arr.find(x=>x.id===id)?.[key]||"—";
  const getTarea = (id) => {
    const ch = (data.checklist||[]).find(c=>c.id===id);
    if(!ch) return "—";
    const dep = (data.dependencias||[]).find(d=>d.id===ch.dep_id);
    return { tarea: ch.tarea, dep: dep?.nombre||"—", periodicidad: ch.periodicidad };
  };

  const imprimir = () => {
    const filas = evidencias.map((e,i) => {
      const t = getTarea(e.checklist_id);
      const trab = (data.trabajadores||[]).find(x=>x.id===e.trabajador_id);
      const cont = (data.contratos||[]).find(x=>x.id===e.contrato_id);
      const fecha = new Date(e.fecha_hora).toLocaleString("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
      return `<tr>
        <td>${i+1}</td>
        <td>${fecha}</td>
        <td>${trab?.nombre||"—"}</td>
        <td>${cont?.cliente||"—"}</td>
        <td>${t.dep}</td>
        <td>${t.tarea}</td>
        <td>${t.periodicidad}</td>
        <td style="text-align:center">${e.via_qr?"📱 QR":"Manual"}</td>
        <td style="text-align:center">${parseFotos(e.foto).map(u=>`<img src="${u}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;margin:1px"/>`).join("")}</td>
        <td style="font-size:10px;color:#666">${e.latitud?`${e.latitud},${e.longitud}`:"—"}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Evidencias LEG Servicios de Limpieza</title>
    <style>
      body{font-family:Arial;font-size:11px;margin:16px}
      h2{color:#1e3a8a;margin-bottom:2px}
      h3{color:#64748b;font-weight:normal;margin:0 0 12px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#1e3a8a;color:#fff;padding:5px 6px;text-align:left;font-size:10px}
      td{padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
      tr:nth-child(even){background:#f8fafc}
      .resumen{background:#dbeafe;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px}
      @media print{@page{size:landscape;margin:8mm}}
    </style></head><body>
    <h2>Registro de Evidencias — LimpiApp Pro</h2>
    <h3>LEG Servicios de Limpieza EIRL · RUT 78.086.977-1</h3>
    <div class="resumen">
      <strong>Período:</strong> ${desde} al ${hasta} &nbsp;|&nbsp;
      <strong>Total evidencias:</strong> ${evidencias.length} &nbsp;|&nbsp;
      <strong>Con foto:</strong> ${evidencias.filter(e=>e.foto).length} &nbsp;|&nbsp;
      <strong>Vía QR:</strong> ${evidencias.filter(e=>e.via_qr).length} &nbsp;|&nbsp;
      <strong>Generado:</strong> ${new Date().toLocaleString("es-CL",{timeZone:"America/Santiago"})}
    </div>
    <table>
      <thead><tr>
        <th>N°</th><th>Fecha y hora</th><th>Trabajador</th><th>Contrato</th>
        <th>Área</th><th>Tarea realizada</th><th>Frecuencia</th><th>Origen</th><th>Foto</th><th>GPS</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="margin-top:20px;color:#94a3b8;font-size:9px">
      Documento generado automáticamente desde LimpiApp Pro · ${new Date().toLocaleString("es-CL",{timeZone:"America/Santiago"})}
      · Este documento constituye respaldo oficial de las labores de aseo realizadas por LEG Servicios de Limpieza EIRL.
    </p>
    </body></html>`;

    const w = window.open("","_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),1000);
  };

  return (
    <div>
      {lightbox&&<Lightbox url={lightbox} onClose={()=>setLightbox(null)}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 3px"}}>📋 Registro de Evidencias</h1>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>Historial completo · Respaldo ante mandantes · Exportable a PDF</p>
        </div>
        <button onClick={imprimir}
          style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          🖨 Exportar PDF
        </button>
      </div>

      {/* Filtros */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:16,display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
        <FL label="Desde"><input type="date" style={{...INP,width:140}} value={desde} onChange={e=>setDesde(e.target.value)}/></FL>
        <FL label="Hasta"><input type="date" style={{...INP,width:140}} value={hasta} onChange={e=>setHasta(e.target.value)}/></FL>
        <FL label="Trabajador">
          <select style={{...INP,width:200}} value={filtroT} onChange={e=>setFiltroT(e.target.value)}>
            <option value="">Todos</option>
            {(data.trabajadores||[]).filter(t=>t.activo).map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </FL>
        <FL label="Contrato">
          <select style={{...INP,width:200}} value={filtroC} onChange={e=>setFiltroC(e.target.value)}>
            <option value="">Todos</option>
            {(data.contratos||[]).filter(c=>c.activo).map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
        </FL>
        <div style={{display:"flex",alignItems:"center",gap:6,paddingBottom:4}}>
          <input type="checkbox" id="soloFoto" checked={soloFoto} onChange={e=>setSoloFoto(e.target.checked)} style={{width:15,height:15,accentColor:C.accent}}/>
          <label htmlFor="soloFoto" style={{color:C.text,fontSize:13,cursor:"pointer"}}>Solo con foto 📷</label>
        </div>
      </div>

      {/* Resumen */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:16}}>
        <KPICard label="Total evidencias" value={evidencias.length} color={C.accent}/>
        <KPICard label="Con foto" value={evidencias.filter(e=>parseFotos(e.foto).length>0).length} color={C.green}/>
        <KPICard label="Vía QR" value={evidencias.filter(e=>e.via_qr).length} color={C.purple}/>
        <KPICard label="Con GPS" value={evidencias.filter(e=>e.latitud).length} color={C.yellow}/>
      </div>

      {/* Tabla */}
      <Panel noPad>
        {!evidencias.length ? (
          <div style={{padding:"40px",textAlign:"center",color:C.textMuted}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <p style={{fontWeight:600,color:C.text}}>Sin evidencias para el período seleccionado</p>
            <p style={{fontSize:12}}>Ajusta el rango de fechas o los filtros</p>
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:C.surfaceAlt,borderBottom:`2px solid ${C.border}`}}>
                  {["Fecha y hora","Trabajador","Contrato","Área","Tarea","Frec.","Origen","Foto","GPS"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",color:C.textMuted,fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidencias.map((e,i) => {
                  const t = getTarea(e.checklist_id);
                  const trab = (data.trabajadores||[]).find(x=>x.id===e.trabajador_id);
                  const cont = (data.contratos||[]).find(x=>x.id===e.contrato_id);
                  const fecha = new Date(e.fecha_hora).toLocaleString("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
                  return (
                    <tr key={e.id} style={{borderBottom:`1px solid ${C.borderLight}`,background:i%2===0?C.surface:C.surfaceAlt}}>
                      <td style={{padding:"8px 12px",color:C.text,fontWeight:500,whiteSpace:"nowrap"}}>{fecha}</td>
                      <td style={{padding:"8px 12px",color:C.text}}>{trab?.nombre||"—"}</td>
                      <td style={{padding:"8px 12px",color:C.textMuted,fontSize:11}}>{cont?.cliente||"—"}</td>
                      <td style={{padding:"8px 12px",color:C.textMuted,fontSize:11}}>{t.dep}</td>
                      <td style={{padding:"8px 12px",color:C.text,maxWidth:280,lineHeight:1.3}}>{t.tarea}</td>
                      <td style={{padding:"8px 12px"}}><Tag text={t.periodicidad} scheme={{bg:C.accentBg,text:C.accent,border:"#bfdbfe"}}/></td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        {e.via_qr
                          ? <Tag text="📱 QR" scheme={{bg:"#f3e8ff",text:"#7c3aed",border:"#d8b4fe"}}/>
                          : <Tag text="Manual" scheme={{bg:C.surfaceAlt,text:C.textMuted,border:C.border}}/>}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        {parseFotos(e.foto).length>0
                          ? <div style={{display:"flex",gap:3,justifyContent:"center"}}>
                              {parseFotos(e.foto).map((url,fi)=>(
                                <img key={fi} src={url} alt="ev" onClick={()=>setLightbox(url)}
                                  style={{width:36,height:36,objectFit:"cover",borderRadius:4,cursor:"zoom-in",border:`1px solid ${C.border}`}}/>
                              ))}
                            </div>
                          : <span style={{color:C.textMuted,fontSize:11}}>—</span>}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        {e.latitud
                          ? <a href={`https://maps.google.com/?q=${e.latitud},${e.longitud}`} target="_blank" rel="noreferrer"
                              style={{color:C.accent,fontSize:11,textDecoration:"none"}}>📍 Ver</a>
                          : <span style={{color:C.textMuted,fontSize:11}}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function TabQR({ data, contratoId }) {
  const [filtro, setFiltro] = useState(contratoId||'');
  const BASE = typeof window!=="undefined" ? window.location.origin : "https://limpiapp-pro.vercel.app";

  const contratos = (data.contratos||[]).filter(c=>c.activo);
  const deps = (data.dependencias||[]).filter(d=>d.activo&&(!filtro||d.contrato_id===filtro));

  const qrUrl  = (depId) => `${BASE}?dep=${depId}`;
  const imgUrl = (depId) => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl(depId))}&color=1e3a8a&bgcolor=ffffff`;

  const imprimir = (cId) => {
    const depsC = (data.dependencias||[]).filter(d=>d.contrato_id===cId&&d.activo);
    const c = data.contratos.find(x=>x.id===cId);
    const rows = depsC.map(d=>`
      <div class="qr-card">
        <img src="${imgUrl(d.id)}" alt="QR ${d.nombre}"/>
        <div class="dep-name">${d.nombre}</div>
        <div class="dep-info">${c?.cliente||""}</div>
        <div class="dep-url">${BASE}?dep=${d.id}</div>
      </div>`).join('');
    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>QR ${c?.cliente||''}</title>
    <style>
      body{font-family:Arial;margin:16px;background:#fff}
      h2{color:#1e3a8a;margin-bottom:4px}h3{color:#64748b;font-weight:normal;margin-top:0}
      .grid{display:flex;flex-wrap:wrap;gap:16px}
      .qr-card{border:2px solid #1e3a8a;border-radius:10px;padding:16px;width:200px;text-align:center;page-break-inside:avoid}
      .dep-name{font-weight:700;color:#0f172a;font-size:13px;margin-top:8px}
      .dep-info{color:#64748b;font-size:11px;margin-top:2px}
      .dep-url{color:#94a3b8;font-size:9px;margin-top:4px;word-break:break-all}
      .instruccion{background:#dbeafe;border-radius:8px;padding:12px;margin:12px 0;font-size:12px;color:#1e40af}
      @media print{@page{margin:10mm}.qr-card{border:2px solid #000}}
    </style></head><body>
    <h2>Códigos QR Operacionales — LimpiApp Pro</h2>
    <h3>${c?.cliente||''} · ${c?.instalacion||''} · LEG Servicios de Limpieza EIRL</h3>
    <div class="instruccion">📋 Imprimir, laminar y pegar en cada área. El trabajador escanea con la cámara del celular → marca tareas completadas → confirma.</div>
    <div class="grid">${rows}</div>
    <p style="color:#94a3b8;font-size:10px;margin-top:16px">Generado: ${new Date().toLocaleString("es-CL")} · LimpiApp Pro v1.0</p>
    </body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),800);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 3px"}}>📱 QR Operacionales</h1>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>Genera, imprime y pega en cada área · Los trabajadores escanean para registrar evidencia</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select style={{...INP,width:220}} value={filtro} onChange={e=>setFiltro(e.target.value)}>
            <option value="">Todos los contratos</option>
            {contratos.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
          {filtro&&<button onClick={()=>imprimir(filtro)}
            style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:600}}>
            🖨 Imprimir todos
          </button>}
        </div>
      </div>

      {/* Instrucciones */}
      <div style={{background:C.accentBg,border:"1px solid #bfdbfe",borderRadius:8,padding:"12px 16px",marginBottom:20}}>
        <p style={{color:C.accentText,fontWeight:600,fontSize:13,marginBottom:4}}>¿Cómo usar los códigos QR?</p>
        <p style={{color:C.accentText,fontSize:12,margin:0}}>
          1. Imprime el QR de cada área → lamínalo → pégalo en la puerta o pared visible del área.
          2. El trabajador llega al área, escanea con la cámara del celular.
          3. Se abre la app en el celular → selecciona su nombre → marca las tareas completadas → confirma.
          4. El registro queda guardado con hora exacta, fecha y GPS.
          5. Ante cualquier reclamo del mandante → vas a Checklist → Evidencias → tienes la prueba completa.
        </p>
      </div>

      {/* Grid QR */}
      {!deps.length&&<Panel><div style={{textAlign:"center",padding:"30px",color:C.textMuted}}>Selecciona un contrato para ver sus QR.</div></Panel>}

      {contratos.filter(c=>!filtro||c.id===filtro).map(contrato=>{
        const depsC = deps.filter(d=>d.contrato_id===contrato.id);
        if(!depsC.length)return null;
        return(
          <div key={contrato.id} style={{marginBottom:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <span style={{fontWeight:700,color:C.text,fontSize:15}}>{contrato.cliente}</span>
                <span style={{color:C.textMuted,fontSize:12,marginLeft:8}}>{depsC.length} áreas</span>
              </div>
              <button onClick={()=>imprimir(contrato.id)}
                style={{background:C.surface,color:C.accent,border:`1px solid ${C.accent}`,borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                🖨 Imprimir contrato
              </button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:16}}>
              {depsC.map(dep=>{
                const tareas = (data.checklist||[]).filter(t=>t.dep_id===dep.id&&t.activa);
                return(
                  <div key={dep.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16,textAlign:"center",boxShadow:C.shadow}}>
                    <img src={imgUrl(dep.id)} alt={dep.nombre} style={{width:160,height:160,borderRadius:6}}
                      onError={e=>{e.target.src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='160' height='160' fill='%23f1f5f9'/%3E%3Ctext y='90' x='80' text-anchor='middle' font-size='12' fill='%2394a3b8'%3EQR sin internet%3C/text%3E%3C/svg%3E";}}
                    />
                    <div style={{fontWeight:700,color:C.text,fontSize:13,marginTop:8,lineHeight:1.3}}>{dep.nombre}</div>
                    <div style={{color:C.textMuted,fontSize:11,marginTop:2}}>{tareas.length} tarea{tareas.length!==1?"s":""} activa{tareas.length!==1?"s":""}</div>
                    <div style={{color:C.textMuted,fontSize:10,marginTop:4,wordBreak:"break-all"}}>{qrUrl(dep.id)}</div>
                    <a href={qrUrl(dep.id)} target="_blank" rel="noreferrer"
                      style={{display:"inline-block",marginTop:8,color:C.accent,fontSize:11,textDecoration:"none"}}>
                      👁 Previsualizar
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Helper funciones tiempo ────────────────────────────────── */
function tToMin(t){if(!t)return null;const[h,m]=(t||"").split(":").map(Number);return h*60+m;}
function minToT(m){return`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;}
function horasNet(entrada,salida,colMin){
  const e=tToMin(entrada),s=tToMin(salida);
  if(!e||!s||s<=e)return 0;
  return Math.max(0,((s-e)-colMin)/60);
}

/* ─── Asistencia ─────────────────────────────────────────────── */
function Asistencia({data,contratoId,insert,update}){
  const hoy=new Date().toISOString().slice(0,10);
  const [vista,setVista]=useState("registrar");
  const [tId,setTId]=useState("");
  const [cId,setCId]=useState(contratoId||"");
  const [fecha,setFecha]=useState(hoy);
  const [esFeriado,setEsFeriado]=useState(false);
  const [entrada,setEntrada]=useState("");
  const [colSal,setColSal]=useState("");
  const [colReg,setColReg]=useState("");
  const [salida,setSalida]=useState("");
  const [obs,setObs]=useState("");
  const [saving,setSaving]=useState(false);
  const [filtroMes,setFiltroMes]=useState(hoy.slice(0,7));
  const [filtroTrab,setFiltroTrab]=useState("");

  const trabajador = data.trabajadores.find(t=>t.id===tId);

  // Horario programado para este trabajador+contrato+día
  const diaSemana = fecha ? new Date(fecha+"T12:00:00").getDay() : -1;
  const horario = (data.horarios||[]).find(h=>
    h.trabajador_id===tId && h.contrato_id===cId &&
    h.activo && h.dias_semana.split(",").map(Number).includes(diaSemana)
  );

  // Cálculos en tiempo real
  const colMinutos = colSal&&colReg ? Math.max(0,tToMin(colReg)-tToMin(colSal)) : (horario?.colacion_minutos||0);
  const horasTrabajadas = horasNet(entrada,salida,colMinutos);
  const horasContratadas = horario ? horasNet(horario.hora_entrada,horario.hora_salida,horario.colacion_minutos) : 0;
  const horasExtra = Math.max(0, horasTrabajadas - horasContratadas);
  const atrasoMin = entrada && horario
    ? Math.max(0, tToMin(entrada) - tToMin(horario.hora_entrada))
    : 0;
  const estado = atrasoMin>0?"ATRASO":"PRESENTE";

  // Contratos del trabajador seleccionado
  const contratosT = tId
    ? (data.asignaciones||[]).filter(a=>a.trabajador_id===tId&&a.activo)
        .map(a=>data.contratos.find(c=>c.id===a.contrato_id)).filter(Boolean)
    : [];

  const guardar = async () => {
    if(!tId||!cId||!fecha||!entrada||!salida){alert("Completa todos los campos obligatorios.");return;}
    setSaving(true);
    const id=`AS${tId}${fecha.replace(/-/g,"")}${cId}`;
    await insert("asistencia",{
      id, trabajador_id:tId, contrato_id:cId, fecha,
      hora_entrada:entrada, hora_colacion_salida:colSal||null,
      hora_colacion_regreso:colReg||null, hora_salida:salida,
      atraso_minutos:atrasoMin, horas_trabajadas:Math.round(horasTrabajadas*100)/100,
      horas_extra:Math.round(horasExtra*100)/100,
      es_feriado:esFeriado, estado, observacion:obs,
    });
    setSaving(false);
    setEntrada("");setColSal("");setColReg("");setSalida("");setObs("");
  };

  // Historial filtrado
  const historial = (data.asistencia||[])
    .filter(a=>(!filtroMes||a.fecha.slice(0,7)===filtroMes)&&(!filtroTrab||a.trabajador_id===filtroTrab))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha));

  // Resumen mensual
  const resumen = data.trabajadores
    .filter(t=>["TR001","TR002","TR003","TR004","TR005"].includes(t.id))
    .map(t=>{
      const recs=(data.asistencia||[]).filter(a=>a.trabajador_id===t.id&&a.fecha.slice(0,7)===filtroMes);
      return {
        nombre:t.nombre,
        dias:recs.length,
        horas:recs.reduce((s,r)=>s+(r.horas_trabajadas||0),0).toFixed(1),
        extra:recs.reduce((s,r)=>s+(r.horas_extra||0),0).toFixed(1),
        atrasos:recs.filter(r=>r.atraso_minutos>0).length,
        minAtraso:recs.reduce((s,r)=>s+(r.atraso_minutos||0),0),
        feriados:recs.filter(r=>r.es_feriado).length,
      };
    });

  const DIAS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 3px"}}>Control de Asistencia</h1>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>Registro diario · Atrasos · Horas extra · Feriados</p>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[{k:"registrar",l:"📝 Registrar"},{k:"historial",l:"📋 Historial"},{k:"resumen",l:"📊 Resumen mensual"}].map(v=>(
            <button key={v.k} onClick={()=>setVista(v.k)} style={{background:vista===v.k?C.accent:C.surface,color:vista===v.k?"#fff":C.textMuted,border:`1px solid ${vista===v.k?C.accent:C.border}`,borderRadius:6,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:vista===v.k?600:400}}>{v.l}</button>
          ))}
        </div>
      </div>

      {/* ── REGISTRAR ── */}
      {vista==="registrar"&&(
        <div style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:20,alignItems:"start"}}>
          <Panel title="Registrar asistencia">
            <FL label="Trabajador(a)">
              <select style={INP} value={tId} onChange={e=>{setTId(e.target.value);setCId("");}}>
                <option value="">— Seleccionar —</option>
                {data.trabajadores.filter(t=>t.activo&&["TR001","TR003","TR004","TR005"].includes(t.id)).map(t=>(
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </FL>
            {tId&&<FL label="Contrato">
              <select style={INP} value={cId} onChange={e=>setCId(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {contratosT.map(c=><option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>}
            <FL label="Fecha">
              <input type="date" style={INP} value={fecha} onChange={e=>setFecha(e.target.value)}/>
            </FL>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}}>
              <input type="checkbox" id="feriado" checked={esFeriado} onChange={e=>setEsFeriado(e.target.checked)} style={{width:16,height:16,accentColor:C.accent}}/>
              <label htmlFor="feriado" style={{color:C.text,fontSize:13,cursor:"pointer"}}>¿Día feriado? (se trabaja igual)</label>
            </div>

            {/* Horario programado */}
            {horario&&(
              <div style={{background:C.accentBg,border:"1px solid #bfdbfe",borderRadius:6,padding:"8px 12px",marginBottom:8}}>
                <p style={{color:C.accentText,fontSize:11,fontWeight:600}}>📅 {DIAS[diaSemana]} — Horario programado</p>
                <p style={{color:C.accentText,fontSize:12}}>{horario.hora_entrada} — {horario.hora_salida} · Colación: {horario.colacion_minutos} min</p>
              </div>
            )}
            {tId&&cId&&!horario&&(
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:6,padding:"8px 12px",marginBottom:8}}>
                <p style={{color:"#c2410c",fontSize:12}}>⚠️ No hay horario programado para este trabajador en este contrato el {DIAS[diaSemana]}.</p>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <FL label="Hora entrada *"><input type="time" style={INP} value={entrada} onChange={e=>setEntrada(e.target.value)}/></FL>
              <FL label="Hora salida *"><input type="time" style={INP} value={salida} onChange={e=>setSalida(e.target.value)}/></FL>
              <FL label="Salida colación"><input type="time" style={INP} value={colSal} onChange={e=>setColSal(e.target.value)}/></FL>
              <FL label="Regreso colación"><input type="time" style={INP} value={colReg} onChange={e=>setColReg(e.target.value)}/></FL>
            </div>
            <FL label="Observación (opcional)">
              <input style={INP} value={obs} onChange={e=>setObs(e.target.value)} placeholder="Ej: llegó tarde por tráfico"/>
            </FL>
            <PrimaryBtn onClick={guardar} color={C.accent} disabled={saving||!tId||!cId||!entrada||!salida}>
              {saving?"Guardando...":"💾 Guardar asistencia"}
            </PrimaryBtn>
          </Panel>

          {/* Panel resumen en tiempo real */}
          <Panel title={entrada&&salida?"Resumen del registro":"Información del turno"}>
            {trabajador&&(
              <div style={{marginBottom:16,padding:"10px 12px",background:C.surfaceAlt,borderRadius:6,border:`1px solid ${C.border}`}}>
                <p style={{fontWeight:600,color:C.text,marginBottom:2}}>{trabajador.nombre}</p>
                <p style={{color:C.textMuted,fontSize:12}}>{trabajador.cargo} · RUT: {trabajador.rut||"—"}</p>
              </div>
            )}
            {horario&&!entrada&&(
              <div>
                <p style={{color:C.textMuted,fontSize:12,marginBottom:12}}>Ingresa las horas para ver el cálculo.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <KPICard label="Entrada programada" value={horario.hora_entrada} color={C.accent}/>
                  <KPICard label="Salida programada"  value={horario.hora_salida}  color={C.accent}/>
                  <KPICard label="Colación" value={`${horario.colacion_minutos} min`} color={C.textMuted}/>
                  <KPICard label="Horas contratadas" value={`${horasContratadas.toFixed(1)} hrs`} color={C.green}/>
                </div>
              </div>
            )}
            {entrada&&salida&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <KPICard label="Horas trabajadas" value={`${horasTrabajadas.toFixed(1)} hrs`} color={C.green}/>
                <KPICard label="Horas contratadas" value={`${horasContratadas.toFixed(1)} hrs`} color={C.accent}/>
                <KPICard label="Horas extra" value={horasExtra>0?`+${horasExtra.toFixed(1)} hrs`:"0"} color={horasExtra>0?C.yellow:C.textMuted}/>
                <KPICard label="Atraso" value={atrasoMin>0?`${atrasoMin} min`:"Sin atraso"} color={atrasoMin>0?C.red:C.green}/>
                {esFeriado&&<KPICard label="Feriado trabajado" value="✓" color={C.purple}/>}
              </div>
            )}
            {atrasoMin>0&&(
              <div style={{marginTop:12,background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:6,padding:"10px 12px"}}>
                <p style={{color:C.red,fontWeight:600,fontSize:13}}>⚠️ Atraso detectado: {atrasoMin} minutos</p>
                <p style={{color:C.red,fontSize:12}}>Programado: {horario?.hora_entrada} · Registrado: {entrada}</p>
              </div>
            )}
            {horasExtra>0&&(
              <div style={{marginTop:12,background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:6,padding:"10px 12px"}}>
                <p style={{color:C.yellow,fontWeight:600,fontSize:13}}>⏱ Horas extra: {horasExtra.toFixed(1)} horas</p>
                <p style={{color:C.yellow,fontSize:12}}>Se registran para liquidación mensual.</p>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {vista==="historial"&&(
        <Panel title="Historial de asistencia" noPad>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:12,flexWrap:"wrap"}}>
            <FL label="Mes"><input type="month" style={{...INP,width:140}} value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}/></FL>
            <FL label="Trabajador">
              <select style={{...INP,width:200}} value={filtroTrab} onChange={e=>setFiltroTrab(e.target.value)}>
                <option value="">Todos</option>
                {data.trabajadores.filter(t=>t.activo).map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
          </div>
          <DataTable
            cols={[
              {key:"fecha",  label:"Fecha",     render:r=><span style={{fontWeight:500}}>{r.fecha} {DIAS[new Date(r.fecha+"T12:00:00").getDay()]}{r.es_feriado?" 🎉":""}</span>},
              {key:"trab",   label:"Trabajador", render:r=><span>{data.trabajadores.find(t=>t.id===r.trabajador_id)?.nombre||"—"}</span>},
              {key:"cont",   label:"Contrato",   render:r=><span style={{color:C.textMuted,fontSize:12}}>{data.contratos.find(c=>c.id===r.contrato_id)?.cliente||"—"}</span>},
              {key:"ent",    label:"Entrada",    render:r=><span>{r.hora_entrada||"—"}</span>},
              {key:"sal",    label:"Salida",     render:r=><span>{r.hora_salida||"—"}</span>},
              {key:"horas",  label:"Horas",      render:r=><span style={{color:C.green,fontWeight:500}}>{r.horas_trabajadas}h</span>},
              {key:"extra",  label:"Extra",      render:r=>r.horas_extra>0?<Tag text={`+${r.horas_extra}h`} scheme={{bg:C.yellowBg,text:C.yellow,border:C.yellowBorder}}/>:<span style={{color:C.textMuted}}>—</span>},
              {key:"atraso", label:"Atraso",     render:r=>r.atraso_minutos>0?<Tag text={`${r.atraso_minutos} min`} scheme={{bg:C.redBg,text:C.red,border:C.redBorder}}/>:<Tag text="✓" scheme={{bg:"#f0fdf4",text:"#15803d",border:"#86efac"}}/>},
              {key:"obs",    label:"Obs.",       render:r=><span style={{color:C.textMuted,fontSize:11}}>{r.observacion||""}</span>},
            ]}
            rows={historial}
          />
          {!historial.length&&<div style={{padding:"30px",textAlign:"center",color:C.textMuted}}>Sin registros para el período seleccionado</div>}
        </Panel>
      )}

      {/* ── RESUMEN MENSUAL ── */}
      {vista==="resumen"&&(
        <div>
          <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <FL label="Período"><input type="month" style={{...INP,width:140}} value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}/></FL>
          </div>
          <Panel title={`Resumen asistencia — ${filtroMes}`} noPad>
            <DataTable
              cols={[
                {key:"nombre",  label:"Trabajador",       render:r=><span style={{fontWeight:500}}>{r.nombre}</span>},
                {key:"dias",    label:"Días registrados", render:r=><span style={{color:C.accent,fontWeight:600}}>{r.dias}</span>},
                {key:"horas",   label:"Total horas",      render:r=><span style={{color:C.green,fontWeight:500}}>{r.horas}h</span>},
                {key:"extra",   label:"Horas extra",      render:r=>Number(r.extra)>0?<Tag text={`+${r.extra}h`} scheme={{bg:C.yellowBg,text:C.yellow,border:C.yellowBorder}}/>:<span style={{color:C.textMuted}}>—</span>},
                {key:"atrasos", label:"Días c/atraso",    render:r=>r.atrasos>0?<Tag text={`${r.atrasos} días`} scheme={{bg:C.redBg,text:C.red,border:C.redBorder}}/>:<Tag text="Sin atrasos" scheme={{bg:"#f0fdf4",text:"#15803d",border:"#86efac"}}/>},
                {key:"minAtr",  label:"Total min atraso", render:r=>r.minAtraso>0?<span style={{color:C.red}}>{r.minAtraso} min</span>:<span style={{color:C.textMuted}}>—</span>},
                {key:"ferias",  label:"Feriados trabajados", render:r=>r.feriados>0?<Tag text={`${r.feriados}`} scheme={{bg:"#f3e8ff",text:"#7c3aed",border:"#d8b4fe"}}/>:<span style={{color:C.textMuted}}>—</span>},
              ]}
              rows={resumen}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

function Checklist({data,contratoId,insert}){
  const [filtro,setFiltro]=useState("TODAS");
  const [lightboxUrl,setLightboxUrl]=useState(null);
  const [form,setForm]=useState(null);
  const hoy=new Date().toISOString().slice(0,10);
  const chks=contratoId?data.checklist.filter(c=>c.contrato_id===contratoId):data.checklist;
  const rows=filtro==="TODAS"?chks:chks.filter(c=>c.periodicidad===filtro);
  const marcar=async(chkId,cId)=>{const asig=(data.asignaciones||[]).filter(a=>a.contrato_id===cId&&a.activo);const tId=asig.map(a=>a.trabajador_id).find(id=>{const t=data.trabajadores.find(w=>w.id===id);return t&&t.cargo==="Auxiliar Aseo";}) || data.trabajadores.find(t=>t.cargo==="Auxiliar Aseo")?.id||data.trabajadores[0]?.id;await insert("evidencias",{id:`EV${Date.now()}`,checklist_id:chkId,trabajador_id:tId,contrato_id:cId,fecha_hora:new Date().toISOString(),observacion:"",cumplido:true});};
  const openNew=()=>{const deps=contratoId?data.dependencias.filter(d=>d.contrato_id===contratoId):data.dependencias;setForm({id:genId("CHK"),dep_id:deps[0]?.id||"",contrato_id:contratoId||data.contratos[0]?.id||"",tarea:"",periodicidad:"DIARIA",obligatoria:true,activa:true});};  
  const save=async()=>{if(!form.tarea.trim())return;const ok=await insert("checklist",form);if(ok)setForm(null);};
  const hoyChile=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Santiago"})).toISOString().slice(0,10);
  const completadas=chks.filter(c=>data.evidencias.some(e=>e.checklist_id===c.id&&new Date(e.fecha_hora).toLocaleDateString("en-CA",{timeZone:"America/Santiago"})===hoyChile));
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
            {key:"ultima",label:"Última vez",render:r=>{
              const evs=data.evidencias.filter(e=>e.checklist_id===r.id).sort((a,b)=>b.fecha_hora?.localeCompare(a.fecha_hora));
              if(!evs.length)return<span style={{color:C.textMuted,fontSize:11}}>Nunca</span>;
              const d=new Date(evs[0].fecha_hora);
              // Ajuste zona horaria Chile (UTC-4)
              const ahoraChile=new Date(new Date().toLocaleString("en-US",{timeZone:"America/Santiago"}));
              const dChile=new Date(d.toLocaleString("en-US",{timeZone:"America/Santiago"}));
              const hoyStr=ahoraChile.toDateString();
              const ayerD=new Date(ahoraChile); ayerD.setDate(ayerD.getDate()-1);
              const ayerStr=ayerD.toDateString();
              const dias=Math.floor((ahoraChile-dChile)/86400000);
              const label=dChile.toDateString()===hoyStr?"Hoy":dChile.toDateString()===ayerStr?"Ayer":`Hace ${dias}d`;
              const color=dias===0?C.green:dias<=3?C.yellow:C.red;
              const trab=data.trabajadores.find(t=>t.id===evs[0].trabajador_id);
              return<div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color,fontSize:11,fontWeight:500}}>{label}</span>
                {evs[0].via_qr&&<span title="Registrado vía QR" style={{fontSize:11}}>📱</span>}
                {parseFotos(evs[0].foto).length>0&&<span title={`Ver foto — ${trab?.nombre||""}`} onClick={()=>setLightboxUrl(parseFotos(evs[0].foto)[0])} style={{cursor:"pointer",fontSize:14}}>📷</span>}
              </div>;
            }},
            {key:"ev",label:"Marcar",render:r=>{
              const n=data.evidencias.filter(e=>e.checklist_id===r.id&&e.fecha_hora?.startsWith(hoy)).length;
              return n>0
                ?<Tag text="✓ Hecho hoy" scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>
                :<button onClick={()=>marcar(r.id,r.contrato_id)} style={{background:C.accentBg,color:C.accent,border:"1px solid #bfdbfe",borderRadius:5,padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>Marcar ✓</button>;
            }},
          ]}
          rows={rows}
          empty="No hay tareas para este filtro"
        />
      </Panel>
      {lightboxUrl&&<Lightbox url={lightboxUrl} onClose={()=>setLightboxUrl(null)}/>}
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
/* ─── Cálculo IUSC (Impuesto Único 2da Categoría) ────────────── */
function calcularIUSC(baseIUSC, utm, tabla) {
  if (!tabla || !tabla.length || baseIUSC <= 0) return 0;
  const baseUTM = baseIUSC / utm;
  const tramo = [...tabla].sort((a,b)=>b.desde_utm-a.desde_utm)
    .find(t => baseUTM >= t.desde_utm && (t.hasta_utm === null || baseUTM < t.hasta_utm));
  if (!tramo || tramo.tasa === 0) return 0;
  return Math.max(0, Math.round(baseIUSC * tramo.tasa - tramo.factor_deduccion_utm * utm));
}

/* Calcula días activos de una asignación dentro de un período */
function diasActivosEnPeriodo(fechaInicio, fechaTermino, periodo, diasMes) {
  const [anio, mes] = periodo.split('-').map(Number);
  const inicioMes = new Date(anio, mes-1, 1);
  const finMes    = new Date(anio, mes-1, diasMes);
  const iniAsig   = fechaInicio  ? new Date(fechaInicio.split('T')[0])  : inicioMes;
  const finAsig   = fechaTermino ? new Date(fechaTermino.split('T')[0]) : finMes;
  const inicio    = iniAsig > inicioMes ? iniAsig : inicioMes;
  const fin       = finAsig < finMes   ? finAsig : finMes;
  if (fin < inicio) return 0;
  return Math.round((fin - inicio) / (1000*60*60*24)) + 1;
}

function calcularLiquidacion(trabajador, params, tasas, iuscTabla, input) {
  const {
    dias_trabajados=30, horas_extra=0, otros_haberes=0, otros_descuentos=0,
    contrato_id, periodo, descripcion='',
    dias_licencia_medica=0, dias_permiso_sin_goce=0,
    dias_vacaciones=0, dias_inasistencia=0,
    dias_mes=30, sueldo_override=null, excluir_bonos=false,
    bonos_override=null, gratificacion_override=null
  } = input;
  const sueldoBase = sueldo_override > 0 ? sueldo_override : (trabajador.sueldo_base||0);

  const esPensionado  = trabajador.pensionado || false;
  const esIndefinido  = (trabajador.tipo_contrato||'').toUpperCase().includes('INDEFINIDO');
  const afpRate       = tasas.find(a=>a.nombre===trabajador.afp)||{tasa_trabajador:0,sis:0};
  const utm           = params.utm || 68034;

  // ── Días efectivos (base legal 30 días — Código del Trabajo) ──
  // En meses de 31 días: 1 ausencia no descuenta (día extra del calendario)
  // En meses de 28/29 días: el trabajador igual cobra sobre base 30
  const diasExtra     = Math.max(0, (dias_mes||30) - 30); // días extra del calendario (ej: 1 en enero)
  const totalAusencias= (dias_licencia_medica||0)+(dias_permiso_sin_goce||0)+(dias_inasistencia||0);
  const ausenciasEfectivas = Math.max(0, totalAusencias - diasExtra); // se absorben los días extra
  const diasSinPago   = (dias_permiso_sin_goce||0) + (dias_inasistencia||0);
  const diasSinPagoEfectivos = Math.max(0, diasSinPago - diasExtra);
  const diasPagados   = Math.min(30, Math.max(0, (dias_trabajados||30) - diasSinPagoEfectivos + (dias_vacaciones||0)));

  // ── Haberes ────────────────────────────────────────────────
  const sueldo_prop   = Math.round(sueldoBase * diasPagados / 30);
  const tope_grat     = Math.round(4.75 * utm / 12);
  let gratificacion   = 0;
  if (gratificacion_override !== null && gratificacion_override !== undefined) {
    gratificacion = Math.round(gratificacion_override * diasPagados / 30);
  } else {
    const metGrat = trabajador.metodo_gratificacion || '25% MENSUAL';
    if (metGrat === '25% MENSUAL') {
      gratificacion = Math.min(Math.round(sueldo_prop * 0.25), tope_grat);
    } else if (metGrat === 'ANTICIPO PORCENTAJE') {
      gratificacion = Math.round(sueldo_prop * ((trabajador.gratificacion_porcentaje || 25) / 100));
    } else if (metGrat === 'ANTICIPO MONTO FIJO') {
      gratificacion = Math.round((trabajador.gratificacion_monto || 0) * diasPagados / 30);
    }
  }
  const valor_hora    = Math.round(sueldoBase/(params.horas_mensuales||180));
  const horas_extra_valor = Math.round(valor_hora*1.5*(horas_extra||0));
  const bono_asis     = excluir_bonos?0:(bonos_override ? (bonos_override.bono_asistencia||0) : (diasPagados>=30?(trabajador.bono_asistencia||0):0));
  const bono_movil    = excluir_bonos?0:(bonos_override ? (bonos_override.bono_movilizacion||0) : (trabajador.bono_movilizacion||0));
  const bono_cola     = excluir_bonos?0:(bonos_override ? (bonos_override.bono_colacion||0) : (trabajador.bono_colacion||0));
  const total_haberes = sueldo_prop+gratificacion+horas_extra_valor+bono_asis+bono_movil+bono_cola+(otros_haberes||0);

  // ── Renta imponible ────────────────────────────────────────
  const tope_imp      = Math.round((params.tope_imponible_uf||90.0)*(params.uf||38894));
  const tope_ces      = Math.round((params.tope_cesantia_uf||135.2)*(params.uf||38894));
  const rem_imponible = Math.min(sueldo_prop+gratificacion+horas_extra_valor+bono_asis, tope_imp);
  const rem_imp_ces   = Math.min(sueldo_prop+gratificacion+horas_extra_valor+bono_asis, tope_ces);

  // ── Descuentos trabajador ──────────────────────────────────
  const salud_tasa    = params.salud_trabajador||0.07;
  const tasa_afp      = esPensionado?0:(afpRate.tasa_trabajador||0);
  const cotiz_afp     = Math.round(rem_imponible*tasa_afp);
  const cotiz_salud   = Math.round(rem_imponible*salud_tasa);
  const ces_trab_tasa = esPensionado?0:(esIndefinido?(params.ces_trab_indefinido||0.006):(params.ces_trab_plazo_fijo||0));
  const ces_trabajador= Math.round(rem_imp_ces*ces_trab_tasa);

  // ── IUSC (Impuesto Único 2da Categoría) ────────────────────
  const base_iusc     = Math.max(0, rem_imponible-cotiz_afp-cotiz_salud);
  const iusc          = esPensionado?0:calcularIUSC(base_iusc, utm, iuscTabla||[]);

  const total_descuentos = cotiz_afp+cotiz_salud+ces_trabajador+iusc+(otros_descuentos||0);
  const liquido          = total_haberes-total_descuentos;

  // ── Costo empresa ──────────────────────────────────────────
  const sis               = esPensionado?0:Math.round(rem_imponible*(afpRate.sis||0));
  const ces_emp_tasa      = esPensionado?0:(esIndefinido?(params.ces_emp_indefinido||0.024):(params.ces_emp_plazo_fijo||0.030));
  const ces_empleador     = esPensionado?0:Math.round(rem_imp_ces*ces_emp_tasa);
  const mutualidad_valor  = Math.round(rem_imponible*(params.mutualidad||0.0093));
  const aporte_patronal_valor = esPensionado?0:Math.round(rem_imponible*(params.aporte_patronal||0.010));
  const costo_empresa     = total_haberes+sis+ces_empleador+mutualidad_valor+aporte_patronal_valor;

  return {
    periodo, trabajador_id:trabajador.id, contrato_id:contrato_id||null, descripcion,
    dias_trabajados:dias_trabajados||30, dias_licencia_medica:dias_licencia_medica||0,
    dias_permiso_sin_goce:dias_permiso_sin_goce||0, dias_vacaciones:dias_vacaciones||0,
    dias_inasistencia:dias_inasistencia||0,
    horas_extra:horas_extra||0, otros_haberes:otros_haberes||0, otros_descuentos:otros_descuentos||0,
    sueldo_base:sueldoBase, sueldo_proporcional:sueldo_prop,
    gratificacion, horas_extra_valor, bono_asistencia:bono_asis,
    bono_movilizacion:bono_movil, bono_colacion:bono_cola,
    total_haberes, rem_imponible, afp:trabajador.afp,
    tasa_afp, cotiz_afp, cotiz_salud, ces_trabajador, ces_trab_tasa,
    iusc, total_descuentos, liquido,
    sis, ces_empleador, ces_emp_tasa, mutualidad_valor, aporte_patronal_valor, costo_empresa,
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

/* ─── Panel de Parámetros Legales editables ─────────────────── */
function ParametrosPanel({ data, update, insert }) {
  const params = (data.parametros_legales||[])[0];
  const tasas  = data.tasas_afp||[];
  const iusc   = (data.tabla_iusc||[]).sort((a,b)=>a.tramo-b.tramo);
  const [editP, setEditP] = useState(null);
  const [editA, setEditA] = useState(null);

  const saveParams = async () => {
    if (!editP) return;
    if (params) await update("parametros_legales", {...params,...editP});
    else await insert("parametros_legales", {...editP});
    setEditP(null);
  };
  const saveAfp = async () => {
    if (!editA) return;
    await update("tasas_afp", editA);
    setEditA(null);
  };

  const labelP = [
    {k:"uf",             label:"UF",                         fmt:"$"},
    {k:"utm",            label:"UTM",                        fmt:"$"},
    {k:"imm",            label:"Ingreso Mínimo Mensual (IMM)", fmt:"$"},
    {k:"tope_imponible_uf", label:"Tope imponible AFP/Salud (UF)", fmt:""},
    {k:"tope_cesantia_uf",  label:"Tope imponible Cesantía (UF)", fmt:""},
    {k:"salud_trabajador",  label:"Cotización Salud trabajador", fmt:"%", mult:100},
    {k:"ces_trab_indefinido",label:"CES Trabajador — Indefinido",fmt:"%",mult:100},
    {k:"ces_trab_plazo_fijo",label:"CES Trabajador — Plazo Fijo",fmt:"%",mult:100},
    {k:"ces_emp_indefinido", label:"CES Empleador — Indefinido", fmt:"%",mult:100},
    {k:"ces_emp_plazo_fijo", label:"CES Empleador — Plazo Fijo", fmt:"%",mult:100},
    {k:"mutualidad",     label:"Mutualidad Ley 16.744 empleador",fmt:"%",mult:100},
    {k:"aporte_patronal",label:"Aporte Patronal Reforma 2025",   fmt:"%",mult:100},
    {k:"horas_mensuales",label:"Horas mensuales jornada completa",fmt:""},
  ];

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{color:C.text,fontSize:16,fontWeight:600,margin:"0 0 4px"}}>⚙️ Parámetros Legales</h2>
        <p style={{color:C.textMuted,fontSize:12,margin:0}}>Todos los valores se leen desde aquí al calcular — sin código. Actualiza cuando el gobierno publique nuevos valores.</p>
      </div>

      {/* Parámetros del período */}
      <Panel title={`Parámetros del período ${params?.periodo||'—'}`}
        action={!editP?<PrimaryBtn onClick={()=>setEditP({...params})} small>✏️ Editar</PrimaryBtn>:
          <div style={{display:"flex",gap:6}}><PrimaryBtn onClick={saveParams} color={C.green} small>Guardar</PrimaryBtn><SecondaryBtn onClick={()=>setEditP(null)} small>Cancelar</SecondaryBtn></div>}>
        {editP ? (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {labelP.map(f=>(
              <FL key={f.k} label={f.label}>
                <input type="number" style={INP} step={f.mult?"0.01":"1"}
                  value={f.mult ? ((editP[f.k]||0)*f.mult).toFixed(f.mult===100?2:3) : (editP[f.k]||0)}
                  onChange={e=>setEditP({...editP,[f.k]:f.mult?Number(e.target.value)/f.mult:Number(e.target.value)})}/>
              </FL>
            ))}
          </div>
        ) : params ? (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {labelP.map(f=>{
              const v = params[f.k]||0;
              const disp = f.fmt==="$" ? clp(v) : f.mult ? `${(v*f.mult).toFixed(2)}%` : v;
              return <div key={f.k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.borderLight}`}}>
                <span style={{color:C.textMuted,fontSize:12}}>{f.label}</span>
                <span style={{color:C.text,fontWeight:500,fontSize:13}}>{disp}</span>
              </div>;
            })}
          </div>
        ) : <AlertBanner type="warning" message="No hay parámetros cargados. Ejecuta el SQL remuneraciones_v2.sql en Supabase."/>}
      </Panel>

      {/* Tasas AFP */}
      <Panel title="Tasas AFP y SIS" action={editA?<div style={{display:"flex",gap:6}}><PrimaryBtn onClick={saveAfp} color={C.green} small>Guardar</PrimaryBtn><SecondaryBtn onClick={()=>setEditA(null)} small>Cancelar</SecondaryBtn></div>:null} noPad>
        <DataTable
          cols={[
            {key:"afp",    label:"AFP",    render:r=><span style={{fontWeight:500}}>{r.nombre}</span>},
            {key:"tasa",   label:"Tasa trabajador", render:r=>editA?.id===r.id?
              <input type="number" step="0.0001" style={{...INP,width:90}} value={editA.tasa_trabajador} onChange={e=>setEditA({...editA,tasa_trabajador:Number(e.target.value)})}/>:
              <span>{pct(r.tasa_trabajador)}</span>},
            {key:"sis",    label:"SIS empleador",   render:r=>editA?.id===r.id?
              <input type="number" step="0.0001" style={{...INP,width:90}} value={editA.sis} onChange={e=>setEditA({...editA,sis:Number(e.target.value)})}/>:
              <span style={{color:C.textMuted}}>{pct(r.sis)}</span>},
            {key:"edit",   label:"",        render:r=><button onClick={()=>setEditA({...r})} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12}}>Editar</button>},
          ]}
          rows={tasas}
        />
      </Panel>

      {/* Tabla IUSC */}
      <Panel title="Tabla IUSC — Impuesto Único 2ª Categoría" noPad>
        <div style={{padding:"10px 16px",background:C.accentBg,borderBottom:`1px solid ${C.border}`}}>
          <p style={{color:C.accentText,fontSize:12}}>Los tramos se expresan en UTM. El sistema calcula automáticamente en pesos usando el UTM del período. Para actualizar cuando el SII publique nuevos tramos, contacta al administrador del sistema.</p>
        </div>
        <DataTable
          cols={[
            {key:"t",    label:"Tramo", render:r=><span style={{fontWeight:600}}>{r.tramo}</span>},
            {key:"d",    label:"Desde (UTM)",  render:r=><span>{r.desde_utm} UTM</span>},
            {key:"h",    label:"Hasta (UTM)",  render:r=><span style={{color:C.textMuted}}>{r.hasta_utm?`${r.hasta_utm} UTM`:"Sin límite"}</span>},
            {key:"tasa", label:"Tasa",         render:r=><Tag text={`${(r.tasa*100).toFixed(1)}%`} scheme={r.tasa===0?{bg:"#f9fafb",text:C.textMuted,border:C.border}:{bg:C.redBg,text:C.red,border:C.redBorder}}/>},
            {key:"fac",  label:"Factor deduc. (UTM)", render:r=><span style={{color:C.textMuted}}>{r.factor_deduccion_utm} UTM</span>},
          ]}
          rows={iusc}
        />
        {params&&<div style={{padding:"8px 16px",borderTop:`1px solid ${C.borderLight}`,color:C.textMuted,fontSize:11}}>
          Con UTM = {clp(params.utm)}: Primer tramo exento hasta {clp(13.5*params.utm)} · Trabajadores del IMM pagan $0 IUSC
        </div>}
      </Panel>
    </div>
  );
}
// ═══════════════════════════════════════════════════════
// EXPORTADOR LRE — Dirección del Trabajo Chile
// Manual v8.0 Marzo 2023 — Delimitador: ; — Encoding: ANSI
// Plazo: antes del día 15 del mes siguiente
// ═══════════════════════════════════════════════════════
function ExportadorLRE({ data }) {
  const hoy = new Date();
  const [periodo, setPeriodo] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`);
  const [errores, setErrores] = useState([]);

  // ── Datos del período ──────────────────────────────
  const liqPeriodo = (data.liquidaciones||[]).filter(l => l.periodo === periodo);
  const params     = (data.parametros_legales||[]).find(p=>p.periodo===periodo)
                  || (data.parametros_legales||[])[0] || {};

  // ── Tablas de validación DT ────────────────────────
  const AFP_COD = {
    'Capital':31,'CAPITAL':31,'Cuprum':13,'CUPRUM':13,
    'Habitat':14,'HABITAT':14,'Modelo':103,'MODELO':103,
    'Plan Vital':11,'PLAN VITAL':11,'PlanVital':11,'PLANVITAL':11,
    'Provida':6,'PROVIDA':6,'Uno':19,'UNO':19,
    'AFP Uno':19,'AFP Capital':31,'AFP Cuprum':13,
    'AFP Habitat':14,'AFP Modelo':103,'AFP MODELO':103,
  };
  // Código mutual: 1=ACHS, 2=Mutual CCHC, 3=IST
  const MUTUAL_COD = 1; // ACHS (ajustar si cambia)
  // Región Arica y Parinacota = 15, Comuna Arica = 15101
  const REGION   = 15;
  const COMUNA   = 15101;
  const RUT_EMP  = '780869771'; // RUT empresa sin puntos ni guión
  const fmtRut = (r) => (r||'').replace(/\./g,'');
  const fmtFecha = (iso) => {
    if(!iso) return '';
    const parts = iso.split('T')[0].split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };
  const generarCSV = () => {
    setErrores([]);
    const warn = [];
    const [anio, mes] = periodo.split('-');

    const HEADERS = [
      '1101','1102','1103','1104','1105','1106','1170','1146','1107',
      '1108','1109','1141','1142','1143','1151','1110','1152',
      '1115','1116','1117','1118','1155','1157','1131',
      '2101','2102','2106','2111','2301','2302',
      '3141','3143','3151','3161',
      '4151','4152','4155',
      '5201','5210','5220','5230','5240',
      '5301','5341','5361','5362','5302',
      '5410','5501','5564'
    ];

    const filas = liqPeriodo.map(liq => {
      const t = (data.trabajadores||[]).find(w => w.id === liq.trabajador_id);
      if (!t) { warn.push(`Sin trabajador para liquidación ${liq.id}`); return null; }

      // RUT sin puntos, con guión
      const rut = fmtRut(t.rut);
      if (!rut) warn.push(`RUT vacío para ${t.nombre}`);

      // AFP
      const afpCod  = t.pensionado ? 100 : (AFP_COD[t.afp] || 0);
      if (!t.pensionado && !AFP_COD[t.afp]) warn.push(`AFP "${t.afp}" sin código DT para ${t.nombre}`);
      const afcFlag = t.pensionado ? 0 : 1;

      // Haberes (enteros positivos)
      const sueldo    = Math.round(liq.sueldo_proporcional || 0);
      const extras    = Math.round(liq.horas_extra_valor   || 0);
      const gratif    = Math.round(liq.gratificacion       || 0);
      const bonoAsis  = Math.round(liq.bono_asistencia     || 0);
      const colacion  = Math.round(liq.bono_colacion       || 0);
      const movil     = Math.round(liq.bono_movilizacion   || 0);
      const otrosH    = Math.round(liq.otros_haberes       || 0);

      // Totales haberes por categoría LRE
      const tot5210 = sueldo + extras + gratif + bonoAsis;  // Imponible y Tributable
      const tot5220 = 0;                                    // Imponible NO Tributable
      const tot5230 = colacion + movil + otrosH;            // NO Imponible NO Tributable
      const tot5240 = 0;                                    // NO Imponible Tributable
      const tot5201 = Math.round(liq.total_haberes || 0);

      // Descuentos
      const afp       = Math.round(liq.cotiz_afp       || 0);
      const salud     = Math.round(liq.cotiz_salud     || 0);
      const ces       = Math.round(liq.ces_trabajador  || 0);
      const iusc      = Math.round(liq.iusc            || 0);
      const otrosD    = Math.round(liq.otros_descuentos|| 0);
      const totDesc   = Math.round(liq.total_descuentos|| 0);
      const cotizTot  = afp + salud + ces; // 5341

      // Aportes empleador (calculados sobre rem_imponible)
      const topeUF    = Math.round((params.tope_imponible_uf||90) * (params.uf||38894));
      const remImp    = Math.min(tot5210, topeUF);
      const esPlazoFijo = (t.tipo_contrato||'').toLowerCase().replace(/\s+/g,'_') === 'plazo_fijo';
      const aporteAFC = t.pensionado ? 0 :
        Math.round(remImp * (esPlazoFijo
          ? (params.ces_emp_plazo_fijo||0.03)
          : (params.ces_emp_indefinido||0.024)));
      const aporteMut = Math.round(remImp * (params.mutualidad||0.0093)); // 4152
      const aporteSIS = t.pensionado ? 0 : Math.round(remImp * 0.0149);  // 4155 SIS ~1.49%
      const totAportes = aporteAFC + aporteMut + aporteSIS;

      // Fecha inicio contrato
      const fechaInicio = t.fecha_inicio ? fmtFecha(t.fecha_inicio) : '';
      if (!fechaInicio) warn.push(`Sin fecha inicio para ${t.nombre} — campo 1102 vacío`);

      // Pensionado por vejez
      const pensionadoVejez = t.pensionado ? 1 : 0;

      // Días trabajados
      const diasTrab = liq.dias_trabajados || 30;

      return [
        rut,            // 1101 RUT trabajador
        fechaInicio,    // 1102 Fecha inicio contrato (OBLIGATORIO)
        '',             // 1103 Fecha término (opcional)
        '',             // 1104 Causal término (opcional)
        REGION,         // 1105 Región = 15 Arica y Parinacota
        COMUNA,         // 1106 Comuna = 15101 Arica
        1,              // 1170 Tipo impuesto = 1 (2a Categoría)
        0,              // 1146 Técnico extranjero = 0 (No)
        101,            // 1107 Tipo jornada = 101 (Ordinaria Art.22)
        0,              // 1108 Discapacidad/invalidez = 0 (No)
        pensionadoVejez,// 1109 Pensionado vejez
        afpCod,         // 1141 AFP
        0,              // 1142 IPS (ExINP) = 0 (No pertenece)
        102,            // 1143 FONASA = 102 (ajustar si ISAPRE)
        afcFlag,        // 1151 AFC = 0 o 1
        0,              // 1110 CCAF = 0 (No)
        MUTUAL_COD,     // 1152 Org. administrador Ley 16.744 = 1 ACHS
        diasTrab,       // 1115 Días trabajados en el mes
        '',             // 1116 Días licencia médica (opcional)
        '',             // 1117 Días vacaciones (opcional)
        0,              // 1118 Subsidio trabajador joven = 0 (No)
        0,              // 1155 APV individual = 0 (No)
        0,              // 1157 APVC = 0 (No)
        0,              // 1131 Indemnización todo evento = 0 (No)
        sueldo,         // 2101 Sueldo (proporcional)
        extras,         // 2102 Sobresueldo (horas extra)
        gratif,         // 2106 Gratificación mensual
        bonoAsis,       // 2111 Bono asistencia (otras remun. fijas)
        colacion,       // 2301 Colación (no imponible no tributable)
        movil,          // 2302 Movilización (no imponible no tributable)
        afp,            // 3141 Cotización AFP o IPS (OBLIGATORIO)
        salud,          // 3143 Cotización salud 7% (OBLIGATORIO)
        ces,            // 3151 Cotización AFC trabajador
        iusc,           // 3161 IUSC (OBLIGATORIO, 0 si no corresponde)
        aporteAFC,      // 4151 AFC empleador
        aporteMut,      // 4152 Seguro accidentes Ley 16.744 (OBLIGATORIO)
        aporteSIS,      // 4155 Seguro invalidez y sobrevivencia SIS (OBLIGATORIO)
        tot5201,        // 5201 Total haberes (OBLIGATORIO)
        tot5210,        // 5210 Total hab. imponibles tributables (OBLIGATORIO)
        tot5220,        // 5220 Total hab. imponibles NO tributables (OBLIGATORIO)
        tot5230,        // 5230 Total hab. NO imponibles NO tributables (OBLIGATORIO)
        tot5240,        // 5240 Total hab. NO imponibles tributables (OBLIGATORIO)
        totDesc,        // 5301 Total descuentos (OBLIGATORIO)
        cotizTot,       // 5341 Total descuentos cotizaciones trabajador (OBLIGATORIO)
        iusc,           // 5361 Total descuentos impuesto remuneraciones (OBLIGATORIO)
        0,              // 5362 Descuentos impuesto indemnizaciones (opcional)
        otrosD,         // 5302 Total otros descuentos (OBLIGATORIO)
        totAportes,     // 5410 Total aportes empleador (OBLIGATORIO)
        Math.round(liq.liquido||0), // 5501 Total líquido (OBLIGATORIO)
        0               // 5564 Total indemnizaciones tributables (OBLIGATORIO)
      ].join(';');
    }).filter(Boolean);

    if (filas.length === 0) {
      setErrores(['No hay liquidaciones para el período seleccionado.']);
      return;
    }

    const csvContent = [HEADERS.join(';'), ...filas].join('\r\n');
    const nombreArchivo = `${RUT_EMP}_${anio}${mes}.csv`;

    // Descargar como CSV ANSI (texto puro ASCII, sin acentos en datos)
    const blob = new Blob([csvContent], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = nombreArchivo; a.click();
    URL.revokeObjectURL(url);

    if (warn.length > 0) setErrores(warn);
  };

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{color:C.text,fontSize:16,fontWeight:600,margin:'0 0 4px'}}>📊 Exportador LRE — Dirección del Trabajo</h2>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>
            Genera el archivo CSV para declaración mensual en <strong>dt.gob.cl → Mi DT → Libro de Remuneraciones Electrónico</strong>
          </p>
          <p style={{color:C.textMuted,fontSize:11,margin:'4px 0 0',fontStyle:'italic'}}>
            Plazo: día 15 del mes siguiente · Delimitador: punto y coma (;) · Codificación: ANSI
          </p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
          <div>
            <label style={{display:'block',color:C.textMuted,fontSize:11,marginBottom:3}}>Período (AAAA-MM)</label>
            <input style={{...INP,width:110}} value={periodo} onChange={e=>setPeriodo(e.target.value)} placeholder="2026-05"/>
          </div>
          <PrimaryBtn onClick={generarCSV} color={C.accent}>⬇ Generar CSV</PrimaryBtn>
        </div>
      </div>

      {/* Alertas */}
      {errores.length > 0 && (
        <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
          <p style={{fontWeight:700,color:'#dc2626',fontSize:13,margin:'0 0 6px'}}>⚠ Advertencias — revisa antes de subir al DT:</p>
          {errores.map((e,i)=><p key={i} style={{color:'#991b1b',fontSize:12,margin:'2px 0'}}>{e}</p>)}
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        <KPICard label="Liquidaciones" value={liqPeriodo.length} color={C.accent}/>
        <KPICard label="Región DT" value="15 — Arica" color={C.green}/>
        <KPICard label="Mutual" value="ACHS (cód 1)" color={C.yellow}/>
        <KPICard label="Plazo" value="Día 15" color={liqPeriodo.length>0?C.green:C.yellow}/>
      </div>

      {/* Tabla preview */}
      <Panel noPad>
        {liqPeriodo.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px',color:C.textMuted}}>
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <p style={{fontWeight:600,color:C.text}}>Sin liquidaciones para {periodo}</p>
            <p style={{fontSize:12}}>Genera las liquidaciones en la calculadora primero.</p>
          </div>
        ) : (
          <DataTable
            cols={[
              {key:'trab',  label:'Trabajador',    render:r=>{const t=(data.trabajadores||[]).find(w=>w.id===r.trabajador_id);return<span style={{fontWeight:600}}>{t?.nombre||'—'}</span>;}},
              {key:'rut',   label:'RUT (DT)',      render:r=>{const t=(data.trabajadores||[]).find(w=>w.id===r.trabajador_id);return<span style={{fontFamily:'monospace',fontSize:12}}>{fmtRut(t?.rut)}</span>;}},
              {key:'afp',   label:'AFP (cód)',     render:r=>{const t=(data.trabajadores||[]).find(w=>w.id===r.trabajador_id);return<span>{t?.pensionado?'Pensionado (100)':((t?.afp||'—')+' ('+( AFP_COD[t?.afp]||'?')+')')}</span>;}},
              {key:'dias',  label:'Días',          render:r=><span>{r.dias_trabajados||30}</span>},
              {key:'5210',  label:'Imp.Trib.',     render:r=>{const s=Math.round((r.sueldo_proporcional||0)+(r.horas_extra_valor||0)+(r.gratificacion||0)+(r.bono_asistencia||0));return<span style={{fontVariantNumeric:'tabular-nums'}}>{clp(s)}</span>;}},
              {key:'5230',  label:'No Imp.',       render:r=>{const ni=Math.round((r.bono_colacion||0)+(r.bono_movilizacion||0)+(r.otros_haberes||0));return<span style={{fontVariantNumeric:'tabular-nums'}}>{clp(ni)}</span>;}},
              {key:'liq',   label:'Líquido',       render:r=><span style={{fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{clp(r.liquido)}</span>},
              {key:'ok',    label:'Estado',        render:r=>{const t=(data.trabajadores||[]).find(w=>w.id===r.trabajador_id);const ok=t&&fmtRut(t.rut)&&(t.pensionado||AFP_COD[t.afp]);return ok?<Tag text="✓ OK" scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>:<Tag text="⚠ Revisar" scheme={{bg:C.yellowBg,text:C.yellow,border:C.yellowBorder}}/>;}}
            ]}
            rows={liqPeriodo}
          />
        )}
      </Panel>

      {/* Instrucciones */}
      <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'12px 16px',marginTop:16,fontSize:12,color:'#0c4a6e'}}>
        <p style={{fontWeight:700,margin:'0 0 6px'}}>📋 Pasos para subir el LRE a la DT:</p>
        <p style={{margin:'2px 0'}}>1. Descarga el CSV con el botón "⬇ Generar CSV"</p>
        <p style={{margin:'2px 0'}}>2. Entra a <strong>dt.gob.cl → Mi DT → Clave Única</strong> → perfil Empleador Persona Jurídica</p>
        <p style={{margin:'2px 0'}}>3. Selecciona <strong>Libro de Remuneraciones Electrónico</strong></p>
        <p style={{margin:'2px 0'}}>4. Elige el mes, marca <strong>Archivo CSV</strong>, sube el archivo</p>
        <p style={{margin:'2px 0'}}>5. La DT validará en 24-48 hrs y notificará por email</p>
        <p style={{margin:'6px 0 0',color:'#0369a1',fontWeight:600}}>⚠ Verificar: AFP de cada trabajador · Mutual correcta (ACHS=1, Mutual CCHC=2, IST=3) · Fecha inicio contrato</p>
      </div>
    </div>
  );
}
function AcusesRecibo({ data }) {
  const hoy = new Date();
  const periodoDefault = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`;
  const [periodo, setPeriodo] = useState(periodoDefault);

  const liqPeriodo = (data.liquidaciones||[])
    .filter(l => l.periodo === periodo)
    .sort((a,b) => (a.trabajador_id||"").localeCompare(b.trabajador_id||""));

  const firmadas   = liqPeriodo.filter(l => l.firmado_at).length;
  const pendientes = liqPeriodo.length - firmadas;

  const fmtFirma = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-CL", {timeZone:"America/Santiago",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  };

  const imprimir = () => {
    const filas = liqPeriodo.map((l,i) => {
      const t = (data.trabajadores||[]).find(w => w.id === l.trabajador_id);
      return `<tr>
        <td>${i+1}</td>
        <td>${t?.nombre||"—"}</td>
        <td>${t?.rut||"—"}</td>
        <td style="text-align:right">${clp(l.liquido)}</td>
        <td style="text-align:center;color:${l.firmado_at?"#15803d":"#b45309"};font-weight:700">${l.firmado_at ? "✓ Firmado" : "⏳ Pendiente"}</td>
        <td>${fmtFirma(l.firmado_at)}</td>
        <td>${l.firmado_por||"—"}</td>
      </tr>`;
    }).join("");
    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Acuses ${periodo}</title>
    <style>body{font-family:Arial;font-size:12px;margin:20px}h2{color:#1e3a8a;margin-bottom:4px}h3{color:#64748b;font-weight:normal;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#1e3a8a;color:#fff;padding:7px 10px;text-align:left;font-size:11px}td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}tr:nth-child(even){background:#f8fafc}.res{background:#eff6ff;border-radius:6px;padding:10px 14px;margin:12px 0;font-size:12px;display:flex;gap:24px}.firma-section{margin-top:60px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px}.firma-box{text-align:center;border-top:1px solid #000;padding-top:8px;font-size:11px;color:#475569}@media print{@page{margin:12mm}}</style></head><body>
    <h2>Registro de Acuses de Recibo — Liquidaciones de Sueldo</h2>
    <h3>LEG Servicios de Limpieza EIRL · RUT 78.086.977-1 · Período: ${periodo}</h3>
    <h3>Generado: ${new Date().toLocaleString("es-CL",{timeZone:"America/Santiago"})}</h3>
    <div class="res"><span><strong>Total:</strong> ${liqPeriodo.length}</span><span style="color:#15803d"><strong>✓ Firmadas:</strong> ${firmadas}</span><span style="color:#b45309"><strong>⏳ Pendientes:</strong> ${pendientes}</span></div>
    <table><thead><tr><th>N°</th><th>Trabajador</th><th>RUT</th><th>Líquido</th><th>Estado</th><th>Fecha y hora firma</th><th>Firmado por</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="firma-section">
      <div class="firma-box">Empleador / Rep. Legal<br/>Ana María Guzmán Loyola<br/>RUT 12.083.247-6</div>
      <div class="firma-box">Contador/a</div>
      <div class="firma-box">Fiscalizador Inspección del Trabajo</div>
    </div>
    <p style="margin-top:20px;color:#94a3b8;font-size:10px">Documento generado desde LimpiApp Pro. Firmas electrónicas simples válidas según Ley 19.799.</p>
    </body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),800);
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{color:C.text,fontSize:16,fontWeight:600,margin:"0 0 3px"}}>✅ Acuses de Recibo</h2>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>Registro de liquidaciones firmadas · Válido Ley 19.799 · Inspección del Trabajo</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div>
            <label style={{display:"block",color:C.textMuted,fontSize:11,marginBottom:3}}>Período</label>
            <input style={{...INP,width:120}} value={periodo} onChange={e=>setPeriodo(e.target.value)} placeholder="2026-05"/>
          </div>
          <div style={{marginTop:16}}><PrimaryBtn onClick={imprimir} color={C.accent}>🖨 Imprimir / PDF</PrimaryBtn></div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        <KPICard label="Total liquidaciones" value={liqPeriodo.length} color={C.accent}/>
        <KPICard label="Firmadas" value={firmadas} color={C.green}/>
        <KPICard label="Pendientes" value={pendientes} color={pendientes>0?C.yellow:C.green}/>
      </div>
      <Panel noPad>
        {liqPeriodo.length===0 ? (
          <div style={{textAlign:"center",padding:"40px",color:C.textMuted}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <p style={{fontWeight:600,color:C.text}}>Sin liquidaciones para {periodo}</p>
            <p style={{fontSize:12}}>Genera las liquidaciones en la calculadora primero.</p>
          </div>
        ) : (
          <DataTable
            cols={[
              {key:"n",     label:"N°",         render:(_r,i)=><span style={{color:C.textMuted}}>{i+1}</span>},
              {key:"trab",  label:"Trabajador",  render:r=>{const t=(data.trabajadores||[]).find(w=>w.id===r.trabajador_id);return<span style={{fontWeight:600}}>{t?.nombre||"—"}</span>;}},
              {key:"rut",   label:"RUT",         render:r=>{const t=(data.trabajadores||[]).find(w=>w.id===r.trabajador_id);return<span style={{color:C.textMuted,fontVariantNumeric:"tabular-nums"}}>{t?.rut||"—"}</span>;}},
              {key:"liq",   label:"Líquido",     render:r=><span style={{fontVariantNumeric:"tabular-nums",fontWeight:600}}>{clp(r.liquido)}</span>},
              {key:"estado",label:"Estado",      render:r=>r.firmado_at?<Tag text="✓ Firmado" scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>:<Tag text="⏳ Pendiente" scheme={{bg:C.yellowBg,text:C.yellow,border:C.yellowBorder}}/>},
              {key:"fecha", label:"Fecha firma", render:r=><span style={{color:C.textMuted,fontSize:12}}>{fmtFirma(r.firmado_at)}</span>},
              {key:"quien", label:"Firmado por", render:r=><span style={{color:C.textMuted,fontSize:12}}>{r.firmado_por||"—"}</span>},
            ]}
            rows={liqPeriodo}
          />
        )}
      </Panel>
    </div>
  );
}

function LibroRemuneraciones({ data }) {
  const hoy = new Date();
  const periodoDefault = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`;
  const [periodo, setPeriodo] = useState(periodoDefault);
  const libroRef = useRef();

  const liqPeriodo = (data.liquidaciones||[]).filter(l=>l.periodo===periodo);
  const params = (data.parametros_legales||[])[0];

  const tot = liqPeriodo.reduce((a,l)=>({
    dias:        a.dias        + (l.dias_trabajados||0),
    sueldo:      a.sueldo      + (l.sueldo_proporcional||0),
    grat:        a.grat        + (l.gratificacion||0),
    hex:         a.hex         + (l.horas_extra_valor||0),
    movil:       a.movil       + (l.bono_movilizacion||0),
    cola:        a.cola        + (l.bono_colacion||0),
    asis:        a.asis        + (l.bono_asistencia||0),
    otros_h:     a.otros_h     + (l.otros_haberes||0),
    total_h:     a.total_h     + (l.total_haberes||0),
    afp:         a.afp         + (l.cotiz_afp||0),
    salud:       a.salud       + (l.cotiz_salud||0),
    ces_t:       a.ces_t       + (l.ces_trabajador||0),
    otros_d:     a.otros_d     + (l.otros_descuentos||0),
    total_d:     a.total_d     + (l.total_descuentos||0),
    liquido:     a.liquido     + (l.liquido||0),
    sis:         a.sis         + (l.sis||0),
    ces_e:       a.ces_e       + (l.ces_empleador||0),
    costo:       a.costo       + (l.costo_empresa||0),
  }),{dias:0,sueldo:0,grat:0,hex:0,movil:0,cola:0,asis:0,otros_h:0,total_h:0,afp:0,salud:0,ces_t:0,otros_d:0,total_d:0,liquido:0,sis:0,ces_e:0,costo:0});

  const imprimir = () => {
    const estilos = `
      body{font-family:Arial,sans-serif;font-size:9px;margin:10px;color:#000}
      h2{font-size:13px;margin-bottom:2px}
      h3{font-size:10px;margin-bottom:6px;font-weight:normal}
      table{width:100%;border-collapse:collapse;font-size:8px}
      th{background:#1d4ed8;color:#fff;padding:3px 4px;text-align:center;font-size:7.5px;border:1px solid #1d4ed8}
      td{padding:3px 4px;border:1px solid #ccc;text-align:right;white-space:nowrap}
      td.left{text-align:left}
      tr.tot td{background:#dbeafe;font-weight:bold;border-top:2px solid #1d4ed8}
      .seccion{background:#e0e7ff;font-weight:bold;text-align:center}
      @media print{@page{size:landscape;margin:8mm}}
    `;
    const w = window.open("","_blank");
    w.document.write(`<html><head><title>Libro Remuneraciones ${periodo}</title><style>${estilos}</style></head><body>${libroRef.current?.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const thS = {background:"#1d4ed8",color:"#fff",padding:"5px 6px",fontSize:10,fontWeight:600,textAlign:"center",border:`1px solid #1d4ed8`,whiteSpace:"nowrap"};
  const thG = {background:"#15803d",color:"#fff",padding:"5px 6px",fontSize:10,fontWeight:600,textAlign:"center",border:`1px solid #15803d`,whiteSpace:"nowrap"};
  const thR = {background:"#b91c1c",color:"#fff",padding:"5px 6px",fontSize:10,fontWeight:600,textAlign:"center",border:`1px solid #b91c1c`,whiteSpace:"nowrap"};
  const thP = {background:"#6d28d9",color:"#fff",padding:"5px 6px",fontSize:10,fontWeight:600,textAlign:"center",border:`1px solid #6d28d9`,whiteSpace:"nowrap"};
  const td  = (v,bold,color) => ({padding:"6px 8px",border:`1px solid ${C.border}`,textAlign:"right",fontSize:11,fontVariantNumeric:"tabular-nums",fontWeight:bold?"700":"400",color:color||C.text,background:bold?C.surfaceAlt:C.surface,whiteSpace:"nowrap"});
  const tdL = (bold) => ({...td(null,bold),textAlign:"left"});

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{color:C.text,fontSize:16,fontWeight:600,margin:"0 0 3px"}}>Libro de Remuneraciones</h2>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>Formato oficial · LEG Servicios de Limpieza EIRL · RUT 78.086.977-1</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div>
            <label style={{display:"block",color:C.textMuted,fontSize:11,marginBottom:3}}>Período</label>
            <input style={{...INP,width:120}} value={periodo} onChange={e=>setPeriodo(e.target.value)} placeholder="2026-05"/>
          </div>
          <div style={{marginTop:16}}>
            <PrimaryBtn onClick={imprimir} color={C.accent}>🖨 Imprimir / PDF</PrimaryBtn>
          </div>
        </div>
      </div>

      {!liqPeriodo.length ? (
        <Panel>
          <div style={{textAlign:"center",padding:"40px 0",color:C.textMuted}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <p style={{fontWeight:600,color:C.text,marginBottom:4}}>Sin liquidaciones para {periodo}</p>
            <p style={{fontSize:12}}>Genera las liquidaciones en la calculadora primero, luego vuelve aquí.</p>
          </div>
        </Panel>
      ) : (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,boxShadow:C.shadow,overflow:"hidden"}}>
          <div ref={libroRef}>
            {/* Encabezado */}
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,background:C.surfaceAlt}}>
              <div style={{fontWeight:700,fontSize:15,color:C.text}}>LIBRO DE REMUNERACIONES</div>
              <div style={{color:C.textMuted,fontSize:12,marginTop:2}}>
                Empresa: LEG Servicios de Limpieza EIRL · RUT: 78.086.977-1 · Período: {periodo}
              </div>
              {params && <div style={{color:C.textMuted,fontSize:11,marginTop:1}}>UF: {clp(params.uf)} · UTM: {clp(params.utm)} · IMM: {clp(params.imm)}</div>}
            </div>

            {/* Tabla */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{...thS,textAlign:"left"}} rowSpan={2}>N°</th>
                    <th style={{...thS,textAlign:"left"}} rowSpan={2}>RUT</th>
                    <th style={{...thS,textAlign:"left",minWidth:140}} rowSpan={2}>Trabajador</th>
                    <th style={thS} rowSpan={2}>Días</th>
                    <th colSpan={7} style={thG}>HABERES</th>
                    <th colSpan={4} style={thR}>DESCUENTOS</th>
                    <th style={thS} rowSpan={2}>LÍQUIDO</th>
                    <th colSpan={3} style={thP}>COSTO EMPRESA</th>
                  </tr>
                  <tr>
                    <th style={thG}>S. Base</th>
                    <th style={thG}>Gratif.</th>
                    <th style={thG}>H. Extra</th>
                    <th style={thG}>B. Movil.</th>
                    <th style={thG}>B. Colac.</th>
                    <th style={thG}>Otros</th>
                    <th style={{...thG,fontWeight:800}}>TOTAL</th>
                    <th style={thR}>AFP</th>
                    <th style={thR}>Salud</th>
                    <th style={thR}>Ces. T.</th>
                    <th style={{...thR,fontWeight:800}}>TOTAL</th>
                    <th style={thP}>SIS</th>
                    <th style={thP}>Ces. E.</th>
                    <th style={{...thP,fontWeight:800}}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {liqPeriodo.map((l,i)=>{
                    const t=data.trabajadores.find(w=>w.id===l.trabajador_id);
                    return (
                      <tr key={i} style={{borderBottom:`1px solid ${C.borderLight}`}}>
                        <td style={tdL()}>{i+1}</td>
                        <td style={tdL()}>{t?.rut||"—"}</td>
                        <td style={tdL()}>{t?.nombre||"—"}</td>
                        <td style={td()}>{l.dias_trabajados}</td>
                        <td style={td()}>{clp(l.sueldo_proporcional)}</td>
                        <td style={td()}>{clp(l.gratificacion)}</td>
                        <td style={td()}>{clp(l.horas_extra_valor)}</td>
                        <td style={td()}>{clp(l.bono_movilizacion)}</td>
                        <td style={td()}>{clp(l.bono_colacion)}</td>
                        <td style={td()}>{clp(l.otros_haberes)}</td>
                        <td style={td(true,false,C.green)}>{clp(l.total_haberes)}</td>
                        <td style={td()}>{clp(l.cotiz_afp)}</td>
                        <td style={td()}>{clp(l.cotiz_salud)}</td>
                        <td style={td()}>{clp(l.ces_trabajador)}</td>
                        <td style={td(true,false,C.red)}>{clp(l.total_descuentos)}</td>
                        <td style={td(true,false,C.accent)}>{clp(l.liquido)}</td>
                        <td style={td()}>{clp(l.sis)}</td>
                        <td style={td()}>{clp(l.ces_empleador)}</td>
                        <td style={td(true,false,C.purple)}>{clp(l.costo_empresa)}</td>
                      </tr>
                    );
                  })}
                  {/* Fila totales */}
                  <tr style={{background:C.accentBg,borderTop:`2px solid ${C.accent}`}}>
                    <td style={tdL(true)} colSpan={3}>TOTALES</td>
                    <td style={td(true)}>{tot.dias}</td>
                    <td style={td(true)}>{clp(tot.sueldo)}</td>
                    <td style={td(true)}>{clp(tot.grat)}</td>
                    <td style={td(true)}>{clp(tot.hex)}</td>
                    <td style={td(true)}>{clp(tot.movil)}</td>
                    <td style={td(true)}>{clp(tot.cola)}</td>
                    <td style={td(true)}>{clp(tot.otros_h)}</td>
                    <td style={td(true,false,C.green)}>{clp(tot.total_h)}</td>
                    <td style={td(true)}>{clp(tot.afp)}</td>
                    <td style={td(true)}>{clp(tot.salud)}</td>
                    <td style={td(true)}>{clp(tot.ces_t)}</td>
                    <td style={td(true,false,C.red)}>{clp(tot.total_d)}</td>
                    <td style={td(true,false,C.accent)}>{clp(tot.liquido)}</td>
                    <td style={td(true)}>{clp(tot.sis)}</td>
                    <td style={td(true)}>{clp(tot.ces_e)}</td>
                    <td style={td(true,false,C.purple)}>{clp(tot.costo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Firma */}
            <div style={{padding:"20px 24px",borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:24,marginTop:8}}>
              {["Empleador / Representante Legal","Contador","Trabajador"].map(r=>(
                <div key={r} style={{textAlign:"center"}}>
                  <div style={{borderTop:`1px solid ${C.text}`,paddingTop:6,color:C.textMuted,fontSize:11}}>{r}</div>
                  {r==="Empleador / Representante Legal" && <div style={{color:C.text,fontSize:11,marginTop:2}}>Ana María Guzmán Loyola · RUT 12.083.247-6</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function reimprimirLiq(liq, data) {
  const t   = (data.trabajadores||[]).find(w => w.id === liq.trabajador_id) || {};
  const clpF = n => n!=null ? new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n) : '—';
  const pct  = (a,b) => b>0 ? (a/b*100).toFixed(2)+'%' : '0%';
  const fila = (label, val, color='#dc2626') =>
    val ? `<tr><td style="padding:5px 8px;color:#475569">${label}</td><td style="padding:5px 8px;text-align:right;color:${color}">${val}</td></tr>` : '';
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Liquidación ${liq.periodo} · ${t.nombre||''}</title>
  <style>body{font-family:Arial;font-size:12px;margin:20px;color:#0f172a}h2{color:#1e3a8a;margin:0 0 2px}h3{color:#64748b;font-weight:400;margin:0 0 12px;font-size:11px}table{width:100%;border-collapse:collapse;margin-bottom:10px}.sec-title{background:#1e3a8a;color:#fff;padding:5px 8px;font-weight:700;font-size:11px}.total td{border-top:2px solid #e2e8f0;font-weight:700;padding:5px 8px}.liq{background:#dbeafe;padding:10px;border-radius:6px;display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#1d4ed8;margin:12px 0}.firma{margin-top:50px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.firma-box{text-align:center;border-top:1px solid #000;padding-top:6px;font-size:10px;color:#475569}@media print{@page{margin:10mm}}</style></head><body>
  <h2>Liquidación de Sueldo · ${liq.periodo}</h2>
  <h3>LEG Servicios de Limpieza EIRL · RUT 78.086.977-1 · Arica, Región de Arica y Parinacota</h3>
  <table>
    <tr><td><b>Trabajador/a:</b> ${t.nombre||'—'} &nbsp;·&nbsp; <b>RUT:</b> ${t.rut||'—'}</td></tr>
    <tr><td><b>Cargo:</b> ${t.cargo||'—'} &nbsp;·&nbsp; <b>Contrato:</b> ${(t.tipo_contrato||'').toUpperCase()} &nbsp;·&nbsp; <b>Período:</b> ${liq.periodo}</td></tr>
    ${liq.descripcion?`<tr><td><b>Instituciones:</b> ${liq.descripcion}</td></tr>`:''}
    <tr><td><b>Días trabajados:</b> ${liq.dias_trabajados} &nbsp;·&nbsp; <b>AFP:</b> ${t.pensionado?'PENSIONADO - Exento':(t.afp||'—')} &nbsp;·&nbsp; <b>Salud:</b> ${t.salud||'FONASA'}</td></tr>
  </table>
  <div class="sec-title">HABERES</div>
  <table>
    ${fila('Sueldo base',clpF(liq.sueldo_proporcional),'#0f172a')}
    ${fila('Gratificación legal',clpF(liq.gratificacion),'#0f172a')}
    ${liq.horas_extra_valor?fila('Horas extra',clpF(liq.horas_extra_valor),'#0f172a'):''}
    ${liq.bono_asistencia?fila('Bono asistencia',clpF(liq.bono_asistencia),'#0f172a'):''}
    ${liq.bono_movilizacion?fila('Bono movilización',clpF(liq.bono_movilizacion),'#0f172a'):''}
    ${liq.bono_colacion?fila('Bono colación',clpF(liq.bono_colacion),'#0f172a'):''}
    ${liq.otros_haberes?fila('Otros haberes',clpF(liq.otros_haberes),'#0f172a'):''}
    <tr class="total"><td>TOTAL HABERES</td><td style="text-align:right;color:#1e3a8a">${clpF(liq.total_haberes)}</td></tr>
    <tr><td style="padding:5px 8px;color:#64748b">Renta imponible</td><td style="padding:5px 8px;text-align:right;color:#64748b">${clpF(liq.rem_imponible)}</td></tr>
  </table>
  <div class="sec-title">DESCUENTOS LEGALES</div>
  <table>
    ${t.pensionado?`<tr><td style="padding:5px 8px;color:#475569">AFP — PENSIONADO (Exento)</td><td style="padding:5px 8px;text-align:right;color:#64748b">$0</td></tr>`:fila(`AFP ${t.afp||''} (${pct(liq.cotiz_afp,liq.rem_imponible)})`,clpF(liq.cotiz_afp))}
    ${fila('Salud (7.00%)',clpF(liq.cotiz_salud))}
    ${liq.ces_trabajador?fila('Seg. Cesantía trab.',clpF(liq.ces_trabajador)):`<tr><td style="padding:5px 8px;color:#475569">Seg. Cesantía trab. (0.00%)</td><td style="padding:5px 8px;text-align:right;color:#64748b">$0 — ${(t.tipo_contrato||'').toUpperCase()}</td></tr>`}
    ${liq.iusc?fila('Impuesto único (IUSC)',clpF(liq.iusc)):''}
    ${liq.otros_descuentos?fila('Otros descuentos',clpF(liq.otros_descuentos)):''}
    <tr class="total"><td>TOTAL DESCUENTOS</td><td style="text-align:right;color:#dc2626">${clpF(liq.total_descuentos)}</td></tr>
  </table>
  <div class="liq"><span>LÍQUIDO A PAGAR</span><span>${clpF(liq.liquido)}</span></div>
  ${liq.firmado_at?`<p style="color:#15803d;font-size:11px">✅ Recibido conforme por ${liq.firmado_por} el ${new Date(liq.firmado_at).toLocaleDateString('es-CL')}</p>`:''}
  <div class="firma">
    <div class="firma-box">Empleador / Rep. Legal<br/>Ana María Guzmán Loyola · RUT 12.083.247-6</div>
    <div class="firma-box">Trabajador/a<br/>${t.nombre||'—'}</div>
  </div>
  </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),800);
}

function Remuneraciones({ data, saveRem, insert, update }) {
  const [vistaRem, setVistaRem] = useState("calculadora");
  const hoy = new Date();
  const periodoDefault = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const [tId, setTId] = useState("");
  const [cId, setCId] = useState("");
  const [periodo, setPeriodo] = useState(periodoDefault);
  const [dias, setDias] = useState(30);
  const [hextra, setHextra] = useState(0);
  const [otrosH, setOtrosH] = useState(0);
  const [otrosD, setOtrosD] = useState(0);
  const [descripcion, setDescripcion] = useState('');
  const [diasLicencia, setDiasLicencia] = useState(0);
  const [diasPermisoSG, setDiasPermisoSG] = useState(0);
  const [diasVacaciones, setDiasVacaciones] = useState(0);
  const [diasInasistencia, setDiasInasistencia] = useState(0);
  const [diasMes, setDiasMes] = useState(30);
  const [res, setRes] = useState(null);
  const [saving, setSaving] = useState(false);
  const [asignacionesRem, setAsignacionesRem] = useState([]);
  const [montosAuto, setMontosAuto] = useState(null);
  const [saved, setSaved] = useState(false);
  const slipRef = useRef();

  const params = (data.parametros_legales || [])[0];
  const tasas = data.tasas_afp || [];
  const iuscTabla = data.tabla_iusc || [];
  const liqList = data.liquidaciones || [];
  const trabajador = data.trabajadores.find(t => t.id === tId);

  // Auto-cargar asignaciones cuando cambia trabajador, período o días del mes
  useEffect(() => {
    if (!tId || !periodo) { setAsignacionesRem([]); setMontosAuto(null); return; }
    const [anio, mes] = periodo.split('-').map(Number);
    const inicioMes = new Date(anio, mes-1, 1);
    const finMes    = new Date(anio, mes-1, diasMes);

    const asigs = (data.asignaciones || []).filter(a => {
      if (a.trabajador_id !== tId) return false;
      if (a.afecta_remuneracion === false) return false;
      const iniA = a.fecha_inicio_asig  ? new Date(a.fecha_inicio_asig.split('T')[0])  : new Date(2000,0,1);
      const finA = a.fecha_termino_asig ? new Date(a.fecha_termino_asig.split('T')[0]) : new Date(2099,11,31);
      return iniA <= finMes && finA >= inicioMes;
    });

    const asigsProp = asigs.map(a => {
      const dias = diasActivosEnPeriodo(a.fecha_inicio_asig, a.fecha_termino_asig, periodo, diasMes);
      const factor = dias / 30;
      const contrato = (data.contratos||[]).find(c => c.id === a.contrato_id);
      return {
        ...a,
        contrato_nombre: contrato?.cliente || a.contrato_id,
        tipo_centro: contrato?.tipo_centro_costo || 'LICITACION',
        dias_activos: dias,
        sueldo_prop:        Math.round((a.sueldo_asignado||0) * factor),
        bono_asistencia_prop: dias >= 30 ? (a.bono_asistencia||0) : 0,
        bono_movil_prop:    Math.round((a.bono_movilizacion||0) * factor),
        bono_cola_prop:     Math.round((a.bono_colacion||0) * factor),
        gratif_prop:        Math.round((a.gratificacion_monto||0) * factor),
        es_parcial:         dias < diasMes,
      };
    });

    const totales = asigsProp.length > 0 ? {
      sueldo:          asigsProp.reduce((s,a) => s+a.sueldo_prop, 0),
      bono_asistencia: asigsProp.reduce((s,a) => s+a.bono_asistencia_prop, 0),
      bono_movilizacion: asigsProp.reduce((s,a) => s+a.bono_movil_prop, 0),
      bono_colacion:   asigsProp.reduce((s,a) => s+a.bono_cola_prop, 0),
      gratificacion:   asigsProp.reduce((s,a) => s+a.gratif_prop, 0),
    } : null;

    setAsignacionesRem(asigsProp);
    setMontosAuto(totales);

    // Auto-rellenar descripción
    if (asigsProp.length > 0) {
      const descAuto = asigsProp.map(a =>
        `${a.contrato_nombre}${a.es_parcial ? ` (${a.dias_activos} días)` : ''}`
      ).join(' + ');
      setDescripcion(descAuto);
    }
  }, [tId, periodo, diasMes]);

  const calcular = () => {
    if (!trabajador || !params) { alert("Selecciona un trabajador y verifica parámetros."); return; }
    setRes(calcularLiquidacion(trabajador, params, tasas, iuscTabla, {
      sueldo_override:       montosAuto ? montosAuto.sueldo : null,
      bonos_override:        montosAuto ? {
        bono_asistencia:     montosAuto.bono_asistencia,
        bono_movilizacion:   montosAuto.bono_movilizacion,
        bono_colacion:       montosAuto.bono_colacion,
      } : null,
      gratificacion_override: montosAuto && montosAuto.gratificacion > 0 ? montosAuto.gratificacion : null,
      dias_trabajados: dias, horas_extra: hextra,
      otros_haberes: otrosH, otros_descuentos: otrosD,
      contrato_id: cId, periodo, descripcion,
      dias_licencia_medica: diasLicencia,
      dias_permiso_sin_goce: diasPermisoSG,
      dias_vacaciones: diasVacaciones,
      dias_inasistencia: diasInasistencia,
      dias_mes: diasMes,
    }));
    setSaved(false);
  };

  const guardar = async () => {
    if (!res) return;
    const existente = liqList.find(l => l.trabajador_id === tId && l.periodo === periodo);
    if (existente) {
      const firmada = existente.firmado_at;
      const msg = firmada
        ? `⚠ Esta liquidación fue firmada por ${existente.firmado_por||'el trabajador'} el ${new Date(existente.firmado_at).toLocaleDateString('es-CL')}.\n\nReemplazarla INVALIDARÁ su firma. ¿Continuar de todas formas?`
        : `Ya existe una liquidación para ${trabajador?.nombre} en el período ${periodo}.\n¿Desea reemplazarla?`;
      if (!window.confirm(msg)) return;
    }
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 3px"}}>Remuneraciones</h1>
          <p style={{color:C.textMuted,fontSize:12,margin:0}}>Liquidaciones y Libro de Remuneraciones · Ley del Trabajo Chile</p>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{key:"calculadora",label:"💰 Calculadora"},{key:"libro",label:"📋 Libro"},{key:"acuses",label:"✅ Acuses"},{key:"lre",label:"📊 LRE"},{key:"parametros",label:"⚙️ Parámetros"}].map(v=>(
            <button key={v.key} onClick={()=>setVistaRem(v.key)} style={{background:vistaRem===v.key?C.accent:C.surface,color:vistaRem===v.key?"#fff":C.textMuted,border:`1px solid ${vistaRem===v.key?C.accent:C.border}`,borderRadius:6,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:vistaRem===v.key?600:400}}>{v.label}</button>
          ))}
        </div>
      </div>

      {vistaRem==="libro"      && <LibroRemuneraciones data={data}/>}
      {vistaRem==="acuses"     && <AcusesRecibo data={data}/>}
      {vistaRem==="lre"        && <ExportadorLRE data={data}/>}
      {vistaRem==="parametros" && <ParametrosPanel data={data} update={update} insert={insert}/>}
      {vistaRem==="calculadora" && <>

      {!params && <AlertBanner type="warning" message="No se encontraron parámetros legales (UF, UTM, IMM). Ejecuta el SQL de remuneraciones en Supabase." />}

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>

        {/* ── Calculadora ── */}
        <Panel title="Calculadora de liquidación">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FL label="Trabajador(a)">
              <select style={INP} value={tId} onChange={e => { setTId(e.target.value); setRes(null); setAsignacionesRem([]); setMontosAuto(null); }}>
                <option value="">— Seleccionar —</option>
                {data.trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            {trabajador && (
              <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", fontSize: 12 }}>
                <p style={{ color: C.textMuted }}><b style={{ color: C.text }}>AFP:</b> {trabajador.afp} · <b style={{ color: C.text }}>Salud:</b> {trabajador.salud}</p>
                {trabajador.pensionado && <p style={{color:C.purple,fontWeight:600}}>PENSIONADO — Exento AFP y CES</p>}
              </div>
            )}
            {/* ── Asignaciones auto-cargadas ── */}
            {tId && periodo && (
              <div>
                <p style={{fontWeight:600,fontSize:11,color:C.textMuted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>
                  Asignaciones activas · {periodo}
                </p>
                {asignacionesRem.length === 0 ? (
                  <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:6,padding:'8px 12px',fontSize:12,color:C.yellow}}>
                    ⚠ Sin asignaciones con remuneración para este período
                  </div>
                ) : (
                  <>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,marginBottom:6}}>
                      <thead>
                        <tr style={{background:C.accentBg}}>
                          <th style={{padding:'4px 6px',textAlign:'left',color:C.accentText,fontWeight:600}}>Centro</th>
                          <th style={{padding:'4px 6px',textAlign:'right',color:C.accentText,fontWeight:600}}>Sueldo</th>
                          <th style={{padding:'4px 6px',textAlign:'right',color:C.accentText,fontWeight:600}}>Bonos</th>
                          <th style={{padding:'4px 6px',textAlign:'right',color:C.accentText,fontWeight:600}}>Días</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asignacionesRem.map((a,i) => (
                          <tr key={i} style={{borderBottom:`1px solid ${C.borderLight}`,background:a.es_parcial?C.yellowBg:'transparent'}}>
                            <td style={{padding:'4px 6px',fontSize:11,color:C.text}}>{a.contrato_nombre}</td>
                            <td style={{padding:'4px 6px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:C.text}}>{clp(a.sueldo_prop)}</td>
                            <td style={{padding:'4px 6px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:C.textMuted}}>{clp(a.bono_movil_prop+a.bono_cola_prop+a.bono_asistencia_prop)}</td>
                            <td style={{padding:'4px 6px',textAlign:'right',color:a.es_parcial?C.yellow:C.textMuted}}>{a.dias_activos}{a.es_parcial?' ⚠':''}</td>
                          </tr>
                        ))}
                      </tbody>
                      {montosAuto && (
                        <tfoot>
                          <tr style={{borderTop:`2px solid ${C.border}`,fontWeight:700}}>
                            <td style={{padding:'4px 6px',color:C.text}}>SUELDO LEGAL TOTAL</td>
                            <td style={{padding:'4px 6px',textAlign:'right',color:C.accent}}>{clp(montosAuto.sueldo)}</td>
                            <td style={{padding:'4px 6px',textAlign:'right',color:C.accent}}>{clp((montosAuto.bono_asistencia||0)+(montosAuto.bono_movilizacion||0)+(montosAuto.bono_colacion||0))}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {asignacionesRem.length > 1 && (
                      <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:6,padding:'6px 10px',fontSize:10,color:'#166534'}}>
                        <b>Distribución financiera (referencia):</b>{' '}
                        {asignacionesRem.map((a,i) => `${a.contrato_nombre}: ${clp(a.sueldo_prop)} (${a.porcentaje_costo}%)`).join(' · ')}
                        <br/><span style={{color:'#b45309'}}>Este detalle es para control de costo. El trabajador recibe un único sueldo legal.</span>
                      </div>
                    )}
                  </>
                )}
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
            <FL label="Instituciones / Descripción">
              <input style={INP} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Seremi Transportes  |  Seremi MA + Seremi Ciencias" />
            </FL>
            <FL label="Días del mes calendario">
              <select style={INP} value={diasMes} onChange={e=>setDiasMes(Number(e.target.value))}>
                <option value={28}>28 días (Febrero año normal)</option>
                <option value={29}>29 días (Febrero año bisiesto)</option>
                <option value={30}>30 días (Abril, Junio, Septiembre, Noviembre)</option>
                <option value={31}>31 días (Enero, Marzo, Mayo, Julio, Agosto, Octubre, Diciembre)</option>
              </select>
            </FL>
            <FL label={`Días trabajados: ${dias}`}>
              <input type="range" min={1} max={30} value={dias} onChange={e => setDias(Number(e.target.value))} style={{ width: "100%", accentColor: C.accent }} />
            </FL>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FL label="Horas extra"><input type="number" min={0} style={INP} value={hextra} onChange={e => setHextra(Number(e.target.value))} /></FL>
              <FL label="Otros haberes ($)"><input type="number" min={0} style={INP} value={otrosH} onChange={e => setOtrosH(Number(e.target.value))} /></FL>
              <FL label="Otros descuentos ($)"><input type="number" min={0} style={INP} value={otrosD} onChange={e => setOtrosD(Number(e.target.value))} /></FL>
            </div>
            {/* Ausencias */}
            <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:6,padding:"10px 12px"}}>
              <p style={{color:C.yellow,fontWeight:600,fontSize:11,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Ausencias del mes</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <FL label="Licencia médica (días)"><input type="number" min={0} max={30} style={INP} value={diasLicencia} onChange={e=>setDiasLicencia(Number(e.target.value))}/></FL>
                <FL label="Permiso sin goce (días)"><input type="number" min={0} max={30} style={INP} value={diasPermisoSG} onChange={e=>setDiasPermisoSG(Number(e.target.value))}/></FL>
                <FL label="Vacaciones (días)"><input type="number" min={0} max={30} style={INP} value={diasVacaciones} onChange={e=>setDiasVacaciones(Number(e.target.value))}/></FL>
                <FL label="Inasistencia injust. (días)"><input type="number" min={0} max={30} style={INP} value={diasInasistencia} onChange={e=>setDiasInasistencia(Number(e.target.value))}/></FL>
              </div>
            </div>
            {/* Validador 30 días — base legal Código del Trabajo Chile */}
            {(()=>{
              const totalAus  = diasLicencia+diasPermisoSG+diasVacaciones+diasInasistencia;
              const totalDias = dias + totalAus;
              const diasExtra = Math.max(0, diasMes - 30);
              const ausEfect  = Math.max(0, totalAus - diasExtra);
              const diff      = 30 - (dias + ausEfect);

              // Mes 31 días con 1 ausencia → sueldo completo
              if (diasMes===31 && totalDias===31 && totalAus<=1) return (
                <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:6,padding:"8px 12px",fontSize:12}}>
                  <span style={{color:"#15803d",fontWeight:700}}>✓ Sueldo completo</span>
                  <p style={{color:"#15803d",margin:"3px 0 0",fontSize:11}}>Mes de 31 días — la ausencia queda absorbida por el día extra del calendario. Base legal: 30 días.</p>
                </div>
              );
              if (dias+ausEfect===30) return (
                <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:6,padding:"8px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#15803d",fontWeight:700}}>✓</span>
                  <span style={{color:"#15803d",fontWeight:600}}>Total: 30/30 días — correcto</span>
                </div>
              );
              if (dias+ausEfect>30) return (
                <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:6,padding:"8px 12px",fontSize:12}}>
                  <span style={{color:C.yellow,fontWeight:700}}>⚠️ Revisa los días ingresados</span>
                  <p style={{color:C.yellow,margin:"4px 0 0",fontSize:11}}>La suma supera la base de 30 días legales.</p>
                </div>
              );
              return (
                <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:6,padding:"8px 12px",fontSize:12}}>
                  <span style={{color:"#b45309",fontWeight:600}}>📅 Faltan {diff} día{diff!==1?"s":""} por clasificar (trabajados o ausencia)</span>
                </div>
              );
            })()}
            {params && (
              <div style={{ background: C.accentBg, border: "1px solid #bfdbfe", borderRadius: 6, padding: "8px 12px", fontSize: 11 }}>
                <p style={{ color: C.accentText }}><b>UF:</b> {clp(params.uf)} · <b>UTM:</b> {clp(params.utm)} · <b>IMM:</b> {clp(params.imm)}</p>
                <p style={{ color: C.accentText }}><b>Tope AFP:</b> {params.tope_imponible_uf} UF · <b>Mutualidad:</b> {((params.mutualidad||0.0093)*100).toFixed(2)}% · <b>Aporte Patronal:</b> {((params.aporte_patronal||0.01)*100).toFixed(1)}%</p>
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
                  {res.descripcion&&<p style={{ color: C.text, fontSize: 12 }}><b>Instituciones:</b> {res.descripcion}</p>}
                  {(res.dias_licencia_medica>0||res.dias_permiso_sin_goce>0||res.dias_vacaciones>0||res.dias_inasistencia>0)&&(
                    <p style={{ color: C.yellow, fontSize: 12 }}>
                      <b>Ausencias:</b>{res.dias_licencia_medica>0?` Licencia médica: ${res.dias_licencia_medica}d`:''}{res.dias_permiso_sin_goce>0?` · Permiso sin goce: ${res.dias_permiso_sin_goce}d`:''}{res.dias_vacaciones>0?` · Vacaciones: ${res.dias_vacaciones}d`:''}{res.dias_inasistencia>0?` · Inasistencia: ${res.dias_inasistencia}d`:''}
                    </p>
                  )}
                  <p style={{ color: C.text, fontSize: 12 }}><b>Días trabajados:</b> {res.dias_trabajados} · <b>AFP:</b> {trabajador?.pensionado?"PENSIONADO - Exento":res.afp} · <b>Salud:</b> {trabajador?.salud}</p>
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
                        <SlipRow label={trabajador?.pensionado?"AFP — PENSIONADO (Exento)":(`AFP ${res.afp} (${pct(res.tasa_afp)})`)} value={trabajador?.pensionado?"$0":clp(res.cotiz_afp)} />
                        <SlipRow label="Salud (7.00%)" value={clp(res.cotiz_salud)} />
                        <SlipRow label={`Seg. Cesantía trab. (${pct(res.ces_trab_tasa||0)})`} value={res.ces_trab_tasa>0?clp(res.ces_trabajador):"$0 — Plazo Fijo"} />
                        {res.iusc>0&&<SlipRow label="IUSC (Imp. Único 2da Cat.)" value={clp(res.iusc)} />}
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
                      <SlipRow label={`Seg. Cesantía emp. (${pct(res.ces_emp_tasa||0)})`} value={clp(res.ces_empleador)} />
                      <SlipRow label="Mutualidad Ley 16.744 (0.93%)" value={clp(res.mutualidad_valor)} />
                      <SlipRow label="Aporte Patronal Reforma 2025 (1%)" value={clp(res.aporte_patronal_valor)} />
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
                {key:"centros",  label:"Centro(s) de costo", render:r=>{
                  const [anio,mes] = (r.periodo||'2026-05').split('-').map(Number);
                  const inicioMes = new Date(anio,mes-1,1);
                  const finMes    = new Date(anio,mes-1,31);
                  const asigs = (data.asignaciones||[]).filter(a=>{
                    if(a.trabajador_id!==r.trabajador_id) return false;
                    if(a.afecta_remuneracion===false) return false;
                    const iniA=a.fecha_inicio_asig?new Date(a.fecha_inicio_asig.split('T')[0]):new Date(2000,0,1);
                    const finA=a.fecha_termino_asig?new Date(a.fecha_termino_asig.split('T')[0]):new Date(2099,11,31);
                    return iniA<=finMes && finA>=inicioMes;
                  });
                  if(!asigs.length) return <span style={{color:C.textMuted,fontSize:12}}>—</span>;
                  const activas = asigs.filter(a=>a.estado_asig==='activa');
                  const pctActivo = activas.reduce((s,a)=>s+(a.porcentaje_costo||0),0);
                  const deficit = pctActivo < 100 && pctActivo > 0;
                  return(
                    <div style={{fontSize:11}}>
                      {asigs.map((a,i)=>{
                        const terminada=a.estado_asig==='terminada';
                        return<span key={i} style={{display:'inline-block',marginRight:4,color:terminada?C.textMuted:C.text,textDecoration:terminada?'line-through':'none'}}>{a.contrato_id}</span>;
                      })}
                      {deficit&&<span style={{color:C.red,fontWeight:600,marginLeft:4}}>⚠{100-pctActivo}%</span>}
                    </div>
                  );
                }},
                {key:"dias",      label:"Días",        render:r=><span style={{color:C.textMuted}}>{r.dias_trabajados}</span>},
                {key:"haberes",   label:"Total Haberes",render:r=><span style={{fontVariantNumeric:"tabular-nums"}}>{clp(r.total_haberes)}</span>},
                {key:"desc",      label:"Descuentos",  render:r=><span style={{color:C.red,fontVariantNumeric:"tabular-nums"}}>{clp(r.total_descuentos)}</span>},
                {key:"liquido",   label:"Líquido",     render:r=><span style={{fontWeight:700,color:C.accent,fontVariantNumeric:"tabular-nums"}}>{clp(r.liquido)}</span>},
                {key:"costo",     label:"Costo Empresa",render:r=><span style={{color:C.purple,fontVariantNumeric:"tabular-nums"}}>{clp(r.costo_empresa)}</span>},
                {key:"print",     label:"",            render:r=><button onClick={()=>reimprimirLiq(r,data)} style={{color:C.accent,background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 10px",fontSize:12,cursor:"pointer"}}>🖨</button>},
              ]}
              rows={[...liqList].reverse()}
              empty="Sin liquidaciones generadas"
            />
          </Panel>
        </div>
      </div>
      </>}
    </div>
  );
}

/* ─── Informes IA ───────────────────────────────────────────── */
/* ─── Cumplimiento Mensual ───────────────────────────────────── */
function Cumplimiento({data,insert,update}){
  const hoy=new Date();
  const todayStr=hoy.toISOString().slice(0,10);
  const periodoActual=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [periodoVer,setPeriodoVer]=useState(periodoActual);
  const [saving,setSaving]=useState(false);

  // Auto-generar obligaciones del período si no existen
  useEffect(()=>{
    const existentes=(data.obligaciones_mensuales||[]).map(o=>o.id);
    const [y,m]=periodoVer.split('-').map(Number);
    const nm=m===12?1:m+1; const ny=m===12?y+1:y;
    const nextM=`${ny}-${String(nm).padStart(2,'0')}`;
    const obligaciones=[
      {id:`OBL-${periodoVer}-PREVIRED`,tipo:'previred',categoria:'previsional',subtipo:'cotizaciones',
       nombre:'Cotizaciones Previred',periodo:periodoVer,fecha_vence:`${nextM}-13`,estado:'pendiente'},
      {id:`OBL-${periodoVer}-LRE`,tipo:'lre',categoria:'laboral',subtipo:'lre',
       nombre:'Libro Remuneraciones Electrónico (DT)',periodo:periodoVer,fecha_vence:`${nextM}-15`,estado:'pendiente'},
      {id:`OBL-${periodoVer}-F29`,tipo:'f29',categoria:'tributaria',subtipo:'iva',
       nombre:'Declaración F29 IVA — Internet con pago',periodo:periodoVer,fecha_vence:`${nextM}-20`,estado:'pendiente'},
    ];
    const faltantes=obligaciones.filter(o=>!existentes.includes(o.id));
    if(faltantes.length>0) faltantes.forEach(o=>insert('obligaciones_mensuales',o));
  },[periodoVer]);

  const CAT_TAG={
    previsional:{bg:'#f5f3ff',text:'#6d28d9',border:'#ddd6fe',icon:'💼'},
    tributaria: {bg:'#eff6ff',text:'#1d4ed8',border:'#bfdbfe',icon:'📋'},
    laboral:    {bg:'#f0fdf4',text:'#15803d',border:'#86efac',icon:'📂'},
    municipal:  {bg:'#fff7ed',text:'#c2410c',border:'#fed7aa',icon:'🏛️'},
    otra:       {bg:'#f9fafb',text:'#374151',border:'#e5e7eb',icon:'📌'},
  };
  const ESTADO={
    pendiente:{bg:'#fef9c3',text:'#92400e',border:'#fde68a',label:'⏳ Pendiente'},
    preparado:{bg:'#eff6ff',text:'#1d4ed8',border:'#bfdbfe',label:'📄 Preparado'},
    pagado:   {bg:'#f0fdf4',text:'#15803d',border:'#86efac',label:'✅ Pagado'},
    vencido:  {bg:'#fef2f2',text:'#dc2626',border:'#fca5a5',label:'⚫ Vencido'},
  };

  const oblsPeriodo=(data.obligaciones_mensuales||[])
    .filter(o=>o.periodo===periodoVer)
    .sort((a,b)=>new Date(a.fecha_vence)-new Date(b.fecha_vence));

  const cambiarEstado=async(obl,nuevoEstado)=>{
    setSaving(true);
    const updates={...obl,estado:nuevoEstado};
    if(nuevoEstado==='preparado' && !obl.fecha_preparacion) updates.fecha_preparacion=todayStr;
    if(nuevoEstado==='pagado' && !obl.fecha_pago) updates.fecha_pago=todayStr;
    await update('obligaciones_mensuales',updates);
    setSaving(false);
  };

  const fmtFch=f=>f?new Date(f.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'}):null;

  return(
    <div>
      <PageHeader title="Cumplimiento Mensual" subtitle="Obligaciones previsionales, tributarias y laborales"/>
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <FL label="Período"><input type="month" style={{...INP,width:160}} value={periodoVer} onChange={e=>setPeriodoVer(e.target.value)}/></FL>
        <div style={{display:'flex',gap:6,marginTop:18,flexWrap:'wrap'}}>
          {['pendiente','preparado','pagado'].map(e=>{
            const count=oblsPeriodo.filter(o=>o.estado===e).length;
            if(!count) return null;
            const st=ESTADO[e];
            return<span key={e} style={{fontSize:11,padding:'3px 10px',background:st.bg,color:st.text,border:`1px solid ${st.border}`,borderRadius:12}}>{st.label} {count}</span>;
          })}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {oblsPeriodo.map(obl=>{
          const vence=new Date(obl.fecha_vence.split('T')[0]+'T12:00:00');
          const hoyD=new Date(); hoyD.setHours(12,0,0,0);
          const diasCal=Math.round((vence-hoyD)/(1000*60*60*24));
          const cat=CAT_TAG[obl.categoria||'otra']||CAT_TAG.otra;
          const st=ESTADO[obl.estado]||ESTADO.pendiente;
          const pagada=obl.estado==='pagado';
          let alertColor=C.green;
          if(pagada)         alertColor=C.green;
          else if(diasCal<0) alertColor='#dc2626';
          else if(diasCal<=2)alertColor='#c2410c';
          else if(diasCal<=5)alertColor='#b45309';
          const borderColor=pagada?'#86efac':diasCal<=2&&!pagada?'#fca5a5':C.border;

          return(
            <div key={obl.id} style={{background:C.surface,border:`1px solid ${borderColor}`,borderRadius:8,padding:'14px 16px'}}>
              {/* Header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:18}}>{cat.icon}</span>
                  <div>
                    <span style={{fontWeight:700,fontSize:13,color:C.text}}>{obl.nombre}</span>
                    <div style={{display:'flex',gap:6,marginTop:3}}>
                      <span style={{fontSize:10,padding:'1px 6px',background:cat.bg,color:cat.text,border:`1px solid ${cat.border}`,borderRadius:4}}>{obl.categoria||'otra'}</span>
                      {obl.subtipo&&<span style={{fontSize:10,padding:'1px 6px',background:C.surfaceAlt,color:C.textMuted,borderRadius:4}}>{obl.subtipo}</span>}
                      <span style={{fontSize:10,padding:'1px 6px',background:C.surfaceAlt,color:C.textMuted,borderRadius:4}}>Período {obl.periodo}</span>
                    </div>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:13,fontWeight:700,color:alertColor}}>
                    {pagada?'✅ Pagado':diasCal<0?`⚫ Venció hace ${Math.abs(diasCal)}d`:diasCal===0?'🔴 Vence HOY':`${diasCal} día${diasCal!==1?'s':''}`}
                  </div>
                  <div style={{fontSize:11,color:C.textMuted}}>
                    Vence: <b>{fmtFch(obl.fecha_vence)}</b>
                    {obl.tipo==='previred'
                      ? <span style={{background:'#f5f3ff',color:'#7c3aed',border:'1px solid #ddd6fe',borderRadius:4,padding:'1px 6px',marginLeft:6,fontSize:10,fontWeight:600}}>Inamovible</span>
                      : <span style={{background:'#f0fdf4',color:'#15803d',border:'1px solid #86efac',borderRadius:4,padding:'1px 6px',marginLeft:6,fontSize:10,fontWeight:600}}>Prorrogable</span>
                    }
                  </div>
                </div>
              </div>

              {/* Fechas de gestión */}
              {(obl.fecha_preparacion||obl.fecha_pago)&&(
                <div style={{display:'flex',gap:16,marginBottom:8,fontSize:11,color:C.textMuted}}>
                  {obl.fecha_preparacion&&<span>📄 Preparado: <b style={{color:'#1d4ed8'}}>{fmtFch(obl.fecha_preparacion)}</b></span>}
                  {obl.fecha_pago&&<span>✅ Pagado: <b style={{color:'#15803d'}}>{fmtFch(obl.fecha_pago)}</b></span>}
                  {obl.monto>0&&<span>💰 <b style={{color:C.text}}>{clp(obl.monto)}</b></span>}
                </div>
              )}

              {/* Botones de estado */}
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                {['pendiente','preparado','pagado'].map(e=>{
                  const s=ESTADO[e];
                  return(
                    <button key={e} disabled={saving} onClick={()=>cambiarEstado(obl,e)}
                      style={{fontSize:11,padding:'4px 12px',borderRadius:6,cursor:'pointer',
                        background:obl.estado===e?s.bg:'transparent',
                        color:obl.estado===e?s.text:C.textMuted,
                        border:`1px solid ${obl.estado===e?s.border:C.border}`,
                        fontWeight:obl.estado===e?700:400,opacity:saving?0.6:1}}>
                      {s.label}
                    </button>
                  );
                })}
                {pagada&&(
                  <input type="number" placeholder="Monto $" defaultValue={obl.monto||''}
                    onBlur={e=>update('obligaciones_mensuales',{...obl,monto:Number(e.target.value)})}
                    style={{...INP,width:130,fontSize:11,padding:'4px 8px'}}/>
                )}
              </div>
            </div>
          );
        })}
        {oblsPeriodo.length===0&&(
          <div style={{textAlign:'center',padding:40,color:C.textMuted,fontSize:13}}>
            <p>Generando obligaciones para {periodoVer}...</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const generar=async()=>{setLoading(true);setInforme("");setError("");try{const apiKey=import.meta.env.VITE_ANTHROPIC_API_KEY;if(!apiKey){throw new Error("API key no configurada");}const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1000,messages:[{role:"user",content:prompts[tipo]}]})});const json=await res.json();if(json.error)throw new Error(JSON.stringify(json.error));setInforme(json.content?.map(b=>b.text||"").join("")||"Sin respuesta.");}catch(e){setError("Error: "+e.message);}setLoading(false);};
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
  // ── Detección modo QR (cuando trabajador escanea) ────────────
  const depQR = typeof window!=="undefined"
    ? new URLSearchParams(window.location.search).get("dep")
    : null;
  const [tab,setTab]=useState("dashboard");
  const [contratoId,setContratoId]=useState("");
  const {data,loading,dbMode,insert,update,saveRem,reload}=useData();
  const { user, perfil, loading: authLoading } = useAuth();
  useEffect(() => { if (user) reload(); }, [user]);
if(authLoading) return <Spinner/>;
if(!user && !depQR) return <Login/>;
if(user && !perfil) return <Spinner/>;
if(perfil?.rol === 'trabajador') return <PortalTrabajador />;

  if(loading||!data)return<Spinner/>;
  if(depQR)return<ModoQR depId={depQR} data={data} insert={insert} loading={loading}/>;

  const contratos=data.contratos||[];
  const incAb=(contratoId?data.incidencias?.filter(i=>i.contrato_id===contratoId&&i.estado==="Abierta"):data.incidencias?.filter(i=>i.estado==="Abierta"))?.length||0;

  return (
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
          <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
  <div style={{display:"flex",alignItems:"center",gap:6}}>
    <div style={{width:7,height:7,borderRadius:"50%",background:dbMode?C.green:C.yellow}}/>
    <span style={{fontSize:11,color:C.textMuted}}>{dbMode?"Supabase conectado":"Modo demo"}</span>
  </div>
  <UserMenu />
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
        {tab==="trabajadores"   &&<Trabajadores    data={data} insert={insert} update={update} contratoId={contratoId}/>}
        {tab==="evidencias"    &&<TabEvidencias   data={data} contratoId={contratoId}/>}
        {tab==="qr"            &&<TabQR           data={data} contratoId={contratoId}/>}
        {tab==="asistencia"     &&<Asistencia      data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="checklist"      &&<Checklist       data={data} contratoId={contratoId} insert={insert}/>}
        {tab==="incidencias"    &&<Incidencias     data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="supervisiones"  &&<Supervisiones   data={data} contratoId={contratoId} insert={insert}/>}
        {tab==="remuneraciones" &&<Remuneraciones  data={data} saveRem={saveRem} insert={insert} update={update}/>}
        {tab==="cumplimiento"   &&<Cumplimiento    data={data} insert={insert} update={update}/>}
        {tab==="informes"       &&<InformesIA      data={data} contratoId={contratoId}/>}
        </div>
    </div>
  );
}
