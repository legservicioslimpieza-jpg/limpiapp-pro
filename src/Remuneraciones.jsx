import { useState, useEffect, useCallback } from "react";
import { supabase, isConfigured } from "./supabase.js";

/* ─── Paleta de Colores Corporativa (Modo Claro Adaptado) ─── */
const C = {
  bg: "#f8fafc",        // Fondo gris claro
  surface: "#ffffff",   // Paneles blancos puros
  border: "#e2e8f0",    // Bordes gris suave
  accent: "#0284c7",    // Azul corporativo principal
  accentLight: "#e0f2fe", // Destacados azul claro
  green: "#16a34a",     // Éxito / Vigente
  yellow: "#ca8a04",    // Proceso / Alertas
  red: "#dc2626",       // Crítico
  purple: "#9333ea",    // Frecuencias
  text: "#0f172a",       // Texto principal oscuro
  textMuted: "#475569",  // Texto secundario
  textDim: "#94a3b8",
};

const clp = n => n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CL");
const pct = n => n == null ? "—" : (n * 100).toFixed(2) + "%";

const AFP_DEFAULT = [
  { nombre:"NO COTIZA", tasa_trabajador:0, sis:0 },
  { nombre:"CAPITAL", tasa_trabajador:0.1144, sis:0.0162 },
  { nombre:"CUPRUM", tasa_trabajador:0.1144, sis:0.0162 },
  { nombre:"HABITAT", tasa_trabajador:0.1127, sis:0.0162 },
  { nombre:"MODELO", tasa_trabajador:0.1058, sis:0.0162 },
  { nombre:"PLANVITAL", tasa_trabajador:0.1116, sis:0.0162 },
  { nombre:"PROVIDA", tasa_trabajador:0.1145, sis:0.0162 },
  { nombre:"UNO", tasa_trabajador:0.1069, sis:0.0162 }
];

export default function Remuneraciones({ data, contratoId }) {
  const [tab, setTab] = useState("planilla");
  const [trabajadores, setTrabajadores] = useState(data?.trabajadores || []);
  const [tasasAfp, setTasasAfp] = useState(AFP_DEFAULT);

  return (
    <div style={{ color: C.text }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: 20, paddingBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: C.accent }}>Módulo de Remuneraciones</h2>
        <p style={{ margin: "4px 0 0 0", color: C.textMuted, fontSize: 13 }}>Cálculo automatizado de liquidaciones bajo normativa legal vigente.</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTab("planilla")} style={{ padding: "8px 16px", background: tab === "planilla" ? C.accent : C.surface, color: tab === "planilla" ? "#fff" : C.text, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Planilla Mensual</button>
        <button onClick={() => setTab("trabajadores")} style={{ padding: "8px 16px", background: tab === "trabajadores" ? C.accent : C.surface, color: tab === "trabajadores" ? "#fff" : C.text, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Fichas Personal</button>
      </div>

      {tab === "planilla" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                <th style={{ padding: 10, color: C.textMuted }}>Trabajador</th>
                <th style={{ padding: 10, color: C.textMuted }}>RUT</th>
                <th style={{ padding: 10, color: C.textMuted }}>Cargo</th>
                <th style={{ padding: 10, color: C.textMuted }}>Sueldo Base</th>
                <th style={{ padding: 10, color: C.textMuted }}>Previsión / Salud</th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: 10, fontWeight: 500 }}>{t.nombre}</td>
                  <td style={{ padding: 10 }}>{t.rut}</td>
                  <td style={{ padding: 10 }}>{t.cargo}</td>
                  <td style={{ padding: 10, fontWeight: 600, color: C.green }}>{clp(t.sueldo_base)}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{ fontSize: 11, background: C.accentLight, color: C.accent, padding: "2px 6px", borderRadius: 4, marginRight: 4, fontWeight: 600 }}>{t.afp}</span>
                    <span style={{ fontSize: 11, background: "#e2e8f0", color: C.textMuted, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{t.salud}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "trabajadores" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {trabajadores.map(t => (
            <div key={t.id} style={{ border: `1px solid ${C.border}`, padding: 16, borderRadius: 8, background: C.surface }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: 15 }}>{t.nombre}</h4>
              <p style={{ margin: "4px 0", fontSize: 13, color: C.textMuted }}>RUT: {t.rut} | Contrato: {t.tipo_contrato}</p>
              <p style={{ margin: "4px 0", fontSize: 13, color: C.textMuted }}>Asignaciones: Colación {clp(t.bono_colacion)} · Movilización {clp(t.bono_movilizacion)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
