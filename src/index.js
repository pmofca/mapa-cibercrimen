import { validar, decidirPublicacion } from './validar.js';
import { PROVINCIAS } from './provincias.js';

const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...h } });

function tipoImagen(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
const prefijoIp = (ip) => (ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip); // IPv6 -> aprox. /64
async function huella(sal, s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sal + '|' + s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Devuelve segundos de espera (0 = permitido). Persistido en D1, no en memoria. La IP se guarda sólo como huella con sal.
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

async function crear(req, env) {
  const origen = req.headers.get('origin');
  if (origen && origen !== new URL(req.url).origin) return J({ error: 'Origen no permitido.' }, 403);
  if (Number(req.headers.get('content-length') || 0) > 4_000_000) return J({ error: 'La solicitud es demasiado grande.' }, 413);
  let fd;
  try { fd = await req.formData(); } catch { return J({ error: 'No pudimos leer el formulario.' }, 400); }
  const r = validar(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')));
  if (!r.ok) return J({ error: 'Revisá los campos marcados.', campos: r.errores }, 422);
  const d = r.datos;
  let clave = null;
  try {
    const previo = await env.DB.prepare('SELECT id FROM reportes WHERE token=?1').bind(d.token).first();
    if (previo) return J({ ok: true, id: previo.id, repetido: true });
    const espera = await limitar(env, req);
    if (espera) return J({ error: `Alcanzaste el límite de reportes por hora. Probá de nuevo en ${Math.ceil(espera / 60)} minuto(s).` }, 429, { 'retry-after': String(espera) });
    let tipoImg = null;
    const arch = fd.get('evidencia');
    if (arch && typeof arch !== 'string' && arch.size > 0) {
      if (!env.EVIDENCIA) return J({ error: 'Revisá los campos marcados.', campos: { evidencia: 'La carga de capturas no está disponible por ahora. Enviá el reporte sin imagen.' } }, 422);
      if (arch.size > 3_000_000) return J({ error: 'Revisá los campos marcados.', campos: { evidencia: 'La imagen no puede superar los 3 MB.' } }, 422);
      const buf = await arch.arrayBuffer();
      tipoImg = tipoImagen(new Uint8Array(buf));
      if (!tipoImg) return J({ error: 'Revisá los campos marcados.', campos: { evidencia: 'Sólo se aceptan imágenes PNG, JPG o WebP.' } }, 422);
      clave = `evidencia/${crypto.randomUUID()}`;
      await env.EVIDENCIA.put(clave, buf, { httpMetadata: { contentType: tipoImg } });
    }
    const { estado, motivo } = decidirPublicacion(d, env.AUTO_PUBLICAR === '1');
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO reportes (id, token, creado_utc, estado, motivo_retencion, tipo, severidad, provincia, localidad, medio, perdida_economica, descripcion, evidencia_clave, evidencia_tipo)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
      .bind(id, d.token, new Date().toISOString(), estado, motivo, d.tipo, d.severidad, d.provincia, d.localidad || null, d.medio || null, d.perdida === 'si' ? 1 : 0, d.descripcion, clave, tipoImg).run();
    return J({ ok: true, id }, 201);
  } catch {
    if (clave) { try { await env.EVIDENCIA.delete(clave); } catch {} }
    console.error('fallo_persistencia'); // sin datos del reporte
    return J({ error: 'No pudimos guardar tu reporte, así que NO fue recibido. Intentá de nuevo en unos minutos.' }, 503);
  }
}

// Público: sólo conteos por provincia y categoría de reportes 'publicada'. Sin texto, localidad, fecha exacta ni evidencia.
async function mapa(env) {
  try {
    const { results } = await env.DB.prepare("SELECT provincia, tipo, COUNT(*) n FROM reportes WHERE estado='publicada' GROUP BY provincia, tipo").all();
    const puntos = results.filter((x) => PROVINCIAS[x.provincia]).map((x) => ({ provincia: x.provincia, tipo: x.tipo, n: x.n, lat: PROVINCIAS[x.provincia][0], lng: PROVINCIAS[x.provincia][1] }));
    return J({ fuente: 'reportes_ciudadanos_no_verificados', ubicacion: 'centro_provincial_aproximado', puntos }, 200, { 'cache-control': 'public, max-age=60' });
  } catch { return J({ error: 'No pudimos cargar los reportes ciudadanos en este momento.' }, 503); }
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/reportes' && req.method === 'POST') return crear(req, env);
    if (pathname === '/api/mapa' && req.method === 'GET') return mapa(env);
    if (pathname === '/api/config' && req.method === 'GET') {
      const k = env.CARTO_KEY ? `?key=${encodeURIComponent(env.CARTO_KEY)}` : '';
      return J({ tiles: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${k}`, provincias: Object.keys(PROVINCIAS) }, 200, { 'cache-control': 'public, max-age=300' });
    }
    if (pathname.startsWith('/api/')) return J({ error: 'No encontrado.' }, 404);
    return env.ASSETS.fetch(req);
  }
};
