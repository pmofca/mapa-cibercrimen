import json, re, sys, uuid, urllib.request, urllib.error
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
def chk(nombre,cond,extra=''):
    res.append((nombre,bool(cond))); print(('PASA  ' if cond else 'FALLA ')+nombre+(' — '+str(extra)[:300] if extra and not cond else ''))
def get(path,hdr=None):
    rq=urllib.request.Request(BASE+path,headers=hdr or {})
    try: r=urllib.request.urlopen(rq); return r.status,r.read().decode('utf8','ignore')
    except urllib.error.HTTPError as e: return e.code,e.read().decode('utf8','ignore')
def db(): return json.loads(get('/__prueba/db')[1])
def jwt(**q): return get('/__prueba/jwt?'+'&'.join(f'{k}={v}' for k,v in q.items()))[1]
def post(path,body,ip='203.0.113.9',hdr=None):
    h={'Content-Type':'application/json','x-ip-prueba':ip,**(hdr or {})}
    rq=urllib.request.Request(BASE+path,data=json.dumps(body).encode(),headers=h,method='POST')
    try: r=urllib.request.urlopen(rq); return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read() or b'{}')
base={'category':'Fraude en línea','subcategory':'Fraude bancario','province':'Salta','severity':'Alta','description':'Me escribieron pidiendo transferencias urgentes por una cuenta.','locality':'','medium':'WhatsApp','hasLoss':'no','lossAmount':'','currency':'ARS','amountUnknown':False}
def nuevo(**k): return {**base,'token':str(uuid.uuid4()),**k}
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1440,'height':900},locale='es-AR'); pg=ctx.new_page(); errores=[]
    pg.on('pageerror',lambda e:errores.append('pageerror: '+str(e)))
    pg.on('console',lambda m:errores.append('console: '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    externos=[]
    def ruta(r):
        u=r.request.url
        if u.startswith(BASE): return r.continue_()
        externos.append(u)
        if 'leaflet.min.js' in u: return r.fulfill(body=STUB,content_type='application/javascript')
        if u.endswith('.css'): return r.fulfill(body='',content_type='text/css')
        if 'maplibre' in u and u.endswith('.js'): return r.fulfill(body='',content_type='application/javascript')
        return r.abort()
    ctx.route('**/*',ruta)
    pg.goto(BASE+'/'); pg.wait_for_selector('text=Reportes por Provincia'); pg.wait_for_timeout(1200)
    chk('carga sin errores de página/consola',not errores,errores)
    chk('mapa base: OpenFreeMap (estilo dark) vía maplibre-gl-leaflet, sin CARTO',pg.evaluate('window.__estilo')=='https://tiles.openfreemap.org/styles/dark' and not any('carto' in u for u in externos),pg.evaluate('window.__estilo'))
    chk('atribución de OpenFreeMap/OpenMapTiles/OSM',any('OpenFreeMap' in a and 'OpenStreetMap' in a for a in pg.evaluate('window.__attr')))
    txtl=pg.inner_text('body').lower()
    for t in ['Sistema de Inteligencia y Correlación de Amenazas para la Resiliencia Civil','Reportes por Provincia','Distribución por Categoría','Fraude en línea — desglose','Acceso ilegítimo — plataforma','Actividad reciente correlacionada','Todavía no hay reportes ciudadanos publicados']:
        chk('texto presente: '+t[:48],t.lower() in txtl)
    base_marcas=pg.evaluate('window.__marcas.size')
    cfg=get('/config.js')[1]; chk('taxonomía única: el cliente la recibe de /config.js',all(x in cfg for x in ['"categorias"','"subcategorias"','"medios"','"provincias"','"monedas"','UFECI']))
    pg.locator('svg.recharts-surface path.recharts-sector').first.dispatch_event('click'); pg.wait_for_timeout(500)
    t2=pg.inner_text('body').lower(); chk('drill-down con subcategorías del informe UFECI','volver' in t2 and ('homebanking' in t2 or 'compra por intern' in t2))
    pg.get_by_role('button',name=re.compile(r'^\s*volver\s*$',re.I)).first.click()
    # --- formulario: validación y pérdida económica
    pg.get_by_role('button',name=re.compile('Reportar Amenaza')).first.click(); pg.wait_for_selector('text=Nuevo Reporte — SICAR-C')
    enviar=lambda: pg.get_by_role('button',name=re.compile('Enviar Reporte')).last.click()
    enviar(); pg.wait_for_timeout(300); chk('validación: mensaje claro','Completá los campos obligatorios' in pg.inner_text('body')); chk('validación: nada guardado',len(db())==0)
    sel=pg.locator('select:not(#sicar-capas select):not(#sicar-tiempo select)'); sel.nth(0).select_option('Phishing'); sel.nth(1).select_option('Media'); pg.locator('select[name=province]').select_option('Córdoba')
    pg.locator('textarea').fill('Recibí un SMS falso de un banco pidiendo mis datos.')
    pg.get_by_role('button',name='Sí',exact=True).click(); pg.wait_for_selector('select[name=currency]')
    chk('formulario: moneda y opción "no sé el monto"',pg.locator('select[name=currency]').count()==1 and 'No sé el monto' in pg.inner_text('body'))
    pg.locator('select[name=currency]').select_option('USD'); pg.locator('input[name=lossAmount]').fill('1.500,50')
    pg.route('**/api/incidents',lambda r: r.abort() if r.request.method=='POST' else r.continue_()); enviar(); pg.wait_for_timeout(1500)
    t3=pg.inner_text('body'); chk('error de red: mensaje honesto, sin falso éxito','No pudimos conectarnos' in t3 and 'Reporte correlacionado' not in t3 and len(db())==0)
    pg.unroute('**/api/incidents'); get('/__prueba/caer?v=1'); enviar(); pg.wait_for_timeout(1500)
    t4=pg.inner_text('body'); chk('D1 caída: mensaje de falla, nada guardado, sin falso éxito','NO fue recibido' in t4 and 'Reporte correlacionado' not in t4 and len(db())==0); get('/__prueba/caer?v=0')
    enviar(); pg.wait_for_timeout(2500)
    f=db(); chk('reporte válido guardado en D1 con pérdida, moneda y monto',len(f)==1 and f[0]['estado']=='publicada' and (f[0]['moneda'],f[0]['monto_valor'],f[0]['monto_estado'],f[0]['perdida_economica'])==('USD',1500.5,'declarado',1),f)
    pg.wait_for_timeout(700)
    chk('capa 1 derivada del registro persistido (1 publicado en Córdoba = 1 agrupación con n=1)',pg.evaluate('window.__vis()')=={'c1':{'Córdoba':1},'c2':{'Córdoba':1}} and pg.evaluate('window.__raw.length')==1,pg.evaluate('window.__vis()'))
    chk('la ficha del mapa no contiene la descripción privada ni el monto',all('SMS falso' not in h and '1500' not in h and '1.500' not in h for h in pg.evaluate('window.__popTxt()')) and any('sin verificar' in h for h in pg.evaluate('window.__popTxt()')))
    kp=re.search(r'reportes correlacionados\s*\n?\s*(\d+)',pg.inner_text('body').lower()); chk('contador "últimas 24h" actualizado con el dato real (1)',kp and kp.group(1)=='1')
    chk('gráfico por provincia refleja el reporte (Córdoba)','córdoba' in pg.inner_text('body').lower() or 'cordoba' in pg.inner_text('body').lower())
    # --- API pública, privacidad, validación, antifraude
    s,j=post('/api/incidents',nuevo(hasLoss='si',lossAmount='',amountUnknown=True,subcategory='Transferencia fraudulenta'),ip='10.0.0.1'); chk('pérdida con monto desconocido: guardada sin inventar valor',s==201 and [r for r in db() if r['id']==j['incident']['id']][0]['monto_estado']=='no_declarado')
    s,j=post('/api/incidents',nuevo(hasLoss='si',lossAmount='muchísimo'),ip='10.0.0.2'); chk('monto inválido: 422',s==422 and 'lossAmount' in j.get('campos',{}))
    s,j=post('/api/incidents',nuevo(category='Inventada'),ip='10.0.0.3'); chk('categoría inválida: 422',s==422)
    s,j=post('/api/incidents',nuevo(description='Me escribió juan.perez@correo.com por un cobro.',hasLoss='si',lossAmount='50.000'),ip='10.0.0.4'); idp=j['incident']['id']; chk('con email en el texto: queda pendiente',s==201 and j['incident']['published'] is False)
    s,j=post('/api/incidents',nuevo(category='Acoso',subcategory='Amenazas',description='Recibo amenazas por mensajes todos los días.'),ip='10.0.0.5'); ida=j['incident']['id']; chk('Acoso: siempre pendiente',s==201 and j['incident']['published'] is False)
    t=str(uuid.uuid4()); post('/api/incidents',{**nuevo(),'token':t},ip='10.0.0.6'); n=len(db()); post('/api/incidents',{**nuevo(),'token':t},ip='10.0.0.6'); chk('doble envío (mismo token) no duplica',len(db())==n)
    pub=get('/api/incidents')[1]; chk('API pública: sólo reportes publicados y campos seguros',all(k not in pub for k in ['juan.perez','50.000','SMS falso','amenazas','monto','1500','descripcion']) and set(json.loads(pub)['incidents'][0])=={'id','province','category','subcategory','severity','description','created_at','latitude','longitude','published'})
    est=json.loads(get('/api/estadisticas')[1]); chk('estadísticas públicas agregadas: sin montos individuales (menos de 5 casos comparables)',est['montos_declarados']==[] and est['con_perdida']>=1 and 'monto_valor' not in json.dumps(est))
    for i in range(5): post('/api/incidents',nuevo(hasLoss='si',lossAmount=str(1000*(i+1)),currency='ARS'),ip=f'10.1.0.{i}')
    est=json.loads(get('/api/estadisticas')[1]); chk('con ≥5 casos comparables se publica el agregado por moneda',len(est['montos_declarados'])==1 and est['montos_declarados'][0]['moneda']=='ARS' and est['montos_declarados'][0]['suma']==15000,est['montos_declarados'])
    for i in range(7): s,j=post('/api/incidents',nuevo(description=f'Reporte de prueba número {i} con texto suficiente.'),ip='198.51.100.5')
    chk('límite por IP: el 6.º envío responde 429',s==429)
    pg.reload(); pg.wait_for_selector('#sicar-capas'); pg.wait_for_timeout(1200)
    total=pg.evaluate('window.__raw.length')
    # --- portal interno: autorización en el servidor
    s,_=get('/interno'); chk('portal sin credenciales: 401',s==401)
    s,_=get('/api/interno/panel'); chk('API interna sin credenciales: 401',s==401)
    for nombre,tok,esp in [('correo no autorizado',jwt(email='intruso@x.com'),403),('firma inválida',jwt(firmar=0),401),('token vencido',jwt(exp=1),401),('audiencia incorrecta',jwt(aud='otra'),401)]:
        s1,_=get('/interno',{'cf-access-jwt-assertion':tok}); s2,_=get('/api/interno/reportes',{'cf-access-jwt-assertion':tok}); chk(f'portal: {nombre} → {esp} (página y API)',s1==esp and s2==esp,(s1,s2))
    tok=jwt(); H={'cf-access-jwt-assertion':tok}
    s,txt=get('/interno',H); chk('portal con credenciales válidas: 200 y en español','200'==str(s) and 'Portal interno' in txt)
    s,txt=get('/api/interno/reportes?estado=pendiente_revision',H); lista=json.loads(txt); chk('bandeja: lista paginada de pendientes (incluye los retenidos)',s==200 and lista['total']>=2 and lista['por_pagina']==25 and all(r['estado']=='pendiente_revision' for r in lista['reportes']))
    chk('bandeja: filtros por categoría/provincia/severidad/fecha',json.loads(get('/api/interno/reportes?categoria=Acoso&provincia=Salta',H)[1])['total']==1 and json.loads(get('/api/interno/reportes?desde=2999-01-01',H)[1])['total']==0)
    pan=json.loads(get('/api/interno/panel',H)[1]); chk('panel: indicadores calculados desde D1',pan['recibidos']==len(db()) and pan['pendientes']>=2 and pan['perdida']['con_perdida']>=3 and pan['perdida']['sin_monto_declarado']>=1 and any(m['moneda']=='USD' for m in pan['perdida']['montos_declarados_por_moneda']),pan['perdida'])
    # --- portal en navegador: aprobar y rechazar
    pc=b.new_context(viewport={'width':1440,'height':900},locale='es-AR',extra_http_headers=H); pp=pc.new_page(); perr=[]; pp.on('pageerror',lambda e:perr.append(str(e)))
    pp.goto(BASE+'/interno'); pp.wait_for_selector('tr.fila'); pp.screenshot(path='/tmp/portal.png')
    chk('portal: carga sin errores y muestra la bandeja',not perr and pp.locator('tr.fila').count()>=2,perr)
    pp.locator('tr.fila',has_text='Fraude en línea').first.click(); pp.wait_for_selector('#detalle[open]')
    dt=pp.inner_text('#det-cuerpo'); chk('detalle privado visible sólo en el portal (descripción y monto declarado)','juan.perez@correo.com' in dt and 'no verificado' in dt)
    pp.get_by_role('button',name='Rechazar').click(); pp.wait_for_timeout(400); chk('rechazo sin motivo: error claro',('motivo del rechazo' in pp.inner_text('#det-msg')) and all(r['estado']!='rechazada' for r in db()))
    pp.fill('#obs','Contiene datos personales de terceros.'); pp.get_by_role('button',name='Rechazar').click(); pp.wait_for_timeout(800)
    rj=[r for r in db() if r['id']==idp][0]; chk('rechazo: estado rechazada, auditado y fuera del mapa',rj['estado']=='rechazada' and rj['revisado_por']=='revisora@ofca.test' and idp not in get('/api/incidents')[1])
    s,_=post('/api/interno/reportes/%s/decision'%idp,{'decision':'aprobar','estado_esperado':'pendiente_revision'},hdr={**H,'origin':BASE,'x-requested-with':'sicar-interno'}); chk('acción duplicada/desactualizada: 409',s==409)
    s,_=post('/api/interno/reportes/%s/decision'%ida,{'decision':'aprobar','estado_esperado':'pendiente_revision'},hdr=H); chk('POST interno sin cabecera anti-CSRF: 403',s==403)
    antes=pg.evaluate('window.__raw.length')
    pp.reload(); pp.locator('tr.fila',has_text='Acoso').first.wait_for(); pp.locator('tr.fila',has_text='Acoso').first.click(); pp.wait_for_selector('#detalle[open]'); pp.get_by_role('button',name='Aprobar y publicar').click(); pp.wait_for_timeout(900)
    ap=[r for r in db() if r['id']==ida][0]; chk('aprobación desde el portal: estado publicada y auditada',ap['estado']=='publicada' and ap['revisado_por']=='revisora@ofca.test')
    aud=json.loads(get('/__prueba/auditoria')[1]); chk('auditoría: acción, usuario, estados y fecha registrados',len(aud)>=2 and all(a['usuario']=='revisora@ofca.test' and a['creado_utc'] and a['estado_nuevo'] for a in aud) and not any('descripcion' in a for a in aud))
    pg.goto(BASE+'/'); pg.wait_for_selector('#sicar-capas'); pg.wait_for_timeout(1200)
    chk('aprobado desde el portal aparece en el mapa (sin tocar la base a mano)',ida in json.dumps(pg.evaluate('window.__raw')) and pg.evaluate('window.__raw.length')==antes+1 and idp not in json.dumps(pg.evaluate('window.__raw')))
    # --- móvil
    m=b.new_context(viewport={'width':390,'height':800},is_mobile=True,locale='es-AR'); mp=m.new_page(); me=[]; mp.on('pageerror',lambda e:me.append(str(e))); m.route('**/*',ruta)
    mp.goto(BASE+'/'); mp.wait_for_selector('#sicar-capas'); mp.wait_for_timeout(1200); mp.screenshot(path='/tmp/movil.png'); chk('móvil: carga sin errores y con panel de capas',not me and mp.locator('#sicar-capas').count()==1,me)
    pg.screenshot(path='/tmp/desktop.png'); b.close()
print('\nRESUMEN:',sum(1 for _,o in res if o),'/',len(res)); sys.exit(0 if all(o for _,o in res) else 1)
