import { useState, useEffect } from "react";
import { supabase, isConfigured } from "./supabase.js";

// Paleta de Colores Corporativa (Modo Claro Solicitado)
const C = {
  bg: "#f8fafc",        // Fondo de pantalla gris claro corporativo
  surface: "#ffffff",   // Paneles y tarjetas blancos puros
  border: "#e2e8f0",    // Bordes sutiles gris claro
  accent: "#0284c7",    // Azul corporativo principal
  accentLight: "#e0f2fe", // Destacados en azul claro
  green: "#16a34a",     // Estados en verde
  yellow: "#ca8a04",    // Estados en proceso / alertas
  red: "#dc2626",       // Estados abiertos / críticos
  purple: "#9333ea",    // Frecuencias especiales
  text: "#0f172a",       // Texto principal casi negro (lectura perfecta)
  textMuted: "#475569",  // Texto secundario
  textDim: "#94a3b8"     // Texto suave
};

const PCOLOR = { DIARIA: C.green, SEMANAL: C.accent, QUINCENAL: "#0d9488", MENSUAL: C.purple, TRIMESTRAL: C.yellow };
const ECOLOR = { Abierta: C.red, "En Proceso": C.yellow, Cerrada: C.green };

// Estilo de los campos: Fondo blanco y texto oscuro garantizado
const INP = { 
  width: "100%", 
  background: "#ffffff", 
  border: `1px solid ${C.border}`, 
  borderRadius: 6, 
  padding: "8px 12px", 
  color: "#0f172a", 
  fontSize: 13, 
  outline: "none" 
};

function Badge({ text, color }) {
  return <span style={{ background: color + "12", color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: `1px solid ${color}25` }}>{text}</span>;
}

export default function App() {
  const [contratos, setContratos] = useState([]);
  const [selectedContrato, setSelectedContrato] = useState("");
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);

  // // Cargar la nómina real de 8 contratos de LEG Servicios de Limpieza
  useEffect(() => {
    setContratos([
      { id: "CT001", cliente: "Seremi de Transportes", instalacion: "Sucursal Arica", estado: "Vigente" },
      { id: "CT002", cliente: "Museo Histórico Morro de Arica", instalacion: "Monumento Nacional", estado: "Vigente" },
      { id: "CT003", cliente: "Seremi de Medio Ambiente", instalacion: "Dirección Regional", estado: "Vigente" },
      { id: "CT004", cliente: "Subdere", instalacion: "Unidad Regional Arica", estado: "Vigente" },
      { id: "CT005", cliente: "Seremi de Ciencias y Tecnología", instalacion: "Dirección Regional", estado: "Vigente" },
      { id: "CT006", cliente: "Dipreca", instalacion: "Plataforma de Atención", estado: "Postulación" },
      { id: "CT007", cliente: "Regimiento Pisagua", instalacion: "Brigada Motorizada N°4", estado: "Renovación" },
      { id: "CT008", cliente: "Servel", instalacion: "Dirección Regional Arica y Parinacota", estado: "Postulación" }
    ]);
    
    setTareas([
      { id: 1, contrato_id: "CT001", tarea: "Limpieza y desinfección baños Pisos 1, 2 y 3", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 2, contrato_id: "CT001", tarea: "Desempolvado de escritorios y puestos de trabajo", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 3, contrato_id: "CT001", tarea: "Limpieza de vidrios interiores, ventanas y mamparas", periodicidad: "SEMANAL", estado: "En Proceso", responsable: "" },
      { id: 4, contrato_id: "CT002", tarea: "Sala museo: limpieza de vitrinas de madera y vidrio", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 5, contrato_id: "CT002", tarea: "Limpieza de bronces San Martín, rosa vientos y cañones", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 6, contrato_id: "CT002", tarea: "Lavado del camino de cemento con hidrolavadora", periodicidad: "MENSUAL", estado: "Abierta", responsable: "" },
      { id: 7, contrato_id: "CT003", tarea: "Limpieza de entradas, antejardín, fachada y vereda", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 8, contrato_id: "CT003", tarea: "Limpieza de vehículo fiscal (interior aspirado y exterior)", periodicidad: "QUINCENAL", estado: "Abierta", responsable: "" },
      { id: 9, contrato_id: "CT004", tarea: "Limpieza general de muebles con desinfectante", periodicidad: "DIARIA", estado: "En Proceso", responsable: "" },
      { id: 10, contrato_id: "CT004", tarea: "Mantención de jardines (corte de pasto y retiro de hojas)", periodicidad: "QUINCENAL", estado: "Abierta", responsable: "" },
      { id: 11, contrato_id: "CT005", tarea: "Limpieza de recepción, hall y entradas", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 12, contrato_id: "CT005", tarea: "Lavado profundo de pisos con máquina o abrillantado", periodicidad: "MENSUAL", estado: "Abierta", responsable: "" },
      { id: 13, contrato_id: "CT006", tarea: "Limpieza de recepción, sala de espera y pasillos", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 14, contrato_id: "CT007", tarea: "Casino Oficiales y Suboficiales: barrido, trapeado y pisos", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 15, contrato_id: "CT007", tarea: "Lavado de loza del rancho (100 elementos por día)", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 16, contrato_id: "CT008", tarea: "Aseo profundo de baños (desinfección de artefactos)", periodicidad: "DIARIA", estado: "Abierta", responsable: "" },
      { id: 17, contrato_id: "CT008", tarea: "Lavado de alfombra (aseo mensual profundo)", periodicidad: "MENSUAL", estado: "Abierta", responsable: "" }
    ]);
    
    setLoading(false);
  }, []);

  const handleEstadoChange = async (id, nuevoEstado) => {
    setTareas(tareas.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t));
    if (isConfigured) {
      await supabase.from("checklist").update({ estado: nuevoEstado }).eq("id", id);
    }
  };

  const handleEstadoChange = async (id, nuevoEstado) => {
    setTareas(tareas.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t));
    if (isConfigured) {
      await supabase.from("checklist").update({ estado: nuevoEstado }).eq("id", id);
    }
  };

  const handleResponsableChange = async (id, nombre) => {
    setTareas(tareas.map(t => t.id === id ? { ...t, responsable: nombre } : t));
    if (isConfigured) {
      await supabase.from("checklist").update({ responsable: nombre }).eq("id", id);
    }
  };

  const contratosFiltrados = selectedContrato 
    ? contratos.filter(c => c.id === selectedContrato)
    : contratos;

  if (loading) {
    return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center", alignItems: "center", color: C.textMuted }}>Cargando Limpiapp Pro V2...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "system-ui, sans-serif", padding: "30px", color: C.text }}>
      
      {/* HEADER PRINCIPAL MODO CLARO */}
      <header style={{ background: C.surface, padding: "20px 30px", borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div>
          <h1 style={{ margin: 0, color: C.text, fontSize: 22, fontWeight: 700 }}>Limpiapp Pro V3</h1>
          <p style={{ margin: "4px 0 0 0", color: C.textMuted, fontSize: 14 }}>Control Operacional ERP · Supervisor: Luis Guzman L.</p>
        </div>
        
        {/* SELECTOR DE CONTRATO */}
        <div>
          <label style={{ marginRight: 10, fontSize: 13, fontWeight: 600, color: C.textMuted }}>Ver Faena:</label>
          <select 
            value={selectedContrato} 
            onChange={(e) => setSelectedContrato(e.target.value)}
            style={{ ...INP, width: "240px", display: "inline-block" }}
          >
            <option value="">— Todas las Empresas (5) —</option>
            {contratos.map(c => (
              <option key={c.id} value={c.id}>{c.cliente}</option>
            ))}
          </select>
        </div>
      </header>

      {/* LISTADO DINÁMICO DE CONTRATOS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
        {contratosFiltrados.map(c => {
          const tareasDelContrato = tareas.filter(t => t.contrato_id === c.id);
          
          return (
            <div key={c.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>{c.cliente}</h3>
                  <span style={{ fontSize: 13, color: C.textMuted }}>{c.instalacion || "Planta Principal"}</span>
                </div>
                <Badge text={c.estado || "Vigente"} color={C.green} />
              </div>

              <h4 style={{ color: C.textMuted, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Checklist de Tareas Específicas ({tareasDelContrato.length})</h4>

              {tareasDelContrato.length === 0 ? (
                <p style={{ fontSize: 13, color: C.textDim, fontStyle: "italic" }}>No hay tareas registradas para esta faena en Supabase.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}`, background: "#f8fafc", textAlign: "left" }}>
                        <th style={{ padding: "10px", color: C.textMuted, fontWeight: 600 }}>Pauta Operativa</th>
                        <th style={{ padding: "10px", color: C.textMuted, fontWeight: 600 }}>Periodicidad</th>
                        <th style={{ padding: "10px", color: C.textMuted, fontWeight: 600 }}>Estado</th>
                        <th style={{ padding: "10px", color: C.textMuted, fontWeight: 600 }}>Responsable en Terreno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tareasDelContrato.map(t => (
                        <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "12px 10px", fontWeight: 500, color: C.text }}>{t.tarea}</td>
                          <td style={{ padding: "12px 10px" }}>
                            <Badge text={t.periodicidad || "DIARIA"} color={PCOLOR[t.periodicidad] || C.accent} />
                          </td>
                          <td style={{ padding: "12px 10px" }}>
                            <select 
                              value={t.estado || "Abierta"} 
                              onChange={(e) => handleEstadoChange(t.id, e.target.value)}
                              style={{ ...INP, width: "135px", padding: "4px 8px", background: ECOLOR[t.estado || "Abierta"] + "10", color: ECOLOR[t.estado || "Abierta"], borderColor: ECOLOR[t.estado || "Abierta"] + "40", fontWeight: 600 }}
                            >
                              <option value="Abierta">🔴 Abierta</option>
                              <option value="En Proceso">🟡 En Proceso</option>
                              <option value="Cerrada">🟢 Cerrada</option>
                            </select>
                          </td>
                          <td style={{ padding: "12px 10px" }}>
                            <input 
                              type="text" 
                              value={t.responsable || ""} 
                              placeholder="Nombre del operario..." 
                              onChange={(e) => handleResponsableChange(t.id, e.target.value)}
                              style={INP}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
