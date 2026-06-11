// motorImpacto.js — Motor de Impacto Laboral (servicio puro)
// Ubicacion sugerida en el repo: src/utils/motorImpacto.js
//
// Principio: el anexo NO nace porque termina una asignacion, nace porque cambian
// las CONDICIONES LABORALES del trabajador. Este modulo recibe una condicion
// "antes" y una "despues" (agregadas de las asignaciones activas) y decide si
// corresponde anexo, de que tipo, y resume el impacto.
//
// Es un servicio PURO: sin React, sin Supabase, sin UI. No inserta datos, no
// genera documentos, no abre modales, no imprime. Solo calcula y recomienda.
// Los modulos que lo llamen (retiro, movilidad, nueva asignacion, renovaciones)
// son responsables de ejecutar, persistir, disparar el anexo y mostrar la UI.

const round = (n) => Math.round(Number(n) || 0);
const sum = (arr, f) => (arr || []).reduce((a, x) => a + (Number(f(x)) || 0), 0);
const uniqSorted = (arr) => [...new Set((arr || []).filter(Boolean).map(String))].sort();
const esRemuneracional = (a) => a && a.afecta_remuneracion !== false;
const setIgual = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── Construye la condicion laboral AGREGADA desde las asignaciones activas ──
// asignaciones: filas de asignacion del trabajador (se filtran a activas aqui).
// contratos: opcional, para derivar el "lugar" desde el centro (instalacion/direccion/cliente).
export function construirCondicionLaboral(asignaciones = [], contratos = []) {
  const activas = (asignaciones || []).filter((a) => a && a.estado_asig === 'activa' && a.activo !== false);
  const rem = activas.filter(esRemuneracional);
  const cById = Object.fromEntries((contratos || []).map((c) => [c.id, c]));
  const lugarDe = (a) => {
    const c = cById[a.contrato_id];
    return (c && (c.instalacion || c.direccion || c.cliente)) || a.contrato_id;
  };
  return {
    remuneracion: round(sum(rem, (a) =>
      (Number(a.sueldo_asignado) || 0) + (Number(a.bono_asistencia) || 0) +
      (Number(a.bono_movilizacion) || 0) + (Number(a.bono_colacion) || 0) +
      (Number(a.gratificacion_monto) || 0))),
    costoImputado: round(sum(rem, (a) => Number(a.sueldo_asignado) || 0)),
    pctFinanciado: round(sum(rem, (a) => Number(a.porcentaje_costo) || 0)),
    horasSemanales: round(sum(rem, (a) => Number(a.horas_semanales) || 0)),
    jornada: uniqSorted(activas.map((a) => a.jornada)).join(' / '),
    horario: uniqSorted(activas.map((a) => a.horario)).join(' / '),
    funciones: uniqSorted(activas.map((a) => a.descripcion)),
    lugares: uniqSorted(activas.map(lugarDe)),
    centros: uniqSorted(activas.map((a) => a.contrato_id)),
    _nAsignaciones: activas.length,
    _nRemuneracionales: rem.length,
  };
}

// ── Compara condicion ANTES vs DESPUES y decide impacto + anexo ──
export function calcularImpactoLaboral(antes = {}, despues = {}) {
  const num = (v) => Number(v) || 0;
  const cambioNum = (k) => {
    const a = num(antes[k]), d = num(despues[k]);
    return { cambio: a !== d, antes: a, despues: d, delta: round(d - a) };
  };
  const cambioStr = (k) => {
    const a = antes[k] || '', d = despues[k] || '';
    return { cambio: String(a) !== String(d), antes: a, despues: d };
  };
  const cambioArr = (k) => {
    const a = antes[k] || [], d = despues[k] || [];
    return { cambio: !setIgual(a, d), antes: a, despues: d };
  };

  const remuneracion = cambioNum('remuneracion');
  const jornada = cambioNum('horasSemanales');
  const horario = cambioStr('horario');
  const funciones = cambioArr('funciones');
  const centros = cambioArr('centros');

  // 'lugar' NO es deterministico: el cambio de centro es solo un INDICADOR a confirmar.
  const lugar = { posible: centros.cambio, confirmar: centros.cambio, antes: antes.lugares || [], despues: despues.lugares || [] };

  const cambiosContractuales = { remuneracion, jornada, horario, lugar, funciones };
  const deltasOperacionales = {
    centros,
    pctFinanciado: cambioNum('pctFinanciado'),
    costoImputado: cambioNum('costoImputado'),
  };

  // requiereAnexo: SOLO por cambios contractuales deterministicos.
  // El centro de costo / financiamiento NUNCA disparan anexo por si solos.
  const requiereAnexo = !!(remuneracion.cambio || jornada.cambio || horario.cambio || funciones.cambio);

  // tipoAnexoSugerido: mapea a los tipos existentes de TabAnexos.
  const flags = [];
  if (remuneracion.cambio) flags.push('remuneracion');
  if (jornada.cambio || horario.cambio) flags.push('jornada');
  if (funciones.cambio) flags.push('funciones');
  let tipoAnexoSugerido = null;
  if (flags.length > 1) tipoAnexoSugerido = 'cambio_multiple';
  else if (flags[0] === 'remuneracion') tipoAnexoSugerido = 'reduccion_remuneracion';
  else if (flags[0] === 'jornada') tipoAnexoSugerido = 'reduccion_jornada';
  else if (flags[0] === 'funciones') tipoAnexoSugerido = 'cambio_multiple'; // sin tipo dedicado para funciones
  else if (lugar.posible) tipoAnexoSugerido = 'cambio_centro'; // solo cambio de centro/lugar a confirmar

  // Deteccion en linea: trabajador queda sin financiamiento remuneracional.
  const sinFinanciamiento = num(despues.costoImputado) <= 0 || num(despues.pctFinanciado) <= 0;

  // Resumen legible para la UI.
  const partes = [];
  if (remuneracion.cambio) partes.push(`remuneración ${remuneracion.delta >= 0 ? '+' : ''}${remuneracion.delta} (${remuneracion.antes} → ${remuneracion.despues})`);
  if (jornada.cambio) partes.push(`jornada ${jornada.delta >= 0 ? '+' : ''}${jornada.delta} h/sem (${jornada.antes} → ${jornada.despues})`);
  if (horario.cambio) partes.push('cambio de horario');
  if (funciones.cambio) partes.push('cambio de funciones');
  if (lugar.posible) partes.push('posible cambio de lugar (confirmar)');
  if (deltasOperacionales.pctFinanciado.cambio) partes.push(`financiamiento ${deltasOperacionales.pctFinanciado.delta >= 0 ? '+' : ''}${deltasOperacionales.pctFinanciado.delta}%`);
  if (sinFinanciamiento) partes.push('⚠ queda sin financiamiento remuneracional');
  const resumen = partes.length ? partes.join(' · ') : 'Sin cambios en las condiciones laborales.';

  return {
    cambiosContractuales,
    deltasOperacionales,
    requiereAnexo,
    posibleCambioLugar: lugar.posible, // indicador a confirmar; no dispara anexo por si solo
    sinFinanciamiento,
    tipoAnexoSugerido,
    resumen,
  };
}
