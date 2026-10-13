import test from 'node:test';
import assert from 'node:assert/strict';
import { validar, decidirPublicacion } from '../src/validar.js';
const ok = { tipo: 'Phishing', severidad: 'Media', provincia: 'Córdoba', localidad: '', medio: '', perdida: 'no', descripcion: 'Recibí un mensaje falso que simulaba ser de un banco.', token: crypto.randomUUID() };
test('acepta un reporte anónimo válido', () => assert.equal(validar(ok).ok, true));
test('rechaza campos obligatorios inválidos', () => {
  const r = validar({ ...ok, tipo: 'x', provincia: 'Atlantis', descripcion: 'corta', token: 'x' });
  assert.deepEqual(Object.keys(r.errores).sort(), ['descripcion', 'provincia', 'tipo', 'token']);
});
test('acoso queda pendiente de revisión', () => assert.equal(decidirPublicacion({ ...ok, tipo: 'Acoso' }, true).estado, 'pendiente_revision'));
test('datos personales o enlaces impiden la publicación automática', () => {
  for (const t of ['escribime a juan@mail.com', 'mi DNI 30123456', 'entré a https://x.com/y'])
    assert.equal(decidirPublicacion({ ...ok, descripcion: t }, true).estado, 'pendiente_revision');
});
test('reporte limpio se publica sólo si está activada la política', () => {
  assert.equal(decidirPublicacion(ok, true).estado, 'publicada');
  assert.equal(decidirPublicacion(ok, false).estado, 'pendiente_revision');
});
