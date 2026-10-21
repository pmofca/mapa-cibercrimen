// Núcleo de cálculo de SICAR-C (sin DOM): ventanas temporales, agregaciones y variaciones.
// Zona horaria de referencia: Argentina (UTC-3, sin horario de verano vigente). Las fechas de los reportes ciudadanos son fechas de CARGA.
(function (raiz, fab) { if (typeof module === 'object' && module.exports) module.exports = fab(); else raiz.SICAR_NUCLEO = fab(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DIA = 864e5, OFFSET = -3 * 36e5;
  const ar = (ts) => new Date(ts + OFFSET);                  // reloj "de pared" argentino en campos UTC
  const aTs = (y, m, d) => Date.UTC(y, m, d) - OFFSET;       // medianoche argentina -> timestamp UTC
  const p2 = (n) => String(n).padStart(2, '0');
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // Inicio (ts) del período que contiene ts, según granularidad
  function inicio(ts, g) {
    const d = ar(ts), y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
    if (g === 'dia') return aTs(y, m, dd);
    if (g === 'semana') return aTs(y, m, dd - ((d.getUTCDay() + 6) % 7)); // lunes
    if (g === 'mes') return aTs(y, m, 1);
    if (g === 'trimestre') return aTs(y, m - (m % 3), 1);
    if (g === 'anio') return aTs(y, 0, 1);
    throw new Error('granularidad no válida');
  }
  function siguiente(ts, g) { const d = ar(ts), y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
    return g === 'dia' ? aTs(y, m, dd + 1) : g === 'semana' ? aTs(y, m, dd + 7) : g === 'mes' ? aTs(y, m + 1, 1) : g === 'trimestre' ? aTs(y, m + 3, 1) : aTs(y + 1, 0, 1); }
  function etiqueta(ts, g) { const d = ar(ts), y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
    if (g === 'dia') return `${p2(dd)}/${p2(m + 1)}/${y}`; if (g === 'semana') return `Semana del ${p2(dd)}/${p2(m + 1)}/${y}`;
    if (g === 'mes') return `${MES[m]} ${y}`; if (g === 'trimestre') return `${Math.floor(m / 3) + 1}.º trimestre ${y}`; return String(y); }

  // Granularidades que los datos pueden respaldar según la extensión temporal real (mínimo 3 períodos y no más de 400)
  function granularidades(minTs, maxTs) {
    if (!(maxTs >= minTs)) return [];
    return ['dia', 'semana', 'mes', 'trimestre', 'anio'].filter((g) => { let n = 0, t = inicio(minTs, g); while (t <= maxTs && n < 500) { t = siguiente(t, g); n++; } return n >= 3 && n <= 400; });
  }
  // Períodos continuos (incluye los vacíos) que cubren [desde, hasta]
  function periodos(desde, hasta, g) {
    const r = []; let t = inicio(desde, g);
    while (t <= hasta && r.length < 1000) { const f = siguiente(t, g); r.push({ inicio: t, fin: f, etiqueta: etiqueta(t, g) }); t = f; }
    return r;
  }
  // Ventana temporal del paso i: puntual = sólo ese período; acumulado = desde el primero hasta el final del período i
  function ventana(ps, i, modo) { return modo === 'acumulado' ? [ps[0].inicio, ps[i].fin] : [ps[i].inicio, ps[i].fin]; }
  const enVentana = (r, v) => { const t = Date.parse(r.created_at); return t >= v[0] && t < v[1]; };
  function filtrar(regs, f = {}) {
    return regs.filter((r) => (!f.categoria || r.category === f.categoria) && (!f.provincia || r.province === f.provincia) && (!f.severidad || r.severity === f.severidad) && (!f.ventana || enVentana(r, f.ventana)));
  }
  function contar(regs, clave) { const o = {}; for (const r of regs) o[r[clave]] = (o[r[clave]] || 0) + 1; return o; }
  function serie(regs, ps) { return ps.map((p) => regs.reduce((n, r) => { const t = Date.parse(r.created_at); return n + (t >= p.inicio && t < p.fin ? 1 : 0); }, 0)); }
  // Variación: null si no hay denominador (no se calcula porcentaje sobre cero)
  function variacion(actual, previo) { return { abs: actual - previo, pct: previo > 0 ? Math.round(((actual - previo) / previo) * 1000) / 10 : null }; }
  const anterior = (v) => { const d = v[1] - v[0]; return [v[0] - d, v[0]]; };
  // Clases (igual intervalo) para la capa de intensidad; devuelve índice 0..n-1 o -1 si no hay datos
  function clase(valor, max, n = 4) { return valor <= 0 || max <= 0 ? -1 : Math.min(n - 1, Math.floor(((valor - 1) / max) * n)); }
  return { inicio, siguiente, etiqueta, granularidades, periodos, ventana, filtrar, contar, serie, variacion, anterior, clase, enVentana, DIA };
});
