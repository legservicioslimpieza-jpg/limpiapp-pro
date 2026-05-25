import React, { useState, useEffect } from 'react';

// Estilo CSS Embebido para asegurar el Modo Claro Corporativo de LEG Servicios de Limpieza
const estilos = `
  :root {
    --bg-principal: #F1F5F9;
    --tarjeta-blanca: #FFFFFF;
    --texto-oscuro: #0F172A;
    --texto-mutado: #64748B;
    --borde: #E2E8F0;
    --azul-leg: #2563EB;
    --azul-hover: #1D4ED8;
    --verde-exito: #16A34A;
    --naranja-alerta: #EA580C;
  }
  body {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: var(--bg-principal);
    color: var(--texto-oscuro);
  }
  .app-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }
  .header-erp {
    background-color: var(--tarjeta-blanca);
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    margin-bottom: 24px;
    display: flex;
    justify-content: flex-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    border: 1px solid var(--borde);
  }
  .titulo-principal {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--azul-leg);
  }
  .sub-supervisor {
    margin: 4px 0 0 0;
    font-size: 14px;
    color: var(--texto-mutado);
  }
  .selector-faena {
    padding: 10px 16px;
    font-size: 15px;
    border-radius: 8px;
    border: 1px solid var(--borde);
    background-color: var(--tarjeta-blanca);
    color: var(--texto-oscuro);
    font-weight: 600;
    cursor: pointer;
    min-width: 280px;
  }
  .grid-contratos {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 20px;
  }
  .card-contrato {
    background-color: var(--tarjeta-blanca);
    border-radius: 12px;
    border: 1px solid var(--borde);
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid var(--borde);
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .cliente-nombre {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--texto-oscuro);
  }
  .instalacion-nombre {
    margin: 4px 0 0 0;
    font-size: 13px;
    color: var(--texto-mutado);
  }
  .badge-estado {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge-vigente { background-color: #DCFCE7; color: #15803D; }
  .badge-proceso { background-color: #FFEDD5; color: #C2410C; }
  .item-tarea {
    background-color: #F8FAFC;
    border: 1px solid var(--borde);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 10px;
  }
  .texto-tarea {
    margin: 0 0 8px 0;
    font-size: 14px;
    line-height: 1.4;
  }
  .meta-tarea {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--texto-mutado);
  }
  .btn-estado {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--borde);
    background-color: var(--tarjeta-blanca);
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
  }
  .btn-abierta { color: var(--naranja-alerta); border-color: #FFEDD5; }
  .btn-proceso { color: var(--azul-leg); border-color: #DBEAFE; }
  .btn-cerrada { color: var(--verde-exito); border-color: #DCFCE7; background-color: #F0FDF4; }
`;

export default function App() {
  const [contratos, setContratos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("TODOS");

  // Cargar la nómina real de 8 contratos de LEG Servicios de Limpieza de forma inmediata
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
      { id: 1, contrato_id: "CT001", tarea: "Limpieza y desinfección baños Pisos 1, 2 y 3", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 2, contrato_id: "CT001", tarea: "Desempolvado de escritorios y puestos de trabajo", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 3, contrato_id: "CT001", tarea: "Limpieza de vidrios interiores, ventanas y mamparas", periodicidad: "SEMANAL", estado: "En Proceso" },
      { id: 4, contrato_id: "CT002", tarea: "Sala museo: limpieza de vitrinas de madera y vidrio", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 5, contrato_id: "CT002", tarea: "Limpieza de bronces San Martín, rosa vientos y cañones", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 6, contrato_id: "CT002", tarea: "Lavado del camino de cemento con hidrolavadora", periodicidad: "MENSUAL", estado: "Abierta" },
      { id: 7, contrato_id: "CT003", tarea: "Limpieza de entradas, antejardín, fachada y vereda", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 8, contrato_id: "CT003", tarea: "Limpieza de vehículo fiscal (interior aspirado y exterior)", periodicidad: "QUINCENAL", estado: "Abierta" },
      { id: 9, contrato_id: "CT004", tarea: "Limpieza general de muebles con desinfectante", periodicidad: "DIARIA", estado: "En Proceso" },
      { id: 10, contrato_id: "CT004", tarea: "Mantención de jardines (corte de pasto y retiro de hojas)", periodicidad: "QUINCENAL", estado: "Abierta" },
      { id: 11, contrato_id: "CT005", tarea: "Limpieza de recepción, hall y entradas", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 12, contrato_id: "CT005", tarea: "Lavado profundo de pisos con máquina o abrillantado", periodicidad: "MENSUAL", estado: "Abierta" },
      { id: 13, contrato_id: "CT006", tarea: "Limpieza de recepción, sala de espera y pasillos", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 14, contrato_id: "CT007", tarea: "Casino Oficiales y Suboficiales: barrido, trapeado y pisos", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 15, contrato_id: "CT007", tarea: "Lavado de loza del rancho (100 elementos por día)", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 16, contrato_id: "CT008", tarea: "Aseo profundo de baños (desinfección de artefactos)", periodicidad: "DIARIA", estado: "Abierta" },
      { id: 17, contrato_id: "CT008", tarea: "Lavado de alfombra (aseo mensual profundo)", periodicidad: "MENSUAL", estado: "Abierta" }
    ]);
    
    setLoading(false);
  }, []);

  const cambiarEstadoTarea = (id) => {
    setTareas(tareas.map(t => {
      if (t.id === id) {
        const sgte = t.estado === "Abierta" ? "En Proceso" : t.estado === "En Proceso" ? "Cerrada" : "Abierta";
        return { ...t, estado: sgte };
      }
      return t;
    }));
  };

  const contratosFiltrados = filtro === "TODOS" 
    ? contratos 
    : contratos.filter(c => c.id === filtro);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', fontSize: '18px', color: '#64748B' }}>Cargando Panel Operacional...</div>;
  }

  return (
    <div className="app-container">
      <style>{estilos}</style>
      
      <header className="header-erp">
        <div>
          <h1 className="titulo-principal">Limpiapp Pro V3</h1>
          <p className="sub-supervisor">Control Operacional ERP · Supervisor: Luis Guzman L.</p>
        </div>
        
        <div>
          <select 
            className="selector-faena"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          >
            <option value="TODOS">— Todas las Empresas (8) —</option>
            {contratos.map(c => (
              <option key={c.id} value={c.id}>{c.cliente}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="grid-contratos">
        {contratosFiltrados.map(c => {
          const tareasDeEsteContrato = tareas.filter(t => t.contrato_id === c.id);
          return (
            <div key={c.id} className="card-contrato">
              <div className="card-header">
                <div>
                  <h3 className="cliente-nombre">{c.cliente}</h3>
                  <p className="instalacion-nombre">{c.instalacion}</p>
                </div>
                <span className={`badge-estado ${c.estado === 'Vigente' ? 'badge-vigente' : 'badge-proceso'}`}>
                  {c.estado}
                </span>
              </div>

              <div className="lista-checklist">
                {tareasDeEsteContrato.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: '13px', margin: 0 }}>No hay pautas de trabajo asignadas.</p>
                ) : (
                  tareasDeEsteContrato.map(t => (
                    <div key={t.id} className="item-tarea">
                      <p className="texto-tarea">{t.tarea}</p>
                      <div className="meta-tarea">
                        <span>{t.periodicidad}</span>
                        <button 
                          className={`btn-estado ${t.estado === 'Abierta' ? 'btn-abierta' : t.estado === 'En Proceso' ? 'btn-proceso' : 'btn-cerrada'}`}
                          onClick={() => cambiarEstadoTarea(t.id)}
                        >
                          {t.estado}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
