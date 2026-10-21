const $ = (s) => document.querySelector(s);
const fmt = (n) => Number(n).toLocaleString('es-AR');
const H = { 'x-requested-with': 'sicar-interno', 'content-type': 'application/json' };
const ETQ = { pendiente_revision: 'Pendiente de revisión', publicada: 'Publicado', rechazada: 'Rechazado' };
const MOTIVOS = { categoria_sensible: 'categoría sensible', posibles_datos_personales: 'posibles datos personales o enlaces', publicacion_automatica_desactivada: 'publicación automática desactivada' };
const el = (t, txt, cls) => { const e = document.createElement(t); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
async function api(ruta, opc) { const r = await fetch('/api/interno' + ruta, { cache: 'no-store', ...opc }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'No pudimos completar la operación.'), { estado: r.status, datos: j }); return j; }
function barras(c, filas, etq = (k) => k) {
  const max = Math.max(1, ...filas.map((f) => f.n)); c.replaceChildren();
  if (!filas.length) { c.append(el('p', 'Sin datos todavía.', 'aviso')); return; }
  for (const f of filas) { const d = el('div', null, 'f'); const w = el('div'); const b = el('div', null, 'b'); b.style.width = (100 * f.n / max) + '%'; w.append(b); d.append(el('span', etq(f.k)), w, el('span', fmt(f.n))); c.append(d); }
}
async function cargarPanel() {
  const p = await api('/panel');
  const k = $('#kpis'); k.replaceChildren(...[['Recibidos', p.recibidos], ['Pendientes de revisión', p.pendientes], ['Publicados', p.publicados], ['Rechazados', p.rechazados], ['Con pérdida económica', p.perdida.con_perdida], ['Sin pérdida', p.perdida.sin_perdida], ['Pérdida sin monto declarado', p.perdida.sin_monto_declarado]].map(([t, v]) => { const d = el('div'); d.append(el('b', fmt(v)), el('span', t)); return d; }));
  barras($('#g-evolucion'), p.evolucion); barras($('#g-categoria'), p.categoria); barras($('#g-severidad'), p.severidad); barras($('#g-provincia'), p.provincia.slice(0, 12));
  const g = $('#g-perdida'); barras(g, [{ k: 'Con pérdida', n: p.perdida.con_perdida }, { k: 'Sin pérdida', n: p.perdida.sin_perdida }]);
  for (const m of p.perdida.montos_declarados_por_moneda) g.append(el('p', `Montos declarados en ${m.moneda}: ${fmt(m.n)} caso(s), suma ${fmt(m.suma)} (mín. ${fmt(m.minimo)}, máx. ${fmt(m.maximo)})`, 'aviso'));
  $('#aviso-montos').textContent = p.perdida.aviso;
}
let pagina = 1, total = 0, actual = null;
const form = $('#filtros');
function llenar(sel, valores, vacio) { sel.replaceChildren(new Option(vacio, ''), ...valores.map((v) => new Option(v, v))); }
async function cargarLista() {
  const q = new URLSearchParams(new FormData(form)); q.set('pagina', pagina); for (const [k, v] of [...q]) if (!v) q.delete(k);
  $('#estado-lista').textContent = 'Cargando…';
  try {
    const r = await api('/reportes?' + q); total = r.total;
    $('#estado-lista').textContent = r.total ? '' : 'No hay reportes para los filtros elegidos.';
    $('#filas').replaceChildren(...r.reportes.map((x) => { const tr = el('tr', null, 'fila'); tr.tabIndex = 0; tr.setAttribute('role', 'button');
      const perd = x.perdida_economica ? (x.monto_estado === 'declarado' ? `${x.moneda} ${fmt(x.monto_valor)}` : 'Sí, sin monto') : 'No';
      tr.append(el('td', x.creado_utc.replace('T', ' ').slice(0, 16)), el('td', ETQ[x.estado] + (x.motivo_retencion && x.estado === 'pendiente_revision' ? ` (${MOTIVOS[x.motivo_retencion] || x.motivo_retencion})` : '')), el('td', x.tipo + (x.subcategoria ? ' · ' + x.subcategoria : '')), el('td', x.severidad), el('td', x.provincia + (x.localidad ? ' · ' + x.localidad : '')), el('td', perd), el('td', x.resumen));
      const abrir = () => abrirDetalle(x.id); tr.onclick = abrir; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }; return tr; }));
    const pags = Math.max(1, Math.ceil(total / r.por_pagina)); $('#pag-info').textContent = `Página ${pagina} de ${pags} · ${fmt(total)} reportes`;
    $('#ant').disabled = pagina <= 1; $('#sig').disabled = pagina >= pags;
  } catch (e) { $('#estado-lista').textContent = e.message; }
}
async function abrirDetalle(id) {
  $('#det-msg').textContent = ''; $('#obs').value = '';
  try {
    const { reporte: r, auditoria } = await api('/reportes/' + id); actual = r;
    const dl = el('dl'); const add = (t, v) => dl.append(el('dt', t), el('dd', v == null || v === '' ? '—' : String(v)));
    add('Estado', ETQ[r.estado]); add('Motivo de retención', MOTIVOS[r.motivo_retencion] || r.motivo_retencion); add('Recibido (UTC)', r.creado_utc); add('Categoría', r.tipo); add('Subcategoría', r.subcategoria); add('Severidad', r.severidad);
    add('Provincia', r.provincia); add('Localidad', r.localidad); add('Medio utilizado', r.medio);
    add('Pérdida económica', r.perdida_economica ? (r.monto_estado === 'declarado' ? `Sí — ${r.moneda} ${fmt(r.monto_valor)} (declarado por el usuario, no verificado)` : 'Sí — monto no declarado') : 'No');
    add('Descripción (privada)', r.descripcion); add('Evidencia', r.tiene_evidencia ? 'Adjunta' : 'Sin evidencia'); add('Última revisión', r.revisado_por ? `${r.revisado_por} — ${r.revisado_utc}` : ''); add('Observaciones', r.observaciones);
    $('#det-cuerpo').replaceChildren(el('h2', 'Detalle del reporte ' + r.id), dl);
    $('#hist').replaceChildren(...(auditoria.length ? auditoria.map((a) => el('li', `${a.creado_utc} — ${a.usuario}: ${a.accion} (${ETQ[a.estado_anterior]} → ${ETQ[a.estado_nuevo]})${a.observacion ? ' — ' + a.observacion : ''}`)) : [el('li', 'Sin acciones registradas.')]));
    $('#detalle').showModal();
  } catch (e) { $('#estado-lista').textContent = e.message; }
}
async function decidir(decision) {
  const botones = document.querySelectorAll('#detalle .acc button'); botones.forEach((b) => (b.disabled = true)); $('#det-msg').textContent = '';
  try { await api(`/reportes/${actual.id}/decision`, { method: 'POST', headers: H, body: JSON.stringify({ decision, estado_esperado: actual.estado, observacion: $('#obs').value }) }); $('#detalle').close(); await Promise.all([cargarPanel(), cargarLista()]); }
  catch (e) { $('#det-msg').textContent = e.message; }
  finally { botones.forEach((b) => (b.disabled = false)); }
}
$('#b-aprobar').onclick = () => decidir('aprobar'); $('#b-rechazar').onclick = () => decidir('rechazar'); $('#b-pend').onclick = () => decidir('mantener_pendiente'); $('#b-cerrar').onclick = () => $('#detalle').close();
form.onsubmit = (e) => { e.preventDefault(); pagina = 1; cargarLista(); }; $('#ant').onclick = () => { pagina--; cargarLista(); }; $('#sig').onclick = () => { pagina++; cargarLista(); };
(async () => {
  try { const tax = (await (await fetch('/config.js')).text()); const t = JSON.parse(tax.slice(tax.indexOf('=') + 1, tax.lastIndexOf(';'))).tax;
    llenar(form.categoria, t.categorias, 'Todas'); llenar(form.provincia, t.provincias, 'Todas'); llenar(form.severidad, t.severidades, 'Todas'); } catch {}
  await Promise.all([cargarPanel().catch((e) => ($('#estado-lista').textContent = e.message)), cargarLista()]);
})();
