// Capas, filtros globales, línea de tiempo (time-lapse) y estadísticas sincronizadas de SICAR-C.
// Fuente de los registros: reportes ciudadanos PUBLICADOS (window.__raw, vienen de /api/incidents con campos seguros).
// Ubicación: siempre aproximada (capital provincial). No hay ubicaciones precisas ni geometrías provinciales verificadas.
(function () {
  const N = window.SICAR_NUCLEO, tax = (window.__SICAR || {}).tax; if (!N || !tax) return;
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (n) => Number(n).toLocaleString('es-AR');
  const el = (t, txt, cls, at) => { const e = document.createElement(t); if (txt != null) e.textContent = txt; if (cls) e.className = cls; if (at) for (const k in at) e.setAttribute(k, at[k]); return e; };
  const COL = { 'Fraude en línea': '#ef4444', 'Usurpación de identidad': '#f59e0b', 'Acceso ilegítimo': '#3b82f6', Phishing: '#f97316', Acoso: '#8b5cf6', Otros: '#64748b' };
  const RAMPA = ['#fde68a', '#fb923c', '#ef4444', '#991b1b'];
  const GRAN = { dia: 'Día', semana: 'Semana', mes: 'Mes', trimestre: 'Trimestre', anio: 'Año' };
  const fechaHora = (iso) => new Date(Date.parse(iso) - 3 * 36e5).toISOString().replace('T', ' ').slice(0, 16).split(' ').map((p, i) => (i ? p : p.split('-').reverse().join('/'))).join(' ');
  const movil = () => matchMedia('(max-width: 900px)').matches;
  const est = { c1: true, c2: true, c3: true, fuente: 'ciudadanos', f: { categoria: '', provincia: '', severidad: '' }, gran: '', desde: '', hasta: '', modo: 'puntual', i: 0, vel: 1, jur: '', play: false };
  let mapa = null, g1 = null, g2 = null, timer = null, ufeci = null, ps = [], vis = [], todo = [];
  const info = { c1: {}, c2: {}, total: 0, periodo: '' }; window.__capasInfo = () => ({ ...info, i: est.i, play: est.play, modo: est.modo, gran: est.gran, fuente: est.fuente, pasos: ps.length });

  // ---------- Panel de capas y filtros ----------
  const P1 = el('details', null, 'sicar-panel', { id: 'sicar-capas' }); P1.append(el('summary', 'Capas y filtros'));
  const c1 = el('div', null, 'cuerpo'); P1.append(c1);
  const chk = (id, titulo, desc, fn) => { const l = el('label', null, 'capa'); const i = el('input'); i.type = 'checkbox'; i.id = id; i.checked = true; i.onchange = () => { fn(i.checked); dibujar(); };
    const t = el('span'); t.append(el('b', titulo), el('small', desc)); l.append(i, t); return l; };
  c1.append(chk('sicar-c1', 'Capa 1 · Registros de SICAR-C', 'Reportes ciudadanos publicados, agrupados por provincia (ubicación aproximada). Sin verificar.', (v) => (est.c1 = v)),
    chk('sicar-c2', 'Capa 2 · Distribución territorial', 'Intensidad por provincia: cantidad de reportes, no tasa de incidencia ni peligrosidad.', (v) => (est.c2 = v)),
    chk('sicar-c3', 'Capa 3 · Contexto temporal', 'Línea de tiempo, comparación de períodos y series históricas.', (v) => { est.c3 = v; P3.hidden = !v; if (!v) pausar(); dibujar(); }));
  const sel = (id, et, ops, k) => { const l = el('label', et, 'campo'); const s = el('select'); s.id = id; for (const [v, t] of ops) s.append(new Option(t, v)); s.onchange = () => { est.f[k] = s.value; if (k === 'provincia') est.jur = s.value; est.i = 0; recalcular(); }; l.append(s); return l; };
  const ord = (a) => [...a].sort((x, y) => x.localeCompare(y, 'es'));
  c1.append(sel('sicar-f-cat', 'Categoría', [['', 'Todas'], ...tax.categorias.map((x) => [x, x])], 'categoria'), sel('sicar-f-prov', 'Provincia', [['', 'Todas'], ...ord(tax.provincias).map((x) => [x, x])], 'provincia'),
    sel('sicar-f-sev', 'Severidad', [['', 'Todas'], ...tax.severidades.map((x) => [x, x])], 'severidad'));
  const det = el('label', 'Nivel de detalle geográfico', 'campo'); const sd = el('select'); sd.append(new Option('Provincia', 'prov')); sd.disabled = true; sd.title = 'No hay datos ni geometrías verificadas para departamentos, partidos o comunas.'; det.append(sd); c1.append(det, el('small', 'Departamentos, partidos y comunas: sin datos desagregados disponibles.', 'nota'));
  const bus = el('label', 'Buscar jurisdicción', 'campo'); const inp = el('input'); inp.setAttribute('list', 'sicar-provs'); inp.placeholder = 'Escribí una provincia'; const dl = el('datalist'); dl.id = 'sicar-provs'; ord(tax.provincias).forEach((p) => dl.append(new Option(p, p)));
  inp.onchange = () => { const p = tax.provincias.find((x) => x.toLowerCase() === inp.value.trim().toLowerCase()); if (p) { seleccionar(p, true); inp.value = ''; } }; bus.append(inp, dl); c1.append(bus);
  const nf = el('small', null, 'nota', { id: 'sicar-afecta' }); c1.append(nf);
  const acc = el('div', null, 'acc');
  const bt = (t, fn, id) => { const b = el('button', t, null, { type: 'button' }); if (id) b.id = id; b.onclick = fn; return b; };
  acc.append(bt('Limpiar filtros', () => { est.f = { categoria: '', provincia: '', severidad: '' }; est.jur = ''; c1.querySelectorAll('select').forEach((s) => { if (!s.disabled) s.value = ''; }); est.i = 0; recalcular(); }, 'sicar-limpiar'),
    bt('Restablecer vista', () => { pausar(); est.i = 0; est.jur = ''; if (mapa) mapa.setView([-38.4, -63.6], 4); recalcular(); }, 'sicar-reset'), bt('Ver como tabla', () => { llenarTabla(); $('#sicar-tabla').showModal(); }, 'sicar-ver-tabla'));
  c1.append(acc);
  const leg = el('div', null, 'leyendas', { id: 'sicar-leyendas' }); c1.append(leg);

  // ---------- Panel temporal ----------
  const P3 = el('details', null, 'sicar-panel', { id: 'sicar-tiempo' }); P3.append(el('summary', 'Línea de tiempo'));
  const c3 = el('div', null, 'cuerpo'); P3.append(c3);
  const fsel = el('label', 'Fuente', 'campo'); const sf = el('select', null, null, { id: 'sicar-fuente' }); sf.append(new Option('Reportes ciudadanos de SICAR-C', 'ciudadanos'), new Option('Informe UFECI/MPF 2024 (nacional, sin ubicación)', 'ufeci'));
  sf.onchange = async () => { pausar(); est.fuente = sf.value; est.i = 0; if (est.fuente === 'ufeci') await cargarUfeci(); recalcular(); }; fsel.append(sf);
  const gsel = el('label', 'Granularidad', 'campo'); const sg = el('select', null, null, { id: 'sicar-gran' }); sg.onchange = () => { pausar(); est.gran = sg.value; est.i = 0; recalcular(); }; gsel.append(sg);
  const d1 = el('label', 'Desde', 'campo'), d2 = el('label', 'Hasta', 'campo'); const id1 = el('input', null, null, { type: 'date', id: 'sicar-desde' }), id2 = el('input', null, null, { type: 'date', id: 'sicar-hasta' });
  id1.onchange = () => { pausar(); est.desde = id1.value; est.i = 0; recalcular(); }; id2.onchange = () => { pausar(); est.hasta = id2.value; est.i = 0; recalcular(); }; d1.append(id1); d2.append(id2);
  const fila1 = el('div', null, 'fila'); fila1.append(fsel, gsel, d1, d2); c3.append(fila1);
  const modo = el('div', null, 'modo', { role: 'radiogroup', 'aria-label': 'Modo temporal' });
  for (const [v, t] of [['puntual', 'Período puntual'], ['acumulado', 'Acumulado histórico']]) { const l = el('label'); const r = el('input'); r.type = 'radio'; r.name = 'sicar-modo'; r.value = v; r.checked = v === est.modo; r.onchange = () => { est.modo = v; recalcular(); }; l.append(r, document.createTextNode(' ' + t)); modo.append(l); }
  c3.append(modo);
  const ctl = el('div', null, 'ctl'); const lblPer = el('div', null, 'periodo', { id: 'sicar-periodo', 'aria-live': 'polite' });
  const bInicio = bt('⏮', () => { pausar(); est.i = 0; recalcular(); }, 'sicar-inicio'), bAnt = bt('◀', () => { pausar(); ir(est.i - 1); }, 'sicar-ant'), bPlay = bt('▶ Reproducir', () => (est.play ? pausar() : reproducir()), 'sicar-play'), bSig = bt('▶|', () => { pausar(); ir(est.i + 1); }, 'sicar-sig');
  [[bInicio, 'Volver al inicio'], [bAnt, 'Período anterior'], [bSig, 'Período siguiente']].forEach(([b, t]) => b.setAttribute('aria-label', t));
  const vsel = el('label', 'Velocidad', 'campo'); const sv = el('select', null, null, { id: 'sicar-vel' }); [[0.5, '0,5×'], [1, '1×'], [2, '2×'], [4, '4×']].forEach(([v, t]) => sv.append(new Option(t, v))); sv.value = '1'; sv.onchange = () => { est.vel = Number(sv.value); if (est.play) { clearInterval(timer); timer = setInterval(paso, 1600 / est.vel); } }; vsel.append(sv);
  ctl.append(bInicio, bAnt, bPlay, bSig, vsel); const desl = el('input', null, null, { type: 'range', id: 'sicar-slider', min: 0, max: 0, step: 1, value: 0, 'aria-label': 'Período mostrado' }); desl.oninput = () => { pausar(); ir(Number(desl.value)); };
  c3.append(lblPer, desl, ctl, el('p', null, 'cobertura', { id: 'sicar-cobertura' }));
  // Comparación de dos intervalos
  const cmp = el('details', null, 'cmp'); cmp.append(el('summary', 'Comparar dos intervalos')); const cf = el('div', null, 'fila');
  const mk = (id, et) => { const l = el('label', et, 'campo'); const i = el('input', null, null, { type: 'date', id }); i.onchange = comparar; l.append(i); return l; };
  cf.append(mk('sicar-a1', 'A desde'), mk('sicar-a2', 'A hasta'), mk('sicar-b1', 'B desde'), mk('sicar-b2', 'B hasta')); cmp.append(cf, el('p', null, 'res', { id: 'sicar-cmp', 'aria-live': 'polite' })); c3.append(cmp);

  // ---------- Estadísticas, ficha de jurisdicción y tabla ----------
  const P2 = el('details', null, 'sicar-panel', { id: 'sicar-stats' }); P2.append(el('summary', 'Estadísticas de la vista')); const c2 = el('div', null, 'cuerpo', { id: 'sicar-stats-cuerpo', 'aria-live': 'polite' }); P2.append(c2);
  const J = el('div', null, 'jur', { id: 'sicar-jur' }); J.hidden = true;
  const T = el('dialog', null, null, { id: 'sicar-tabla', 'aria-labelledby': 'sicar-tabla-t' }); T.append(el('h2', 'Datos de la vista actual (tabla)', null, { id: 'sicar-tabla-t' }), el('div', null, null, { id: 'sicar-tabla-c' }), bt('Cerrar', () => T.close()));
  const COLM = el('div', null, null, { id: 'sicar-col' }); COLM.append(P1, P2); document.body.append(COLM, P3, T); P2.append(J);

  function barras(c, filas, color) { const max = Math.max(1, ...filas.map((f) => f[1])); for (const [n, v] of filas) { const d = el('div', null, 'f'); const w = el('div'); const b = el('div', null, 'b'); b.style.width = (100 * v / max) + '%'; if (color) b.style.background = color(n); w.append(b); d.append(el('span', n), w, el('span', fmt(v))); c.append(d); } }
  function varTxt(v, previoOk) { if (!previoOk) return 'sin período anterior comparable'; return v.pct === null ? `${v.abs >= 0 ? '+' : ''}${fmt(v.abs)} (sin porcentaje: el período anterior no tuvo registros)` : `${v.abs >= 0 ? '+' : ''}${fmt(v.abs)} (${v.pct >= 0 ? '+' : ''}${String(v.pct).replace('.', ',')} %)`; }

  // ---------- Cálculo ----------
  async function cargarUfeci() { if (ufeci) return; try { ufeci = await (await fetch('/data/ufeci_2024.json')).json(); } catch { ufeci = null; } }
  function recalcular() {
    todo = (window.__raw || []).slice(); const ts = todo.map((r) => Date.parse(r.created_at)).filter(Number.isFinite);
    const min = Math.min(...ts), max = Math.max(...ts), hay = ts.length > 0;
    ps = []; let gr = [];
    if (est.fuente === 'ufeci') { if (ufeci) { ps = ufeci.reportes_mensuales.meses.map((m, k) => ({ etiqueta: m + ' 2024', k })); gr = ['mes']; est.gran = 'mes'; } }
    else if (hay) {
      gr = N.granularidades(min, max); if (!gr.includes(est.gran)) est.gran = gr.includes('mes') ? 'mes' : gr.includes('semana') ? 'semana' : gr[0] || '';
      const iso = (t) => new Date(t - 3 * 36e5).toISOString().slice(0, 10); id1.min = id2.min = iso(min); id1.max = id2.max = iso(max);
      const d = est.desde ? Date.parse(est.desde + 'T03:00:00Z') : min, h = est.hasta ? Date.parse(est.hasta + 'T03:00:00Z') + 864e5 - 1 : max;
      if (est.gran && h >= d) ps = N.periodos(d, h, est.gran);
    }
    sg.replaceChildren(...gr.map((g) => new Option(GRAN[g], g))); sg.value = est.gran || ''; sg.disabled = gr.length < 1; sf.value = est.fuente;
    est.i = Math.max(0, Math.min(est.i, ps.length - 1)); desl.max = Math.max(0, ps.length - 1); desl.value = est.i; desl.disabled = ps.length < 2;
    [bInicio, bAnt, bPlay, bSig].forEach((b) => (b.disabled = ps.length < 2));
    if (est.fuente === 'ciudadanos') {
      const base = N.filtrar(todo, est.f), v = ps.length ? N.ventana(ps, est.i, est.modo) : null;
      vis = v ? N.filtrar(todo, { ...est.f, ventana: v }) : base;
      lblPer.textContent = ps.length ? `${est.modo === 'acumulado' ? 'Acumulado hasta ' : 'Período: '}${ps[est.i].etiqueta} (${est.i + 1} de ${ps.length})` : 'Sin línea de tiempo: no hay períodos suficientes.';
      $('#sicar-cobertura').textContent = hay ? `Cobertura: ${fechaHora(new Date(min).toISOString()).slice(0, 10)} a ${fechaHora(new Date(max).toISOString()).slice(0, 10)}. Fecha utilizada: fecha de CARGA del reporte (no la fecha del hecho). ${ps.length ? '' : 'Se necesitan al menos 3 períodos con la granularidad disponible para reproducir.'}` : 'Todavía no hay reportes ciudadanos publicados con fecha; la reproducción no está disponible.';
      window.__ventana = v;
    } else { vis = []; lblPer.textContent = ps.length ? `${est.modo === 'acumulado' ? 'Acumulado hasta ' : 'Período: '}${ps[est.i].etiqueta} (${est.i + 1} de ${ps.length})` : 'No se pudo cargar el informe UFECI.'; $('#sicar-cobertura').textContent = 'Informe UFECI/MPF 2024 (edición junio 2025): enero a diciembre de 2024, datos nacionales mensuales. No tienen ubicación: el mapa no cambia en esta fuente; se animan los indicadores.'; window.__ventana = null; }
    $('#sicar-afecta').textContent = est.fuente === 'ufeci' ? 'La fuente UFECI es nacional: los filtros por provincia y severidad no se aplican; la categoría se aplica a las modalidades.' : 'Los filtros afectan a las capas 1 y 2, a las estadísticas y a la tabla. La capa 3 usa los mismos filtros.';
    info.total = vis.length; info.periodo = ps[est.i] ? ps[est.i].etiqueta : '';
    if (window.__setInc && est.fuente === 'ciudadanos') window.__setInc(vis);
    dibujar();
  }
  const ir = (i) => { est.i = Math.max(0, Math.min(ps.length - 1, i)); recalcular(); };
  function paso() { if (est.i >= ps.length - 1) { pausar(); return; } est.i++; recalcular(); if (est.i >= ps.length - 1) pausar(); }
  function reproducir() { if (ps.length < 2) return; if (est.i >= ps.length - 1) est.i = 0; est.play = true; bPlay.textContent = '⏸ Pausar'; bPlay.setAttribute('aria-pressed', 'true'); clearInterval(timer); recalcular(); timer = setInterval(paso, 1600 / est.vel); }
  function pausar() { est.play = false; clearInterval(timer); timer = null; bPlay.textContent = '▶ Reproducir'; bPlay.setAttribute('aria-pressed', 'false'); }

  // ---------- Dibujo ----------
  function porProv(r) { const o = {}; for (const x of r) (o[x.province] ??= []).push(x); return o; }
  function dibujar() {
    info.c1 = {}; info.c2 = {};
    if (g1) { g1.clearLayers(); mapa && mapa.removeLayer(g1); } if (g2) { g2.clearLayers(); mapa && mapa.removeLayer(g2); }
    const pv = porProv(vis), maxN = Math.max(0, ...Object.values(pv).map((a) => a.length));
    if (mapa && est.fuente === 'ciudadanos') {
      for (const [prov, arr] of Object.entries(pv)) {
        const cap = tax.capitales[prov]; if (!cap) continue;
        if (est.c2) { const c = N.clase(arr.length, maxN), m = window.L.circleMarker(cap, { pane: 'sicar-capa2', radius: 14 + 26 * Math.sqrt(arr.length / maxN), color: RAMPA[c], fillColor: RAMPA[c], fillOpacity: .35, weight: 1, sicarCapa: 2, prov, n: arr.length }); m.on('click', () => seleccionar(prov, false)); g2.addLayer(m); info.c2[prov] = arr.length; }
        if (est.c1) { const cats = N.contar(arr, 'category'), top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
          const icon = window.L.divIcon({ html: `<div class="sicar-c1" style="background:${COL[top] || '#64748b'}">${arr.length}</div>`, className: 'sicar-c1-icono', iconSize: [30, 30], iconAnchor: [15, 15] });
          const m = window.L.marker(cap, { icon, sicarCapa: 1, prov, n: arr.length, keyboard: true, title: `${prov}: ${arr.length} reporte(s)` }); m.bindPopup(ficha(prov, arr)); g1.addLayer(m); info.c1[prov] = arr.length; }
      }
      if (est.c1) g1.addTo(mapa); if (est.c2) g2.addTo(mapa);
    }
    leyendas(maxN); estadisticas(pv); if (!J.hidden) fichaJur();
  }
  function ficha(prov, arr) {
    const d = el('div', null, 'ficha'); d.append(el('b', `${prov} · ${arr.length} reporte(s) ciudadano(s), sin verificar`), el('small', 'Ubicación aproximada: capital provincial. Fecha: de carga.'));
    const u = el('ul'); for (const r of [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)) u.append(el('li', `${fechaHora(r.created_at)} · ${r.category}${r.subcategory ? ' · ' + r.subcategory : ''} · Severidad ${r.severity}`)); d.append(u);
    if (arr.length > 8) d.append(el('small', `Se muestran los 8 más recientes de ${arr.length}.`)); return d;
  }
  function leyendas(maxN) {
    leg.replaceChildren(); const add = (t, ...x) => { const d = el('div', null, 'leg'); d.append(el('b', t), ...x); leg.append(d); };
    if (est.c1) { const f = el('span'); for (const [c, col] of Object.entries(COL)) { const s = el('i'); s.style.background = col; f.append(s, document.createTextNode(c + ' ')); } add('Capa 1 · círculo = reportes de la provincia (color: categoría predominante)', f, el('small', 'Fuente: reportes ciudadanos de SICAR-C, sin verificar. Ubicación aproximada.')); }
    if (est.c2) { const f = el('span'); RAMPA.forEach((c, k) => { const s = el('i'); s.style.background = c; f.append(s, document.createTextNode(maxN ? `${Math.floor(k * maxN / 4) + 1}–${Math.floor((k + 1) * maxN / 4) || 1} ` : '')); }); add('Capa 2 · intensidad por provincia (cantidad de reportes)', f, el('small', 'No es tasa de incidencia ni peligrosidad. Sin geometrías provinciales verificadas: se representa con círculos.')); }
    if (est.c3) add('Capa 3 · contexto temporal', el('small', est.modo === 'acumulado' ? 'Modo acumulado: reportes desde el inicio del rango hasta el período mostrado.' : 'Modo puntual: sólo los reportes del período mostrado.'));
    const act = el('small', `Capas activas: ${[est.c1 && '1', est.c2 && '2', est.c3 && '3'].filter(Boolean).join(', ') || 'ninguna'}.`, 'nota'); leg.append(act);
    if (est.fuente === 'ciudadanos' && !vis.length) leg.append(el('small', 'No hay registros para el período y los filtros seleccionados.', 'nota alerta'));
  }
  function estadisticas(pv) {
    c2.replaceChildren(); const fu = (est.fuente === 'ufeci');
    if (fu) { if (!ufeci) { c2.append(el('p', 'No se pudo cargar el informe UFECI.')); return; }
      const k = ps[est.i].k, m = ufeci.reportes_mensuales, ac = est.modo === 'acumulado', rg = (a) => (ac ? a.slice(0, k + 1) : [a[k]]).reduce((x, y) => x + y, 0);
      const act = rg(m['2024']), prev = rg(m['2023']); c2.append(el('p', `${fmt(act)} reportes a UFECI (${ac ? 'acumulado desde enero' : ps[est.i].etiqueta})`, 'grande'), el('p', `Variación frente a 2023 (mismo ${ac ? 'acumulado' : 'mes'}): ${varTxt(N.variacion(act, prev), true)}`));
      const filas = Object.entries(ufeci.modalidades_2024.series).filter(([n]) => !est.f.categoria || n === est.f.categoria || (est.f.categoria === 'Usurpación de identidad' && n === 'Usurpación de identidad')).map(([n, s]) => [n, rg(s.mensual)]); const b = el('div', null, 'barras'); barras(b, filas, (n) => COL[n]); c2.append(b);
      c2.append(el('small', 'Fuente: Informe 2024 UFECI/MPF. Datos nacionales, no georreferenciados. Aviso del informe: la suma mensual de 2023 (28.795) no coincide con el total anual informado (28.456).', 'nota')); return; }
    const hay = todo.length > 0; if (!hay) { c2.append(el('p', 'Todavía no hay reportes ciudadanos publicados.'), el('small', 'Los datos históricos de UFECI son nacionales y no se ubican en el mapa. Podés verlos en la línea de tiempo (fuente UFECI).', 'nota')); return; }
    c2.append(el('p', `${fmt(vis.length)} reporte(s) ${est.modo === 'acumulado' && ps.length ? 'acumulados' : 'en la vista'}`, 'grande'));
    if (ps.length && est.modo === 'puntual') { const v = N.ventana(ps, est.i, 'puntual'), a = N.anterior(v), ok = a[0] >= Math.min(...todo.map((r) => Date.parse(r.created_at))); const prev = N.filtrar(todo, { ...est.f, ventana: a }).length; c2.append(el('p', `Variación frente al período anterior de igual duración: ${varTxt(N.variacion(vis.length, prev), ok)}`)); }
    else if (ps.length) c2.append(el('p', 'El acumulado no se compara con un período anterior: cambiá a modo puntual para ver variaciones.', 'nota'));
    c2.append(el('p', `Jurisdicciones con datos: ${Object.keys(pv).length} de ${tax.provincias.length}`)); const cb = el('div', null, 'barras'); barras(cb, Object.entries(N.contar(vis, 'category')).sort((a, b) => b[1] - a[1]), (n) => COL[n]); c2.append(cb);
    const ult = todo.map((r) => r.created_at).sort().pop(); c2.append(el('small', `Ubicación: aproximada (capital provincial) en el 100 % de los registros; 0 % precisa; 0 % desconocida. Último reporte publicado: ${fechaHora(ult)}. Fecha: de carga.`, 'nota'));
  }
  function seleccionar(prov, zoom) { est.jur = prov; const s = $('#sicar-f-prov'); if (s) s.value = prov; est.f.provincia = prov; est.i = Math.min(est.i, Math.max(0, ps.length - 1)); if (zoom && mapa && tax.capitales[prov]) mapa.flyTo(tax.capitales[prov], 7); recalcular(); J.hidden = false; fichaJur(); P2.open = true; }
  function fichaJur() {
    J.replaceChildren(); if (!est.jur) { J.hidden = true; return; } J.hidden = false; const prov = est.jur, arr = N.filtrar(todo, { ...est.f, provincia: prov });
    const v = ps.length ? N.ventana(ps, est.i, est.modo) : null, enV = v ? N.filtrar(arr, { ventana: v }) : arr;
    J.append(el('h3', prov), el('p', `${fmt(enV.length)} reporte(s) en ${est.modo === 'acumulado' ? 'el acumulado' : 'el período'} ${ps[est.i] ? ps[est.i].etiqueta : 'completo'}`));
    const b = el('div', null, 'barras'); barras(b, Object.entries(N.contar(enV, 'category')).sort((a, c) => c[1] - a[1]), (n) => COL[n]); J.append(b);
    if (ps.length) { const sr = N.serie(arr, ps), mx = Math.max(1, ...sr), g = el('div', null, 'spark', { role: 'img', 'aria-label': `Evolución de reportes en ${prov}: ${sr.join(', ')}` }); sr.forEach((n, k) => { const s = el('span'); s.style.height = (4 + 36 * n / mx) + 'px'; s.title = `${ps[k].etiqueta}: ${n}`; if (k === est.i) s.className = 'act'; g.append(s); }); J.append(el('small', 'Evolución temporal'), g);
      if (est.modo === 'puntual') { const a = N.anterior(N.ventana(ps, est.i, 'puntual')); J.append(el('p', 'Variación frente al período anterior: ' + varTxt(N.variacion(enV.length, N.filtrar(arr, { ventana: a }).length), a[0] >= Math.min(...todo.map((r) => Date.parse(r.created_at)))))); } }
    const cob = arr.length ? `Cobertura: ${arr.length} reporte(s) publicados en la provincia.` : 'Sin reportes ciudadanos publicados en esta provincia.';
    J.append(el('small', `${cob} Cantidad de reportes, no tasa de incidencia ni indicador de peligrosidad. Actualizado: ${todo.length ? fechaHora(todo.map((r) => r.created_at).sort().pop()) : '—'}.`, 'nota'), bt('Cerrar ficha', () => { est.jur = ''; est.f.provincia = ''; $('#sicar-f-prov').value = ''; recalcular(); }, 'sicar-cerrar-jur'));
  }
  function comparar() {
    const g = (id) => $('#' + id).value, o = $('#sicar-cmp'); const [a1, a2, b1, b2] = ['sicar-a1', 'sicar-a2', 'sicar-b1', 'sicar-b2'].map(g); if (!(a1 && a2 && b1 && b2)) { o.textContent = 'Elegí las cuatro fechas.'; return; }
    const w = (d1, d2) => [Date.parse(d1 + 'T03:00:00Z'), Date.parse(d2 + 'T03:00:00Z') + 864e5]; const A = w(a1, a2), B = w(b1, b2); if (A[1] <= A[0] || B[1] <= B[0]) { o.textContent = 'Cada intervalo debe terminar después de su inicio.'; return; }
    const na = N.filtrar(todo, { ...est.f, ventana: A }).length, nb = N.filtrar(todo, { ...est.f, ventana: B }).length, dA = Math.round((A[1] - A[0]) / 864e5), dB = Math.round((B[1] - B[0]) / 864e5);
    o.textContent = `A: ${fmt(na)} (${dA} días) · B: ${fmt(nb)} (${dB} días) · Variación de B respecto de A: ${varTxt(N.variacion(nb, na), true)}.${dA !== dB ? ' Atención: los intervalos tienen distinta duración.' : ''}`;
  }
  function llenarTabla() {
    const c = $('#sicar-tabla-c'); c.replaceChildren(); const pv = porProv(vis), tot = vis.length; const t = el('table'); t.append(el('caption', est.fuente === 'ciudadanos' ? `Reportes ciudadanos publicados (sin verificar) · ${info.periodo || 'rango completo'} · ${est.modo}` : 'Informe UFECI/MPF 2024 · nacional'));
    const h = el('tr'); ['Provincia', 'Reportes', '% de la vista'].forEach((x) => h.append(el('th', x, null, { scope: 'col' }))); t.append(h);
    if (est.fuente === 'ciudadanos') { for (const [p, a] of Object.entries(pv).sort((x, y) => y[1].length - x[1].length)) { const r = el('tr'); r.append(el('td', p), el('td', fmt(a.length)), el('td', (100 * a.length / tot).toFixed(1).replace('.', ',') + ' %')); t.append(r); } if (!tot) { const r = el('tr'); const td = el('td', 'Sin registros para esta vista.'); td.colSpan = 3; r.append(td); t.append(r); } }
    else if (ufeci) { const r = el('tr'); const td = el('td', 'Fuente nacional sin desglose provincial.'); td.colSpan = 3; r.append(td); t.append(r); }
    c.append(t);
  }

  // ---------- Integración con el mapa y con la aplicación base ----------
  function conectarMapa() { if (!window.__mapa || !window.L || mapa === window.__mapa) return; mapa = window.__mapa; const L = window.L; if (mapa.createPane) { mapa.createPane('sicar-capa2'); const p = mapa.getPane && mapa.getPane('sicar-capa2'); if (p) p.style.zIndex = 450; } g1 = L.layerGroup(); g2 = L.layerGroup(); dibujar(); }
  window.addEventListener('sicar-mapa', conectarMapa); conectarMapa();
  window.__aplicar = recalcular;
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); }); window.addEventListener('pagehide', pausar);
  if (movil()) { P1.open = false; P2.open = false; P3.open = false; } else { P1.open = true; P3.open = true; P2.open = true; }
  recalcular();
})();
