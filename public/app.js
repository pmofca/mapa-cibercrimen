const $ = (s) => document.querySelector(s);
const fmt = (n) => n.toLocaleString('es-AR');
const COL = { 'Fraude en línea': '#ef4444', 'Usurpación de identidad': '#f59e0b', 'Acceso ilegítimo': '#3b82f6', 'Phishing': '#a855f7', 'Acoso': '#ec4899', 'Otros': '#94a3b8' };
const SEV = ['Baja', 'Media', 'Alta', 'Crítica'];
const PROVS = ['CABA','Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'];
const MEDIOS = ['WhatsApp', 'Correo electrónico', 'SMS', 'Llamada telefónica', 'Redes sociales', 'Sitio web o marketplace', 'Otro'];

function barras(el, filas, color) {
  const max = Math.max(...filas.map((f) => f[1]));
  el.replaceChildren(...filas.map(([n, v]) => {
    const f = document.createElement('div'); f.className = 'f';
    const a = document.createElement('span'); a.textContent = n;
    const w = document.createElement('div'); const b = document.createElement('div'); b.className = 'b'; b.style.width = (100 * v / max) + '%'; if (color) b.style.background = color(n); w.append(b);
    const c = document.createElement('span'); c.textContent = fmt(v); f.append(a, w, c); return f;
  }));
}
function opciones(sel, lista, vacio) {
  sel.replaceChildren(...[vacio, ...lista].map((t, i) => { const o = document.createElement('option'); o.value = i === 0 && vacio ? '' : t; o.textContent = t; return o; }));
}

async function datosHistoricos() {
  try {
    const d = await (await fetch('/data/ufeci_2024.json')).json();
    $('#k-ufeci').textContent = fmt(d.reportes_anuales['2024']);
    const a = d.reportes_anuales;
    barras($('#g-anual'), [['Prepandemia*', a.prepandemia_abr2019_mar2020], ['2021', a['2021']], ['2022', a['2022']], ['2023', a['2023']], ['2024', a['2024']]]);
    barras($('#g-mod'), Object.entries(d.modalidades_2024.series).map(([n, s]) => [n, s.total]), (n) => COL[n]);
  } catch { $('#g-mod').textContent = 'No pudimos cargar los datos históricos.'; }
}

let mapa;
async function iniciarMapa() {
  mapa = L.map('mapa', { zoomControl: true }).setView([-38.4, -64.0], 4);
  try {
    const cfg = await (await fetch('/api/config')).json();
    L.tileLayer(cfg.tiles, { maxZoom: 10, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(mapa);
  } catch { $('#estado-mapa').textContent = 'No pudimos cargar el mapa base.'; }
  await cargarPuntos();
}
let capa;
async function cargarPuntos() {
  const est = $('#estado-mapa'); est.textContent = 'Cargando reportes ciudadanos…';
  try {
    const r = await fetch('/api/mapa'); if (!r.ok) throw 0;
    const { puntos } = await r.json();
    capa?.remove(); capa = L.layerGroup().addTo(mapa);
    const porProv = {};
    puntos.forEach((p) => { (porProv[p.provincia] ??= { p, filas: [] }).filas.push([p.tipo, p.n]); });
    Object.values(porProv).forEach(({ p, filas }) => {
      const tot = filas.reduce((s, f) => s + f[1], 0);
      const tip = document.createElement('div'); const t = document.createElement('b'); t.textContent = `${p.provincia}: ${tot} reporte(s) ciudadano(s) sin verificar`; tip.append(t);
      filas.forEach(([n, v]) => { const l = document.createElement('div'); l.textContent = `${n}: ${v}`; tip.append(l); });
      const top = filas.sort((a, b) => b[1] - a[1])[0][0];
      L.circleMarker([p.lat, p.lng], { radius: 8 + Math.min(18, Math.sqrt(tot) * 3), color: COL[top], fillColor: COL[top], fillOpacity: .45, weight: 2 }).bindPopup(tip).addTo(capa);
    });
    const tot = puntos.reduce((s, p) => s + p.n, 0);
    $('#k-civ').textContent = fmt(tot); $('#k-prov').textContent = fmt(Object.keys(porProv).length);
    est.textContent = tot ? '' : 'Todavía no hay reportes ciudadanos publicados. Los datos históricos de UFECI son nacionales y no se ubican en el mapa.';
  } catch { est.textContent = 'No pudimos cargar los reportes ciudadanos. Intentá de nuevo más tarde.'; }
}

// Formulario
const dlg = $('#d-reporte'), form = $('#f-rep'); let token = crypto.randomUUID();
opciones(form.provincia, PROVS, 'Seleccionar'); opciones(form.tipo, Object.keys(COL), 'Seleccionar'); opciones(form.severidad, SEV, 'Seleccionar'); opciones(form.medio, MEDIOS, 'Seleccionar');
$('#b-reportar').onclick = () => { $('#ok').hidden = true; form.hidden = false; dlg.showModal(); };
$('#b-cancelar').onclick = () => dlg.close(); $('#b-cerrar-ok').onclick = () => dlg.close();
$('#b-nosotros').onclick = () => $('#d-nos').showModal(); $('#b-cerrar-nos').onclick = () => $('#d-nos').close();
const errores = (c = {}) => document.querySelectorAll('[data-e]').forEach((e) => { e.textContent = c[e.dataset.e] || ''; });
form.addEventListener('submit', async (ev) => {
  ev.preventDefault(); errores(); $('#msg-form').textContent = '';
  const btn = $('#b-enviar'); if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Enviando…';
  const fd = new FormData(form); fd.set('token', token);
  try {
    const r = await fetch('/api/reportes', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      $('#ok-txt').textContent = 'Tu reporte quedó guardado. Si no contiene datos sensibles, se mostrará en el mapa sólo como un conteo por provincia.';
      form.hidden = true; $('#ok').hidden = false; form.reset(); token = crypto.randomUUID(); cargarPuntos();
    } else { errores(j.campos); $('#msg-form').textContent = j.error || 'No pudimos enviar el reporte.'; }
  } catch { $('#msg-form').textContent = 'No pudimos conectarnos. Tus datos siguen en el formulario; probá de nuevo.'; }
  finally { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
});
datosHistoricos(); iniciarMapa();
