import { TAX } from './taxonomia.js';
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const ESTADOS = ['pendiente_revision', 'publicada', 'rechazada'];
const DECISIONES = { aprobar: 'publicada', rechazar: 'rechazada', mantener_pendiente: 'pendiente_revision' };
const agrupar = async (db, col, where = '') => (await db.prepare(`SELECT ${col} k, COUNT(*) n FROM reportes ${where} GROUP BY ${col} ORDER BY n DESC`).all()).results;

export async function panel(env) {
  const db = env.DB;
  const [estados, evolucion, categoria, severidad, provincia, perdida, montos, sinMonto] = await Promise.all([
    agrupar(db, 'estado'),
    db.prepare("SELECT substr(creado_utc,1,10) k, COUNT(*) n FROM reportes GROUP BY k ORDER BY k DESC LIMIT 30").all().then((r) => r.results.reverse()),
    agrupar(db, 'tipo'), agrupar(db, 'severidad'), agrupar(db, 'provincia'),
    agrupar(db, 'perdida_economica'),
    db.prepare("SELECT moneda, COUNT(*) n, ROUND(SUM(monto_valor),2) suma, MIN(monto_valor) minimo, MAX(monto_valor) maximo FROM reportes WHERE monto_estado='declarado' GROUP BY moneda").all().then((r) => r.results),
    db.prepare("SELECT COUNT(*) n FROM reportes WHERE perdida_economica=1 AND monto_estado!='declarado'").first(),
  ]);
  const por = Object.fromEntries(estados.map((x) => [x.k, x.n]));
  const conPerdida = perdida.find((x) => x.k === 1)?.n || 0, sinPerdida = perdida.find((x) => x.k === 0)?.n || 0;
  return J({ recibidos: estados.reduce((s, x) => s + x.n, 0), pendientes: por.pendiente_revision || 0, publicados: por.publicada || 0, rechazados: por.rechazada || 0,
    evolucion, categoria, severidad, provincia,
    perdida: { con_perdida: conPerdida, sin_perdida: sinPerdida, sin_monto_declarado: sinMonto.n, montos_declarados_por_moneda: montos,
      aviso: 'Importes declarados por las personas que reportan: no están verificados ni representan dinero recuperado. Las monedas no se suman entre sí.' } });
}

export async function listar(env, url) {
  const q = url.searchParams, cond = [], par = [];
  const f = (col, val, validos) => { if (val && (!validos || validos.includes(val))) { cond.push(`${col}=?`); par.push(val); } };
  f('estado', q.get('estado'), ESTADOS); f('provincia', q.get('provincia'), TAX.provincias); f('tipo', q.get('categoria'), TAX.categorias); f('severidad', q.get('severidad'), TAX.severidades);
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  if (dia.test(q.get('desde') || '')) { cond.push('creado_utc>=?'); par.push(q.get('desde')); }
  if (dia.test(q.get('hasta') || '')) { cond.push('creado_utc<?'); par.push(q.get('hasta') + 'T23:59:59.999Z'); }
  const w = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const pagina = Math.max(1, parseInt(q.get('pagina') || '1', 10) || 1), por = 25;
  const total = (await env.DB.prepare(`SELECT COUNT(*) n FROM reportes ${w}`).bind(...par).first()).n;
  const { results } = await env.DB.prepare(`SELECT id, creado_utc, estado, motivo_retencion, tipo, subcategoria, severidad, provincia, localidad, perdida_economica, monto_estado, monto_valor, moneda, substr(descripcion,1,140) resumen
    FROM reportes ${w} ORDER BY (estado='pendiente_revision') DESC, creado_utc DESC LIMIT ? OFFSET ?`).bind(...par, por, (pagina - 1) * por).all();
  return J({ total, pagina, por_pagina: por, reportes: results });
}

export async function detalle(env, id) {
  const r = await env.DB.prepare('SELECT id, creado_utc, estado, motivo_retencion, tipo, subcategoria, severidad, provincia, localidad, medio, perdida_economica, monto_estado, monto_valor, moneda, descripcion, evidencia_clave IS NOT NULL AS tiene_evidencia, revisado_por, revisado_utc, observaciones FROM reportes WHERE id=?').bind(id).first();
  if (!r) return J({ error: 'Reporte no encontrado.' }, 404);
  const { results } = await env.DB.prepare('SELECT creado_utc, usuario, accion, estado_anterior, estado_nuevo, observacion FROM auditoria WHERE reporte_id=? ORDER BY id DESC LIMIT 50').bind(id).all();
  return J({ reporte: r, auditoria: results });
}

// Decisión sobre un reporte. `estado_esperado` evita acciones duplicadas o sobre datos desactualizados (409).
export async function decidir(req, env, id, usuario) {
  let c; try { c = await req.json(); } catch { return J({ error: 'Solicitud no válida.' }, 400); }
  const nuevo = DECISIONES[c?.decision];
  if (!nuevo) return J({ error: 'Decisión no válida.' }, 422);
  if (!ESTADOS.includes(c?.estado_esperado)) return J({ error: 'Falta el estado actual del reporte.' }, 422);
  const obs = typeof c.observacion === 'string' ? c.observacion.trim().slice(0, 500) : '';
  if (nuevo === 'rechazada' && obs.length < 3) return J({ error: 'Indicá el motivo del rechazo en las observaciones.' }, 422);
  const ahora = new Date().toISOString();
  const [u] = await env.DB.batch([
    env.DB.prepare('UPDATE reportes SET estado=?1, revisado_por=?2, revisado_utc=?3, observaciones=?4 WHERE id=?5 AND estado=?6').bind(nuevo, usuario, ahora, obs || null, id, c.estado_esperado),
    env.DB.prepare('INSERT INTO auditoria (creado_utc, usuario, accion, reporte_id, estado_anterior, estado_nuevo, observacion) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE changes() > 0').bind(ahora, usuario, c.decision, id, c.estado_esperado, nuevo, obs || null),
  ]);
  if (u.meta.changes !== 1) {
    const ex = await env.DB.prepare('SELECT estado FROM reportes WHERE id=?').bind(id).first();
    return J(ex ? { error: 'El reporte ya cambió de estado. Recargá la lista.', estado_actual: ex.estado } : { error: 'Reporte no encontrado.' }, ex ? 409 : 404);
  }
  return J({ ok: true, estado: nuevo });
}
