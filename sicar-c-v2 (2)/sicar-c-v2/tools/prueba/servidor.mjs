// Servidor local de prueba: ejecuta el Worker REAL (src/index.js) con un D1 simulado sobre node:sqlite y sirve public/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import worker from '../../src/index.js';
const raiz = path.resolve(import.meta.dirname, '../..');
const db = new DatabaseSync(process.env.DB_ARCHIVO || ':memory:');
for (const f of fs.readdirSync(path.join(raiz, 'migrations')).sort()) db.exec(fs.readFileSync(path.join(raiz, 'migrations', f), 'utf8'));
let caer = false;
const D1 = { prepare(sql) { let p = []; const o = { bind(...a) { p = a; return o; },
  _ejecutar() { if (caer) throw new Error('db caida'); const r = db.prepare(sql).run(...p); return { success: true, meta: { changes: Number(r.changes) } }; },
  async first() { if (caer) throw new Error('db caida'); return db.prepare(sql).get(...p) ?? null; },
  async all() { if (caer) throw new Error('db caida'); return { results: db.prepare(sql).all(...p) }; },
  async run() { return o._ejecutar(); } }; return o; },
  async batch(stmts) { if (caer) throw new Error('db caida'); db.exec('BEGIN'); try { const r = stmts.map((s) => s._ejecutar()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const ASSETS = { async fetch(req) {
  let p = new URL(req.url).pathname; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(raiz, 'public', p);
  if (!f.startsWith(path.join(raiz, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('No encontrado', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'content-type': tipos[path.extname(f)] || 'application/octet-stream' } });
} };
// Cloudflare Access simulado: clave RSA de prueba, JWKS interceptado y emisión de tokens (sólo para pruebas locales)
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
globalThis.fetch = (u, ...a) => String(u).includes('/cdn-cgi/access/certs') ? Promise.resolve(Response.json({ keys: [jwk] })) : realFetch(u, ...a);
const TEAM = 'ofca-prueba.cloudflareaccess.com', AUD = 'aud-de-prueba';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function emitir({ email = 'revisora@ofca.test', aud = AUD, exp = Math.floor(Date.now() / 1000) + 600, firmar = true } = {}) {
  const cab = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), cuerpo = b64({ email, aud: [aud], iss: `https://${TEAM}`, exp });
  const firma = firmar ? crypto.sign('RSA-SHA256', Buffer.from(cab + '.' + cuerpo), privateKey).toString('base64url') : 'AAAA';
  return `${cab}.${cuerpo}.${firma}`;
}
const env = { DB: D1, ASSETS, SALT: 'sal-de-prueba', AUTO_PUBLICAR: '1', LIMITE_HORA: '5', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: 'revisora@ofca.test, otra@ofca.test' };
http.createServer(async (rq, rs) => {
  const url = new URL(rq.url, 'http://localhost:8788');
  if (url.pathname === '/__prueba/caer') { caer = url.searchParams.get('v') === '1'; rs.end('ok'); return; }
  if (url.pathname === '/__prueba/jwt') { const q = url.searchParams; rs.end(emitir({ email: q.get('email') || undefined, aud: q.get('aud') || undefined, exp: q.get('exp') ? Number(q.get('exp')) : undefined, firmar: q.get('firmar') !== '0' })); return; }
  if (url.pathname === '/__prueba/auditoria') { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(db.prepare('SELECT * FROM auditoria').all())); return; }
  if (url.pathname === '/__prueba/sembrar') { // SÓLO PRUEBAS LOCALES: datos sintéticos rotulados como prueba, nunca presentes en producción
    const ins = db.prepare("INSERT INTO reportes (id, token, creado_utc, estado, motivo_retencion, tipo, severidad, provincia, descripcion, perdida_economica, monto_estado) VALUES (?,?,?,?,NULL,?,?,?,?,0,'sin_perdida')");
    const filas = [];
    if (url.searchParams.get('modo') === 'volumen') { let x = 7; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647; const P = ['Salta','Jujuy','Córdoba','CABA','Buenos Aires','Santa Fe','Mendoza','Tucumán']; const C = ['Fraude en línea','Phishing','Acceso ilegítimo','Usurpación de identidad','Otros'];
      for (let i = 0; i < Number(url.searchParams.get('n') || 3000); i++) filas.push([new Date(Date.UTC(2025, 0, 1) + rnd() * 6.5e10).toISOString(), 'publicada', C[Math.floor(rnd() * C.length)], rnd() < .3 ? 'Alta' : 'Baja', P[Math.floor(rnd() * P.length)]]); }
    else { const D = [['2026-01-10','Salta','Phishing','Baja'],['2026-01-12','Salta','Fraude en línea','Alta'],['2026-01-20','Córdoba','Phishing','Baja'],['2026-02-05','Salta','Phishing','Baja'],
      ['2026-04-02','Jujuy','Fraude en línea','Alta'],['2026-04-09','Jujuy','Phishing','Baja'],['2026-04-15','Jujuy','Phishing','Baja'],['2026-04-28','Salta','Fraude en línea','Baja'],['2026-05-06','Córdoba','Phishing','Baja'],['2026-05-21','Córdoba','Fraude en línea','Baja'],
      ['2026-06-01','Salta','Phishing','Baja'],['2026-06-05','Salta','Phishing','Baja'],['2026-06-10','Salta','Fraude en línea','Alta'],['2026-06-15','Salta','Phishing','Baja'],['2026-06-20','Jujuy','Phishing','Baja']];
      for (const [d, p, c, sv] of D) filas.push([d + 'T15:00:00.000Z', 'publicada', c, sv, p]); filas.push(['2026-03-10T15:00:00.000Z', 'pendiente_revision', 'Acoso', 'Alta', 'Salta'], ['2026-03-11T15:00:00.000Z', 'rechazada', 'Phishing', 'Baja', 'Salta']); }
    db.exec('BEGIN'); for (const f of filas) ins.run(crypto.randomUUID(), crypto.randomUUID(), f[0], f[1], f[2], f[3], f[4], 'DATO DE PRUEBA (sintético, sólo local)'); db.exec('COMMIT'); rs.end(String(filas.length)); return; }
  if (url.pathname === '/__prueba/vaciar') { db.exec('DELETE FROM reportes; DELETE FROM limite; DELETE FROM auditoria;'); rs.end('ok'); return; }
  if (url.pathname === '/__prueba/db') { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(db.prepare('SELECT id,creado_utc,estado,motivo_retencion,tipo,subcategoria,severidad,provincia,localidad,medio,perdida_economica,monto_declarado,monto_estado,monto_valor,moneda,revisado_por,descripcion FROM reportes').all())); return; }
  const chunks = []; for await (const c of rq) chunks.push(c);
  const headers = new Headers(); for (const [k, v] of Object.entries(rq.headers)) headers.set(k, String(v));
  headers.set('cf-connecting-ip', rq.headers['x-ip-prueba'] || '203.0.113.7');
  const r = await worker.fetch(new Request(url, { method: rq.method, headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks) }), env);
  rs.writeHead(r.status, Object.fromEntries(r.headers)); rs.end(Buffer.from(await r.arrayBuffer()));
}).listen(8788, () => console.log('listo'));
