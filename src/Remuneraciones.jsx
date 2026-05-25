import { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "./supabase.js";

/* ─── Paleta (igual que App.jsx) ─────────────────────────────── */
const C = {
  bg:"#0f1117", surface:"#1a1d27", border:"#2a2e42",
  accent:"#3b82f6", accentLight:"#60a5fa",
  green:"#22c55e", yellow:"#eab308", red:"#ef4444", purple:"#a855f7",
  teal:"#06b6d4", orange:"#f97316",
  text:"#f0f2f8", textMuted:"#8b92ad", textDim:"#525872",
};

/* ─── Formato CLP ─────────────────────────────────────────────── */
const clp = n => n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CL");
const pct = n => n == null ? "—" : (n * 100).toFixed(2) + "%";

/* ─── AFP rates (usados si Supabase no responde) ─────────────── */
const AFP_DEFAULT = [
  { nombre:"NO COTIZA", tasa_trabajador:0,      sis:0      },
  { nombre:"CAPITAL",   tasa_trabajador:0.1154,  sis:0.0162 },
  { nombre:"CUPRUM",    tasa_trabajador:0.1154,  sis:0.0162 },
  { nombre:"HABITAT",   tasa_trabajador:0.1137,  sis:0.0162 },
  { nombre:"PLANVITAL", tasa_trabajador:0.1126,  sis:0.0162 },
  { nombre:"PROVIDA",   tasa_trabajador:0.1155,  sis:0.0162 },
  { nombre:"MODELO",    tasa_trabajador:0.1068,  sis:0.0162 },
  { nombre:"UNO",       tasa_trabajador:0.1056,  sis:0.0162 },
];
const PARAMS_DEFAULT = {
  periodo:"2026-04", uf:38894.11, utm:68034, imm:500000,
  imm_joven:372989, tope_imponible_uf:84.3, horas_mensuales:180,
};
const CONTRATOS_TIPO = ["PLAZO FIJO","INDEFINIDO","BOLETA","JUBILADO","POR OBRA"];
const SALUD_OPTS     = ["FONASA","BANMEDICA","COLMENA","CONSALUD","CRUZ BLANCA","MASVIDA","VIDA TRES","FUSAT"];
const METODO_GRAT    = ["25% MENSUAL","ANTICIPO %","ANTICIPO $"];

/* ─── Cálculo de liquidación ────────────────────────────────── */
function calcLiq(w, params, tasaAfp, dias = 30, hextra = 0, otrosHab = 0, otrosDesc = 0) {
  const baseSueldo = (w.sueldo_base || 0);
  const prop       = Math.round(baseSueldo * dias / 30);
  const asist      = w.bono_asistencia   || 0;
  const movil      = w.bono_movilizacion || 0;
  const colac      = w.bono_colacion     || 0;
  const hMens      = params.horas_mensuales || 180;
  const hextraVal  = hextra > 0 ? Math.round((baseSueldo / hMens) * 1.5 * hextra) : 0;

  // Gratificación (sin referencia circular — base excluye la gratif misma)
  const baseGrat = prop + asist + hextraVal;
  let grat;
  if (w.metodo_gratificacion === "ANTICIPO %") {
    grat = Math.round(baseGrat * (w.valor_gratificacion || 0));
  } else if (w.metodo_gratificacion === "ANTICIPO $") {
    grat = Math.round(w.valor_gratificacion || 0);
  } else {
    grat = Math.round(Math.min(baseGrat * 0.25, params.imm * 4.75 / 12));
  }

  const tope      = (params.uf || 38894.11) * (params.tope_imponible_uf || 84.3);
  const remImp    = Math.min(prop + grat + asist + hextraVal, tope);
  const tasa      = tasaAfp?.tasa_trabajador || 0;
  const cotAfp    = Math.round(remImp * tasa);
  const cotSalud  = Math.round(remImp * 0.07);
  const cesTrab   = w.tipo_contrato === "INDEFINIDO" ? Math.round(remImp * 0.006) : 0;
  const totalDesc = cotAfp + cotSalud + cesTrab + (otrosDesc || 0);
  const totalHab  = prop + grat + asist + movil + colac + hextraVal + (otrosHab || 0);
  const liquido   = totalHab - totalDesc;
  const sis       = Math.round(remImp * 0.0162);
  const cesEmpl   = w.tipo_contrato === "INDEFINIDO"
    ? Math.round(remImp * 0.024)
    : Math.round(remImp * 0.03);

  return {
    sueldo_base: baseSueldo, dias_trabajados: dias,
    sueldo_proporcional: prop, gratificacion: grat,
    bono_asistencia: asist, bono_movilizacion: movil,
    bono_colacion: colac, horas_extra: hextra,
    horas_extra_valor: hextraVal, otros_haberes: otrosHab || 0,
    total_haberes: Math.round(totalHab),
    rem_imponible: Math.round(remImp),
    afp: w.afp || "—", tasa_afp: tasa,
    cotiz_afp: cotAfp, cotiz_salud: cotSalud,
    ces_trabajador: cesTrab, otros_descuentos: otrosDesc || 0,
    total_descuentos: totalDesc,
    liquido: Math.round(liquido),
    sis, ces_empleador: cesEmpl,
    costo_empresa: Math.round(totalHab + sis + cesEmpl),
  };
}

/* ─── Componentes base ──────────────────────────────────────── */
function Badge({ text, color }) {
  return <span style={{ background: color+"22", color, fontSize:11, fontWeight:600,
    padding:"2px 8px", borderRadius:4, letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{text}</span>;
}
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 20px" }}>
      <div style={{ color:C.textMuted, fontSize:11, marginBottom:6, fontWeight:500,
        textTransform:"uppercase", letterSpacing:"0.8px" }}>{label}</div>
      <div style={{ color:color||C.text, fontSize:26, fontWeight:700, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ color:C.textDim, fontSize:12, marginTop:6 }}>{sub}</div>}
    </div>
  );
}
function SHeader({ title, count }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
      <h2 style={{ color:C.text, fontSize:16, fontWeight:600, margin:0 }}>{title}</h2>
      {count !== undefined && <span style={{ background:C.accent+"22", color:C.accentLight,
        fontSize:12, padding:"1px 8px", borderRadius:10, fontWeight:600 }}>{count}</span>}
    </div>
  );
}
function Card({ children, accent }) {
  return <div style={{ background:C.surface, border:`1px solid ${accent?accent+"55":C.border}`,
    borderRadius:12, padding:20, marginBottom:16 }}>{children}</div>;
}
function FL({ label, children }) {
  return <div><label style={{ color:C.textMuted, fontSize:12, display:"block",
    marginBottom:4 }}>{label}</label>{children}</div>;
}
const INP = { width:"100%", background:"#0f1117", border:`1px solid #2a2e42`,
  borderRadius:8, padding:"8px 12px", color:"#f0f2f8", fontSize:13 };
function Btn({ onClick, color=C.accent, children, disabled, small }) {
  return <button onClick={onClick} disabled={disabled} style={{
    background:disabled?C.border:color, color:"#fff", border:"none", borderRadius:8,
    padding:small?"5px 12px":"8px 18px", fontSize:small?12:13, fontWeight:600,
    cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.6:1 }}>{children}</button>;
}
function BtnOut({ onClick, children, color }) {
  return <button onClick={onClick} style={{ background:"transparent",
    color:color||C.textMuted, border:`1px solid ${color||C.border}`,
    borderRadius:8, padding:"8px 16px", fontSize:13, cursor:"pointer" }}>{children}</button>;
}

/* ─── Hook de datos de remuneraciones ──────────────────────── */
function useRemData() {
  const [tasasAfp, setTasasAfp]     = useState(AFP_DEFAULT);
  const [params, setParams]         = useState([PARAMS_DEFAULT]);
  const [liquidaciones, setLiqs]    = useState([]);
  const [ready, setReady]           = useState(false);

  const reload = useCallback(async () => {
    if (!isConfigured || !supabase) { setReady(true); return; }
    try {
      const [t, p, l] = await Promise.all([
        supabase.from("tasas_afp").select("*").order("nombre"),
        supabase.from("parametros_legales").select("*").order("periodo", { ascending:false }),
        supabase.from("liquidaciones").select("*"),
      ]);
      if (t.data?.length) setTasasAfp(t.data);
      if (p.data?.length) setParams(p.data);
      if (l.data)         setLiqs(l.data);
    } catch(e) { console.warn("remdata:", e); }
    setReady(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { tasasAfp, params, liquidaciones, ready, reload };
}

/* ══════════════════════════════════════════════════════════════
   VISTA 1: PLANILLA DEL MES
══════════════════════════════════════════════════════════════ */
function Planilla({ data, contratoId, tasasAfp, params, liquidaciones, reload }) {
  const hoy     = new Date();
  const defPer  = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`;
  const [periodo, setPeriodo]   = useState(params[0]?.periodo || defPer);
  const [saving,  setSaving]    = useState(false);
  const [rows,    setRows]      = useState({});  // { workerId: { dias, hextra, otrosHab, otrosDesc } }

  const param = params.find(p => p.periodo === periodo) || params[0] || PARAMS_DEFAULT;

  // Trabajadores activos del contrato seleccionado (o todos)
  // Solo trabajadores ACTIVOS o en LICENCIA (no INACTIVO)
  // Solo contratos Vigentes o en Renovación para la planilla
  const workers = (data.trabajadores || []).filter(w => {
    const activo = w.estado === "ACTIVO" || w.estado === "LICENCIA";
    if (!contratoId) return activo;
    return activo && (w.contrato_id === parseInt(contratoId) || String(w.contrato_id) === contratoId);
  });

  // Verificar estado del contrato activo
  const contratoActual = contratoId
    ? (data.contratos||[]).find(c => String(c.id) === String(contratoId))
    : null;
  const contratoNoVigente = contratoActual && !["Vigente","Renovación"].includes(contratoActual.estado);

  // Merge filas editadas con liquidaciones guardadas en Supabase para este período
  const getRow = (w) => {
    const saved = liquidaciones.find(l => l.periodo === periodo &&
      l.trabajador_id === w.id && (!contratoId || String(l.contrato_id) === String(contratoId)));
    const edit  = rows[w.id] || {};
    return {
      dias:      edit.dias      ?? saved?.dias_trabajados ?? 30,
      hextra:    edit.hextra    ?? saved?.horas_extra     ?? 0,
      otrosHab:  edit.otrosHab  ?? saved?.otros_haberes   ?? 0,
      otrosDesc: edit.otrosDesc ?? saved?.otros_descuentos?? 0,
    };
  };

  const setRow = (wId, field, val) =>
    setRows(r => ({ ...r, [wId]: { ...(r[wId]||{}), [field]: Number(val) } }));

  const getTasaAfp = (afpNombre) =>
    tasasAfp.find(t => t.nombre === afpNombre) || { tasa_trabajador:0, sis:0 };

  // Guardar todo el período en Supabase
  const guardarPlanilla = async () => {
    if (!isConfigured || !supabase) { alert("Configura Supabase primero."); return; }
    setSaving(true);
    try {
      for (const w of workers) {
        const r   = getRow(w);
        const res = calcLiq(w, param, getTasaAfp(w.afp), r.dias, r.hextra, r.otrosHab, r.otrosDesc);
        const payload = {
          periodo, trabajador_id: w.id,
          contrato_id: parseInt(contratoId) || w.contrato_id || null,
          ...res,
        };
        // Upsert por periodo + trabajador_id + contrato_id
        const existing = liquidaciones.find(l => l.periodo === periodo &&
          l.trabajador_id === w.id &&
          String(l.contrato_id) === String(payload.contrato_id));
        if (existing) {
          await supabase.from("liquidaciones").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("liquidaciones").insert(payload);
        }
      }
      await reload();
      alert(`Planilla ${periodo} guardada correctamente.`);
    } catch(e) { alert("Error al guardar: " + e.message); }
    setSaving(false);
  };

  // Totales
  const totales = workers.reduce((acc, w) => {
    const r   = getRow(w);
    const res = calcLiq(w, param, getTasaAfp(w.afp), r.dias, r.hextra, r.otrosHab, r.otrosDesc);
    acc.haberes  += res.total_haberes;
    acc.desc     += res.total_descuentos;
    acc.liquido  += res.liquido;
    acc.costo    += res.costo_empresa;
    return acc;
  }, { haberes:0, desc:0, liquido:0, costo:0 });

  return (
    <div>
      {/* Encabezado y selector de período */}
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:20, flexWrap:"wrap" }}>
        <SHeader title="Planilla de Remuneraciones" />
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <FL label="Período">
            <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{ ...INP, width:140 }}>
              {params.map(p => <option key={p.periodo} value={p.periodo}>{p.periodo}</option>)}
            </select>
          </FL>
          <div style={{ marginTop:16 }}>
            <Btn onClick={guardarPlanilla} disabled={saving} color={C.green}>
              {saving ? "Guardando…" : "💾 Guardar planilla"}
            </Btn>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        <StatCard label="Trabajadores"    value={workers.length}      sub="en el período" />
        <StatCard label="Total haberes"   value={clp(totales.haberes)} color={C.teal} />
        <StatCard label="Total líquido"   value={clp(totales.liquido)} color={C.green} />
        <StatCard label="Costo empresa"   value={clp(totales.costo)}   color={C.yellow} />
      </div>

      {/* Aviso contrato no vigente */}
      {contratoNoVigente && (
        <div style={{ background:C.yellow+"15", border:`1px solid ${C.yellow}33`,
          borderRadius:10, padding:"10px 16px", marginBottom:16,
          color:C.yellow, fontSize:13 }}>
          ⚠️ El contrato <strong>{contratoActual.cliente || contratoActual.instalacion}</strong> tiene
          estado <strong>{contratoActual.estado}</strong>. Puedes ver los datos pero considera
          que {contratoActual.estado==="Postulación"
            ? "aún no ha sido adjudicado." : "está en proceso de cambio."}
        </div>
      )}

      {/* Tabla */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {["Trabajador","Contrato","Días","H.Extra","Sueldo base","Gratificación",
                "Imponible","AFP %","AFP $","Salud 7%","Ces. Trab.","Total desc.",
                "LÍQUIDO","Costo empresa"].map(h =>
                <th key={h} style={{ color:C.textMuted, fontWeight:500, fontSize:10,
                  textTransform:"uppercase", letterSpacing:"0.4px", padding:"8px 8px",
                  textAlign:"right", whiteSpace:"nowrap",
                  ...( h==="Trabajador"||h==="Contrato" ? {textAlign:"left"} : {}) }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 && (
              <tr><td colSpan={14} style={{ textAlign:"center", color:C.textDim,
                padding:"40px 0", fontSize:13 }}>
                Sin trabajadores en este contrato o período.
              </td></tr>
            )}
            {workers.map(w => {
              const r   = getRow(w);
              const res = calcLiq(w, param, getTasaAfp(w.afp), r.dias, r.hextra, r.otrosHab, r.otrosDesc);
              const ct  = (data.contratos||[]).find(c => c.id === w.contrato_id);
              return (
                <tr key={w.id} style={{ borderBottom:`1px solid ${C.border}22` }}>
                  <td style={{ padding:"10px 8px" }}>
                    <div style={{ color:C.text, fontWeight:500 }}>{w.nombre}</div>
                    <div style={{ color:C.textDim, fontSize:11 }}>{w.cargo}</div>
                  </td>
                  <td style={{ padding:"10px 8px" }}>
                    <div style={{ color:C.textMuted, fontSize:11, display:"flex",
                      flexDirection:"column", gap:3 }}>
                      <span>{ct?.cliente || ct?.instalacion || "—"}</span>
                      {ct?.estado && <Badge text={ct.estado}
                        color={ct.estado==="Vigente"?C.green:ct.estado==="Renovación"?C.teal:C.yellow} />}
                    </div>
                  </td>
                  {/* Días — editable */}
                  <td style={{ padding:"4px 8px" }}>
                    <input type="number" min={0} max={31} value={r.dias}
                      onChange={e=>setRow(w.id,"dias",e.target.value)}
                      style={{ ...INP, width:54, textAlign:"right", padding:"4px 6px" }} />
                  </td>
                  {/* Horas extra — editable */}
                  <td style={{ padding:"4px 8px" }}>
                    <input type="number" min={0} step={0.5} value={r.hextra}
                      onChange={e=>setRow(w.id,"hextra",e.target.value)}
                      style={{ ...INP, width:54, textAlign:"right", padding:"4px 6px" }} />
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textMuted }}>
                    {clp(res.sueldo_proporcional)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.teal }}>
                    {clp(res.gratificacion)}
                    {w.metodo_gratificacion && w.metodo_gratificacion !== "25% MENSUAL" &&
                      <span style={{ fontSize:9, color:C.yellow, marginLeft:4 }}>
                        {w.metodo_gratificacion === "ANTICIPO %" ? `${(w.valor_gratificacion||0)*100}%` : "$"}
                      </span>}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.accentLight, fontWeight:500 }}>
                    {clp(res.rem_imponible)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textMuted, fontSize:11 }}>
                    {pct(res.tasa_afp)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.red }}>
                    {clp(res.cotiz_afp)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.red }}>
                    {clp(res.cotiz_salud)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.red }}>
                    {clp(res.ces_trabajador)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.red, fontWeight:500 }}>
                    {clp(res.total_descuentos)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right",
                    color: res.liquido < 0 ? C.red : C.green, fontWeight:700, fontSize:13 }}>
                    {clp(res.liquido)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.yellow }}>
                    {clp(res.costo_empresa)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Fila totales */}
          {workers.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:`1px solid ${C.border}`, background:C.surface }}>
                <td colSpan={4} style={{ padding:"10px 8px", color:C.textMuted,
                  fontSize:11, fontWeight:600 }}>TOTALES — {workers.length} trabajadores</td>
                <td /><td /><td />
                <td style={{ padding:"10px 8px", textAlign:"right" }} />
                <td style={{ padding:"10px 8px", textAlign:"right", color:C.red, fontWeight:700 }}>
                  {clp(workers.reduce((a,w) => {
                    const r=getRow(w);
                    return a + calcLiq(w,param,getTasaAfp(w.afp),r.dias,r.hextra).cotiz_afp;
                  },0))}
                </td>
                <td style={{ padding:"10px 8px", textAlign:"right", color:C.red, fontWeight:700 }}>
                  {clp(workers.reduce((a,w) => {
                    const r=getRow(w);
                    return a + calcLiq(w,param,getTasaAfp(w.afp),r.dias,r.hextra).cotiz_salud;
                  },0))}
                </td>
                <td />
                <td style={{ padding:"10px 8px", textAlign:"right", color:C.red, fontWeight:700 }}>
                  {clp(totales.desc)}
                </td>
                <td style={{ padding:"10px 8px", textAlign:"right", color:C.green, fontWeight:700, fontSize:14 }}>
                  {clp(totales.liquido)}
                </td>
                <td style={{ padding:"10px 8px", textAlign:"right", color:C.yellow, fontWeight:700 }}>
                  {clp(totales.costo)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VISTA 2: LIQUIDACIÓN INDIVIDUAL
══════════════════════════════════════════════════════════════ */
function LiquidacionIndividual({ data, tasasAfp, params }) {
  const [wId, setWId]     = useState("");
  const [dias, setDias]   = useState(30);
  const [hex,  setHex]    = useState(0);
  const [print, setPrint] = useState(false);

  const param   = params[0] || PARAMS_DEFAULT;
  const workers = data.trabajadores || [];
  const w       = workers.find(x => String(x.id) === String(wId));
  const tasaAfp = w ? (tasasAfp.find(t => t.nombre === w.afp) || { tasa_trabajador:0, sis:0 }) : null;
  const res     = w ? calcLiq(w, param, tasaAfp, dias, hex) : null;

  const handlePrint = () => {
    setPrint(true);
    setTimeout(() => { window.print(); setPrint(false); }, 200);
  };

  const labelW = { color:C.textMuted, fontSize:12, fontWeight:500 };
  const valW   = { color:C.text, fontSize:13, textAlign:"right" };
  const impRow = (label, val, color=C.textMuted) => (
    <tr style={{ borderBottom:`1px solid ${C.border}22` }}>
      <td style={{ ...labelW, padding:"7px 12px" }}>{label}</td>
      <td style={{ ...valW, padding:"7px 12px", color }}>{clp(val)}</td>
    </tr>
  );

  return (
    <div>
      <SHeader title="Liquidación Individual" />
      <Card>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 120px 120px auto", gap:12, alignItems:"flex-end" }}>
          <FL label="Trabajador">
            <select value={wId} onChange={e=>setWId(e.target.value)} style={INP}>
              <option value="">— Seleccione —</option>
              {workers.map(w=><option key={w.id} value={w.id}>{w.nombre}</option>)}
            </select>
          </FL>
          <FL label="Días trabajados">
            <input type="number" min={0} max={31} value={dias}
              onChange={e=>setDias(Number(e.target.value))} style={INP} />
          </FL>
          <FL label="Horas extra">
            <input type="number" min={0} step={0.5} value={hex}
              onChange={e=>setHex(Number(e.target.value))} style={INP} />
          </FL>
          {res && <Btn onClick={handlePrint} color={C.teal}>🖨 Imprimir</Btn>}
        </div>
      </Card>

      {res && w && (
        <div id="liq-print" style={{ background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:12, overflow:"hidden" }}>
          {/* Encabezado */}
          <div style={{ background:C.accent, padding:"16px 20px" }}>
            <div style={{ color:"#fff", fontWeight:700, fontSize:15 }}>
              LIQUIDACIÓN DE SUELDO — {param.periodo}
            </div>
            <div style={{ color:"rgba(255,255,255,0.8)", fontSize:11, marginTop:2 }}>
              LEG Servicios de Limpieza y Mantención  ·  RUT 78.086.977-1
            </div>
          </div>

          {/* Datos trabajador */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0,
            borderBottom:`1px solid ${C.border}` }}>
            {[["Nombre",         w.nombre],
              ["RUT",            w.rut||"—"],
              ["Cargo",          w.cargo],
              ["AFP",            w.afp||"—"],
              ["Tipo contrato",  w.tipo_contrato||"—"],
              ["Salud",          w.salud||"—"],
            ].map(([k,v]) => (
              <div key={k} style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}22`,
                display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:C.textMuted, fontSize:12 }}>{k}</span>
                <span style={{ color:C.text, fontSize:13, fontWeight:500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Cálculo */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
            {/* Haberes */}
            <div style={{ borderRight:`1px solid ${C.border}` }}>
              <div style={{ background:C.border+"44", padding:"8px 12px",
                color:C.teal, fontSize:11, fontWeight:600, textTransform:"uppercase",
                letterSpacing:"0.5px" }}>Haberes</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <tbody>
                  {impRow("Sueldo base proporcional", res.sueldo_proporcional, C.text)}
                  {impRow("Gratificación legal", res.gratificacion, C.teal)}
                  {impRow("Bono asistencia", res.bono_asistencia)}
                  {impRow("Bono movilización", res.bono_movilizacion)}
                  {impRow("Bono colación",    res.bono_colacion)}
                  {res.horas_extra_valor > 0 && impRow(`Horas extra (${hex}h)`, res.horas_extra_valor, C.orange)}
                  {res.otros_haberes > 0     && impRow("Otros haberes", res.otros_haberes)}
                  <tr style={{ background:C.teal+"18" }}>
                    <td style={{ padding:"10px 12px", color:C.teal, fontWeight:700, fontSize:13 }}>Total haberes</td>
                    <td style={{ padding:"10px 12px", textAlign:"right", color:C.teal, fontWeight:700, fontSize:14 }}>{clp(res.total_haberes)}</td>
                  </tr>
                  <tr style={{ background:C.accent+"22", borderTop:`1px solid ${C.accent}33` }}>
                    <td style={{ padding:"10px 12px", color:C.accentLight, fontWeight:600, fontSize:12 }}>
                      Base imponible
                      <div style={{ fontSize:10, color:C.textDim, fontWeight:400 }}>base para cotizaciones</div>
                    </td>
                    <td style={{ padding:"10px 12px", textAlign:"right", color:C.accentLight, fontWeight:700, fontSize:14 }}>{clp(res.rem_imponible)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Descuentos */}
            <div>
              <div style={{ background:C.border+"44", padding:"8px 12px",
                color:C.red, fontSize:11, fontWeight:600, textTransform:"uppercase",
                letterSpacing:"0.5px" }}>Descuentos legales</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <tbody>
                  {impRow(`AFP ${w.afp} (${pct(res.tasa_afp)})`, res.cotiz_afp, C.red)}
                  {impRow("Salud FONASA/ISAPRE (7%)", res.cotiz_salud, C.red)}
                  {impRow(w.tipo_contrato==="INDEFINIDO" ? "Seg. cesantía (0,6%)" : "Seg. cesantía (empl.)", res.ces_trabajador, C.red)}
                  {res.otros_descuentos > 0 && impRow("Otros descuentos", res.otros_descuentos, C.red)}
                  <tr style={{ background:C.red+"18" }}>
                    <td style={{ padding:"10px 12px", color:C.red, fontWeight:700, fontSize:13 }}>Total descuentos</td>
                    <td style={{ padding:"10px 12px", textAlign:"right", color:C.red, fontWeight:700, fontSize:14 }}>{clp(res.total_descuentos)}</td>
                  </tr>
                  <tr><td colSpan={2} style={{ padding:6 }} /></tr>
                  <tr style={{ background:C.border+"33" }}>
                    <td style={{ padding:"8px 12px", color:C.textMuted, fontSize:11 }}>SIS (empleador)</td>
                    <td style={{ padding:"8px 12px", textAlign:"right", color:C.textDim, fontSize:12 }}>{clp(res.sis)}</td>
                  </tr>
                  <tr style={{ background:C.border+"33" }}>
                    <td style={{ padding:"8px 12px", color:C.textMuted, fontSize:11 }}>Ces. empleador</td>
                    <td style={{ padding:"8px 12px", textAlign:"right", color:C.textDim, fontSize:12 }}>{clp(res.ces_empleador)}</td>
                  </tr>
                  <tr style={{ background:C.border+"33" }}>
                    <td style={{ padding:"8px 12px", color:C.textMuted, fontSize:11 }}>Costo empresa</td>
                    <td style={{ padding:"8px 12px", textAlign:"right", color:C.yellow, fontWeight:600 }}>{clp(res.costo_empresa)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Líquido a pagar */}
          <div style={{ background:C.green+"18", borderTop:`1px solid ${C.green}44`,
            padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ color:C.green, fontWeight:600, fontSize:14, textTransform:"uppercase",
              letterSpacing:"0.5px" }}>Líquido a pagar</span>
            <span style={{ color:C.green, fontWeight:700, fontSize:22 }}>{clp(res.liquido)}</span>
          </div>

          {/* Firmas */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0,
            borderTop:`1px solid ${C.border}`, padding:"20px 16px" }}>
            {["Firma trabajador","Firma empleador / RRHH"].map(label => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ borderBottom:`1px solid ${C.textDim}`, width:180,
                  margin:"0 auto 8px", paddingBottom:24 }} />
                <div style={{ color:C.textDim, fontSize:11 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@media print {
        body > *:not(#liq-print-wrapper) { display:none; }
        #liq-print { border:none !important; background:#fff !important; color:#000 !important; }
        #liq-print * { color:#000 !important; background:#fff !important; border-color:#ccc !important; }
      }`}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VISTA 3: CONFIGURACIÓN TRABAJADORES (campos RR.HH.)
══════════════════════════════════════════════════════════════ */
function ConfigTrabajadores({ data, tasasAfp }) {
  const [editing, setEditing]   = useState(null);
  const [saving,  setSaving]    = useState(false);
  const [form,    setForm]      = useState({});

  const workers = data.trabajadores || [];
  const activos   = workers.filter(w => w.estado === "ACTIVO").length;
  const inactivos = workers.filter(w => w.estado === "INACTIVO").length;
  const startEdit = (w) => { setEditing(w.id); setForm({ ...w }); };
  const cancel    = ()  => { setEditing(null); setForm({}); };

  const guardar = async () => {
    if (!isConfigured || !supabase) { alert("Configura Supabase."); return; }
    setSaving(true);
    const { error } = await supabase.from("trabajadores").update({
      rut:                  form.rut,
      sueldo_base:          parseInt(form.sueldo_base) || 0,
      tipo_contrato:        form.tipo_contrato,
      afp:                  form.afp,
      salud:                form.salud,
      bono_asistencia:      parseInt(form.bono_asistencia)  || 0,
      bono_movilizacion:    parseInt(form.bono_movilizacion)|| 0,
      bono_colacion:        parseInt(form.bono_colacion)    || 0,
      metodo_gratificacion: form.metodo_gratificacion,
      valor_gratificacion:  parseFloat(form.valor_gratificacion) || 0,
      estado:               form.estado,
    }).eq("id", form.id);
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    cancel();
    window.location.reload();
  };

  return (
    <div>
      <SHeader title="Configuración RR.HH." count={workers.length} />
      <div style={{ display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" }}>
        <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
          Configure los datos de remuneraciones. Solo los trabajadores{" "}
          <Badge text="ACTIVO" color={C.green} /> pueden editarse —
          los <Badge text="INACTIVO" color={C.red} /> son de solo lectura.
          Estos datos son compartidos con el módulo CheckList.
        </p>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
          <Badge text={`${activos} activos`}   color={C.green} />
          <Badge text={`${inactivos} inactivos`} color={C.textDim} />
        </div>
      </div>

      {editing !== null ? (
        /* ── Formulario de edición ── */
        <Card accent={C.accent}>
          <div style={{ color:C.accentLight, fontSize:12, fontWeight:600,
            textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:16 }}>
            Editando: {form.nombre}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
            <FL label="RUT">
              <input style={INP} value={form.rut||""} onChange={e=>setForm(f=>({...f,rut:e.target.value}))} placeholder="12.345.678-9" />
            </FL>
            <FL label="Sueldo base ($)">
              <input style={INP} type="number" value={form.sueldo_base||""} onChange={e=>setForm(f=>({...f,sueldo_base:e.target.value}))} />
            </FL>
            <FL label="Tipo contrato">
              <select style={INP} value={form.tipo_contrato||"PLAZO FIJO"} onChange={e=>setForm(f=>({...f,tipo_contrato:e.target.value}))}>
                {CONTRATOS_TIPO.map(t=><option key={t}>{t}</option>)}
              </select>
            </FL>
            <FL label="AFP">
              <select style={INP} value={form.afp||"MODELO"} onChange={e=>setForm(f=>({...f,afp:e.target.value}))}>
                {(tasasAfp.length ? tasasAfp : AFP_DEFAULT).map(t=><option key={t.nombre}>{t.nombre}</option>)}
              </select>
            </FL>
            <FL label="Salud">
              <select style={INP} value={form.salud||"FONASA"} onChange={e=>setForm(f=>({...f,salud:e.target.value}))}>
                {SALUD_OPTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </FL>
            <FL label="Estado">
              <select style={INP} value={form.estado||"ACTIVO"} onChange={e=>setForm(f=>({...f,estado:e.target.value}))}>
                {["ACTIVO","INACTIVO","LICENCIA"].map(s=><option key={s}>{s}</option>)}
              </select>
            </FL>
            <FL label="Bono asistencia ($)">
              <input style={INP} type="number" value={form.bono_asistencia||0} onChange={e=>setForm(f=>({...f,bono_asistencia:e.target.value}))} />
            </FL>
            <FL label="Bono movilización ($)">
              <input style={INP} type="number" value={form.bono_movilizacion||0} onChange={e=>setForm(f=>({...f,bono_movilizacion:e.target.value}))} />
            </FL>
            <FL label="Bono colación ($)">
              <input style={INP} type="number" value={form.bono_colacion||0} onChange={e=>setForm(f=>({...f,bono_colacion:e.target.value}))} />
            </FL>
            <FL label="Método gratificación">
              <select style={INP} value={form.metodo_gratificacion||"25% MENSUAL"} onChange={e=>setForm(f=>({...f,metodo_gratificacion:e.target.value}))}>
                {METODO_GRAT.map(m=><option key={m}>{m}</option>)}
              </select>
            </FL>
            <FL label={form.metodo_gratificacion==="ANTICIPO %"?"% anticipo (ej: 0.01 = 1%)" : form.metodo_gratificacion==="ANTICIPO $" ? "Monto fijo ($)" : "Valor (no aplica)"}>
              <input style={INP} type="number" step="0.001"
                disabled={form.metodo_gratificacion==="25% MENSUAL"}
                value={form.valor_gratificacion||0}
                onChange={e=>setForm(f=>({...f,valor_gratificacion:e.target.value}))} />
            </FL>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <Btn onClick={guardar} disabled={saving}>{saving?"Guardando…":"Guardar"}</Btn>
            <BtnOut onClick={cancel}>Cancelar</BtnOut>
          </div>
        </Card>
      ) : (
        /* ── Tabla ── */
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {["Nombre","RUT","Cargo","Sueldo base","Contrato","AFP","Salud","B.Asist","B.Movil","B.Colac","Gratif","Estado",""].map(h=>(
                  <th key={h} style={{ color:C.textMuted, fontWeight:500, fontSize:10,
                    textTransform:"uppercase", letterSpacing:"0.4px", padding:"8px 8px",
                    textAlign: h==="Nombre"||h==="Cargo"?"left":"right",
                    whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map(w => (
                <tr key={w.id} style={{ borderBottom:`1px solid ${C.border}22` }}>
                  <td style={{ padding:"10px 8px", color:C.text, fontWeight:500 }}>{w.nombre}</td>
                  <td style={{ padding:"10px 8px", color:C.textMuted, fontSize:11 }}>{w.rut||<span style={{color:C.red}}>—</span>}</td>
                  <td style={{ padding:"10px 8px", color:C.textMuted, fontSize:11 }}>{w.cargo}</td>
                  <td style={{ padding:"10px 8px", textAlign:"right" }}>
                    {w.sueldo_base ? <span style={{color:C.text}}>{clp(w.sueldo_base)}</span> : <span style={{color:C.red}}>Sin configurar</span>}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right" }}>
                    <Badge text={w.tipo_contrato||"—"} color={w.tipo_contrato==="INDEFINIDO"?C.green:C.teal} />
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textMuted }}>{w.afp||"—"}</td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textMuted }}>{w.salud||"—"}</td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textDim }}>{clp(w.bono_asistencia||0)}</td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textDim }}>{clp(w.bono_movilizacion||0)}</td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.textDim }}>{clp(w.bono_colacion||0)}</td>
                  <td style={{ padding:"10px 8px", textAlign:"right", color:C.teal, fontSize:11 }}>
                    {w.metodo_gratificacion==="25% MENSUAL"||!w.metodo_gratificacion ? "25% mensual" :
                     w.metodo_gratificacion==="ANTICIPO %" ? `${((w.valor_gratificacion||0)*100).toFixed(1)}%` :
                     clp(w.valor_gratificacion||0)}
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right" }}>
                    <Badge text={w.estado||"ACTIVO"} color={w.estado==="INACTIVO"?C.red:w.estado==="LICENCIA"?C.yellow:C.green} />
                  </td>
                  <td style={{ padding:"10px 8px", textAlign:"right" }}>
                    {w.estado === "ACTIVO"
                      ? <Btn onClick={()=>startEdit(w)} small color={C.border}>✏️ Editar</Btn>
                      : <span style={{ color:C.textDim, fontSize:11, fontStyle:"italic" }}>Solo lectura</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VISTA 4: PARÁMETROS LEGALES + AFP
══════════════════════════════════════════════════════════════ */
function Parametros({ params, tasasAfp, reload }) {
  const [form, setForm]     = useState(params[0] || PARAMS_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  /* Actualiza UF y UTM desde mindicador.cl (API gratuita) */
  const fetchIndicadores = async () => {
    setFetching(true); setFetchMsg("");
    try {
      const [resUF, resUTM] = await Promise.all([
        fetch("https://mindicador.cl/api/uf").then(r=>r.json()),
        fetch("https://mindicador.cl/api/utm").then(r=>r.json()),
      ]);
      const uf  = resUF.serie[0].valor;
      const utm = resUTM.serie[0].valor;
      setForm(f => ({ ...f, uf, utm }));
      setFetchMsg(`✅ UF: $${uf.toLocaleString("es-CL")}  ·  UTM: $${utm.toLocaleString("es-CL")}  — actualizados desde mindicador.cl`);
    } catch(e) {
      setFetchMsg("⚠️ No se pudo conectar a mindicador.cl. Ingrese los valores manualmente.");
    }
    setFetching(false);
  };

  const guardar = async () => {
    if (!isConfigured || !supabase) { alert("Configura Supabase."); return; }
    setSaving(true);
    const payload = {
      periodo:           form.periodo,
      uf:                parseFloat(form.uf),
      utm:               parseInt(form.utm),
      imm:               parseInt(form.imm),
      imm_joven:         parseInt(form.imm_joven),
      tope_imponible_uf: parseFloat(form.tope_imponible_uf),
      horas_mensuales:   parseInt(form.horas_mensuales),
    };
    const existing = params.find(p => p.periodo === form.periodo);
    if (existing) {
      await supabase.from("parametros_legales").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("parametros_legales").insert(payload);
    }
    setSaving(false);
    await reload();
    setFetchMsg("✅ Parámetros guardados en Supabase.");
  };

  const f = (label, key, type="number", step="1") => (
    <FL label={label}>
      <input type={type} step={step} style={INP} value={form[key]||""}
        onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
    </FL>
  );

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap" }}>
        <SHeader title="Parámetros Legales" />
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <BtnOut onClick={fetchIndicadores} color={C.teal}>
            {fetching ? "Consultando…" : "⚡ Actualizar UF/UTM automático"}
          </BtnOut>
          <Btn onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "💾 Guardar período"}
          </Btn>
        </div>
      </div>

      {fetchMsg && (
        <div style={{ background:C.teal+"15", border:`1px solid ${C.teal}33`,
          borderRadius:10, padding:"10px 16px", marginBottom:16,
          color:C.teal, fontSize:12 }}>{fetchMsg}</div>
      )}

      <Card>
        <div style={{ color:C.textMuted, fontSize:12, marginBottom:12 }}>
          Período activo — los cambios afectan a todas las liquidaciones del período seleccionado.
          Use <strong style={{color:C.teal}}>⚡ Actualizar UF/UTM automático</strong> para
          traer valores desde mindicador.cl sin tener que ingresarlos manualmente.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          <FL label="Período (YYYY-MM)">
            <input type="text" style={INP} placeholder="2026-04" value={form.periodo||""}
              onChange={e=>setForm(f=>({...f,periodo:e.target.value}))} />
          </FL>
          {f("UF mensual ($)", "uf", "number", "0.01")}
          {f("UTM mensual ($)", "utm")}
          {f("IMM trabajadores 18-65 ($)", "imm")}
          {f("IMM menores 18 / mayores 65 ($)", "imm_joven")}
          {f("Tope imponible AFP (UF)", "tope_imponible_uf", "number", "0.1")}
          {f("Horas ordinarias mensuales", "horas_mensuales")}
        </div>
      </Card>

      {/* Historial de períodos */}
      <SHeader title="Períodos guardados" count={params.length} />
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {["Período","UF","UTM","IMM","Tope impon.","H.mensuales",""].map(h=>(
                <th key={h} style={{ color:C.textMuted, fontWeight:500, fontSize:11,
                  textTransform:"uppercase", letterSpacing:"0.4px", padding:"8px 12px",
                  textAlign:h==="Período"?"left":"right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {params.map(p=>(
              <tr key={p.periodo} style={{ borderBottom:`1px solid ${C.border}22`,
                background: p.periodo===form.periodo ? C.accent+"11" : "transparent" }}>
                <td style={{ padding:"10px 12px", color:C.text, fontWeight:600 }}>{p.periodo}</td>
                <td style={{ padding:"10px 12px", textAlign:"right", color:C.teal }}>{clp(p.uf)}</td>
                <td style={{ padding:"10px 12px", textAlign:"right", color:C.textMuted }}>{clp(p.utm)}</td>
                <td style={{ padding:"10px 12px", textAlign:"right", color:C.textMuted }}>{clp(p.imm)}</td>
                <td style={{ padding:"10px 12px", textAlign:"right", color:C.textMuted }}>{clp(p.uf * p.tope_imponible_uf)}</td>
                <td style={{ padding:"10px 12px", textAlign:"right", color:C.textMuted }}>{p.horas_mensuales}h</td>
                <td style={{ padding:"10px 12px", textAlign:"right" }}>
                  <Btn small color={C.border} onClick={()=>setForm({...p})}>Cargar</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tasas AFP */}
      <div style={{ marginTop:24 }}>
        <SHeader title="Tasas AFP vigentes" count={tasasAfp.length} />
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {["AFP","Tasa trabajador","SIS (empleador)","Total"].map(h=>(
                  <th key={h} style={{ color:C.textMuted, fontWeight:500, fontSize:11,
                    textTransform:"uppercase", letterSpacing:"0.4px", padding:"8px 12px",
                    textAlign:h==="AFP"?"left":"right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tasasAfp.length ? tasasAfp : AFP_DEFAULT).map(t=>(
                <tr key={t.nombre} style={{ borderBottom:`1px solid ${C.border}22` }}>
                  <td style={{ padding:"10px 12px", color:C.text, fontWeight:500 }}>{t.nombre}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", color:C.red }}>{pct(t.tasa_trabajador)}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", color:C.yellow }}>{pct(t.sis)}</td>
                  <td style={{ padding:"10px 12px", textAlign:"right", color:C.textMuted }}>{pct(t.tasa_trabajador + t.sis)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MÓDULO PRINCIPAL: REMUNERACIONES
══════════════════════════════════════════════════════════════ */
const REM_TABS = [
  { key:"planilla",    label:"📋 Planilla del mes" },
  { key:"liquidacion", label:"🖨 Liquidación individual" },
  { key:"trabajadores",label:"👥 Config. RR.HH." },
  { key:"parametros",  label:"⚙️ Parámetros legales" },
];

export default function Remuneraciones({ data, contratoId }) {
  const [tab, setTab]                             = useState("planilla");
  const { tasasAfp, params, liquidaciones, ready, reload } = useRemData();

  if (!ready) return (
    <div style={{ textAlign:"center", padding:"60px 0", color:C.textMuted, fontSize:14 }}>
      Cargando datos de remuneraciones…
    </div>
  );

  return (
    <div>
      <SharedBanner data={data} contratoId={contratoId} />
      {/* Sub-tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:24,
        borderBottom:`1px solid ${C.border}`, flexWrap:"wrap" }}>
        {REM_TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            background:"transparent",
            color: tab===t.key ? C.accentLight : C.textMuted,
            border:"none",
            borderBottom: tab===t.key ? `2px solid ${C.accentLight}` : "2px solid transparent",
            padding:"10px 16px", fontSize:12, cursor:"pointer",
            fontWeight: tab===t.key ? 600 : 400,
            whiteSpace:"nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {tab==="planilla"     && <Planilla           data={data} contratoId={contratoId}
                                                   tasasAfp={tasasAfp} params={params}
                                                   liquidaciones={liquidaciones} reload={reload} />}
      {tab==="liquidacion"  && <LiquidacionIndividual data={data} tasasAfp={tasasAfp} params={params} />}
      {tab==="trabajadores" && <ConfigTrabajadores data={data} tasasAfp={tasasAfp} />}
      {tab==="parametros"   && <Parametros          params={params} tasasAfp={tasasAfp} reload={reload} />}
    </div>
  );
}
