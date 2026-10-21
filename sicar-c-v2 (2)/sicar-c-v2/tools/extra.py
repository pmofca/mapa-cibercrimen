# D) KPI "Reportes correlacionados · últimas 24h": antes = largo(v)+80 sintéticos+suma de números aleatorios
parche('kpi-24h-real', r'let em=\[\.\.\.v,\.\.\.\$\]\.length\+es\.reduce\(\(e,a\)=>e\+a\.value,0\);',
  'let esr=K.map(p=>({name:p.length>8?p.slice(0,8)+"…":p,full:p,value:v.filter(i=>i.province===p).length})).filter(d=>d.value>0),em=v.filter(i=>i.created_at&&Date.now()-new Date(i.created_at).getTime()<864e5).length;')
# E) Gráfico "Reportes por Provincia" con datos reales (reportes ciudadanos publicados)
parche('grafico-provincias-datos', r'data:es,margin:', 'data:esr,margin:')
parche('grafico-provincias-celdas', r'children:es\.map\(\(e,a\)=>', 'children:esr.map((e,a)=>')
# F) Desglose por subcategoría: cifras inventadas -> porcentajes publicados en el informe UFECI 2024
nuevo_el = '''el={"Fraude en línea":[{name:"Compra por internet",value:56,color:"#ef4444"},{name:"Homebanking",value:18,color:"#f87171"},{name:"Esquema piramidal",value:10,color:"#fca5a5"},{name:"Otros",value:16,color:"#dc2626"}],"Acceso ilegítimo":[{name:"WhatsApp",value:30,color:"#3b82f6"},{name:"Mercado Pago",value:26,color:"#60a5fa"},{name:"Facebook",value:15,color:"#93c5fd"},{name:"Gmail",value:4,color:"#2563eb"},{name:"Instagram",value:3,color:"#1d4ed8"},{name:"Hotmail",value:2,color:"#1e40af"},{name:"Otros",value:20,color:"#1e3a8a"}],Phishing:[{name:"Correo electrónico",value:35,color:"#f97316"},{name:"Redes sociales o llamados telefónicos",value:65,color:"#fb923c"}],Acoso:[{name:"Difusión no autorizada de imágenes íntimas",value:23.3,color:"#8b5cf6"},{name:"Otros reportes de acoso",value:76.7,color:"#a78bfa"}]}'''
parche('desglose-subcategorias', r'el=\{"Fraude en línea":\[\{name:"Transferencia fraudulenta",value:7821.*?\{name:"Otro tipo de amenaza digital",value:2204,color:"#64748b"\}\]\}', nuevo_el)
parche('desglose-sin-datos', r'ei\(el\[e\]\|\|\[\]\)', 'ei(el[e]&&el[e].length?el[e]:[{name:"Sin desglose publicado en el informe UFECI 2024",value:100,color:"#475569"}])')
parche('drill-total-100', r'x=t\?\(null===\(a=ee\.find\(e=>e\.name===t\)\)\|\|void 0===a\?void 0:a\.value\)\|\|1:eh', 'x=t?100:eh')
parche('tooltip-drill-unidad', r'a\.toLocaleString\("es"\),\" eventos\"\]\}\),\(0,s\.jsxs\)\("p",\{className:"text-slate-400",children:\[n,"% del total"\]\}\)',
  'a.toLocaleString("es"),r.total===100?"% de la modalidad":" eventos"]}),(0,s.jsxs)("p",{className:"text-slate-400",children:[r.total===100?"Fuente: Informe UFECI/MPF 2024":n+"% del total"]})')
parche('panel-fraude-tooltip', r'a\.toLocaleString\("es"\),\" eventos\"\]\}\),\(0,s\.jsxs\)\("p",\{className:"text-slate-500",children:\[\(r\.value/21729\*100\)\.toFixed\(1\),"% del fraude"\]\}\)',
  'a.toLocaleString("es"),"% de los reportes de fraude en línea"]}),(0,s.jsxs)("p",{className:"text-slate-500",children:["Fuente: Informe UFECI/MPF 2024"]})')
parche('panel-acceso-tooltip', r'a\.toLocaleString\("es"\),\" eventos\"\]\}\),\(0,s\.jsxs\)\("p",\{className:"text-slate-500",children:\[\(r\.value/2877\*100\)\.toFixed\(1\),"% del acceso ilegítimo"\]\}\)',
  'a.toLocaleString("es"),"% de los reportes de acceso ilegítimo"]}),(0,s.jsxs)("p",{className:"text-slate-500",children:["Fuente: Informe UFECI/MPF 2024"]})')
# G) Alertas inventadas ("Correlación detectada…"): se desactiva el disparo desde el cliente
parche('alerta-inventada', r'\(L\.has\(e\.subcategory\)\|\|"Alta"===e\.severity\)&&\(q\(!0\),X\(U\(\)\)\)\},\[\]\);return', '},[]);return')
# H) Envío: confirmación solo tras la respuesta real del servidor (antes: demora fija de 2 s y éxito simulado)
nuevo_eg = r"""eg=(0,l.useCallback)(async e=>{let i={category:e.category,subcategory:e.subcategory||"",province:e.province,severity:e.severity,description:e.description,locality:e.localidad||"",medium:e.channel||"",hasLoss:"si"===e.hasLoss?"si":"no",lossAmount:e.lossAmount||"",currency:e.currency||"ARS",amountUnknown:!!e.amountUnknown,token:window.__tokenEnvio||(window.__tokenEnvio=crypto.randomUUID())};try{let r=await fetch("/api/incidents",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify(i)}),a=await r.json().catch(()=>({}));if(!r.ok)return{ok:!1,msg:a.error||"No pudimos guardar tu reporte, así que no fue recibido. Intentá de nuevo en unos minutos."};if(window.__tokenEnvio=null,a.incident&&a.incident.published){let t=E(a.incident);window.__raw=[t,...(window.__raw||[]).filter(x=>x.id!==t.id)],window.__aplicar&&window.__aplicar(),_(t.id),setTimeout(()=>_(null),4e3)}return{ok:!0}}catch(e){return{ok:!1,msg:"No pudimos conectarnos con el servidor. Tus datos siguen en el formulario; probá de nuevo."}}},[]);return(0,s.jsxs)("div",{className:"h-screen"""
parche('envio-real', r'eg=\(0,l\.useCallback\)\(async e=>\{.*?\},\[\]\);return\(0,s\.jsxs\)\("div",\{className:"h-screen', nuevo_eg)
parche('formulario-F', r'F=async e=>\{p\(!0\),await new Promise\(e=>setTimeout\(e,1200\)\),p\(!1\),u\(!0\),await new Promise\(e=>setTimeout\(e,900\)\),r\(e\),u\(!1\),',
  'F=async e=>{p(!0),Er("");let ok=await r(e);if(p(!1),!ok.ok){Er(ok.msg);return}u(!0),await new Promise(e=>setTimeout(e,900)),u(!1),')
parche('formulario-estado-error', r'\[y,N\]=\(0,l\.useState\)\(!1\)', '[y,N]=(0,l.useState)(!1),[er,Er]=(0,l.useState)("")')
parche('formulario-validacion', r'R=async\(\)=>\{if\(i\.category&&i\.severity&&i\.description&&i\.province\)\{',
  'R=async()=>{if(!(i.category&&i.severity&&i.description&&i.province)){Er("Completá los campos obligatorios (*): tipo de amenaza, severidad, provincia y descripción del evento.");return}if(i.description.trim().length<20){Er("Describí el evento con al menos 20 caracteres.");return}{')
parche('formulario-mostrar-error', r'\(0,s\.jsx\)\("button",\{onClick:R,disabled:x\|\|m,', 'er&&(0,s.jsx)("p",{role:"alert",className:"text-red-400 text-xs text-center font-semibold",children:er}),(0,s.jsx)("button",{onClick:R,disabled:x||m,')
parche('evidencia-aviso', r'children:i\.file\.name\}\)', 'children:i.file.name+" — la carga de evidencias todavía no está disponible: el reporte se enviará sin la imagen"})')
# I) Popup del mapa: se escapa todo el HTML interpolado (el original insertaba la descripción sin escapar)
parche('escape-helper', r'function ev\(e,a,t\)\{', 'function esc(x){return String(null==x?"":x).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"})[c])}function ev(e,a,t){')
for campo in ['category','subcategory','province','description','time']:
    parche('escape-'+campo, r'\.concat\(t\.'+campo+r',', '.concat(esc(t.'+campo+'),')
# J) Leaflet desde cdnjs (los fragmentos 212/733/966 no estaban en la copia) y URL de teselas restaurada (HTTrack la había corrompido)
parche('leaflet-global', r'let e=\(await t\.e\(212\)\.then\(t\.t\.bind\(t,77691,23\)\)\)\.default;await Promise\.all\(\[t\.e\(733\),t\.e\(966\)\]\)\.then\(t\.t\.bind\(t,60966,23\)\),d\.current=e;', 'let e=window.L;d.current=e;')
parche('teselas-openfreemap', r'e\.tileLayer\("\.\./%7bs%7d\.basemaps\.cartocdn\.com/dark_nolabels/%7bz%7d/%7bx%7d/%7by%7d%7br%7d\.png",\{subdomains:"abcd",maxZoom:19\}\)\.addTo\(a\),',
  '(e.maplibreGL?e.maplibreGL({style:"https://tiles.openfreemap.org/styles/dark"}).addTo(a):console.error("[SICAR-C] No se pudo cargar el mapa base (maplibre-gl-leaflet)")),')
parche('atribucion-openfreemap', r'addAttribution\(\'&copy; <a href="(?:\.\./carto\.com/index\.html|https://carto\.com/)">CARTO</a>\'\)',
  'addAttribution(\'<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Datos de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>\')')
# L) Estado vacío (texto nuevo, no existía en el MVP): sin reportes ciudadanos publicados, el gráfico por provincia quedaba en blanco
parche('estado-vacio-provincias', r'\(0,s\.jsx\)\(r\.h,\{width:"100%",height:170,children:\(0,s\.jsxs\)\(p\.v,\{data:esr,',
  '0===esr.length?(0,s.jsx)("p",{className:"text-slate-500 text-[11px] text-center py-10",children:"Todavía no hay reportes ciudadanos publicados."}):(0,s.jsx)(r.h,{width:"100%",height:170,children:(0,s.jsxs)(p.v,{data:esr,')

# M) Taxonomía única: el cliente la recibe del servidor (/config.js) en vez de listas propias
parche('tax-categorias', r'let P=\[[^\]]*\],M=\{', 'let P=window.__SICAR.tax.categorias,M={')
parche('tax-subcategorias-criticas', r',T=\{.*?\},L=new Set\(\[[^\]]*\]\)', ',T=window.__SICAR.tax.subcategorias,L=new Set(window.__SICAR.tax.criticas)')
parche('tax-medios', r',H=\[[^\]]*\],K=', ',H=window.__SICAR.tax.medios,K=')
parche('tax-provincias', r',K=\[[^\]]*\],V=', ',K=window.__SICAR.tax.provincias,V=')
parche('tax-capitales', r',V=\{.*?\},J=', ',V=window.__SICAR.tax.capitales,J=')
# N) Pérdida económica: moneda explícita y opción de monto desconocido
parche('perdida-estado-inicial', r'lossAmount:"",hasLoss:"no"', 'lossAmount:"",currency:"ARS",amountUnknown:!1,hasLoss:"no"', esperado=3)
parche('perdida-controles', r'"si"===i\.hasLoss&&\(0,s\.jsx\)\("input",\{name:"lossAmount",value:i\.lossAmount,onChange:D,placeholder:"Monto aproximado en ARS o USD",className:M\}\)',
  '"si"===i.hasLoss&&(0,s.jsxs)("div",{className:"flex flex-col gap-2",children:[(0,s.jsxs)("div",{className:"flex gap-2",children:[(0,s.jsxs)("select",{name:"currency",value:i.currency,onChange:D,"aria-label":"Moneda",className:M,style:{width:"88px"},children:[(0,s.jsx)("option",{value:"ARS",children:"ARS"}),(0,s.jsx)("option",{value:"USD",children:"USD"})]}),(0,s.jsx)("input",{name:"lossAmount",value:i.lossAmount,onChange:D,disabled:!!i.amountUnknown,inputMode:"decimal",placeholder:"Monto aproximado en ARS o USD",className:M})]}),(0,s.jsxs)("label",{className:"flex items-center gap-2 text-[11px] text-slate-400",children:[(0,s.jsx)("input",{type:"checkbox",checked:!!i.amountUnknown,onChange:e=>o({...i,amountUnknown:e.target.checked,lossAmount:e.target.checked?"":i.lossAmount})}),"No sé el monto o prefiero no declararlo"]})]})')
parche('perdida-modal-monto', r'amount:i\.lossAmount\}', 'amount:i.amountUnknown?"no declarado":i.currency+" "+i.lossAmount}')
# O) Filtros del mapa sincronizados con los gráficos: la lista cruda queda en window.__raw y los filtros llaman a __aplicar()
parche('filtros-gancho', r'T\(t\.sort\(\(e,a\)=>L\.has\(a\.subcategory\)\?1:-1\)\)', 'window.__raw=t.sort((e,a)=>L.has(a.subcategory)?1:-1),window.__setInc=T,window.__aplicar?window.__aplicar():T(window.__raw)')

# P) Capas: se expone la instancia de Leaflet y se marcan los marcadores individuales del MVP (la capa 1 de SICAR-C los reemplaza por agrupaciones)
parche('exponer-mapa', r'(let a=e\.map\(n\.current,\{center:\[-38\.4,-63\.6\],zoom:4,zoomControl:!1,attributionControl:!1\}\);)', 'let a=e.map(n.current,{center:[-38.4,-63.6],zoom:4,zoomControl:!1,attributionControl:!1});window.__mapa=a;window.dispatchEvent(new Event("sicar-mapa"));')
parche('marcador-clase', r'className:"",iconSize:\[i,i\],iconAnchor:\[i/2,i/2\]', 'className:"sicar-inc",iconSize:[i,i],iconAnchor:[i/2,i/2]')
src = src.replace('setInterval(ld,3e4)', 'setInterval(ld,15e3)')
