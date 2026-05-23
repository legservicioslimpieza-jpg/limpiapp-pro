import { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "./supabase.js";

/* ─── Paleta de colores ERP Moderna y Clara (Estilo SAP/Oracle/Corporativo) ─── */
const C = {
  bg:           "#f8fafc", // Fondo general gris claro limpio
  surface:      "#ffffff", // Paneles y tarjetas blanco puro
  surfaceHover: "#f1f5f9", // Gris sutil interactivo
  border:       "#e2e8f0", // Bordes finos y limpios
  accent:       "#0284c7", // Azul ejecutivo corporativo
  accentLight:  "#e0f2fe", // Celeste suave para selecciones
  green:        "#16a34a", // Verde formal para cumplidos o cerrados
  yellow:       "#ca8a04", // Amarillo ocre para alertas o procesos
  red:          "#dc2626", // Rojo sobrio para incidencias urgentes
  purple:       "#9333ea", // Morado para supervisiones/supervisores
  text:         "#0f172a", // Texto principal gris oscuro (alta legibilidad)
  textMuted:    "#475569", // Texto secundario
  textDim:      "#94a3b8", // Texto desvanecido para IDs
};

const PCOLOR = { 
  DIARIA: C.green, 
  SEMANAL: C.accent, 
  QUINCENAL: "#0d9488", 
  MENSUAL: C.purple, 
  TRIMESTRAL: C.yellow, 
  SEMESTRAL: "#ea580c", 
  ANUAL: C.red 
};

const ECOLOR = { Abierta: C.red, "En Proceso": C.yellow, Cerrada: C.green };
const ESTADOS_CONTRATO = ["Vigente", "Postulación", "Renovación", "Inactivo"];
const TIPOS = ["Falta Insumos", "Daño infraestructura", "Accidente laboral", "Limpieza deficiente", "Otro"];

/* ─── Componentes base ──────────────────────────────────────── */
function Badge({ text, color }) {
  return (
    <span style={{ 
      background: color + "12", color, fontSize: 11, fontWeight: 600, 
      padding: "3px 10px", borderRadius: 6, letterSpacing: "0.5px", 
      whiteSpace: "nowrap", border: `1px solid ${color}25` 
    }}>
      {text}
    </span>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
      <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6, fontWeight: 400 }}>{sub}</div>}
    </div>
  );
}

function SHeader({ title, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
      {count !== undefined && (
        <span style={{ background: C.accent + "15", color: C.accent, fontSize: 12, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{count}</span>
      )}
    </div>
  );
}

function DataTable({ cols, rows, empty = "Sin registros" }) {
  if (!rows.length) return <div style={{ textAlign: "center", color: C.textMuted, padding: "40px 0", fontSize: 14 }}>{empty}</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {cols.map(c => (
              <th key={c.key} style={{ color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", padding: "12px 14px", textAlign: "left", borderBottom: `2px solid ${C.border}` }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafafa" }}>
              {cols.map(c => (
                <td key={c.key} style={{ padding: "12px 14px", color: C.text, verticalAlign: "middle" }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ children, accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${accent ? accent : C.border}`, borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.01)" }}>
      {children}
    </div>
  );
}

function FL({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

/* INPUTS CORREGIDOS: Fondo blanco estricto y borde gris limpio para evitar zonas oscuras */
const INP = { width: "100%", background: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", color: "#0f172a", fontSize: 13, boxSizing: "border-box", outline: "none" };

function Btn({ onClick, color = C.accent, children, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: disabled ? C.border : color, color: "#fff", border: "none", borderRadius: 6, padding: small ? "5px 14px" : "10px 20px", fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
      {children}
    </button>
  );
}

function BtnOut({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ background: "#ffffff", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 500 }}>Conectando con Supabase corporativo…</span>
    </div>
  );
}

function DemoBanner() {
  return (
    <div style={{ background: C.yellow + "10", border: `1px solid ${C.yellow}33`, borderRadius: 8, padding: "12px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <div style={{ color: C.yellow, fontWeight: 600, fontSize: 13 }}>Modo Demostración — Datos temporales locales</div>
        <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>Configura las variables de Supabase en Vercel para conectarte a tu Base de Datos en producción.</div>
      </div>
    </div>
  );
}

/* ─── Hook de datos ─────────────────────────────────────────── */
const TABLES = ["trabajadores", "contratos", "dependencias", "checklist", "evidencias", "incidencias", "supervisiones"];
function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbMode, setDbMode] = useState(false);

  const loadAll = useCallback(async () => {
    if (!isConfigured) { setData({ trabajadores:[], contratos:[], dependencias:[], checklist:[], evidencias:[], incidencias:[], supervisiones:[] }); setLoading(false); return; }
    setLoading(true);
    try {
      const results = await Promise.all(TABLES.map(t => supabase.from(t).select("*").order("id")));
      const loaded = {};
      TABLES.forEach((t, i) => { loaded[t] = results[i].data || []; });
      setData(loaded);
      setDbMode(true);
    } catch { 
      setData({ trabajadores:[], contratos:[], dependencias:[], checklist:[], evidencias:[], incidencias:[], supervisiones:[] }); 
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const insert = async (table, record) => {
    if (isConfigured && dbMode) {
      const { error } = await supabase.from(table).insert(record);
      if (error) { alert("Error: " + error.message); return false; }
      await loadAll(); return true;
    } else {
      setData(prev => ({ ...prev, [table]: [...(prev[table] || []), record] }));
      return true;
    }
  };

  const update = async (table, record) => {
    if (isConfigured && dbMode) {
      const { error } = await supabase.from(table).update(record).eq("id", record.id);
      if (error) { alert("Error: " + error.message); return false; }
      await loadAll(); return true;
    } else {
      setData(prev => ({ ...prev, [table]: prev[table].map(r => r.id === record.id ? record : r) }));
      return true;
    }
  };

  return { data, loading, dbMode, insert, update };
}

function genId(prefix, list = []) {
  return `${prefix}${String((list?.length || 0) + 1).padStart(3, "0")}`;
}

/* ─── Selector de contrato ──────────────────────────────────── */
function ContractSelector({ contratos, selected, onSelect }) {
  const col = { Vigente: C.green, Postulación: C.yellow, Renovación: C.purple, Inactivo: C.textDim };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: C.textMuted, fontSize: 13, fontWeight: 500 }}>Filtro Contrato:</span>
      <select value={selected || ""} onChange={e => onSelect(e.target.value)}
        style={{ background: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", color: C.text, fontSize: 13, cursor: "pointer", outline: "none" }}>
        <option value="">— Ver Todo (Global) —</option>
        {contratos.map(c => <option key={c.id} value={c.id}>{c.cliente} ({c.estado})</option>)}
      </select>
      {selected && (() => { const ct = contratos.find(c => c.id === selected); return ct ? <Badge text={ct.estado} color={col[ct.estado] || C.textMuted} /> : null; })()}
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────── */
function Dashboard({ data, contratoId }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const chks = contratoId ? data.checklist.filter(c => c.contrato_id === contratoId && c.activa) : data.checklist.filter(c => c.activa);
  const evHoy = contratoId ? data.evidencias.filter(e => e.contrato_id === contratoId && e.fecha_hora?.startsWith(hoy)) : data.evidencias.filter(e => e.fecha_hora?.startsWith(hoy));
  const incs = contratoId ? data.incidencias.filter(i => i.contrato_id === contratoId) : data.incidencias;
  const incAb = incs.filter(i => i.estado === "Abierta").length;
  const sups = contratoId ? data.supervisiones.filter(s => s.contrato_id === contratoId) : data.supervisiones;
  const cumPr = sups.length ? Math.round(sups.reduce((a, s) => a + s.cumplimiento, 0) / sups.length) : 0;
  const xPer = chks.reduce((a, c) => ({ ...a, [c.periodicidad]: (a[c.periodicidad] || 0) + 1 }), {});
  const ct = contratoId ? data.contratos.find(c => c.id === contratoId) : null;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Resumen Ejecutivo Operacional</h1>
        <p style={{ color: C.textMuted, margin: 0, fontSize: 13, fontWeight: 500 }}>
          {ct ? `${ct.cliente} — ${ct.instalacion}` : `${data.contratos.filter(c => c.activo).length} Clientes Activos Corporativos · LEG Servicios`}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Cumplimiento Promedio" value={`${cumPr}%`} sub="Auditorías en terreno" color={cumPr >= 90 ? C.green : cumPr >= 70 ? C.yellow : C.red} />
        <StatCard label="KPI Tareas Hoy" value={`${evHoy.length}/${chks.filter(c => c.periodicidad === "DIARIA").length}`} sub="Asignaciones diarias" color={C.accent} />
        <StatCard label="Incidencias Críticas" value={incAb} sub="Abiertas actualmente" color={incAb > 0 ? C.red : C.green} />
        <StatCard label="Contratos LEG" value={data.contratos.filter(c => c.estado === "Vigente").length} sub="Cartera vigente" />
        <StatCard label="Dotación Personal" value={data.trabajadores.filter(t => t.activo).length} sub="Operarios activos" />
        <StatCard label="Áreas de Control" value={contratoId ? data.dependencias.filter(d => d.contrato_id === contratoId).length : data.dependencias.length} sub="Ubicaciones registradas" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SHeader title="Distribución de Tareas Contratadas" />
          {Object.keys(PCOLOR).filter(p => xPer[p]).map(p => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, background: C.border, borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${(xPer[p] / chks.length) * 100}%`, height: "100%", background: PCOLOR[p], borderRadius: 4 }} />
              </div>
              <Badge text={p} color={PCOLOR[p]} />
              <span style={{ color: C.textMuted, fontSize: 13, minWidth: 20, textAlign: "right", fontWeight: 600 }}>{xPer[p]}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SHeader title="Alertas e Incidencias Recientes" />
          {incs.slice(-4).reverse().map(inc => {
            const dep = data.dependencias.find(d => d.id === inc.dep_id);
            const ctt = data.contratos.find(c => c.id === inc.contrato_id);
            return (
              <div key={inc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{inc.tipo}</div>
                  <div style={{ color: C.textMuted, fontSize: 12 }}>{ctt?.cliente} · {dep?.nombre || "General"}</div>
                </div>
                <Badge text={inc.estado} color={ECOLOR[inc.estado]} />
              </div>
            );
          })}
          {!incs.length && <p style={{ color: C.textMuted, padding: "10px 0", fontSize: 13 }}>Sin reportes pendientes.</p>}
        </Card>
      </div>
      <Card>
        <SHeader title="Registro Bitácora Diario (Últimas Evidencias)" />
        <DataTable
          cols={[
            { key: "tarea", label: "Plan de Trabajo / Tarea Asignada", render: r => { const c = data.checklist.find(ch => ch.id === r.checklist_id); return c?.tarea || "Aseo general"; } },
            { key: "contrato", label: "Cliente", render: r => { const c = data.contratos.find(ct => ct.id === r.contrato_id); return <span style={{ fontWeight: 500 }}>{c?.cliente || "—"}</span>; } },
            { key: "trabajador", label: "Auxiliar Responsable", render: r => { const t = data.trabajadores.find(w => w.id === r.trabajador_id); return t?.nombre.split(" ").slice(0, 2).join(" ") || "—"; } },
            { key: "hora", label: "Timestamp", render: r => <span style={{ color: C.textMuted }}>{r.fecha_hora?.split("T")[1]?.slice(0, 5) || "—"}</span> },
            { key: "estado", label: "Validación", render: r => <Badge text={r.cumplido ? "Cumplido ✓" : "Pendiente"} color={C.green} /> },
          ]}
          rows={[...evHoy].reverse().slice(0, 5)}
        />
      </Card>
    </div>
  );
}

/* ─── Contratos ─────────────────────────────────────────────── */
function Contratos({ data, insert, update }) {
  const [form, setForm] = useState(null);
  const isNew = form && !data.contratos.find(c => c.id === form.id);
  const colE = { Vigente: C.green, Postulación: C.yellow, Renovación: C.purple, Inactivo: C.textDim };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <SHeader title="Gestión de Clientes & Contratos" count={data.contratos.length} />
        <Btn onClick={() => setForm({ id: genId("CT", data.contratos), cliente: "", instalacion: "", direccion: "", supervisor_id: data.trabajadores.find(t => t.cargo === "Supervisor")?.id || "", estado: "Vigente", activo: true })}>+ Nuevo Contrato</Btn>
      </div>
      {form && (
        <Card accent={C.accent}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FL label="Cliente / Institución Pública"><input style={INP} value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} placeholder="Ej: Seremi de Transportes" /></FL>
            <FL label="Instalación / Sucursal"><input style={INP} value={form.instalacion} onChange={e => setForm({ ...form, instalacion: e.target.value })} placeholder="Ej: Casa Central Arica" /></FL>
            <FL label="Dirección Comercial"><input style={INP} value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Ej: Chacabuco Nº901" /></FL>
            <FL label="Estado Administrativo">
              <select style={INP} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                {ESTADOS_CONTRATO.map(s => <option key={s}>{s}</option>)}
              </select>
            </FL>
            <FL label="Supervisor a Cargo">
              <select style={INP} value={form.supervisor_id} onChange={e => setForm({ ...form, supervisor_id: e.target.value })}>
                <option value="">— Seleccionar Supervisor —</option>
                {data.trabajadores.filter(t => t.cargo === "Supervisor").map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={async () => { if (form.cliente.trim() && await (isNew ? insert("contratos", form) : update("contratos", form))) setForm(null); }} color={C.green}>Guardar</Btn><BtnOut onClick={() => setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key: "id", label: "ID", render: r => <span style={{ fontFamily: "monospace", color: C.textDim }}>{r.id}</span> },
          { key: "cliente", label: "Cliente / Empresa" },
          { key: "instalacion", label: "Instalación" },
          { key: "direccion", label: "Dirección" },
          { key: "estado", label: "Estado", render: r => <Badge text={r.estado} color={colE[r.estado] || C.textMuted} /> },
          { key: "edit", label: "", render: r => <button onClick={() => setForm({ ...r })} style={{ background: "transparent", color: C.accent, border: "none", cursor: "pointer", fontWeight: 600 }}>Editar</button> },
        ]}
        rows={data.contratos}
      />
    </div>
  );
}

/* ─── Dependencias ──────────────────────────────────────────── */
function Dependencias({ data, contratoId, insert, update }) {
  const [form, setForm] = useState(null);
  const [filtroC, setFiltroC] = useState(contratoId || "");
  useEffect(() => { if (contratoId) setFiltroC(contratoId); }, [contratoId]);

  const rows = filtroC ? data.dependencias.filter(d => d.contrato_id === filtroC) : data.dependencias;
  const isNew = form && !data.dependencias.find(d => d.id === form.id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <SHeader title="Zonas, Áreas & Códigos QR" count={rows.length} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={filtroC} onChange={e => setFiltroC(e.target.value)} style={{ background: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", color: C.text, fontSize: 13, outline: "none" }}>
            <option value="">— Filtrar por Contrato —</option>
            {data.contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
          </select>
          <Btn onClick={() => {
            const ctId = filtroC || data.contratos[0]?.id || "";
            setForm({ id: `DEP-${ctId}-${Date.now().toString().slice(-4)}`, contrato_id: ctId, nombre: "", qr: "", activo: true });
          }}>+ Nueva Área</Btn>
        </div>
      </div>
      {form && (
        <Card accent={C.purple}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FL label="Vincular a Contrato">
              <select style={INP} value={form.contrato_id} onChange={e => setForm({ ...form, contrato_id: e.target.value })}>
                {data.contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Nombre de la Dependencia / Sala"><input style={INP} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Baños Varones Piso 2" /></FL>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={async () => { if (form.nombre.trim() && await (isNew ? insert("dependencias", { ...form, qr: `QR-${form.id}` }) : update("dependencias", form))) setForm(null); }} color={C.purple}>Guardar Área</Btn><BtnOut onClick={() => setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key: "id", label: "Código Dependencia", render: r => <span style={{ fontFamily: "monospace", color: C.textDim }}>{r.id}</span> },
          { key: "contrato", label: "Contrato Vinculado", render: r => <span>{data.contratos.find(c => c.id === r.contrato_id)?.cliente || "—"}</span> },
          { key: "nombre", label: "Área Específica" },
          { key: "qr", label: "Código de Escaneo QR", render: r => <code style={{ color: C.accent, fontWeight: 600 }}>{r.qr || `QR-${r.id}`}</code> },
          { key: "activo", label: "Control", render: r => <Badge text={r.activo ? "Activa" : "Bloqueada"} color={r.activo ? C.green : C.textDim} /> },
          { key: "edit", label: "", render: r => <button onClick={() => setForm({ ...r })} style={{ background: "transparent", color: C.accent, border: "none", cursor: "pointer", fontWeight: 600 }}>Editar</button> },
        ]}
        rows={rows}
      />
    </div>
  );
}

/* ─── Trabajadores ──────────────────────────────────────────── */
function Trabajadores({ data, insert, update }) {
  const [form, setForm] = useState(null);
  const isNew = form && !data.trabajadores.find(t => t.id === form.id);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <SHeader title="Nómina y Registro de Personal" count={data.trabajadores.length} />
        <Btn onClick={() => setForm({ id: genId("TR", data.trabajadores), nombre: "", cargo: "Auxiliar Aseo", telefono: "", email: "", activo: true })}>+ Registrar Operario</Btn>
      </div>
      {form && (
        <Card accent={C.accent}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FL label="Nombre Apellidos del Colaborador"><input style={INP} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Juan Pérez Gómez" /></FL>
            <FL label="Rol / Cargo"><select style={INP} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}><option>Auxiliar Aseo</option><option>Supervisor</option><option>Jefe de Turno</option></select></FL>
            <FL label="Teléfono de Contacto"><input style={INP} value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="+569XXXXXXXX" /></FL>
            <FL label="Email Corporativo"><input style={INP} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nombre@legservicios.cl" /></FL>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={async () => { if (form.nombre.trim() && await (isNew ? insert("trabajadores", form) : update("trabajadores", form))) setForm(null); }} color={C.green}>Guardar Operario</Btn><BtnOut onClick={() => setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key: "id", label: "ID Personal", render: r => <span style={{ fontFamily: "monospace", color: C.textDim }}>{r.id}</span> },
          { key: "nombre", label: "Nombre Completo" },
          { key: "cargo", label: "Rol", render: r => <Badge text={r.cargo} color={r.cargo === "Supervisor" ? C.purple : C.accent} /> },
          { key: "telefono", label: "Teléfono", render: r => <span style={{ color: C.textMuted }}>{r.telefono || "—"}</span> },
          { key: "activo", label: "Estado Contrato", render: r => <Badge text={r.activo ? "Vigente" : "Finiquitado"} color={r.activo ? C.green : C.red} /> },
          { key: "edit", label: "", render: r => <button onClick={() => setForm({ ...r })} style={{ background: "transparent", color: C.accent, border: "none", cursor: "pointer", fontWeight: 600 }}>Editar</button> },
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
  const hoy = new Date().toISOString().slice(0, 10);

  const chks = contratoId ? data.checklist.filter(c => c.contrato_id === contratoId) : data.checklist;
  const rows = filtro === "TODAS" ? chks : chks.filter(c => c.periodicidad === filtro);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <SHeader title="Matriz de Tareas Contractuales" count={chks.length} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["TODAS", "DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL", "TRIMESTRAL"].map(p => (
            <button key={p} onClick={() => setFiltro(p)} style={{ background: filtro === p ? (PCOLOR[p] || C.accent) : "transparent", color: filtro === p ? "#fff" : C.textMuted, border: `1px solid ${filtro === p ? "transparent" : C.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{p}</button>
          ))}
          <Btn onClick={() => {
            const depsF = contratoId ? data.dependencias.filter(d => d.contrato_id === contratoId) : data.dependencias;
            setForm({ id: `CHK${Date.now()}`, dep_id: depsF[0]?.id || "", contrato_id: contratoId || data.contratos[0]?.id || "", tarea: "", periodicidad: "DIARIA", obligatoria: true, activa: true });
          }} small>+ Crear Tarea</Btn>
        </div>
      </div>
      {form && (
        <Card accent={C.green}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FL label="Contrato Asociado">
              <select style={INP} value={form.contrato_id} onChange={e => {
                const deps = data.dependencias.filter(d => d.contrato_id === e.target.value);
                setForm({ ...form, contrato_id: e.target.value, dep_id: deps[0]?.id || "" });
              }}>
                {data.contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Ubicación / Área Específica">
              <select style={INP} value={form.dep_id} onChange={e => setForm({ ...form, dep_id: e.target.value })}>
                {data.dependencias.filter(d => d.contrato_id === form.contrato_id).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </FL>
            <div style={{ gridColumn: "1/-1" }}><FL label="Definición Jurídica/Técnica de la Tarea"><input style={INP} value={form.tarea} onChange={e => setForm({ ...form, tarea: e.target.value })} placeholder="Ej: Sanitización profunda e higienización de loza sanitarias" /></FL></div>
            <FL label="Frecuencia Requerida Base"><select style={INP} value={form.periodicidad} onChange={e => setForm({ ...form, periodicidad: e.target.value })}>{Object.keys(PCOLOR).map(p => <option key={p}>{p}</option>)}</select></FL>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={async () => { if (form.tarea.trim() && await insert("checklist", form)) setForm(null); }} color={C.green}>Inyectar Tarea</Btn><BtnOut onClick={() => setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key: "tarea", label: "Protocolo Operacional / Tarea" },
          { key: "contrato", label: "Contrato", render: r => <span style={{ color: C.textMuted }}>{data.contratos.find(c => c.id === r.contrato_id)?.cliente || "—"}</span> },
          { key: "dep", label: "Área Evaluada", render: r => <span style={{ color: C.textMuted }}>{data.dependencias.find(d => d.id === r.dep_id)?.nombre || "—"}</span> },
          { key: "per", label: "Frecuencia", render: r => <Badge text={r.periodicidad} color={PCOLOR[r.periodicidad] || C.textMuted} /> },
          { key: "ev", label: "Control de Registro", render: r => {
            const n = data.evidencias.filter(e => e.checklist_id === r.id && e.fecha_hora?.startsWith(hoy)).length;
            return r.periodicidad === "DIARIA" ? (n > 0 ? <span style={{ color: C.green, fontWeight: 700 }}>✓ Confirmado ({n})</span> : <button onClick={async () => {
              await insert("evidencias", { id: `EV${Date.now()}`, checklist_id: r.id, trabajador_id: data.trabajadores.find(t => t.cargo !== "Supervisor")?.id || data.trabajadores[0]?.id, contrato_id: r.contrato_id, fecha_hora: new Date().toISOString(), observacion: "", cumplido: true });
            }} style={{ background: C.green + "15", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Marcar Check ✓</button>) : <span style={{ color: C.textDim }}>Planificado</span>;
          } }
        ]}
        rows={rows}
      />
    </div>
  );
}

/* ─── Incidencias ───────────────────────────────────────────── */
function Incidencias({ data, contratoId, insert, update }) {
  const [form, setForm] = useState(null);
  const incs = contratoId ? data.incidencias.filter(i => i.contrato_id === contratoId) : data.incidencias;
  const abiertas = incs.filter(i => i.estado === "Abierta").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SHeader title="Registro de Incidencias Operacionales" count={incs.length} />
          {abiertas > 0 && <Badge text={`${abiertas} Pendientes`} color={C.red} />}
        </div>
        <Btn onClick={() => {
          const deps = contratoId ? data.dependencias.filter(d => d.contrato_id === contratoId) : data.dependencias;
          setForm({ id: `IN${Date.now()}`, contrato_id: contratoId || data.contratos.find(c => c.activo)?.id || "", dep_id: deps[0]?.id || "", fecha_hora: new Date().toISOString(), tipo: "Falta Insumos", descripcion: "", estado: "Abierta", trabajador_id: data.trabajadores.find(t => t.cargo !== "Supervisor")?.id || data.trabajadores[0]?.id || "" });
        }} color={C.red}>+ Reportar Hallazgo</Btn>
      </div>
      {form && (
        <Card accent={C.red}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FL label="Contrato Afectado">
              <select style={INP} value={form.contrato_id} onChange={e => {
                const deps = data.dependencias.filter(d => d.contrato_id === e.target.value);
                setForm({ ...form, contrato_id: e.target.value, dep_id: deps[0]?.id || "" });
              }}>
                {data.contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Ubicación Exacta del Incidente">
              <select style={INP} value={form.dep_id} onChange={e => setForm({ ...form, dep_id: e.target.value })}>
                {data.dependencias.filter(d => d.contrato_id === form.contrato_id).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </FL>
            <FL label="Tipología de la Incidencia"><select style={INP} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></FL>
            <FL label="Operador Reportante">
              <select style={INP} value={form.trabajador_id} onChange={e => setForm({ ...form, trabajador_id: e.target.value })}>
                {data.trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            <div style={{ gridColumn: "1/-1" }}><FL label="Descripción de la Anomalía Técnica"><textarea rows={3} style={INP} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Filtración severa en fluxómetro o ruptura de cristales..." /></FL></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={async () => { if (form.descripcion.trim() && await insert("incidencias", form)) setForm(null); }} color={C.red}>Registrar Alerta</Btn><BtnOut onClick={() => setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key: "id", label: "Folio", render: r => <span style={{ fontFamily: "monospace", color: C.textDim }}>{r.id?.slice(-5) || r.id}</span> },
          { key: "tipo", label: "Hallazgo / Tipo" },
          { key: "contrato", label: "Cliente", render: r => <span>{data.contratos.find(c => c.id === r.contrato_id)?.cliente || "—"}</span> },
          { key: "dep", label: "Área", render: r => <span style={{ color: C.textMuted }}>{data.dependencias.find(d => d.id === r.dep_id)?.nombre || "General"}</span> },
          { key: "desc", label: "Descripción / Detalles", render: r => <span style={{ color: C.textMuted }}>{r.descripcion}</span> },
          { key: "estado", label: "Workflow Status", render: r => (
            <select value={r.estado} onChange={async (e) => await update("incidencias", { ...r, estado: e.target.value })} style={{ background: ECOLOR[r.estado] + "15", color: ECOLOR[r.estado], border: `1px solid ${ECOLOR[r.estado]}44`, borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none" }}>
              {["Abierta", "En Proceso", "Cerrada"].map(s => <option key={s}>{s}</option>)}
            </select>
          ) }
        ]}
        rows={incs}
      />
    </div>
  );
}

/* ─── Supervisiones ─────────────────────────────────────────── */
function Supervisiones({ data, contratoId, insert }) {
  const [form, setForm] = useState(null);
  const sups = contratoId ? data.supervisiones.filter(s => s.contrato_id === contratoId) : data.supervisiones;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <SHeader title="Auditorías Técnicas de Supervisión" count={sups.length} />
        <Btn onClick={() => setForm({ id: `SV${Date.now()}`, contrato_id: contratoId || data.contratos.find(c => c.activo)?.id || "", supervisor_id: data.trabajadores.find(t => t.cargo === "Supervisor")?.id || "", fecha: new Date().toISOString().slice(0, 10), cumplimiento: 95, observacion: "" })} color={C.purple}>+ Nueva Inspección</Btn>
      </div>
      {form && (
        <Card accent={C.purple}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FL label="Contrato Auditado">
              <select style={INP} value={form.contrato_id} onChange={e => setForm({ ...form, contrato_id: e.target.value })}>
                {data.contratos.map(c => <option key={c.id} value={c.id}>{c.cliente}</option>)}
              </select>
            </FL>
            <FL label="Fecha de Control Terreno"><input type="date" style={INP} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></FL>
            <FL label={`Porcentaje de Cumplimiento Técnico SLA: ${form.cumplimiento}%`}>
              <input type="range" min={0} max={100} value={form.cumplimiento} onChange={e => setForm({ ...form, cumplimiento: Number(e.target.value) })} style={{ width: "100%", accentColor: C.purple, marginTop: 10 }} />
            </FL>
            <FL label="Supervisor Evaluador">
              <select style={INP} value={form.supervisor_id} onChange={e => setForm({ ...form, supervisor_id: e.target.value })}>
                {data.trabajadores.filter(t => t.cargo === "Supervisor").map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FL>
            <div style={{ gridColumn: "1/-1" }}><FL label="Minuta / Observaciones de la Inspección"><textarea rows={3} style={INP} value={form.observacion} onChange={e => setForm({ ...form, observacion: e.target.value })} placeholder="Ingresa los comentarios de la entrega de instalaciones..." /></FL></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={async () => { if (await insert("supervisiones", form)) setForm(null); }} color={C.purple}>Grabar Auditoría</Btn><BtnOut onClick={() => setForm(null)}>Cancelar</BtnOut></div>
        </Card>
      )}
      <DataTable
        cols={[
          { key: "fecha", label: "Fecha de Visita" },
          { key: "contrato", label: "Cliente Fiscalizado", render: r => <span>{data.contratos.find(c => c.id === r.contrato_id)?.cliente || "—"}</span> },
          { key: "supervisor", label: "Supervisor", render: r => <span style={{ fontWeight: 500 }}>{data.trabajadores.find(t => t.id === r.supervisor_id)?.nombre || "Luis Guzman L."}</span> },
          { key: "cum", label: "Nota SLA / Score", render: r => (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 80, background: C.border, borderRadius: 4, height: 6 }}>
                <div style={{ width: `${r.cumplimiento}%`, height: "100%", borderRadius: 4, background: r.cumplimiento >= 90 ? C.green : r.cumplimiento >= 70 ? C.yellow : C.red }} />
              </div>
              <span style={{ fontWeight: 700, color: r.cumplimiento >= 90 ? C.green : r.cumplimiento >= 70 ? C.yellow : C.red }}>{r.cumplimiento}%</span>
            </div>
          ) },
          { key: "observacion", label: "Observaciones Generales" }
        ]}
        rows={sups}
      />
    </div>
  );
}

/* ─── Exportación Principal ─────────────────────────────────── */
export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedContrato, setSelectedContrato] = useState("");
  const { data, loading, dbMode, insert, update } = useData();

  if (loading) return <Spinner />;

  const menuItems = [
    { id: "dashboard", label: "Panel de Control" },
    { id: "contratos", label: "Contratos y Clientes" },
    { id: "dependencias", label: "Áreas / Dependencias" },
    { id: "trabajadores", label: "Personal Auxiliar" },
    { id: "checklist", label: "Planes de Trabajo" },
    { id: "incidencias", label: "Módulo Incidencias" },
    { id: "supervisiones", label: "Inspecciones SLA" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif", color: C.text }}>
      <header style={{ background: "#ffffff", borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: C.accent, color: "#ffffff", padding: "6px 14px", borderRadius: 6, fontWeight: 800, fontSize: 13, letterSpacing: "0.5px" }}>LEG</div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Limpiapp Pro</span>
            <span style={{ color: C.textDim, fontSize: 12, marginLeft: 8, fontWeight: 500 }}>v3.0 Sistema de Control ERP</span>
          </div>
        </div>
        
        <ContractSelector contratos={data.contratos} selected={selectedContrato} onSelect={setSelectedContrato} />
      </header>

      {!dbMode && <DemoBanner />}

      <div style={{ display: "flex", minHeight: "calc(100vh - 58px)" }}>
        <aside style={{ width: 240, background: "#ffffff", borderRight: `1px solid ${C.border}`, padding: "20px 12px" }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {menuItems.map(item => {
              const active = view === item.id;
              return (
                <button key={item.id} onClick={() => setView(item.id)} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 6,
                  border: "none", fontSize: 13, fontWeight: active ? 600 : 500,
                  background: active ? C.accentLight : "transparent",
                  color: active ? C.accent : C.textMuted,
                  cursor: "pointer", transition: "all 0.15s"
                }}>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
          {view === "dashboard" && <Dashboard data={data} contratoId={selectedContrato} />}
          {view === "contratos" && <Contratos data={data} insert={insert} update={update} />}
          {view === "dependencias" && <Dependencias data={data} contratoId={selectedContrato} insert={insert} update={update} />}
          {view === "trabajadores" && <Trabajadores data={data} insert={insert} update={update} />}
          {view === "checklist" && <Checklist data={data} contratoId={selectedContrato} insert={insert} />}
          {view === "incidencias" && <Incidencias data={data} contratoId={selectedContrato} insert={insert} update={update} />}
          {view === "supervisiones" && <Supervisiones data={data} contratoId={selectedContrato} insert={insert} />}
        </main>
      </div>
    </div>
  );
}
