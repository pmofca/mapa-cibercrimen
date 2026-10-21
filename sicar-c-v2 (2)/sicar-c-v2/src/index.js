import { validar, decidirPublicacion } from './validar.js';
import { TAX } from './taxonomia.js';
import { autenticar } from './acceso.js';
import * as interno from './interno.js';

const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...h } });
const prefijoIp = (ip) => (ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip);
async function huella(sal, s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sal + '|' + s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function limitar(env, req) {
  if (!env.SALT) throw new Error('SALT no configurada');
  const clave = await huella(env.SALT, prefijoIp(req.headers.get('CF-Connecting-IP') || 'desconocida'));
  const ahora = Date.now(), desde = ahora - 3600_000, max = Number(env.LIMITE_HORA || 5);
  const r = await env.DB.prepare('SELECT COUNT(*) n, MIN(ts) m FROM limite WHERE clave=?1 AND ts>?2').bind(clave, desde).first();
  if (r.n >= max) return Math.max(1, Math.ceil((r.m + 3600_000 - ahora) / 1000));
  await env.DB.prepare('INSERT INTO limite (clave, ts) VALUES (?1, ?2)').bind(clave, ahora).run();
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM limite WHERE ts<?1').bind(ahora - 7200_000).run();
  return 0;
}
const horaRedondeada = (iso) => iso.slice(0, 13) + ':00:00.000Z'; // no se publica la hora exacta
function publico(r) {
  const [lat, lng] = TAX.capitales[r.provincia];
  return { id: r.id, province: r.provincia, category: r.tipo, subcategory: r.subcategoria || '', severity: r.severidad,
    description: 'Reporte ciudadano sin verificar', created_at: horaRedondeada(r.creado_utc), latitude: lat, longitude: lng, published: true };
}

async function listar(env) {
  try {
    const { results } = await env.DB.prepare("SELECT id, creado_utc, tipo, subcategoria, severidad, provincia FROM reportes WHERE estado='publicada' ORDER BY creado_utc DESC LIMIT 5000").all();
    const total = (await env.DB.prepare("SELECT COUNT(*) n FROM reportes WHERE estado='publicada'").first()).n;
    return J({ incidents: results.filter((r) => TAX.capitales[r.provincia]).map(publico), total, truncado: total > results.length, fecha_referencia: 'fecha_de_carga', fuente: 'reportes_ciudadanos_sin_verificar', ubicacion: 'capital_provincial_aproximada' }, 200, { 'cache-control': 'public, max-age=15' });
  } catch { return J({ error: 'No pudimos cargar los reportes ciudadanos en este momento.' }, 503); }
}

async function crear(req, env) {
  const origen = req.headers.get('origin');
  if (origen && origen !== new URL(req.url).origin) return J({ error: 'Origen no permitido.' }, 403);
  if (Number(req.headers.get('content-length') || 0) > 20_000) return J({ error: 'La solicitud es demasiado grande.' }, 413);
  let cuerpo;
  try { cuerpo = await req.json(); } catch { return J({ error: 'No pudimos leer el formulario.' }, 400); }
  const r = validar(cuerpo);
  if (!r.ok) return J({ error: 'Revisá los campos del formulario.', campos: r.errores }, 422);
  const d = r.datos;
  try {
    const previo = await env.DB.prepare('SELECT id, estado, creado_utc, tipo, subcategoria, severidad, provincia FROM reportes WHERE token=?1').bind(d.token).first();
    if (previo) return J({ ok: true, repetido: true, incident: previo.estado === 'publicada' ? publico(previo) : { id: previo.id, published: false } });
    const espera = await limitar(env, req);
    if (espera) return J({ error: `Alcanzaste el límite de reportes por hora. Probá de nuevo en ${Math.ceil(espera / 60)} minuto(s).` }, 429, { 'retry-after': String(espera) });
    const { estado, motivo } = decidirPublicacion(d, env.AUTO_PUBLICAR === '1');
    const id = crypto.randomUUID(), ahora = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO reportes (id, token, creado_utc, estado, motivo_retencion, tipo, subcategoria, severidad, provincia, localidad, medio, perdida_economica, monto_declarado, descripcion, moneda, monto_valor, monto_estado)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`)
      .bind(id, d.token, ahora, estado, motivo, d.category, d.subcategory || null, d.severity, d.province, d.locality || null, d.medium || null, d.perdida, d.perdida && d.lossAmount ? d.lossAmount : null, d.description, d.moneda, d.monto_valor, d.monto_estado).run();
    const fila = { id, creado_utc: ahora, tipo: d.category, subcategoria: d.subcategory, severidad: d.severity, provincia: d.province };
    return J({ ok: true, incident: estado === 'publicada' ? publico(fila) : { id, published: false } }, 201);
  } catch {
    console.error('fallo_persistencia'); // sin datos del reporte
    return J({ error: 'No pudimos guardar tu reporte, así que NO fue recibido. Intentá de nuevo en unos minutos.' }, 503);
  }
}

// Estadísticas públicas agregadas (sólo reportes publicados). Los importes se muestran únicamente si hay al menos K casos comparables.
const K_MIN = 5;
async function estadisticas(env) {
  try {
    const g = async (col) => (await env.DB.prepare(`SELECT ${col} k, COUNT(*) n FROM reportes WHERE estado='publicada' GROUP BY ${col} ORDER BY n DESC`).all()).results;
    const [categoria, provincia, severidad, perdida] = await Promise.all([g('tipo'), g('provincia'), g('severidad'), g('perdida_economica')]);
    const m = (await env.DB.prepare("SELECT moneda, COUNT(*) n, ROUND(SUM(monto_valor),2) suma FROM reportes WHERE estado='publicada' AND monto_estado='declarado' GROUP BY moneda").all()).results;
    return J({ fuente: 'reportes_ciudadanos_sin_verificar', total: categoria.reduce((s, x) => s + x.n, 0), categoria, provincia, severidad,
      con_perdida: perdida.find((x) => x.k === 1)?.n || 0, sin_perdida: perdida.find((x) => x.k === 0)?.n || 0,
      montos_declarados: m.filter((x) => x.n >= K_MIN).map((x) => ({ moneda: x.moneda, casos: x.n, suma: x.suma })),
      aviso_montos: 'Importes declarados por los usuarios, no verificados. Se muestran sólo con al menos ' + K_MIN + ' casos.' }, 200, { 'cache-control': 'public, max-age=30' });
  } catch { return J({ error: 'No pudimos cargar las estadísticas.' }, 503); }
}

const paginaNoAutorizada = (a) => new Response(`<!doctype html><meta charset="utf-8"><title>SICAR-C · Portal interno</title><body style="font-family:system-ui;background:#0b1220;color:#e6ebf5;padding:48px"><h1>Portal interno de OFCA</h1><p>${a.error}</p>`, { status: a.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

async function apiInterno(req, env, url) {
  const a = await autenticar(req, env);
  if (!a.ok) return J({ error: a.error }, a.status);
  if (req.method !== 'GET') { // defensa CSRF: mismo origen + cabecera propia
    if (req.headers.get('origin') !== url.origin || req.headers.get('x-requested-with') !== 'sicar-interno') return J({ error: 'Solicitud no permitida.' }, 403);
  }
  try {
    const p = url.pathname.replace('/api/interno', '');
    if (p === '/panel' && req.method === 'GET') return await interno.panel(env);
    if (p === '/reportes' && req.method === 'GET') return await interno.listar(env, url);
    let m;
    if ((m = p.match(/^\/reportes\/([0-9a-f-]{36})$/i)) && req.method === 'GET') return await interno.detalle(env, m[1]);
    if ((m = p.match(/^\/reportes\/([0-9a-f-]{36})\/decision$/i)) && req.method === 'POST') return await interno.decidir(req, env, m[1], a.email);
    return J({ error: 'No encontrado.' }, 404);
  } catch { console.error('fallo_interno'); return J({ error: 'No pudimos completar la operación.' }, 503); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), { pathname } = url;
    if (pathname === '/api/incidents' && req.method === 'POST') return crear(req, env);
    if (pathname === '/api/incidents' && req.method === 'GET') return listar(env);
    if (pathname === '/api/estadisticas' && req.method === 'GET') return estadisticas(env);
    if (pathname.startsWith('/api/interno/')) return apiInterno(req, env, url);
    if (pathname === '/interno' || pathname.startsWith('/interno/')) {
      const a = await autenticar(req, env);
      if (!a.ok) return paginaNoAutorizada(a);
      const r = await env.ASSETS.fetch(pathname === '/interno' ? new Request(new URL('/interno/', url), req) : req);
      const h = new Headers(r.headers); h.set('cache-control', 'no-store'); return new Response(r.body, { status: r.status, headers: h });
    }
    if (pathname === '/config.js') return new Response(`window.__SICAR=${JSON.stringify({ tax: TAX })};`, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    if (pathname.startsWith('/api/')) return J({ error: 'No encontrado.' }, 404);
    return env.ASSETS.fetch(req);
  }
};
