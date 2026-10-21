import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { autenticar } from '../src/acceso.js';
import { parsearMonto, validar } from '../src/validar.js';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
globalThis.fetch = async () => Response.json({ keys: [jwk] });
const env = { ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com', ACCESS_AUD: 'aud1', ADMIN_EMAILS: 'ok@ofca.test' };
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (c = {}, o = {}) => { const h = b({ alg: o.alg || 'RS256', kid: 'k1' }), p = b({ email: 'ok@ofca.test', aud: ['aud1'], iss: 'https://t.cloudflareaccess.com', exp: Date.now() / 1000 + 300, ...c });
  return `${h}.${p}.${o.firma ?? crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), privateKey).toString('base64url')}`; };
const req = (t) => new Request('https://x/interno', { headers: t ? { 'cf-access-jwt-assertion': t } : {} });
test('acepta token válido de un correo autorizado', async () => assert.deepEqual(await autenticar(req(token()), env), { ok: true, email: 'ok@ofca.test' }));
test('sin token: 401', async () => assert.equal((await autenticar(req(), env)).status, 401));
test('correo no autorizado: 403', async () => assert.equal((await autenticar(req(token({ email: 'otro@x.com' })), env)).status, 403));
test('firma inválida, vencido, audiencia o emisor erróneos: 401', async () => {
  for (const t of [token({}, { firma: 'AAAA' }), token({ exp: 1 }), token({ aud: ['otra'] }), token({ iss: 'https://evil.com' }), token({}, { alg: 'none' })])
    assert.equal((await autenticar(req(t), env)).status, 401);
});
test('sin configuración el portal permanece cerrado (503)', async () => assert.equal((await autenticar(req(token()), {})).status, 503));
test('montos es-AR', () => { assert.equal(parsearMonto('1.500.000'), 1500000); assert.equal(parsearMonto('$ 1.500,50'), 1500.5); assert.equal(parsearMonto('50000'), 50000); assert.equal(parsearMonto('USD 200'), 200); assert.equal(parsearMonto('abc'), null); assert.equal(parsearMonto('0'), null); assert.equal(parsearMonto('-5'), null); });
const base = { category: 'Phishing', subcategory: '', province: 'Salta', severity: 'Baja', description: 'Texto suficientemente largo para validar.', locality: '', medium: '', token: crypto.randomUUID() };
test('pérdida: combinaciones válidas e inválidas', () => {
  assert.equal(validar({ ...base, hasLoss: 'no' }).datos.monto_estado, 'sin_perdida');
  const a = validar({ ...base, hasLoss: 'si', lossAmount: '1.500,50', currency: 'USD' }).datos; assert.deepEqual([a.monto_estado, a.monto_valor, a.moneda], ['declarado', 1500.5, 'USD']);
  assert.equal(validar({ ...base, hasLoss: 'si', amountUnknown: true, lossAmount: '999' }).datos.monto_estado, 'no_declarado');
  assert.equal(validar({ ...base, hasLoss: 'si', lossAmount: '' }).datos.monto_valor, null);
  assert.ok(validar({ ...base, hasLoss: 'si', lossAmount: 'mucho' }).errores.lossAmount);
  assert.ok(validar({ ...base, hasLoss: 'si', lossAmount: '10', currency: 'EUR' }).errores.currency);
  assert.ok(validar({ ...base, hasLoss: '' }).errores.hasLoss);
  assert.equal(validar({ ...base, hasLoss: 'no', lossAmount: '500' }).datos.monto_valor, null);
});
