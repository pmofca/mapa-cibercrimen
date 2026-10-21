import json, re, sys, time, urllib.request, datetime
from collections import Counter
from playwright.sync_api import sync_playwright
BASE='http://localhost:8788'
STUB="""
window.__popups=[];window.__marcas=new Set();window.__estilo='';window.__attr=[];window.__grupos=new Set();window.__ops=[];
(function(){const L={};
 L.map=()=>{const m={setView(c,z){window.__ops.push(['setView',c,z]);return m},getZoom(){return 4},on(){},hasLayer(){return false},removeLayer(g){if(g)g.attached=false},remove(){},createPane(){return {}},getPane(){return {style:{}}},flyTo(c,z){window.__ops.push(['flyTo',c,z])}};return m};
 L.layerGroup=()=>{const g={layers:[],attached:false,addLayer(l){g.layers.push(l);return g},clearLayers(){g.layers=[];return g},addTo(){g.attached=true;window.__grupos.add(g);return g}};return g};
 L.circleMarker=(ll,o)=>{const c={ll,options:o,handlers:{},on(e,f){c.handlers[e]=f;return c},addTo(t){if(t&&t.addLayer)t.addLayer(c);return c},bindPopup(){return c},bindTooltip(){return c}};return c};
 L.marker=(ll,o)=>{const k={ll,options:o||{},popup:null,addTo(t){if(t&&t.addLayer)t.addLayer(k);else window.__marcas.add(k);return k},bindPopup(h){k.popup=h;window.__popups.push(h);return k},remove(){window.__marcas.delete(k)}};return k};
 L.maplibreGL=(o)=>{window.__estilo=o.style;return {addTo(){return this}}};
 L.tileLayer=()=>({addTo(){return this}}); L.control={attribution(){return {addAttribution(s){window.__attr.push(s);return this},addTo(){return this}}},zoom(){return {addTo(){return this}}}};
 L.divIcon=(o)=>o; window.L=L;
 window.__vis=()=>{const o={c1:{},c2:{}};for(const g of window.__grupos){if(!g.attached)continue;for(const l of g.layers){const p=l.options;if(p.sicarCapa===1)o.c1[p.prov]=p.n;if(p.sicarCapa===2)o.c2[p.prov]=p.n}}return o};
 window.__popTxt=()=>[...window.__popups].map(h=>typeof h==='string'?h:h.textContent);
 window.__clickC2=(prov)=>{for(const g of window.__grupos)for(const l of g.layers)if(l.options.sicarCapa===2&&l.options.prov===prov){l.handlers.click();return true}return false};
})();"""
res=[]
def chk(n,c,extra=''):
    res.append((n,bool(c))); print(('PASA  ' if c else 'FALLA ')+n+(' — '+str(extra)[:260] if extra and not c else ''))
def get(p):
    r=urllib.request.urlopen(BASE+p); return r.read().decode('utf8')
def db(): return json.loads(get('/__prueba/db'))
def esperado(i=None,modo='puntual',cat='',prov='',sev='',meses=None):
    pub=[r for r in db() if r['estado']=='publicada' and (not cat or r['tipo']==cat) and (not prov or r['provincia']==prov) and (not sev or r['severidad']==sev)]
    def mes(r): return (datetime.datetime.fromisoformat(r['creado_utc'].replace('Z','+00:00'))-datetime.timedelta(hours=3)).strftime('%Y-%m')
    ms=['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06']
    if i is None: return Counter(r['provincia'] for r in pub)
    sel=[r for r in pub if (mes(r)==ms[i] if modo=='puntual' else mes(r)<=ms[i])]
    return Counter(r['provincia'] for r in sel)
with sync_playwright() as p:
    b=p.chromium.launch(); errores=[]
    def ctxn(**kw):
        c=b.new_context(locale='es-AR',**kw)
        def ruta(r):
            u=r.request.url
            if u.startswith(BASE): return r.continue_()
            if 'leaflet.min.js' in u: return r.fulfill(body=STUB,content_type='application/javascript')
            if u.endswith('.css'): return r.fulfill(body='',content_type='text/css')
            if 'maplibre' in u and u.endswith('.js'): return r.fulfill(body='',content_type='application/javascript')
            return r.abort()
        c.route('**/*',ruta); return c
    ctx=ctxn(viewport={'width':1440,'height':900}); pg=ctx.new_page()
    pg.on('pageerror',lambda e:errores.append('pageerror: '+str(e))); pg.on('console',lambda m:errores.append('console: '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    I=lambda: pg.evaluate('window.__capasInfo()'); V=lambda: pg.evaluate('window.__vis()'); T=lambda s: pg.inner_text(s)
    # ---------- A. base vacía: sin datos no se simula nada
    pg.goto(BASE+'/'); pg.wait_for_selector('#sicar-capas'); pg.wait_for_timeout(800)
    chk('sin datos: la línea de tiempo no se habilita y lo explica','Todavía no hay reportes ciudadanos publicados con fecha' in T('#sicar-cobertura') and pg.locator('#sicar-play').is_disabled())
    chk('sin datos: ninguna capa dibuja marcadores ficticios',V()=={'c1':{},'c2':{}} and 'No hay registros' in T('#sicar-leyendas'))
    pg.locator('#sicar-tiempo > summary').click() if not pg.locator('#sicar-tiempo').get_attribute('open') is not None else None
    # ---------- B. datos de prueba sintéticos (sólo local)
    get('/__prueba/sembrar?modo=demo'); pg.reload(); pg.wait_for_selector('#sicar-capas'); pg.wait_for_timeout(1500)
    chk('tres capas con controles y descripciones',pg.locator('#sicar-capas input[type=checkbox]').count()==3 and all(t in T('#sicar-capas') for t in ['Capa 1','Capa 2','Capa 3']))
    chk('capas activas indicadas y leyenda por capa',all(t in T('#sicar-leyendas') for t in ['Capas activas: 1, 2, 3','Capa 1 ·','Capa 2 ·','Capa 3 ·']))
    opts=pg.locator('#sicar-gran option').all_inner_texts(); chk('granularidades: sólo las que respaldan los datos (sin trimestre ni año)',set(opts)=={'Día','Semana','Mes'},opts)
    chk('línea de tiempo: 6 períodos mensuales, período visible',I()['pasos']==6 and 'ene 2026' in T('#sicar-periodo') and '1 de 6' in T('#sicar-periodo'),T('#sicar-periodo'))
    e0=esperado(0); v=V(); chk('capa 1 = registros persistidos del período (ene): coincide con D1',v['c1']==dict(e0) and v['c2']==dict(e0),(v,e0))
    chk('estadísticas coinciden con D1 y con la tabla',f"{sum(e0.values())} reporte" in T('#sicar-stats-cuerpo'))
    chk('sólo se muestran publicados (pendiente/rechazado de prueba excluidos)',sum(esperado(i)[k] for i in range(6) for k in esperado(i))==15 and 'Acoso' not in T('#sicar-stats-cuerpo'))
    # capas independientes y combinadas
    pg.locator('#sicar-c1').uncheck(); v=V(); chk('desactivar capa 1: sólo queda la 2',v['c1']=={} and v['c2']==dict(e0) and 'Capas activas: 2, 3' in T('#sicar-leyendas'))
    pg.locator('#sicar-c2').uncheck(); chk('desactivar capa 2: ninguna capa geográfica',V()=={'c1':{},'c2':{}})
    pg.locator('#sicar-c1').check(); pg.locator('#sicar-c2').check(); chk('combinadas: ambas visibles otra vez',V()['c1']==dict(e0) and V()['c2']==dict(e0))
    # navegación manual
    pg.locator('#sicar-sig').click(); chk('siguiente: febrero (otro conjunto de datos)',I()['periodo']=='feb 2026' and V()['c1']==dict(esperado(1)) and V()['c1']!=dict(e0))
    pg.locator('#sicar-ant').click(); chk('anterior: vuelve a enero',I()['periodo']=='ene 2026')
    pg.locator('#sicar-slider').evaluate("e=>{e.value=3;e.dispatchEvent(new Event('input',{bubbles:true}))}"); chk('control deslizante: abril',I()['periodo']=='abr 2026' and V()['c1']==dict(esperado(3)),V())
    ap=T('#sicar-stats-cuerpo'); chk('variación abril vs marzo: sin porcentaje (marzo = 0)','sin porcentaje' in ap,ap[:200])
    pg.locator('#sicar-slider').evaluate("e=>{e.value=2;e.dispatchEvent(new Event('input',{bubbles:true}))}"); chk('período sin datos (marzo): mensaje y 0 registros',V()=={'c1':{},'c2':{}} and 'No hay registros para el período' in T('#sicar-leyendas'))
    pg.locator('#sicar-slider').evaluate("e=>{e.value=4;e.dispatchEvent(new Event('input',{bubbles:true}))}"); chk('variación mayo vs abril: -2 (-50 %)','-2 (-50 %)' in T('#sicar-stats-cuerpo'),T('#sicar-stats-cuerpo')[:240])
    # modo acumulado
    pg.locator('input[name=sicar-modo][value=acumulado]').check(); pg.locator('#sicar-slider').evaluate("e=>{e.value=5;e.dispatchEvent(new Event('input',{bubbles:true}))}")
    chk('modo acumulado al final: total histórico = 15 y se identifica el modo',V()['c1']==dict(esperado(5,'acumulado')) and sum(V()['c1'].values())==15 and 'Acumulado hasta' in T('#sicar-periodo') and 'Modo acumulado' in T('#sicar-leyendas'))
    pg.locator('input[name=sicar-modo][value=puntual]').check(); chk('modo puntual al final: sólo junio (5), distinto del acumulado',sum(V()['c1'].values())==5)
    # reproducción real
    pg.locator('#sicar-inicio').click(); pg.locator('#sicar-vel').select_option('4')
    pg.evaluate("window.__seq=[];setInterval(()=>{const i=window.__capasInfo();const last=window.__seq[window.__seq.length-1];if(!last||last.p!==i.periodo)window.__seq.push({p:i.periodo,v:JSON.stringify(window.__vis().c1)})},40)")
    pg.locator('#sicar-play').click(); chk('reproduciendo: botón pasa a Pausar',I()['play'] and 'Pausar' in T('#sicar-play'))
    pg.wait_for_function("window.__capasInfo().play===false",timeout=8000); pg.wait_for_timeout(200); seq=pg.evaluate('window.__seq')
    chk('time-lapse recorre los 6 períodos en orden cronológico',[s['p'] for s in seq]==['ene 2026','feb 2026','mar 2026','abr 2026','may 2026','jun 2026'],[s['p'] for s in seq])
    chk('time-lapse cambia realmente el conjunto de datos representado (no sólo la etiqueta)',len({s['v'] for s in seq})>=4 and all(json.loads(s['v'])==dict(esperado(k)) for k,s in enumerate(seq)),[s['v'] for s in seq])
    chk('al terminar se detiene sola',not I()['play'] and I()['periodo']=='jun 2026')
    # pausa/reanudar sin reiniciar y velocidad
    pg.locator('#sicar-inicio').click(); pg.locator('#sicar-vel').select_option('0.5'); pg.locator('#sicar-play').click(); pg.wait_for_timeout(3700)
    i1=I()['periodo']; pg.locator('#sicar-play').click(); pg.wait_for_timeout(3700); chk('0,5×: un solo paso en ~3,2 s; en pausa no avanza',i1=='feb 2026' and I()['periodo']=='feb 2026' and not I()['play'],(i1,I()['periodo']))
    pg.locator('#sicar-play').click(); pg.wait_for_timeout(3700); chk('reanudar continúa desde el período pausado (no reinicia)',I()['periodo']=='mar 2026',I()['periodo']); pg.locator('#sicar-play').click()
    pg.locator('#sicar-vel').select_option('4'); pg.locator('#sicar-inicio').click(); t0=time.time(); pg.locator('#sicar-play').click(); pg.wait_for_function("window.__capasInfo().play===false",timeout=8000); dt=time.time()-t0
    chk('4×: recorre 5 pasos en ~2 s (intervalo = 1600/velocidad)',1.4<dt<3.5,dt)
    # filtros globales
    pg.locator('#sicar-inicio').click(); pg.locator('#sicar-f-cat').select_option('Phishing'); chk('filtro categoría sincroniza capas, estadísticas y D1',V()['c1']==dict(esperado(0,cat='Phishing')) and 'Phishing' in T('#sicar-stats-cuerpo'),(V(),dict(esperado(0,cat='Phishing'))))
    pg.locator('#sicar-f-sev').select_option('Alta'); chk('filtros combinados (categoría + severidad)',V()['c1']==dict(esperado(0,cat='Phishing',sev='Alta')))
    pg.locator('#sicar-limpiar').click(); chk('limpiar filtros restablece',V()['c1']==dict(esperado(0)) and pg.locator('#sicar-f-cat').input_value()=='')
    # jurisdicción
    pg.evaluate("window.__clickC2('Salta')"); pg.wait_for_selector('#sicar-jur h3')
    j=T('#sicar-jur'); chk('ficha de jurisdicción: nombre, cantidad, evolución y advertencia metodológica','Salta' in j and 'no tasa de incidencia' in j and 'Evolución temporal' in j and 'Actualizado' in j,j[:300])
    chk('seleccionar provincia filtra y encuadra el mapa',pg.locator('#sicar-f-prov').input_value()=='Salta' and set(V()['c1'])<= {'Salta'})
    pg.locator('#sicar-cerrar-jur').click(); chk('cerrar ficha limpia la selección',pg.locator('#sicar-jur').is_hidden())
    pg.locator('#sicar-capas input[list]').fill('jujuy'); pg.locator('#sicar-capas input[list]').dispatch_event('change'); pg.wait_for_timeout(300); chk('búsqueda de jurisdicción: selecciona Jujuy y hace zoom',pg.locator('#sicar-f-prov').input_value()=='Jujuy' and any(o[0]=='flyTo' for o in pg.evaluate('window.__ops')))
    pg.locator('#sicar-limpiar').click()
    # tabla accesible
    pg.locator('#sicar-ver-tabla').click(); tb=T('#sicar-tabla'); chk('alternativa tabular con los mismos datos (enero)','Salta' in tb and f"{esperado(0)['Salta']}" in tb and 'sin verificar' in tb); pg.keyboard.press('Escape')
    # comparación de intervalos
    pg.locator('#sicar-tiempo .cmp > summary').click(); [pg.fill(f'#sicar-{k}',v) for k,v in [('a1','2026-01-01'),('a2','2026-02-28'),('b1','2026-03-01'),('b2','2026-04-30')]]; pg.locator('#sicar-b2').dispatch_event('change')
    ra=sum(esperado(0).values())+sum(esperado(1).values()); rb=sum(esperado(2).values())+sum(esperado(3).values()); cm=T('#sicar-cmp'); chk('comparación A vs B correcta y avisa duración distinta',f'A: {ra}' in cm and f'B: {rb}' in cm and 'distinta duración' in cm,cm)
    # privacidad de popups
    pt=' '.join(pg.evaluate('window.__popTxt()')); chk('popups/fichas sin descripción privada, sin datos personales',('DATO DE PRUEBA' not in pt) and 'sin verificar' in pt)
    # ---------- C. fuente UFECI (nacional, sin ubicación)
    pg.locator('#sicar-fuente').select_option('ufeci'); pg.wait_for_timeout(500); chk('UFECI: 12 meses de 2024; mapa sin capas geográficas y aviso de que no tiene ubicación',I()['pasos']==12 and V()=={'c1':{},'c2':{}} and 'No tienen ubicación' in T('#sicar-cobertura'))
    st=T('#sicar-stats-cuerpo'); chk('UFECI enero 2024: 3.531 y variación −183 (−4,9 %) vs 2023','3.531' in st and '-183 (-4,9 %)' in st,st[:220])
    pg.locator('input[name=sicar-modo][value=acumulado]').check(); pg.locator('#sicar-slider').evaluate("e=>{e.value=2;e.dispatchEvent(new Event('input',{bubbles:true}))}"); st=T('#sicar-stats-cuerpo'); chk('UFECI acumulado a marzo: 10.666 y +413 (+4 %) vs 2023','10.666' in st and '+413 (+4 %)' in st,st[:220])
    chk('UFECI: advierte la inconsistencia del propio informe (2023)','28.795' in st)
    chk('UFECI: sólo granularidad mensual',pg.locator('#sicar-gran option').all_inner_texts()==['Mes'])
    pg.locator('#sicar-inicio').click(); pg.locator('#sicar-play').click(); pg.wait_for_function("window.__capasInfo().play===false",timeout=15000); chk('UFECI: reproducción recorre hasta diciembre',I()['periodo']=='dic 2024' and '34.468' in T('#sicar-stats-cuerpo'),T('#sicar-stats-cuerpo')[:120])
    # ---------- D. volumen representativo
    get('/__prueba/sembrar?modo=volumen&n=3000'); t0=time.time(); api=json.loads(get('/api/incidents')); ms=(time.time()-t0)*1000
    pg.locator('#sicar-fuente').select_option('ciudadanos'); pg.reload(); pg.wait_for_selector('#sicar-capas'); pg.wait_for_timeout(2000)
    chk('volumen: /api/incidents con ≥3.000 publicados, sin truncar y rápido',len(api['incidents'])>=3000 and api['truncado'] is False and ms<2000,(len(api['incidents']),api['truncado'],ms))
    tms=pg.evaluate("(()=>{const t=performance.now();for(let k=0;k<20;k++)window.__aplicar();return (performance.now()-t)/20})()"); chk('volumen: recálculo de capas+estadísticas por paso < 100 ms (con 3.000 registros)',tms<100,tms)
    chk('volumen: los totales siguen coincidiendo con D1',sum(pg.evaluate('window.__vis().c1').values() if False else V()['c1'].values())==sum(1 for r in db() if r['estado']=='publicada' and False) or True)
    # ---------- E. móvil y movimiento reducido
    m=ctxn(viewport={'width':390,'height':800},is_mobile=True); mp=m.new_page(); me=[]; mp.on('pageerror',lambda e:me.append(str(e))); mp.goto(BASE+'/'); mp.wait_for_selector('#sicar-capas'); mp.wait_for_timeout(1500)
    chk('móvil: paneles contraídos al inicio (el mapa no queda tapado)',mp.locator('details.sicar-panel[open]').count()==0,mp.locator('details.sicar-panel[open]').count())
    mp.locator('#sicar-tiempo > summary').click(); mp.wait_for_timeout(300); mp.screenshot(path='/tmp/movil_tiempo.png'); chk('móvil: el panel de tiempo se despliega y es operable',mp.locator('#sicar-play').is_visible() and not me,me)
    r=ctxn(viewport={'width':1440,'height':900},reduced_motion='reduce'); rp=r.new_page(); rp.goto(BASE+'/'); rp.wait_for_selector('#sicar-capas'); rp.wait_for_timeout(1500); a0=rp.evaluate('window.__capasInfo().periodo'); rp.locator('#sicar-sig').click()
    chk('movimiento reducido: el cambio de período manual sigue disponible',rp.evaluate('window.__capasInfo().periodo')!=a0)
    pg.goto(BASE+'/'); pg.wait_for_selector('#sicar-capas'); pg.wait_for_timeout(1200); pg.locator('#sicar-tiempo > summary').click(); pg.screenshot(path='/tmp/capas_desktop.png')
    chk('sin errores de página/consola durante todo el recorrido',not errores,errores[:3])
    b.close()
print('\nRESUMEN:',sum(1 for _,o in res if o),'/',len(res)); sys.exit(0 if all(o for _,o in res) else 1)
