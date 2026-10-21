import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/nucleo.js';
const N = globalThis.SICAR_NUCLEO;
const ts = (s) => Date.parse(s);
const R = (created_at, province = 'Salta', category = 'Phishing', severity = 'Baja') => ({ created_at, province, category, severity });
test('granularidades sólo si los datos las respaldan', () => {
  assert.deepEqual(N.granularidades(ts('2026-10-01T12:00Z'), ts('2026-10-01T15:00Z')), []);                       // un solo día: no hay serie
  assert.deepEqual(N.granularidades(ts('2026-10-01T12:00Z'), ts('2026-10-05T12:00Z')), ['dia']);
  const g = N.granularidades(ts('2026-01-10T12:00Z'), ts('2026-10-05T12:00Z')); assert.ok(g.includes('semana') && g.includes('mes') && g.includes('trimestre') && !g.includes('anio'));
});
test('períodos continuos con huecos vacíos y zona horaria argentina', () => {
  const ps = N.periodos(ts('2026-01-31T12:00Z'), ts('2026-04-02T12:00Z'), 'mes'); assert.deepEqual(ps.map((p) => p.etiqueta), ['ene 2026', 'feb 2026', 'mar 2026', 'abr 2026']);
  // 01/03 01:00 UTC = 28/02 22:00 en Argentina -> pertenece a febrero
  const regs = [R('2026-03-01T01:00:00Z'), R('2026-03-01T04:00:00Z')]; assert.deepEqual(N.serie(regs, ps), [0, 1, 1, 0]);
});
test('puntual vs acumulado', () => {
  const regs = [R('2026-01-15T12:00Z'), R('2026-02-15T12:00Z'), R('2026-02-16T12:00Z'), R('2026-04-10T12:00Z')];
  const ps = N.periodos(ts('2026-01-15T12:00Z'), ts('2026-04-10T12:00Z'), 'mes');
  const cnt = (i, m) => N.filtrar(regs, { ventana: N.ventana(ps, i, m) }).length;
  assert.deepEqual([0, 1, 2, 3].map((i) => cnt(i, 'puntual')), [1, 2, 0, 1]);
  assert.deepEqual([0, 1, 2, 3].map((i) => cnt(i, 'acumulado')), [1, 3, 3, 4]);
});
test('variación: sin porcentaje cuando el denominador es 0', () => {
  assert.deepEqual(N.variacion(5, 0), { abs: 5, pct: null }); assert.deepEqual(N.variacion(3, 4), { abs: -1, pct: -25 }); assert.deepEqual(N.variacion(0, 0), { abs: 0, pct: null });
});
test('período anterior comparable y clases', () => { assert.deepEqual(N.anterior([100, 160]), [40, 100]); assert.equal(N.clase(0, 10), -1); assert.equal(N.clase(1, 10), 0); assert.equal(N.clase(10, 10), 3); });
test('filtros combinados', () => {
  const regs = [R('2026-01-01T12:00Z', 'Salta', 'Phishing'), R('2026-01-01T12:00Z', 'Jujuy', 'Phishing'), R('2026-01-01T12:00Z', 'Salta', 'Acoso', 'Alta')];
  assert.equal(N.filtrar(regs, { provincia: 'Salta', categoria: 'Phishing' }).length, 1); assert.equal(N.filtrar(regs, { severidad: 'Alta' }).length, 1);
});
