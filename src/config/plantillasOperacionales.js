// ============================================================
// LimpiApp Pro — Motor de Actividades Operacionales
// PLANTILLAS OPERACIONALES (configuración declarativa)
//
// Cada plantilla define el COMPORTAMIENTO del motor. El motor
// nunca cambia: solo cambian las plantillas. Para agregar un
// modelo operacional nuevo (repaso, supervisión, auditoría,
// inspección, inventario, mantención...) basta agregar un objeto.
//
// DATOS PUROS (sin funciones) -> mañana pueden venir de la BD.
// El motor pertenece al ERP; el QR es solo un canal de origen.
//
// REGLA DE HONESTIDAD: declarar un flag NO es implementarlo.
// Los flags cuyo comportamiento aún no existe en el motor van en
// `false` y marcados "(no implementado)". Son espacio reservado,
// no capacidades reales.
//
// NO se construye motor de workflows ni herencia de plantillas:
// el flujo se deriva de `requiere{}` (hoy lineal). Cuando aparezca
// una secuencia de pasos realmente distinta, se evaluará `pasos[]`.
// ============================================================

export const PLANTILLAS_OPERACIONALES = [
  {
    id: 'programada',
    version: '1.0',
    nombre: 'Programada',
    descripcion: 'Tareas programadas del contrato (checklist)',
    categoria: 'operacional',
    flujo: 'operacional',        // etiqueta de datos, NO interpretada por el motor
    expediente: 'operacional',
    prioridad_default: 'normal',
    permite_elegir_prioridad: false,
    requiere: {
      titulo: false, descripcion: false, checklist: true,
      fotosAntes: true, fotosDespues: true,
      gpsInicio: true, gpsFin: true, observacion: true, tiempo: true,
      firma: false,       // (no implementado)
      aprobacion: false,  // (no implementado)
    },
    permisos: { trabajador: true, supervisor: true, cliente: false, administrador: true },
    origenes: ['qr', 'portal_trabajador', 'portal_supervisor', 'administracion'],
    // capacidades futuras (no cableadas):
    permitePDF: false, permiteCorreo: false, permiteIA: false, permiteReapertura: false,
  },
  {
    id: 'extraordinaria',
    version: '1.0',
    nombre: 'Extraordinaria',
    descripcion: 'Trabajo fuera del checklist habitual',
    categoria: 'operacional',
    flujo: 'operacional',
    expediente: 'operacional',
    prioridad_default: 'normal',
    permite_elegir_prioridad: true,
    requiere: {
      titulo: true, descripcion: true, checklist: false,
      fotosAntes: true, fotosDespues: true,
      gpsInicio: true, gpsFin: true, observacion: true, tiempo: true,
      firma: false,       // (no implementado)
      aprobacion: false,  // (no implementado)
    },
    permisos: { trabajador: true, supervisor: true, cliente: false, administrador: true },
    origenes: ['qr', 'portal_trabajador', 'portal_supervisor', 'correo_ia', 'api', 'administracion'],
    permitePDF: false, permiteCorreo: false, permiteIA: false, permiteReapertura: false,
  },
  {
    id: 'emergencia',
    version: '1.0',
    nombre: 'Emergencia',
    descripcion: 'Evento urgente · registro rápido',
    categoria: 'operacional',
    flujo: 'operacional',
    expediente: 'operacional',
    prioridad_default: 'critica',
    permite_elegir_prioridad: false,
    requiere: {
      titulo: false, descripcion: false, checklist: false,
      fotosAntes: true, fotosDespues: true,
      gpsInicio: true, gpsFin: true, observacion: true, tiempo: true,
      firma: false,       // (no implementado)
      aprobacion: false,  // (no implementado)
    },
    permisos: { trabajador: true, supervisor: true, cliente: true, administrador: true },
    origenes: ['qr', 'portal_trabajador', 'portal_supervisor', 'portal_cliente', 'api'],
    permitePDF: false, permiteCorreo: false, permiteIA: false, permiteReapertura: false,
  },

  // ── FUTURAS (no se construyen aún). Al agregar su objeto aquí aparecen
  //    solas en el selector, sin tocar el motor. Tipos con secuencia de
  //    pasos realmente distinta (supervision/auditoria/inventario) podrán
  //    necesitar, recién entonces, un `pasos[]` y/o `datos_operacionales`.
  // { id:'repaso', version:'1.0', nombre:'Repaso', ..., soloSiPendiente:true },
  // { id:'supervision', ..., permisos:{ trabajador:false, supervisor:true, ... } },
  // { id:'auditoria', ... }, { id:'inspeccion', ... }, { id:'inventario', ... },
];

// ── Disponibilidad (lógica del motor, NO de los datos) ──
// El motor pide la lista YA filtrada por canal, permiso del solicitante
// y, para plantillas soloSiPendiente, que el contexto traiga un pendiente.
export function plantillasDisponibles(ctx = {}) {
  const canal = ctx.canal_origen;
  const solicitante = ctx.solicitante;
  return PLANTILLAS_OPERACIONALES.filter((p) => {
    if (p.soloSiPendiente && !ctx.repasoPendiente) return false;
    if (canal && Array.isArray(p.origenes) && p.origenes.length && !p.origenes.includes(canal)) return false;
    if (solicitante && p.permisos && p.permisos[solicitante] === false) return false;
    return true;
  });
}

export function getPlantilla(id) {
  return PLANTILLAS_OPERACIONALES.find((p) => p.id === id) || null;
}
