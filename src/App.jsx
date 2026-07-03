import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isConfigured } from "./supabase.js";
import { useAuth } from "./contexts/AuthContext.jsx";
import Login from "./components/Login.jsx";
import PortalTrabajador from "./components/PortalTrabajador.jsx";
import { UserMenu } from "./components/ProtectedRoute.jsx";
import { construirCondicionLaboral, calcularImpactoLaboral } from "./utils/motorImpacto.js";
import { plantillasDisponibles, getPlantilla } from "./config/plantillasOperacionales.js";

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

/* ─── J1: Jornada estructurada ──────────────────────────────── */
// Tope legal de jornada por vigencia. PARÁMETRO NORMATIVO (Estado), no cifra fija.
// Fuente: Ley 21.561. Cuando exista tabla de parámetros normativos, migra allí.
const TOPE_JORNADA_NORMATIVO = [
  { desde: "2028-04-26", tope: 40 },
  { desde: "2026-04-26", tope: 42 },
  { desde: "2024-04-26", tope: 44 },
  { desde: "0000-01-01", tope: 45 },
];
const topeLegalJornada = (vigencia_desde) => {
  const f = (vigencia_desde && String(vigencia_desde).slice(0,10)) || new Date().toISOString().slice(0,10);
  return (TOPE_JORNADA_NORMATIVO.find(r => f >= r.desde) || { tope: 45 }).tope;
};
const J1_DIAS = { lu:"Lunes", ma:"Martes", mi:"Miércoles", ju:"Jueves", vi:"Viernes", sa:"Sábado", do:"Domingo" };
const J1_DIAS_ORDEN = ["lu","ma","mi","ju","vi","sa","do"];
// Generador de texto (PROYECCIÓN, no fuente). Nunca contiene cifras fijas: usa el valor real.
const jornadaATexto = (jp) => {
  if (!jp || typeof jp !== "object") return { jornada:"", horario:"" };
  // J1.1: jornada COMPUESTA (más de un componente activo) → listar componentes + total.
  if (Array.isArray(jp.componentes) && jp.componentes.length > 1) {
    const partes = jp.componentes.map((c,i) => {
      const g = jornadaATexto({ ...c, componentes: undefined });
      const etiqueta = c.id === "base" ? "Componente base" : `Componente adicional${jp.componentes.length>2?` ${i}`:""}`;
      const desc = [g.jornada, g.horario].filter(Boolean).join(" ").replace(/\.\s*$/, "");
      return `${etiqueta}: ${desc || (c.horas_semanales!=null?`${c.horas_semanales} horas semanales`:"—")}`;
    });
    const total = jp.componentes.reduce((s,c)=>s+(Number(c.horas_semanales)||0),0);
    return { jornada: `Jornada compuesta. ${partes.join(". ")}. Total vigente: ${total} horas semanales.`, horario:"" };
  }
  const dias = (Array.isArray(jp.dias) ? jp.dias : []).slice().sort((a,b)=>J1_DIAS_ORDEN.indexOf(a)-J1_DIAS_ORDEN.indexOf(b));
  const diasTxt = dias.length
    ? dias.map(d=>J1_DIAS[d]||d).join(", ").replace(/, ([^,]*)$/, " y $1")
    : "";
  const tipoMap = { ordinaria:"ordinaria", parcial:"parcial", bisemanal:"bisemanal", otra:"" };
  const tipoTxt = tipoMap[jp.tipo] != null ? tipoMap[jp.tipo] : "ordinaria";
  const hs = (jp.horas_semanales != null && jp.horas_semanales !== "") ? `${jp.horas_semanales} horas semanales` : "";
  let jornada = "";
  if (tipoTxt && hs) jornada = `Jornada ${tipoTxt} de ${hs}.`;
  else if (hs) jornada = `Jornada de ${hs}.`;
  else if (tipoTxt) jornada = `Jornada ${tipoTxt}.`;
  const colTxt = (jp.colacion_minutos != null && jp.colacion_minutos !== "")
    ? `, con ${jp.colacion_minutos} min de colación${jp.colacion_imputable ? " (imputable)" : ""}` : "";
  const horario = (diasTxt && jp.hora_inicio && jp.hora_termino)
    ? `${diasTxt} de ${jp.hora_inicio} a ${jp.hora_termino}${colTxt}.` : "";
  return { jornada, horario };
};
// Validación. {ok, errores[], aviso}. El tope NO es cifra fija: viene del parámetro normativo.
const validarJornada = (jp) => {
  const e = [];
  if (!jp) return { ok:false, errores:["Sin datos de jornada."], aviso:"" };
  if (!jp.vigencia_desde) e.push("Falta la fecha de vigencia (debe ser la fecha real del contrato, no la de captura).");
  if (!Array.isArray(jp.dias) || jp.dias.length === 0) e.push("Debe indicar al menos un día.");
  if (jp.hora_inicio && jp.hora_termino && jp.hora_inicio >= jp.hora_termino)
    e.push("La hora de inicio debe ser anterior a la de término.");
  if (!(Number(jp.horas_semanales) > 0)) e.push("Las horas semanales deben ser mayores a 0.");
  const tope = topeLegalJornada(jp.vigencia_desde);
  if (Number(jp.horas_semanales) > tope)
    e.push(`Las horas semanales (${jp.horas_semanales}) superan el tope legal vigente: ${tope} h (parámetro normativo a la fecha ${jp.vigencia_desde || "actual"}).`);
  let aviso = "";
  if (jp.hora_inicio && jp.hora_termino && Array.isArray(jp.dias) && jp.dias.length) {
    const tToMin = t => { const p = String(t).split(":").map(Number); return (p[0]||0)*60 + (p[1]||0); };
    const colResta = jp.colacion_imputable ? 0 : (Number(jp.colacion_minutos) || 0);
    const minDia = Math.max(0, tToMin(jp.hora_termino) - tToMin(jp.hora_inicio) - colResta);
    const hImpl = (minDia * jp.dias.length) / 60;
    if (Number(jp.horas_semanales) && Math.abs(hImpl - Number(jp.horas_semanales)) > 2)
      aviso = `Las horas implícitas (~${hImpl.toFixed(1)}) no calzan con las ${jp.horas_semanales} pactadas. Puede ser una distribución irregular legítima.`;
  }
  return { ok: e.length === 0, errores: e, aviso };
};

// J1.1 — Jornada vigente como PROYECCIÓN de actos jurídicos (por efectos sobre componentes).
// Recolecta cláusulas jornada del contrato laboral original (trabajador) y de los anexos aplicados.
const recolectarClausulasJornada = (trabajador, data) => {
  const out = [];
  const orig = Array.isArray(trabajador && trabajador.clausulas_contrato_original) ? trabajador.clausulas_contrato_original : [];
  orig.filter(c => c && c.clausula === "jornada").forEach(c => out.push({ ...c, _firma:"", _actoId:(c.acto_id||"") }));
  const anexos = (data && (data.anexos_contrato || data.anexos)) || [];
  anexos.filter(a => a && a.trabajador_id === (trabajador && trabajador.id)
                  && (a.estado === "aplicado" || a.estado === "firmado"))
    .forEach(a => {
      (Array.isArray(a.clausulas) ? a.clausulas : [])
        .filter(c => c && c.clausula === "jornada")
        .forEach(c => out.push({ ...c, acto_id: c.acto_id || a.id, _firma:String(a.fecha_firma||a.created_at||""), _actoId:String(c.acto_id||a.id||"") }));
    });
  return out;
};
// Orden determinístico: vigencia_desde → fecha_firma/created_at → acto_id → orden_efecto.
const _ordenClausulas = (a,b) =>
  String(a.vigencia_desde||"").localeCompare(String(b.vigencia_desde||""))
  || String(a._firma||"").localeCompare(String(b._firma||""))
  || String(a._actoId||"").localeCompare(String(b._actoId||""))
  || ((Number(a.orden_efecto)||0) - (Number(b.orden_efecto)||0));
// Devuelve SIEMPRE un resultado tipado. NUNCA texto legacy como jornada calculable.
// {estructurada:true, jornada:{...,componentes:[...]}} | {estructurada:false, motivo}
const jornadaVigente = (trabajador, fecha, data) => {
  if (!trabajador) return { estructurada:false, motivo:"sin_trabajador" };
  const f = String(fecha || new Date().toISOString().slice(0,10)).slice(0,10);
  const clausulas = recolectarClausulasJornada(trabajador, data || {})
    .filter(c => (!c.vigencia_desde || String(c.vigencia_desde).slice(0,10) <= f)
              && (!c.vigencia_hasta  || String(c.vigencia_hasta).slice(0,10)  >= f))
    .sort(_ordenClausulas);
  if (clausulas.length === 0) return { estructurada:false, motivo:"no_estructurada" };
  let comps = {}, base = null;
  clausulas.forEach(c => {
    const cid = c.componente_id || "base";
    const cont = c.contenido || {};
    switch (c.efecto) {
      case "establece_total": case "reemplaza_total": case "consolida_total":
        comps = { [cid]: cont }; base = cont; break;
      case "agrega_componente":
        comps[cid] = cont; break;
      case "modifica_componente":
        comps[cid] = { ...(comps[cid]||{}), ...cont }; if (cid === "base") base = { ...(base||{}), ...cont }; break;
      case "reduce_componente":
        comps[cid] = { ...(comps[cid]||{}), horas_semanales: Math.max(0, (Number((comps[cid]||{}).horas_semanales)||0) - (Number(cont.horas_semanales)||0)) }; break;
      case "cierra_componente":
        delete comps[cid]; break;
      default:
        comps = { [cid]: cont }; base = cont;
    }
  });
  const activos = Object.entries(comps).map(([id,j]) => ({ id, ...j }));
  if (activos.length === 0) return { estructurada:false, motivo:"sin_componentes_activos" };
  const horas = activos.reduce((s,c) => s + (Number(c.horas_semanales)||0), 0);
  const principal = base || activos[0];
  return { estructurada:true, jornada: { ...principal, horas_semanales: horas, componentes: activos } };
};
// Visual legacy SEPARADO — solo para mostrar info no estructurada, NUNCA para cálculo legal.
const jornadaVisualLegacy = (trabajador) => {
  const t = [trabajador && trabajador.jornada, trabajador && trabajador.horario].filter(Boolean).join(" ");
  return t ? `${t} (no estructurado)` : "";
};
// J2-lite: normaliza una hora al formato HH:mm. Pensada para aplicarse al confirmar (blur).
//  "0730"->"07:30", "730"->"07:30", "7:30"->"07:30", "1430"->"14:30", "7"->"07:00".
const fmtHoraOperativa = (v) => {
  const s = String(v || "").trim();
  if (s === "") return "";
  if (s.includes(":")) {
    const [h, m=""] = s.split(":");
    const hh = h.replace(/\D/g, "").slice(0, 2);
    const mm = m.replace(/\D/g, "").slice(0, 2);
    if (hh === "") return "";
    return hh.padStart(2, "0") + ":" + (mm === "" ? "00" : mm.padEnd(2, "0"));
  }
  const d = s.replace(/\D/g, "");
  if (d.length === 0) return "";
  if (d.length <= 2) return d.padStart(2, "0") + ":00";          // "7" -> 07:00
  if (d.length === 3) return "0" + d[0] + ":" + d.slice(1);       // 730 -> 07:30
  return d.slice(0, 2) + ":" + d.slice(2, 4);                     // 0730 -> 07:30 ; 1430 -> 14:30
};
const horaOperativaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ""));
// Rango "HH:mm-HH:mm" válido (ambos extremos válidos e inicio < término). "" se considera "no informado" (válido).
const horarioRangoValido = (r) => {
  if (!r) return true;
  const m = String(r).split("-");
  // Ambas horas válidas. Se permite término < inicio (cruce de medianoche, ej. 23:30-00:30).
  return m.length === 2 && horaOperativaValida(m[0]) && horaOperativaValida(m[1]);
};
const J2_DIAS = [["lu","Lun"],["ma","Mar"],["mi","Mié"],["ju","Jue"],["vi","Vie"],["sa","Sáb"],["do","Dom"]];
// Genera texto de días compacto desde un set: contiguos -> "Lun-Vie"; con huecos -> "Lun, Mié, Vie".
const diasATextoOperativo = (sel) => {
  const orden = J2_DIAS.map(d => d[0]);
  const idx = orden.map((k,i)=> (sel.includes(k)?i:-1)).filter(i=>i>=0);
  if (idx.length === 0) return "";
  const contiguo = idx.every((v,i,a)=> i===0 || v===a[i-1]+1);
  const lbl = k => (J2_DIAS.find(d=>d[0]===k)||[])[1];
  if (contiguo && idx.length > 2) return `${lbl(orden[idx[0]])}-${lbl(orden[idx[idx.length-1]])}`;
  return idx.map(i=>lbl(orden[i])).join(", ");
};
// Parsea un dias_semana existente (texto) a un set de claves, para precargar los chips.
// Soporta: "Lun-Vie", "Lun-Sáb", "Lun, Mié, Vie", "Lunes a viernes", con o sin acentos.
const textoADiasOperativo = (txt) => {
  const s = String(txt||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // sin acentos
  const orden = J2_DIAS.map(d=>d[0]);                 // ["lu","ma","mi","ju","vi","sa","do"]
  const ab = { lun:"lu", mar:"ma", mie:"mi", jue:"ju", vie:"vi", sab:"sa", dom:"do" };
  const keyOf = tok => { const a = Object.keys(ab).find(x => tok.startsWith(x)); return a ? ab[a] : null; };
  const dayRe = "(lun\\w*|mar\\w*|mie\\w*|jue\\w*|vie\\w*|sab\\w*|dom\\w*)";
  const rango = s.match(new RegExp(dayRe + "\\s*(?:-|\\ba\\b)\\s*" + dayRe)); // "lun-vie" o "lunes a viernes"
  if (rango) {
    const a = orden.indexOf(keyOf(rango[1])), b = orden.indexOf(keyOf(rango[2]));
    if (a>=0 && b>=a) { const out=[]; for (let i=a;i<=b;i++) out.push(orden[i]); return out; }
  }
  const out = [];
  (s.match(new RegExp(dayRe, "g")) || []).forEach(tok => { const k = keyOf(tok); if (k && !out.includes(k)) out.push(k); });
  return orden.filter(k => out.includes(k));
};
// J1.1: limpia el payload antes de escribir en `trabajadores`. Quita columnas legacy de jornada
// (la jornada vive en clausulas_contrato_original) y sanitiza fechas vacías ("" rompe columnas date).
const limpiarPayloadTrabajador = (obj) => {
  const clean = { ...obj };
  delete clean.jornada; delete clean.horario; delete clean.jornada_pactada;
  Object.keys(clean).forEach(k => { if (/^fecha/.test(k) && clean[k] === "") clean[k] = null; });
  return clean;
};

/* ─── Formatters ────────────────────────────────────────────── */
const clp = n => `$${Math.round(n||0).toLocaleString("es-CL")}`;
const pct = n => `${((n||0)*100).toFixed(2)}%`;
// J2-lite: formatea un porcentaje ya en escala 0-100 con máximo 2 decimales (coma decimal es-CL). 133.3299… -> "133,33%".
const fmtPct = n => `${(Math.round((Number(n)||0)*100)/100).toLocaleString("es-CL",{maximumFractionDigits:2})}%`;
// A.1: props para input de MONTO (vacío editable, sin "0" pegado, no negativos, normaliza ceros a la izquierda).
const montoInputProps = (val, onNum) => ({
  type:"number", min:0, inputMode:"numeric", placeholder:"Ej: 10000",
  value:(val===null||val===undefined||val==="")?"":val,
  onChange:e=>{ const r=e.target.value; onNum(r===""?"":Math.max(0,Number(r))); },
});
// A.2: props para input de HORAS (acepta decimales con coma o punto: 0,5 / 1.25). type text para permitir la coma.
// A.2: normaliza horas a número (coma->punto) al guardar; "" o inválido -> 0; nunca negativo.
const horasANumero = (v) => { const n=Number(String(v??"").replace(",",".")); return (isFinite(n)&&n>=0)?n:0; };
// A (mejora): parsea duración flexible -> horas decimales. "01:15"->1.25, "1:15"->1.25, "0:30"->0.5,
//  "1 h 15 min"->1.25, "75 min"->1.25, "1,25"->1.25, "1h30"->1.5, "2h05"->2.083.
const parseDuracion = (v) => {
  const s = String(v??"").trim().toLowerCase();
  if(s==="") return 0;
  let m = s.match(/^(\d{1,2}):(\d{1,2})$/);                              // HH:MM
  if(m) return Math.max(0, Number(m[1]) + Number(m[2])/60);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*h\s*(\d+)?\s*(?:m|min|minutos)?$/);   // "1h30", "1 h 15 min", "2h05", "1h"
  if(m){ const h=Number(m[1].replace(",",".")); const mn=m[2]?Number(m[2]):0; return Math.max(0, h + mn/60); }
  m = s.match(/^(\d+)\s*(?:m|min|minutos)$/);                            // "75 min", "90 minutos"
  if(m) return Math.max(0, Number(m[1])/60);
  const n = Number(s.replace(",","."));                                  // decimal puro (1,25 / 1.25)
  return (isFinite(n) && n>=0) ? n : 0;
};

// horas decimales -> "HH:MM" (vacío si <=0).
const duracionATexto = (dec) => {
  const n = Number(dec)||0; if(n<=0) return "";
  let h = Math.floor(n), mn = Math.round((n-h)*60);
  if(mn===60){ h+=1; mn=0; }
  return `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`;
};
// "HH:MM" + horas decimales -> "HH:MM" término (envuelve medianoche).
const sumaHoraFin = (iniHHMM, decHoras) => {
  const p = String(iniHHMM||"").split(":"); if(p.length<2) return "";
  const start=(Number(p[0])||0)*60+(Number(p[1])||0);
  const end=(start + Math.round((Number(decHoras)||0)*60))%1440;
  return `${String(Math.floor(end/60)).padStart(2,"0")}:${String(end%60).padStart(2,"0")}`;
};
// diferencia entre "HH:MM" inicio y término -> horas decimales (cruce de medianoche permitido).
const difHorasDec = (iniHHMM, finHHMM) => {
  const pi=String(iniHHMM||"").split(":"), pf=String(finHHMM||"").split(":");
  if(pi.length<2||pf.length<2) return 0;
  let d = ((Number(pf[0])||0)*60+(Number(pf[1])||0)) - ((Number(pi[0])||0)*60+(Number(pi[1])||0));
  if(d<0) d+=1440;
  return Math.round(d/60*100)/100;
};
const dateOnly = v => v ? String(v).split("T")[0] : "";
const dateNoon = v => { const d=dateOnly(v); return d ? `${d}T12:00:00` : null; };
const parseNoon = v => v ? new Date(`${dateOnly(v)}T12:00:00`) : null;
const isAsignacionVigenteHoy = a => {
  if(!a || a.afecta_remuneracion===false) return false;
  if(a.estado_asig!=="activa" || a.activo===false) return false;
  const hoy=new Date(); hoy.setHours(12,0,0,0);
  const ini=parseNoon(a.fecha_inicio_asig);
  const fin=parseNoon(a.fecha_termino_asig);
  if(ini && ini>hoy) return false;
  if(fin && fin<hoy) return false;
  return true;
};
const isAsignacionRemuneracional = a => a && a.afecta_remuneracion !== false;
const isAsignacionOperacional = a => a && a.afecta_remuneracion === false;

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
  {key:"configuracion",  label:"Empresa",        icon:Icon.contratos},
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
// Campo de fecha con escritura libre dd/mm/aaaa (valida solo al completar 10 caracteres) + calendario.
// Permite fechas futuras (salvo que se pase max). No transforma ni guarda fechas parciales.
function FechaInput({value,onChange,style,max}){
  const isoToDisp=iso=>{ if(!iso) return ''; const p=String(iso).split('T')[0].split('-'); return (p.length===3&&p[0]&&p[1]&&p[2])?`${p[2]}/${p[1]}/${p[0]}`:''; };
  const [txt,setTxt]=useState(isoToDisp(value));
  const [msg,setMsg]=useState('');
  useEffect(()=>{ setTxt(isoToDisp(value)); },[value]);
  const commit=v=>{
    if(v.length===0){ setMsg(''); onChange(''); return; }
    if(v.length<10){ setMsg('Completa la fecha en formato dd/mm/aaaa'); return; }
    const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m){ setMsg('Completa la fecha en formato dd/mm/aaaa'); return; }
    const d=m[1],mo=m[2],y=m[3]; const iso=`${y}-${mo}-${d}`; const dt=new Date(iso+'T12:00:00');
    if(isNaN(dt)||dt.getFullYear()!=+y||(dt.getMonth()+1)!=+mo||dt.getDate()!=+d){ setMsg('Fecha inválida'); return; }
    if(max&&iso>max){ setMsg('La fecha no puede ser posterior a hoy'); return; }
    setMsg(''); onChange(iso);
  };
  const onText=e=>{ const v=e.target.value.replace(/[^\d/]/g,'').slice(0,10); setTxt(v); if(v.length===10||v.length===0) commit(v); else setMsg('Completa la fecha en formato dd/mm/aaaa'); };
  return (
    <div>
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <input style={{...(style||INP),flex:1}} value={txt} onChange={onText} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10}/>
        <input type="date" aria-label="Abrir calendario" title="Calendario" style={{width:36,minWidth:36,padding:'6px 2px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text,boxSizing:'border-box',cursor:'pointer'}} value={value?String(value).split('T')[0]:''} max={max||undefined} onChange={e=>{ const iv=e.target.value; if(iv){ setTxt(isoToDisp(iv)); setMsg(''); onChange(iv); } }}/>
      </div>
      {msg&&<div style={{fontSize:11,color:'#9a3412',marginTop:4}}>{msg}</div>}
    </div>
  );
}
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
const TABLES=["trabajadores","contratos","dependencias","checklist","evidencias","incidencias","supervisiones","tasas_afp","parametros_legales","liquidaciones","asignaciones","tabla_iusc","horarios","asistencia","feriados_chile","obligaciones_mensuales","anexos_contrato","entregas_epp","documentos_trabajador","cumplimiento_egreso","desvinculaciones_programadas","evaluaciones_vencimiento","qr_actividades","qr_actividad_fotos"];

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

  const saveAsignacion=useCallback(async(record)=>{
    if(!isConfigured||!dbMode)return false;
    const clean={...record};
    delete clean._edit;
    delete clean._original_contrato_id;

    // Blindaje zona horaria Chile: guardar fechas de asignación a mediodía local
    // y convertir campos vacíos a NULL para poder limpiar fechas en Supabase.
    clean.fecha_inicio_asig = dateNoon(clean.fecha_inicio_asig);
    clean.fecha_termino_asig = dateNoon(clean.fecha_termino_asig);

    Object.keys(clean).forEach(k=>{ if(clean[k]===undefined) delete clean[k]; });
    const{error}=await supabase.from("asignaciones").upsert(clean,{onConflict:"trabajador_id,contrato_id"});
    if(error){alert("Error asignación: "+error.message);return false;}
    await loadAll();return true;
  },[dbMode,loadAll]);

  const terminarAsignacion=useCallback(async(asig,fechaTermino)=>{
    if(!isConfigured||!dbMode)return false;
    const{error}=await supabase.from("asignaciones")
      .update({activo:false,estado_asig:"terminada",fecha_termino_asig:dateNoon(fechaTermino)})
      .eq("trabajador_id",asig.trabajador_id)
      .eq("contrato_id",asig.contrato_id);
    if(error){alert("Error al terminar asignación: "+error.message);return false;}
    await loadAll();return true;
  },[dbMode,loadAll]);

  return{data,loading,dbMode,insert:(t,r)=>save(t,r,false),update:(t,r)=>save(t,r,true),saveRem,saveAsignacion,terminarAsignacion,reload:loadAll};
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

// Contador del preaviso (Art. 161 programado). Días CORRIDOS hasta la fecha de separación.
function calcPreaviso(fechaSeparacion){
  if(!fechaSeparacion) return null;
  const hoy=new Date(); hoy.setHours(12,0,0,0);
  const fin=new Date(String(fechaSeparacion).split('T')[0]+'T12:00:00');
  const diasRest=Math.round((fin-hoy)/(1000*60*60*24));
  let estado='enCurso', sem={bg:'#f0fdf4',text:'#166534',icon:'🟢'};
  if(diasRest<=0){ estado='cumplido'; sem={bg:'#f5f3ff',text:'#6d28d9',icon:'⚫'}; }
  else if(diasRest<=3){ sem={bg:'#fef2f2',text:'#991b1b',icon:'🔴'}; }
  else if(diasRest<=7){ sem={bg:'#fff7ed',text:'#9a3412',icon:'🟠'}; }
  else if(diasRest<=15){ sem={bg:'#fefce8',text:'#92400e',icon:'🟡'}; }
  return {diasRest, estado, sem, fmtFin:fin.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'})};
}
function genDesvProgId(trabajadorId){
  return `DP-${(trabajadorId||'TR').slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
}
// Devuelve la fila de preaviso ACTIVA (programada) de un trabajador, si existe.
function preavisoActivo(trabajadorId, data){
  return (data.desvinculaciones_programadas||[]).find(d=>d.trabajador_id===trabajadorId && d.estado==='programada')||null;
}

function Dashboard({data,contratoId,insert,update,setTab}){
  const [evalModal,setEvalModal]=useState(null);   // B2: {tipo, contrato, trabajadores, ...campos}
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

        // PANEL 1: Vencimiento de licitaciones / continuidad contractual
        const evalsResueltas=(data.evaluaciones_vencimiento||[]).filter(e=>e.estado!=='pendiente');
        const alertasLic=(data.contratos||[]).filter(c=>c.fecha_termino_contrato&&c.activo).map(c=>{
          const u=umbralAlertaContrato(c);
          if(!u.alertaTermino) return null;                       // privado permanente: sin alerta de termino
          const a=calcAlertaLicitacion(c.fecha_termino_contrato, u.diasAlerta, feriadosSet);
          if(!a||a.nivel==='normal') return null;                 // fuera del umbral por tipo: no mostrar
          const ev=evalsResueltas.filter(e=>e.contrato_id===c.id&&((e.detalle&&e.detalle.termino_evaluado)||'')===dateOnly(c.fecha_termino_contrato))
            .sort((x,y)=>String(y.fecha_resolucion||y.created_at||'').localeCompare(String(x.fecha_resolucion||x.created_at||'')))[0];
          // Un 'renovar' que aun calza con la fecha de termino vigente NO movio la fecha
          // (una renovacion real cambia la fecha y deja de calzar) => en gestion, nunca verde. Cubre registros legados no-op.
          const enGestion = ev && ev.accion==='renovar';
          return{...c, alerta:a, resuelta:(ev&&!enGestion)?ev:null, enGestion:enGestion?ev:null};               // resuelto (reasignar/art161/no_aplica) o en gestion (renovar): se muestra con chip, no desaparece
        }).filter(Boolean).sort((a,b)=>a.alerta.diasCal-b.alerta.diasCal);

        // PANEL 2: Finiquitos pendientes por trabajador (fecha_separacion individual)
        const alertasFin=(data.trabajadores||[]).filter(t=>
          t.fecha_separacion && t.finiquito_estado && t.finiquito_estado!=='firmado' && t.finiquito_estado!=='na'
        ).map(t=>{
          const af=calcAlertaFiniquito(t.fecha_separacion, feriadosSet);
          return{...t, af};
        }).filter(t=>t.af).sort((a,b)=>a.af.diasRestLegal-b.af.diasRestLegal);

        // PANEL 3: Desvinculaciones programadas (Art. 161 — preaviso)
        const alertasPreaviso=(data.desvinculaciones_programadas||[]).filter(d=>d.estado==='programada').map(d=>{
          const t=(data.trabajadores||[]).find(x=>x.id===d.trabajador_id);
          return {...d, _trab:t, cp:calcPreaviso(d.fecha_separacion)};
        }).filter(d=>d._trab&&d.cp).sort((a,b)=>a.cp.diasRest-b.cp.diasRest);

        if(!alertasLic.length && !alertasFin.length && !alertasPreaviso.length) return null;

        const NIVEL={
          vencida: {bg:'#f5f3ff',text:'#6d28d9',icon:'⚫',label:'Vencida'},
          roja:    {bg:'#fef2f2',text:'#991b1b',icon:'🚨',label:'Crítico'},
          naranja: {bg:'#fff7ed',text:'#9a3412',icon:'🟠',label:'Urgente'},
          amarilla:{bg:'#fefce8',text:'#92400e',icon:'⚠️',label:'Atención'},
        };
        const ACCION_LABEL={renovar:'Renovado',reasignar:'Reasignado',art161:'Art. 161 programado',no_aplica:'No aplica'};
        const SEM={
          vencido: {bg:'#f5f3ff',text:'#6d28d9',icon:'⚫'},
          rojo:    {bg:'#fef2f2',text:'#991b1b',icon:'🔴'},
          naranja: {bg:'#fff7ed',text:'#9a3412',icon:'🟠'},
          amarillo:{bg:'#fefce8',text:'#92400e',icon:'🟡'},
          verde:   {bg:'#f0fdf4',text:'#166534',icon:'🟢'},
        };
        const BTN_EVAL=(col)=>({background:'#fff',border:`1px solid ${col}`,color:col,borderRadius:5,padding:'4px 10px',fontSize:11,fontWeight:600,cursor:'pointer'});
        return(
          <div style={{marginBottom:20,display:'flex',flexDirection:'column',gap:12}}>

            {/* PANEL 3 — Desvinculaciones programadas (Art. 161 preaviso) */}
            {alertasPreaviso.length>0&&(
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'12px 16px'}}>
                <p style={{fontWeight:700,color:'#1e40af',fontSize:13,marginBottom:10}}>📅 DESVINCULACIONES PROGRAMADAS (PREAVISO)</p>
                {alertasPreaviso.map((d,i)=>{
                  const cp=d.cp, cumplido=cp.estado==='cumplido';
                  return(
                    <div key={i} style={{background:cp.sem.bg,border:`1px solid ${cp.sem.text}40`,borderRadius:6,padding:'8px 12px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <span style={{fontWeight:600,color:cp.sem.text,fontSize:13}}>{cp.sem.icon} {d._trab.nombre}</span>
                        <span style={{fontSize:11,color:cp.sem.text,marginLeft:8}}>Separación: {cp.fmtFin}</span>
                        {d.sustitutiva&&<span style={{fontSize:11,color:'#991b1b',marginLeft:8}}>· con sustitutiva</span>}
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:cp.sem.text,whiteSpace:'nowrap'}}>
                        {cumplido?'⚫ FINALIZAR':`faltan ${cp.diasRest} día(s)`}
                      </span>
                    </div>
                  );
                })}
                <p style={{fontSize:10,color:C.textMuted,marginTop:4}}>Gestiona cada preaviso (finalizar / anticipar / cancelar) desde la ficha del trabajador → Datos personales.</p>
              </div>
            )}

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

            {/* PANEL 1 — Contratos / Asignaciones por vencer (B2) */}
            {alertasLic.length>0&&(
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'12px 16px'}}>
                <p style={{fontWeight:700,color:'#92400e',fontSize:13,marginBottom:8}}>📋 CONTRATOS / ASIGNACIONES POR VENCER — Evaluación de continuidad</p>
                {alertasLic.map((c,i)=>{
                  const n=NIVEL[c.alerta.nivel]||NIVEL.amarilla;
                  const u=umbralAlertaContrato(c);
                  const tipoTag=TIPO_CENTRO_TAG[c.tipo_centro_costo||'LICITACION']||TIPO_CENTRO_TAG.LICITACION;
                  const trabAf=(data.asignaciones||[]).filter(a=>a.contrato_id===c.id&&a.afecta_remuneracion!==false&&a.estado_asig==='activa'&&a.activo!==false)
                    .map(a=>{const t=(data.trabajadores||[]).find(x=>x.id===a.trabajador_id);return t?{id:t.id,nombre:t.nombre||t.id,rut:t.rut}:null;}).filter(Boolean);
                  return(
                    <div key={i} style={{background:n.bg,borderRadius:6,padding:'10px 12px',marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                        <div>
                          <span style={{fontWeight:700,color:n.text}}>{n.icon} {c.id} — {c.cliente||'(sin cliente)'}</span>
                          <span style={{display:'inline-block',marginLeft:8,background:tipoTag.bg,color:tipoTag.text,border:`1px solid ${tipoTag.border}`,borderRadius:4,fontSize:10,fontWeight:600,padding:'1px 6px'}}>{tipoTag.label}</span>
                          <span style={{fontSize:11,color:n.text,marginLeft:8}}>Vence {new Date(c.fecha_termino_contrato.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}</span>
                          {c.probabilidad_renovacion&&<span style={{fontSize:11,color:n.text,marginLeft:8}}>· Renovación: {c.probabilidad_renovacion}</span>}
                          <div style={{fontSize:10,color:n.text,opacity:0.85,marginTop:2}}>Umbral efectivo: {u.diasAlerta} d. háb.{u.manual?` · manual (sobrescribe default ${tipoTag.label} ${u.defaultTipo} d.)`:` · default del tipo`}</div>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:n.text,whiteSpace:'nowrap'}}>{c.alerta.diasCal<=0?'VENCIDA':`${c.alerta.diasHab} d. háb.`}</span>
                      </div>
                      <div style={{fontSize:11,color:n.text,marginTop:6}}>
                        <b>Trabajadores afectados:</b> {trabAf.length?trabAf.map(t=>`${t.nombre}${t.rut?` (${t.rut})`:''}`).join('  ·  '):'sin asignación remuneracional activa'}
                      </div>
                      {c.resuelta&&(
                        <div style={{marginTop:8}}>
                          <span style={{display:'inline-block',background:'#ecfdf5',border:'1px solid #a7f3d0',color:'#047857',borderRadius:6,fontSize:11,fontWeight:600,padding:'4px 10px'}}>
                            ✅ Resuelto · {ACCION_LABEL[c.resuelta.accion]||c.resuelta.accion||'evaluado'}{c.resuelta.responsable?` · ${c.resuelta.responsable}`:''}{(c.resuelta.fecha_resolucion||c.resuelta.created_at)?` · ${new Date(String(c.resuelta.fecha_resolucion||c.resuelta.created_at).split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}`:''}
                          </span>
                        </div>
                      )}
                      {c.enGestion&&(
                        <div style={{marginTop:8}}>
                          <span style={{display:'inline-block',background:'#fff7ed',border:'1px solid #fed7aa',color:'#9a3412',borderRadius:6,fontSize:11,fontWeight:600,padding:'4px 10px'}}>
                            🔄 Renovación en gestión — falta nueva fecha formal{c.enGestion.responsable?` · ${c.enGestion.responsable}`:''}{(c.enGestion.fecha_resolucion||c.enGestion.created_at)?` · ${new Date(String(c.enGestion.fecha_resolucion||c.enGestion.created_at).split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}`:''}
                          </span>
                          {(c.alerta.nivel==='roja'||c.alerta.nivel==='vencida')&&(
                            <div style={{marginTop:6,fontSize:11,fontWeight:600,color:'#991b1b',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'6px 10px'}}>⚠ Renovación en gestión y el contrato está por vencer sin fecha formal. Ingresa la nueva fecha de término.</div>
                          )}
                        </div>
                      )}
                      {!c.resuelta&&(
                      <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
                        <button onClick={()=>setEvalModal({tipo:'renovar',contrato:c,trabajadores:trabAf,nueva:'',responsable:'',obs:''})} style={BTN_EVAL('#1d4ed8')}>{c.enGestion?'Ingresar fecha formal':'Renovar'}</button>
                        <button onClick={()=>setEvalModal({tipo:'reasignar',contrato:c,trabajadores:trabAf,responsable:'',obs:''})} style={BTN_EVAL('#0e7490')}>Reasignar</button>
                        <button onClick={()=>setEvalModal({tipo:'art161',contrato:c,trabajadores:trabAf,sel:trabAf.filter(t=>!preavisoActivo(t.id,data)).map(t=>t.id),fecha:'',responsable:'',obs:''})} style={BTN_EVAL('#b45309')} disabled={!trabAf.length} title={trabAf.length?'':'No hay trabajadores afectados'}>Iniciar Art. 161 programado</button>
                        <button onClick={()=>setEvalModal({tipo:'no_aplica',contrato:c,trabajadores:trabAf,motivo:'',responsable:''})} style={BTN_EVAL('#6b7280')}>No aplica</button>
                      </div>
                      )}
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
      {evalModal&&(()=>{
        const c=evalModal.contrato;
        const cBase=(data.contratos||[]).find(x=>x.id===c.id)||c;
        const terminoEval=dateOnly(c.fecha_termino_contrato);
        const cerrar=()=>setEvalModal(null);
        const guardarEval=async(extra)=>{
          await insert('evaluaciones_vencimiento',{id:genId('EV'),contrato_id:c.id,fecha_alerta:hoy,trabajadores_afectados:evalModal.trabajadores.map(t=>t.id),responsable:evalModal.responsable||'',observaciones:evalModal.obs||'',fecha_resolucion:hoy,estado:'resuelta',created_at:new Date().toISOString(),...(extra.row||{}),detalle:{termino_evaluado:terminoEval,...(extra.detalle||{})}});
        };
        const doRenovar=async()=>{
          if(evalModal.nueva){
            if(evalModal.nueva<=dateOnly(cBase.fecha_termino_contrato)){ alert('La nueva fecha de término debe ser posterior a la actual ('+new Date(cBase.fecha_termino_contrato.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')+').'); return; }
            await update('contratos',{...cBase,fecha_termino_contrato:evalModal.nueva});
            await guardarEval({row:{accion:'renovar',estado:'resuelta',nueva_fecha_termino:evalModal.nueva},detalle:{nueva_fecha_termino:evalModal.nueva}});
          } else {
            await guardarEval({row:{accion:'renovar',estado:'en_gestion'},detalle:{en_gestion:true}});
          }
          cerrar();
        };
        const doReasignar=async()=>{ await guardarEval({row:{accion:'reasignar'}}); cerrar(); setTab&&setTab('trabajadores'); };
        const doReasignarMover=async(t)=>{ pendingMovilidadStart={trabajadorId:t.id, origenContratoId:cBase.id}; await guardarEval({row:{accion:'reasignar'},detalle:{trabajador_id:t.id}}); cerrar(); setTab&&setTab('trabajadores'); };
        const doNoAplica=async()=>{ if(!(evalModal.motivo||'').trim())return; await guardarEval({row:{accion:'no_aplica'},detalle:{motivo:evalModal.motivo}}); cerrar(); };
        const doArt161=async()=>{
          if(!evalModal.fecha||!(evalModal.sel||[]).length)return;
          const diasAviso=Math.round((new Date(evalModal.fecha+'T12:00:00')-new Date(hoy+'T12:00:00'))/86400000); const sustitutiva=diasAviso<30;
          for(const tid of (evalModal.sel||[])){ const w=(data.trabajadores||[]).find(x=>x.id===tid); if(!w||preavisoActivo(tid,data))continue;
            await insert('desvinculaciones_programadas',{id:genDesvProgId(tid),trabajador_id:tid,causal:'art161',fecha_carta:hoy,fecha_separacion:dateNoon(evalModal.fecha),dias_aviso:diasAviso,sustitutiva,estado:'programada',created_at:new Date().toISOString()});
            await update('trabajadores',{...w,activo:true,estado:'PREAVISO',fecha_separacion:dateNoon(evalModal.fecha),motivo_termino:'Art. 161 — Necesidades de la empresa'});
          }
          await guardarEval({row:{accion:'art161'},detalle:{fecha_separacion:evalModal.fecha,dias_aviso:diasAviso,sustitutiva}});
          cerrar();
        };
        const T=evalModal.tipo;
        const titulo={renovar:'Renovar contrato',reasignar:'Reasignar trabajadores',art161:'Iniciar Art. 161 programado',no_aplica:'Marcar “No aplica”'}[T];
        const okMain=T==='renovar'?true:T==='no_aplica'?!!(evalModal.motivo||'').trim():T==='art161'?(!!evalModal.fecha&&(evalModal.sel||[]).length>0):true;
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}} onClick={cerrar}>
            <div style={{background:'#fff',borderRadius:10,padding:22,maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:'0 0 4px',fontSize:16,color:C.text}}>{titulo}</h3>
              <p style={{fontSize:12,color:C.textMuted,marginBottom:14}}>{c.id} — {c.cliente||'(sin cliente)'} · vence {new Date(c.fecha_termino_contrato.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}</p>
              {T==='renovar'&&(<>
                <FL label="Nueva fecha de término (opcional)"><FechaInput value={evalModal.nueva} onChange={v=>setEvalModal({...evalModal,nueva:v})} style={INP}/></FL>
                <p style={{fontSize:11,color:C.textMuted,marginTop:4}}>Deja la fecha vacía para registrar la renovación <b>en gestión</b> (decisión de continuidad, aún sin fecha formal). Si ya tienes la fecha, debe ser <b>posterior</b> al término actual.</p>
                <div style={{height:8}}/>
                <FL label="Responsable"><input style={INP} value={evalModal.responsable} onChange={e=>setEvalModal({...evalModal,responsable:e.target.value})} placeholder="Quien autoriza la renovación"/></FL>
                <div style={{height:8}}/>
                <FL label="Observación"><input style={INP} value={evalModal.obs} onChange={e=>setEvalModal({...evalModal,obs:e.target.value})} placeholder="Nota interna"/></FL>
              </>)}
              {T==='reasignar'&&(<>
                <p style={{fontSize:12,color:C.textMuted,marginBottom:8}}>Elige el trabajador a mover. Se abrirá el flujo de <b>Movilidad interna</b> (mismo proceso que desde la ficha). No se desvincula a nadie.</p>
                {(evalModal.trabajadores||[]).length>0?(
                  <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:8,marginBottom:10,maxHeight:200,overflowY:'auto'}}>
                    {evalModal.trabajadores.map(t=>(
                      <div key={t.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'5px 2px',fontSize:13,borderBottom:`1px solid ${C.borderLight}`}}>
                        <span>{t.nombre} {t.rut&&<span style={{color:C.textMuted,fontSize:11}}>({t.rut})</span>}</span>
                        <button onClick={()=>doReasignarMover(t)} style={{padding:'5px 12px',borderRadius:6,border:'none',background:'#0e7490',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>Mover →</button>
                      </div>
                    ))}
                  </div>
                ):(
                  <p style={{fontSize:12,color:C.textMuted,marginBottom:10}}>Este contrato no tiene trabajadores con asignación remuneracional activa.</p>
                )}
                <FL label="Observación (opcional)"><input style={INP} value={evalModal.obs} onChange={e=>setEvalModal({...evalModal,obs:e.target.value})} placeholder="Ej: reasignar a CT002 desde el 01-08"/></FL>
              </>)}
              {T==='art161'&&(<>
                <p style={{fontSize:12,color:C.textMuted,marginBottom:8}}>Selecciona los trabajadores a programar. Cada uno quedará en <b>PREAVISO</b> (no se desvincula). La carta de aviso se emite luego desde la ficha de cada trabajador.</p>
                <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:8,marginBottom:10,maxHeight:160,overflowY:'auto'}}>
                  {evalModal.trabajadores.map(t=>{const on=(evalModal.sel||[]).includes(t.id);const yaPre=preavisoActivo(t.id,data);return(
                    <label key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 2px',fontSize:13,cursor:yaPre?'not-allowed':'pointer',opacity:yaPre?0.55:1}}>
                      <input type="checkbox" disabled={yaPre} checked={on&&!yaPre} onChange={()=>{const s=new Set(evalModal.sel||[]); on?s.delete(t.id):s.add(t.id); setEvalModal({...evalModal,sel:[...s]});}}/>
                      {t.nombre} {t.rut&&<span style={{color:C.textMuted,fontSize:11}}>({t.rut})</span>}
                      {yaPre&&<span style={{color:'#1e40af',fontSize:11}}>· ya en preaviso</span>}
                    </label>
                  );})}
                </div>
                <FL label="Fecha de separación (futura)"><FechaInput value={evalModal.fecha} onChange={v=>setEvalModal({...evalModal,fecha:v})} style={INP}/></FL>
                {evalModal.fecha&&(()=>{const d=Math.round((new Date(evalModal.fecha+'T12:00:00')-new Date(hoy+'T12:00:00'))/86400000);return <p style={{fontSize:11,color:d<30?'#b45309':'#166534',marginTop:6}}>{d} días de aviso · {d<30?'con indemnización sustitutiva':'sin sustitutiva (≥30 días)'}</p>;})()}
                <div style={{height:8}}/>
                <FL label="Responsable"><input style={INP} value={evalModal.responsable} onChange={e=>setEvalModal({...evalModal,responsable:e.target.value})}/></FL>
              </>)}
              {T==='no_aplica'&&(<>
                <FL label="Motivo (obligatorio)"><input style={INP} value={evalModal.motivo} onChange={e=>setEvalModal({...evalModal,motivo:e.target.value})} placeholder="Ej: se renovará por acuerdo / no afecta dotación"/></FL>
                <div style={{height:8}}/>
                <FL label="Responsable"><input style={INP} value={evalModal.responsable} onChange={e=>setEvalModal({...evalModal,responsable:e.target.value})}/></FL>
              </>)}
              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}>
                <button onClick={cerrar} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>Cancelar</button>
                <button onClick={T==='renovar'?doRenovar:T==='reasignar'?doReasignar:T==='art161'?doArt161:doNoAplica} disabled={!okMain}
                  style={{padding:'8px 18px',borderRadius:6,border:'none',background:okMain?C.accent:'#e5e7eb',color:okMain?'#fff':C.textMuted,cursor:okMain?'pointer':'not-allowed',fontSize:13,fontWeight:700}}>
                  {T==='renovar'?'Renovar y registrar':T==='reasignar'?'Registrar y ir a Trabajadores':T==='art161'?'Programar preaviso(s)':'Registrar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Centros de Costo (Contratos) ──────────────────────────── */
const ESTADOS_CT=["Vigente","Postulación","Renovación","Inactivo"];
const TIPO_CENTRO_TAG={
  'LICITACION_PUBLICA': {bg:'#eff6ff',text:'#1d4ed8',border:'#bfdbfe',label:'Licitación pública'},
  'LICITACION_PRIVADA': {bg:'#ecfeff',text:'#0e7490',border:'#a5f3fc',label:'Licitación privada'},
  'PRIVADO_PERMANENTE': {bg:'#f0fdf4',text:'#15803d',border:'#bbf7d0',label:'Contrato privado'},
  'EVENTUAL':   {bg:'#fef9c3',text:'#b45309',border:'#fde68a',label:'Servicio eventual'},
  'CORPORATIVO':{bg:'#f5f3ff',text:'#7c3aed',border:'#ddd6fe',label:'Corporativo'},
  'LICITACION': {bg:'#eff6ff',text:'#1d4ed8',border:'#bfdbfe',label:'Licitación (legado)'},
};
// Umbral de alerta por tipo de contrato (Capa B). alertaTermino=false => no alerta de termino (solo revision).
function defaultUmbralTipo(t){
  switch(t){
    case 'LICITACION_PUBLICA': case 'LICITACION': return 33;
    case 'LICITACION_PRIVADA': return 45;
    case 'EVENTUAL':           return 15;
    case 'CORPORATIVO':        return 60;
    case 'PRIVADO_PERMANENTE': return 0;
    default:                   return 33;
  }
}
function umbralAlertaContrato(c){
  const t=c?.tipo_centro_costo||'LICITACION';
  const d=Number(c?.dias_alerta)||0;
  if(t==='PRIVADO_PERMANENTE') return {diasAlerta:0, alertaTermino:false, manual:false, defaultTipo:0};
  return {diasAlerta: d||defaultUmbralTipo(t), alertaTermino:true, manual:d>0, defaultTipo:defaultUmbralTipo(t)};
}
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
  const openNew=()=>setForm({id:genId("CT"),cliente:"",instalacion:"",direccion:"",supervisor_id:data.trabajadores.find(t=>t.cargo==="Supervisor"||t.cargo==="Supervisora")?.id||"",estado:"Vigente",activo:true,tipo_centro_costo:"LICITACION_PUBLICA",estado_financiero:"financiado"});
  const save=async()=>{if(!form.cliente.trim())return;const ok=isNew?await insert("contratos",form):await update("contratos",form);if(ok)setForm(null);};
  const esLic=c=>['LICITACION','LICITACION_PUBLICA','LICITACION_PRIVADA'].includes(c.tipo_centro_costo||'LICITACION');
  const nLic=data.contratos.filter(esLic).length;
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
          <FL label="Tipo de centro"><select style={INP} value={form.tipo_centro_costo||"LICITACION_PUBLICA"} onChange={e=>setForm({...form,tipo_centro_costo:e.target.value})}><option value="LICITACION_PUBLICA">Licitación pública (alerta 33 días)</option><option value="LICITACION_PRIVADA">Licitación privada (configurable)</option><option value="PRIVADO_PERMANENTE">Contrato privado permanente (sin alerta de término)</option><option value="EVENTUAL">Servicio eventual (alerta 15 días)</option><option value="CORPORATIVO">Corporativo (configurable)</option><option value="LICITACION">Licitación (legado)</option></select></FL>
          <FL label="Estado"><select style={INP} value={form.estado} onChange={e=>setForm({...form,estado:e.target.value,activo:["Vigente","Renovación"].includes(e.target.value)})}>{ESTADOS_CT.map(s=><option key={s}>{s}</option>)}</select></FL>
          <FL label="Financiamiento"><select style={INP} value={form.estado_financiero||"financiado"} onChange={e=>setForm({...form,estado_financiero:e.target.value})}><option value="financiado">🟢 Financiado</option><option value="parcial">🟡 Parcial</option><option value="sin_financiamiento">🔴 Sin financiamiento</option><option value="en_riesgo">🟠 En riesgo</option><option value="cerrado">⚫ Cerrado</option></select></FL>
          <FL label="Fecha inicio licitación"><FechaInput value={form.fecha_inicio_contrato||""} onChange={v=>setForm({...form,fecha_inicio_contrato:v})} style={INP}/></FL>
          <FL label="Fecha término licitación"><FechaInput value={form.fecha_termino_contrato||""} onChange={v=>setForm({...form,fecha_termino_contrato:v})} style={INP}/></FL>
          <FL label="Probabilidad renovación"><select style={INP} value={form.probabilidad_renovacion||"media"} onChange={e=>setForm({...form,probabilidad_renovacion:e.target.value})}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option><option value="descartada">Descartada</option></select></FL>
          <FL label="Estado renovación"><select style={INP} value={form.estado_renovacion||"pendiente"} onChange={e=>setForm({...form,estado_renovacion:e.target.value})}><option value="vigente">Vigente</option><option value="en evaluacion">En evaluación</option><option value="pendiente">Pendiente</option><option value="adjudicada otra">Adjudicada otra empresa</option><option value="renovada">Renovada</option><option value="cerrada">Cerrada</option></select></FL>
          <FL label="Días de alerta (aviso anticipado)"><input type="number" min={30} max={180} style={INP} value={form.dias_alerta||60} onChange={e=>setForm({...form,dias_alerta:Number(e.target.value)})}/></FL>
          <FL label="Supervisor"><select style={INP} value={form.supervisor_id||""} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Sin asignar —</option>{data.trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></FL>
          <FL label="ID Licitación"><input style={INP} value={form.licitacion_id||""} onChange={e=>setForm({...form,licitacion_id:e.target.value})} placeholder="Ej: 892200-1-LE26"/></FL>
          <FL label="Ingreso / valor referencial del contrato ($)"><input type="number" min={0} style={INP} value={form.valor_referencial_contrato??""} onChange={e=>setForm({...form,valor_referencial_contrato:e.target.value===""?null:Number(e.target.value)})} placeholder="Ej: 900000"/></FL>
          <FL label="Periodicidad del valor"><select style={INP} value={form.periodicidad_valor||""} onChange={e=>setForm({...form,periodicidad_valor:e.target.value||null})}><option value="">— Seleccionar —</option><option value="mensual">Mensual</option><option value="unico">Único</option><option value="por_evento">Por evento</option><option value="orden_servicio">Por orden de servicio</option><option value="estado_pago">Por estado de pago</option></select></FL>
          <FL label="Documento fuente (opcional)"><select style={INP} value={form.tipo_documento_fuente||""} onChange={e=>setForm({...form,tipo_documento_fuente:e.target.value||null})}><option value="">— Seleccionar —</option><option value="oc_publica">Orden de compra (Mercado Público)</option><option value="oc_privada">Orden de compra privada</option><option value="contrato">Contrato</option><option value="cotizacion">Cotización aceptada</option><option value="orden_servicio">Orden de servicio</option><option value="estado_pago">Estado de pago</option><option value="otro">Otro</option></select></FL>
          <div style={{gridColumn:"1 / -1",fontSize:11,color:C.textMuted,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px"}}>Este valor pertenece al contrato o centro de costo, no a un trabajador específico. No representa factura emitida, caja recibida ni margen real.</div>
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
              const u=umbralAlertaContrato(r);
              const a=u.alertaTermino?calcAlertaLicitacion(r.fecha_termino_contrato, u.diasAlerta):null;
              const fechaDisplay=new Date(r.fecha_termino_contrato.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL');
              if(!r.activo||r.estado==='Inactivo'){
                return(
                  <div style={{fontSize:11}}>
                    <span style={{color:C.textMuted}}>{fechaDisplay}</span>
                    <br/><span style={{color:'#6d28d9',fontWeight:600}}>⚫ Vencida</span>
                  </div>
                );
              }
              if(!a){
                return(
                  <div style={{fontSize:11}}>
                    <span style={{color:C.textMuted}}>{fechaDisplay}</span>
                    <br/><span style={{color:C.textMuted,fontWeight:600}}>♾️ Permanente</span>
                  </div>
                );
              }
              const COL={vencida:'#7c3aed',roja:'#dc2626',naranja:'#c2410c',amarilla:'#b45309',normal:'#15803d'};
              const ICO={vencida:'⚫',roja:'🚨',naranja:'🟠',amarilla:'⚠️',normal:'✅'};
              const col=COL[a.nivel]; const ico=ICO[a.nivel];
              return(
                <div style={{fontSize:11}}>
                  <span style={{color:C.textMuted}}>{fechaDisplay}</span>
                  <br/><span style={{color:col,fontWeight:600}}>{ico} {a.diasCal<=0?'Vencida':`${a.diasHab} d. háb.`}</span>
                  <br/><span style={{color:C.textMuted,fontSize:9}}>Umbral {u.diasAlerta}d {u.manual?`· manual (default ${u.defaultTipo}d)`:`· default tipo`}</span>
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
/* ─── Fase 8C — Gestión de Anexos ───────────────────────────── */
const TIPOS_ANEXO = [
  {val:'reduccion_jornada',      label:'Reducción de jornada'},
  {val:'aumento_jornada',        label:'Aumento de jornada'},
  {val:'reduccion_remuneracion', label:'Reducción de remuneración'},
  {val:'aumento_remuneracion',   label:'Aumento de remuneración'},
  {val:'cambio_horario',         label:'Cambio de horario'},
  {val:'cambio_centro',          label:'Cambio de centro de costo'},
  {val:'cambio_multiple',        label:'Cambio múltiple'},
];
const ESTADOS_ANEXO = [
  {val:'borrador',        label:'📝 Borrador'},
  {val:'pendiente_firma', label:'✏️ Pendiente firma'},
  {val:'firmado',         label:'✅ Firmado'},
  {val:'aplicado',        label:'⚡ Aplicado'},
  {val:'anulado',         label:'❌ Anulado'},
];

function genAnexoId(trabajadorId){
  const ts=Date.now().toString(36).toUpperCase();
  return `ANX-${(trabajadorId||'TR').slice(-4)}-${ts}`;
}

function TabAnexos({trabajador, data, insert, update, saveAsignacion, setFormTrabajador, prefill, clearPrefill}){
  const blankAnexo=(pf={})=>({
    id:genAnexoId(trabajador.id), trabajador_id:trabajador.id, tipo_anexo:'',
    fecha_firma:'', fecha_vigencia:'', motivo:'',
    sueldo_anterior:trabajador.sueldo_base||0, sueldo_nuevo:trabajador.sueldo_base||0,
    jornada_anterior:trabajador.jornada||'', jornada_nueva:'',
    horario_anterior:'', horario_nuevo:'', centro_anterior:'', centro_nuevo:'',
    porcentaje_anterior:0, porcentaje_nuevo:0,
    documento_url:'', estado:'borrador', observaciones:'', ...pf,
  });
  const [form,setForm]=useState(()=> prefill ? blankAnexo(prefill) : null);
  const anexos=(data.anexos_contrato||[]).filter(a=>a.trabajador_id===trabajador.id)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const openNew=()=>setForm(blankAnexo());

  // Pre-llenado desde el Retiro de asignación (por si la pestaña ya estaba montada). Abre el form y limpia el prefill.
  useEffect(()=>{
    if(prefill){ setForm(blankAnexo(prefill)); clearPrefill&&clearPrefill(); }
  },[prefill]); // eslint-disable-line

  const save=async()=>{
    const rec={...form,
      fecha_firma:form.fecha_firma?dateNoon(form.fecha_firma):null,
      fecha_vigencia:form.fecha_vigencia?dateNoon(form.fecha_vigencia):null,
    };
    const isEdit=anexos.find(a=>a.id===form.id);
    const ok=await(isEdit?update('anexos_contrato',rec):insert('anexos_contrato',rec));
    if(ok) setForm(null);
  };

  const [confirmAplicar,setConfirmAplicar]=useState(null); // anexo a confirmar

  const aplicarAnexo=async(anexo)=>{
    if(anexo.estado!=='firmado') return;
    setConfirmAplicar(anexo);
  };

  const ejecutarAplicacion=async()=>{
    const anexo=confirmAplicar;
    if(!anexo) return;
    setConfirmAplicar(null);
    // 1. Actualizar datos del trabajador
    const cambiosTrab={};
    if(anexo.sueldo_nuevo!=null && anexo.sueldo_nuevo!==anexo.sueldo_anterior)
      cambiosTrab.sueldo_base=anexo.sueldo_nuevo;
    // J1.1: la jornada NO se modifica por anexo legacy bajo ninguna circunstancia (esté o no estructurado).
    //       Cierra la doble puerta y espera al anexo estructurado de J1.2. Otros campos (sueldo, centro) sí proceden.
    if(anexo.jornada_nueva || anexo.horario_nuevo){
      alert("En esta versión (J1.1) la jornada no puede modificarse por anexo. Los cambios de jornada se realizarán mediante anexo estructurado (J1.2). El resto del anexo no incluye jornada/horario.");
      return;
    }
    // J1.1 captura SOLO el contrato laboral original. El anexo estructurado (poblar
    // anexos_contrato.clausulas con su efecto y vigencia) es J1.2 — fuera de esta entrega.
    // jornada/horario por anexo legacy ya quedó bloqueado arriba; aquí se limpia el payload
    // para no arrastrar columnas legacy (jornada/horario/jornada_pactada) del spread {...trabajador}.
    if(Object.keys(cambiosTrab).length>0)
      await update('trabajadores',limpiarPayloadTrabajador({...trabajador,...cambiosTrab}));
    // 2. Actualizar asignación si hay cambio de porcentaje/sueldo en un centro
    if(saveAsignacion && anexo.centro_nuevo && anexo.porcentaje_nuevo>0){
      const asigExistente=(data.asignaciones||[]).find(
        a=>a.trabajador_id===trabajador.id && a.contrato_id===anexo.centro_nuevo && a.estado_asig==='activa'
      );
      if(asigExistente){
        await saveAsignacion({
          ...asigExistente,
          porcentaje_costo: anexo.porcentaje_nuevo,
          sueldo_asignado: anexo.sueldo_nuevo>0 ? anexo.sueldo_nuevo : asigExistente.sueldo_asignado,
        });
      }
    }
    // 3. Marcar anexo como aplicado (bloqueado)
    await update('anexos_contrato',{...anexo,estado:'aplicado'});
    // 4. Refrescar form del trabajador con nuevos datos
    if(setFormTrabajador && Object.keys(cambiosTrab).length>0)
      setFormTrabajador(prev=>({...prev,...cambiosTrab}));
    setForm(null);
  };

  const tipoLabel=t=>TIPOS_ANEXO.find(x=>x.val===t)?.label||t;
  const estadoLabel=e=>ESTADOS_ANEXO.find(x=>x.val===e)?.label||e;
  const estadoColor={borrador:C.textMuted,pendiente_firma:'#b45309',firmado:C.green,aplicado:'#1d4ed8',anulado:'#dc2626'};

  const showSueldo=['reduccion_remuneracion','aumento_remuneracion','cambio_multiple'].includes(form?.tipo_anexo);
  const showJornada=['reduccion_jornada','aumento_jornada','cambio_horario','cambio_multiple'].includes(form?.tipo_anexo);
  const showCentro=['cambio_centro','cambio_multiple'].includes(form?.tipo_anexo);

  return(
    <div style={{marginBottom:12}}>
      {/* Modal confirmación fuerte para aplicar anexo */}
      {confirmAplicar&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:420,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <p style={{fontWeight:700,fontSize:15,color:'#991b1b',marginBottom:8}}>⚡ Aplicar anexo</p>
            <p style={{fontSize:12,color:C.text,marginBottom:12}}>
              Se aplicarán los siguientes cambios a <b>{trabajador.nombre}</b>:
            </p>
            <div style={{background:'#f8fafc',borderRadius:6,padding:10,marginBottom:12,fontSize:11,color:C.text}}>
              <p><b>Tipo:</b> {TIPOS_ANEXO.find(t=>t.val===confirmAplicar.tipo_anexo)?.label}</p>
              {confirmAplicar.sueldo_nuevo!==confirmAplicar.sueldo_anterior&&<p><b>Sueldo:</b> {clp(confirmAplicar.sueldo_anterior)} → {clp(confirmAplicar.sueldo_nuevo)}</p>}
              {confirmAplicar.jornada_nueva&&<p><b>Jornada:</b> {confirmAplicar.jornada_anterior} → {confirmAplicar.jornada_nueva}</p>}
              {confirmAplicar.horario_nuevo&&<p><b>Horario:</b> {confirmAplicar.horario_anterior} → {confirmAplicar.horario_nuevo}</p>}
              {confirmAplicar.centro_nuevo&&confirmAplicar.porcentaje_nuevo>0&&<p><b>Asignación {confirmAplicar.centro_nuevo}:</b> {confirmAplicar.porcentaje_anterior}% → {confirmAplicar.porcentaje_nuevo}%</p>}
              <p style={{marginTop:6,color:C.green}}>✓ El anexo quedará bloqueado como Aplicado</p>
            </div>
            <p style={{fontSize:11,color:'#dc2626',marginBottom:14}}>Esta acción no se puede deshacer.</p>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setConfirmAplicar(null)} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>Cancelar</button>
              <button onClick={ejecutarAplicacion} style={{padding:'8px 18px',borderRadius:6,border:'none',background:'#1d4ed8',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>⚡ Confirmar aplicación</button>
            </div>
          </div>
        </div>
      )}
      {/* Aviso regla crítica */}
      <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:7,padding:'8px 12px',fontSize:11,color:'#92400e',marginBottom:12,display:'flex',gap:8,alignItems:'flex-start'}}>
        <span>⚠️</span>
        <span><b>Regla 8C:</b> Crear un anexo NO modifica sueldo, jornada ni asignaciones. Los datos laborales solo se actualizan cuando el anexo pasa a estado <b>Aplicado</b>.</span>
      </div>

      {/* Formulario nuevo/edición */}
      {form&&(
        <div style={{background:'#f8fafc',border:`1px solid ${C.accent}`,borderRadius:8,padding:16,marginBottom:16}}>
          <p style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:12}}>
            {anexos.find(a=>a.id===form.id)?'Editar anexo':'Nuevo anexo de contrato'}
          </p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <FL label="Tipo de anexo">
              <select style={INP} value={form.tipo_anexo} onChange={e=>setForm({...form,tipo_anexo:e.target.value})}>
                <option value="">— Seleccionar —</option>
                {TIPOS_ANEXO.map(t=><option key={t.val} value={t.val}>{t.label}</option>)}
              </select>
            </FL>
            <FL label="Estado">
              <select style={INP} value={form.estado} onChange={e=>setForm({...form,estado:e.target.value})}>
                {ESTADOS_ANEXO.map(e=><option key={e.val} value={e.val}>{e.label}</option>)}
              </select>
            </FL>
            <FL label="Fecha firma"><input type="date" style={INP} value={form.fecha_firma?.split('T')[0]||''} onChange={e=>setForm({...form,fecha_firma:e.target.value})}/></FL>
            <FL label="Fecha vigencia *"><input type="date" style={INP} value={form.fecha_vigencia?.split('T')[0]||''} onChange={e=>setForm({...form,fecha_vigencia:e.target.value})}/></FL>
            <FL label="Motivo / observación" style={{gridColumn:'1/-1'}}>
              <input style={INP} value={form.motivo||''} onChange={e=>setForm({...form,motivo:e.target.value})} placeholder="Ej: Reducción acordada por cierre CT007"/>
            </FL>
          </div>

          {showSueldo&&(
            <div style={{background:'#fff',border:`1px solid ${C.borderLight}`,borderRadius:6,padding:10,marginBottom:10}}>
              <p style={{fontSize:11,fontWeight:600,color:C.textMuted,marginBottom:8}}>💰 Cambio remuneración</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <FL label="Sueldo anterior ($)"><input type="number" style={{...INP,background:'#f9fafb',cursor:'not-allowed'}} value={form.sueldo_anterior} readOnly/></FL>
                <FL label="Sueldo nuevo ($)"><input type="number" style={INP} value={form.sueldo_nuevo} onChange={e=>setForm({...form,sueldo_nuevo:Number(e.target.value)})}/></FL>
              </div>
              {form.sueldo_nuevo!==form.sueldo_anterior&&(
                <p style={{fontSize:11,color:form.sueldo_nuevo<form.sueldo_anterior?'#dc2626':C.green,marginTop:4}}>
                  {form.sueldo_nuevo<form.sueldo_anterior?'↓':'↑'} Diferencia: {clp(Math.abs(form.sueldo_nuevo-form.sueldo_anterior))}
                </p>
              )}
            </div>
          )}

          {showJornada&&(
            <div style={{background:'#fff',border:`1px solid ${C.borderLight}`,borderRadius:6,padding:10,marginBottom:10}}>
              <p style={{fontSize:11,fontWeight:600,color:C.textMuted,marginBottom:8}}>🕐 Cambio jornada / horario</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <FL label="Jornada anterior"><input style={{...INP,background:'#f9fafb'}} value={form.jornada_anterior||''} readOnly/></FL>
                <FL label="Jornada nueva"><input style={INP} value={form.jornada_nueva||''} onChange={e=>setForm({...form,jornada_nueva:e.target.value})} placeholder="Ej: Lun-Vie 08:00-13:00"/></FL>
                <FL label="Horario anterior"><input style={{...INP,background:'#f9fafb'}} value={form.horario_anterior||''} readOnly/></FL>
                <FL label="Horario nuevo"><input style={INP} value={form.horario_nuevo||''} onChange={e=>setForm({...form,horario_nuevo:e.target.value})}/></FL>
              </div>
            </div>
          )}

          {showCentro&&(
            <div style={{background:'#fff',border:`1px solid ${C.borderLight}`,borderRadius:6,padding:10,marginBottom:10}}>
              <p style={{fontSize:11,fontWeight:600,color:C.textMuted,marginBottom:8}}>🏢 Cambio centro de costo</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <FL label="Centro anterior">
                  <select style={INP} value={form.centro_anterior||''} onChange={e=>setForm({...form,centro_anterior:e.target.value})}>
                    <option value="">— Seleccionar —</option>
                    {(data.contratos||[]).map(c=><option key={c.id} value={c.id}>{c.id} — {c.cliente}</option>)}
                  </select>
                </FL>
                <FL label="Centro nuevo">
                  <select style={INP} value={form.centro_nuevo||''} onChange={e=>setForm({...form,centro_nuevo:e.target.value})}>
                    <option value="">— Seleccionar —</option>
                    {(data.contratos||[]).map(c=><option key={c.id} value={c.id}>{c.id} — {c.cliente}</option>)}
                  </select>
                </FL>
                <FL label="% anterior"><input type="number" style={INP} value={form.porcentaje_anterior||0} onChange={e=>setForm({...form,porcentaje_anterior:Number(e.target.value)})}/></FL>
                <FL label="% nuevo"><input type="number" style={INP} value={form.porcentaje_nuevo||0} onChange={e=>setForm({...form,porcentaje_nuevo:Number(e.target.value)})}/></FL>
              </div>
            </div>
          )}

          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
            <button onClick={()=>setForm(null)} style={{padding:'7px 14px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>Cancelar</button>
            <button onClick={save} disabled={!form.tipo_anexo||!form.fecha_vigencia}
              style={{padding:'7px 16px',borderRadius:6,border:'none',background:form.tipo_anexo&&form.fecha_vigencia?C.accent:'#e5e7eb',color:form.tipo_anexo&&form.fecha_vigencia?'#fff':C.textMuted,cursor:form.tipo_anexo&&form.fecha_vigencia?'pointer':'not-allowed',fontSize:12,fontWeight:600}}>
              Guardar anexo
            </button>
          </div>
        </div>
      )}

      {/* Botón nuevo */}
      {!form&&(
        <button onClick={openNew} style={{marginBottom:12,padding:'7px 14px',borderRadius:6,border:`1px dashed ${C.accent}`,background:C.accentBg,color:C.accent,cursor:'pointer',fontSize:12,fontWeight:600}}>
          + Nuevo anexo
        </button>
      )}

      {/* Lista de anexos */}
      {anexos.length===0&&!form&&(
        <p style={{color:C.textMuted,fontSize:12,textAlign:'center',padding:20}}>Sin anexos registrados para este trabajador.</p>
      )}
      {anexos.map(a=>(
        <div key={a.id} style={{background:'#fff',border:`1px solid ${a.estado==='aplicado'?'#86efac':a.estado==='pendiente_firma'?'#fde68a':C.borderLight}`,borderRadius:8,padding:12,marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
            <div>
              <p style={{fontWeight:600,fontSize:12,color:C.text}}>{tipoLabel(a.tipo_anexo)}</p>
              <p style={{fontSize:11,color:C.textMuted,marginTop:2}}>{a.motivo||'Sin descripción'}</p>
              <p style={{fontSize:10,color:C.textMuted,marginTop:2}}>
                Vigencia: {a.fecha_vigencia?new Date(a.fecha_vigencia.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL'):'—'}
                {a.fecha_firma&&` · Firma: ${new Date(a.fecha_firma.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL')}`}
              </p>
              {a.sueldo_nuevo&&a.sueldo_nuevo!==a.sueldo_anterior&&(
                <p style={{fontSize:10,color:C.textMuted,marginTop:2}}>
                  💰 {clp(a.sueldo_anterior)} → {clp(a.sueldo_nuevo)}
                </p>
              )}
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
              <span style={{fontSize:11,fontWeight:600,color:estadoColor[a.estado]||C.textMuted}}>{estadoLabel(a.estado)}</span>
              <div style={{display:'flex',gap:4}}>
                {a.estado!=='aplicado'&&a.estado!=='anulado'&&(
                  <button onClick={()=>setForm({...a,fecha_firma:a.fecha_firma?.split('T')[0]||'',fecha_vigencia:a.fecha_vigencia?.split('T')[0]||''})}
                    style={{fontSize:11,color:C.accent,background:'none',border:`1px solid ${C.border}`,borderRadius:4,padding:'2px 8px',cursor:'pointer'}}>
                    Editar
                  </button>
                )}
                {a.estado==='firmado'&&(
                  <button onClick={()=>aplicarAnexo(a)}
                    style={{fontSize:11,color:'#fff',background:'#1d4ed8',border:'none',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontWeight:600}}>
                    ⚡ Aplicar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Fase 8B — Cálculo Finiquito ───────────────────────────── */
function calcularFiniquitoPreview(trabajador, asignaciones, fechaSep, motivo, cartaAviso, feriadosDB=[]) {
  const feriadosSet = buildFeriadosSet(feriadosDB);
  const hoy = new Date(); hoy.setHours(12,0,0,0);
  const fechaIngreso = trabajador.fecha_inicio ? new Date(trabajador.fecha_inicio.split('T')[0]+'T12:00:00') : null;
  const fechaTerm = new Date(fechaSep+'T12:00:00');
  if(!fechaIngreso) return null;

  const diasTotales = Math.round((fechaTerm - fechaIngreso)/(1000*60*60*24));
  const mesesServicio = diasTotales / 30.44;
  const sueldoBase = trabajador.sueldo_base || 0;
  const sueldoDiario = Math.round(sueldoBase / 30);

  // Vacaciones proporcionales: 1.25 días hábiles por mes (sin redondear hasta el monto final)
  const diasVacPropDecimal = mesesServicio * 1.25;        // ej: 7 meses → 8.75 días
  const diasVacProp = Math.round(diasVacPropDecimal * 10) / 10; // 1 decimal para mostrar
  const vacacionesProp = Math.round(diasVacPropDecimal * sueldoDiario); // monto con precisión

  // Aviso previo sustitutivo: solo Art.161 sin carta de aviso
  const avisoPrevio = (motivo==='art161' && !cartaAviso) ? sueldoBase : 0;

  // Indemnización: Art.161, mínimo 1 año completo
  let indemnizacion = 0;
  if (motivo==='art161') {
    const anosCompletos = Math.floor(mesesServicio / 12);
    const mesesResto = mesesServicio % 12;
    if (anosCompletos >= 1) {
      const periodos = anosCompletos + (mesesResto > 6 ? 1 : 0);
      indemnizacion = Math.min(periodos, 11) * sueldoBase;
    }
  }

  const totalBruto = vacacionesProp + avisoPrevio + indemnizacion;

  // Fechas finiquito
  const af = calcAlertaFiniquito(fechaSep, feriadosSet);

  // Referencia financiera: suma asignaciones remuneracionales activas
  const asigActivas = (asignaciones||[]).filter(a =>
    a.trabajador_id === trabajador.id &&
    a.afecta_remuneracion !== false &&
    a.estado_asig === 'activa'
  );
  const refFinanciera = asigActivas.reduce((s,a) => s+Math.round((trabajador.sueldo_base||0)*(Number(a.porcentaje_costo)||0)/100), 0);

  return { diasTotales, mesesServicio:Math.round(mesesServicio*10)/10,
    sueldoBase, sueldoDiario, diasVacProp, vacacionesProp,
    avisoPrevio, indemnizacion, totalBruto, af, refFinanciera };
}

/* ─── Modal Desvinculación Guiada ───────────────────────────── */
function DesvinculacionModal({trabajador, data, update, insert, terminarAsignacion, onClose}) {
  const [paso, setPaso] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [fechaSep, setFechaSep] = useState(new Date().toISOString().slice(0,10));
  const [cartaAviso, setCartaAviso] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [avisoMultiOk, setAvisoMultiOk] = useState(false);
  const asignacionesActivas = (data.asignaciones||[]).filter(a=>a.trabajador_id===trabajador.id && a.estado_asig==='activa' && a.activo!==false);
  const mostrarAvisoMulti = asignacionesActivas.length>1 && !avisoMultiOk;

  const feriadosDB = data.feriados_chile || [];
  const hoyStr = new Date().toISOString().slice(0,10);
  const MOTIVOS = [
    {val:'art159n4', label:'Art. 159 N°4 — Vencimiento de plazo fijo'},
    {val:'art161',   label:'Art. 161 — Necesidades de la empresa'},
    {val:'art159n1', label:'Art. 159 N°1 — Mutuo acuerdo de partes'},
    {val:'art160',   label:'Art. 160 — Falta grave (sin indemnización)'},
  ];
  const motivoLabel = MOTIVOS.find(m=>m.val===motivo)?.label || '';
  // Preaviso programado: solo Art. 161 con fecha de separación futura.
  const esProgramado = motivo==='art161' && fechaSep > hoyStr;
  const diasAviso = (()=>{ const a=new Date(hoyStr+'T12:00:00'), b=new Date(fechaSep+'T12:00:00'); return Math.round((b-a)/(1000*60*60*24)); })();
  const sustitutivaProg = esProgramado && diasAviso<30;   // <30 días de aviso => corresponde sustitutiva

  const calcularPreview = () => {
    if (!motivo || !fechaSep) return;
    if (esProgramado) { setPaso(3); return; }   // programado: no hay finiquito todavía
    const p = calcularFiniquitoPreview(trabajador, data.asignaciones, fechaSep, motivo, cartaAviso, feriadosDB);
    setPreview(p);
    setPaso(3);
  };

  // Programar preaviso (Art. 161 con fecha futura): NO desvincula. Trabajador queda en PREAVISO.
  const programar = async () => {
    setSaving(true);
    await insert('desvinculaciones_programadas', {
      id: genDesvProgId(trabajador.id),
      trabajador_id: trabajador.id,
      causal: 'art161',
      fecha_carta: hoyStr,
      fecha_separacion: dateNoon(fechaSep),
      dias_aviso: diasAviso,
      sustitutiva: sustitutivaProg,
      estado: 'programada',
      created_at: new Date().toISOString(),
    });
    await update('trabajadores', {
      ...trabajador,
      activo: true,                       // sigue activo
      estado: 'PREAVISO',
      fecha_separacion: dateNoon(fechaSep),
      motivo_termino: motivoLabel,
      // NO se toca finiquito_estado: aún no hay finiquito
    });
    setSaving(false);
    onClose(true, { _programado:true, activo:true, estado:'PREAVISO', fecha_separacion: dateNoon(fechaSep), motivo_termino: motivoLabel });
  };

  const confirmar = async () => {
    setSaving(true);
    // 1. Actualizar trabajador
    await update('trabajadores', {
      ...trabajador,
      activo: false,
      estado: 'DESVINCULADO',
      fecha_separacion: dateNoon(fechaSep),
      motivo_termino: motivoLabel,
      finiquito_estado: 'pendiente',
    });
    // 2. Terminar asignaciones activas (remuneracionales y operacionales)
    const asigActivas = (data.asignaciones||[]).filter(a =>
      a.trabajador_id === trabajador.id &&
      (a.estado_asig === 'activa' || a.activo !== false)
    );
    for (const a of asigActivas) {
      await terminarAsignacion(a, fechaSep);
    }
    setSaving(false);
    onClose(true, { activo:false, estado:'DESVINCULADO', fecha_separacion: dateNoon(fechaSep), motivo_termino: motivoLabel }); // true = refresh; payload para abrir finiquito
  };

  const OVL = {position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16};
  const BOX = {background:'#fff',borderRadius:12,padding:24,maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'};

  return(
    <div style={OVL} onClick={e=>e.target===e.currentTarget&&onClose(false)}>
      <div style={BOX}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <p style={{fontWeight:700,fontSize:15,color:'#991b1b'}}>🚨 Desvincular trabajador</p>
            <p style={{fontSize:12,color:C.textMuted}}>{trabajador.nombre} · {trabajador.rut}</p>
          </div>
          <div style={{fontSize:11,color:C.textMuted,background:C.surfaceAlt,borderRadius:20,padding:'3px 12px'}}>
            Paso {paso} de 4
          </div>
        </div>

        {/* Indicador de pasos */}
        {!mostrarAvisoMulti && (
        <div style={{display:'flex',gap:4,marginBottom:20}}>
          {[1,2,3,4].map(n=>(
            <div key={n} style={{flex:1,height:4,borderRadius:2,background:n<=paso?'#dc2626':C.borderLight}}/>
          ))}
        </div>
        )}

        {/* PASO 0: advertencia obligatoria si hay multiples asignaciones activas */}
        {mostrarAvisoMulti && (
          <div>
            <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
              <p style={{fontWeight:700,fontSize:13,color:'#991b1b',marginBottom:8}}>⚠ Esta desvinculación terminará TODAS las asignaciones activas del trabajador.</p>
              <div style={{marginBottom:8}}>
                {asignacionesActivas.map(a=>{ const c=(data.contratos||[]).find(x=>x.id===a.contrato_id); return (
                  <div key={a.id} style={{fontSize:12,color:'#7f1d1d',padding:'2px 0'}}>• {a.contrato_id}{c&&c.cliente?` — ${c.cliente}`:''}</div>
                ); })}
              </div>
              <p style={{fontSize:11.5,color:'#92400e',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:6,padding:'8px 10px',margin:0}}>
                Si solo deseas <b>terminar una asignación</b> sin desvincular al trabajador, usa <b>Asignaciones → Terminar</b> (ahí se genera el anexo si corresponde).
              </p>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>onClose(false,{_irAsignaciones:true})} style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12,fontWeight:600,color:C.text}}>← Ir a Asignaciones</button>
              <button onClick={()=>setAvisoMultiOk(true)} style={{padding:'9px 16px',borderRadius:6,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>Continuar con desvinculación completa</button>
            </div>
          </div>
        )}

        {/* PASO 1: Motivo */}
        {!mostrarAvisoMulti && paso===1&&(
          <div>
            <p style={{fontWeight:600,fontSize:13,color:C.text,marginBottom:12}}>Motivo de término</p>
            {MOTIVOS.map(m=>(
              <div key={m.val} onClick={()=>setMotivo(m.val)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,border:`2px solid ${motivo===m.val?'#dc2626':C.border}`,background:motivo===m.val?'#fef2f2':'transparent',cursor:'pointer',marginBottom:8}}>
                <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${motivo===m.val?'#dc2626':C.border}`,background:motivo===m.val?'#dc2626':'transparent',flexShrink:0}}/>
                <span style={{fontSize:12,color:motivo===m.val?'#991b1b':C.text,fontWeight:motivo===m.val?600:400}}>{m.label}</span>
              </div>
            ))}
            {motivo==='art161'&&(
              <div style={{background:'#fef9c3',border:'1px solid #fde68a',borderRadius:6,padding:'8px 12px',fontSize:11,color:'#92400e',marginTop:8}}>
                ⚠️ Art. 161 requiere carta de aviso con 30 días de anticipación o pago sustitutivo.
              </div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
              <button onClick={()=>onClose(false)} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>Cancelar</button>
              <button onClick={()=>motivo&&setPaso(2)} disabled={!motivo}
                style={{padding:'8px 16px',borderRadius:6,border:'none',background:motivo?'#dc2626':'#e5e7eb',color:motivo?'#fff':C.textMuted,cursor:motivo?'pointer':'not-allowed',fontSize:12,fontWeight:600}}>
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* PASO 2: Fecha y carta */}
        {paso===2&&(
          <div>
            <p style={{fontWeight:600,fontSize:13,color:C.text,marginBottom:12}}>Fecha y condiciones</p>
            <FL label="Fecha de separación laboral">
              <FechaInput value={fechaSep} onChange={v=>setFechaSep(v)} style={INP}
                max={motivo==='art161'?undefined:hoyStr}/>
            </FL>
            {motivo==='art161'&&fechaSep>hoyStr&&(
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 12px',marginTop:8,fontSize:12,color:'#1e40af'}}>
                📅 <b>Desvinculación PROGRAMADA</b> — faltan <b>{diasAviso} día(s)</b> para la separación ({new Date(fechaSep+'T12:00:00').toLocaleDateString('es-CL')}).<br/>
                {diasAviso>=30
                  ? <span>Aviso con 30+ días → <b>no corresponde</b> indemnización sustitutiva.</span>
                  : <span style={{color:'#991b1b'}}>⚠ Menos de 30 días de aviso → <b>se calculará indemnización sustitutiva</b> (1 mes de sueldo).</span>}
                <br/><span style={{color:C.textMuted}}>El trabajador seguirá <b>activo</b> y en su asignación hasta esa fecha. No se genera finiquito todavía.</span>
              </div>
            )}
            {motivo==='art161'&&fechaSep<=hoyStr&&(
              <div onClick={()=>setCartaAviso(v=>!v)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,border:`1px solid ${cartaAviso?C.green:C.border}`,background:cartaAviso?C.greenBg:'transparent',cursor:'pointer',marginTop:8}}>
                <input type="checkbox" checked={cartaAviso} onChange={()=>{}} style={{accentColor:C.green,width:16,height:16}}/>
                <span style={{fontSize:12,color:cartaAviso?C.green:C.textMuted,fontWeight:cartaAviso?600:400}}>
                  ✅ Carta de aviso entregada con 30+ días de anticipación
                </span>
              </div>
            )}
            {motivo==='art161'&&fechaSep<=hoyStr&&!cartaAviso&&(
              <p style={{fontSize:11,color:'#dc2626',marginTop:6}}>
                Sin carta de aviso → se calculará indemnización sustitutiva (1 mes de sueldo adicional).
              </p>
            )}
            <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:16}}>
              <button onClick={()=>setPaso(1)} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>← Atrás</button>
              <button onClick={calcularPreview} disabled={!fechaSep}
                style={{padding:'8px 16px',borderRadius:6,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                {esProgramado?'Revisar →':'Calcular →'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3 (programado): resumen del preaviso, sin finiquito */}
        {paso===3&&esProgramado&&(
          <div>
            <p style={{fontWeight:600,fontSize:13,color:'#1e40af',marginBottom:4}}>📅 Programar desvinculación (preaviso)</p>
            <p style={{fontSize:11,color:C.textMuted,marginBottom:12}}>{trabajador.nombre} · Art. 161 — Necesidades de la empresa</p>
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:12,marginBottom:12,fontSize:12,color:'#1e40af'}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0'}}><span>Fecha de la carta de aviso</span><b>{new Date(hoyStr+'T12:00:00').toLocaleDateString('es-CL')}</b></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0'}}><span>Fecha de separación programada</span><b>{new Date(fechaSep+'T12:00:00').toLocaleDateString('es-CL')}</b></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0'}}><span>Días de aviso</span><b>{diasAviso} día(s)</b></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderTop:`1px solid #bfdbfe`,marginTop:4}}>
                <span>Indemnización sustitutiva</span>
                <b style={{color:sustitutivaProg?'#991b1b':'#166534'}}>{sustitutivaProg?'Sí (menos de 30 días)':'No corresponde (30+ días)'}</b>
              </div>
            </div>
            <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',marginBottom:12,fontSize:11,color:C.text}}>
              Durante el preaviso el trabajador sigue <b>activo</b>, en su asignación y generando remuneración. <b>No se genera finiquito</b> todavía. La finalización es <b>manual</b>: al llegar la fecha (o anticipada con confirmación) recién pasa a DESVINCULADO y se abre el finiquito.
            </div>
            <p style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Recuerda emitir la <b>Carta de Aviso (Art. 162)</b> desde la pestaña Documentos para respaldar el aviso.</p>
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
              <button onClick={()=>setPaso(2)} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>← Atrás</button>
              <button onClick={programar} disabled={saving}
                style={{padding:'8px 20px',borderRadius:6,border:'none',background:saving?'#e5e7eb':'#2563eb',color:saving?C.textMuted:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700}}>
                {saving?'Programando...':'📅 Programar preaviso'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Vista previa finiquito */}
        {paso===3&&!esProgramado&&preview&&(
          <div>
            <p style={{fontWeight:600,fontSize:13,color:C.text,marginBottom:4}}>Vista previa del finiquito</p>
            <p style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Basado en sueldo base legal: {clp(preview.sueldoBase)}</p>
            <div style={{background:'#f8fafc',borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.borderLight}`,marginBottom:6}}>
                <span style={{fontSize:12,color:C.textMuted}}>Tiempo servicio</span>
                <span style={{fontSize:12,fontWeight:600}}>{preview.mesesServicio} meses ({preview.diasTotales} días)</span>
              </div>
              {[
                {label:`Vacaciones proporcionales (${preview.diasVacProp} d.h. × ${clp(preview.sueldoDiario)})`,
                 val:preview.vacacionesProp,
                 nota: preview.vacacionesProp===0 ? 'Sin días acumulados' : null},
                {label:'Aviso previo sustitutivo (1 mes sueldo)',
                 val:preview.avisoPrevio,
                 nota: preview.avisoPrevio===0 ? (motivo==='art161'?'Carta entregada oportunamente':'No aplica a este artículo') : null},
                {label:`Indemnización años servicio`,
                 val:preview.indemnizacion,
                 nota: preview.indemnizacion===0 ? (motivo==='art161'?`No cumple 1 año (${preview.mesesServicio} meses)`:'No aplica a este artículo') : `${Math.floor(preview.mesesServicio/12)} año(s) × ${clp(preview.sueldoBase)}`},
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'5px 0',borderBottom:`1px solid ${C.borderLight}`}}>
                  <div>
                    <span style={{fontSize:12,color:C.textMuted}}>{r.label}</span>
                    {r.nota&&<p style={{fontSize:10,color:C.textMuted,marginTop:1,fontStyle:'italic'}}>{r.nota}</p>}
                  </div>
                  <span style={{fontSize:12,fontWeight:500,color:r.val>0?C.text:C.textMuted,minWidth:90,textAlign:'right'}}>{clp(r.val)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:`2px solid ${C.border}`,marginTop:4}}>
                <span style={{fontSize:13,fontWeight:700,color:C.text}}>Total bruto estimado</span>
                <span style={{fontSize:14,fontWeight:700,color:'#1d4ed8'}}>{clp(preview.totalBruto)}</span>
              </div>
            </div>
            {preview.refFinanciera>0&&(
              <p style={{fontSize:10,color:C.textMuted,background:C.surfaceAlt,borderRadius:4,padding:'4px 8px',marginBottom:8}}>
                📊 Costo imputado (derivado): sueldo base × % de imputación = {clp(preview.refFinanciera)} (solo control de costos, no es base legal)
              </p>
            )}
            <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'8px 12px',fontSize:11,color:'#991b1b',marginBottom:12}}>
              <b>Plazo finiquito:</b> Objetivo empresa {preview.af?.fmtObjetivo} · Máximo legal {preview.af?.fmtLegal}
            </div>
            <p style={{fontSize:10,color:C.textMuted,marginBottom:12}}>
              * Este cálculo es referencial. El finiquito final debe ser revisado y firmado con asesoría legal.
            </p>
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
              <button onClick={()=>setPaso(2)} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>← Atrás</button>
              <button onClick={()=>setPaso(4)}
                style={{padding:'8px 16px',borderRadius:6,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                Confirmar →
              </button>
            </div>
          </div>
        )}

        {/* PASO 4: Confirmación final */}
        {paso===4&&(
          <div>
            <p style={{fontWeight:600,fontSize:13,color:'#991b1b',marginBottom:12}}>⚠️ Confirmar desvinculación</p>
            <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:12,marginBottom:16}}>
              <p style={{fontSize:12,color:'#991b1b',marginBottom:6}}><b>Esta acción:</b></p>
              <p style={{fontSize:11,color:'#991b1b'}}>✓ Marcará a {trabajador.nombre} como DESVINCULADO</p>
              <p style={{fontSize:11,color:'#991b1b'}}>✓ Registrará fecha separación: {new Date(fechaSep+'T12:00:00').toLocaleDateString('es-CL')}</p>
              <p style={{fontSize:11,color:'#991b1b'}}>✓ Motivo: {motivoLabel}</p>
              <p style={{fontSize:11,color:'#991b1b'}}>✓ Cerrará todas las asignaciones activas con esta fecha</p>
              <p style={{fontSize:11,color:'#991b1b'}}>✓ Activará alerta de finiquito en el Dashboard</p>
              <p style={{fontSize:11,color:'#15803d',marginTop:6}}>✓ No se eliminarán datos — solo se cierran con fecha (trazabilidad completa)</p>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
              <button onClick={()=>setPaso(3)} disabled={saving} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>← Atrás</button>
              <button onClick={confirmar} disabled={saving}
                style={{padding:'8px 20px',borderRadius:6,border:'none',background:saving?'#e5e7eb':'#dc2626',color:saving?C.textMuted:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700}}>
                {saving?'Procesando...':'🚨 Confirmar desvinculación'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FASE 8D — DOCUMENTACIÓN LABORAL
   Contrato de trabajo · ODI (DS40) · Reglamento Interno · Entrega EPP
   Genera PDF imprimible (patrón window.open + print) pre-llenado.
   ═══════════════════════════════════════════════════════════════ */

const EMPRESA = {
  razon:"LEG Servicios de Limpieza y Mantención Ana Guzmán E.I.R.L",
  rut:"78.086.977-1",
  giro:"Servicios de aseo y limpieza",
  domicilio:"Arica, Región de Arica y Parinacota",
  domicilioCompleto:"Calle Baquedano N°731, oficina 707, comuna de Arica",
  ciudad:"Arica",
  repNombre:"Ana María Guzmán Loyola",
  repRut:"12.083.247-6",
  repCargo:"Representante Legal",
};
// Mapea empresa_config (getEmpresaConfig) a los campos que usan los documentos.
// getEmpresaConfig es la FUENTE; EMPRESA queda solo como respaldo si un campo viene vacio.
function empresaParaDoc(emp){
  emp = emp || {};
  return {
    razon:     emp.razon_social || EMPRESA.razon,
    rut:       emp.rut || EMPRESA.rut,
    giro:      emp.giro || EMPRESA.giro,
    domicilio: [emp.domicilio, emp.ciudad, emp.region].filter(Boolean).join(', ') || EMPRESA.domicilio,
    ciudad:    emp.ciudad_emision || emp.ciudad || EMPRESA.ciudad,
    repNombre: emp.rep_nombre || EMPRESA.repNombre,
    repRut:    emp.rep_rut || EMPRESA.repRut,
    repCargo:  emp.rep_cargo || EMPRESA.repCargo,
  };
}

// Catálogo EPP típico para empresa de aseo (editable al entregar)
const CATALOGO_EPP = [
  "Guantes de nitrilo",
  "Guantes de goma uso doméstico",
  "Mascarilla desechable",
  "Mascarilla reutilizable / respirador",
  "Antiparras / lentes de seguridad",
  "Zapatos de seguridad antideslizantes",
  "Botas de goma",
  "Pechera plástica / delantal impermeable",
  "Uniforme institucional (polera)",
  "Uniforme institucional (pantalón)",
  "Cofia / gorro",
  "Protector auditivo",
  "Faja lumbar",
  "Credencial institucional",
];

// Matriz de riesgos ODI DS40 — riesgos típicos del rubro aseo
const RIESGOS_ODI = [
  {riesgo:"Caída a mismo nivel", consec:"Esguinces, contusiones, fracturas", medidas:"Señalizar piso mojado, usar calzado antideslizante, mantener vías despejadas, secar derrames de inmediato."},
  {riesgo:"Caída a distinto nivel", consec:"Fracturas, TEC, lesiones graves", medidas:"Usar escaleras en buen estado, no subir a sillas/cajas, escalera afirmada por otra persona."},
  {riesgo:"Contacto con productos químicos (cloro, desinfectantes, detergentes)", consec:"Dermatitis, quemaduras, irritación ocular y respiratoria", medidas:"Usar guantes, antiparras y mascarilla. No mezclar productos (cloro + amoníaco). Leer hoja de seguridad. Ventilar el área."},
  {riesgo:"Sobreesfuerzo y manejo manual de carga", consec:"Lumbago, trastornos musculoesqueléticos", medidas:"Técnica correcta de levantamiento, no exceder límites Ley 21.012, uso de carros y faja lumbar."},
  {riesgo:"Exposición a agentes biológicos (baños, basura, residuos)", consec:"Infecciones, contagios", medidas:"Uso de guantes, lavado de manos, manejo correcto de residuos, vacunación al día."},
  {riesgo:"Golpes y cortes con objetos o herramientas", consec:"Heridas, contusiones", medidas:"Manipular con cuidado, descartar vidrios y cortopunzantes en contenedor rígido."},
  {riesgo:"Contacto eléctrico (enceradoras, aspiradoras)", consec:"Quemaduras, electrocución", medidas:"Revisar cables, no operar equipos con manos mojadas, desconectar antes de limpiar."},
];

function htmlDocImprimir(titulo, cuerpoHtml, empresaRazon){
  const w = window.open("","_blank");
  if(!w){alert("Habilita las ventanas emergentes para generar el documento.");return;}
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Times New Roman',Georgia,serif;font-size:12.5px;line-height:1.55;color:#1a1a1a;margin:0;padding:26mm 22mm}
    h1{font-size:16px;text-align:center;text-transform:uppercase;letter-spacing:.5px;margin:0 0 2px}
    h2{font-size:13px;margin:18px 0 6px;border-bottom:1px solid #888;padding-bottom:3px}
    .empresa{text-align:center;font-size:11px;color:#444;margin-bottom:18px}
    .empresa b{color:#1e3a8a}
    p{margin:7px 0;text-align:justify}
    .clausula{margin:9px 0}
    .clausula b{display:inline}
    table{width:100%;border-collapse:collapse;margin:10px 0;font-family:Arial,sans-serif;font-size:10.5px}
    th{background:#1e3a8a;color:#fff;padding:6px 8px;text-align:left;border:1px solid #1e3a8a}
    td{padding:6px 8px;border:1px solid #cbd5e1;vertical-align:top}
    tr:nth-child(even) td{background:#f8fafc}
    .firmas{margin-top:54px;display:flex;justify-content:space-around;gap:40px}
    .firma{flex:1;text-align:center;border-top:1px solid #000;padding-top:7px;font-size:11px}
    .nota{margin-top:22px;font-size:10px;color:#777;font-family:Arial,sans-serif;text-align:center}
    .lugar{margin-top:14px;font-size:11.5px}
    @media print{@page{size:A4;margin:16mm}body{padding:0}}
  </style></head><body>${cuerpoHtml}
  <p class="nota">Documento generado por LimpiApp Pro · ${empresaRazon||EMPRESA.razon} · ${new Date().toLocaleString("es-CL",{timeZone:"America/Santiago"})}</p>
  </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),700);
}

// Construye descripción de lugares de prestación y jornada desde asignaciones remuneracionales activas
function lugaresYJornada(trabajador, data){
  const asigs=(data.asignaciones||[]).filter(a=>
    a.trabajador_id===trabajador.id && a.estado_asig==='activa' && a.afecta_remuneracion!==false);
  const lugares=[], jornadas=[];
  asigs.forEach(a=>{
    const ct=(data.contratos||[]).find(c=>c.id===a.contrato_id);
    if(ct){
      const dir=[ct.instalacion,ct.direccion].filter(Boolean).join(", ");
      lugares.push(`${ct.cliente||ct.id}${dir?` (${dir})`:""}`);
    }
    const j=(a.jornada && String(a.jornada).trim()) ? a.jornada : (a.horario||"");
    if(j) jornadas.push(`${ct?(ct.cliente||ct.id):a.contrato_id}: ${j}${a.horas_semanales?` (${a.horas_semanales} hrs/sem)`:""}`);
  });
  // J1.1: la jornada del contrato se DERIVA de los actos a la FECHA REAL del contrato (fecha_inicio).
  //       Si no hay fecha real, NO se proyecta con hoy: se trata como no estructurada (cae a texto legacy visual).
  const _fc=dateOnly(trabajador.fecha_inicio);
  const jvC = _fc ? jornadaVigente(trabajador, _fc, data) : {estructurada:false, motivo:"sin_fecha_inicio"};
  return {
    lugares: lugares.length?lugares.join("; "):"dependencias asignadas por el empleador en la ciudad de Arica",
    jornadas: jvC.estructurada
      ? (()=>{ const g=jornadaATexto(jvC.jornada); return [[g.jornada,g.horario].filter(Boolean).join(" ")].filter(Boolean); })()
      : (jornadas.length?jornadas:["Según distribución horaria informada por el empleador, respetando el máximo legal semanal del Código del Trabajo."]),
    totalHoras: jvC.estructurada
      ? Number(jvC.jornada.horas_semanales)||0
      : asigs.reduce((s,a)=>s+Number(a.horas_semanales||0),0),
  };
}

function fechaLargaCL(iso){
  const d = iso ? new Date(`${dateOnly(iso)}T12:00:00`) : new Date();
  return d.toLocaleDateString("es-CL",{day:"numeric",month:"long",year:"numeric",timeZone:"America/Santiago"});
}

function gratificacionTexto(t){
  switch(t.metodo_gratificacion){
    case "25% MENSUAL": return "El trabajador percibirá gratificación legal conforme al Art. 50 del Código del Trabajo, equivalente al 25% de lo devengado mensualmente con tope de 4,75 ingresos mínimos mensuales anuales, pagada mes a mes.";
    case "ANTICIPO PORCENTAJE": return `El empleador anticipará mensualmente la gratificación legal en un ${t.gratificacion_porcentaje||25}% del sueldo base, conforme al Art. 50 del Código del Trabajo.`;
    case "ANTICIPO MONTO FIJO": return `El empleador anticipará mensualmente la gratificación legal por un monto fijo de ${clp(t.gratificacion_monto||0)}, conforme al Art. 50 del Código del Trabajo.`;
    default: return "La gratificación legal se liquidará y pagará anualmente conforme a los Arts. 47 y siguientes del Código del Trabajo, según las utilidades de la empresa.";
  }
}

// Funciones del cargo (cláusula PRIMERO) según el tipo de cargo (8D.5)
function funcionesPorCargo(cargo){
  const c=(cargo||"").toLowerCase();
  if(/(supervisor|gerente|jefe|jefatura|encargad|coordinad|administrativ|adminis)/.test(c)){
    return "realizando labores de supervisión, coordinación y control de los servicios de aseo y limpieza en las dependencias y clientes que el empleador le asigne, incluyendo la fiscalización del cumplimiento, la gestión del personal a su cargo y demás funciones propias de su cargo";
  }
  return "realizando labores de aseo, limpieza, sanitización y mantención de las dependencias que el empleador le asigne, así como toda otra función afín a su cargo que se le encomiende";
}

function imprimirContratoTrabajo(trabajador, data, overrides={}, emp=null){
  const E = empresaParaDoc(emp);
  const lj = lugaresYJornada(trabajador, data);
  const lugar = (overrides.lugar!=null && String(overrides.lugar).trim()) ? overrides.lugar : lj.lugares;
  const funciones = (overrides.funciones!=null && String(overrides.funciones).trim()) ? overrides.funciones : funcionesPorCargo(trabajador.cargo);
  const tipo = (trabajador.tipo_contrato||"PLAZO FIJO").toUpperCase();
  const esIndef = tipo.includes("INDEF");
  const duracion = esIndef
    ? "El presente contrato es de carácter <b>indefinido</b>."
    : (trabajador.fecha_termino_plazo
        ? `El presente contrato es de carácter <b>plazo fijo</b>, rigiendo desde la fecha de ingreso hasta el <b>${fechaLargaCL(trabajador.fecha_termino_plazo)}</b>, pudiendo transformarse en indefinido conforme al Art. 159 N°4 del Código del Trabajo.`
        : "El presente contrato es de carácter <b>plazo fijo</b>, rigiendo desde la fecha de ingreso hasta el plazo que las partes acuerden por escrito, pudiendo transformarse en indefinido conforme al Art. 159 N°4 del Código del Trabajo.");
  const jornadasHtml = lj.jornadas.map(j=>`<li>${j}</li>`).join("");
  const cuerpo = `
    <h1>Contrato Individual de Trabajo</h1>
    <div class="empresa"><b>${E.razon}</b> · RUT ${E.rut} · ${E.domicilio}</div>
    <p>En ${E.ciudad}, a ${fechaLargaCL()}, entre <b>${E.razon}</b>, RUT ${E.rut}, giro ${E.giro}, con domicilio en ${E.domicilio}, representada legalmente por doña <b>${E.repNombre}</b>, cédula de identidad N° ${E.repRut}, en adelante "el empleador"; y don(ña) <b>${trabajador.nombre||"—"}</b>, cédula de identidad N° ${trabajador.rut||"—"}${trabajador.nacionalidad?`, de nacionalidad ${trabajador.nacionalidad}`:""}${trabajador.fecha_nacimiento?`, nacido(a) el ${fechaLargaCL(trabajador.fecha_nacimiento)}`:""}${trabajador.estado_civil?`, estado civil ${trabajador.estado_civil}`:""}${(trabajador.domicilio||trabajador.ciudad||trabajador.region)?`, con domicilio en ${[trabajador.domicilio,trabajador.ciudad,trabajador.region].filter(Boolean).join(', ')}`:""}${(trabajador.afp||trabajador.salud)?`, afiliado(a) a ${trabajador.afp?`AFP ${trabajador.afp}`:""}${(trabajador.afp&&trabajador.salud)?" y ":""}${trabajador.salud||""}`:""}, en adelante "el trabajador", se ha convenido el siguiente contrato individual de trabajo:</p>

    <div class="clausula"><b>PRIMERO: Naturaleza de los servicios.</b> El trabajador se obliga a desempeñar el cargo de <b>${trabajador.cargo||"Auxiliar de Aseo"}</b>, ${funciones}.</div>

    <div class="clausula"><b>SEGUNDO: Lugar de prestación de servicios.</b> Los servicios se prestarán en: ${lugar}. El empleador podrá modificar el lugar de prestación dentro de la misma ciudad conforme al Art. 12 del Código del Trabajo.</div>

    <div class="clausula"><b>TERCERO: Jornada de trabajo.</b> La distribución de la jornada será la siguiente:
      <ul>${jornadasHtml}</ul>
      ${lj.totalHoras?`Total semanal pactado: <b>${lj.totalHoras} horas</b>. `:""}La jornada respeta el máximo legal vigente del Código del Trabajo. El trabajador tendrá derecho a colación según lo indicado en su distribución horaria, tiempo que no se considera trabajado.</div>

    <div class="clausula"><b>CUARTO: Remuneración.</b> El empleador pagará al trabajador un sueldo base mensual de <b>${clp(trabajador.sueldo_base||0)}</b> (${trabajador.sueldo_base?numeroAPalabras(trabajador.sueldo_base):"—"} pesos). La remuneración se pagará por mensualidades vencidas, dentro de los primeros 5 días hábiles del mes siguiente, mediante transferencia o el medio que las partes acuerden.</div>

    <div class="clausula"><b>QUINTO: Gratificación.</b> ${gratificacionTexto(trabajador)}</div>

    <div class="clausula"><b>SEXTO: Bonos y asignaciones.</b> ${(trabajador.bono_movilizacion||trabajador.bono_colacion||trabajador.bono_asistencia)?`El trabajador percibirá las siguientes asignaciones no constitutivas de remuneración (Art. 41 inc. 2°): movilización ${clp(trabajador.bono_movilizacion||0)}, colación ${clp(trabajador.bono_colacion||0)}${trabajador.bono_asistencia?`, y bono de asistencia ${clp(trabajador.bono_asistencia||0)}`:""}.`:"No se pactan asignaciones adicionales a la fecha de suscripción, sin perjuicio de las que el empleador otorgue voluntariamente."}</div>

    <div class="clausula"><b>SÉPTIMO: Cotizaciones previsionales.</b> El empleador deducirá y enterará las cotizaciones de previsión (AFP ${trabajador.afp||"—"}), salud (${trabajador.salud||"FONASA"} 7%) y seguro de cesantía que correspondan según la legislación vigente.${trabajador.pensionado?" Por tratarse de trabajador pensionado, queda exento de cotización de AFP, seguro de cesantía y SIS, cotizando únicamente salud.":""}</div>

    <div class="clausula"><b>OCTAVO: Duración.</b> ${duracion} La fecha de ingreso del trabajador es el <b>${fechaLargaCL(trabajador.fecha_inicio)}</b>.</div>

    <div class="clausula"><b>NOVENO: Obligaciones del trabajador.</b> El trabajador se obliga a cumplir el Reglamento Interno de Orden, Higiene y Seguridad de la empresa, a usar correctamente los elementos de protección personal (EPP) entregados, y a observar las instrucciones de prevención de riesgos informadas mediante la Obligación de Informar (ODI).</div>

    <div class="clausula"><b>DÉCIMO: Domicilio y ejemplares.</b> Para todos los efectos legales las partes fijan domicilio en la ciudad de ${E.ciudad}, sometiéndose a la competencia de sus tribunales. El presente contrato se firma en dos ejemplares de igual tenor, quedando uno en poder de cada parte, declarando el trabajador haber recibido el suyo en este acto.</div>

    <div class="firmas">
      <div class="firma">${trabajador.nombre||"—"}<br/>RUT ${trabajador.rut||"—"}<br/><b>Trabajador</b></div>
      <div class="firma">${E.repNombre}<br/>RUT ${E.repRut}<br/><b>p.p. ${E.razon}</b></div>
    </div>`;
  htmlDocImprimir(`Contrato ${trabajador.nombre||""}`, cuerpo, E.razon);
}

function imprimirODI(trabajador, data, emp=null){
  const E = empresaParaDoc(emp || _empresaCfgCache);
  const lj = lugaresYJornada(trabajador, data);
  const filas = RIESGOS_ODI.map(r=>`<tr><td><b>${r.riesgo}</b></td><td>${r.consec}</td><td>${r.medidas}</td></tr>`).join("");
  const cuerpo = `
    <h1>Obligación de Informar los Riesgos Laborales (ODI)</h1>
    <div class="empresa">D.S. N°40 de 1969, Art. 21 · Ley N°16.744 — Derecho a Saber<br/><b>${E.razon}</b> · RUT ${E.rut}</div>
    <p>En cumplimiento del Art. 21 del D.S. N°40 y de la Ley N°16.744, el empleador deja constancia de haber informado al trabajador individualizado de los riesgos que entrañan sus labores, las medidas preventivas y los métodos de trabajo correctos.</p>
    <h2>Identificación del trabajador</h2>
    <p><b>Nombre:</b> ${trabajador.nombre||"—"} &nbsp;·&nbsp; <b>RUT:</b> ${trabajador.rut||"—"} &nbsp;·&nbsp; <b>Cargo:</b> ${trabajador.cargo||"Auxiliar de Aseo"}<br/>
    <b>Lugar(es) de trabajo:</b> ${lj.lugares}</p>
    <h2>Matriz de riesgos, consecuencias y medidas preventivas</h2>
    <table><thead><tr><th style="width:28%">Riesgo</th><th style="width:27%">Posibles consecuencias</th><th>Medidas preventivas / método correcto</th></tr></thead><tbody>${filas}</tbody></table>
    <h2>Elementos de protección personal (EPP)</h2>
    <p>El trabajador se obliga a usar de forma permanente y correcta los EPP entregados por el empleador (guantes, mascarilla, calzado de seguridad y demás según la tarea), y a dar aviso inmediato ante su deterioro o pérdida. El uso de EPP es obligatorio (Art. 53 D.S. N°594).</p>
    <p style="margin-top:14px">El trabajador declara haber recibido esta información de manera clara y comprensible, comprometiéndose a respetar las instrucciones de prevención y a reportar todo accidente o condición insegura a su jefatura.</p>
    <div class="firmas">
      <div class="firma">${trabajador.nombre||"—"}<br/>RUT ${trabajador.rut||"—"}<br/><b>Trabajador — Recibí conforme</b></div>
      <div class="firma">${E.repNombre}<br/><b>p.p. ${E.razon}</b></div>
    </div>
    <p class="lugar">${E.ciudad}, ${fechaLargaCL()}.</p>`;
  htmlDocImprimir(`ODI ${trabajador.nombre||""}`, cuerpo, E.razon);
}

function imprimirActaReglamento(trabajador, data, emp=null){
  const E = empresaParaDoc(emp || _empresaCfgCache);
  const cuerpo = `
    <h1>Acta de Entrega del Reglamento Interno</h1>
    <div class="empresa">Reglamento Interno de Orden, Higiene y Seguridad — Art. 156 Código del Trabajo<br/><b>${E.razon}</b> · RUT ${E.rut}</div>
    <p>Conforme al Art. 156 del Código del Trabajo, el empleador deja constancia de haber entregado en forma gratuita al trabajador individualizado una copia del Reglamento Interno de Orden, Higiene y Seguridad vigente en la empresa.</p>
    <h2>Identificación del trabajador</h2>
    <p><b>Nombre:</b> ${trabajador.nombre||"—"} &nbsp;·&nbsp; <b>RUT:</b> ${trabajador.rut||"—"} &nbsp;·&nbsp; <b>Cargo:</b> ${trabajador.cargo||"Auxiliar de Aseo"}<br/>
    <b>Fecha de ingreso:</b> ${fechaLargaCL(trabajador.fecha_inicio)}</p>
    <p>El trabajador declara haber recibido el Reglamento Interno, haber tomado conocimiento de su contenido —en especial de las normas de orden, higiene y seguridad, del procedimiento de la Ley N°21.643 (Ley Karin) sobre acoso laboral, sexual y violencia en el trabajo— y se obliga a darle estricto cumplimiento.</p>
    <div class="firmas">
      <div class="firma">${trabajador.nombre||"—"}<br/>RUT ${trabajador.rut||"—"}<br/><b>Recibí conforme</b></div>
      <div class="firma">${E.repNombre}<br/><b>p.p. ${E.razon}</b></div>
    </div>
    <p class="lugar">${E.ciudad}, ${fechaLargaCL()}.</p>`;
  htmlDocImprimir(`Acta Reglamento ${trabajador.nombre||""}`, cuerpo, E.razon);
}

function imprimirActaEPP(trabajador, entregas, emp=null){
  const E = empresaParaDoc(emp || _empresaCfgCache);
  const orden=[...entregas].sort((a,b)=>new Date(a.fecha_entrega||0)-new Date(b.fecha_entrega||0));
  const filas = orden.length
    ? orden.map(e=>`<tr><td>${dateOnly(e.fecha_entrega)||"—"}</td><td>${e.articulo||"—"}</td><td style="text-align:center">${e.cantidad||1}</td><td style="text-align:center">${e.talla||"—"}</td><td style="text-align:center">${e.estado==='devuelto'?'Devuelto':'Entregado'}</td><td>${e.observaciones||""}</td></tr>`).join("")
    : `<tr><td colspan="6" style="text-align:center;color:#888">Sin entregas registradas</td></tr>`;
  const cuerpo = `
    <h1>Registro de Entrega de Elementos de Protección Personal</h1>
    <div class="empresa">Art. 53 D.S. N°594 · Ley N°16.744<br/><b>${E.razon}</b> · RUT ${E.rut}</div>
    <p>El empleador deja constancia de haber proporcionado gratuitamente al trabajador los elementos de protección personal (EPP) que se detallan, conforme al Art. 53 del D.S. N°594. El trabajador se obliga a usarlos correctamente y a mantenerlos en buen estado.</p>
    <h2>Identificación del trabajador</h2>
    <p><b>Nombre:</b> ${trabajador.nombre||"—"} &nbsp;·&nbsp; <b>RUT:</b> ${trabajador.rut||"—"} &nbsp;·&nbsp; <b>Cargo:</b> ${trabajador.cargo||"Auxiliar de Aseo"}</p>
    <h2>Detalle de entregas</h2>
    <table><thead><tr><th>Fecha</th><th>Artículo</th><th style="width:9%">Cant.</th><th style="width:9%">Talla</th><th style="width:13%">Estado</th><th>Observaciones</th></tr></thead><tbody>${filas}</tbody></table>
    <p style="margin-top:14px">El trabajador declara haber recibido los EPP detallados en buen estado, comprometiéndose a su uso obligatorio y permanente durante la jornada, y a su devolución al término de la relación laboral.</p>
    <div class="firmas">
      <div class="firma">${trabajador.nombre||"—"}<br/>RUT ${trabajador.rut||"—"}<br/><b>Recibí conforme</b></div>
      <div class="firma">${E.repNombre}<br/><b>p.p. ${E.razon}</b></div>
    </div>
    <p class="lugar">${E.ciudad}, ${fechaLargaCL()}.</p>`;
  htmlDocImprimir(`Acta EPP ${trabajador.nombre||""}`, cuerpo, E.razon);
}

// Mapea la etiqueta de motivo_termino guardada (8B) al código de causal para el cálculo.
function motivoCodeFromLabel(label){
  const l=(label||'').toLowerCase();
  if(l.includes('160')) return 'art160';
  if(l.includes('161')) return 'art161';
  if(l.includes('159')) return 'art159';
  if(l.includes('renuncia')) return 'renuncia';
  if(l.includes('mutuo')) return 'mutuo';
  return 'otro';
}

// Finiquito formal y completo (modelo LEG). Montos referenciales editables; resto formal listo para firma/ratificación.
function imprimirFiniquito(trabajador, data, opts={}, emp=null){
  const E = empresaParaDoc(emp || _empresaCfgCache);
  const fechaSep = opts.fechaSep || dateOnly(trabajador.fecha_separacion);
  const motivoCode = opts.motivoCode || motivoCodeFromLabel(trabajador.motivo_termino);
  const cartaAviso = !!opts.cartaAviso;
  if(!fechaSep){ alert("El trabajador no tiene fecha de separación registrada."); return; }
  const calc = calcularFiniquitoPreview(trabajador, data.asignaciones||[], fechaSep, motivoCode, cartaAviso, data.feriados_chile||[]);
  if(!calc){ alert("Falta la fecha de ingreso del trabajador para calcular el finiquito."); return; }

  const otrosMonto = Math.round(Number(opts.otrosMonto||0));
  const otrosConcepto = (opts.otrosConcepto||"").trim() || "Otros haberes";
  const descMonto = Math.round(Number(opts.descuentoMonto||0));
  const descConcepto = (opts.descuentoConcepto||"").trim() || "Descuentos";
  const totalFinal = calc.vacacionesProp + calc.avisoPrevio + calc.indemnizacion + otrosMonto - descMonto;

  // Lugar/centro donde prestó servicios (de cualquier asignación remuneracional, activa o histórica)
  let lugar="";
  for(const a of (data.asignaciones||[]).filter(a=>a.trabajador_id===trabajador.id && a.afecta_remuneracion!==false)){
    const ct=(data.contratos||[]).find(c=>c.id===a.contrato_id);
    if(ct){ lugar=[ct.cliente,ct.instalacion].filter(Boolean).join(", "); break; }
  }
  if(!lugar) lugar="las dependencias asignadas por el empleador";

  const fila=(concepto,monto,signo="")=>`<tr><td>${concepto}</td><td style="text-align:right">${signo}${clp(Math.abs(monto))}</td></tr>`;
  const filas=[
    calc.vacacionesProp?fila(`Feriado proporcional (${calc.diasVacProp} días)`, calc.vacacionesProp):"",
    calc.avisoPrevio?fila("Indemnización sustitutiva del aviso previo", calc.avisoPrevio):"",
    calc.indemnizacion?fila(`Indemnización por años de servicio (${Math.floor(calc.mesesServicio/12)} año(s))`, calc.indemnizacion):"",
    otrosMonto?fila(otrosConcepto, otrosMonto):"",
    descMonto?fila(descConcepto, descMonto, "− "):"",
  ].filter(Boolean).join("");

  const cuerpo = `
    <h1>Finiquito de Contrato de Trabajo</h1>
    <div class="empresa"><b>${E.razon}</b> · RUT ${E.rut}</div>
    <p>En ${E.ciudad}, a ${fechaLargaCL()}, entre <b>${E.razon}</b>, RUT ${E.rut}, representada legalmente por doña <b>${E.repNombre}</b>, cédula de identidad N° ${E.repRut}, ambos domiciliados en ${E.domicilio}, en adelante "el empleador"; y por la otra parte don(ña) <b>${trabajador.nombre||"—"}</b>, cédula de identidad N° ${trabajador.rut||"—"}, en adelante "el trabajador", se acuerda el siguiente finiquito:</p>

    <div class="clausula"><b>PRIMERO: Término de la relación laboral.</b> El trabajador declara haber prestado servicios de <b>${trabajador.cargo||"Auxiliar de Aseo"}</b> en ${lugar}, desde el <b>${fechaLargaCL(trabajador.fecha_inicio)}</b> hasta el <b>${fechaLargaCL(fechaSep)}</b>, ambas fechas inclusive, terminando el contrato de trabajo por la causal: <b>${trabajador.motivo_termino||"—"}</b>. Antigüedad: ${calc.mesesServicio} meses (${calc.diasTotales} días).</div>

    <div class="clausula"><b>SEGUNDO: Haberes.</b> El empleador pagará al trabajador la suma que se desglosa como sigue:
      <table><thead><tr><th>Concepto</th><th style="text-align:right;width:30%">Monto</th></tr></thead>
      <tbody>${filas}<tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${clp(totalFinal)}</b></td></tr></tbody></table>
      Son: <b>${numeroAPalabras(totalFinal)} pesos</b>. Sueldo base de referencia: ${clp(calc.sueldoBase)}.</div>

    <div class="clausula"><b>TERCERO: Cotizaciones previsionales.</b> El trabajador deja expresa constancia de que se le ha informado del estado de pago de sus cotizaciones previsionales devengadas y que se le han entregado los comprobantes que justifican el pago de éstas, por el período trabajado.</div>

    <div class="clausula"><b>CUARTO: Recepción conforme y finiquito amplio.</b> El trabajador declara que durante el período en que prestó servicios al empleador recibió correcta y oportunamente el total de las remuneraciones convenidas conforme a su contrato, clase de trabajo ejecutado, reajustes legales, horas extraordinarias en su caso, feriado legal, gratificaciones y participaciones que correspondan, y que nada se le adeuda por estos conceptos ni por ningún otro, sea de origen legal o contractual derivado de la prestación de sus servicios o de su término. En consecuencia, salvo lo expresamente reservado por escrito en este acto, otorga al empleador el más amplio y total finiquito, renunciando a toda acción que pudiere corresponderle.</div>

    <div class="clausula"><b>QUINTO: Ley N° 21.389 (Registro Nacional de Deudores de Pensiones de Alimentos).</b> El empleador declara que no ha retenido monto alguno del presente finiquito, por cuanto no ha sido decretada judicialmente obligación de retención de alimentos respecto del trabajador. Por su parte, el trabajador declara bajo juramento que no mantiene deudas por concepto de pensión de alimentos, por lo que el empleador no deberá realizar descuentos, asumiendo toda la responsabilidad legal sobre la veracidad de esta información, conforme a la Ley N° 21.389 y la Ley N° 14.908.</div>

    <div class="clausula"><b>SEXTO: Ejemplares.</b> Para constancia firman los comparecientes el presente finiquito en tres ejemplares de idéntico tenor, fecha y valor, quedando dos en poder del empleador y uno en poder del trabajador.</div>

    <div class="firmas">
      <div class="firma">${trabajador.nombre||"—"}<br/>RUT ${trabajador.rut||"—"}<br/><b>Trabajador</b></div>
      <div class="firma">${E.repNombre}<br/>RUT ${E.repRut}<br/><b>p.p. ${E.razon}</b></div>
    </div>
    <div class="firmas" style="margin-top:40px">
      <div class="firma" style="max-width:60%;margin:0 auto"><b>Ministro de fe</b><br/>Ratificación conforme al Art. 177 del Código del Trabajo</div>
    </div>
    <p class="nota" style="margin-top:18px">Montos calculados por el ERP. Revisar antes de firma y ratificación.</p>`;
  htmlDocImprimir(`Finiquito ${trabajador.nombre||""}`, cuerpo, E.razon);
}

// Clasifica la causal para la Carta de Aviso (Art. 162): nombre legal, plazo, si requiere estado de cotizaciones y si aplica carta de despido.
function causalCarta(label){
  const l=(label||'').toLowerCase();
  // indemTxt: cláusula de indemnización que se incorpora automáticamente a la carta según la causal.
  // hechosHint: guía dinámica de qué redactar en los hechos.
  // riesgo: nivel de exigencia documental (bajo|medio|alto). requiereNumeral: pide numeral (Art. 160).
  const INDEM_NO = 'Por tratarse de esta causal, no procede el pago de indemnización por años de servicio ni de indemnización sustitutiva del aviso previo. Se pagarán únicamente las remuneraciones devengadas y el feriado proporcional que correspondan.';
  if(l.includes('163 bis')) return {nombre:'artículo 163 bis del Código del Trabajo (liquidación o reorganización judicial del empleador)', plazoTxt:'dentro de los 6 días hábiles siguientes a la fecha de separación', requiereCotiz:false, aplica:true, art161:false, riesgo:'medio', requiereNumeral:false, indemTxt:'En conformidad al artículo 163 bis, corresponde el pago de la indemnización por años de servicio en los términos que la ley establece para este procedimiento.', hechosHint:'Indica la resolución de liquidación o reorganización judicial y su fecha.'};
  if(l.includes('161')||l.includes('desahucio')||l.includes('necesidades')) return {nombre:'artículo 161 del Código del Trabajo (necesidades de la empresa)', plazoTxt:'con a lo menos 30 días de anticipación, salvo que se pague la indemnización sustitutiva del aviso previo', requiereCotiz:true, aplica:true, art161:true, riesgo:'medio', requiereNumeral:false, indemTxt:'Por tratarse de la causal del artículo 161, corresponde el pago de la indemnización por años de servicio conforme a la antigüedad del trabajador (si procede según su fecha de inicio), además del aviso previo de 30 días o, en su defecto, de la indemnización sustitutiva del aviso previo.', hechosHint:'Explica los motivos objetivos que fundan el término: reestructuración, modernización, cambios en el mercado, baja de productividad, reducción de dotación, etc. Deben ser hechos concretos y verificables, no fórmulas genéricas.'};
  if(l.includes('160')) return {nombre:'artículo 160 del Código del Trabajo', plazoTxt:'dentro de los 3 días hábiles siguientes a la fecha de separación', requiereCotiz:true, aplica:true, art161:false, riesgo:'alto', requiereNumeral:true, indemTxt:'Por tratarse de una causal del artículo 160 (caducidad por conducta del trabajador), esta no da derecho a indemnización por años de servicio ni a indemnización sustitutiva del aviso previo. Se pagarán únicamente los días efectivamente trabajados del mes y el feriado proporcional que corresponda.', hechosHint:'Detalla el qué, cuándo y cómo de los hechos: fechas exactas, lugar, personas involucradas, testigos, sumarios o procedimientos. La acusación debe ser precisa, comprobable y respaldada con evidencia (amonestaciones, actas, informes). No uses descripciones genéricas.'};
  if(l.includes('159')&&(l.includes('n°6')||l.includes('n6')||l.includes('caso fortuito')||l.includes('fuerza mayor'))) return {nombre:'artículo 159 N°6 del Código del Trabajo (caso fortuito o fuerza mayor)', plazoTxt:'dentro de los 6 días hábiles siguientes a la fecha de separación', requiereCotiz:true, aplica:true, art161:false, riesgo:'medio', requiereNumeral:false, indemTxt:INDEM_NO, hechosHint:'Describe el hecho de caso fortuito o fuerza mayor: qué ocurrió, cuándo y cómo impidió la continuidad del contrato.'};
  if(l.includes('159')&&(l.includes('n°5')||l.includes('n5')||l.includes('conclusión')||l.includes('conclusion'))) return {nombre:'artículo 159 N°5 del Código del Trabajo (conclusión del trabajo o servicio que dio origen al contrato)', plazoTxt:'dentro de los 3 días hábiles siguientes a la fecha de separación', requiereCotiz:true, aplica:true, art161:false, riesgo:'bajo', requiereNumeral:false, indemTxt:INDEM_NO, hechosHint:'Identifica el trabajo o servicio que dio origen al contrato y la fecha en que concluyó (por ejemplo, término de la asignación o faena).'};
  if(l.includes('159')&&(l.includes('n°4')||l.includes('n4')||l.includes('vencimiento'))) return {nombre:'artículo 159 N°4 del Código del Trabajo (vencimiento del plazo convenido)', plazoTxt:'dentro de los 3 días hábiles siguientes a la fecha de separación', requiereCotiz:true, aplica:true, art161:false, riesgo:'bajo', requiereNumeral:false, indemTxt:INDEM_NO, hechosHint:'Señala la fecha exacta de término del plazo pactada en el contrato original o en sus anexos.'};
  if(l.includes('mutuo')||(l.includes('159')&&l.includes('n°1'))) return {nombre:'artículo 159 N°1 del Código del Trabajo (mutuo acuerdo de las partes)', plazoTxt:'', requiereCotiz:false, aplica:false, art161:false, riesgo:'bajo', requiereNumeral:false, indemTxt:'', hechosHint:''};
  if(l.includes('renuncia')||(l.includes('159')&&l.includes('n°2'))) return {nombre:'artículo 159 N°2 del Código del Trabajo (renuncia del trabajador)', plazoTxt:'', requiereCotiz:false, aplica:false, art161:false, riesgo:'bajo', requiereNumeral:false, indemTxt:'', hechosHint:''};
  return {nombre: label||'(causal no especificada)', plazoTxt:'dentro de los plazos legales que correspondan', requiereCotiz:true, aplica:true, art161:false, riesgo:'medio', requiereNumeral:false, indemTxt:'', hechosHint:'Describe con precisión los hechos que fundan el término del contrato.'};
}

// Carta de Aviso de Término de Contrato (Art. 162). Causal-aware. opts: {fechaSep, hechos, modalidad, indemnizaciones, sustitutiva}
function imprimirCartaAviso(trabajador, data, opts={}, emp=null){
  const E = empresaParaDoc(emp || _empresaCfgCache);
  // Construye un "snapshot" (fotografía congelada) con todo lo necesario para reimprimir
  // exactamente la misma carta. Si opts._snapshot viene dado, reimprime desde él.
  let snap;
  if(opts._snapshot){
    snap = opts._snapshot;
  } else {
    const fechaSep = opts.fechaSep || dateOnly(trabajador.fecha_separacion);
    if(!fechaSep){ alert("El trabajador no tiene fecha de separación registrada."); return null; }
    const cz = causalCarta(trabajador.motivo_termino);
    const numeral = (opts.numeral160||'').trim();
    const nombreCausal = (cz.requiereNumeral && numeral) ? `artículo 160 ${numeral} del Código del Trabajo` : cz.nombre;
    const fechaCartaISO = new Date().toISOString().slice(0,10);
    // ¿Carta programada? La separación cae en un mes POSTERIOR al de emisión → redacción prudente de cotizaciones.
    const emit=new Date(fechaCartaISO+'T12:00:00'), sep=new Date(fechaSep+'T12:00:00');
    const programada = (sep.getFullYear()*12+sep.getMonth()) > (emit.getFullYear()*12+emit.getMonth());
    snap = {
      nombre: trabajador.nombre||'—',
      rut: trabajador.rut||'—',
      domicilio: trabajador.domicilio || trabajador.direccion || '(domicilio señalado en el contrato de trabajo)',
      fechaCartaISO,
      fechaSepISO: fechaSep,
      causalLabel: trabajador.motivo_termino||'',
      nombreCausal,
      numeral160: numeral||null,
      hechos: (opts.hechos||'').trim(),
      indemTexto: (opts.indemnizaciones||'').trim() || (cz.indemTxt||'').trim(),
      modalidadCode: opts.modalidad==='presencial' ? 'presencial' : 'electronico',
      sustitutiva: !!opts.sustitutiva,
      origen_necesidad: opts.origen_necesidad||null,   // Ola 2
      requiereCotiz: cz.requiereCotiz,
      art161: cz.art161,
      plazoTxt: cz.plazoTxt,
      programada,
      generadoPor: opts._generadoPor||'sistema',
      generadoEn: new Date().toISOString(),
      _v: 1,
    };
  }

  const modalidadTxt = snap.modalidadCode==='presencial' ? 'presencial ante un ministro de fe' : 'electrónica';
  const mesAnt = (()=>{ const d=new Date(snap.fechaSepISO+'T12:00:00'); d.setDate(0); return fechaLargaCL(d.toISOString().slice(0,10)); })();
  const clausFiniquito = `Se hace presente que el finiquito le será otorgado en forma <b>${modalidadTxt}</b>. Se deja constancia expresa de que es <b>voluntario</b> para usted aceptar, firmar y recibir el pago en forma electrónica; que siempre podrá optar por concurrir personalmente ante un <b>ministro de fe</b> para su ratificación; y que, si lo estima necesario, podrá formular <b>reserva de derechos</b>.`;
  // Cotizaciones: redacción prudente para cartas programadas (evita afirmar un pago futuro).
  const clausCotiz = snap.requiereCotiz
    ? (snap.programada
        ? `<div class="clausula"><b>Estado de cotizaciones previsionales.</b> Se informa que sus cotizaciones previsionales se encuentran pagadas hasta el último mes legalmente exigible a la fecha de emisión de esta comunicación, sin perjuicio de la obligación del empleador de mantenerlas íntegramente pagadas hasta el término efectivo de la relación laboral. Al término se adjuntarán los comprobantes que acreditan dicho pago, conforme al artículo 162 del Código del Trabajo.</div>`
        : `<div class="clausula"><b>Estado de cotizaciones previsionales.</b> Se informa que sus cotizaciones previsionales se encuentran pagadas hasta el último día del mes anterior al término (${mesAnt}), adjuntándose a esta comunicación los comprobantes que acreditan dicho pago respecto de todo el período trabajado, conforme al artículo 162 del Código del Trabajo.</div>`)
    : '';
  const clausAviso161 = snap.art161
    ? `<div class="clausula"><b>Aviso previo.</b> La presente comunicación se efectúa ${snap.plazoTxt}.${snap.sustitutiva?' En consecuencia, se pagará a usted la indemnización sustitutiva del aviso previo, equivalente a la última remuneración mensual devengada.':''}</div>`
    : '';
  const indemHtml = snap.indemTexto ? `<div class="clausula"><b>Indemnizaciones.</b> ${snap.indemTexto.replace(/\.\s*$/,'')}.</div>` : '';
  // Hechos: respeta saltos de línea y omite las etiquetas de la plantilla guiada que quedaron sin contenido.
  const PL_LABELS=['Motivo objetivo:','Fecha de inicio del problema:','Impacto operacional:','Medidas evaluadas previamente:'];
  const escHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const hechosLineas=(snap.hechos||'').split('\n').map(l=>l.trim()).filter(l=>{
    if(!l) return false;
    return !PL_LABELS.some(lb=> l===lb || (l.startsWith(lb)&&l.slice(lb.length).trim()===''));
  });
  const hechosHtml = hechosLineas.length ? hechosLineas.map(l=>{
    const lb=PL_LABELS.find(x=>l.startsWith(x));
    if(lb){ const val=l.slice(lb.length).trim(); return `<b>${escHtml(lb)}</b><br/>${escHtml(val||'—')}`; }
    return escHtml(l);
  }).join('<br/><br/>') : '(indicar los hechos concretos que fundamentan la causal invocada)';

  const cuerpo = `
    <h1>Carta de Aviso de Término de Contrato de Trabajo</h1>
    <div class="empresa"><b>${E.razon}</b> · RUT ${E.rut}</div>
    <p style="text-align:right;margin-top:6px">${E.ciudad}, ${fechaLargaCL(snap.fechaCartaISO)}</p>
    <p style="margin:0"><b>Señor(a):</b> ${snap.nombre}<br/>
       <b>Cédula de identidad:</b> ${snap.rut}<br/>
       <b>Domicilio:</b> ${snap.domicilio}</p>
    <p>De mi consideración:</p>
    <p>Por medio de la presente, y en cumplimiento de lo dispuesto en el <b>artículo 162 del Código del Trabajo</b>, comunico a usted que <b>${E.razon}</b>, RUT ${E.rut}, representada legalmente por doña <b>${E.repNombre}</b>, ha resuelto poner término a su contrato de trabajo a contar del <b>${fechaLargaCL(snap.fechaSepISO)}</b>, invocando la causal contemplada en el <b>${snap.nombreCausal}</b>.</p>
    <div class="clausula"><b>Hechos en que se funda el término.</b><br/>${hechosHtml}</div>
    ${indemHtml}
    ${clausAviso161}
    ${clausCotiz}
    <div class="clausula"><b>Modalidad del finiquito y derechos del trabajador.</b> ${clausFiniquito}</div>
    <p>Se remitirá copia de la presente comunicación a la Inspección del Trabajo respectiva, conforme a la ley.</p>
    <p>Sin otro particular, le saluda atentamente,</p>
    <div class="firmas" style="margin-top:48px">
      <div class="firma">${E.repNombre}<br/>RUT ${E.repRut}<br/><b>${E.repCargo} · p.p. ${E.razon}</b></div>
      <div class="firma">Recibí conforme<br/>Nombre, RUT y fecha<br/><b>${snap.nombre}</b></div>
    </div>
    <p class="nota" style="margin-top:18px">Documento generado por el ERP. Notifíquese al trabajador <b>personalmente o por carta certificada</b> al <b>domicilio del trabajador</b> señalado en el contrato, conservando el <b>comprobante de envío</b>. Plazo legal de comunicación: ${snap.plazoTxt||'según la causal invocada'}. ${snap.requiereCotiz?'Adjuntar los comprobantes de pago de cotizaciones previsionales.':''}</p>`;
  htmlDocImprimir(`Carta de Aviso ${snap.nombre||''}`, cuerpo, E.razon);
  return snap;
}

// Conversión simple de monto a palabras (para el contrato). Suficiente para sueldos.
function numeroAPalabras(n){
  n=Math.round(n||0);
  if(n===0) return "cero";
  const U=["","un","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte"];
  const D=["","","veinti","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
  const C=["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];
  const sub=x=>{ // 0..999
    if(x===0) return "";
    if(x===100) return "cien";
    let s="";
    const c=Math.floor(x/100), r=x%100;
    if(c) s+=C[c]+" ";
    if(r<=20) s+=U[r];
    else { const d=Math.floor(r/10), u=r%10;
      if(d===2) s+= u? "veinti"+U[u] : "veinte";
      else s+= D[d]+(u?" y "+U[u]:""); }
    return s.trim();
  };
  const millones=Math.floor(n/1000000), miles=Math.floor((n%1000000)/1000), resto=n%1000;
  let out="";
  if(millones) out+= (millones===1?"un millón":sub(millones)+" millones")+" ";
  if(miles) out+= (miles===1?"mil":sub(miles)+" mil")+" ";
  if(resto) out+= sub(resto);
  return out.trim().replace(/\s+/g," ");
}

function genEppId(trabajadorId){
  const ts=Date.now().toString(36).toUpperCase();
  return `EPP-${(trabajadorId||'TR').slice(-4)}-${ts}`;
}

// Documental unificada: documentos generados por el ERP + escaneados externos (Fase 8D / base 8D.5)
const TIPO_DOC_LABEL = {
  contrato:"Contrato de trabajo",
  odi:"ODI — Derecho a Saber",
  reglamento:"Acta Reglamento Interno",
  epp:"Acta de entrega EPP",
  anexo:"Anexo de contrato",
  finiquito:"Finiquito",
  carta_aviso:"Carta de aviso de término",
  certificado:"Certificado",
  otro:"Otro documento",
};
const ORIGEN_LABEL = { externo:"Externo", generado_erp:"ERP" };
const ESTADO_DOC = {
  pendiente:{label:"Pendiente firma", bg:C.yellowBg, text:C.yellow, border:C.yellowBorder},
  firmado:  {label:"Firmado",         bg:C.greenBg,  text:C.green,  border:C.greenBorder},
  archivado:{label:"Archivado",       bg:C.accentBg, text:C.accentText, border:"#bfdbfe"},
  vencido:  {label:"Vencido",         bg:C.redBg,    text:C.red,    border:C.redBorder},
  anulado:  {label:"Anulado",         bg:C.borderLight, text:C.textMuted, border:C.border},
};
const STORAGE_BUCKET = "documentos-trabajadores";
function genDocTrabId(trabajadorId, tipo){
  const ts=Date.now().toString(36).toUpperCase();
  return `DOC-${(tipo||'doc').slice(0,3).toUpperCase()}-${(trabajadorId||'TR').slice(-4)}-${ts}`;
}

// Cierre del ciclo documental: subir el PDF/imagen FIRMADO de un documento generado
// por el ERP. NO crea fila nueva: actualiza la MISMA fila (archivo_url + estado=firmado).
async function subirArchivoFirmado(doc, file, trabajador, update, quien){
  if(!file) return false;
  if(!isConfigured){ alert("El almacenamiento de archivos no está disponible en modo demo."); return false; }
  try{
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${trabajador.id}/firmado_${doc.tipo_documento}_v${doc.version||1}_${Date.now()}_${safe}`;
    // Hash SHA-256 del archivo firmado (evidencia de integridad)
    let hash=null;
    try{
      const buf=await file.arrayBuffer();
      const h=await crypto.subtle.digest('SHA-256',buf);
      hash=Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(e){ /* hash opcional */ }
    const {error}=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(error){ alert("Error al subir el archivo firmado: "+error.message+"\n\n¿Existe el bucket «"+STORAGE_BUCKET+"»?"); return false; }
    const ahora=new Date().toISOString();
    await update('documentos_trabajador',{
      ...doc,
      archivo_url:path,
      nombre_archivo:file.name,
      estado:'firmado',
      metodo_firma:'fisica',
      firmado_por:trabajador.nombre||null,
      fecha_firma:ahora,
      hash_documento:hash,
      fecha_carga:ahora,
      observaciones:(doc.observaciones?doc.observaciones+' · ':'')+`firmado físico subido por ${quien}`,
    });
    return true;
  }catch(e){ alert("Error: "+e.message); return false; }
}
// Abre el selector de archivo y, al elegir, sube el firmado a la misma fila.
function pickAndUploadFirmado(doc, trabajador, update, quien){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='.pdf,image/*';
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(f) subirArchivoFirmado(doc,f,trabajador,update,quien); };
  inp.click();
}

function TabDocumentos({trabajador, data, insert, update, autoFiniquito, autoCarta}){
  const [eppForm,setEppForm]=useState(null);
  const [subForm,setSubForm]=useState(null);      // formulario subir documento externo
  const [subiendo,setSubiendo]=useState(false);
  const [dupModal,setDupModal]=useState(null);    // modal de duplicado ERP
  const [contratoModal,setContratoModal]=useState(null);  // pre-emisión del contrato (8D.5)
  const [finiquitoModal,setFiniquitoModal]=useState(null);  // pre-emisión del finiquito (solo desvinculados)
  const [cartaModal,setCartaModal]=useState(null);          // pre-emisión de la carta de aviso (Art. 162)
  const { user, perfil } = useAuth();
  const quien = perfil?.nombre || user?.email || 'sistema';

  const entregas=(data.entregas_epp||[]).filter(e=>e.trabajador_id===trabajador.id)
    .sort((a,b)=>new Date(b.created_at||b.fecha_entrega||0)-new Date(a.created_at||a.fecha_entrega||0));
  const docs=(data.documentos_trabajador||[]).filter(d=>d.trabajador_id===trabajador.id)
    .sort((a,b)=>new Date(b.fecha_documento||b.fecha_carga||b.created_at||0)-new Date(a.fecha_documento||a.fecha_carga||a.created_at||0));

  // ── Camino 2: generar documento desde el ERP, con control de duplicados ──
  // Solo se controlan los documentos ERP clave; los externos pueden repetirse.
  const ERP_CONTROLADOS = ['contrato','odi','reglamento','epp'];
  const proximaVersion=(tipo)=>{
    const vs=docs.filter(d=>d.tipo_documento===tipo&&d.origen==='generado_erp').map(d=>Number(d.version||1));
    return vs.length?Math.max(...vs)+1:1;
  };
  const insertarGenerado=async(tipo,version,extra={})=>{
    await insert('documentos_trabajador',{
      id:genDocTrabId(trabajador.id,tipo),
      trabajador_id:trabajador.id,
      tipo_documento:tipo,
      origen:'generado_erp',
      estado:'pendiente',
      version,
      fecha_documento:new Date().toISOString(),
      fecha_carga:new Date().toISOString(),
      archivo_url:null,
      nombre_archivo:null,
      observaciones:`Emitido por ${quien} (v${version})`,
      ...extra,
    });
  };
  // Al pulsar un botón generador: si ya existe ese tipo (ERP, no anulado), abre modal.
  const emitir=(tipo,fn)=>{
    if(ERP_CONTROLADOS.includes(tipo)){
      const existentes=docs.filter(d=>d.tipo_documento===tipo&&d.origen==='generado_erp'&&d.estado!=='anulado');
      if(existentes.length){ setDupModal({tipo,fn,existentes}); return; }
    }
    fn(); insertarGenerado(tipo,1);
  };
  // Acciones del modal de duplicado
  const dupVerExistente=()=>{ dupModal?.fn?.(); setDupModal(null); };               // reimprime, sin nueva fila
  const dupNuevaVersion=async()=>{ const m=dupModal; setDupModal(null); m?.fn?.(); await insertarGenerado(m.tipo, proximaVersion(m.tipo)); };

  // ── Contrato (8D.5): modal de pre-emisión con lugar y funciones editables ──
  const openContrato=()=>{
    const lj=lugaresYJornada(trabajador,data);
    setContratoModal({ lugar: lj.lugares, funciones: funcionesPorCargo(trabajador.cargo) });
  };
  const generarContrato=async(crearFila)=>{
    const ov={lugar:contratoModal.lugar, funciones:contratoModal.funciones};
    const emp=await getEmpresaConfig();
    imprimirContratoTrabajo(trabajador, data, ov, emp);
    if(crearFila) await insertarGenerado('contrato', proximaVersion('contrato'));
    setContratoModal(null);
  };

  // ── Finiquito (solo trabajadores desvinculados) ──
  const desvin = trabajador.estado==='DESVINCULADO' || !trabajador.activo;
  const enPreaviso = trabajador.estado==='PREAVISO';   // Art. 161 programado: aún activo, pero ya emite carta de aviso
  const openFiniquito=()=>setFiniquitoModal({
    fechaSep: dateOnly(trabajador.fecha_separacion)||'',
    motivoCode: motivoCodeFromLabel(trabajador.motivo_termino),
    cartaAviso: false,
    otrosConcepto:'', otrosMonto:'',
    descuentoConcepto:'', descuentoMonto:'',
  });
  // Tras la desvinculación guiada, abre automáticamente el generador de finiquito (con revisión, no emite solo)
  useEffect(()=>{ if(autoFiniquito) openFiniquito(); },[autoFiniquito]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ if(autoCarta) openCartaAviso(); },[autoCarta]);  // eslint-disable-line react-hooks/exhaustive-deps
  const generarFiniquito=async(crearFila)=>{
    const emp=await getEmpresaConfig();
    imprimirFiniquito(trabajador, data, finiquitoModal, emp);
    if(crearFila){
      // Regla de version unica: anular los finiquitos previos PENDIENTES (los firmados se conservan como historial).
      const pendientesPrevios=docs.filter(d=>d.tipo_documento==='finiquito'&&d.estado==='pendiente');
      for(const p of pendientesPrevios){ await update('documentos_trabajador',{...p,estado:'anulado',observaciones:`${p.observaciones||''} · anulado al generar nueva version`.trim()}); }
      await insertarGenerado('finiquito', proximaVersion('finiquito'));
    }
    setFiniquitoModal(null);
  };

  // ── Carta de Aviso de Término (Art. 162) ──
  const openCartaAviso=()=>{
    const prev=docs.filter(d=>d.tipo_documento==='carta_aviso'&&d.origen==='generado_erp'&&d.estado!=='anulado'&&d.datos_documento)
                   .sort((a,b)=>Number(b.version||1)-Number(a.version||1))[0];
    const s=prev?.datos_documento;
    setCartaModal({
      fechaSep: (s?dateOnly(s.fechaSepISO):dateOnly(trabajador.fecha_separacion))||'',
      hechos: s?.hechos||'',
      modalidad: s?.modalidadCode||'electronico',
      indemnizaciones: s?.indemTexto||'',
      sustitutiva: s?.sustitutiva||false,
      numeral160: s?.numeral160||'',
      origen_necesidad: s?.origen_necesidad||'',
    });
  };
  const generarCartaAviso=async(crearFila)=>{
    const emp=await getEmpresaConfig();
    const snap=imprimirCartaAviso(trabajador, data, {...cartaModal, _generadoPor:quien}, emp);
    if(snap&&crearFila) await insertarGenerado('carta_aviso', proximaVersion('carta_aviso'), {datos_documento: snap});
    setCartaModal(null);
  };
  // Reimpresión EXACTA de una versión guardada (fotografía congelada).
  const reimprimirCarta=async(row)=>{ if(row?.datos_documento){ const emp=await getEmpresaConfig(); imprimirCartaAviso(trabajador, data, {_snapshot: row.datos_documento}, emp); } };
  // Precarga la configuración de empresa para que todos los documentos la lean desde getEmpresaConfig().
  useEffect(()=>{ getEmpresaConfig(); },[]);

  // ── Camino 1: subir documento existente escaneado (empresa en marcha) ──
  const openSubir=()=>setSubForm({
    tipo_documento:'contrato', fecha_documento:new Date().toISOString().slice(0,10),
    estado:'firmado', observaciones:'', _file:null,
  });
  const subirDocumento=async()=>{
    if(!subForm._file){ alert("Selecciona el archivo escaneado (PDF o imagen)."); return; }
    if(!isConfigured){ alert("El almacenamiento de archivos no está disponible en modo demo."); return; }
    setSubiendo(true);
    try{
      const f=subForm._file;
      const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${trabajador.id}/${Date.now()}_${safe}`;
      const {error:upErr}=await supabase.storage.from(STORAGE_BUCKET).upload(path,f,{upsert:false,contentType:f.type||undefined});
      if(upErr){ alert("Error al subir el archivo: "+upErr.message+"\n\n¿Existe el bucket «"+STORAGE_BUCKET+"» en Supabase Storage?"); setSubiendo(false); return; }
      const ok=await insert('documentos_trabajador',{
        id:genDocTrabId(trabajador.id,subForm.tipo_documento),
        trabajador_id:trabajador.id,
        tipo_documento:subForm.tipo_documento,
        origen:'externo',
        estado:subForm.estado,
        fecha_documento:subForm.fecha_documento?dateNoon(subForm.fecha_documento):null,
        fecha_carga:new Date().toISOString(),
        archivo_url:path,
        nombre_archivo:f.name,
        observaciones:subForm.observaciones?`${subForm.observaciones} · cargado por ${quien}`:`Cargado por ${quien}`,
      });
      if(ok) setSubForm(null);
    }catch(e){ alert("Error: "+e.message); }
    setSubiendo(false);
  };
  const verArchivo=async(d)=>{
    if(!d.archivo_url) return;
    try{
      const {data:s,error}=await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(d.archivo_url,300);
      if(error||!s){ alert("No se pudo abrir el archivo."); return; }
      window.open(s.signedUrl,"_blank");
    }catch(e){ alert("Error: "+e.message); }
  };
  const cambiarEstadoDoc=async(d,estado)=>{ await update('documentos_trabajador',{...d,estado}); };

  // ── EPP ──
  const openEpp=()=>setEppForm({
    id:genEppId(trabajador.id), trabajador_id:trabajador.id,
    articulo:CATALOGO_EPP[0], cantidad:1, talla:"", estado:"entregado",
    fecha_entrega:new Date().toISOString().slice(0,10), observaciones:"",
  });
  const guardarEpp=async()=>{
    if(!eppForm.articulo.trim()) return;
    const rec={...eppForm, cantidad:Number(eppForm.cantidad||1),
      fecha_entrega:eppForm.fecha_entrega?dateNoon(eppForm.fecha_entrega):null};
    const isEdit=entregas.find(e=>e.id===eppForm.id);
    const ok=await(isEdit?update('entregas_epp',rec):insert('entregas_epp',rec));
    if(ok) setEppForm(null);
  };
  const marcarDevuelto=async(e)=>{
    await update('entregas_epp',{...e,estado:e.estado==='devuelto'?'entregado':'devuelto'});
  };

  const docBtn={display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,padding:"14px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",width:"100%"};

  return (
    <div>
      <div style={{background:C.accentBg,border:`1px solid #bfdbfe`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:C.accentText}}>
        📁 <b>Documentación laboral (Fase 8D) — dos caminos.</b> Para trabajadores nuevos, <b>genera</b> los documentos desde el ERP. Para una empresa ya en marcha, <b>sube</b> los documentos firmados fuera del sistema para tenerlos en la carpeta digital del trabajador.
      </div>

      {/* ── Carpeta documental unificada ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:0}}>Carpeta documental del trabajador</p>
        {!subForm&&<PrimaryBtn onClick={openSubir} small color={C.purple}>+ Subir documento existente</PrimaryBtn>}
      </div>

      {subForm&&(
        <div style={{background:C.purpleBg,border:`1px solid ${C.purpleBorder}`,borderRadius:8,padding:14,marginBottom:14}}>
          <p style={{fontSize:12,fontWeight:600,color:C.purple,margin:"0 0 10px"}}>📎 Subir documento firmado externo (origen: Externo)</p>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr",gap:10,marginBottom:10}}>
            <FL label="Tipo de documento">
              <select style={INP} value={subForm.tipo_documento} onChange={e=>setSubForm({...subForm,tipo_documento:e.target.value})}>
                {Object.entries(TIPO_DOC_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </FL>
            <FL label="Fecha del documento"><input type="date" style={INP} value={subForm.fecha_documento||""} onChange={e=>setSubForm({...subForm,fecha_documento:e.target.value})}/></FL>
            <FL label="Estado">
              <select style={INP} value={subForm.estado} onChange={e=>setSubForm({...subForm,estado:e.target.value})}>
                {Object.entries(ESTADO_DOC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </FL>
            <FL label="Archivo escaneado (PDF o imagen)" span>
              <input type="file" accept=".pdf,image/*" style={{...INP,padding:"6px 8px"}} onChange={e=>setSubForm({...subForm,_file:e.target.files?.[0]||null})}/>
            </FL>
            <FL label="Observaciones" span><input style={INP} value={subForm.observaciones} onChange={e=>setSubForm({...subForm,observaciones:e.target.value})} placeholder="Ej: contrato original 2025, copia en carpeta física"/></FL>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <PrimaryBtn onClick={subirDocumento} color={C.purple} disabled={subiendo}>{subiendo?"Subiendo…":"Guardar en carpeta"}</PrimaryBtn>
            <SecondaryBtn onClick={()=>setSubForm(null)}>Cancelar</SecondaryBtn>
            {subForm._file&&<span style={{fontSize:11,color:C.textMuted}}>{subForm._file.name}</span>}
          </div>
        </div>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            {key:"tipo",label:"Tipo",render:r=><span style={{fontWeight:500}}>{TIPO_DOC_LABEL[r.tipo_documento]||r.tipo_documento}{r.origen==='generado_erp'&&r.version?` v${r.version}`:''}</span>},
            {key:"origen",label:"Origen",render:r=><Tag text={ORIGEN_LABEL[r.origen]||r.origen} scheme={r.origen==='externo'?{bg:C.purpleBg,text:C.purple,border:C.purpleBorder}:{bg:C.accentBg,text:C.accentText,border:"#bfdbfe"}}/>},
            {key:"estado",label:"Estado",render:r=>{const s=ESTADO_DOC[r.estado]||ESTADO_DOC.pendiente;return <Tag text={s.label} scheme={s}/>;}},
            {key:"fecha",label:"Fecha doc.",render:r=><span style={{color:C.textMuted}}>{dateOnly(r.fecha_documento)||"—"}</span>},
            {key:"archivo",label:"Archivo",render:r=>r.archivo_url?<button onClick={()=>verArchivo(r)} style={{color:C.accent,background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>📄 Ver</button>:<span style={{fontSize:11,color:C.textDim}}>—</span>},
            {key:"acc",label:"",render:r=>(
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {r.tipo_documento==='carta_aviso'&&r.datos_documento&&(
                  <button onClick={()=>reimprimirCarta(r)} title="Reimprime esta versión exactamente como fue generada" style={{color:C.accent,background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:500}}>🖨 Reimprimir v{r.version||1}</button>
                )}
                {r.origen==='generado_erp'&&(
                  <button onClick={()=>pickAndUploadFirmado(r,trabajador,update,quien)} title="Subir el PDF/foto del documento firmado" style={{color:C.green,background:"none",border:`1px solid ${C.greenBorder}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:500}}>⬆️ {r.archivo_url?"Reemplazar firmado":"Subir firmado"}</button>
                )}
                <select value={r.estado} onChange={e=>cambiarEstadoDoc(r,e.target.value)} style={{fontSize:11,border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 6px",color:C.textMuted,cursor:"pointer",background:C.surface}}>
                  {Object.entries(ESTADO_DOC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            )},
          ]}
          rows={docs}
          empty="Carpeta vacía. Sube los documentos firmados existentes o genera los nuevos desde el ERP."
        />
      </Panel>

      {/* ── Camino 2: generar documento nuevo desde el ERP ── */}
      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"24px 0 8px"}}>Generar documento nuevo desde el ERP</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginBottom:24}}>
        <button style={docBtn} onClick={openContrato}>
          <span style={{fontSize:20}}>📄</span>
          <span style={{fontWeight:600,color:C.text,fontSize:13}}>Contrato de trabajo</span>
          <span style={{fontSize:11,color:C.textMuted}}>Art. 10 C. del Trabajo · jornada y lugar desde asignaciones</span>
        </button>
        <button style={docBtn} onClick={()=>emitir('odi',()=>imprimirODI(trabajador,data))}>
          <span style={{fontSize:20}}>⚠️</span>
          <span style={{fontWeight:600,color:C.text,fontSize:13}}>ODI — Derecho a Saber</span>
          <span style={{fontSize:11,color:C.textMuted}}>D.S. N°40 · matriz de riesgos del rubro aseo</span>
        </button>
        <button style={docBtn} onClick={()=>emitir('reglamento',()=>imprimirActaReglamento(trabajador,data))}>
          <span style={{fontSize:20}}>📕</span>
          <span style={{fontWeight:600,color:C.text,fontSize:13}}>Acta Reglamento Interno</span>
          <span style={{fontSize:11,color:C.textMuted}}>Art. 156 · recepción firmada (incl. Ley Karin)</span>
        </button>
        <button style={docBtn} onClick={()=>emitir('epp',()=>imprimirActaEPP(trabajador,entregas))}>
          <span style={{fontSize:20}}>🧤</span>
          <span style={{fontWeight:600,color:C.text,fontSize:13}}>Acta de entrega EPP</span>
          <span style={{fontSize:11,color:C.textMuted}}>Art. 53 D.S. N°594 · consolida el historial</span>
        </button>
      </div>
      <p style={{fontSize:11,color:C.textDim,margin:"-16px 0 24px"}}>Ciclo completo: el documento generado queda «Pendiente firma». Imprímelo, fírmalo, escanéalo o fotografíalo, y usa <b>⬆️ Subir firmado</b> en su fila de la carpeta. El archivo firmado se adjunta a la <b>misma fila</b> (no se duplica) y el estado pasa a «Firmado».</p>

      {/* ── Egreso: Finiquito (desvinculados) y Carta de Aviso (desvinculados o preaviso) ── */}
      {(desvin||enPreaviso)&&(
        <>
          <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"0 0 8px"}}>Egreso del trabajador</p>
          {enPreaviso&&(
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:11,color:'#1e40af'}}>
              📅 Trabajador en <b>PREAVISO</b> (Art. 161 programado). Emite ahora la <b>Carta de Aviso</b> para respaldar la comunicación. El <b>finiquito</b> se generará al <b>finalizar</b> la desvinculación (desde la ficha → Datos personales).
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginBottom:24}}>
            {desvin&&(
              <button style={docBtn} onClick={openFiniquito}>
                <span style={{fontSize:20}}>📑</span>
                <span style={{fontWeight:600,color:C.text,fontSize:13}}>Generar Finiquito</span>
                <span style={{fontSize:11,color:C.textMuted}}>Art. 177 C. del Trabajo · cálculo referencial desde la desvinculación</span>
              </button>
            )}
            <button style={docBtn} onClick={openCartaAviso}>
              <span style={{fontSize:20}}>📨</span>
              <span style={{fontWeight:600,color:C.text,fontSize:13}}>Generar Carta de Aviso</span>
              <span style={{fontSize:11,color:C.textMuted}}>Art. 162 C. del Trabajo · comunicación de término según causal</span>
            </button>
          </div>
        </>
      )}

      {/* ── Entrega de EPP — historial de artículos ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:0}}>Entrega de EPP — historial de artículos</p>
        {!eppForm&&<PrimaryBtn onClick={openEpp} small>+ Registrar entrega</PrimaryBtn>}
      </div>

      {eppForm&&(
        <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:14,marginBottom:14}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <FL label="Artículo">
              <input list="epp-catalogo" style={INP} value={eppForm.articulo} onChange={e=>setEppForm({...eppForm,articulo:e.target.value})} placeholder="Artículo EPP"/>
              <datalist id="epp-catalogo">{CATALOGO_EPP.map(a=><option key={a} value={a}/>)}</datalist>
            </FL>
            <FL label="Cantidad"><input type="number" min={1} style={INP} value={eppForm.cantidad} onChange={e=>setEppForm({...eppForm,cantidad:e.target.value})}/></FL>
            <FL label="Talla"><input style={INP} value={eppForm.talla} onChange={e=>setEppForm({...eppForm,talla:e.target.value})} placeholder="S/M/L/42…"/></FL>
            <FL label="Fecha entrega"><input type="date" style={INP} value={eppForm.fecha_entrega||""} onChange={e=>setEppForm({...eppForm,fecha_entrega:e.target.value})}/></FL>
            <FL label="Observaciones" span><input style={INP} value={eppForm.observaciones} onChange={e=>setEppForm({...eppForm,observaciones:e.target.value})} placeholder="Estado, motivo de reposición, etc."/></FL>
          </div>
          <div style={{display:"flex",gap:8}}>
            <PrimaryBtn onClick={guardarEpp} color={C.green}>Guardar entrega</PrimaryBtn>
            <SecondaryBtn onClick={()=>setEppForm(null)}>Cancelar</SecondaryBtn>
          </div>
        </div>
      )}

      <Panel noPad>
        <DataTable
          cols={[
            {key:"fecha_entrega",label:"Fecha",render:r=><span style={{color:C.textMuted}}>{dateOnly(r.fecha_entrega)||"—"}</span>},
            {key:"articulo",label:"Artículo",render:r=><span style={{fontWeight:500}}>{r.articulo}</span>},
            {key:"cantidad",label:"Cant.",render:r=>r.cantidad||1},
            {key:"talla",label:"Talla",render:r=>r.talla||"—"},
            {key:"estado",label:"Estado",render:r=><Tag text={r.estado==='devuelto'?"Devuelto":"Entregado"} scheme={r.estado==='devuelto'?{bg:C.yellowBg,text:C.yellow,border:C.yellowBorder}:{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>},
            {key:"obs",label:"Observaciones",render:r=><span style={{fontSize:12,color:C.textMuted}}>{r.observaciones||"—"}</span>},
            {key:"acc",label:"",render:r=>(
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setEppForm({...r,fecha_entrega:dateOnly(r.fecha_entrega)})} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>
                <button onClick={()=>marcarDevuelto(r)} style={{color:C.textMuted,background:"none",border:"none",cursor:"pointer",fontSize:12}}>{r.estado==='devuelto'?"Reactivar":"Devolver"}</button>
              </div>
            )},
          ]}
          rows={entregas}
          empty="Sin entregas de EPP registradas. Usa «Registrar entrega» para iniciar el historial."
        />
      </Panel>

      {dupModal&&(()=>{
        const lbl=TIPO_DOC_LABEL[dupModal.tipo]||dupModal.tipo;
        const ult=[...dupModal.existentes].sort((a,b)=>Number(b.version||1)-Number(a.version||1))[0];
        const sEst=ESTADO_DOC[ult?.estado]||ESTADO_DOC.pendiente;
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&setDupModal(null)}>
            <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:460,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <p style={{fontWeight:700,fontSize:15,color:C.text,margin:"0 0 6px"}}>⚠️ Documento ya existente</p>
              <p style={{fontSize:13,color:C.textMuted,margin:"0 0 14px"}}>Ya existe un <b>{lbl}</b> generado por el ERP para <b>{trabajador.nombre}</b>. ¿Qué deseas hacer?</p>
              <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:16,fontSize:12,color:C.textMuted,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:600,color:C.text}}>{lbl} v{ult?.version||1}</span>
                <Tag text={sEst.label} scheme={sEst}/>
                <span>· {dateOnly(ult?.fecha_documento)||"—"}</span>
                {dupModal.existentes.length>1&&<span>· {dupModal.existentes.length} versiones vigentes</span>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={dupVerExistente} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:500,color:C.text}}>👁 Ver / reimprimir existente <span style={{display:"block",fontSize:11,fontWeight:400,color:C.textMuted}}>Abre el documento actual sin crear otra fila.</span></button>
                <button onClick={dupNuevaVersion} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.accent}`,background:C.accentBg,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:500,color:C.accentText}}>🔄 Generar nueva versión (v{proximaVersion(dupModal.tipo)}) <span style={{display:"block",fontSize:11,fontWeight:400,color:C.accentText}}>Imprime y agrega una fila nueva, conservando la anterior.</span></button>
                <button onClick={()=>setDupModal(null)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,color:C.textMuted}}>✕ Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {contratoModal&&(()=>{
        const existentes=docs.filter(d=>d.tipo_documento==='contrato'&&d.origen==='generado_erp'&&d.estado!=='anulado');
        const yaHay=existentes.length>0;
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&setContratoModal(null)}>
            <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:560,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <p style={{fontWeight:700,fontSize:15,color:C.text,margin:"0 0 4px"}}>📄 Generar contrato de trabajo</p>
              <p style={{fontSize:12,color:C.textMuted,margin:"0 0 14px"}}>{trabajador.nombre} · {trabajador.cargo||"—"}. Revisa el lugar de prestación y las funciones antes de emitir.</p>
              {yaHay&&(
                <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:C.yellow}}>
                  Ya existe un contrato (v{Math.max(...existentes.map(d=>Number(d.version||1)))}). Al generar uno nuevo se creará la <b>v{proximaVersion('contrato')}</b>, conservando el anterior.
                </div>
              )}
              <FL label="Lugar de prestación de servicios (cláusula SEGUNDO)">
                <textarea style={{...INP,minHeight:60,resize:"vertical"}} value={contratoModal.lugar} onChange={e=>setContratoModal({...contratoModal,lugar:e.target.value})}/>
              </FL>
              <div style={{height:10}}/>
              <FL label="Funciones del cargo (cláusula PRIMERO)">
                <textarea style={{...INP,minHeight:80,resize:"vertical"}} value={contratoModal.funciones} onChange={e=>setContratoModal({...contratoModal,funciones:e.target.value})}/>
              </FL>
              <p style={{fontSize:11,color:C.textDim,margin:"6px 0 16px"}}>La jornada, remuneración, gratificación y demás cláusulas se toman automáticamente de las asignaciones y datos del trabajador.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>generarContrato(true)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.accent}`,background:C.accent,color:"#fff",cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:600}}>{yaHay?`🔄 Generar nueva versión (v${proximaVersion('contrato')})`:"📄 Generar contrato (v1)"} <span style={{display:"block",fontSize:11,fontWeight:400,opacity:.9}}>Imprime y agrega la fila a la carpeta documental.</span></button>
                {yaHay&&<button onClick={()=>generarContrato(false)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:500,color:C.text}}>👁 Solo reimprimir <span style={{display:"block",fontSize:11,fontWeight:400,color:C.textMuted}}>Abre el PDF sin crear otra fila.</span></button>}
                <button onClick={()=>setContratoModal(null)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,color:C.textMuted}}>✕ Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {finiquitoModal&&(()=>{
        const calc=calcularFiniquitoPreview(trabajador, data.asignaciones||[], finiquitoModal.fechaSep, finiquitoModal.motivoCode, finiquitoModal.cartaAviso, data.feriados_chile||[]);
        const existentes=docs.filter(d=>d.tipo_documento==='finiquito'&&d.origen==='generado_erp'&&d.estado!=='anulado');
        const yaHay=existentes.length>0;
        const hayFirmado=existentes.some(d=>d.estado==='firmado'||d.estado==='archivado');
        const fila=(k,v)=>(<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0"}}><span style={{color:C.textMuted}}>{k}</span><span style={{fontWeight:600,color:C.text}}>{v}</span></div>);
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&setFiniquitoModal(null)}>
            <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <p style={{fontWeight:700,fontSize:15,color:C.text,margin:"0 0 4px"}}>📑 Generar finiquito</p>
              <p style={{fontSize:12,color:C.textMuted,margin:"0 0 14px"}}>{trabajador.nombre} · {trabajador.motivo_termino||"—"}. Verifica los datos; el cálculo es referencial.</p>
              {yaHay&&(
                <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:C.yellow}}>
                  {hayFirmado
                    ? <>⚠️ Ya existe un finiquito <b>FIRMADO</b> (v{Math.max(...existentes.map(d=>Number(d.version||1)))}). Al generar la <b>v{proximaVersion('finiquito')}</b>, el firmado se <b>conserva como historial</b> — verifica que realmente corresponda emitir uno nuevo.</>
                    : <>Ya existe un finiquito pendiente (v{Math.max(...existentes.map(d=>Number(d.version||1)))}). Al generar la <b>v{proximaVersion('finiquito')}</b>, la versión pendiente anterior se <b>anulará automáticamente</b> (queda una sola activa).</>}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <FL label="Fecha de separación"><input type="date" style={INP} value={finiquitoModal.fechaSep||""} onChange={e=>setFiniquitoModal({...finiquitoModal,fechaSep:e.target.value})}/></FL>
                <FL label="Causal">
                  <select style={INP} value={finiquitoModal.motivoCode} onChange={e=>setFiniquitoModal({...finiquitoModal,motivoCode:e.target.value})}>
                    <option value="art161">Art. 161 — Necesidades de la empresa</option>
                    <option value="art160">Art. 160 — Falta grave (sin indemnización)</option>
                    <option value="art159">Art. 159 — Plazo/mutuo/renuncia</option>
                    <option value="renuncia">Renuncia voluntaria</option>
                    <option value="mutuo">Mutuo acuerdo</option>
                    <option value="otro">Otro</option>
                  </select>
                </FL>
              </div>
              {finiquitoModal.motivoCode==='art161'&&(
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.text,marginBottom:14,cursor:"pointer"}}>
                <input type="checkbox" checked={finiquitoModal.cartaAviso} onChange={e=>setFiniquitoModal({...finiquitoModal,cartaAviso:e.target.checked})}/>
                Se entregó carta de aviso con 30 días de anticipación (Art. 161 → no se paga mes sustitutivo)
              </label>
              )}
              {calc?(
                <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",marginBottom:16}}>
                  {fila("Antigüedad",`${calc.mesesServicio} meses (${calc.diasTotales} días)`)}
                  {fila("Feriado proporcional",`${clp(calc.vacacionesProp)} (${calc.diasVacProp} días)`)}
                  {calc.avisoPrevio>0&&fila("Aviso previo sustitutivo",clp(calc.avisoPrevio))}
                  {calc.indemnizacion>0&&fila("Indemnización años de servicio",clp(calc.indemnizacion))}
                  <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:8,marginTop:8}}>
                    <input style={{...INP,fontSize:12}} placeholder="Otro haber (concepto)" value={finiquitoModal.otrosConcepto} onChange={e=>setFiniquitoModal({...finiquitoModal,otrosConcepto:e.target.value})}/>
                    <input type="number" style={{...INP,fontSize:12}} placeholder="Monto +" value={finiquitoModal.otrosMonto} onChange={e=>setFiniquitoModal({...finiquitoModal,otrosMonto:e.target.value})}/>
                    <input style={{...INP,fontSize:12}} placeholder="Descuento (concepto)" value={finiquitoModal.descuentoConcepto} onChange={e=>setFiniquitoModal({...finiquitoModal,descuentoConcepto:e.target.value})}/>
                    <input type="number" style={{...INP,fontSize:12}} placeholder="Monto −" value={finiquitoModal.descuentoMonto} onChange={e=>setFiniquitoModal({...finiquitoModal,descuentoMonto:e.target.value})}/>
                  </div>
                  {(() => { const tot=calc.vacacionesProp+calc.avisoPrevio+calc.indemnizacion+Math.round(Number(finiquitoModal.otrosMonto||0))-Math.round(Number(finiquitoModal.descuentoMonto||0));
                    return <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:6}}>{fila("TOTAL A PAGAR",clp(tot))}</div>; })()}
                </div>
              ):(
                <div style={{background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12,color:C.red}}>Falta la fecha de ingreso o de separación para calcular. Revisa la ficha del trabajador.</div>
              )}
              <p style={{fontSize:11,color:C.textDim,margin:"0 0 14px"}}>Los montos calculados son referenciales; revísalos antes de emitir. Puedes agregar otros haberes o descuentos.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>generarFiniquito(true)} disabled={!calc} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.accent}`,background:calc?C.accent:C.border,color:"#fff",cursor:calc?"pointer":"not-allowed",textAlign:"left",fontSize:13,fontWeight:600}}>{yaHay?`🔄 Generar nueva versión (v${proximaVersion('finiquito')})`:"📑 Generar finiquito (v1)"} <span style={{display:"block",fontSize:11,fontWeight:400,opacity:.9}}>Imprime y agrega la fila a la carpeta documental.</span></button>
                {yaHay&&<button onClick={()=>generarFiniquito(false)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:500,color:C.text}}>👁 Solo reimprimir</button>}
                <button onClick={()=>setFiniquitoModal(null)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,color:C.textMuted}}>✕ Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}
      {cartaModal&&(()=>{
        const cz=causalCarta(trabajador.motivo_termino);
        const existentes=docs.filter(d=>d.tipo_documento==='carta_aviso'&&d.origen==='generado_erp'&&d.estado!=='anulado');
        const yaHay=existentes.length>0;
        const riesgoAlto = cz.riesgo==='alto';
        const hechosMin = riesgoAlto ? 160 : cz.riesgo==='medio' ? 100 : 1;   // alto(160) > medio(161=100) > bajo
        const numeralOk = !cz.requiereNumeral || (cartaModal.numeral160||'').trim().length>0;
        const PLANTILLA_LABELS=['Motivo objetivo:','Fecha de inicio del problema:','Impacto operacional:','Medidas evaluadas previamente:'];
        let hechosContent=(cartaModal.hechos||''); PLANTILLA_LABELS.forEach(lb=>{ hechosContent=hechosContent.split(lb).join(''); });
        const hechosLen = hechosContent.replace(/\s+/g,' ').trim().length;   // cuenta solo el contenido (sin etiquetas de plantilla)
        const hechosOk = hechosLen>=hechosMin && numeralOk;
        const domFalta = !(trabajador.domicilio||trabajador.direccion);
        const RIESGO = {alto:{txt:'Riesgo jurídico alto',bg:C.redBg||'#fef2f2',bd:C.redBorder||'#fecaca',fg:C.red||'#b91c1c'},medio:{txt:'Riesgo jurídico medio',bg:C.yellowBg,bd:C.yellowBorder,fg:C.yellow},bajo:{txt:'Riesgo jurídico bajo',bg:C.greenBg||'#f0fdf4',bd:C.greenBorder||'#bbf7d0',fg:C.green||'#15803d'}}[cz.riesgo||'medio'];
        // Cruce con contrato / asignación activa
        const asigsTrab=(data.asignaciones||[]).filter(a=>a.trabajador_id===trabajador.id && a.estado_asig==='activa' && a.activo!==false);
        const cruces=asigsTrab.map(a=>({asig:a, contrato:(data.contratos||[]).find(ct=>ct.id===a.contrato_id)}));
        const ctIds=asigsTrab.map(a=>a.contrato_id);
        // Respaldo documental disponible (solo referencia; no es causal)
        const nInc=(data.incidencias||[]).filter(i=>i.trabajador_id===trabajador.id).length;
        const nSup=(data.supervisiones||[]).filter(s=>ctIds.includes(s.contrato_id)).length;
        // Origen de la necesidad (Art. 161)
        const ORIGENES=['Término de contrato','Reducción de dotación','Reestructuración','Disminución de ingresos','Cambios operacionales','Solicitud del mandante','Otro'];
        const esMandante = cartaModal.origen_necesidad==='Solicitud del mandante';
        const PLANTILLA_161='Motivo objetivo: \nFecha de inicio del problema: \nImpacto operacional: \nMedidas evaluadas previamente: ';
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>e.target===e.currentTarget&&setCartaModal(null)}>
            <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:560,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <p style={{fontWeight:700,fontSize:15,color:C.text,margin:"0 0 4px"}}>📨 Generar Carta de Aviso de Término</p>
              <p style={{fontSize:12,color:C.textMuted,margin:"0 0 14px"}}>{trabajador.nombre} · Art. 162 del Código del Trabajo</p>
              <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:C.text}}>
                <b>Causal:</b> {(cz.requiereNumeral&&(cartaModal.numeral160||'').trim())?`artículo 160 ${cartaModal.numeral160} del Código del Trabajo`:cz.nombre}<br/>
                <span style={{color:C.textMuted}}>Plazo de comunicación: {cz.plazoTxt||'—'}.</span>
              </div>
              {cz.aplica&&(
                <div style={{display:"inline-block",background:RIESGO.bg,border:`1px solid ${RIESGO.bd}`,color:RIESGO.fg,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:600,marginBottom:12}}>{RIESGO.txt}</div>
              )}
              {cz.aplica&&domFalta&&(
                <div style={{background:cz.art161?(C.redBg||'#fef2f2'):C.yellowBg,border:`1px solid ${cz.art161?(C.redBorder||'#fecaca'):C.yellowBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:cz.art161?(C.red||'#b91c1c'):C.yellow}}>
                  {cz.art161
                    ? <>⚠ <b>Carta destinada a envío certificado.</b> El trabajador <b>no tiene domicilio registrado</b>. Se recomienda completar el domicilio en Datos personales <b>antes de emitir la versión definitiva</b>. <span style={{color:C.textMuted}}>(No bloquea; puedes generar un borrador.)</span></>
                    : <>⚠ El trabajador <b>no tiene domicilio registrado</b>. La carta mostrará un texto de relleno. Para el envío por <b>carta certificada</b> conviene agregarlo en Datos personales. <span style={{color:C.textMuted}}>(No bloquea la generación.)</span></>}
                </div>
              )}
              {!cz.aplica?(
                <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:C.yellow}}>
                  Para esta causal (mutuo acuerdo / renuncia) <b>no corresponde</b> una carta de aviso de despido del Art. 162. El término se documenta con el finiquito y, en su caso, la carta de renuncia del trabajador.
                </div>
              ):(<>
                <FL label="Fecha de separación"><input type="date" style={INP} value={cartaModal.fechaSep||""} onChange={e=>setCartaModal({...cartaModal,fechaSep:e.target.value})}/></FL>
                {cruces.length>0&&(
                  <div style={{marginTop:10,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',fontSize:11,color:C.text}}>
                    <b>Contrato / asignación asociada</b>
                    {cruces.map((cr,i)=>(
                      <div key={i} style={{marginTop:3,color:C.textMuted}}>
                        • {cr.contrato?(cr.contrato.cliente||cr.contrato.nombre||cr.contrato.id):(cr.asig.contrato_id||'—')}
                        {cr.contrato?.tipo_centro_costo?` · ${(TIPO_CENTRO_TAG[cr.contrato.tipo_centro_costo]||{}).label||cr.contrato.tipo_centro_costo}`:''}
                        {cr.contrato?.fecha_termino_contrato?` · término contrato ${dateOnly(cr.contrato.fecha_termino_contrato)}`:''}
                        {cr.asig?.fecha_termino_asig?` · término asignación ${dateOnly(cr.asig.fecha_termino_asig)}`:''}
                      </div>
                    ))}
                  </div>
                )}
                {cz.art161&&(<>
                  <div style={{height:10}}/>
                  <FL label="Origen de la necesidad">
                    <select style={INP} value={cartaModal.origen_necesidad||""} onChange={e=>setCartaModal({...cartaModal,origen_necesidad:e.target.value})}>
                      <option value="">Selecciona el origen…</option>
                      {ORIGENES.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </FL>
                  {esMandante&&(
                    <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBorder}`,borderRadius:8,padding:'8px 12px',marginTop:6,fontSize:11,color:C.yellow}}>
                      ⚠ "Solicitud del mandante" <b>no basta por sí sola</b> como causal legal. La causal sigue siendo el <b>Art. 161</b> (necesidades de la empresa), y debe respaldarse con <b>correo, oficio, acta o informe de supervisión</b>. <span style={{color:C.textMuted}}>(Por ahora solo se advierte; no bloquea.)</span>
                    </div>
                  )}
                </>)}
                {cz.requiereNumeral&&(<>
                  <div style={{height:10}}/>
                  <FL label="Numeral del Art. 160 (obligatorio)">
                    <select style={INP} value={cartaModal.numeral160||""} onChange={e=>setCartaModal({...cartaModal,numeral160:e.target.value})}>
                      <option value="">Selecciona el numeral invocado…</option>
                      <option value="N°1 (falta de probidad, acoso, vías de hecho, injurias o conducta inmoral)">N°1 — Falta de probidad / acoso / vías de hecho / injurias / conducta inmoral</option>
                      <option value="N°2 (negociaciones incompatibles)">N°2 — Negociaciones incompatibles</option>
                      <option value="N°3 (inasistencias injustificadas)">N°3 — Inasistencias injustificadas</option>
                      <option value="N°4 (abandono del trabajo)">N°4 — Abandono del trabajo</option>
                      <option value="N°5 (actos u omisiones que afectan la seguridad o el funcionamiento; indisciplina)">N°5 — Actos contra la seguridad / indisciplina</option>
                      <option value="N°6 (perjuicio material causado intencionalmente)">N°6 — Daño material intencional</option>
                      <option value="N°7 (incumplimiento grave de las obligaciones del contrato)">N°7 — Incumplimiento grave de las obligaciones</option>
                    </select>
                  </FL>
                </>)}
                <div style={{height:10}}/>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:12,fontWeight:600,color:C.text}}>{riesgoAlto?"Hechos en que se funda el término (obligatorio — detalle exigente)":"Hechos en que se funda el término (obligatorio)"}</span>
                  {cz.art161&&<button type="button" onClick={()=>setCartaModal({...cartaModal,hechos:(cartaModal.hechos?cartaModal.hechos+'\n':'')+PLANTILLA_161})} style={{fontSize:11,color:C.accent,background:'none',border:`1px solid ${C.border}`,borderRadius:5,padding:'2px 8px',cursor:'pointer',fontWeight:500}}>📋 Insertar estructura guiada</button>}
                </div>
                <FL label="">
                  <textarea style={{...INP,height:riesgoAlto?140:110,resize:'vertical',fontFamily:'inherit'}} value={cartaModal.hechos} onChange={e=>setCartaModal({...cartaModal,hechos:e.target.value})} placeholder={cz.hechosHint||"Describe los hechos concretos que fundamentan la causal invocada."}/>
                  <span style={{display:"block",fontSize:11,color:hechosLen>=hechosMin?C.textMuted:(C.red||'#b91c1c'),marginTop:4}}>
                    {cz.hechosHint}{hechosMin>1?` · Mínimo ${hechosMin} caracteres (llevas ${hechosLen}).${riesgoAlto?' Adjunta luego las evidencias (amonestaciones, actas, informes) al expediente.':''}`:''}
                  </span>
                </FL>
                <div style={{height:10}}/>
                <div style={{background:C.surfaceAlt,border:`1px solid ${riesgoAlto?(C.redBorder||'#fecaca'):C.border}`,borderRadius:8,padding:'8px 12px',fontSize:11,color:C.text}}>
                  📎 <b>Respaldo documental disponible</b> <span style={{color:C.textMuted}}>(solo referencia; no constituye causal)</span>
                  <div style={{marginTop:4,display:'flex',gap:14,flexWrap:'wrap'}}>
                    <span>Supervisiones: <b>{nSup}</b></span>
                    <span>Incidencias: <b>{nInc}</b></span>
                    <span>Cartas de compromiso: <b>—</b></span>
                    <span>Amonestaciones: <b>—</b></span>
                  </div>
                  <div style={{fontSize:10,color:C.textMuted,marginTop:4}}>Cartas de compromiso y amonestaciones se integrarán con el Expediente de Desvinculación.{riesgoAlto?' En Art. 160, adjunta las evidencias al expediente antes de notificar.':''}</div>
                </div>
                <div style={{height:10}}/>
                <FL label="Indemnizaciones (opcional — sobrescribe el texto automático)">
                  <input style={INP} value={cartaModal.indemnizaciones} onChange={e=>setCartaModal({...cartaModal,indemnizaciones:e.target.value})} placeholder="Vacío = se usa la cláusula automática de la causal. Ej: indemnización años de servicio según finiquito adjunto."/>
                </FL>
                <div style={{height:10}}/>
                <FL label="Modalidad del finiquito">
                  <select style={INP} value={cartaModal.modalidad} onChange={e=>setCartaModal({...cartaModal,modalidad:e.target.value})}>
                    <option value="electronico">Electrónica (Mi DT)</option>
                    <option value="presencial">Presencial ante ministro de fe</option>
                  </select>
                </FL>
                {cz.art161&&(
                  <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.text,margin:"12px 0 0",cursor:"pointer"}}>
                    <input type="checkbox" checked={cartaModal.sustitutiva} onChange={e=>setCartaModal({...cartaModal,sustitutiva:e.target.checked})}/>
                    Se paga indemnización sustitutiva del aviso previo (cuando no se dio el aviso con 30 días)
                  </label>
                )}
                <p style={{fontSize:11,color:C.textDim,margin:"12px 0 14px"}}>El documento incluye automáticamente: la cláusula de indemnización según la causal, el plazo de comunicación, el estado de cotizaciones (si aplica) y el texto obligatorio sobre finiquito electrónico/presencial, voluntariedad, ministro de fe y reserva de derechos.</p>
              </>)}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {cz.aplica&&!hechosOk&&(
                  <p style={{fontSize:11,color:(C.red||'#b91c1c'),margin:0}}>
                    {!numeralOk?'⚠ Selecciona el numeral del Art. 160 para continuar.'
                      :hechosMin>1?`⚠ Detalla los hechos (mínimo ${hechosMin} caracteres; llevas ${hechosLen}) para continuar.`
                      :'⚠ Escribe los hechos para continuar.'}
                  </p>
                )}
                {cz.aplica&&<button onClick={()=>generarCartaAviso(true)} disabled={!hechosOk} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.accent}`,background:hechosOk?C.accent:C.border,color:"#fff",cursor:hechosOk?"pointer":"not-allowed",textAlign:"left",fontSize:13,fontWeight:600}}>{yaHay?`🔄 Generar nueva versión (v${proximaVersion('carta_aviso')})`:"📨 Generar carta de aviso (v1)"} <span style={{display:"block",fontSize:11,fontWeight:400,opacity:.9}}>Imprime y agrega la fila a la carpeta documental.</span></button>}
                {cz.aplica&&yaHay&&<button onClick={()=>generarCartaAviso(false)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:500,color:C.text}}>👁 Solo reimprimir</button>}
                <button onClick={()=>setCartaModal(null)} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",textAlign:"left",fontSize:13,color:C.textMuted}}>✕ Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
function tipoAnexoLabel(t){ return TIPOS_ANEXO.find(x=>x.val===t)?.label||t; }

function expedienteResumen(trabajador, data){
  const docs=(data.documentos_trabajador||[]).filter(d=>d.trabajador_id===trabajador.id);
  const anexos=(data.anexos_contrato||[]).filter(a=>a.trabajador_id===trabajador.id);
  const epp=(data.entregas_epp||[]).filter(e=>e.trabajador_id===trabajador.id);
  const liqs=(data.liquidaciones||[]).filter(l=>l.trabajador_id===trabajador.id)
    .sort((a,b)=>(b.periodo||"").localeCompare(a.periodo||""));
  const asigs=(data.asignaciones||[]).filter(a=>a.trabajador_id===trabajador.id&&a.estado_asig==='activa'&&a.activo!==false);
  const remun=asigs.filter(a=>a.afecta_remuneracion!==false);
  const oper=asigs.filter(a=>a.afecta_remuneracion===false);
  return {docs,anexos,epp,liqs,asigs,remun,oper};
}

// Fuente única de la regla de obligatorios y completitud (usada por Expediente y por 8D.6).
// Completo = existe en estado firmado/archivado. Solo pendiente = en proceso. Anulado no cuenta.
function checklistObligatorios(trabajador, data){
  const desvin = trabajador.estado==='DESVINCULADO' || !trabajador.activo;
  const obl=[
    {tipo:'contrato',label:'Contrato'},
    {tipo:'odi',label:'ODI'},
    {tipo:'reglamento',label:'Reglamento'},
    {tipo:'epp',label:'EPP'},
  ];
  if(desvin) obl.push({tipo:'finiquito',label:'Finiquito'});
  const docs=(data.documentos_trabajador||[]).filter(d=>d.trabajador_id===trabajador.id);
  const st=(tipo)=>{
    const rows=docs.filter(d=>d.tipo_documento===tipo && d.estado!=='anulado');
    if(!rows.length) return 'falta';
    return rows.some(d=>d.estado==='firmado'||d.estado==='archivado') ? 'completo' : 'proceso';
  };
  const items=obl.map(o=>({...o, st:st(o.tipo)}));
  const completados=items.filter(i=>i.st==='completo').length;
  return {items, completados, total:items.length, completo:completados===items.length, desvin};
}

function imprimirExpediente(trabajador, data, emp=null){
  const E = empresaParaDoc(emp || _empresaCfgCache);
  const R=expedienteResumen(trabajador,data);
  const lj=lugaresYJornada(trabajador,data);
  const filaDoc=R.docs.length
    ? [...R.docs].sort((a,b)=>new Date(b.fecha_documento||b.fecha_carga||0)-new Date(a.fecha_documento||a.fecha_carga||0))
        .map(d=>`<tr><td>${TIPO_DOC_LABEL[d.tipo_documento]||d.tipo_documento}${d.origen==='generado_erp'&&d.version?` v${d.version}`:''}</td><td>${ORIGEN_LABEL[d.origen]||d.origen}</td><td>${(ESTADO_DOC[d.estado]||{}).label||d.estado}</td><td>${dateOnly(d.fecha_documento)||"—"}</td></tr>`).join("")
    : `<tr><td colspan="4" style="text-align:center;color:#888">Sin documentos</td></tr>`;
  const filaAnx=R.anexos.length
    ? R.anexos.map(a=>`<tr><td>${tipoAnexoLabel(a.tipo_anexo)}</td><td>${a.estado||"—"}</td><td>${dateOnly(a.fecha_vigencia)||"—"}</td></tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center;color:#888">Sin anexos</td></tr>`;
  const ultLiq=R.liqs[0];
  const desvin = trabajador.estado==='DESVINCULADO' || !trabajador.activo;
  const cuerpo=`
    <h1>Expediente Digital del Trabajador</h1>
    <div class="empresa"><b>${E.razon}</b> · RUT ${E.rut} · ${E.domicilio}</div>
    <h2>Identificación</h2>
    <p><b>Nombre:</b> ${trabajador.nombre||"—"} &nbsp;·&nbsp; <b>RUT:</b> ${trabajador.rut||"—"} &nbsp;·&nbsp; <b>Cargo:</b> ${trabajador.cargo||"—"}<br/>
    <b>Estado:</b> ${desvin?"DESVINCULADO":"ACTIVO"} &nbsp;·&nbsp; <b>Tipo de contrato:</b> ${(trabajador.tipo_contrato||"—")} &nbsp;·&nbsp; <b>Ingreso:</b> ${fechaLargaCL(trabajador.fecha_inicio)}<br/>
    <b>Sueldo base:</b> ${clp(trabajador.sueldo_base||0)} &nbsp;·&nbsp; <b>AFP:</b> ${trabajador.afp||"—"} &nbsp;·&nbsp; <b>Salud:</b> ${trabajador.salud||"—"}</p>
    <h2>Asignaciones vigentes</h2>
    <p><b>Centro(s) remuneracional(es):</b> ${R.remun.length?lj.lugares:"—"}<br/>
    <b>Centros operacionales:</b> ${R.oper.length} (no afectan remuneración)</p>
    <h2>Documentos en carpeta (${R.docs.length})</h2>
    <table><thead><tr><th>Documento</th><th>Origen</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${filaDoc}</tbody></table>
    <h2>Anexos de contrato (${R.anexos.length})</h2>
    <table><thead><tr><th>Tipo</th><th>Estado</th><th>Vigencia</th></tr></thead><tbody>${filaAnx}</tbody></table>
    <h2>Elementos de protección personal</h2>
    <p>${R.epp.length} entrega(s) de EPP registrada(s)${R.epp.length?` · última: ${dateOnly([...R.epp].sort((a,b)=>new Date(b.fecha_entrega||0)-new Date(a.fecha_entrega||0))[0]?.fecha_entrega)||"—"}`:""}.</p>
    <h2>Liquidaciones</h2>
    <p>${R.liqs.length} liquidación(es)${ultLiq?` · última período ${ultLiq.periodo}: líquido ${clp(ultLiq.liquido||0)} (${ultLiq.firmado_at?"firmada":"pendiente"})`:""}.</p>
    ${desvin?`<h2>Desvinculación</h2><p><b>Motivo:</b> ${trabajador.motivo_termino||"—"} &nbsp;·&nbsp; <b>Fecha separación:</b> ${dateOnly(trabajador.fecha_separacion)||"—"} &nbsp;·&nbsp; <b>Finiquito:</b> ${trabajador.finiquito_estado||"pendiente"}.</p>`:""}
    <p class="lugar">Expediente emitido en Arica, ${fechaLargaCL()}.</p>`;
  htmlDocImprimir(`Expediente ${trabajador.nombre||""}`, cuerpo, E.razon);
}

// Categorías documentales del expediente (8D.5)
const CATEGORIAS_EXP = [
  {key:'contrato',   label:'Contrato'},
  {key:'anexo',      label:'Anexos'},
  {key:'odi',        label:'ODI'},
  {key:'reglamento', label:'Reglamento Interno'},
  {key:'epp',        label:'EPP'},
  {key:'finiquito',  label:'Finiquitos'},
  {key:'carta_aviso',label:'Cartas de aviso'},
  {key:'otros',      label:'Otros'},
];
const CATS_CONOCIDAS = ['contrato','anexo','odi','reglamento','epp','finiquito','carta_aviso'];

function TabExpediente({trabajador, data, update}){
  const { user, perfil } = useAuth();
  const quien = perfil?.nombre || user?.email || 'sistema';
  const R=expedienteResumen(trabajador,data);
  const lj=lugaresYJornada(trabajador,data);
  const desvin = trabajador.estado==='DESVINCULADO' || !trabajador.activo;
  const ultLiq=[...R.liqs][0];

  // Reimpresión de documentos generados por el ERP (no crea fila)
  const reimprimir=async (d)=>{
    if(d.tipo_documento==='contrato'){ const emp=await getEmpresaConfig(); imprimirContratoTrabajo(trabajador,data,{},emp); return; }
    switch(d.tipo_documento){
      case 'odi':        imprimirODI(trabajador,data); break;
      case 'reglamento': imprimirActaReglamento(trabajador,data); break;
      case 'epp':        imprimirActaEPP(trabajador,R.epp); break;
      case 'finiquito':  imprimirFiniquito(trabajador,data,{}); break;
      default: alert("Este tipo de documento no se regenera desde el ERP."); break;
    }
  };
  const verArchivo=async(d)=>{
    if(!d.archivo_url) return;
    try{
      const {data:s,error}=await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(d.archivo_url,300);
      if(error||!s){ alert("No se pudo abrir el archivo."); return; }
      window.open(s.signedUrl,"_blank");
    }catch(e){ alert("Error: "+e.message); }
  };

  // Checklist de obligatorios y completitud (fuente única compartida con 8D.6)
  const chk=checklistObligatorios(trabajador,data);
  const checklist=chk.items;
  const completados=chk.completados;
  const totalObl=chk.total;
  const pct=Math.round(completados/totalObl*100);
  const completo=chk.completo;

  const card={background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:14};
  const linea=(k,v)=>(<div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"4px 0",fontSize:13}}><span style={{color:C.textMuted}}>{k}</span><span style={{fontWeight:500,color:C.text,textAlign:"right"}}>{v}</span></div>);
  const CHK_ICON={completo:"✅",proceso:"⏳",falta:"❌"};
  const CHK_COL={completo:C.green,proceso:C.yellow,falta:C.red};

  const docsDeCategoria=(key)=> key==='otros'
    ? R.docs.filter(d=>!CATS_CONOCIDAS.includes(d.tipo_documento))
    : R.docs.filter(d=>d.tipo_documento===key);

  const DocRow=({d})=>{
    const s=ESTADO_DOC[d.estado]||ESTADO_DOC.pendiente;
    const esErp=d.origen==='generado_erp';
    const esReimprimible=esErp&&['contrato','odi','reglamento','epp','finiquito'].includes(d.tipo_documento);
    return (
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:`1px solid ${C.borderLight}`,flexWrap:"wrap"}}>
        <span style={{fontWeight:500,fontSize:13,color:C.text,flex:1,minWidth:160}}>{TIPO_DOC_LABEL[d.tipo_documento]||d.tipo_documento}{esErp&&d.version?` v${d.version}`:''}</span>
        <Tag text={ORIGEN_LABEL[d.origen]||d.origen} scheme={d.origen==='externo'?{bg:C.purpleBg,text:C.purple,border:C.purpleBorder}:{bg:C.accentBg,text:C.accentText,border:"#bfdbfe"}}/>
        <Tag text={s.label} scheme={s}/>
        <span style={{fontSize:12,color:C.textMuted,minWidth:80}}>{dateOnly(d.fecha_documento)||"—"}</span>
        {d.archivo_url&&<button onClick={()=>verArchivo(d)} style={{color:C.accent,background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>📄 Ver firmado</button>}
        {esReimprimible&&<button onClick={()=>reimprimir(d)} style={{color:C.accent,background:"none",border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>🖨️ Reimprimir original</button>}
        {esErp&&update&&<button onClick={()=>pickAndUploadFirmado(d,trabajador,update,quien)} style={{color:C.green,background:"none",border:`1px solid ${C.greenBorder}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:500}}>⬆️ {d.archivo_url?"Reemplazar firmado":"Subir firmado"}</button>}
        {d.hash_documento&&<span title={`Firmado por: ${d.firmado_por||"—"}\nMétodo: ${d.metodo_firma||"—"}\nFecha: ${dateOnly(d.fecha_firma)||"—"}\nSHA-256: ${d.hash_documento}`} style={{fontSize:11,color:C.textDim,cursor:"help"}}>🔒 evidencia</span>}
      </div>
    );
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div style={{background:C.accentBg,border:`1px solid #bfdbfe`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.accentText,flex:1,minWidth:240}}>
          🗂️ <b>Expediente Digital (Fase 8D.5).</b> Vista consolidada: identidad, documentos por categoría, checklist de obligatorios, anexos, EPP, liquidaciones y desvinculación.
        </div>
        <PrimaryBtn onClick={async()=>{ const emp=await getEmpresaConfig(); imprimirExpediente(trabajador,data,emp); }}>🖨️ Imprimir expediente</PrimaryBtn>
      </div>

      {/* Completitud + checklist */}
      <div style={{...card,marginBottom:14,borderColor:completo?C.greenBorder:C.border,background:completo?C.greenBg:C.surface}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
          <p style={{fontWeight:700,fontSize:14,color:completo?C.green:C.text,margin:0}}>{completo?"✅ Expediente completo":`Expediente ${completados} de ${totalObl} obligatorios`}</p>
          <span style={{fontSize:12,color:C.textMuted}}>{pct}%</span>
        </div>
        <div style={{height:8,background:C.borderLight,borderRadius:4,overflow:"hidden",marginBottom:12}}>
          <div style={{width:`${pct}%`,height:"100%",background:completo?C.green:C.accent}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:6}}>
          {checklist.map(c=>(
            <div key={c.tipo} style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
              <span>{CHK_ICON[c.st]}</span>
              <span style={{color:C.text}}>{c.label}</span>
              <span style={{fontSize:11,color:CHK_COL[c.st],marginLeft:"auto"}}>{c.st==='completo'?'Firmado/Archivado':c.st==='proceso'?'En proceso':'Falta'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Identidad */}
      <div style={{...card,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <p style={{fontWeight:700,fontSize:15,color:C.text,margin:0}}>{trabajador.nombre||"—"}</p>
          <Tag text={desvin?"DESVINCULADO":"ACTIVO"} scheme={desvin?{bg:C.redBg,text:C.red,border:C.redBorder}:{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>
        </div>
        {linea("RUT",trabajador.rut||"—")}
        {linea("Cargo",trabajador.cargo||"—")}
        {linea("Tipo de contrato",trabajador.tipo_contrato||"—")}
        {linea("Fecha de ingreso",dateOnly(trabajador.fecha_inicio)||"— (sin definir)")}
        {linea("Sueldo base",clp(trabajador.sueldo_base||0))}
        {linea("Previsión",`${trabajador.afp||"—"} · ${trabajador.salud||"—"}`)}
        {linea("Centro remuneracional",R.remun.length?lj.lugares:"— sin asignación")}
        {linea("Centros operacionales",`${R.oper.length} (no afectan remuneración)`)}
      </div>

      {/* Documentos agrupados por categoría */}
      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"0 0 8px"}}>Documentos por categoría</p>
      {CATEGORIAS_EXP.map(cat=>{
        const rows=docsDeCategoria(cat.key).sort((a,b)=>new Date(b.fecha_documento||b.fecha_carga||0)-new Date(a.fecha_documento||a.fecha_carga||0));
        if(!rows.length) return null;
        return (
          <div key={cat.key} style={{...card,marginBottom:10}}>
            <p style={{fontWeight:600,fontSize:13,color:C.text,margin:0}}>{cat.label} <span style={{color:C.textMuted,fontWeight:400}}>({rows.length})</span></p>
            {rows.map(d=><DocRow key={d.id} d={d}/>)}
          </div>
        );
      })}
      {!R.docs.length&&(
        <div style={{...card,marginBottom:10,textAlign:"center",color:C.textMuted,fontSize:13}}>Sin documentos en la carpeta. Genera o sube documentos en la pestaña Documentos.</div>
      )}

      {/* Resumen operativo: Anexos */}
      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"20px 0 8px"}}>Resumen operativo — Anexos ({R.anexos.length})</p>
      <Panel noPad>
        <DataTable
          cols={[
            {key:"tipo",label:"Tipo",render:r=><span style={{fontWeight:500}}>{tipoAnexoLabel(r.tipo_anexo)}</span>},
            {key:"estado",label:"Estado",render:r=><span style={{textTransform:"capitalize"}}>{r.estado||"—"}</span>},
            {key:"vig",label:"Vigencia",render:r=><span style={{color:C.textMuted}}>{dateOnly(r.fecha_vigencia)||"—"}</span>},
          ]}
          rows={R.anexos}
          empty="Sin anexos en anexos_contrato."
        />
      </Panel>

      {/* Resumen operativo: EPP */}
      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"20px 0 8px"}}>Resumen operativo — Artículos EPP ({R.epp.length})</p>
      <Panel noPad>
        <DataTable
          cols={[
            {key:"fecha",label:"Fecha",render:r=><span style={{color:C.textMuted}}>{dateOnly(r.fecha_entrega)||"—"}</span>},
            {key:"art",label:"Artículo",render:r=><span style={{fontWeight:500}}>{r.articulo}</span>},
            {key:"cant",label:"Cant.",render:r=>r.cantidad||1},
            {key:"estado",label:"Estado",render:r=><Tag text={r.estado==='devuelto'?"Devuelto":"Entregado"} scheme={r.estado==='devuelto'?{bg:C.yellowBg,text:C.yellow,border:C.yellowBorder}:{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>},
          ]}
          rows={[...R.epp].sort((a,b)=>new Date(b.fecha_entrega||0)-new Date(a.fecha_entrega||0))}
          empty="Sin entregas en entregas_epp."
        />
      </Panel>

      {/* Liquidaciones */}
      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"20px 0 8px"}}>Liquidaciones ({R.liqs.length})</p>
      <div style={{...card,marginBottom:4}}>
        {ultLiq
          ? linea(`Última (${ultLiq.periodo})`,`${clp(ultLiq.liquido||0)} · ${ultLiq.firmado_at?"firmada":"pendiente"}`)
          : <p style={{fontSize:13,color:C.textMuted,margin:0}}>Sin liquidaciones registradas.</p>}
      </div>

      {desvin&&(()=>{
        // Estado del finiquito derivado del DOCUMENTO (fuente única), no del campo deprecado finiquito_estado.
        const fq=R.docs.filter(d=>d.tipo_documento==='finiquito'&&d.estado!=='anulado');
        const estadoFiniquito = fq.some(d=>d.estado==='firmado'||d.estado==='archivado') ? 'Firmado'
          : fq.some(d=>d.estado==='pendiente') ? 'Pendiente de firma'
          : 'Sin generar';
        return (
        <div style={{...card,marginTop:14,background:C.redBg,border:`1px solid ${C.redBorder}`}}>
          <p style={{fontWeight:600,fontSize:13,color:C.red,margin:"0 0 8px"}}>Desvinculación</p>
          {linea("Motivo",trabajador.motivo_termino||"—")}
          {linea("Fecha de separación",dateOnly(trabajador.fecha_separacion)||"—")}
          {linea("Estado finiquito",estadoFiniquito)}
        </div>
        );
      })()}
    </div>
  );
}

// Handoff Retiro -> Anexos. terminarAsignacion -> loadAll pone loading=true y la App
// remonta toda la UI (Spinner), borrando el estado local de Trabajadores. Esta variable
// vive fuera de React y sobrevive al remonte; Trabajadores la restaura al montar.
let pendingAnexoHandoff = null;
// Lanzamiento de Movilidad desde Capa B (Reasignar). Sobrevive a la navegación entre módulos.
let pendingMovilidadStart = null;

function Trabajadores({data,insert,update,saveAsignacion,terminarAsignacion,contratoId}){
  const [form,setForm]=useState(null);
  const [tab,setTab]=useState("datos");
  const [asigForm,setAsigForm]=useState(null);
  const [retiroModal,setRetiroModal]=useState(null);
  const [anexoPrefill,setAnexoPrefill]=useState(null);
  const [movilidadModal,setMovilidadModal]=useState(null);
  // Tras el/los remonte(s) que provoca loadAll, restaura ficha + pestaña + prefill.
  // waitForContratoId: si está, solo restaura cuando ya existe esa asignación activa (último remonte del doble write de movilidad).
  useEffect(()=>{
    if(pendingAnexoHandoff){
      const h=pendingAnexoHandoff;
      const w=(data.trabajadores||[]).find(t=>t.id===h.trabajadorId);
      if(!w) return;
      if(h.waitForContratoId && !(data.asignaciones||[]).some(a=>a.trabajador_id===h.trabajadorId&&a.contrato_id===h.waitForContratoId&&a.estado_asig==='activa')) return;
      pendingAnexoHandoff=null;
      setForm(w); setTab(h.tab||'anexos'); if(h.prefill) setAnexoPrefill(h.prefill);
    }
  },[]); // eslint-disable-line
  // Lanzamiento de Movilidad desde Capa B (Reasignar): abre la ficha y el MovilidadModal con origen preseleccionado.
  useEffect(()=>{
    if(pendingMovilidadStart){
      const h=pendingMovilidadStart; pendingMovilidadStart=null;
      const w=(data.trabajadores||[]).find(t=>t.id===h.trabajadorId);
      const o=(data.asignaciones||[]).find(a=>a.trabajador_id===h.trabajadorId&&a.contrato_id===h.origenContratoId&&a.estado_asig==='activa');
      if(w&&o){ setForm(w); setTab('asignaciones'); abrirMovilidad(o,w); }
    }
  },[]); // eslint-disable-line
  const [showDesvincular,setShowDesvincular]=useState(false);
  const [autoFiniquito,setAutoFiniquito]=useState(0);   // señal para abrir el generador de finiquito tras desvincular
  const [autoCarta,setAutoCarta]=useState(0);           // señal para abrir el generador de carta de aviso tras programar preaviso
  const [preavisoAccion,setPreavisoAccion]=useState(null);  // {tipo:'cancelar'|'finalizar'|'anticipada', motivo, responsable, ...}
  const { perfil:perfilTrab } = useAuth();
  const responsableDefault = perfilTrab?.nombre || '';
  const isNew=form&&!data.trabajadores.find(t=>t.id===form.id);
  const asignadosIds=contratoId?(data.asignaciones||[]).filter(a=>a.contrato_id===contratoId&&a.activo).map(a=>a.trabajador_id):null;
  const trabajadoresFiltrados=asignadosIds?data.trabajadores.filter(t=>asignadosIds.includes(t.id)):data.trabajadores;
  const openNew=()=>{
    // IMM del período más reciente disponible — SOLO para el sueldo por defecto al crear trabajador.
    // Los cálculos (liquidación, finiquito, LRE, impuestos) siguen exigiendo período EXACTO, sin fallback.
    const immN=(data.parametros_legales||[])
      .filter(p=>p.periodo)
      .sort((a,b)=>String(b.periodo).localeCompare(String(a.periodo)))[0]?.imm;
    setTab("datos");setAsigForm(null);
    setForm({id:genId("TR"),nombre:"",cargo:"Auxiliar Aseo",telefono:"",email:"",domicilio:"",activo:true,rut:"",sueldo_base:(Number(immN)>0?Number(immN):0),tipo_contrato:"PLAZO FIJO",afp:"MODELO",salud:"FONASA",bono_asistencia:0,bono_movilizacion:0,bono_colacion:0,metodo_gratificacion:"25% MENSUAL",estado:"ACTIVO",fecha_inicio:"",correo_notificaciones:"",autoriza_com_electronica:false,fecha_actualizacion_datos:"",nacionalidad:"Chilena",fecha_nacimiento:"",estado_civil:"",fecha_termino_plazo:null,ciudad:"",region:""});
  };
  const save=async()=>{if(!form.nombre.trim())return;const _cj=(Array.isArray(form.clausulas_contrato_original)?form.clausulas_contrato_original:[]).find(c=>c&&c.clausula==="jornada");const vj=_cj?validarJornada({...(_cj.contenido||{}),vigencia_desde:_cj.vigencia_desde}):{ok:true,errores:[]};if(!vj.ok){alert("No se puede guardar la jornada:\n\n• "+vj.errores.join("\n• "));return;}const clean=limpiarPayloadTrabajador({...form,fecha_actualizacion_datos:new Date().toISOString().slice(0,10)});
    const ok=isNew?await insert("trabajadores",clean):await update("trabajadores",clean);if(ok){setForm(null);setAsigForm(null);}};

  const asignacionesTrab=form?(data.asignaciones||[]).filter(a=>a.trabajador_id===form.id):[];
  const asignacionesActivas=asignacionesTrab.filter(isAsignacionVigenteHoy);
  const asignacionesOperacionalesActivas=asignacionesTrab.filter(a=>isAsignacionOperacional(a)&&a.estado_asig==="activa"&&a.activo!==false);
  // J2-lite: la asignación describe la participación del trabajador, no un % contra el sueldo base.
  // Solo se conserva el total asociado (dato neutro, sin juicio de déficit/exceso).
  const montoAsociadoTotal=asignacionesActivas.filter(isAsignacionRemuneracional).reduce((s,a)=>s+(Number(a.sueldo_asignado)||0),0);

  const contratoNombre=id=>{const c=data.contratos.find(ct=>ct.id===id);return c?`${c.id} — ${c.cliente}`:id;};
  const openNuevaAsignacion=()=>{
    if(!form||isNew)return;
    // A.1/A.2: todos los campos numéricos arrancan vacíos (placeholder), no en 0 ni heredados.
    setAsigForm({trabajador_id:form.id,contrato_id:contratoId||"",activo:true,estado_asig:"activa",afecta_remuneracion:true,sueldo_asignado:"",modalidad_cobertura:null,origen_trabajador:null,gratificacion_metodo_asig:null,gratificacion_porcentaje_asig:"",gratificacion_observacion_asig:"",bono_asistencia:"",bono_movilizacion:"",bono_colacion:"",gratificacion_monto:"",porcentaje_costo:0,fecha_inicio_asig:new Date().toISOString().slice(0,10),fecha_termino_asig:null,horas_semanales:"",dias_semana:"Lun-Vie",horario:"",jornada:"",descripcion:""});
  };
  const guardarAsignacion=async()=>{
    // Validaciones J2-lite (bloquean el guardado con mensaje).
    const errs=[];
    if(!asigForm?.contrato_id) errs.push("Selecciona un centro de costo.");
    if(!asigForm?.estado_asig) errs.push("Indica el estado de la asignación.");
    if(!asigForm?.fecha_inicio_asig) errs.push("La fecha de inicio es obligatoria.");
    if(asigForm?.fecha_inicio_asig && asigForm?.fecha_termino_asig && dateOnly(asigForm.fecha_termino_asig) < dateOnly(asigForm.fecha_inicio_asig))
      errs.push("La fecha de término no puede ser anterior a la fecha de inicio.");
    const _remun=asigForm.afecta_remuneracion!==false;
    const _monto=Number(asigForm.sueldo_asignado||0);
    if(_remun && asigForm.modalidad_cobertura!=="holgura_remunerada" && !(_monto>0)) errs.push("Si la asignación es remuneracional, el monto asociado al trabajador ($) debe ser mayor a 0.");
    // Normalizar horario por si no se disparó el blur (usuario tecleó y guardó directo).
    // Reconciliar duración/horario por si no se disparó el blur (usuario tecleó y guardó directo).
    const _horasFinal=(asigForm._durRaw!==undefined)?parseDuracion(asigForm._durRaw):horasANumero(asigForm.horas_semanales);
    let _horario=asigForm.horario||"";
    { const p=String(_horario).split("-"); let ini=fmtHoraOperativa(p[0]||""), fin=fmtHoraOperativa(p[1]||"");
      // si se escribió duración sin blur y hay inicio, recomponer término desde inicio+duración
      if(asigForm._durRaw!==undefined && ini && _horasFinal>0) fin=sumaHoraFin(ini,_horasFinal);
      _horario=(ini||fin)?`${ini}-${fin}`:""; }
    if(_horario && !horarioRangoValido(_horario))
      errs.push("El horario operativo debe tener horas válidas en formato HH:mm-HH:mm.");
    if(errs.length){ alert("No se puede guardar la asignación:\n\n• "+errs.join("\n• ")); return; }
    // El % de financiamiento SIEMPRE se deriva del monto ÷ remuneración base imputable (hoy sueldo_base).
    const _pct=(_remun && (form.sueldo_base||0)>0)?Math.round(_monto/form.sueldo_base*10000)/100:(_remun?0:Number(asigForm.porcentaje_costo||0));
    const registro={...asigForm,activo:asigForm.estado_asig!=="terminada",afecta_remuneracion:_remun,sueldo_asignado:_monto,bono_asistencia:Number(asigForm.bono_asistencia||0),bono_movilizacion:Number(asigForm.bono_movilizacion||0),bono_colacion:Number(asigForm.bono_colacion||0),gratificacion_monto:Number(asigForm.gratificacion_monto||0),gratificacion_porcentaje_asig:(asigForm.gratificacion_porcentaje_asig===""||asigForm.gratificacion_porcentaje_asig==null)?null:Number(asigForm.gratificacion_porcentaje_asig),porcentaje_costo:_pct,horas_semanales:_horasFinal,horario:_horario,jornada:[asigForm.dias_semana||"",_horario].filter(Boolean).join(" ")};
    delete registro._durRaw;
    // Holgura ya remunerada: esta asignación no agrega haberes. Se fuerzan a 0 los montos remuneracionales.
    if(registro.modalidad_cobertura==="holgura_remunerada"){
      registro.sueldo_asignado=0; registro.bono_movilizacion=0; registro.bono_colacion=0; registro.bono_asistencia=0;
      registro.gratificacion_monto=0; registro.gratificacion_porcentaje_asig=null;
      registro.gratificacion_metodo_asig="no_aplica"; registro.porcentaje_costo=0;
    }
    if(!registro.fecha_termino_asig) registro.fecha_termino_asig=null;
    const ok=await saveAsignacion(registro);
    if(ok)setAsigForm(null);
  };
  const terminarAsig=(a)=>{
    setRetiroModal({asig:a, fecha:new Date().toISOString().slice(0,10), motivo:'', responsable:''});
  };
  const abrirMovilidad=(o)=>{
    const hoy=new Date().toISOString().slice(0,10);
    setMovilidadModal({
      origen:o, fechaSalida:hoy, fechaEntrada:hoy,
      destino:{
        contrato_id:'', afecta_remuneracion:o.afecta_remuneracion!==false,
        sueldo_asignado:Number(o.sueldo_asignado)||0, porcentaje_costo:Number(o.porcentaje_costo)||0,
        horas_semanales:Number(o.horas_semanales)||45, jornada:o.jornada||'', horario:o.horario||'',
        dias_semana:o.dias_semana||'Lun-Vie',
        bono_asistencia:Number(o.bono_asistencia)||0, bono_movilizacion:Number(o.bono_movilizacion)||0,
        bono_colacion:Number(o.bono_colacion)||0, gratificacion_monto:Number(o.gratificacion_monto)||0,
        descripcion:o.descripcion||'',
      },
    });
  };

  // ── Gestión del preaviso (Art. 161 programado) ──
  // Cancelar preaviso: deja sin efecto, trabajador vuelve a ACTIVO. Motivo obligatorio.
  const cancelarPreaviso = async (pa, acc) => {
    await update('desvinculaciones_programadas', {
      ...pa, estado:'cancelada',
      motivo_cancelacion: acc.motivo, responsable_cancelacion: acc.responsable||responsableDefault,
      fecha_cancelacion: new Date().toISOString().slice(0,10),
    });
    await update('trabajadores', limpiarPayloadTrabajador({ ...form, activo:true, estado:'ACTIVO', fecha_separacion:null, motivo_termino:null }));
    setForm(f=>f?{...f, activo:true, estado:'ACTIVO', fecha_separacion:null, motivo_termino:null}:f);
    setPreavisoAccion(null);
  };
  // Finalizar preaviso: trabajador pasa a DESVINCULADO, cierra asignaciones, abre finiquito. Siempre manual.
  const finalizarPreaviso = async (pa, acc) => {
    const anticipada = acc.tipo==='anticipada';
    const fechaSep = anticipada ? new Date().toISOString().slice(0,10) : dateOnly(pa.fecha_separacion);
    await update('desvinculaciones_programadas', {
      ...pa, estado:'finalizada',
      finalizada_por: acc.responsable||responsableDefault,
      fecha_finalizacion: new Date().toISOString().slice(0,10),
      finalizacion_anticipada: anticipada,
      motivo_finalizacion: anticipada ? (acc.motivo||'') : null,
      sustitutiva_acuerdo: anticipada ? (acc.sustitutiva_acuerdo||'') : null,
      observaciones: acc.observaciones || pa.observaciones || null,
    });
    const desv = { activo:false, estado:'DESVINCULADO', fecha_separacion: dateNoon(fechaSep), motivo_termino: form.motivo_termino||'Art. 161 — Necesidades de la empresa', finiquito_estado:'pendiente' };
    await update('trabajadores', limpiarPayloadTrabajador({ ...form, ...desv }));
    const asigActivas = (data.asignaciones||[]).filter(a=>a.trabajador_id===form.id && (a.estado_asig==='activa'||a.activo!==false));
    for (const a of asigActivas) { await terminarAsignacion(a, fechaSep); }
    setForm(f=>f?{...f, ...desv}:f);
    setPreavisoAccion(null);
    setTab('documentos');           // abre el ciclo de finiquito
    setAutoFiniquito(Date.now());
  };

  return(
    <div>
      {retiroModal&&form&&(()=>{
        const a=retiroModal.asig;
        const activas=(data.asignaciones||[]).filter(x=>x.trabajador_id===form.id&&x.estado_asig==='activa'&&x.activo!==false);
        const restantes=activas.filter(x=>!(x.contrato_id===a.contrato_id&&x.trabajador_id===a.trabajador_id));
        const antes=construirCondicionLaboral(activas,data.contratos);
        const despues=construirCondicionLaboral(restantes,data.contratos);
        const imp=calcularImpactoLaboral(antes,despues);
        const tipoLbl=(TIPOS_ANEXO.find(x=>x.val===imp.tipoAnexoSugerido)||{}).label||imp.tipoAnexoSugerido;
        const cerrar=()=>setRetiroModal(null);
        const ejecutar=async(conAnexo)=>{
          if(!retiroModal.fecha)return;
          const fecha=retiroModal.fecha;
          // Navegacion + prefill SINCRONOS (antes del await), para que el setTab no se pierda con el loadAll de terminarAsignacion.
          if(conAnexo&&imp.requiereAnexo){
            // El loadAll de terminarAsignacion remonta la app (Spinner por loading) y borra el estado local;
            // por eso guardamos el handoff en pendingAnexoHandoff (sobrevive al remonte) y Trabajadores lo restaura al montar.
            pendingAnexoHandoff={ trabajadorId: form.id, prefill:{
              tipo_anexo: imp.tipoAnexoSugerido||'',
              motivo: retiroModal.motivo || `Retiro de asignación ${a.contrato_id}`,
              sueldo_anterior: antes.remuneracion, sueldo_nuevo: despues.remuneracion,
              jornada_anterior: `${antes.horasSemanales} h/sem`, jornada_nueva: `${despues.horasSemanales} h/sem`,
              centro_anterior: antes.centros.join(', '), centro_nuevo: despues.centros.join(', '),
              porcentaje_anterior: antes.pctFinanciado, porcentaje_nuevo: despues.pctFinanciado,
            }};
          }
          setRetiroModal(null);
          setAsigForm(null);
          await terminarAsignacion(a,fecha);
        };
        const Row=({l,v})=>(<div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text}}>{v}</span></div>);
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}} onClick={cerrar}>
            <div style={{background:'#fff',borderRadius:10,padding:22,maxWidth:540,width:'100%',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:'0 0 4px',fontSize:16,color:C.text}}>Retirar de asignación</h3>
              <p style={{fontSize:12,color:C.textMuted,marginBottom:14}}>{form.nombre} · sale de <b>{a.contrato_id}</b>. El trabajador <b>mantiene su relación laboral</b> y sus demás asignaciones.</p>

              <FL label="Fecha de término de la asignación"><FechaInput value={retiroModal.fecha} onChange={v=>setRetiroModal({...retiroModal,fecha:v})} style={INP}/></FL>
              <div style={{height:8}}/>
              <FL label="Motivo (operacional)"><input style={INP} value={retiroModal.motivo} onChange={e=>setRetiroModal({...retiroModal,motivo:e.target.value})} placeholder="Ej: fin de cobertura, redistribución"/></FL>
              <div style={{height:8}}/>
              <FL label="Responsable"><input style={INP} value={retiroModal.responsable} onChange={e=>setRetiroModal({...retiroModal,responsable:e.target.value})}/></FL>

              <div style={{marginTop:14,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:'uppercase',letterSpacing:0.4,marginBottom:6}}>Impacto laboral calculado</div>
                <Row l="Remuneración imputada" v={`$${clp(antes.remuneracion)} → $${clp(despues.remuneracion)}`}/>
                <Row l="% financiado" v={`${antes.pctFinanciado}% → ${despues.pctFinanciado}%`}/>
                <Row l="Jornada (h/sem)" v={`${antes.horasSemanales} → ${despues.horasSemanales}`}/>
                <Row l="Centro que sale" v={a.contrato_id}/>
              </div>

              {imp.requiereAnexo&&(
                <div style={{marginTop:10,fontSize:12,color:'#9a3412',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:6,padding:'8px 10px'}}>
                  ⚠ Este retiro <b>modifica condiciones laborales</b> → corresponde <b>anexo</b>. Tipo sugerido: <b>{tipoLbl}</b>.
                </div>
              )}
              {!imp.requiereAnexo&&imp.posibleCambioLugar&&(
                <div style={{marginTop:10,fontSize:12,color:C.textMuted,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px'}}>
                  Posible cambio de lugar de prestación (confirmar). No dispara anexo por sí solo.
                </div>
              )}
              {imp.sinFinanciamiento&&(
                <div style={{marginTop:10,fontSize:12,fontWeight:600,color:'#991b1b',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'8px 10px'}}>
                  ⚠ El trabajador quedará <b>activo sin financiamiento remuneracional</b>.
                </div>
              )}

              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16,flexWrap:'wrap'}}>
                <button onClick={cerrar} style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12,fontWeight:600,color:C.text}}>Cancelar</button>
                {imp.requiereAnexo?(<>
                  <button disabled={!retiroModal.fecha} onClick={()=>ejecutar(false)} style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:retiroModal.fecha?'pointer':'not-allowed',opacity:retiroModal.fecha?1:0.5,fontSize:12,fontWeight:600,color:C.text}}>Terminar sin anexo</button>
                  <button disabled={!retiroModal.fecha} onClick={()=>ejecutar(true)} style={{padding:'9px 16px',borderRadius:6,border:'none',background:'#b45309',color:'#fff',cursor:retiroModal.fecha?'pointer':'not-allowed',opacity:retiroModal.fecha?1:0.5,fontSize:12,fontWeight:700}}>Terminar y generar anexo</button>
                </>):(
                  <button disabled={!retiroModal.fecha} onClick={()=>ejecutar(false)} style={{padding:'9px 16px',borderRadius:6,border:'none',background:C.accent,color:'#fff',cursor:retiroModal.fecha?'pointer':'not-allowed',opacity:retiroModal.fecha?1:0.5,fontSize:12,fontWeight:700}}>Terminar asignación</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {movilidadModal&&form&&(()=>{
        const o=movilidadModal.origen, d=movilidadModal.destino;
        const activas=(data.asignaciones||[]).filter(x=>x.trabajador_id===form.id&&x.estado_asig==='activa'&&x.activo!==false);
        const restantes=activas.filter(x=>!(x.contrato_id===o.contrato_id&&x.trabajador_id===o.trabajador_id));
        const destinoAsig={contrato_id:d.contrato_id, trabajador_id:form.id, estado_asig:'activa', activo:true, afecta_remuneracion:d.afecta_remuneracion!==false, sueldo_asignado:Number(d.sueldo_asignado)||0, porcentaje_costo:Number(d.porcentaje_costo)||0, horas_semanales:Number(d.horas_semanales)||0, jornada:d.jornada, horario:d.horario, dias_semana:d.dias_semana, bono_asistencia:Number(d.bono_asistencia)||0, bono_movilizacion:Number(d.bono_movilizacion)||0, bono_colacion:Number(d.bono_colacion)||0, gratificacion_monto:Number(d.gratificacion_monto)||0, descripcion:d.descripcion};
        const antes=construirCondicionLaboral(activas,data.contratos);
        const despues=construirCondicionLaboral([...restantes,destinoAsig],data.contratos);
        const imp=calcularImpactoLaboral(antes,despues);
        const tipoLbl=(TIPOS_ANEXO.find(x=>x.val===imp.tipoAnexoSugerido)||{}).label||imp.tipoAnexoSugerido;
        const cerrar=()=>setMovilidadModal(null);
        const valido=!!(d.contrato_id&&movilidadModal.fechaSalida&&movilidadModal.fechaEntrada);
        const setD=(p)=>setMovilidadModal({...movilidadModal,destino:{...movilidadModal.destino,...p}});
        const ejecutar=async(conAnexo)=>{
          if(!valido)return;
          const usaAnexo=conAnexo&&imp.requiereAnexo;
          pendingAnexoHandoff={ trabajadorId:form.id, tab:usaAnexo?'anexos':'asignaciones', waitForContratoId:d.contrato_id,
            prefill: usaAnexo?{
              tipo_anexo: imp.tipoAnexoSugerido||'',
              motivo:`Movilidad interna: ${o.contrato_id} → ${d.contrato_id}`,
              sueldo_anterior:antes.remuneracion, sueldo_nuevo:despues.remuneracion,
              jornada_anterior:`${antes.horasSemanales} h/sem`, jornada_nueva:`${despues.horasSemanales} h/sem`,
              centro_anterior:o.contrato_id, centro_nuevo:d.contrato_id,
              porcentaje_anterior:antes.pctFinanciado, porcentaje_nuevo:despues.pctFinanciado,
            }:undefined };
          setMovilidadModal(null); setAsigForm(null);
          await terminarAsignacion(o, movilidadModal.fechaSalida);
          await saveAsignacion({...destinoAsig, fecha_inicio_asig:movilidadModal.fechaEntrada, fecha_termino_asig:null});
        };
        const Row=({l,v})=>(<div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}><span style={{color:C.textMuted}}>{l}</span><span style={{fontWeight:600,color:C.text}}>{v}</span></div>);
        const otrosContratos=(data.contratos||[]).filter(c=>c.id!==o.contrato_id);
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}} onClick={cerrar}>
            <div style={{background:'#fff',borderRadius:10,padding:22,maxWidth:600,width:'100%',maxHeight:'92vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:'0 0 4px',fontSize:16,color:C.text}}>Mover a otro centro</h3>
              <p style={{fontSize:12,color:C.textMuted,marginBottom:14}}>{form.nombre} · movilidad interna. <b>No</b> es desvinculación: el trabajador sigue activo, sin finiquito ni carta.</p>

              <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>
                <b>Origen:</b> {o.contrato_id}{(data.contratos||[]).find(c=>c.id===o.contrato_id)?.cliente?` — ${(data.contratos||[]).find(c=>c.id===o.contrato_id).cliente}`:''}
              </div>

              <FL label="Centro destino"><select style={INP} value={d.contrato_id} onChange={e=>setD({contrato_id:e.target.value})}><option value="">— selecciona —</option>{otrosContratos.map(c=><option key={c.id} value={c.id}>{c.id}{c.cliente?` — ${c.cliente}`:''}</option>)}</select></FL>
              <div style={{display:'flex',gap:10,marginTop:8}}>
                <div style={{flex:1}}><FL label="Fecha salida origen"><FechaInput value={movilidadModal.fechaSalida} onChange={v=>setMovilidadModal({...movilidadModal,fechaSalida:v})} style={INP}/></FL></div>
                <div style={{flex:1}}><FL label="Fecha entrada destino"><FechaInput value={movilidadModal.fechaEntrada} onChange={v=>setMovilidadModal({...movilidadModal,fechaEntrada:v})} style={INP}/></FL></div>
              </div>

              <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:'uppercase',letterSpacing:0.4,margin:'14px 0 6px'}}>Condiciones en el destino</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <FL label="Costo imputado (calculado)"><input type="text" style={{...INP,background:'#f9fafb',cursor:'not-allowed',color:C.textMuted}} value={clp(Math.round((form.sueldo_base||0)*(Number(d.porcentaje_costo)||0)/100))} readOnly title="Se calcula: sueldo base × porcentaje de imputación. No editable."/></FL>
                <FL label="% costo"><input type="number" min={0} max={500} style={INP} value={d.porcentaje_costo} onChange={e=>setD({porcentaje_costo:Number(e.target.value)})}/></FL>
                <FL label="Horas semanales"><input type="number" style={INP} value={d.horas_semanales} onChange={e=>setD({horas_semanales:Number(e.target.value)})}/></FL>
                <FL label="Días semana"><input style={INP} value={d.dias_semana} onChange={e=>setD({dias_semana:e.target.value})}/></FL>
                <FL label="Jornada"><input style={INP} value={d.jornada} onChange={e=>setD({jornada:e.target.value})}/></FL>
                <FL label="Horario"><input style={INP} value={d.horario} onChange={e=>setD({horario:e.target.value})}/></FL>
              </div>
              <div style={{marginTop:8}}><FL label="Descripción / funciones"><input style={INP} value={d.descripcion} onChange={e=>setD({descripcion:e.target.value})}/></FL></div>

              <div style={{marginTop:14,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:'uppercase',letterSpacing:0.4,marginBottom:6}}>Impacto laboral calculado</div>
                <Row l="Remuneración imputada" v={`$${clp(antes.remuneracion)} → $${clp(despues.remuneracion)}`}/>
                <Row l="% financiado" v={`${antes.pctFinanciado}% → ${despues.pctFinanciado}%`}/>
                <Row l="Jornada (h/sem)" v={`${antes.horasSemanales} → ${despues.horasSemanales}`}/>
                <Row l="Centro" v={`${o.contrato_id} → ${d.contrato_id||'(destino)'}`}/>
              </div>
              {imp.requiereAnexo&&(<div style={{marginTop:10,fontSize:12,color:'#9a3412',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:6,padding:'8px 10px'}}>⚠ Cambian condiciones laborales → corresponde <b>anexo</b>. Tipo sugerido: <b>{tipoLbl}</b>.</div>)}
              {!imp.requiereAnexo&&imp.posibleCambioLugar&&(<div style={{marginTop:10,fontSize:12,color:C.textMuted,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px'}}>Solo cambia el centro/imputación (posible cambio de lugar a confirmar). No dispara anexo por sí solo.</div>)}
              {imp.sinFinanciamiento&&(<div style={{marginTop:10,fontSize:12,fontWeight:600,color:'#991b1b',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'8px 10px'}}>⚠ Quedaría <b>sin financiamiento remuneracional</b>.</div>)}

              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16,flexWrap:'wrap'}}>
                <button onClick={cerrar} style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12,fontWeight:600,color:C.text}}>Cancelar</button>
                {imp.requiereAnexo?(<>
                  <button disabled={!valido} onClick={()=>ejecutar(false)} style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:valido?'pointer':'not-allowed',opacity:valido?1:0.5,fontSize:12,fontWeight:600,color:C.text}}>Mover sin anexo</button>
                  <button disabled={!valido} onClick={()=>ejecutar(true)} style={{padding:'9px 16px',borderRadius:6,border:'none',background:'#b45309',color:'#fff',cursor:valido?'pointer':'not-allowed',opacity:valido?1:0.5,fontSize:12,fontWeight:700}}>Mover y generar anexo</button>
                </>):(
                  <button disabled={!valido} onClick={()=>ejecutar(false)} style={{padding:'9px 16px',borderRadius:6,border:'none',background:C.accent,color:'#fff',cursor:valido?'pointer':'not-allowed',opacity:valido?1:0.5,fontSize:12,fontWeight:700}}>Mover trabajador</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {showDesvincular&&form&&(
        <DesvinculacionModal
          trabajador={form}
          data={data}
          update={update}
          insert={insert}
          terminarAsignacion={terminarAsignacion}
          onClose={(refresh, desv)=>{
            setShowDesvincular(false);
            if(desv&&desv._irAsignaciones){ setTab("asignaciones"); return; }
            if(refresh){
              if(desv) setForm(f=>f?{...f,...desv}:f);   // refleja el cambio en la ficha sin cerrarla
              if(desv&&desv._programado){
                setTab("documentos");                     // preaviso: invita a emitir la carta de aviso
                setAutoCarta(Date.now());                 // abre el generador de carta
              }else{
                setTab("documentos");                     // desvinculación inmediata: abre finiquito
                setAutoFiniquito(Date.now());
              }
            }
          }}
        />
      )}
      {preavisoAccion&&(()=>{
        const acc=preavisoAccion;
        const setAcc=o=>setPreavisoAccion({...acc,...o});
        const esCancelar=acc.tipo==='cancelar';
        const esAnticipada=acc.tipo==='anticipada';
        const motivoReq=esCancelar||esAnticipada;       // motivo obligatorio en cancelar y anticipada
        const motivoOk=!motivoReq||(acc.motivo||'').trim().length>0;
        const OVL={position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:16};
        const BOX={background:'#fff',borderRadius:12,padding:24,maxWidth:480,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'};
        const titulo=esCancelar?'✕ Cancelar preaviso':esAnticipada?'⏩ Finalización anticipada':'✅ Finalizar desvinculación';
        const onConfirm=()=>esCancelar?cancelarPreaviso(acc.pa,acc):finalizarPreaviso(acc.pa,acc);
        return (
          <div style={OVL} onClick={e=>e.target===e.currentTarget&&setPreavisoAccion(null)}>
            <div style={BOX}>
              <p style={{fontWeight:700,fontSize:15,color:esCancelar?C.text:'#991b1b',margin:'0 0 4px'}}>{titulo}</p>
              <p style={{fontSize:12,color:C.textMuted,margin:'0 0 14px'}}>{form?.nombre}</p>
              {esCancelar&&(
                <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:11,color:C.text}}>
                  El preaviso quedará <b>sin efecto</b>. El trabajador vuelve a <b>ACTIVO</b> y se borra la fecha de separación. Queda registrado en el historial con motivo y responsable.
                </div>
              )}
              {esAnticipada&&(
                <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:11,color:'#991b1b'}}>
                  ⚠ Finalizas <b>antes</b> de la fecha programada. El trabajador pasará a <b>DESVINCULADO hoy</b>, se cerrarán las asignaciones y se abrirá el finiquito. Acción irreversible.
                </div>
              )}
              {!esCancelar&&!esAnticipada&&(
                <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:11,color:'#991b1b'}}>
                  Llegó la fecha programada. El trabajador pasará a <b>DESVINCULADO</b>, se cerrarán las asignaciones y se abrirá el finiquito.
                </div>
              )}
              {motivoReq&&(
                <FL label={esCancelar?'Motivo de la cancelación (obligatorio)':'Motivo de la finalización anticipada (obligatorio)'}>
                  <textarea style={{...INP,height:64,resize:'vertical',fontFamily:'inherit'}} value={acc.motivo||''} onChange={e=>setAcc({motivo:e.target.value})} placeholder={esCancelar?'Ej: trabajador reasignado / mandante revierte solicitud / contrato renovado / error de fecha / acuerdo interno.':'Ej: salida anticipada negociada con el trabajador.'}/>
                </FL>
              )}
              {esAnticipada&&(<>
                <div style={{height:10}}/>
                <FL label="¿Se paga sustitutiva o existe acuerdo? (opcional)">
                  <input style={INP} value={acc.sustitutiva_acuerdo||''} onChange={e=>setAcc({sustitutiva_acuerdo:e.target.value})} placeholder="Ej: se paga sustitutiva de 1 mes / acuerdo de salida sin sustitutiva."/>
                </FL>
              </>)}
              <div style={{height:10}}/>
              <FL label="Responsable"><input style={INP} value={acc.responsable||''} onChange={e=>setAcc({responsable:e.target.value})} placeholder="Nombre de quien autoriza"/></FL>
              {!esCancelar&&(<>
                <div style={{height:10}}/>
                <FL label="Observación (opcional)"><input style={INP} value={acc.observaciones||''} onChange={e=>setAcc({observaciones:e.target.value})} placeholder="Nota interna"/></FL>
              </>)}
              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
                <button onClick={()=>setPreavisoAccion(null)} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',cursor:'pointer',fontSize:12}}>Volver</button>
                <button onClick={onConfirm} disabled={!motivoOk}
                  style={{padding:'8px 18px',borderRadius:6,border:'none',background:motivoOk?(esCancelar?'#6b7280':'#dc2626'):'#e5e7eb',color:motivoOk?'#fff':C.textMuted,cursor:motivoOk?'pointer':'not-allowed',fontSize:13,fontWeight:700}}>
                  {esCancelar?'Cancelar preaviso':esAnticipada?'Finalizar anticipadamente':'Finalizar desvinculación'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <PageHeader title="Trabajadores" subtitle={contratoId ? `${trabajadoresFiltrados.filter(t=>t.activo).length} asignados` : `${data.trabajadores.filter(t=>t.activo).length} activos`} action={<PrimaryBtn onClick={openNew}>+ Nuevo trabajador</PrimaryBtn>}/>
      {form&&(
        <div style={{background:C.surface,border:`1px solid ${C.accent}`,borderRadius:8,padding:20,marginBottom:16,boxShadow:`0 0 0 3px ${C.accent}14`}}>
          {(()=>{
            const pa=preavisoActivo(form.id, data);
            const estado=(form.activo===false||form.estado==='DESVINCULADO')?{t:'Desvinculado',c:'#6b7280',bg:'#f3f4f6'}
              :(form.estado==='PREAVISO'||pa)?{t:'Preaviso',c:'#1e40af',bg:'#eff6ff'}
              :{t:'Activo',c:'#166534',bg:'#f0fdf4'};
            const asigs=(data.asignaciones||[]).filter(a=>a.trabajador_id===form.id&&a.activo!==false&&a.estado_asig!=='terminada');
            const contratosTxt=asigs.length?asigs.map(a=>{
              const c=(data.contratos||[]).find(x=>x.id===a.contrato_id);
              if(!c) return a.contrato_id||'—';
              const tipoL=(TIPO_CENTRO_TAG[c.tipo_centro_costo||'LICITACION']||{}).label||'';
              const cli=(c.cliente&&c.cliente.trim()&&c.cliente.trim().toLowerCase()!=='por definir')?` · ${c.cliente}`:'';
              return `${c.id}${tipoL?` — ${tipoL}`:''}${cli}`;
            }).join(' + '):'Sin asignación activa';
            const costoImputado=asigs.filter(isAsignacionRemuneracional).reduce((s,a)=>s+(Number(a.sueldo_asignado)>0?Number(a.sueldo_asignado):Math.round((form.sueldo_base||0)*(Number(a.porcentaje_costo)||0)/100)),0);
            const tabLabel={datos:'Datos personales',remuneracion:'Remuneración',asignaciones:'Asignaciones',anexos:'Anexos',documentos:'Documentos',expediente:'Expediente'}[tab]||'';
            return (
              <div style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:8}}>
                  <button onClick={()=>{setForm(null);setTab('datos');}} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer',color:C.text,fontWeight:600}}>← Volver a Trabajadores</button>
                  <span style={{fontSize:11,color:C.textMuted}}>Trabajadores › <b style={{color:C.text}}>{isNew?'Nuevo trabajador':(form.nombre||form.id)}</b>{tabLabel?` › ${tabLabel}`:''}</span>
                </div>
                {!isNew&&(
                  <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 14px'}}>
                    <span style={{fontWeight:700,fontSize:14,color:C.text}}>{form.nombre||form.id}</span>
                    {form.rut&&<span style={{fontSize:12,color:C.textMuted}}>{form.rut}</span>}
                    <span style={{background:estado.bg,color:estado.c,border:`1px solid ${estado.c}33`,borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:600}}>{estado.t}</span>
                    <span style={{fontSize:12,color:C.textMuted}}>📋 {contratosTxt}</span>
                    {costoImputado>0&&<span style={{fontSize:12,color:C.textMuted}}>Monto asociado en asignaciones: <b style={{color:C.text}}>{clp(costoImputado)}</b></span>}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{display:"flex",gap:8,marginBottom:16,borderBottom:`1px solid ${C.borderLight}`,paddingBottom:12}}>
            {["datos","remuneracion","asignaciones","anexos","documentos","expediente"].map(t=><button key={t} onClick={()=>setTab(t)} style={{background:tab===t?C.accent:"transparent",color:tab===t?"#fff":C.textMuted,border:`1px solid ${tab===t?C.accent:C.border}`,borderRadius:6,padding:"5px 14px",fontSize:12,cursor:"pointer",fontWeight:tab===t?600:400}}>{t==="datos"?"Datos personales":t==="remuneracion"?"Remuneración":t==="asignaciones"?"Asignaciones":t==="anexos"?"Anexos":t==="documentos"?"Documentos":"Expediente"}</button>)}
          </div>
          {tab==="datos"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <FL label="Nombre completo"><input style={INP} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre Apellido Apellido"/></FL>
              <FL label="RUT"><input style={INP} value={form.rut||""} onChange={e=>setForm({...form,rut:e.target.value})} placeholder="12.345.678-9"/></FL>
              <FL label="Cargo"><select style={INP} value={form.cargo} onChange={e=>setForm({...form,cargo:e.target.value})}><option>Auxiliar Aseo</option><option>Supervisor</option><option>Supervisora</option><option>Jefe de Turno</option></select></FL>
              <FL label="Tipo contrato"><select style={INP} value={form.tipo_contrato||"PLAZO FIJO"} onChange={e=>setForm({...form,tipo_contrato:e.target.value})}><option>PLAZO FIJO</option><option>INDEFINIDO</option><option>HONORARIOS</option></select></FL>
              <FL label="Fecha ingreso a la empresa"><input type="date" style={INP} value={form.fecha_inicio||""} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/></FL>
              {form.tipo_contrato==="PLAZO FIJO" && <FL label="Fecha término (plazo fijo)"><input type="date" style={INP} value={form.fecha_termino_plazo||""} onChange={e=>setForm({...form,fecha_termino_plazo:e.target.value||null})}/></FL>}
              <FL label="Nacionalidad"><input style={INP} value={form.nacionalidad||""} onChange={e=>setForm({...form,nacionalidad:e.target.value})} placeholder="Chilena"/></FL>
              <FL label="Fecha de nacimiento"><input type="date" style={INP} value={form.fecha_nacimiento||""} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value||null})}/></FL>
              <FL label="Estado civil"><select style={INP} value={form.estado_civil||""} onChange={e=>setForm({...form,estado_civil:e.target.value})}><option value="">—</option><option>Soltero(a)</option><option>Casado(a)</option><option>Viudo(a)</option><option>Divorciado(a)</option><option>Separado(a) judicialmente</option><option>Conviviente civil</option></select></FL>
              <FL label="Teléfono"><input style={INP} value={form.telefono} onChange={e=>setForm({...form,telefono:e.target.value})} placeholder="+569XXXXXXXX"/></FL>
              <FL label="Email"><input style={INP} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="correo@empresa.cl"/></FL>
              <div style={{gridColumn:"1 / -1"}}>
                <FL label="Domicilio / dirección (calle, número, depto — usado en el contrato y la carta certificada)"><input style={INP} value={form.domicilio||""} onChange={e=>setForm({...form,domicilio:e.target.value})} placeholder="Calle, número, depto/villa"/></FL>
              </div>
              <FL label="Ciudad / comuna"><input style={INP} value={form.ciudad||""} onChange={e=>setForm({...form,ciudad:e.target.value})} placeholder="Arica"/></FL>
              <FL label="Región"><input style={INP} value={form.region||""} onChange={e=>setForm({...form,region:e.target.value})} placeholder="Arica y Parinacota"/></FL>
              <FL label="Correo para notificaciones laborales"><input style={INP} value={form.correo_notificaciones||""} onChange={e=>setForm({...form,correo_notificaciones:e.target.value})} placeholder="correo donde recibe avisos laborales"/></FL>
              <FL label="Autoriza comunicaciones electrónicas">
                <select style={INP} value={form.autoriza_com_electronica?"si":"no"} onChange={e=>setForm({...form,autoriza_com_electronica:e.target.value==="si"})}>
                  <option value="no">No</option><option value="si">Sí</option>
                </select>
              </FL>
              {/* Datos de egreso (fecha de separación, causal, finiquito) viven en el proceso de desvinculación, no en la ficha del trabajador. */}
              {/* Resumen de finiquito/motivo: ahora se consulta en el proceso de desvinculación y el expediente de egreso. */}
              {/* Preaviso activo (Art. 161 programado) — gestión */}
              {!isNew&&form&&(()=>{
                const pa=preavisoActivo(form.id, data);
                if(!pa) return null;
                const cp=calcPreaviso(pa.fecha_separacion);
                const cumplido=cp&&cp.estado==='cumplido';
                return (
                  <div style={{gridColumn:'1/-1',marginTop:8,background:cp?cp.sem.bg:'#eff6ff',border:`1px solid ${cumplido?'#ddd6fe':'#bfdbfe'}`,borderRadius:8,padding:'12px 14px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                      <span style={{fontWeight:700,fontSize:13,color:cp?cp.sem.text:'#1e40af'}}>📅 Desvinculación programada (PREAVISO)</span>
                      <span style={{fontWeight:700,fontSize:13,color:cp?cp.sem.text:'#1e40af'}}>{cp?(cumplido?`${cp.sem.icon} Fecha cumplida`:`${cp.sem.icon} faltan ${cp.diasRest} día(s)`):''}</span>
                    </div>
                    <div style={{fontSize:11,color:C.textMuted,marginBottom:10,display:'flex',gap:14,flexWrap:'wrap'}}>
                      <span>Carta: <b>{dateOnly(pa.fecha_carta)?new Date(pa.fecha_carta.split('T')[0]+'T12:00:00').toLocaleDateString('es-CL'):'—'}</b></span>
                      <span>Separación: <b>{cp?cp.fmtFin:'—'}</b></span>
                      <span>Sustitutiva: <b style={{color:pa.sustitutiva?'#991b1b':'#166534'}}>{pa.sustitutiva?'Sí':'No'}</b></span>
                    </div>
                    <p style={{fontSize:11,color:C.text,marginBottom:10}}>El trabajador sigue <b>activo</b> hasta la fecha. La finalización es <b>manual</b>.</p>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {cumplido
                        ? <button onClick={()=>setPreavisoAccion({tipo:'finalizar',pa,responsable:responsableDefault})} style={{padding:'8px 14px',borderRadius:6,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>✅ Finalizar desvinculación</button>
                        : <button onClick={()=>setPreavisoAccion({tipo:'anticipada',pa,responsable:responsableDefault})} style={{padding:'8px 14px',borderRadius:6,border:'1px solid #dc2626',background:'transparent',color:'#dc2626',cursor:'pointer',fontSize:12,fontWeight:600}}>⏩ Finalización anticipada</button>}
                      <button onClick={()=>setPreavisoAccion({tipo:'cancelar',pa,responsable:responsableDefault})} style={{padding:'8px 14px',borderRadius:6,border:`1px solid ${C.border}`,background:C.surface,color:C.text,cursor:'pointer',fontSize:12,fontWeight:600}}>✕ Cancelar preaviso</button>
                    </div>
                  </div>
                );
              })()}
              {/* Botón Desvincular — solo para trabajadores activos SIN preaviso en curso */}
              {form.activo!==false&&!isNew&&!preavisoActivo(form.id,data)&&(
                <div style={{gridColumn:'1/-1',marginTop:8}}>
                  <button onClick={()=>setShowDesvincular(true)}
                    style={{width:'100%',padding:'10px 0',borderRadius:8,border:'2px solid #dc2626',background:'transparent',color:'#dc2626',cursor:'pointer',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    🚨 Iniciar proceso de desvinculación
                  </button>
                  <p style={{fontSize:10,color:C.textMuted,textAlign:'center',marginTop:4}}>
                    Inmediata (finiquito al instante) o programada (Art. 161 con fecha futura → preaviso)
                  </p>
                </div>
              )}
            </div>
          )}
          {tab==="remuneracion"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <FL label="Sueldo base ($)"><input type="number" style={INP} value={form.sueldo_base||0} onChange={e=>setForm({...form,sueldo_base:Number(e.target.value)})}/></FL>
              <FL label="Método gratificación">
                <select style={INP} value={form.metodo_gratificacion||"25% MENSUAL"} onChange={e=>setForm({...form,metodo_gratificacion:e.target.value})}>
                  <option value="25% MENSUAL">25% mensual (tope legal IMM)</option>
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
            {(()=>{
              const today=new Date().toISOString().slice(0,10);
              const fechaContrato=dateOnly(form.fecha_inicio)||""; // NUNCA cae a hoy: la vigencia jurídica exige fecha real.
              // J1.1: la fuente es la cláusula jornada del CONTRATO LABORAL ORIGINAL (acto), no una columna.
              const clausulas=Array.isArray(form.clausulas_contrato_original)?form.clausulas_contrato_original:[];
              const cJor=clausulas.find(c=>c&&c.clausula==="jornada")||null;
              const jp=cJor?cJor.contenido:null;
              // vigencia_desde = la del acto si ya existe, o la fecha real del contrato. JAMÁS hoy.
              const vigDesde=(cJor&&cJor.vigencia_desde)||fechaContrato;
              // Sin fecha de inicio real no se permite estructurar (evita guardar la fecha de captura como vigencia jurídica).
              if(!fechaContrato && !cJor){
                return (
                  <div style={{gridColumn:"1 / -1",marginTop:14,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>Jornada del contrato laboral original</div>
                    <div style={{fontSize:12,color:"#b45309"}}>Ingrese la fecha de inicio del contrato antes de estructurar la jornada. La vigencia jurídica de la jornada debe ser la fecha real del contrato, no la fecha de captura.</div>
                  </div>
                );
              }
              const base=jp?{...jp,vigencia_desde:vigDesde}:{tipo:"ordinaria",dias:[],hora_inicio:"",hora_termino:"",colacion_minutos:60,colacion_imputable:false,horas_semanales:"",vigencia_desde:vigDesde,observaciones:""};
              const upd=(patch)=>{ const njp={...base,...patch}; const g=jornadaATexto(njp);
                // Cláusula del contrato original: captura técnica de un acto que ya existía (NO crea acto nuevo).
                const clausula={clausula:"jornada",acto_tipo:"contrato_original",acto_id:form.id||null,
                  vigencia_desde:(njp.vigencia_desde||fechaContrato||null),vigencia_hasta:null,
                  efecto:"establece_total",componente_id:"base",regla_legal:"jornada_ordinaria",
                  contenido:njp,captura_tecnica:new Date().toISOString()};
                const otras=clausulas.filter(c=>!(c&&c.clausula==="jornada"));
                setForm({...form,clausulas_contrato_original:[clausula,...otras],
                  jornada:[g.jornada,g.horario].filter(Boolean).join(" ")||form.jornada,horario:g.horario||form.horario}); };
              const toggleDia=(d)=>{ const ds=new Set(base.dias||[]); ds.has(d)?ds.delete(d):ds.add(d); upd({dias:[...ds]}); };
              const val=jp?validarJornada({...base}):{ok:true,errores:[],aviso:""};
              const prev=jornadaATexto(base);
              const tope=topeLegalJornada(base.vigencia_desde);
              return (
                <div style={{gridColumn:"1 / -1",marginTop:14,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Jornada del contrato laboral original (estructurada)</div>
                  {!jp&&<div style={{fontSize:12,color:C.textMuted,marginBottom:8}}>Jornada sin estructurar. Capture la cláusula del contrato original ya existente (no crea un acto nuevo; la vigencia es la fecha real del contrato). El cálculo legal exige esta estructura. Tope legal vigente: {tope} h/sem.</div>}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <FL label="Tipo"><select style={INP} value={base.tipo} onChange={e=>upd({tipo:e.target.value})}>
                      <option value="ordinaria">Ordinaria</option><option value="parcial">Parcial</option>
                      <option value="bisemanal">Bisemanal</option><option value="otra">Otra</option>
                    </select></FL>
                    <FL label={`Horas semanales (tope ${tope})`}><input type="number" min={0} style={INP} value={base.horas_semanales} onChange={e=>upd({horas_semanales:e.target.value===""?"":Number(e.target.value)})}/></FL>
                    <FL label="Hora inicio"><input type="time" style={INP} value={base.hora_inicio||""} onChange={e=>upd({hora_inicio:e.target.value})}/></FL>
                    <FL label="Hora término"><input type="time" style={INP} value={base.hora_termino||""} onChange={e=>upd({hora_termino:e.target.value})}/></FL>
                    <FL label="Colación (min)"><input type="number" min={0} style={INP} value={base.colacion_minutos} onChange={e=>upd({colacion_minutos:e.target.value===""?"":Number(e.target.value)})}/></FL>
                    <FL label="Vigencia desde (fecha real del contrato)"><input type="date" style={INP} value={base.vigencia_desde||""} onChange={e=>upd({vigencia_desde:e.target.value})}/></FL>
                  </div>
                  <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:11,color:C.textMuted}}>Días:</span>
                    {J1_DIAS_ORDEN.map(d=>(
                      <button key={d} type="button" onClick={()=>toggleDia(d)} style={{padding:"3px 9px",borderRadius:6,fontSize:11,cursor:"pointer",border:`1px solid ${C.border}`,background:(base.dias||[]).includes(d)?C.accent:C.surface,color:(base.dias||[]).includes(d)?C.accentText:C.text}}>{J1_DIAS[d].slice(0,3)}</button>
                    ))}
                    <label style={{fontSize:11,color:C.textMuted,marginLeft:10,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                      <input type="checkbox" checked={!!base.colacion_imputable} onChange={e=>upd({colacion_imputable:e.target.checked})}/>Colación imputable
                    </label>
                  </div>
                  <div style={{marginTop:8}}><FL label="Observaciones"><input style={INP} value={base.observaciones||""} onChange={e=>upd({observaciones:e.target.value})}/></FL></div>
                  <div style={{marginTop:8,padding:"8px 10px",background:C.surface,border:`1px dashed ${C.border}`,borderRadius:6}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:3}}>Vista previa · texto generado para el contrato</div>
                    <div style={{fontSize:12,color:C.text}}>{[prev.jornada,prev.horario].filter(Boolean).join(" ")||"—"}</div>
                  </div>
                  {jp&&!val.ok&&val.errores.map((er,i)=>(<div key={i} style={{marginTop:6,fontSize:11,color:C.red}}>⚠ {er}</div>))}
                  {jp&&val.ok&&val.aviso&&<div style={{marginTop:6,fontSize:11,color:"#b45309"}}>ℹ {val.aviso}</div>}
                </div>
              );
            })()}
            </div>
          )}
          {tab==="asignaciones"&&(
            <div style={{marginBottom:12}}>
              {isNew?
                <AlertBanner type="warning" message="Primero crea el trabajador. Luego podrás asignarlo a uno o más centros de costo sin usar SQL."/>
              :<>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:12}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 12px",fontSize:12,color:C.text,fontWeight:600}}>
                      Total monto base asociado en asignaciones activas: {clp(montoAsociadoTotal)}
                      <div style={{fontSize:10,fontWeight:400,color:C.textMuted,marginTop:2}}>Dato referencial. No representa liquidación final ni costo empresa.</div>
                    </div>
                    {asignacionesOperacionalesActivas.length>0&&(<div style={{background:C.accentBg,border:`1px solid #bfdbfe`,borderRadius:7,padding:"8px 12px",fontSize:12,color:C.accentText,fontWeight:600}}>
                      👁 {asignacionesOperacionalesActivas.length} asignación(es) operacional(es), no afectan remuneración
                    </div>)}
                  </div>
                  <PrimaryBtn onClick={openNuevaAsignacion} small>+ Nueva asignación</PrimaryBtn>
                </div>

                {asignacionesOperacionalesActivas.length>0&&(<div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px",fontSize:11,color:C.textMuted,marginBottom:12}}>
                  Modelo aplicado: los supervisores pueden tener varios centros operacionales para control y fiscalización. Solo las asignaciones marcadas como <b>remuneracionales</b> financian sueldo, bonos y liquidación.
                </div>)}

                {asigForm&&(<div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:14,marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <FL label="Centro de costo">
                      <select style={INP} value={asigForm.contrato_id||""} disabled={!!asigForm._edit} onChange={e=>setAsigForm({...asigForm,contrato_id:e.target.value})}>
                        <option value="">— Seleccionar —</option>
                        {(data.contratos||[]).map(c=><option key={c.id} value={c.id}>{c.id} — {c.cliente}</option>)}
                      </select>
                    </FL>
                    <FL label="Estado asignación"><select style={INP} value={asigForm.estado_asig||"activa"} onChange={e=>setAsigForm({...asigForm,estado_asig:e.target.value,activo:e.target.value!=="terminada"})}><option value="activa">Activa</option><option value="terminada">Terminada</option><option value="suspendida">Suspendida</option></select></FL>
                    <FL label="Monto asociado al trabajador en esta asignación ($)">
                      <input type="number" min={0} disabled={asigForm.modalidad_cobertura==="holgura_remunerada"} style={{...INP,...(asigForm.modalidad_cobertura==="holgura_remunerada"?{background:'#f3f4f6',cursor:'not-allowed',color:C.textMuted}:{})}} value={(asigForm.sueldo_asignado===null||asigForm.sueldo_asignado===undefined||asigForm.sueldo_asignado==="")?"":asigForm.sueldo_asignado} placeholder="Ej: 100000" onChange={e=>{const raw=e.target.value;const m=raw===""?"":Number(raw);setAsigForm({...asigForm,sueldo_asignado:m,porcentaje_costo:(form.sueldo_base>0&&raw!==""?Math.round(Number(raw)/form.sueldo_base*10000)/100:0)});}} title="Remuneración/componentes asociados a esta asignación para este trabajador. No es el ingreso del contrato."/>
                      {form.sueldo_base>0&&Number(asigForm.sueldo_asignado)>0&&<div style={{fontSize:10,color:C.textMuted,marginTop:3}}>≈ {fmtPct(Number(asigForm.sueldo_asignado)/form.sueldo_base*100)} del sueldo base (dato auxiliar)</div>}
                    </FL>
                    <FL label="Modalidad de cobertura (opcional)"><select style={INP} value={asigForm.modalidad_cobertura||""} onChange={e=>{const val=e.target.value||null;const patch={modalidad_cobertura:val};if(val==="holgura_remunerada"){patch.sueldo_asignado="";patch.bono_movilizacion="";patch.bono_colacion="";patch.bono_asistencia="";patch.gratificacion_metodo_asig="no_aplica";patch.gratificacion_monto="";patch.gratificacion_porcentaje_asig="";patch.gratificacion_observacion_asig="";patch.porcentaje_costo=0;}setAsigForm({...asigForm,...patch});}}><option value="">— Seleccionar modalidad —</option><option value="exclusivo">Trabajador exclusivo de la asignación</option><option value="reasignacion_parcial">Reasignación parcial dentro de jornada</option><option value="holgura_remunerada">Uso de holgura horaria ya remunerada</option><option value="pago_adicional">Pago adicional por nueva asignación</option><option value="horas_extra">Horas extra autorizadas</option><option value="volante_reemplazo">Trabajador volante / reemplazo</option></select>{asigForm.modalidad_cobertura==="holgura_remunerada"&&<div style={{fontSize:11,color:C.textMuted,marginTop:4,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 8px"}}>Esta modalidad no agrega nuevos haberes a la liquidación. Solo registra cobertura operativa usando jornada ya remunerada.</div>}</FL>
                    <FL label="Origen del trabajador (opcional)"><select style={INP} value={asigForm.origen_trabajador||""} onChange={e=>setAsigForm({...asigForm,origen_trabajador:e.target.value||null})}><option value="">— Seleccionar origen —</option><option value="nuevo">Nuevo en la empresa (requiere contrato)</option><option value="existente_holgura">Existente con holgura (posible anexo)</option><option value="sin_holgura">Existente sin holgura (hora extra / pacto / revisión)</option></select></FL>
                    <FL label="Movilización ($)"><input disabled={asigForm.modalidad_cobertura==="holgura_remunerada"} style={{...INP,...(asigForm.modalidad_cobertura==="holgura_remunerada"?{background:'#f3f4f6',cursor:'not-allowed',color:C.textMuted}:{})}} {...montoInputProps(asigForm.bono_movilizacion, v=>setAsigForm({...asigForm,bono_movilizacion:v}))}/></FL>
                    <FL label="Colación ($)"><input disabled={asigForm.modalidad_cobertura==="holgura_remunerada"} style={{...INP,...(asigForm.modalidad_cobertura==="holgura_remunerada"?{background:'#f3f4f6',cursor:'not-allowed',color:C.textMuted}:{})}} {...montoInputProps(asigForm.bono_colacion, v=>setAsigForm({...asigForm,bono_colacion:v}))}/></FL>
                    <FL label="Bono asistencia ($)"><input disabled={asigForm.modalidad_cobertura==="holgura_remunerada"} style={{...INP,...(asigForm.modalidad_cobertura==="holgura_remunerada"?{background:'#f3f4f6',cursor:'not-allowed',color:C.textMuted}:{})}} {...montoInputProps(asigForm.bono_asistencia, v=>setAsigForm({...asigForm,bono_asistencia:v}))}/></FL>
                    <FL label="Gratificación — método"><select disabled={asigForm.modalidad_cobertura==="holgura_remunerada"} style={{...INP,...(asigForm.modalidad_cobertura==="holgura_remunerada"?{background:'#f3f4f6',cursor:'not-allowed',color:C.textMuted}:{})}} value={asigForm.gratificacion_metodo_asig||""} onChange={e=>setAsigForm({...asigForm,gratificacion_metodo_asig:e.target.value||null})}><option value="">— Seleccionar método —</option><option value="heredar">Heredar desde Remuneración</option><option value="25_legal">25% legal proporcional</option><option value="anticipo_pct">Anticipo porcentaje</option><option value="anticipo_monto">Anticipo monto fijo</option><option value="monto_fijo">Monto fijo especial</option><option value="no_aplica">No aplica</option><option value="ajuste_especial">Ajuste especial con respaldo</option></select></FL>
                    {asigForm.gratificacion_metodo_asig==="anticipo_pct"&&<FL label="Gratificación — porcentaje (%)"><input style={INP} {...montoInputProps(asigForm.gratificacion_porcentaje_asig, v=>setAsigForm({...asigForm,gratificacion_porcentaje_asig:v}))} placeholder="Ej: 25"/></FL>}
                    {(asigForm.gratificacion_metodo_asig==="anticipo_monto"||asigForm.gratificacion_metodo_asig==="monto_fijo")&&<FL label="Gratificación — monto ($)"><input style={INP} {...montoInputProps(asigForm.gratificacion_monto, v=>setAsigForm({...asigForm,gratificacion_monto:v}))}/></FL>}
                    {asigForm.gratificacion_metodo_asig==="ajuste_especial"&&<FL label="Gratificación — observación / respaldo" span><input style={INP} value={asigForm.gratificacion_observacion_asig||""} onChange={e=>setAsigForm({...asigForm,gratificacion_observacion_asig:e.target.value})} placeholder="Respaldo del ajuste"/></FL>}
                    <FL label="Fecha inicio"><FechaInput value={dateOnly(asigForm.fecha_inicio_asig)} onChange={v=>setAsigForm({...asigForm,fecha_inicio_asig:v||null})}/></FL>
                    <FL label="Fecha término"><FechaInput value={dateOnly(asigForm.fecha_termino_asig)} onChange={v=>setAsigForm({...asigForm,fecha_termino_asig:v||null})}/></FL>
                    {(()=>{
                      const hParts=String(asigForm.horario||"").split("-");
                      const hIni=hParts[0]||""; const hFin=hParts[1]||"";
                      const durDec=horasANumero(asigForm.horas_semanales);
                      const durDisplay=asigForm._durRaw!==undefined?asigForm._durRaw:duracionATexto(durDec);
                      const jGen=(ini,fin)=>[asigForm.dias_semana||"",(ini||fin)?`${ini}-${fin}`:""].filter(Boolean).join(" ");
                      // inicio: recompone término desde la duración vigente (mantiene duración)
                      const onInicioBlur=(val)=>{const ini=fmtHoraOperativa(val);const fin=(ini&&durDec>0)?sumaHoraFin(ini,durDec):hFin;const nh=(ini||fin)?`${ini}-${fin}`:"";setAsigForm({...asigForm,horario:nh,jornada:jGen(ini,fin)});};
                      const onInicioChange=(val)=>{const ini=val.replace(/[^\d:]/g,"").slice(0,5);const nh=(ini||hFin)?`${ini}-${hFin}`:"";setAsigForm({...asigForm,horario:nh,jornada:jGen(ini,hFin)});};
                      // término: recalcula la duración
                      const onTerminoBlur=(val)=>{const fin=fmtHoraOperativa(val);const dur=(hIni&&fin)?difHorasDec(hIni,fin):durDec;const nh=(hIni||fin)?`${hIni}-${fin}`:"";setAsigForm({...asigForm,horario:nh,horas_semanales:dur,_durRaw:duracionATexto(dur),jornada:jGen(hIni,fin)});};
                      const onTerminoChange=(val)=>{const fin=val.replace(/[^\d:]/g,"").slice(0,5);const nh=(hIni||fin)?`${hIni}-${fin}`:"";setAsigForm({...asigForm,horario:nh,jornada:jGen(hIni,fin)});};
                      // duración: recalcula término (mantiene inicio)
                      const onDuracionBlur=(val)=>{const dec=parseDuracion(val);const fin=(hIni&&dec>0)?sumaHoraFin(hIni,dec):hFin;const nh=(hIni||fin)?`${hIni}-${fin}`:(asigForm.horario||"");setAsigForm({...asigForm,horas_semanales:dec,_durRaw:duracionATexto(dec),horario:nh,jornada:jGen(hIni,fin)});};
                      const diasSel=textoADiasOperativo(asigForm.dias_semana);
                      const toggleDia=(k)=>{const s=diasSel.includes(k)?diasSel.filter(x=>x!==k):[...diasSel,k];const txt=diasATextoOperativo(s);setAsigForm({...asigForm,dias_semana:txt,jornada:[txt,asigForm.horario||""].filter(Boolean).join(" ")});};
                      const jornadaGen=[asigForm.dias_semana||"",asigForm.horario||""].filter(Boolean).join(" ");
                      return (<>
                        <FL label="Hora inicio (operativa)"><input style={INP} value={hIni} inputMode="numeric" placeholder="escribe 0730 → 07:30" onChange={e=>onInicioChange(e.target.value)} onBlur={e=>onInicioBlur(e.target.value)}/></FL>
                        <FL label="Hora término (operativa)"><input style={INP} value={hFin} inputMode="numeric" placeholder="escribe 1700 → 17:00" onChange={e=>onTerminoChange(e.target.value)} onBlur={e=>onTerminoBlur(e.target.value)}/></FL>
                        <FL label="Duración de asignación para costeo operativo">
                          <input style={INP} value={durDisplay} placeholder="Ej: 01:15 ó 1,25" onChange={e=>setAsigForm({...asigForm,_durRaw:e.target.value})} onBlur={e=>onDuracionBlur(e.target.value)} title="Duración operativa para costeo. Se guarda como decimal. NO es la jornada legal (esa se toma del contrato estructurado)."/>
                          <div style={{fontSize:11,color:C.textMuted,marginTop:4}}>Ej: 00:30 = media hora, 01:15 = una hora y quince minutos.{durDec>0?` Se guarda como ${durDec} h.`:""}</div>
                        </FL>
                        <FL label="Días de asignación (operativo)" span>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {J2_DIAS.map(([k,lbl])=>(<button key={k} type="button" onClick={()=>toggleDia(k)} style={{padding:"5px 11px",borderRadius:6,fontSize:12,cursor:"pointer",border:`1px solid ${C.border}`,background:diasSel.includes(k)?C.accent:C.surface,color:diasSel.includes(k)?C.accentText:C.text}}>{lbl}</button>))}
                          </div>
                        </FL>
                        <FL label="Jornada (visual · generada)" span>
                          <input style={{...INP,background:'#f9fafb',cursor:'not-allowed',color:C.textMuted}} value={jornadaGen||"—"} readOnly/>
                          <div style={{fontSize:11,color:C.textMuted,marginTop:4}}>La jornada legal vigente se toma desde el contrato laboral estructurado. Este dato se usa solo para asignación/costeo operativo.</div>
                        </FL>
                      </>);
                    })()}
                    <FL label="Tipo de asignación"><select style={INP} value={asigForm.afecta_remuneracion===false?"no":"si"} onChange={e=>setAsigForm({...asigForm,afecta_remuneracion:e.target.value==="si"})}><option value="si">💰 Remuneracional: suma a liquidación</option><option value="no">👁 Operacional: supervisión/control, no suma</option></select></FL>
                    <FL label="Descripción" span><input style={INP} value={asigForm.descripcion||""} onChange={e=>setAsigForm({...asigForm,descripcion:e.target.value})} placeholder="Ej: Anexo reducción jornada / apoyo domingos / servicio eventual"/></FL>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:12}}>
                    <PrimaryBtn onClick={guardarAsignacion} color={C.green} small>{asigForm._edit?"Actualizar asignación":"Crear asignación"}</PrimaryBtn>
                    <SecondaryBtn onClick={()=>setAsigForm(null)} small>Cancelar</SecondaryBtn>
                  </div>
                </div>)}


                <div style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',marginBottom:10,fontSize:11,color:C.textMuted}}>
                    El margen se calculará en una etapa posterior, cuando el sistema consolide remuneraciones, leyes sociales, insumos, EPP, maquinaria, supervisión, traslados, garantías, factoring y otros costos. Los montos de esta pantalla son referenciales de la participación del trabajador, no una liquidación ni un costo empresa.
                  </div>

                <DataTable
                  cols={[
                    {key:"centro",label:"Centro",render:r=><span style={{fontWeight:600}}>{contratoNombre(r.contrato_id)}</span>},
                    {key:"estado",label:"Estado",render:r=><Tag text={r.estado_asig||"activa"} scheme={(r.estado_asig==="terminada"||r.activo===false)?{bg:"#f9fafb",text:C.textMuted,border:C.border}:{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>},
                    {key:"tipo",label:"Tipo",render:r=>r.modalidad_cobertura==="holgura_remunerada"?<Tag text="🕓 Cobertura con holgura" scheme={{bg:C.surfaceAlt,text:C.textMuted,border:C.border}}/>:isAsignacionRemuneracional(r)?<Tag text="💰 Remuneracional" scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>:<Tag text="👁 Operacional" scheme={{bg:C.accentBg,text:C.accentText,border:"#bfdbfe"}}/>},
                    {key:"sueldo",label:"Monto base asociado ($)",render:r=><span style={{fontVariantNumeric:"tabular-nums",color:isAsignacionRemuneracional(r)?C.text:C.textMuted}}>{isAsignacionRemuneracional(r)?clp(Number(r.sueldo_asignado)>0?Number(r.sueldo_asignado):Math.round((form.sueldo_base||0)*(Number(r.porcentaje_costo)||0)/100)):"—"}</span>},
                    {key:"pct",label:"≈ % sueldo base",render:r=>isAsignacionRemuneracional(r)?<span style={{fontSize:11,color:C.textMuted}}>≈ {fmtPct(r.porcentaje_costo||0)}</span>:<span style={{fontSize:11,color:C.textMuted}}>No aplica</span>},
                    {key:"bonos",label:"Bonos",render:r=><span style={{fontSize:12,color:C.textMuted}}>Mov {clp(r.bono_movilizacion)} · Col {clp(r.bono_colacion)}</span>},
                    {key:"fechas",label:"Vigencia",render:r=><span style={{fontSize:12,color:C.textMuted}}>{dateOnly(r.fecha_inicio_asig)||"—"}<br/>{r.fecha_termino_asig?`hasta ${dateOnly(r.fecha_termino_asig)}`:"vigente"}</span>},
                    {key:"jornada",label:"Jornada",render:r=><span style={{fontSize:12,color:C.textMuted}}>{r.jornada||r.horario||"—"}</span>},
                    {key:"acciones",label:"",render:r=><div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      <button onClick={()=>setAsigForm({...r,_edit:true,_original_contrato_id:r.contrato_id})} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>
                      {r.estado_asig!=="terminada"&&r.activo!==false&&<button onClick={()=>abrirMovilidad(r)} style={{color:"#0e7490",background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Mover</button>}
                      {r.estado_asig!=="terminada"&&r.activo!==false&&<button onClick={()=>terminarAsig(r)} style={{color:C.red,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Terminar</button>}
                    </div>},
                  ]}
                  rows={[...asignacionesTrab].sort((a,b)=>{
                    const termA=(a.estado_asig==="terminada"||a.activo===false)?1:0;
                    const termB=(b.estado_asig==="terminada"||b.activo===false)?1:0;
                    if(termA!==termB) return termA-termB;
                    const opA=isAsignacionOperacional(a)?1:0;
                    const opB=isAsignacionOperacional(b)?1:0;
                    if(opA!==opB) return opA-opB;
                    return String(a.contrato_id).localeCompare(String(b.contrato_id));
                  })}
                  empty="Este trabajador aún no tiene asignaciones"
                />
                <p style={{fontSize:11,color:C.textMuted,marginTop:10}}>El <b>monto base asociado</b> a una asignación es un valor referencial vinculado a la participación del trabajador en un contrato o centro de costo. No representa la liquidación final, el costo remuneracional completo ni el costo empresa. La remuneración real del mes se consolidará después en el módulo de Remuneraciones, sumando colación, movilización, gratificación, bonos, asistencia, anexos y demás reglas vigentes.</p>
              </>}
            </div>
          )}
          {tab==="anexos"&&form&&!isNew&&(
            <TabAnexos
              trabajador={form}
              data={data}
              insert={insert}
              update={update}
              saveAsignacion={saveAsignacion}
              setFormTrabajador={setForm}
              prefill={anexoPrefill}
              clearPrefill={()=>setAnexoPrefill(null)}
            />
          )}
          {tab==="anexos"&&isNew&&(
            <AlertBanner type="warning" message="Primero crea el trabajador. Luego podrás registrar anexos de contrato."/>
          )}
          {tab==="documentos"&&form&&!isNew&&(
            <TabDocumentos
              trabajador={form}
              data={data}
              insert={insert}
              update={update}
              autoFiniquito={autoFiniquito}
              autoCarta={autoCarta}
            />
          )}
          {tab==="documentos"&&isNew&&(
            <AlertBanner type="warning" message="Primero crea el trabajador. Luego podrás generar contrato, ODI, reglamento y registrar EPP."/>
          )}
          {tab==="expediente"&&form&&!isNew&&(
            <TabExpediente trabajador={form} data={data} update={update}/>
          )}
          {tab==="expediente"&&isNew&&(
            <AlertBanner type="warning" message="Primero crea el trabajador. El expediente consolida sus documentos una vez creado."/>
          )}
          {(tab==="datos"||tab==="remuneracion")&&(
          <div style={{display:"flex",gap:8,paddingTop:8,borderTop:`1px solid ${C.borderLight}`}}>
            <PrimaryBtn onClick={save} color={C.green}>{isNew?"Crear trabajador":"Actualizar"}</PrimaryBtn>
            <SecondaryBtn onClick={()=>setForm(null)}>Cancelar</SecondaryBtn>
          </div>
          )}
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
            {key:"edit",label:"",render:r=><button onClick={()=>{setTab("datos");setAsigForm(null);setForm({...r});}} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:500}}>Editar</button>},
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
function MotorOperacional({ contexto = {}, loading }) {
  const depId = contexto.depId;
  const canalOrigen = contexto.canal_origen || 'qr';
  const solicitante = contexto.solicitante || 'trabajador';
  const [fase, setFase] = useState('cargando'); // cargando|error|estado|acreditar|tipo|datos|antes|despues|listo
  const [errorMsg, setErrorMsg] = useState('');
  const [depInfo, setDepInfo] = useState(null);   // {dependencia, contrato, checklist}
  const [codigo, setCodigo] = useState('');
  const [acreditando, setAcreditando] = useState(false);
  const [acredError, setAcredError] = useState('');
  const [trabajador, setTrabajador] = useState(null); // {id, nombre}
  const [actividadId, setActividadId] = useState(null);
  const [pasada, setPasada] = useState(null);   // {n,m} numero/objetivo de pasada (se muestra solo si m>1)
  const [gpsInicio, setGpsInicio] = useState(null);   // {lat,lng,precision,obtenido}
  const [gpsCierre, setGpsCierre] = useState(null);
  const [fotosAntes, setFotosAntes] = useState([]);
  const [fotosDespues, setFotosDespues] = useState([]);
  const [marcadas, setMarcadas] = useState(new Set());
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  // ── Plantilla operacional seleccionada + datos declarados por ella ──
  const [tipoSel, setTipoSel] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('normal');
  const [cumplimiento, setCumplimiento] = useState(null); // {frecuencia_objetivo, completadas, en_proceso} de ESTA dependencia (qr_cumplimiento_dia)
  const [tipoSugerido, setTipoSugerido] = useState(null); // 'programada'|'extraordinaria' inferido del estado del dia
  const plantilla = tipoSel ? getPlantilla(tipoSel) : null;
  const req = plantilla?.requiere || {};

  const mS   = {minHeight:"100vh",background:"#0f172a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"24px 16px",fontFamily:"Arial,sans-serif"};
  const card = {background:"#1e293b",borderRadius:12,padding:"20px",width:"100%",maxWidth:420,marginBottom:16};
  const btnG = {background:"#16a34a",color:"#fff",border:"none",borderRadius:10,padding:"16px 24px",fontSize:18,fontWeight:700,width:"100%",cursor:"pointer"};
  const btnD = {background:"#374151",color:"#9ca3af",border:"none",borderRadius:10,padding:"16px 24px",fontSize:18,fontWeight:700,width:"100%",cursor:"not-allowed"};
  const inputS = {width:"100%",background:"#0f172a",color:"#fff",border:"1px solid #374151",borderRadius:8,padding:"12px",fontSize:16,boxSizing:"border-box"};
  const lbl  = {color:"#94a3b8",fontSize:13,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5};

  // Estado del dia de ESTA dependencia (lado lectura; no escribe nada).
  const cargarCumplimiento = async (contratoId, miDepId)=>{
    try{
      const {data:cum}=await supabase.rpc('qr_cumplimiento_dia',{p_contrato:contratoId});
      if(cum && cum.valido) return (cum.dependencias||[]).find(d=>d.dependencia_id===miDepId)||null;
    }catch{}
    return null;
  };

  // ---- Carga inicial: qr_dependencia (sin depender de loadAll) ----
  useEffect(()=>{
    let vivo=true;
    (async()=>{
      try{
        const {data,error}=await supabase.rpc('qr_dependencia',{p_dep:depId});
        if(!vivo)return;
        if(error||!data||!data.valido){ setErrorMsg('QR inválido o dependencia no encontrada.'); setFase('error'); return; }
        setDepInfo(data);
        const mi = await cargarCumplimiento(data.dependencia.contrato_id, data.dependencia.id);
        if(vivo){ setCumplimiento(mi); setFase('estado'); }
      }catch{ if(vivo){ setErrorMsg('No se pudo cargar la dependencia. Revisa tu conexión.'); setFase('error'); } }
    })();
    return ()=>{vivo=false;};
  },[depId]);

  // ---- GPS no bloqueante ----
  const capturarGPS = (setter)=>{
    setter({buscando:true});
    if(!navigator.geolocation){ setter({obtenido:false}); return; }
    navigator.geolocation.getCurrentPosition(
      p=>setter({lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),precision:p.coords.accuracy?Math.round(p.coords.accuracy):null,obtenido:true}),
      ()=>setter({obtenido:false}),
      {enableHighAccuracy:true,timeout:8000}
    );
  };

  // ---- Fotos: resize en cliente + subida a Storage ----
  const hacerAgregar = (lista,setLista)=>async(e)=>{
    if(lista.length>=3){ e.target.value=""; return; }
    const file=e.target.files[0]; if(!file)return;
    const img=new Image(); const url=URL.createObjectURL(file); img.src=url; await new Promise(r=>img.onload=r);
    const maxW=1024, scale=Math.min(1,maxW/img.width);
    const canvas=document.createElement("canvas"); canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale);
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",0.75));
    const preview=URL.createObjectURL(blob);
    setLista(prev=>[...prev,{blob,preview}]); URL.revokeObjectURL(url); e.target.value="";
  };
  const subirFotos = async (arr,prefix)=>{
    const out=[];
    for(let i=0;i<arr.length;i++){
      try{
        const nombre=`qr/${prefix}_${i}.jpg`;
        const {error}=await supabase.storage.from("evidencias-fotos").upload(nombre,arr[i].blob,{contentType:"image/jpeg",upsert:true});
        if(!error){ const {data}=supabase.storage.from("evidencias-fotos").getPublicUrl(nombre); out.push({storage_path:nombre,public_url:data.publicUrl,orden:i}); }
      }catch{}
    }
    return out;
  };

  // ---- Acciones ----
  const toggle = (id)=>setMarcadas(prev=>{const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;});

  const acreditar = async ()=>{
    if(!codigo.trim())return;
    setAcreditando(true); setAcredError('');
    try{
      const {data:val}=await supabase.rpc('qr_validar_trabajador',{p_dep:depId,p_codigo:codigo.trim()});
      if(!val||!val.valido){ setAcredError('Código/RUT no válido para esta dependencia. Verifica o contacta al supervisor.'); setAcreditando(false); return; }
      setTrabajador({id:val.trabajador_id,nombre:val.nombre});
      const {data:pend}=await supabase.rpc('qr_actividad_pendiente',{p_dep:depId,p_codigo:codigo.trim()});
      if(pend&&pend.pendiente){
        setActividadId(pend.actividad_id);
        setTipoSel(pend.tipo_actividad||'programada');
        if(pend.titulo) setTitulo(pend.titulo);
        if(pend.descripcion) setDescripcion(pend.descripcion);
        if(pend.prioridad) setPrioridad(pend.prioridad);
        const pl=getPlantilla(pend.tipo_actividad||'programada');
        if(pl?.requiere?.gpsFin!==false) capturarGPS(setGpsCierre);
        setFase('despues');
      }
      else if(tipoSugerido){
        // El tipo viene inferido del estado de la dependencia (pantalla de estado). El trabajador no clasifica.
        const lista = plantillasDisponibles({canal_origen:canalOrigen, solicitante, repasoPendiente:contexto.repasoPendiente});
        const p = lista.find(x=>x.id===tipoSugerido);
        if(p){ seleccionarPlantilla(p); } else { setFase('tipo'); }
      }
      else { setFase('tipo'); }
    }catch{ setAcredError('Error de conexión. Intenta de nuevo.'); }
    setAcreditando(false);
  };

  // ── Selección de plantilla operacional (flujo determinado por su config) ──
  const seleccionarPlantilla = (p)=>{
    setTipoSel(p.id);
    setPrioridad(p.prioridad_default||'normal');
    if(p.requiere?.titulo){ setFase('datos'); }
    else { if(p.requiere?.gpsInicio!==false) capturarGPS(setGpsInicio); setFase('antes'); }
  };
  const continuarDatos = ()=>{
    if(req.titulo && !titulo.trim()) return;
    if(plantilla?.requiere?.gpsInicio!==false) capturarGPS(setGpsInicio);
    setFase('antes');
  };

  const iniciar = async ()=>{
    setEnviando(true);
    try{
      const fotos=await subirFotos(fotosAntes,`${depId}_${Date.now()}_antes`);
      const {data:res}=await supabase.rpc('qr_iniciar_evidencia',{
        p_dep:depId,p_codigo:codigo.trim(),
        p_lat:gpsInicio?.lat??null,p_lng:gpsInicio?.lng??null,p_precision:gpsInicio?.precision??null,
        p_gps_ok:!!gpsInicio?.obtenido,p_fotos:fotos,
        p_tipo:tipoSel||'programada', p_canal:canalOrigen, p_solicitante:solicitante,
        p_titulo:titulo.trim()||null, p_descripcion:descripcion.trim()||null,
        p_prioridad:prioridad||plantilla?.prioridad_default||'normal',
        p_plantilla_id:plantilla?.id||tipoSel||'programada', p_plantilla_version:plantilla?.version||null
      });
      if(!res||!res.ok){ alert('No se pudo iniciar la actividad.'); setEnviando(false); return; }
      setActividadId(res.actividad_id);
      if(res.pasadas_objetivo){ setPasada({n:res.numero_pasada,m:res.pasadas_objetivo}); }
      try{ localStorage.setItem(`qr_act_${depId}`,res.actividad_id); }catch{}
      capturarGPS(setGpsCierre);
      setFase('despues');
    }catch{ alert('Error al iniciar. Revisa tu conexión.'); }
    setEnviando(false);
  };

  const cerrar = async ()=>{
    if(req.checklist && marcadas.size===0){ alert('Marca al menos una tarea realizada.'); return; }
    if(fotosDespues.length<1){ alert('Toma al menos 1 foto del resultado.'); return; }
    setEnviando(true);
    try{
      const fotos=await subirFotos(fotosDespues,`${actividadId}_despues`);
      const {data:res}=await supabase.rpc('qr_cerrar_evidencia',{
        p_actividad:actividadId,p_dep:depId,p_codigo:codigo.trim(),
        p_tareas: req.checklist ? [...marcadas] : [], p_obs:obs||null,
        p_lat:gpsCierre?.lat??null,p_lng:gpsCierre?.lng??null,p_precision:gpsCierre?.precision??null,
        p_gps_ok:!!gpsCierre?.obtenido,p_fotos:fotos
      });
      if(!res||!res.ok){ alert('No se pudo cerrar la actividad. '+(res?.error||'')); setEnviando(false); return; }
      try{ localStorage.removeItem(`qr_act_${depId}`); }catch{}
      setFase('listo');
    }catch{ alert('Error al cerrar. Revisa tu conexión.'); }
    setEnviando(false);
  };

  // ---- Sub-render: bloque de fotos ----
  const BloqueFotos = (titulo, lista, setLista)=>(
    <div style={card}>
      <div style={lbl}>📷 {titulo} ({lista.length}/3)</div>
      {lista.length>0&&(
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          {lista.map((f,i)=>(
            <div key={i} style={{position:"relative"}}>
              <img src={f.preview} alt={`foto ${i+1}`} style={{width:80,height:80,objectFit:"cover",borderRadius:8,border:"2px solid #16a34a"}}/>
              <button onClick={()=>setLista(lista.filter((_,j)=>j!==i))}
                style={{position:"absolute",top:-6,right:-6,background:"#ef4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:12}}>×</button>
            </div>
          ))}
        </div>
      )}
      {lista.length<3&&(
        <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#0f172a",border:"2px dashed #374151",borderRadius:8,padding:"14px",cursor:"pointer"}}>
          <span style={{fontSize:20}}>📷</span>
          <span style={{color:"#94a3b8",fontSize:14}}>{lista.length===0?"Tomar foto":"Agregar otra foto"}</span>
          <input type="file" accept="image/*" capture="environment" onChange={hacerAgregar(lista,setLista)} style={{display:"none"}}/>
        </label>
      )}
      <div style={{display:"flex",gap:12,marginTop:10,fontSize:12,flexWrap:"wrap"}}>
        {[0,1,2].map(i=>(<span key={i} style={{color:lista[i]?"#4ade80":"#64748b"}}>{lista[i]?"✔":"□"} Foto {i+1}</span>))}
      </div>
      <div style={{color:lista.length>=1?"#4ade80":"#fbbf24",fontSize:12,marginTop:6}}>{lista.length>=1?`${lista.length} foto${lista.length>1?'s':''} lista${lista.length>1?'s':''}`:"Se requiere al menos 1 fotografía (máx. 3)"}</div>
    </div>
  );

  const BloqueGPS = (gps, etiqueta)=>(
    gps?.obtenido
      ? <div style={{color:"#4ade80",fontSize:12,marginTop:4}}>📍 GPS {etiqueta}: {gps.lat}, {gps.lng}{gps.precision?` (±${gps.precision}m)`:''}</div>
      : gps?.buscando
        ? <div style={{color:"#fbbf24",fontSize:12,marginTop:4}}>🟡 Buscando ubicación {etiqueta}…</div>
        : <div style={{color:"#fbbf24",fontSize:12,marginTop:4}}>⚠️ No fue posible obtener la ubicación {etiqueta}. La actividad continuará sin georreferenciación.</div>
  );

  const Stepper = (activo)=>(
    <div style={{display:"flex",alignItems:"center",gap:6,width:"100%",maxWidth:420,marginBottom:14}}>
      <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:26,height:26,borderRadius:"50%",background:"#16a34a",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13}}>1</div>
        <span style={{color:activo==='antes'?"#fff":"#4ade80",fontSize:13,fontWeight:600}}>Antes</span>
      </div>
      <div style={{flex:1,height:2,background:activo==='despues'?"#16a34a":"#334155"}}/>
      <div style={{flex:1,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
        <div style={{width:26,height:26,borderRadius:"50%",background:activo==='despues'?"#16a34a":"#334155",color:activo==='despues'?"#fff":"#94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13}}>2</div>
        <span style={{color:activo==='despues'?"#fff":"#94a3b8",fontSize:13,fontWeight:600}}>Después</span>
      </div>
    </div>
  );

  // ===== Render =====
  if(loading||fase==='cargando') return <div style={{...mS,justifyContent:"center"}}><div style={{color:"#fff",fontSize:20}}>Cargando…</div></div>;
  if(fase==='error') return <div style={mS}><div style={{color:"#f87171",fontSize:18,textAlign:"center",maxWidth:420}}>❌ {errorMsg}<br/>Contacta al supervisor.</div></div>;

  const dep=depInfo.dependencia, contrato=depInfo.contrato, checklist=depInfo.checklist||[];

  const Header = (
    <div style={{textAlign:"center",marginBottom:16,width:"100%",maxWidth:420}}>
      <div style={{color:"#3b82f6",fontSize:13,fontWeight:600,letterSpacing:1,marginBottom:4}}>LIMPIAPP PRO · LEG SERVICIOS DE LIMPIEZA</div>
      <div style={{color:"#fff",fontSize:22,fontWeight:700,marginBottom:2}}>{dep.nombre}</div>
      <div style={{color:"#94a3b8",fontSize:14}}>{contrato.cliente}</div>
      <div style={{color:"#64748b",fontSize:12,marginTop:4}}>{new Date().toLocaleDateString("es-CL",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>
    </div>
  );

  if(fase==='listo'){
    const ahora=new Date();
    return(
      <div style={mS}>
        <div style={{...card,textAlign:"center",border:"2px solid #16a34a"}}>
          <div style={{fontSize:64,marginBottom:8}}>✅</div>
          <div style={{color:"#4ade80",fontSize:22,fontWeight:700,marginBottom:8}}>¡Actividad completada!</div>
          <div style={{color:"#fff",fontSize:16,marginBottom:4}}>{trabajador?.nombre||"—"}</div>
          <div style={{color:"#94a3b8",fontSize:14,marginBottom:4}}>{dep.nombre} · {contrato.cliente}</div>
          <div style={{color:"#4ade80",fontSize:15,fontWeight:600,marginBottom:4}}>{ahora.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})} hrs — {ahora.toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"})}</div>
          {pasada&&pasada.m>1&&<div style={{color:"#93c5fd",fontSize:14,fontWeight:700,marginBottom:4}}>Control {pasada.n} de {pasada.m}</div>}
          <div style={{color:"#94a3b8",fontSize:13}}>{req.checklist?`${marcadas.size} tarea${marcadas.size!==1?"s":""} · `:''}evidencia ANTES/DESPUÉS registrada</div>
        </div>
        <button style={{...btnG,maxWidth:420}} onClick={async ()=>{
          setCodigo(''); setTrabajador(null); setActividadId(null);
          setGpsInicio(null); setGpsCierre(null); setFotosAntes([]); setFotosDespues([]);
          setMarcadas(new Set()); setObs(''); setAcredError(''); setPasada(null);
          setTipoSel(null); setTitulo(''); setDescripcion(''); setPrioridad('normal'); setTipoSugerido(null);
          const mi = await cargarCumplimiento(dep.contrato_id, dep.id); setCumplimiento(mi); setFase('estado');
        }}>+ Nuevo control</button>
      </div>
    );
  }

  return(
    <div style={mS}>
      {Header}

      {fase==='estado' && (()=>{
        const obj = cumplimiento?.frecuencia_objetivo ?? 1;
        const hechos = cumplimiento?.completadas ?? 0;
        const enCurso = cumplimiento?.en_proceso ?? 0;
        const cumplida = hechos >= obj;
        const estadoTxt = cumplida ? 'Completo' : (enCurso>0 ? 'En curso' : 'Pendiente');
        const estadoColor = cumplida ? '#4ade80' : (enCurso>0 ? '#fbbf24' : '#94a3b8');
        const pct = obj>0 ? Math.min(100, Math.round((hechos/obj)*100)) : 0;
        return (
        <>
          <div style={card}>
            <div style={lbl}>Estado de la dependencia</div>
            <div style={{color:"#fff",fontSize:22,fontWeight:700,marginBottom:2}}>{dep.nombre}</div>
            <div style={{color:"#94a3b8",fontSize:14,marginBottom:16}}>{contrato.cliente}</div>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:7}}>
              <div style={{color:"#e2e8f0",fontSize:17,fontWeight:600}}>{hechos} de {obj} {obj===1?'control':'controles'} hoy</div>
              <div style={{color:estadoColor,fontSize:14,fontWeight:700}}>{estadoTxt}</div>
            </div>
            <div style={{height:10,background:"#1e293b",borderRadius:6,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:estadoColor,transition:"width .3s"}}/>
            </div>
            {enCurso>0 && !cumplida && <div style={{color:"#fbbf24",fontSize:13,marginTop:10}}>{enCurso} control{enCurso!==1?'es':''} en curso ahora.</div>}
            {cumplida && <div style={{color:"#4ade80",fontSize:13,marginTop:12}}>Obligación del día cumplida.</div>}
          </div>
          <div style={{width:"100%",maxWidth:420}}>
            <button style={btnG} onClick={()=>{ setTipoSugerido(cumplida?'extraordinaria':'programada'); setFase('acreditar'); }}>
              {cumplida ? 'Registrar control extraordinario' : 'Registrar control'}
            </button>
            {cumplida && <div style={{color:"#64748b",fontSize:12,textAlign:"center",marginTop:10}}>Ya se cumplieron los controles del día. Este quedará registrado como control extraordinario.</div>}
          </div>
        </>
        );
      })()}

      {fase==='acreditar' && (
        <>
          <div style={card}>
            <div style={lbl}>Acreditación</div>
            <div style={{color:"#cbd5e1",fontSize:14,marginBottom:10}}>Ingresa tu <b>código interno</b> o <b>RUT</b> para continuar.</div>
            <input style={inputS} value={codigo} onChange={e=>setCodigo(e.target.value)} placeholder="Ej: TR003 o 22.111.563-5" autoCapitalize="characters"
              onKeyDown={e=>{if(e.key==='Enter')acreditar();}}/>
            {acredError&&<div style={{color:"#f87171",fontSize:13,marginTop:8}}>{acredError}</div>}
          </div>
          <div style={{width:"100%",maxWidth:420}}>
            <button style={codigo.trim()&&!acreditando?btnG:btnD} disabled={!codigo.trim()||acreditando} onClick={acreditar}>
              {acreditando?"Validando…":"Continuar"}
            </button>
          </div>
        </>
      )}

      {fase==='tipo' && (()=>{
        const lista = plantillasDisponibles({canal_origen:canalOrigen, solicitante, repasoPendiente:contexto.repasoPendiente});
        return (
        <>
          <div style={card}>
            <div style={lbl}>¿Qué vas a registrar?</div>
            <div style={{color:"#cbd5e1",fontSize:14}}>Hola <b>{trabajador?.nombre}</b>. Elige el tipo de actividad.</div>
          </div>
          {lista.map(p=>(
            <button key={p.id} onClick={()=>seleccionarPlantilla(p)}
              style={{...card,textAlign:"left",cursor:"pointer",border:"1px solid #334155"}}>
              <div style={{color:"#fff",fontSize:17,fontWeight:700,marginBottom:2}}>{p.nombre}</div>
              <div style={{color:"#94a3b8",fontSize:13}}>{p.descripcion}</div>
            </button>
          ))}
          <button onClick={()=>{ setFase('acreditar'); setCodigo(''); setTrabajador(null); setTipoSel(null); }}
            style={{background:"#334155",color:"#cbd5e1",border:"none",borderRadius:10,padding:"14px 24px",fontSize:16,fontWeight:600,width:"100%",maxWidth:420,cursor:"pointer"}}>Salir</button>
        </>
        );
      })()}

      {fase==='datos' && (
        <>
          <div style={{...card,border:"1px solid #1e3a8a"}}>
            <div style={{color:"#93c5fd",fontSize:15,fontWeight:700,marginBottom:4}}>{plantilla?.nombre}</div>
            <div style={{color:"#cbd5e1",fontSize:14}}>Describe la actividad antes de comenzar.</div>
          </div>
          <div style={card}>
            <div style={lbl}>Título</div>
            <input style={inputS} value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Ej: Limpieza extraordinaria salón principal"/>
            {req.descripcion && (<>
              <div style={{...lbl,marginTop:12}}>Descripción</div>
              <textarea style={{...inputS,minHeight:70,resize:"vertical"}} value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder="Detalle de lo solicitado…"/>
            </>)}
            {plantilla?.permite_elegir_prioridad && (<>
              <div style={{...lbl,marginTop:12}}>Prioridad</div>
              <div style={{display:"flex",gap:8}}>
                {['normal','alta','critica'].map(pr=>(
                  <button key={pr} onClick={()=>setPrioridad(pr)}
                    style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${prioridad===pr?'#3b82f6':'#374151'}`,background:prioridad===pr?'#1e3a8a':'#0f172a',color:'#fff',fontSize:13,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{pr}</button>
                ))}
              </div>
            </>)}
          </div>
          <div style={{width:"100%",maxWidth:420}}>
            <button style={titulo.trim()?btnG:btnD} disabled={!titulo.trim()} onClick={continuarDatos}>Continuar</button>
          </div>
        </>
      )}

      {fase==='antes' && (
        <>
          {Stepper('antes')}
          <div style={{...card,border:"1px solid #1e3a8a"}}>
            <div style={{color:"#93c5fd",fontSize:15,fontWeight:700,marginBottom:4}}>Paso 1 · ANTES</div>
            <div style={{color:"#cbd5e1",fontSize:14}}>Hola <b>{trabajador?.nombre}</b>. Toma de 1 a 3 fotos del estado <b>antes</b> de trabajar e inicia la actividad.</div>
            {BloqueGPS(gpsInicio,"inicio")}
          </div>
          {req.checklist && checklist.length>0 && (
            <div style={card}>
              <div style={lbl}>Tareas de esta área ({checklist.length}) — revísalas antes de fotografiar</div>
              {checklist.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:"1px solid #334155"}}>
                  <span style={{color:"#64748b",fontSize:15,marginTop:1}}>•</span>
                  <div style={{flex:1}}>
                    <div style={{color:"#e2e8f0",fontSize:14,lineHeight:1.4}}>{t.tarea}</div>
                    {t.periodicidad&&<div style={{color:"#64748b",fontSize:12,marginTop:2}}>{t.periodicidad}</div>}
                  </div>
                </div>
              ))}
              <div style={{color:"#475569",fontSize:12,marginTop:8}}>Marcarás las que ejecutaste en el paso Después.</div>
            </div>
          )}
          {BloqueFotos("Estado inicial del área", fotosAntes, setFotosAntes)}
          <div style={{width:"100%",maxWidth:420}}>
            <button style={fotosAntes.length>=1&&!enviando?btnG:btnD} disabled={enviando||fotosAntes.length<1} onClick={iniciar}>
              {enviando?"Iniciando…":fotosAntes.length<1?"Toma al menos 1 foto":"▶ Iniciar actividad"}
            </button>
            <div style={{color:"#475569",fontSize:12,textAlign:"center",marginTop:8}}>La actividad queda guardada; podrás cerrarla aunque cierres el navegador.</div>
          </div>
        </>
      )}

      {fase==='despues' && (
        <>
          {Stepper('despues')}
          <div style={{...card,border:"1px solid #166534"}}>
            <div style={{color:"#4ade80",fontSize:15,fontWeight:700,marginBottom:4}}>Paso 2 · DESPUÉS</div>
            <div style={{color:"#cbd5e1",fontSize:14}}>{trabajador?.nombre} · {req.checklist?'marca las tareas realizadas y toma':'toma'} hasta 3 fotos del resultado.</div>
            {pasada&&pasada.m>1&&<div style={{marginTop:8,display:"inline-block",background:"#1e3a8a",color:"#dbeafe",fontSize:13,fontWeight:700,padding:"3px 10px",borderRadius:6}}>Control {pasada.n} de {pasada.m}</div>}
          </div>

          {req.checklist && (<div style={card}>
            <div style={lbl}>Tareas realizadas ({checklist.length} en esta área)</div>
            {checklist.length===0&&<div style={{color:"#64748b",fontSize:14}}>No hay tareas activas para esta área.</div>}
            {checklist.map(t=>(
              <div key={t.id} onClick={()=>toggle(t.id)} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"1px solid #334155",cursor:"pointer"}}>
                <div style={{width:28,height:28,borderRadius:6,border:`2px solid ${marcadas.has(t.id)?"#16a34a":"#475569"}`,background:marcadas.has(t.id)?"#16a34a":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                  {marcadas.has(t.id)&&<span style={{color:"#fff",fontSize:18,fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{color:marcadas.has(t.id)?"#4ade80":"#f1f5f9",fontSize:15,lineHeight:1.4}}>{t.tarea}</div>
                  {t.periodicidad&&<div style={{color:"#64748b",fontSize:12,marginTop:2}}>{t.periodicidad}</div>}
                </div>
              </div>
            ))}
          </div>)}

          {BloqueFotos("Resultado del trabajo", fotosDespues, setFotosDespues)}

          <div style={card}>
            <div style={lbl}>Observación (opcional)</div>
            <input style={inputS} value={obs} onChange={e=>setObs(e.target.value)} placeholder="Ej: requirió producto adicional, vidrios muy sucios…"/>
            {BloqueGPS(gpsCierre,"cierre")}
          </div>

          <div style={{width:"100%",maxWidth:420}}>
            <button style={(!req.checklist||marcadas.size>0)&&fotosDespues.length>=1&&!enviando?btnG:btnD} disabled={enviando||(req.checklist&&marcadas.size===0)||fotosDespues.length<1} onClick={cerrar}>
              {enviando?"Cerrando…":(req.checklist&&marcadas.size<1)?"Marca al menos una tarea":fotosDespues.length<1?"Toma al menos 1 foto":`✓ Cerrar actividad${req.checklist?` (${marcadas.size} tarea${marcadas.size!==1?"s":""})`:''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Adaptador de canal: QR ───────────────────────────────────
   El QR es un CANAL que invoca el Motor Operacional: arma el
   contexto y delega. El motor no depende del QR. Mañana existirán
   CanalPortalTrabajador, CanalSupervisor, etc. (no se crean aún;
   nacen cuando exista su canal real). */
function CanalQR({ depId, loading }) {
  return <MotorOperacional contexto={{ canal_origen:'qr', solicitante:'trabajador', depId }} loading={loading} />;
}

/* Tab QR — panel administrador */
/* ─── Helper fotos múltiples ────────────────────────────────── */
function parseFotos(foto) {
  if (!foto) return [];
  try { const arr = JSON.parse(foto); return Array.isArray(arr) ? arr : [foto]; }
  catch { return [foto]; }
}

/* ─── Módulo Evidencias ──────────────────────────────────────── */
/* ─── Actividades QR — vista superior por actividad ─────────── */
function ActividadesQR({ data, contratoId }) {
  const [filtroC, setFiltroC] = useState(contratoId||"");
  const [filtroE, setFiltroE] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [expand, setExpand] = useState(null);
  const [lb, setLb] = useState(null);

  const nombreTrab = (id)=>(data.trabajadores||[]).find(t=>t.id===id)?.nombre||"—";
  const cliente = (id)=>(data.contratos||[]).find(c=>c.id===id)?.cliente||"—";
  const nombreDep = (id)=>(data.dependencias||[]).find(d=>d.id===id)?.nombre||"—";
  const tareaTxt = (id)=>(data.checklist||[]).find(c=>c.id===id)?.tarea||id;
  const fmt = (s)=> s ? new Date(s).toLocaleString("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
  const dur = (a)=>{ if(!a.fecha_hora_inicio||!a.fecha_hora_cierre) return "—"; const m=Math.max(0,Math.round((new Date(a.fecha_hora_cierre)-new Date(a.fecha_hora_inicio))/60000)); return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`; };
  const fotosDe = (id)=> (data.qr_actividad_fotos||[]).filter(f=>f.actividad_id===id);

  const acts = (data.qr_actividades||[])
    .filter(a => (!filtroC || a.contrato_id===filtroC) && (!filtroE || a.estado===filtroE) && (!filtroTipo || (a.tipo_actividad||'programada').toLowerCase()===filtroTipo))
    .sort((a,b)=> (b.fecha_hora_inicio||"").localeCompare(a.fecha_hora_inicio||""));

  const contratos = (data.contratos||[]);
  const EstadoBadge = ({e})=> e==='completado'
    ? <span style={{background:"#dcfce7",color:"#166534",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>COMPLETADO</span>
    : <span style={{background:"#fef3c7",color:"#92400e",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>EN PROCESO</span>;
  const gpsBadge = (ok)=> ok
    ? <span style={{color:"#16a34a",fontSize:11}}>📍 sí</span>
    : <span style={{color:"#b45309",fontSize:11}}>⚠ no</span>;
  const fechaTxt = (s)=> s ? new Date(s).toLocaleDateString("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
  const horaTxt = (s)=> s ? new Date(s).toLocaleTimeString("es-CL",{timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit"}) : "—";
  const folioTxt = (a)=> a.folio
    ? `ACT-${a.created_at?new Date(a.created_at).getFullYear():new Date().getFullYear()}-${String(a.folio).padStart(6,"0")}`
    : `ACT-${(a.id||"").slice(0,8).toUpperCase()}`;
  const TIPOS = { programada:{l:"PROGRAMADA",bg:"#dbeafe",c:"#1e40af"}, extraordinaria:{l:"EXTRAORDINARIA",bg:"#ffedd5",c:"#9a3412"}, supervision:{l:"SUPERVISIÓN",bg:"#ede9fe",c:"#5b21b6"}, auditoria:{l:"AUDITORÍA",bg:"#e0e7ff",c:"#3730a3"}, emergencia:{l:"EMERGENCIA",bg:"#fee2e2",c:"#991b1b"} };
  const tipoDe = (t)=> TIPOS[(t||"programada").toLowerCase()] || TIPOS.programada;
  const TipoBadge = ({t})=>{ const x=tipoDe(t); return <span style={{background:x.bg,color:x.c,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>{x.l}</span>; };
  const gpsResumen = (a)=> (a.gps_inicio_obtenido||a.gps_cierre_obtenido)
    ? <span style={{color:"#16a34a",fontSize:12,fontWeight:600}}>GPS ✔</span>
    : <span style={{color:"#b45309",fontSize:12}}>Sin georreferenciación</span>;
  const Sec = ({t})=> <div style={{fontSize:11,fontWeight:800,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:`1px solid ${C.border}`,paddingBottom:4,margin:"16px 0 8px"}}>{t}</div>;
  const Campo = ({k,v})=> <div style={{display:"flex",gap:10,fontSize:13,padding:"3px 0"}}><span style={{color:C.textMuted,minWidth:130}}>{k}</span><span style={{color:C.text,fontWeight:500}}>{v}</span></div>;

  return (
    <div>
      {lb&&<Lightbox url={lb} onClose={()=>setLb(null)}/>}
      <div style={{marginBottom:14}}>
        <h1 style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 3px"}}>📲 Actividades QR</h1>
        <p style={{color:C.textMuted,fontSize:12,margin:0}}>Libro de Actividades Operacionales · expediente con folio, evidencia ANTES/DESPUÉS y trazabilidad</p>
      </div>

      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:14,display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"}}>
        <div><div style={{fontSize:11,color:C.textMuted,marginBottom:4,fontWeight:600}}>CONTRATO</div>
          <select value={filtroC} onChange={e=>setFiltroC(e.target.value)} style={{padding:"8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:13}}>
            <option value="">Todos</option>{contratos.map(c=><option key={c.id} value={c.id}>{c.cliente||c.id}</option>)}
          </select>
        </div>
        <div><div style={{fontSize:11,color:C.textMuted,marginBottom:4,fontWeight:600}}>ESTADO</div>
          <select value={filtroE} onChange={e=>setFiltroE(e.target.value)} style={{padding:"8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:13}}>
            <option value="">Todos</option><option value="en_proceso">En proceso</option><option value="completado">Completado</option>
          </select>
        </div>
        <div><div style={{fontSize:11,color:C.textMuted,marginBottom:4,fontWeight:600}}>TIPO</div>
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{padding:"8px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:13}}>
            <option value="">Todos</option><option value="programada">Programada</option><option value="extraordinaria">Extraordinaria</option><option value="supervision">Supervisión</option><option value="auditoria">Auditoría</option><option value="emergencia">Emergencia</option>
          </select>
        </div>
        <div style={{marginLeft:"auto",color:C.textMuted,fontSize:13,fontWeight:600}}>{acts.length} actividad{acts.length!==1?"es":""}</div>
      </div>

      {acts.length===0 && <div style={{color:C.textMuted,fontSize:14,padding:20,textAlign:"center"}}>No hay actividades QR en este filtro.</div>}

      {acts.map(a=>{
        const fotos=fotosDe(a.id); const antes=fotos.filter(f=>f.tipo==='antes'); const desp=fotos.filter(f=>f.tipo==='despues');
        const tareas=(a.tareas_cumplidas||[]); const abierto=expand===a.id;
        const evVinc=(data.evidencias||[]).filter(e=>e.actividad_id===a.id).length;
        return (
          <div key={a.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:10,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:16,padding:"12px 16px",flexWrap:"wrap"}}>
              <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:130}}>
                <span style={{fontFamily:"monospace",fontSize:12,color:C.accent,fontWeight:700}}>{folioTxt(a)}</span>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><EstadoBadge e={a.estado}/><TipoBadge t={a.tipo_actividad}/>{a.pasadas_objetivo>1&&<span style={{fontSize:11,fontWeight:700,color:C.accent,background:C.surfaceAlt||"#f8fafc",border:`1px solid ${C.accent}`,borderRadius:5,padding:"1px 7px"}}>Control {a.numero_pasada||1}/{a.pasadas_objetivo}</span>}</div>
              </div>
              <div style={{minWidth:150}}>
                <div style={{color:C.text,fontSize:14,fontWeight:600}}>{nombreTrab(a.trabajador_id)}</div>
                <div style={{color:C.textMuted,fontSize:12}}>{nombreDep(a.dependencia_id)} · {cliente(a.contrato_id)}</div>
              </div>
              <div style={{fontSize:12,color:C.textMuted}}>{fechaTxt(a.fecha_hora_inicio)}<div style={{color:C.text,fontWeight:600,marginTop:2}}>{horaTxt(a.fecha_hora_inicio)} → {horaTxt(a.fecha_hora_cierre)}</div></div>
              <div style={{fontSize:12,color:C.textMuted}}>Duración<div style={{color:C.text,fontWeight:600,marginTop:2}}>{dur(a)}</div></div>
              <div style={{fontSize:12,color:C.textMuted}}>Tareas<div style={{color:C.text,fontWeight:600,marginTop:2}}>{tareas.length}</div></div>
              <div style={{fontSize:12,color:C.textMuted}}>Evidencia<div style={{color:C.text,fontWeight:600,marginTop:2}}>{antes.length} Antes · {desp.length} Después</div></div>
              {gpsResumen(a)}
              <button onClick={()=>setExpand(abierto?null:a.id)} style={{marginLeft:"auto",background:abierto?C.accent:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:600,color:abierto?"#fff":C.accent,cursor:"pointer"}}>{abierto?"Cerrar":"Ver expediente"}</button>
            </div>

            {abierto && (
              <div style={{borderTop:`1px solid ${C.border}`,padding:"18px 20px",background:C.surfaceAlt||"#f8fafc"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:2}}>
                  <span style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:C.text}}>{folioTxt(a)}</span>
                  <div style={{display:"flex",gap:6}}><EstadoBadge e={a.estado}/><TipoBadge t={a.tipo_actividad}/></div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"0 28px",marginTop:6}}>
                  <div>
                    <Sec t="Actividad"/>
                    <Campo k="Tipo" v={tipoDe(a.tipo_actividad).l}/>
                    <Campo k="Contrato" v={cliente(a.contrato_id)}/>
                    <Campo k="Dependencia" v={nombreDep(a.dependencia_id)}/>
                    {a.pasadas_objetivo>1 && <Campo k="Control" v={`${a.numero_pasada||1} de ${a.pasadas_objetivo}`}/>}

                    <Sec t="Trabajador"/>
                    <Campo k="Nombre" v={nombreTrab(a.trabajador_id)}/>

                    <Sec t="Tiempos"/>
                    <Campo k="Inicio" v={fmt(a.fecha_hora_inicio)}/>
                    <Campo k="Término" v={fmt(a.fecha_hora_cierre)}/>
                    <Campo k="Duración" v={dur(a)}/>

                    <Sec t="Trazabilidad"/>
                    <Campo k="GPS inicio" v={a.gps_inicio_obtenido?`${a.lat_inicio}, ${a.lng_inicio}${a.precision_inicio?` (±${a.precision_inicio}m)`:''}`:"Sin georreferenciación"}/>
                    <Campo k="GPS término" v={a.gps_cierre_obtenido?`${a.lat_cierre}, ${a.lng_cierre}${a.precision_cierre?` (±${a.precision_cierre}m)`:''}`:"Sin georreferenciación"}/>
                    <Campo k="Acceso" v={a.via_qr===false?"Manual":"QR escaneado"}/>
                    <Campo k="N° actividad" v={folioTxt(a)}/>
                    <Campo k="Registro Evidencias" v={`${evVinc} tarea${evVinc!==1?"s":""} enlazada${evVinc!==1?"s":""}`}/>
                  </div>

                  <div>
                    <Sec t="Evidencia Antes"/>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {antes.length===0&&<span style={{color:C.textMuted,fontSize:13}}>Sin fotografías</span>}
                      {antes.map((f,i)=><img key={i} src={f.public_url} alt="antes" onClick={()=>setLb(f.public_url)} style={{width:90,height:90,objectFit:"cover",borderRadius:6,cursor:"pointer",border:`1px solid ${C.border}`}}/>)}
                    </div>

                    <Sec t="Evidencia Después"/>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {desp.length===0&&<span style={{color:C.textMuted,fontSize:13}}>Sin fotografías</span>}
                      {desp.map((f,i)=><img key={i} src={f.public_url} alt="despues" onClick={()=>setLb(f.public_url)} style={{width:90,height:90,objectFit:"cover",borderRadius:6,cursor:"pointer",border:`1px solid ${C.border}`}}/>)}
                    </div>

                    <Sec t="Actividades ejecutadas"/>
                    {tareas.length===0&&<span style={{color:C.textMuted,fontSize:13}}>—</span>}
                    {tareas.map((tid,i)=><div key={i} style={{fontSize:13,color:C.text,padding:"2px 0"}}>✓ {tareaTxt(tid)}</div>)}

                    {(a.titulo||a.descripcion) && <Sec t="Motivo y solicitud inicial"/>}
                    {a.titulo && <><div style={{fontSize:12,color:C.textMuted,margin:"4px 0 2px"}}>Motivo del control extraordinario</div><div style={{fontSize:13,color:C.text,marginBottom:6}}>{a.titulo}</div></>}
                    {a.descripcion && <><div style={{fontSize:12,color:C.textMuted,margin:"4px 0 2px"}}>Solicitud / descripción inicial</div><div style={{fontSize:13,color:C.text}}>{a.descripcion}</div></>}

                    <Sec t="Observación final del trabajo"/>
                    <div style={{fontSize:13,color:a.observacion?C.text:C.textMuted}}>{a.observacion||"Sin observaciones"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabEvidencias({ data, contratoId }) {
  const hoy = new Date().toLocaleDateString("en-CA", {timeZone:"America/Santiago"});
  const hace7 = new Date(Date.now()-7*86400000).toLocaleDateString("en-CA", {timeZone:"America/Santiago"});
  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(hoy);
  const [filtroT, setFiltroT] = useState("");
  const [filtroC, setFiltroC] = useState(contratoId||"");
  const [soloFoto, setSoloFoto] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [subtab, setSubtab] = useState('evidencias');

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

  const subtabBar = (
    <div style={{display:"flex",gap:8,marginBottom:16,borderBottom:`1px solid ${C.border}`}}>
      {[['evidencias','📋 Registro de Evidencias'],['actividades','📲 Actividades QR']].map(([k,l])=>(
        <button key={k} onClick={()=>setSubtab(k)} style={{background:"none",border:"none",borderBottom:`2px solid ${subtab===k?C.accent:"transparent"}`,color:subtab===k?C.accent:C.textMuted,fontSize:13,fontWeight:600,padding:"8px 4px",cursor:"pointer"}}>{l}</button>
      ))}
    </div>
  );
  if(subtab==='actividades') return (<div>{subtabBar}<ActividadesQR data={data} contratoId={contratoId}/></div>);

  return (
    <div>
      {subtabBar}
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
              const n=data.evidencias.filter(e=>e.checklist_id===r.id&&e.fecha_hora&&new Date(e.fecha_hora).toLocaleDateString("en-CA",{timeZone:"America/Santiago"})===hoyChile).length;
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

// Valida que la fila de parámetros legales tenga todos los campos requeridos.
// Devuelve la lista de faltantes (vacía = completa). null/undefined → [] (la ausencia de fila se maneja aparte).
function paramsFaltantes(p){
  if(!p) return [];
  const f=[];
  // Indicadores que NO pueden ser 0
  [['uf','UF'],['utm','UTM'],['imm','IMM'],['tope_imponible_uf','Tope imponible AFP/Salud'],['tope_cesantia_uf','Tope cesantía'],['salud_trabajador','Cotización salud'],['horas_mensuales','Horas mensuales']]
    .forEach(([k,l])=>{ if(!(Number(p[k])>0)) f.push(l); });
  // Tasas que deben estar presentes (pueden ser 0, ej: cesantía trabajador plazo fijo)
  [['ces_trab_indefinido','Cesantía trab. indefinido'],['ces_trab_plazo_fijo','Cesantía trab. plazo fijo'],['ces_emp_indefinido','Cesantía emp. indefinido'],['ces_emp_plazo_fijo','Cesantía emp. plazo fijo'],['mutualidad','Mutualidad'],['aporte_patronal','Aporte patronal']]
    .forEach(([k,l])=>{ if(p[k]==null) f.push(l); });
  return f;
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
  const tope_grat     = Math.round(4.75 * (params.imm || 0) / 12);  // Art. 50: tope = 4,75 IMM anual / 12
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
  const { perfil } = useAuth();
  const todos  = (data.parametros_legales||[]);
  const periodos = [...new Set(todos.map(p=>p.periodo).filter(Boolean))].sort().reverse();
  const hoyP = new Date();
  const periodoActual = `${hoyP.getFullYear()}-${String(hoyP.getMonth()+1).padStart(2,'0')}`;
  const [selPeriodo, setSelPeriodo] = useState(periodos.includes(periodoActual)?periodoActual:(periodos[0]||periodoActual));
  const params = todos.find(p=>p.periodo===selPeriodo) || null;
  const faltP  = paramsFaltantes(params);
  const tasas  = data.tasas_afp||[];
  const iusc   = (data.tabla_iusc||[]).sort((a,b)=>a.tramo-b.tramo);
  const [editP, setEditP] = useState(null);
  const [editA, setEditA] = useState(null);

  const saveParams = async () => {
    if (!editP) return;
    const per = (editP.periodo||selPeriodo||'').trim();
    if(!/^\d{4}-\d{2}$/.test(per)){ alert('Período inválido. Use formato YYYY-MM (ej: 2026-06).'); return; }
    const rec = {...editP, periodo: per, fecha_actualizacion: new Date().toISOString().slice(0,10), actualizado_por: perfil?.nombre || 'Sistema'};
    const existe = todos.find(p=>p.periodo===per);
    if (existe && existe.id) await update("parametros_legales", {...existe,...rec});
    else await insert("parametros_legales", rec);
    setSelPeriodo(per);
    setEditP(null);
  };
  const nuevoPeriodo = () => {
    const prop = window.prompt('Nuevo período (YYYY-MM):', periodoActual);
    if(!prop) return;
    if(!/^\d{4}-\d{2}$/.test(prop)){ alert('Formato inválido. Use YYYY-MM, ej: 2026-06'); return; }
    if(todos.find(p=>p.periodo===prop)){ setSelPeriodo(prop); setEditP(null); alert('Ese período ya existe. Lo seleccioné para que lo edites.'); return; }
    const base = todos.find(p=>p.periodo===selPeriodo) || todos[0] || {};
    const clon = {...base, periodo: prop, fuente:''};
    delete clon.id; delete clon.fecha_actualizacion; delete clon.actualizado_por;
    setSelPeriodo(prop);
    setEditP(clon);
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

      {/* Selector de período + estado */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:C.textMuted}}>Período:</span>
        <select style={{...INP,width:130}} value={selPeriodo} onChange={e=>{setSelPeriodo(e.target.value);setEditP(null);}}>
          {(periodos.includes(selPeriodo)?periodos:[selPeriodo,...periodos]).map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <SecondaryBtn onClick={nuevoPeriodo} small>➕ Nuevo período</SecondaryBtn>
        {params
          ? (faltP.length
              ? <Tag text={`⚠ Incompleto (${faltP.length})`} scheme={{bg:'#fef2f2',text:'#991b1b',border:'#fca5a5'}}/>
              : <Tag text="✓ Completo" scheme={{bg:C.greenBg,text:C.green,border:C.greenBorder}}/>)
          : <Tag text="✗ Sin fila para este período" scheme={{bg:'#fef2f2',text:'#991b1b',border:'#fca5a5'}}/>}
        {params?.fecha_actualizacion && <span style={{fontSize:11,color:C.textMuted}}>🕒 Actualizado: {dateOnly(params.fecha_actualizacion)}</span>}
        {params?.actualizado_por && <span style={{fontSize:11,color:C.textMuted}}>👤 Por: {params.actualizado_por}</span>}
        {params?.fuente && <span style={{fontSize:11,color:C.textMuted}}>📚 Fuente: {params.fuente}</span>}
      </div>

      {/* Parámetros del período */}
      <Panel title={`Parámetros del período ${selPeriodo}`}
        action={!editP?<PrimaryBtn onClick={()=>setEditP({...(params||{}),periodo:selPeriodo})} small>{params?'✏️ Editar':'➕ Cargar valores'}</PrimaryBtn>:
          <div style={{display:"flex",gap:6}}><PrimaryBtn onClick={saveParams} color={C.green} small>Guardar</PrimaryBtn><SecondaryBtn onClick={()=>setEditP(null)} small>Cancelar</SecondaryBtn></div>}>
        {editP ? (
          <div>
            {paramsFaltantes(editP).length>0 && <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:6,padding:'8px 12px',fontSize:11,color:'#92400e',marginBottom:12}}>Faltan por completar: {paramsFaltantes(editP).join(' · ')}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <FL label="Período (YYYY-MM)">
                <input type="text" style={INP} value={editP.periodo||selPeriodo} onChange={e=>setEditP({...editP,periodo:e.target.value})}/>
              </FL>
              <FL label="Fuente (SII / Previred / DT, fecha)">
                <input type="text" style={INP} value={editP.fuente||''} onChange={e=>setEditP({...editP,fuente:e.target.value})}/>
              </FL>
              {labelP.map(f=>(
                <FL key={f.k} label={f.label}>
                  <input type="number" style={INP} step={f.mult?"0.01":"1"}
                    value={f.mult ? ((editP[f.k]||0)*f.mult).toFixed(f.mult===100?2:3) : (editP[f.k]||0)}
                    onChange={e=>setEditP({...editP,[f.k]:f.mult?Number(e.target.value)/f.mult:Number(e.target.value)})}/>
                </FL>
              ))}
            </div>
            <p style={{fontSize:11,color:C.textMuted,marginTop:8}}>Al guardar se registra automáticamente la fecha de actualización de hoy.</p>
          </div>
        ) : params ? (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {labelP.map(f=>{
              const v = params[f.k]||0;
              const disp = f.fmt==="$" ? clp(v) : f.mult ? `${(v*f.mult).toFixed(2)}%` : v;
              const falta = params[f.k]==null;
              return <div key={f.k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.borderLight}`}}>
                <span style={{color:C.textMuted,fontSize:12}}>{f.label}</span>
                <span style={{color:falta?'#991b1b':C.text,fontWeight:500,fontSize:13}}>{falta?'⚠ falta':disp}</span>
              </div>;
            })}
          </div>
        ) : <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'12px',fontSize:12,color:'#991b1b'}}>No existe fila de parámetros para el período <b>{selPeriodo}</b>. Usa <b>➕ Nuevo período</b> (clona el último) o <b>➕ Cargar valores</b> para crearla. Mientras no exista, las liquidaciones de este período quedan bloqueadas.</div>}
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
  const params     = (data.parametros_legales||[]).find(p=>p.periodo===periodo) || null;

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
    const fp = paramsFaltantes(params);
    if(!params || fp.length){
      setErrores([`No se puede generar el LRE: parámetros legales incompletos para el período ${periodo}${params?` (faltan: ${fp.join(', ')})`:' — no existe fila para el período'}. Revise ⚙️ Parámetros Legales.`]);
      return;
    }
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
      const sisRate   = (data.tasas_afp||[]).find(a=>a.nombre===t.afp)?.sis;
      const aporteSIS = t.pensionado ? 0 : Math.round(remImp * (sisRate||0));  // 4155 SIS desde tasas_afp
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
  const params = (data.parametros_legales||[]).find(p=>p.periodo===periodo) || null;

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

  const params = (data.parametros_legales || []).find(p => p.periodo === periodo) || null;
  const tasas = data.tasas_afp || [];
  const iuscTabla = data.tabla_iusc || [];
  const liqList = data.liquidaciones || [];
  const trabajador = data.trabajadores.find(t => t.id === tId);

  // ── Validación de parámetros legales del período (sin fallback silencioso) ──
  const faltantesParam = paramsFaltantes(params);
  const afpFalta  = !!trabajador && !trabajador.pensionado && !tasas.find(a => a.nombre === trabajador.afp);
  const iuscFalta = (iuscTabla || []).length === 0;
  const paramsOk  = !!params && faltantesParam.length === 0 && !afpFalta && !iuscFalta;
  const avisosParam = !params
    ? [`No existe fila de parámetros legales para el período ${periodo}`]
    : [
        ...faltantesParam,
        ...(afpFalta  ? [`Tasa de AFP "${trabajador?.afp}" no está en tasas_afp`] : []),
        ...(iuscFalta ? ['Tabla IUSC vacía'] : []),
      ];

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
    if (!trabajador) { alert("Selecciona un trabajador."); return; }
    setRes(calcularLiquidacion(trabajador, params || {}, tasas, iuscTabla, {
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

  const [dupAlerta, setDupAlerta] = useState(null); // {existente, res}

  const guardar = async () => {
    if (!res) return;
    if (!paramsOk) { alert("🔒 No se puede guardar: parámetros legales incompletos para el período. Revise ⚙️ Parámetros Legales."); return; }
    const existente = liqList.find(l => l.trabajador_id === tId && l.periodo === periodo);
    if (existente) {
      setDupAlerta({existente, res});
      return;
    }
    setSaving(true);
    const ok = await saveRem(res);
    if (ok) setSaved(true);
    setSaving(false);
  };

  const confirmarReemplazo = async () => {
    if (!dupAlerta) return;
    setSaving(true);
    const ok = await saveRem(dupAlerta.res);
    if (ok) setSaved(true);
    setSaving(false);
    setDupAlerta(null);
  };

  const imprimir = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Liquidación ${periodo}</title><style>body{font-family:sans-serif;font-size:13px;padding:20px}table{width:100%;border-collapse:collapse}td{padding:4px 8px}h2{margin-bottom:4px}hr{margin:8px 0}</style></head><body>${slipRef.current?.innerHTML}</body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div>
      {dupAlerta&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:1200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,maxWidth:440,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <p style={{fontWeight:700,fontSize:15,color:'#b45309',marginBottom:8}}>⚠️ Liquidacion ya existe</p>
            <p style={{fontSize:12,color:C.text,marginBottom:4}}>
              Ya existe una liquidacion para <b>{trabajador?.nombre}</b> en el periodo <b>{periodo}</b>.
            </p>
            {dupAlerta.existente.firmado_at&&(
              <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:6,padding:'6px 10px',fontSize:11,color:'#991b1b',marginBottom:8}}>
                🔏 Firmada el {new Date(dupAlerta.existente.firmado_at).toLocaleDateString('es-CL')}. Reemplazarla invalidara la firma.
              </div>
            )}
            <p style={{fontSize:12,color:C.textMuted,marginBottom:16}}>¿Que deseas hacer?</p>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <button onClick={()=>{setDupAlerta(null);setSaved(true);}}
                style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'#f0fdf4',color:'#15803d',cursor:'pointer',fontSize:12,fontWeight:600,textAlign:'left'}}>
                👁 Ver liquidacion existente (no reemplazar)
              </button>
              <button onClick={confirmarReemplazo}
                style={{padding:'9px 16px',borderRadius:6,border:'1px solid #fca5a5',background:'#fef2f2',color:'#dc2626',cursor:'pointer',fontSize:12,fontWeight:600,textAlign:'left'}}>
                🔄 Recalcular y reemplazar
              </button>
              <button onClick={()=>setDupAlerta(null)}
                style={{padding:'9px 16px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.textMuted,cursor:'pointer',fontSize:12,textAlign:'left'}}>
                ✕ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
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

      {!params && (()=>{
        const ult=(data.parametros_legales||[]).filter(p=>p.periodo).sort((a,b)=>String(b.periodo).localeCompare(String(a.periodo)))[0];
        const ufF=u=>`$${Number(u||0).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
        return (
          <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:8,padding:'12px 14px',marginBottom:12,fontSize:12}}>
            <p style={{color:'#92400e',fontWeight:700,margin:'0 0 4px'}}>⚠ No existe una fila de parámetros legales para el período {periodo}.</p>
            <p style={{color:'#92400e',margin:'0 0 6px'}}>Créalo en ⚙️ Parámetros antes de generar liquidaciones definitivas.</p>
            {ult && <p style={{color:'#92400e',margin:0,fontSize:11}}>Referencia — último período disponible {ult.periodo}: IMM {clp(ult.imm)} · UF {ufF(ult.uf)} · UTM {clp(ult.utm)} <span style={{opacity:0.75}}>(solo visual, no se usa para calcular)</span></p>}
          </div>
        );
      })()}

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
            {paramsOk ? (
              <div style={{ background: C.accentBg, border: "1px solid #bfdbfe", borderRadius: 6, padding: "8px 12px", fontSize: 11 }}>
                <p style={{ color: C.accentText }}><b>UF:</b> {clp(params.uf)} · <b>UTM:</b> {clp(params.utm)} · <b>IMM:</b> {clp(params.imm)}</p>
                <p style={{ color: C.accentText }}><b>Tope AFP:</b> {params.tope_imponible_uf} UF · <b>Mutualidad:</b> {(params.mutualidad*100).toFixed(2)}% · <b>Aporte Patronal:</b> {(params.aporte_patronal*100).toFixed(1)}%</p>
              </div>
            ) : (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 12px', fontSize: 11 }}>
                <p style={{ color: '#991b1b', fontWeight: 700, margin: '0 0 4px' }}>⚠️ Parámetro legal incompleto para el período {periodo}</p>
                <p style={{ color: '#991b1b', margin: '0 0 4px' }}>Faltan: {avisosParam.join(' · ')}.</p>
                <p style={{ color: '#991b1b', margin: 0 }}>Puedes calcular en modo PRELIMINAR, pero no se podrá guardar ni imprimir hasta completar en ⚙️ Parámetros Legales.</p>
              </div>
            )}
            <PrimaryBtn onClick={calcular} color={C.accent} disabled={!tId}>⚡ Calcular liquidación</PrimaryBtn>
          </div>
        </Panel>

        {/* ── Liquidación ── */}
        <div>
          {res ? (
            <Panel title={`Liquidación · ${periodo} · ${trabajador?.nombre}${paramsOk ? '' : ' · ⚠ PRELIMINAR'}`}
              action={
                <div style={{ display: "flex", gap: 8, alignItems: 'center' }}>
                  {paramsOk ? (
                    <>
                      <SecondaryBtn onClick={imprimir} small>🖨 Imprimir</SecondaryBtn>
                      {!saved
                        ? <PrimaryBtn onClick={guardar} disabled={saving} color={C.green} small>{saving ? "Guardando…" : "💾 Guardar"}</PrimaryBtn>
                        : <Tag text="✓ Guardada" scheme={{ bg: C.greenBg, text: C.green, border: C.greenBorder }} />}
                    </>
                  ) : (
                    <Tag text="🔒 Bloqueado — parámetros incompletos" scheme={{ bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' }} />
                  )}
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
/* ── Fase 8D.6 — Panel transversal de documentos del personal (dentro de Cumplimiento) ── */
function PanelDocumentosPendientes({data, update}){
  const { user, perfil } = useAuth();
  const quien = perfil?.nombre || user?.email || 'sistema';
  const trabs=(data.trabajadores||[]);
  const allDocs=(data.documentos_trabajador||[]);
  const cnt=(st)=>allDocs.filter(d=>d.estado===st).length;
  const filas=trabs.map(t=>({t,chk:checklistObligatorios(t,data)}));
  const incompletos=filas.filter(f=>!f.chk.completo).sort((a,b)=>a.chk.completados-b.chk.completados);
  const pendientesFirma=allDocs.filter(d=>d.estado==='pendiente')
    .map(d=>({d,t:trabs.find(w=>w.id===d.trabajador_id)}))
    .sort((a,b)=>new Date(a.d.fecha_documento||0)-new Date(b.d.fecha_documento||0));
  const CHK_ICON={completo:"✅",proceso:"⏳",falta:"❌"};
  const CHK_COL={completo:C.green,proceso:C.yellow,falta:C.red};
  const card={background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:14};

  return (
    <div>
      <div style={{background:C.accentBg,border:`1px solid #bfdbfe`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.accentText}}>
        📋 <b>Documentos del personal (Fase 8D.5.1).</b> Vista transversal: estado documental de todos los trabajadores y bandeja de pendientes de firma. Solo lectura; las acciones se hacen en la ficha de cada trabajador.
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:16}}>
        <KPICard label="Pendientes de firma" value={cnt('pendiente')} color={cnt('pendiente')?C.yellow:C.green}/>
        <KPICard label="Firmados" value={cnt('firmado')} color={C.green}/>
        <KPICard label="Archivados" value={cnt('archivado')} color={C.accent}/>
        <KPICard label="Expedientes incompletos" value={`${incompletos.length} de ${trabs.length}`} color={incompletos.length?C.red:C.green}/>
      </div>

      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"0 0 8px"}}>Expedientes incompletos</p>
      {incompletos.length?(
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {incompletos.map(({t,chk})=>(
            <div key={t.id} style={{...card,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{fontWeight:600,fontSize:13,color:C.text,flex:1,minWidth:160}}>{t.nombre}{(t.estado==='DESVINCULADO'||!t.activo)&&<span style={{fontSize:11,color:C.red,fontWeight:400}}> · desvinculado</span>}</span>
              <span style={{fontSize:11,color:C.textMuted}}>{chk.completados}/{chk.total}</span>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {chk.items.filter(i=>i.st!=='completo').map(i=>(
                  <span key={i.tipo} style={{fontSize:11,padding:"2px 8px",borderRadius:12,border:`1px solid ${CHK_COL[i.st]}`,color:CHK_COL[i.st]}}>{CHK_ICON[i.st]} {i.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ):(
        <div style={{...card,textAlign:"center",color:C.green,fontSize:13,marginBottom:20}}>✅ Todos los expedientes están completos.</div>
      )}

      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:.4,margin:"0 0 8px"}}>Bandeja de pendientes de firma ({pendientesFirma.length})</p>
      <Panel noPad>
        <DataTable
          cols={[
            {key:"trab",label:"Trabajador",render:r=><span style={{fontWeight:500}}>{r.t?.nombre||r.d.trabajador_id}</span>},
            {key:"doc",label:"Documento",render:r=>`${TIPO_DOC_LABEL[r.d.tipo_documento]||r.d.tipo_documento}${r.d.version?` v${r.d.version}`:''}`},
            {key:"fecha",label:"Emitido",render:r=><span style={{color:C.textMuted}}>{dateOnly(r.d.fecha_documento)||"—"}</span>},
            {key:"acc",label:"",render:r=>r.t&&update?<button onClick={()=>pickAndUploadFirmado(r.d,r.t,update,quien)} style={{color:C.green,background:"none",border:`1px solid ${C.greenBorder}`,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:500}}>⬆️ Subir firmado</button>:null},
          ]}
          rows={pendientesFirma}
          empty="No hay documentos pendientes de firma. 🎉"
        />
      </Panel>
    </div>
  );
}

// ── Cierre Institucional de Egreso ────────────────────────────────
// Bandeja de Egresos: por cada DESVINCULADO rastrea 3 tareas de
// cumplimiento (finiquito a disposicion, DT, Previred/AFC) con sus
// plazos legales. EGRESO CERRADO se deriva, no se guarda.
const EST_EGRESO={
  pendiente:    {label:'Pendiente',     bg:'#fef9c3', color:'#a16207'},
  preparado:    {label:'Preparado',     bg:'#dbeafe', color:'#1d4ed8'},
  informado:    {label:'Informado',     bg:'#dcfce7', color:'#15803d'},
  notificado:   {label:'Notificado',    bg:'#dbeafe', color:'#1d4ed8'},
  a_disposicion:{label:'Finiq. + pago a disp.', bg:'#dcfce7', color:'#15803d'},
  pagado:       {label:'Pago efectuado', bg:'#dcfce7', color:'#15803d'},
  acreditado:   {label:'Acreditado',    bg:'#dcfce7', color:'#15803d'},
};
function PanelEgresos({data,insert,update}){
  const { perfil } = useAuth();
  useEffect(()=>{ getEmpresaConfig(); },[]);  // precarga empresa para el texto de notificación
  const [saving,setSaving]=useState(false);
  const [notifTgt,setNotifTgt]=useState(null); const [notifForm,setNotifForm]=useState({});
  const [pagoTgt,setPagoTgt]=useState(null);   const [pagoForm,setPagoForm]=useState({});
  const feriadosSet=buildFeriadosSet(data.feriados_chile||[]);
  const card={background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:14};
  const docs=data.documentos_trabajador||[];
  const rows=data.cumplimiento_egreso||[];
  const fmtD=d=>d?new Date(typeof d==='string'?d.split('T')[0]+'T12:00:00':d).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';

  const desvinculados=(data.trabajadores||[])
    .filter(t=>t.estado==='DESVINCULADO'||!t.activo)
    .sort((a,b)=>String(b.fecha_separacion||'').localeCompare(String(a.fecha_separacion||'')));

  const getTarea=(tid,tarea)=>rows.find(r=>r.trabajador_id===tid&&r.tarea===tarea);
  const finiquitoFirmado=tid=>docs.filter(d=>d.trabajador_id===tid&&d.tipo_documento==='finiquito'&&d.estado!=='anulado')
                                   .some(d=>d.estado==='firmado'||d.estado==='archivado');
  const textoNotif=t=>`Estimado/a ${t.nombre}:\n\nSe informa que su finiquito de término de contrato y el pago correspondiente se encuentran a su disposición para revisión y firma/ratificación, dentro del plazo establecido en el artículo 177 del Código del Trabajo.\n\nFavor coordinar fecha y lugar para la firma/ratificación.\n\nAtentamente,\n${empresaParaDoc(_empresaCfgCache).razon}`;

  // Plazos legales (días hábiles = lun-sáb, excluye domingo+feriados, ya verificado)
  const sepNoon=t=>t.fecha_separacion?new Date(t.fecha_separacion.split('T')[0]+'T12:00:00'):null; // evita corrimiento UTC de fechas date-only
  const plazoFiniquito=t=>{const s=sepNoon(t); return s?sumarDiasHabiles(s,10,feriadosSet):null;};  // Art.177
  function plazoDT(t){
    const l=(t.motivo_termino||'').toLowerCase();
    if(l.includes('renuncia')||l.includes('mutuo')) return {aplica:false,motivo:'Renuncia / mutuo acuerdo: sin aviso a la Inspección.'};
    if(l.includes('161')) return {aplica:true,tipo:'aviso30',texto:'Aviso 30 días previo o pago del mes sustitutivo.'};
    const n6=l.includes('n°6')||l.includes('n6')||l.includes('caso fortuito')||l.includes('fuerza mayor');
    const dias=n6?6:3;
    const s=sepNoon(t);
    return {aplica:true,tipo:'dias',dias,limite:s?sumarDiasHabiles(s,dias,feriadosSet):null};
  }
  function plazoPrevired(t){
    if(!t.fecha_separacion) return null;
    const d=new Date(t.fecha_separacion.split('T')[0]+'T12:00:00');
    const nm=d.getMonth()===11?0:d.getMonth()+1, ny=d.getMonth()===11?d.getFullYear()+1:d.getFullYear();
    return new Date(ny,nm,13,12,0,0);
  }
  function alerta(limite,completa){
    if(completa) return {txt:'✓ Cumplido',color:'#15803d'};
    if(!limite) return {txt:'sin fecha',color:C.textMuted};
    const hoy=new Date(); hoy.setHours(12,0,0,0);
    const dl=new Date(limite); dl.setHours(12,0,0,0);
    const diff=Math.round((dl-hoy)/86400000);
    if(diff<0)  return {txt:`Vencido hace ${-diff} día(s)`,color:'#dc2626'};
    if(diff===0)return {txt:'Vence hoy',color:'#dc2626'};
    if(diff<=2) return {txt:`Vence en ${diff} día(s)`,color:'#a16207'};
    return {txt:`Vence en ${diff} día(s)`,color:C.textMuted};
  }

  async function setEstado(t,tarea,estado,extra={}){
    setSaving(true);
    const ex=getTarea(t.id,tarea);
    const rec={trabajador_id:t.id,tarea,estado,...extra,updated_at:new Date().toISOString()};
    if(estado==='informado'||estado==='a_disposicion') rec.fecha_informado=new Date().toISOString();
    if(ex) await update('cumplimiento_egreso',{...ex,...rec});
    else   await insert('cumplimiento_egreso',rec);
    setSaving(false);
  }
  const cotizAplica=t=>{const l=(t.motivo_termino||'').toLowerCase(); return !(l.includes('renuncia')||l.includes('mutuo'));};
  const abrirNotif=t=>{setNotifForm({medio:'correo',correo:t.correo_notificaciones||t.email||'',asunto:'Finiquito y pago a su disposición',texto:textoNotif(t)});setNotifTgt(t);};
  const guardarNotif=async()=>{const t=notifTgt;setNotifTgt(null);await setEstado(t,'finiquito','notificado',{medio:notifForm.medio,notif_fecha:new Date().toISOString(),notif_correo:notifForm.correo,notif_asunto:notifForm.asunto,notif_texto:notifForm.texto});};
  const abrirPago=t=>{setPagoForm({fecha:new Date().toISOString().slice(0,10),medio:'transferencia',monto:''});setPagoTgt(t);};
  const guardarPago=async()=>{const t=pagoTgt;setPagoTgt(null);await setEstado(t,'pago','pagado',{pago_fecha:pagoForm.fecha,pago_medio:pagoForm.medio,pago_monto:Number(pagoForm.monto)||null});};

  const btn=(label,onClick,scheme='accent')=>(
    <button disabled={saving} onClick={onClick} style={{
      background:scheme==='accent'?C.accent:scheme==='green'?'#15803d':C.surface,
      color:scheme==='ghost'?C.textMuted:'#fff',border:scheme==='ghost'?`1px solid ${C.border}`:'none',
      borderRadius:6,padding:'5px 11px',fontSize:11.5,fontWeight:600,cursor:saving?'default':'pointer',opacity:saving?0.6:1}}>{label}</button>
  );
  const estTag=e=>{const s=EST_EGRESO[e]||{label:e,bg:'#f1f5f9',color:'#64748b'};return <span style={{fontSize:11,padding:'2px 9px',background:s.bg,color:s.color,borderRadius:12,fontWeight:700}}>{s.label}</span>;};

  // fila de tarea genérica
  const TareaRow=({titulo,sub,limite,estadoActual,completa,acciones})=>{
    const a=alerta(limite,completa);
    return (
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,padding:'9px 0',borderTop:`1px solid ${C.border}`,flexWrap:'wrap'}}>
        <div style={{minWidth:200,flex:1}}>
          <div style={{fontSize:12.5,fontWeight:600,color:C.text}}>{titulo} &nbsp;{estTag(estadoActual)}</div>
          <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{sub}</div>
          {limite!==undefined&&<div style={{fontSize:11,fontWeight:600,color:a.color,marginTop:2}}>{limite?`Plazo: ${fmtD(limite)} · ${a.txt}`:a.txt}</div>}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>{acciones}</div>
      </div>
    );
  };

  if(desvinculados.length===0) return (
    <div style={{...card,textAlign:'center',color:C.textMuted,fontSize:13}}>No hay trabajadores desvinculados con egreso por gestionar.</div>
  );

  return (
    <div>
      <div style={{background:'#eff6ff',border:`1px solid #bfdbfe`,borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:12,color:'#1e40af'}}>
        📂 <b>Cierre Institucional de Egreso.</b> Por cada desvinculado: finiquito <b>y su pago</b> a disposición (10 días hábiles, Art. 177), pago efectuado, copia a la DT (Art. 162), planilla Previred/AFC (día 13 mes siguiente) y cotizaciones acreditadas (causales del empleador). El ERP <b>prepara y controla</b>; el trámite se hace en cada portal y se marca aquí. EGRESO CERRADO = finiquito firmado + finiquito y pago a disposición + pago efectuado + DT informado + Previred informado + cotizaciones acreditadas (si aplica).
      </div>
      {desvinculados.map(t=>{
        const fqFirm=finiquitoFirmado(t.id);
        const fq=getTarea(t.id,'finiquito'), pago=getTarea(t.id,'pago'), dt=getTarea(t.id,'dt'), pv=getTarea(t.id,'previred'), cot=getTarea(t.id,'cotizaciones');
        const fqEstado=fq?.estado||'pendiente', pagoEstado=pago?.estado||'pendiente', dtEstado=dt?.estado||'pendiente', pvEstado=pv?.estado||'pendiente', cotEstado=cot?.estado||'pendiente';
        const dtInfo=plazoDT(t);
        const dtListo=!dtInfo.aplica||dtEstado==='informado';
        const cotApl=cotizAplica(t), cotListo=!cotApl||cotEstado==='acreditado';
        const cerrado = fqFirm && fqEstado==='a_disposicion' && pagoEstado==='pagado' && dtListo && pvEstado==='informado' && cotListo;
        return (
          <div key={t.id} style={{...card,marginBottom:12,borderLeft:`4px solid ${cerrado?'#15803d':C.accent}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{t.nombre} <span style={{fontSize:12,color:C.textMuted,fontWeight:400}}>· {t.rut||'—'}</span></div>
                <div style={{fontSize:11.5,color:C.textMuted,marginTop:2}}>Separación: <b>{fmtD(t.fecha_separacion)}</b> · {t.motivo_termino||'—'}</div>
              </div>
              {cerrado
                ? <span style={{fontSize:12,fontWeight:700,padding:'4px 12px',background:'#dcfce7',color:'#15803d',borderRadius:14}}>✅ EGRESO CERRADO</span>
                : <span style={{fontSize:11.5,fontWeight:600,padding:'4px 12px',background:'#fef9c3',color:'#a16207',borderRadius:14}}>En proceso</span>}
            </div>

            {/* Capa 1: finiquito firmado (documento) */}
            <div style={{fontSize:11.5,marginTop:10,color:fqFirm?'#15803d':'#a16207'}}>
              {fqFirm?'✓ Finiquito firmado (documento en expediente)':'⏳ Finiquito aún no firmado en el expediente'}
            </div>

            {/* Tarea: Finiquito y pago a disposición (Art. 177) */}
            <TareaRow
              titulo="Finiquito y pago a disposición"
              sub={`Art. 177 · finiquito + su pago a disposición · 10 días hábiles${fq?.medio?` · notificado por ${fq.medio}${fq.notif_fecha?` el ${fmtD(fq.notif_fecha)}`:''}${fq.notif_correo?` (${fq.notif_correo})`:''}`:''}${fq?.responsable&&fqEstado==='a_disposicion'?` · responsable: ${fq.responsable}`:''}`}
              limite={plazoFiniquito(t)}
              estadoActual={fqEstado}
              completa={fqEstado==='a_disposicion'}
              acciones={<>
                {fqEstado!=='a_disposicion'&&btn('📋 Texto correo',()=>{const txt=textoNotif(t); if(navigator.clipboard?.writeText){navigator.clipboard.writeText(txt).then(()=>alert('Texto copiado. Pégalo en tu correo al trabajador.'),()=>window.prompt('Copia este texto para el correo:',txt));}else window.prompt('Copia este texto para el correo:',txt);},'ghost')}
                {fqEstado==='pendiente'&&btn('Registrar notificación',()=>abrirNotif(t))}
                {fqEstado==='notificado'&&btn('Marcar finiquito + pago a disposición',()=>setEstado(t,'finiquito','a_disposicion',{responsable:perfil?.nombre||'—'}),'green')}
                {fqEstado==='a_disposicion'&&btn('Reabrir',()=>setEstado(t,'finiquito','pendiente',{fecha_informado:null,responsable:null}),'ghost')}
              </>}
            />

            {/* Tarea: Pago efectuado (cierre administrativo) */}
            <TareaRow
              titulo="Pago efectuado"
              sub={pago?.pago_fecha?`Pagado el ${fmtD(pago.pago_fecha)}${pago.pago_medio?` · ${pago.pago_medio}`:''}${pago.pago_monto?` · ${clp(pago.pago_monto)}`:''}`:'Cierre administrativo (no exigido por Art. 177, pero recomendado)'}
              estadoActual={pagoEstado==='pagado'?'pagado':'pendiente'}
              completa={pagoEstado==='pagado'}
              acciones={<>
                {pagoEstado!=='pagado'&&btn('Registrar pago',()=>abrirPago(t),'green')}
                {pagoEstado==='pagado'&&btn('Reabrir',()=>setEstado(t,'pago','pendiente',{pago_fecha:null,pago_medio:null,pago_monto:null}),'ghost')}
              </>}
            />

            {/* Tarea 2: DT */}
            <TareaRow
              titulo="Dirección del Trabajo"
              sub={dtInfo.aplica?(dtInfo.tipo==='aviso30'?dtInfo.texto:`Copia carta de aviso · ${dtInfo.dias} días hábiles (Art. 162)`):dtInfo.motivo}
              limite={dtInfo.aplica&&dtInfo.tipo==='dias'?dtInfo.limite:undefined}
              estadoActual={dtInfo.aplica?dtEstado:'informado'}
              completa={dtListo}
              acciones={dtInfo.aplica?<>
                {dtEstado==='pendiente'&&btn('Marcar preparado',()=>setEstado(t,'dt','preparado'))}
                {dtEstado==='preparado'&&btn('Marcar informado',()=>setEstado(t,'dt','informado'),'green')}
                {dtEstado==='informado'&&btn('Reabrir',()=>setEstado(t,'dt','pendiente',{fecha_informado:null}),'ghost')}
              </>:<span style={{fontSize:11,color:C.textMuted}}>No aplica</span>}
            />

            {/* Tarea 3: Previred/AFC */}
            <TareaRow
              titulo="Previred / AFC"
              sub="Planilla mensual con movimiento de término (incluye cesantía) · día 13 mes siguiente"
              limite={plazoPrevired(t)}
              estadoActual={pvEstado}
              completa={pvEstado==='informado'}
              acciones={<>
                {pvEstado==='pendiente'&&btn('Marcar preparado',()=>setEstado(t,'previred','preparado'))}
                {pvEstado==='preparado'&&btn('Marcar informado',()=>setEstado(t,'previred','informado'),'green')}
                {pvEstado==='informado'&&btn('Reabrir',()=>setEstado(t,'previred','pendiente',{fecha_informado:null}),'ghost')}
              </>}
            />

            {/* Tarea: Cotizaciones acreditadas — solo causales del empleador */}
            {cotApl&&<TareaRow
              titulo="Cotizaciones acreditadas"
              sub="Certificado de cotizaciones previsionales al día · respaldo documental para causales del Art. 162 (sube el certificado al expediente)"
              estadoActual={cotEstado}
              completa={cotEstado==='acreditado'}
              acciones={<>
                {cotEstado!=='acreditado'&&btn('Marcar acreditado',()=>setEstado(t,'cotizaciones','acreditado'),'green')}
                {cotEstado==='acreditado'&&btn('Reabrir',()=>setEstado(t,'cotizaciones','pendiente'),'ghost')}
              </>}
            />}
          </div>
        );
      })}

      {notifTgt&&(
        <div onClick={()=>setNotifTgt(null)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{...card,maxWidth:520,width:'100%',maxHeight:'90vh',overflow:'auto'}}>
            <p style={{fontWeight:700,fontSize:14,margin:'0 0 4px'}}>Registrar notificación · {notifTgt.nombre}</p>
            <p style={{fontSize:11,color:C.textMuted,margin:'0 0 12px'}}>Acta de lo comunicado. Envía el correo desde tu cuenta y sube el comprobante al expediente del trabajador.</p>
            <FL label="Medio"><select style={INP} value={notifForm.medio} onChange={e=>setNotifForm({...notifForm,medio:e.target.value})}><option value="correo">Correo</option><option value="whatsapp">WhatsApp</option><option value="carta">Carta certificada</option><option value="notaria">Citación notaría</option><option value="midt">Mi DT</option></select></FL>
            <FL label="Correo / destinatario"><input style={INP} value={notifForm.correo} onChange={e=>setNotifForm({...notifForm,correo:e.target.value})}/></FL>
            <FL label="Asunto"><input style={INP} value={notifForm.asunto} onChange={e=>setNotifForm({...notifForm,asunto:e.target.value})}/></FL>
            <FL label="Texto comunicado"><textarea style={{...INP,minHeight:120,fontFamily:'inherit'}} value={notifForm.texto} onChange={e=>setNotifForm({...notifForm,texto:e.target.value})}/></FL>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              {btn('Cancelar',()=>setNotifTgt(null),'ghost')}
              {btn('Guardar notificación',guardarNotif,'green')}
            </div>
          </div>
        </div>
      )}

      {pagoTgt&&(
        <div onClick={()=>setPagoTgt(null)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{...card,maxWidth:420,width:'100%'}}>
            <p style={{fontWeight:700,fontSize:14,margin:'0 0 12px'}}>Registrar pago efectuado · {pagoTgt.nombre}</p>
            <FL label="Fecha de pago"><input type="date" style={INP} value={pagoForm.fecha} onChange={e=>setPagoForm({...pagoForm,fecha:e.target.value})}/></FL>
            <FL label="Medio de pago"><select style={INP} value={pagoForm.medio} onChange={e=>setPagoForm({...pagoForm,medio:e.target.value})}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="vale_vista">Vale vista</option></select></FL>
            <FL label="Monto ($)"><input type="number" style={INP} value={pagoForm.monto} onChange={e=>setPagoForm({...pagoForm,monto:e.target.value})}/></FL>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              {btn('Cancelar',()=>setPagoTgt(null),'ghost')}
              {btn('Guardar pago',guardarPago,'green')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cumplimiento({data,insert,update}){
  const hoy=new Date();
  const todayStr=hoy.toISOString().slice(0,10);
  const periodoActual=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [periodoVer,setPeriodoVer]=useState(periodoActual);
  const [saving,setSaving]=useState(false);
  const [vista,setVista]=useState('obligaciones');  // obligaciones mensuales | documentos del personal (8D.6)

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
      <PageHeader title="Cumplimiento" subtitle="Obligaciones mensuales y documentación del personal"/>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[['obligaciones','Obligaciones mensuales'],['documentos','Documentos del personal'],['egresos','Egresos']].map(([k,l])=>(
          <button key={k} onClick={()=>setVista(k)} style={{background:vista===k?C.accent:'transparent',color:vista===k?'#fff':C.textMuted,border:`1px solid ${vista===k?C.accent:C.border}`,borderRadius:6,padding:'5px 14px',fontSize:12,cursor:'pointer',fontWeight:vista===k?600:400}}>{l}</button>
        ))}
      </div>
      {vista==='documentos'&&<PanelDocumentosPendientes data={data} update={update}/>}
      {vista==='egresos'&&<PanelEgresos data={data} insert={insert} update={update}/>}
      {vista==='obligaciones'&&(<>
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
      </>)}
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

/* ─── Configuración de Empresa (cimiento administrativo) ────── */
let _empresaCfgCache = null;
async function getEmpresaConfig(force){
  if(_empresaCfgCache && !force) return _empresaCfgCache;
  try{
    let {data}=await supabase.from('empresa_config').select('*').eq('actual',true).order('updated_at',{ascending:false}).limit(1);
    if(!data||!data.length){ const r=await supabase.from('empresa_config').select('*').limit(1); data=r.data; }
    if(data&&data.length){ _empresaCfgCache=data[0]; return data[0]; }
  }catch(e){}
  return null;
}
function CampoEmpresa({cfg,set,k,label,placeholder,full}){
  return (
    <div style={{gridColumn:full?'1 / -1':'auto'}}>
      <label style={{display:'block',fontSize:12,color:C.textMuted,marginBottom:4,fontWeight:600}}>{label}</label>
      <input style={INP} value={cfg[k]||''} onChange={e=>set(k,e.target.value)} placeholder={placeholder||''}/>
    </div>
  );
}
function BloqueEmpresa({titulo,children}){
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'16px 18px',marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:800,color:C.text,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12}}>{titulo}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>{children}</div>
    </div>
  );
}
function ConfiguracionEmpresa(){
  const [cfg,setCfg]=useState(null);
  const [cargando,setCargando]=useState(true);
  const [guardando,setGuardando]=useState(false);
  const [msg,setMsg]=useState('');
  useEffect(()=>{ let vivo=true; (async()=>{ const c=await getEmpresaConfig(true); if(vivo){ setCfg(c||{}); setCargando(false); } })(); return ()=>{vivo=false;}; },[]);
  const set=(k,v)=>setCfg(p=>({...p,[k]:v}));
  const guardar=async()=>{
    if(!cfg||!cfg.id){ setMsg('No se encontró el registro de empresa. Ejecuta primero el SQL de empresa_config.'); return; }
    setGuardando(true); setMsg('');
    const {id, updated_at, ...campos}=cfg;
    const {error}=await supabase.from('empresa_config').update({...campos,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){ setMsg('No se pudo guardar. '+(error.message||'')); }
    else { setMsg('Cambios guardados.'); await getEmpresaConfig(true); }
    setGuardando(false);
  };
  if(cargando) return <div style={{padding:24,color:C.textMuted}}>Cargando configuración…</div>;
  const ok = msg.startsWith('Cambios');
  return (
    <div style={{maxWidth:980,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{margin:0,fontSize:20,color:C.text}}>Configuración de Empresa</h2>
          <p style={{margin:'4px 0 0',fontSize:12,color:C.textMuted,maxWidth:620}}>Datos de la empresa usuaria del ERP. Los documentos (contratos, anexos, liquidaciones, finiquitos, informes) leerán estos datos desde aquí, no desde valores fijos en el código.</p>
        </div>
        <button onClick={guardar} disabled={guardando} style={{background:guardando?C.border:C.accent,color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:guardando?'default':'pointer',whiteSpace:'nowrap'}}>{guardando?'Guardando…':'Guardar cambios'}</button>
      </div>
      {msg&&<div style={{marginBottom:14,fontSize:13,color:ok?C.green:C.red,background:ok?C.greenBg:C.redBg,border:`1px solid ${ok?C.greenBorder:C.redBorder}`,borderRadius:8,padding:'8px 12px'}}>{msg}</div>}
      <BloqueEmpresa titulo="Identificación legal">
        <CampoEmpresa cfg={cfg} set={set} k="razon_social" label="Razón social" full/>
        <CampoEmpresa cfg={cfg} set={set} k="nombre_fantasia" label="Nombre de fantasía"/>
        <CampoEmpresa cfg={cfg} set={set} k="rut" label="RUT"/>
        <CampoEmpresa cfg={cfg} set={set} k="giro" label="Giro / actividad económica"/>
        <CampoEmpresa cfg={cfg} set={set} k="domicilio" label="Domicilio legal"/>
        <CampoEmpresa cfg={cfg} set={set} k="ciudad" label="Ciudad"/>
        <CampoEmpresa cfg={cfg} set={set} k="region" label="Región"/>
        <CampoEmpresa cfg={cfg} set={set} k="pais" label="País"/>
      </BloqueEmpresa>
      <BloqueEmpresa titulo="Representante legal">
        <CampoEmpresa cfg={cfg} set={set} k="rep_nombre" label="Nombre"/>
        <CampoEmpresa cfg={cfg} set={set} k="rep_rut" label="RUT"/>
        <CampoEmpresa cfg={cfg} set={set} k="rep_cargo" label="Cargo"/>
      </BloqueEmpresa>
      <BloqueEmpresa titulo="Contacto institucional">
        <CampoEmpresa cfg={cfg} set={set} k="correo_admin" label="Correo administración"/>
        <CampoEmpresa cfg={cfg} set={set} k="correo_general" label="Correo general"/>
        <CampoEmpresa cfg={cfg} set={set} k="telefono" label="Teléfono"/>
        <CampoEmpresa cfg={cfg} set={set} k="sitio_web" label="Sitio web"/>
        <CampoEmpresa cfg={cfg} set={set} k="logo_url" label="Logo (URL)" full/>
      </BloqueEmpresa>
      <BloqueEmpresa titulo="Datos laborales">
        <CampoEmpresa cfg={cfg} set={set} k="mutualidad" label="Organismo administrador (Mutualidad)"/>
        <CampoEmpresa cfg={cfg} set={set} k="caja_compensacion" label="Caja de Compensación"/>
      </BloqueEmpresa>
      <BloqueEmpresa titulo="Datos documentales">
        <CampoEmpresa cfg={cfg} set={set} k="ciudad_emision" label="Ciudad de emisión"/>
        <CampoEmpresa cfg={cfg} set={set} k="firmante_nombre" label="Firmante operativo"/>
        <CampoEmpresa cfg={cfg} set={set} k="firmante_cargo" label="Cargo firmante"/>
        <CampoEmpresa cfg={cfg} set={set} k="firmante_correo" label="Correo firmante"/>
        <CampoEmpresa cfg={cfg} set={set} k="firmante_telefono" label="Teléfono firmante"/>
      </BloqueEmpresa>
      <BloqueEmpresa titulo="Datos bancarios">
        <CampoEmpresa cfg={cfg} set={set} k="banco" label="Banco"/>
        <CampoEmpresa cfg={cfg} set={set} k="tipo_cuenta" label="Tipo de cuenta"/>
        <CampoEmpresa cfg={cfg} set={set} k="numero_cuenta" label="Número de cuenta"/>
        <CampoEmpresa cfg={cfg} set={set} k="titular_cuenta" label="Titular de la cuenta"/>
        <CampoEmpresa cfg={cfg} set={set} k="rut_titular" label="RUT titular"/>
      </BloqueEmpresa>
      <div style={{fontSize:11,color:C.textDim,marginTop:4,marginBottom:24}}>Las tasas previsionales no se editan aquí: viven en Parámetros Legales.</div>
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
  const {data,loading,dbMode,insert,update,saveRem,saveAsignacion,terminarAsignacion,reload}=useData();
  const { user, perfil, loading: authLoading } = useAuth();
  useEffect(() => { if (user) reload(); }, [user]);
if(authLoading) return <Spinner/>;
if(!user && !depQR) return <Login/>;
if(user && !perfil) return <Spinner/>;
if(perfil?.rol === 'trabajador') return <PortalTrabajador />;

  if(loading||!data)return<Spinner/>;
  if(depQR)return<CanalQR depId={depQR} loading={loading}/>;

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
        {tab==="dashboard"      &&<Dashboard      data={data} contratoId={contratoId} insert={insert} update={update} setTab={setTab}/>}
        {tab==="contratos"      &&<Contratos       data={data} insert={insert} update={update}/>}
        {tab==="dependencias"   &&<Dependencias    data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="trabajadores"   &&<Trabajadores    data={data} insert={insert} update={update} saveAsignacion={saveAsignacion} terminarAsignacion={terminarAsignacion} contratoId={contratoId}/>}
        {tab==="evidencias"    &&<TabEvidencias   data={data} contratoId={contratoId}/>}
        {tab==="qr"            &&<TabQR           data={data} contratoId={contratoId}/>}
        {tab==="asistencia"     &&<Asistencia      data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="checklist"      &&<Checklist       data={data} contratoId={contratoId} insert={insert}/>}
        {tab==="incidencias"    &&<Incidencias     data={data} contratoId={contratoId} insert={insert} update={update}/>}
        {tab==="supervisiones"  &&<Supervisiones   data={data} contratoId={contratoId} insert={insert}/>}
        {tab==="remuneraciones" &&<Remuneraciones  data={data} saveRem={saveRem} insert={insert} update={update}/>}
        {tab==="cumplimiento"   &&<Cumplimiento    data={data} insert={insert} update={update}/>}
        {tab==="informes"       &&<InformesIA      data={data} contratoId={contratoId}/>}
        {tab==="configuracion"  &&<ConfiguracionEmpresa/>}
        </div>
    </div>
  );
}
