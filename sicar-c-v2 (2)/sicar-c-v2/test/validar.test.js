import test from 'node:test';
import assert from 'node:assert/strict';
import { validar, decidirPublicacion } from '../src/validar.js';
const ok = { category: 'Phishing', subcategory: 'Banco Nación', severity: 'Media', province: 'Córdoba', locality: '', medium: 'SMS', hasLoss: 'no', lossAmount: '', description: 'Recibí un mensaje falso que simulaba ser de un banco.', token: crypto.randomUUID() };
test('acepta un reporte anónimo válido', () => assert.equal(validar(ok).ok, true));
test('rechaza taxonomía y campos inválidos', () => {
  const r = validar({ ...ok, category: 'x', province: 'Atlantis', severity: 'Crítica', description: 'corta', token: 'x' });
  assert.deepEqual(Object.keys(r.errores).sort(), ['category', 'description', 'province', 'severity', 'subcategory', 'token']);
});
test('subcategoría debe corresponder a la categoría', () => assert.ok(validar({ ...ok, subcategory: 'Malware' }).errores.subcategory));
test('acoso queda pendiente de revisión', () => assert.equal(decidirPublicacion({ ...ok, category: 'Acoso' }, true).estado, 'pendiente_revision'));
test('datos personales o enlaces impiden la publicación automática', () => {
  for (const t of ['escribime a juan@mail.com', 'mi DNI 30123456', 'entré a https://x.com/y'])
    assert.equal(decidirPublicacion({ ...ok, description: t }, true).estado, 'pendiente_revision');
});
test('reporte limpio se publica sólo si la política está activa', () => {
  assert.equal(decidirPublicacion(ok, true).estado, 'publicada');
  assert.equal(decidirPublicacion(ok, false).estado, 'pendiente_revision');
});
