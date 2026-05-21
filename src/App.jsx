import { useState } from "react";

/* ─── Paleta de colores ─────────────────────────────────────── */
const C = {
  bg:           "#0f1117",
  surface:      "#1a1d27",
  surfaceHover: "#22263a",
  border:       "#2a2e42",
  accent:       "#3b82f6",
  accentLight:  "#60a5fa",
  green:        "#22c55e",
  yellow:       "#eab308",
  red:          "#ef4444",
  purple:       "#a855f7",
  text:         "#f0f2f8",
  textMuted:    "#8b92ad",
  textDim:      "#525872",
};

/* ─── Datos iniciales (tu empresa real) ─────────────────────── */
const initialData = {
  trabajadores: [
    { id: "TR001", nombre: "Martha Ynes Vera Barboza",   cargo: "Auxiliar Aseo", telefono: "+56911111111",  email: "martha@leg.cl",                   activo: true },
    { id: "SUP001",nombre: "Luis Ernesto Guzman Loyola", cargo: "Supervisor",    telefono: "56998162646",   email: "legservicioslimpieza@gmail.com",   activo: true },
  ],
  contratos: [
    { id: "CT001", cliente: "Seremi de Transportes", instalacion: "Sucursal Arica", direccion: "Chacabuco Nº901", supervisorId: "SUP001", activo: true },
  ],
  dependencias: [
    { id: "DEP001", contratoId: "CT001", nombre: "Baños Piso 1",                         qr: "QR-DEP001", activo: true },
    { id: "DEP002", contratoId: "CT001", nombre: "Baños Piso 2",                         qr: "QR-DEP002", activo: true },
    { id: "DEP003", contratoId: "CT001", nombre: "Baños Piso 3",                         qr: "QR-DEP003", activo: true },
    { id: "DEP004", contratoId: "CT001", nombre: "Recepción",                            qr: "QR-DEP004", activo: true },
    { id: "DEP005", contratoId: "CT001", nombre: "Cocina y comedor",                     qr: "QR-DEP005", activo: true },
    { id: "DEP006", contratoId: "CT001", nombre: "Escritorios y equipos",                qr: "QR-DEP006", activo: true },
  ],
  checklist: [
    { id: "CHK001", depId: "DEP001", tarea: "Limpieza baños Piso 1",             periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK002", depId: "DEP002", tarea: "Limpieza baños Piso 2",             periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK003", depId: "DEP003", tarea: "Limpieza baños Piso 3",             periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK004", depId: "DEP004", tarea: "Limpieza recepción",                periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK005", depId: "DEP005", tarea: "Limpieza cocina y comedor",         periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK006", depId: "DEP006", tarea: "Desempolvado escritorios",          periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK007", depId: "DEP001", tarea: "Reposición insumos baños",          periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK008", depId: "DEP005", tarea: "Lavado de vajilla",                 periodicidad: "DIARIA",   obligatoria: true, activa: true },
    { id: "CHK009", depId: "DEP004", tarea: "Limpieza persianas y cortinas",     periodicidad: "SEMANAL",  obligatoria: true, activa: true },
    { id: "CHK010", depId: "DEP001", tarea: "Desinfección profunda baños",       periodicidad: "MENSUAL",  obligatoria: true, activa: true },
    { id: "CHK011", depId: "DEP005", tarea: "Limpieza profunda cocina",          periodicidad: "MENSUAL",  obligatoria: true, activa: true },
  ],
  evidencias: [
    { id: "EV001", checklistId: "CHK001", trabajadorId: "TR001", fechaHora: "2025-05-20T08:30:00", observacion: "Completado sin novedades",    cumplido: true },
    { id: "EV002", checklistId: "CHK002", trabajadorId: "TR001", fechaHora: "2025-05-20T08:55:00", observacion: "Falta papel higiénico",        cumplido: true },
    { id: "EV003", checklistId: "CHK004", trabajadorId: "TR001", fechaHora: "2025-05-20T09:10:00", observacion: "Completado",                   cumplido: true },
    { id: "EV004", checklistId: "CHK005", trabajadorId: "TR001", fechaHora: "2025-05-20T09:40:00", observacion: "Completado",                   cumplido: true },
    { id: "EV005", checklistId: "CHK007", trabajadorId: "TR001", fechaHora: "2025-05-20T10:00:00", observacion: "Repuesto papel y jabón",       cumplido: true },
  ],
  incidencias: [
    { id: "IN001", contratoId: "CT001", depId: "DEP001", fechaHora: "2025-05-19T14:00:00", tipo: "Falta Insumos",         descripcion: "Sin jabón líquido y papel toalla", estado: "Abierta",    trabajadorId: "TR001" },
    { id: "IN002", contratoId: "CT001", depId: "DEP003", fechaHora: "2025-05-20T11:00:00", tipo: "Daño infraestructura",  descripcion: "Canilla con pérdida de agua",       estado: "En Proceso", trabajadorId: "TR001" },
  ],
  supervisiones: [
    { id: "SV001", contratoId: "CT001", supervisorId: "SUP001", fecha: "2025-05-20", cumplimiento: 85, observacion: "Buen trabajo en baños, pendiente cocina" },
  ],
};

/* ─── Utilidades de color ───────────────────────────────────── */
const PCOLOR = { DIARIA: C.green, SEMANAL: C.accent, MENSUAL: C.purple };
const ECOLOR = { Abierta: C.red, "En Proceso": C.yellow, Cerrada: C.green };

/* ─── Componentes base ──────────────────────────────────────── */
function Badge({ text, color }) {
  return (
    <span style={{ background: color + "22", color, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 4, letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ color: C.textMuted, fontSize: 11, marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
      {count !== undefined && (
        <span style={{ background: C.accent + "22", color: C.accentLight, fontSize: 12, padding: "1px 8px", borderRadius: 10, fontWeight: 600 }}>{count}</span>
      )}
    </div>
  );
}

function Table({ cols, rows, emptyMsg = "Sin registros" }) {
  if (!rows.length) return (
    <div style={{ textAlign: "center", color: C.textDim, padding: "40px 0", fontSize: 14 }}>{emptyMsg}</div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{ color: C.textMuted, fontWeight: 500, fontSize: 11, textTransform: "uppercase",
                letterSpacing: "0.5px", padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
              {cols.map(c => (
                <td key={c.key} style={{ padding: "10px 12px", color: C.text, verticalAlign: "middle" }}>
                  {c.render ? c.render(row) : row[c.key]}
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
    <div style={{ background: C.surface, border: `1px solid ${accent ? accent + "55" : C.border}`,
      borderRadius: 12, padding: 20, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label style={{ color: C.textMuted, fontSize: 12, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, boxSizing: "border-box",
};

function Btn({ onClick, color = C.accent, children, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? C.border : color, color: "#fff", border: "none",
      borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", transition: "opacity 0.15s",
    }}>
      {children}
    </button>
  );
}

function BtnOutline({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer",
    }}>
      {children}
    </button>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────── */
function Dashboard({ data }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const evidenciasHoy   = data.evidencias.filter(e => e.fechaHora?.startsWith(hoy)).length;
  const totalTareas     = data.checklist.filter(c => c.activa).length;
  const incAbiertas     = data.incidencias.filter(i => i.estado === "Abierta").length;
  const cumProm         = data.supervisiones.length
    ? Math.round(data.supervisiones.reduce((a, s) => a + s.cumplimiento, 0) / data.supervisiones.length)
    : 0;

  const tareasXPer = data.checklist.reduce((acc, c) => {
    acc[c.periodicidad] = (acc[c.periodicidad] || 0) + 1; return acc;
  }, {});

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Dashboard operacional</h1>
        <p style={{ color: C.textMuted, margin: 0, fontSize: 13 }}>
          {data.contratos[0]?.cliente} — {data.contratos[0]?.instalacion}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Cumplimiento" value={`${cumProm}%`} sub="Última supervisión"
          color={cumProm >= 90 ? C.green : cumProm >= 70 ? C.yellow : C.red} />
        <StatCard label="Tareas hoy" value={`${evidenciasHoy}/${totalTareas}`}
          sub={`${totalTareas ? Math.round(evidenciasHoy / totalTareas * 100) : 0}% ejecutado`} color={C.accentLight} />
        <StatCard label="Incidencias" value={incAbiertas} sub="abiertas"
          color={incAbiertas > 0 ? C.red : C.green} />
        <StatCard label="Trabajadores" value={data.trabajadores.filter(t => t.activo).length} sub="activos" />
        <StatCard label="Dependencias" value={data.dependencias.filter(d => d.activo).length} sub="en control" />
        <StatCard label="Contratos" value={data.contratos.filter(c => c.activo).length} sub="activos" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHeader title="Tareas por periodicidad" />
          {["DIARIA", "SEMANAL", "MENSUAL"].map(p => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, background: C.border, borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${((tareasXPer[p] || 0) / totalTareas) * 100}%`, height: "100%",
                  background: PCOLOR[p], borderRadius: 4 }} />
              </div>
              <Badge text={p} color={PCOLOR[p]} />
              <span style={{ color: C.textMuted, fontSize: 13, minWidth: 20, textAlign: "right" }}>{tareasXPer[p] || 0}</span>
            </div>
          ))}
        </Card>

        <Card>
          <SectionHeader title="Incidencias recientes" />
          {data.incidencias.slice(-4).reverse().map(inc => {
            const dep = data.dependencias.find(d => d.id === inc.depId);
            return (
              <div key={inc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderBottom: `1px solid ${C.border}22` }}>
                <div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{inc.tipo}</div>
                  <div style={{ color: C.textDim, fontSize: 11 }}>{dep?.nombre}</div>
                </div>
                <Badge text={inc.estado} color={ECOLOR[inc.estado]} />
              </div>
            );
          })}
          {!data.incidencias.length && <p style={{ color: C.textDim, fontSize: 13 }}>Sin incidencias</p>}
        </Card>
      </div>

      <Card>
        <SectionHeader title="Últimas evidencias" />
        <Table
          cols={[
            { key: "tarea",      label: "Tarea",       render: r => { const c = data.checklist.find(ch => ch.id === r.checklistId); return c?.tarea || r.checklistId; } },
            { key: "trabajador", label: "Trabajador",  render: r => { const t = data.trabajadores.find(w => w.id === r.trabajadorId); return t?.nombre.split(" ").slice(0,2).join(" ") || r.trabajadorId; } },
            { key: "hora",       label: "Hora",        render: r => <span style={{ color: C.textMuted }}>{r.fechaHora?.split("T")[1]?.slice(0,5) || "—"}</span> },
            { key: "obs",        label: "Observación", render: r => <span style={{ color: C.textMuted }}>{r.observacion || "—"}</span> },
            { key: "estado",     label: "Estado",      render: r => <Badge text={r.cumplido ? "Cumplido" : "Pendiente"} color={r.cumplido ? C.green : C.red} /> },
          ]}
          rows={[...data.evidencias].reverse().slice(0, 5)}
        />
      </Card>
    </div>
  );
}

/* ─── Trabajadores ──────────────────────────────────────────── */
function Trabajadores({ data, setData }) {
  const [form, setForm] = useState(null);
  const openNew = () => setForm({ id: `TR${String(data.trabajadores.filter(t=>!t.id.startsWith("SUP")).length + 1).padStart(3,"0")}`, nombre: "", cargo: "Auxiliar Aseo", telefono: "", email: "", activo: true });

  const save = () => {
    if (!form.nombre.trim()) return;
    const exists = data.trabajadores.find(t => t.id === form.id);
    const lista = exists
      ? data.trabajadores.map(t => t.id === form.id ? form : t)
      : [...data.trabajadores, form];
    setData({ ...data, trabajadores: lista });
    setForm(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <SectionHeader title="Trabajadores" count={data.trabajadores.length} />
        <Btn onClick={openNew}>+ Nuevo trabajador</Btn>
      </div>

      {form && (
        <Card accent={C.accent}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FormField label="Nombre completo">
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Nombre Apellido" />
            </FormField>
            <FormField label="Cargo">
              <select style={inputStyle} value={form.cargo} onChange={e => setForm({...form, cargo: e.target.value})}>
                <option>Auxiliar Aseo</option>
                <option>Supervisor</option>
                <option>Jefe de Turno</option>
              </select>
            </FormField>
            <FormField label="Teléfono">
              <input style={inputStyle} value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} placeholder="+569XXXXXXXX" />
            </FormField>
            <FormField label="Email">
              <input style={inputStyle} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="correo@empresa.cl" />
            </FormField>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} color={C.green}>Guardar</Btn>
            <BtnOutline onClick={() => setForm(null)}>Cancelar</BtnOutline>
          </div>
        </Card>
      )}

      <Table
        cols={[
          { key: "id",       label: "ID",        render: r => <span style={{ fontFamily: "monospace", color: C.textDim, fontSize: 11 }}>{r.id}</span> },
          { key: "nombre",   label: "Nombre" },
          { key: "cargo",    label: "Cargo",     render: r => <Badge text={r.cargo} color={r.cargo === "Supervisor" ? C.purple : C.accent} /> },
          { key: "telefono", label: "Teléfono",  render: r => <span style={{ color: C.textMuted }}>{r.telefono || "—"}</span> },
          { key: "email",    label: "Email",     render: r => <span style={{ color: C.textMuted }}>{r.email || "—"}</span> },
          { key: "activo",   label: "Estado",    render: r => <Badge text={r.activo ? "Activo" : "Inactivo"} color={r.activo ? C.green : C.red} /> },
          { key: "accion",   label: "",          render: r => (
            <button onClick={() => setForm({...r})} style={{ background: "transparent", color: C.textDim, border: "none", cursor: "pointer", fontSize: 12 }}>Editar</button>
          )},
        ]}
        rows={data.trabajadores}
      />
    </div>
  );
}

/* ─── Checklist ─────────────────────────────────────────────── */
function Checklist({ data, setData }) {
  const [filtro, setFiltro] = useState("TODAS");
  const [form, setForm] = useState(null);
  const rows = filtro === "TODAS" ? data.checklist : data.checklist.filter(c => c.periodicidad === filtro);

  const hoy = new Date().toISOString().slice(0, 10);

  const registrarEvidencia = (chkId) => {
    const nuevaEv = {
      id:          `EV${String(data.evidencias.length + 1).padStart(3,"0")}`,
      checklistId: chkId,
      trabajadorId: data.trabajadores.find(t => t.cargo !== "Supervisor")?.id || "TR001",
      fechaHora:   new Date().toISOString().slice(0,19),
      observacion:  "",
      cumplido:     true,
    };
    setData({ ...data, evidencias: [...data.evidencias, nuevaEv] });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <SectionHeader title="Checklist de tareas" count={data.checklist.length} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["TODAS", "DIARIA", "SEMANAL", "MENSUAL"].map(p => (
            <button key={p} onClick={() => setFiltro(p)} style={{
              background: filtro === p ? (PCOLOR[p] || C.accent) : "transparent",
              color: filtro === p ? "#fff" : C.textMuted,
              border: `1px solid ${filtro === p ? "transparent" : C.border}`,
              borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 500,
            }}>{p}</button>
          ))}
        </div>
      </div>

      <Table
        cols={[
          { key: "id",   label: "ID",  render: r => <span style={{ fontFamily: "monospace", color: C.textDim, fontSize: 11 }}>{r.id}</span> },
          { key: "tarea",label: "Tarea" },
          { key: "dep",  label: "Dependencia", render: r => { const d = data.dependencias.find(dep => dep.id === r.depId); return <span style={{ color: C.textMuted }}>{d?.nombre || r.depId}</span>; } },
          { key: "per",  label: "Periodicidad", render: r => <Badge text={r.periodicidad} color={PCOLOR[r.periodicidad]} /> },
          { key: "ev",   label: "Evidencias hoy", render: r => {
            const n = data.evidencias.filter(e => e.checklistId === r.id && e.fechaHora?.startsWith(hoy)).length;
            return n > 0
              ? <span style={{ color: C.green, fontWeight: 700 }}>✓ {n}</span>
              : <button onClick={() => registrarEvidencia(r.id)} style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Marcar ✓</button>;
          }},
        ]}
        rows={rows}
      />
    </div>
  );
}

/* ─── Incidencias ───────────────────────────────────────────── */
const TIPOS = ["Falta Insumos", "Daño infraestructura", "Accidente laboral", "Limpieza deficiente", "Otro"];

function Incidencias({ data, setData }) {
  const [form, setForm] = useState(null);
  const abiertas = data.incidencias.filter(i => i.estado === "Abierta").length;

  const openNew = () => setForm({
    id:          `IN${String(data.incidencias.length + 1).padStart(3,"0")}`,
    contratoId:  "CT001",
    depId:       "DEP001",
    fechaHora:   new Date().toISOString().slice(0,19),
    tipo:        "Falta Insumos",
    descripcion: "",
    estado:      "Abierta",
    trabajadorId: data.trabajadores.find(t => t.cargo !== "Supervisor")?.id || "TR001",
  });

  const save = () => {
    if (!form.descripcion.trim()) return;
    setData({ ...data, incidencias: [...data.incidencias, form] });
    setForm(null);
  };

  const cambiarEstado = (id, estado) => {
    setData({ ...data, incidencias: data.incidencias.map(i => i.id === id ? { ...i, estado } : i) });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SectionHeader title="Incidencias" count={data.incidencias.length} />
          {abiertas > 0 && <Badge text={`${abiertas} abiertas`} color={C.red} />}
        </div>
        <Btn onClick={openNew} color={C.red}>+ Reportar</Btn>
      </div>

      {form && (
        <Card accent={C.red}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FormField label="Dependencia">
              <select style={inputStyle} value={form.depId} onChange={e => setForm({...form, depId: e.target.value})}>
                {data.dependencias.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </FormField>
            <FormField label="Tipo de incidencia">
              <select style={inputStyle} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Descripción detallada" >
              <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }}
                value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})}
                placeholder="Describe la incidencia..." />
            </FormField>
            <FormField label="Trabajador que reporta">
              <select style={inputStyle} value={form.trabajadorId} onChange={e => setForm({...form, trabajadorId: e.target.value})}>
                {data.trabajadores.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} color={C.red}>Registrar incidencia</Btn>
            <BtnOutline onClick={() => setForm(null)}>Cancelar</BtnOutline>
          </div>
        </Card>
      )}

      <Table
        cols={[
          { key: "id",    label: "ID",    render: r => <span style={{ fontFamily: "monospace", color: C.textDim, fontSize: 11 }}>{r.id}</span> },
          { key: "tipo",  label: "Tipo" },
          { key: "dep",   label: "Dependencia", render: r => { const d = data.dependencias.find(dep => dep.id === r.depId); return <span style={{ color: C.textMuted }}>{d?.nombre}</span>; } },
          { key: "desc",  label: "Descripción", render: r => <span style={{ color: C.textMuted }}>{r.descripcion || "—"}</span> },
          { key: "fecha", label: "Fecha", render: r => <span style={{ color: C.textDim, fontSize: 12 }}>{r.fechaHora?.replace("T"," ").slice(0,16)}</span> },
          { key: "estado",label: "Estado", render: r => (
            <select value={r.estado} onChange={e => cambiarEstado(r.id, e.target.value)}
              style={{ background: ECOLOR[r.estado] + "22", color: ECOLOR[r.estado],
                border: `1px solid ${ECOLOR[r.estado]}44`, borderRadius: 6, padding: "3px 8px",
                fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {["Abierta","En Proceso","Cerrada"].map(s => <option key={s}>{s}</option>)}
            </select>
          )},
        ]}
        rows={data.incidencias}
      />
    </div>
  );
}

/* ─── Supervisiones ─────────────────────────────────────────── */
function Supervisiones({ data, setData }) {
  const [form, setForm] = useState(null);

  const openNew = () => setForm({
    id:           `SV${String(data.supervisiones.length + 1).padStart(3,"0")}`,
    contratoId:   "CT001",
    supervisorId: data.trabajadores.find(t => t.cargo === "Supervisor")?.id || "SUP001",
    fecha:        new Date().toISOString().slice(0,10),
    cumplimiento: 90,
    observacion:  "",
  });

  const save = () => {
    setData({ ...data, supervisiones: [...data.supervisiones, form] });
    setForm(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <SectionHeader title="Supervisiones" count={data.supervisiones.length} />
        <Btn onClick={openNew} color={C.purple}>+ Nueva supervisión</Btn>
      </div>

      {form && (
        <Card accent={C.purple}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <FormField label={`Cumplimiento: ${form.cumplimiento}%`}>
              <input type="range" min={0} max={100} value={form.cumplimiento}
                onChange={e => setForm({...form, cumplimiento: Number(e.target.value)})}
                style={{ width: "100%", accentColor: C.purple }} />
            </FormField>
            <FormField label="Fecha">
              <input type="date" style={inputStyle} value={form.fecha}
                onChange={e => setForm({...form, fecha: e.target.value})} />
            </FormField>
            <div style={{ gridColumn: "1 / -1" }}>
              <FormField label="Observaciones">
                <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }}
                  value={form.observacion} onChange={e => setForm({...form, observacion: e.target.value})}
                  placeholder="Describe lo observado durante la supervisión..." />
              </FormField>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} color={C.purple}>Guardar</Btn>
            <BtnOutline onClick={() => setForm(null)}>Cancelar</BtnOutline>
          </div>
        </Card>
      )}

      <Table
        cols={[
          { key: "id",         label: "ID",           render: r => <span style={{ fontFamily: "monospace", color: C.textDim, fontSize: 11 }}>{r.id}</span> },
          { key: "fecha",      label: "Fecha",        render: r => <span style={{ color: C.textMuted }}>{r.fecha}</span> },
          { key: "supervisor", label: "Supervisor",   render: r => { const s = data.trabajadores.find(t => t.id === r.supervisorId); return s?.nombre.split(" ").slice(0,2).join(" ") || r.supervisorId; } },
          { key: "cum",        label: "Cumplimiento", render: r => (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 80, background: C.border, borderRadius: 4, height: 6 }}>
                <div style={{ width: `${r.cumplimiento}%`, height: "100%", borderRadius: 4,
                  background: r.cumplimiento >= 90 ? C.green : r.cumplimiento >= 70 ? C.yellow : C.red }} />
              </div>
              <span style={{ fontWeight: 700, color: r.cumplimiento >= 90 ? C.green : r.cumplimiento >= 70 ? C.yellow : C.red }}>
                {r.cumplimiento}%
              </span>
            </div>
          )},
          { key: "obs", label: "Observación", render: r => <span style={{ color: C.textMuted }}>{r.observacion || "—"}</span> },
        ]}
        rows={data.supervisiones}
      />
    </div>
  );
}

/* ─── Informes con IA ───────────────────────────────────────── */
function InformesIA({ data }) {
  const [tipo, setTipo]       = useState("operacional");
  const [informe, setInforme] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const hoy          = new Date().toISOString().slice(0, 10);
  const evidHoy      = data.evidencias.filter(e => e.fechaHora?.startsWith(hoy)).length;
  const totalTareas  = data.checklist.length;
  const cumProm      = data.supervisiones.length
    ? Math.round(data.supervisiones.reduce((a, s) => a + s.cumplimiento, 0) / data.supervisiones.length) : 0;
  const incAbiertas  = data.incidencias.filter(i => i.estado === "Abierta");

  const prompts = {
    operacional: `Genera un informe operacional diario profesional para la empresa LEG Servicios de Limpieza.

Contrato: ${data.contratos[0]?.cliente}, ${data.contratos[0]?.instalacion}, ${data.contratos[0]?.direccion}
Trabajador: ${data.trabajadores.find(t=>t.cargo!=="Supervisor")?.nombre}
Supervisor: ${data.trabajadores.find(t=>t.cargo==="Supervisor")?.nombre}
Tareas ejecutadas hoy: ${evidHoy} de ${totalTareas}
Cumplimiento promedio en supervisiones: ${cumProm}%
Incidencias abiertas: ${incAbiertas.length} (${incAbiertas.map(i=>i.tipo).join(", ") || "ninguna"})
Dependencias controladas: ${data.dependencias.length}

Redacta en español, estilo formal, con secciones: Resumen ejecutivo, Actividades realizadas, Incidencias, Recomendaciones. Máximo 350 palabras.`,

    licitacion: `Redacta un párrafo de justificación técnica para incluir en una propuesta de licitación pública de aseo. Describe el sistema de control y trazabilidad operacional de LEG Servicios de Limpieza: registro digital de evidencias, checklist por dependencia con periodicidad diaria/semanal/mensual, sistema de incidencias con seguimiento, supervisiones con % de cumplimiento, códigos QR por área, y trazabilidad completa por trabajador y fecha. Estilo formal, convincente, máximo 200 palabras en español.`,

    analisis: `Analiza los datos operacionales de LEG Servicios de Limpieza y entrega exactamente 3 observaciones clave y 3 recomendaciones concretas:
- ${evidHoy} de ${totalTareas} tareas registradas hoy
- ${data.incidencias.length} incidencias totales, ${incAbiertas.length} abiertas
- Tipos de incidencias: ${[...new Set(data.incidencias.map(i=>i.tipo))].join(", ")}
- ${data.dependencias.length} dependencias bajo control
- Cumplimiento promedio: ${cumProm}%

Sé específico y práctico. En español.`,
  };

  const tipos = [
    { key: "operacional", label: "Informe diario" },
    { key: "licitacion",  label: "Texto para licitación" },
    { key: "analisis",    label: "Análisis y recomendaciones" },
  ];

  const generar = async () => {
    setLoading(true);
    setInforme("");
    setError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompts[tipo] }],
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setInforme(json.content?.map(b => b.text || "").join("") || "Sin respuesta.");
    } catch (e) {
      setError("Error al generar el informe. Verifica tu conexión.");
    }
    setLoading(false);
  };

  const copiar = () => navigator.clipboard?.writeText(informe);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <SectionHeader title="Informes con IA" />
        <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
          Genera documentos profesionales a partir de los datos operacionales del sistema.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tipos.map(t => (
          <button key={t.key} onClick={() => setTipo(t.key)} style={{
            background: tipo === t.key ? C.accent : C.surface,
            color: tipo === t.key ? "#fff" : C.textMuted,
            border: `1px solid ${tipo === t.key ? C.accent : C.border}`,
            borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 500,
          }}>{t.label}</button>
        ))}
      </div>

      <Btn onClick={generar} disabled={loading}>
        {loading ? "Generando…" : "⚡ Generar con IA"}
      </Btn>

      {error && (
        <div style={{ background: C.red + "15", border: `1px solid ${C.red}33`, borderRadius: 10, padding: 16, marginTop: 16, color: C.red, fontSize: 13 }}>
          {error}
        </div>
      )}

      {informe && (
        <Card accent={C.accent}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: C.accentLight, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Informe generado
            </span>
            <button onClick={copiar} style={{ background: "transparent", color: C.textMuted,
              border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
              Copiar texto
            </button>
          </div>
          <div style={{ color: C.text, fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{informe}</div>
        </Card>
      )}
    </div>
  );
}

/* ─── App principal ─────────────────────────────────────────── */
const TABS = [
  { key: "dashboard",    label: "Dashboard" },
  { key: "trabajadores", label: "Trabajadores" },
  { key: "checklist",   label: "Checklist" },
  { key: "incidencias",  label: "Incidencias" },
  { key: "supervisiones",label: "Supervisiones" },
  { key: "informes",     label: "Informes IA" },
];

export default function App() {
  const [tab, setTab]   = useState("dashboard");
  const [data, setData] = useState(initialData);

  const incAbiertas = data.incidencias.filter(i => i.estado === "Abierta").length;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'IBM Plex Mono','Courier New',monospace", color: C.text }}>
      {/* Barra superior */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "0 20px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: C.accent, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>
              L
            </div>
            <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>LimpiApp Pro</span>
            <span style={{ color: C.textDim, fontSize: 12 }}>/ LEG Servicios de Limpieza</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, background: C.green, borderRadius: "50%" }} />
            <span style={{ color: C.textMuted, fontSize: 12 }}>Sistema activo</span>
          </div>
        </div>

        {/* Pestañas */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: "transparent",
              color: tab === t.key ? C.accentLight : C.textMuted,
              border: "none",
              borderBottom: tab === t.key ? `2px solid ${C.accentLight}` : "2px solid transparent",
              padding: "10px 14px", fontSize: 13, cursor: "pointer",
              fontWeight: tab === t.key ? 600 : 400,
              whiteSpace: "nowrap", transition: "color 0.15s",
            }}>
              {t.label}
              {t.key === "incidencias" && incAbiertas > 0 && (
                <span style={{ marginLeft: 6, background: C.red, color: "#fff",
                  borderRadius: 10, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>
                  {incAbiertas}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        {tab === "dashboard"     && <Dashboard      data={data} />}
        {tab === "trabajadores"  && <Trabajadores   data={data} setData={setData} />}
        {tab === "checklist"    && <Checklist      data={data} setData={setData} />}
        {tab === "incidencias"   && <Incidencias    data={data} setData={setData} />}
        {tab === "supervisiones" && <Supervisiones  data={data} setData={setData} />}
        {tab === "informes"      && <InformesIA     data={data} />}
      </div>
    </div>
  );
}
