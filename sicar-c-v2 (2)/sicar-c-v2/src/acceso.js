// Autenticación del portal interno: valida el JWT de Cloudflare Access (firma RS256, emisor, audiencia, vigencia)
// y autoriza sólo a los correos de ADMIN_EMAILS. Si falta configuración, cierra el acceso (no hay "modo abierto").
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));
let cache = { team: '', t: 0, keys: null };
async function claves(team) {
  if (cache.team === team && cache.keys && Date.now() - cache.t < 600_000) return cache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs');
  cache = { team, t: Date.now(), keys: (await r.json()).keys || [] };
  return cache.keys;
}
export function configurado(env) { return !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.ADMIN_EMAILS); }
// -> { ok:true, email } | { ok:false, status, error }
export async function autenticar(req, env) {
  if (!configurado(env)) return { ok: false, status: 503, error: 'El portal interno todavía no está configurado.' };
  const jwt = req.headers.get('cf-access-jwt-assertion');
  if (!jwt) return { ok: false, status: 401, error: 'Acceso no autorizado.' };
  try {
    const [h, p, s] = jwt.split('.'); const cab = json(h), cuerpo = json(p);
    if (cab.alg !== 'RS256') throw 0;
    const jwk = (await claves(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === cab.kid); if (!jwk) throw 0;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p)))) throw 0;
    const ahora = Date.now() / 1000, aud = [].concat(cuerpo.aud || []);
    if (cuerpo.exp < ahora || (cuerpo.nbf && cuerpo.nbf > ahora + 30) || cuerpo.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || !aud.includes(env.ACCESS_AUD)) throw 0;
    const email = String(cuerpo.email || '').toLowerCase();
    const permitidos = env.ADMIN_EMAILS.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!email || !permitidos.includes(email)) return { ok: false, status: 403, error: 'Tu cuenta no tiene permisos para el portal interno.' };
    return { ok: true, email };
  } catch { return { ok: false, status: 401, error: 'Acceso no autorizado.' }; }
}
