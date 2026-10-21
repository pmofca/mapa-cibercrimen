# SICAR-C V2
Interfaz recuperada del MVP (Next.js compilado + Recharts + Leaflet) sobre un Worker de Cloudflare con D1.

- `public/` — interfaz del MVP con parches verificables (`tools/parchear.py`), capas/filtros/línea de tiempo (`capas.js`, `nucleo.js`, `capas.css`) y portal interno (`interno/`).
- `src/` — Worker: `/api/incidents` (GET público seguro / POST con validación, límite por IP y publicación automática condicionada),
  `/api/estadisticas` (agregados públicos), `/api/interno/*` y `/interno` (portal, protegido por Cloudflare Access), `/config.js` (taxonomía única).
- `src/taxonomia.js` — fuente única de categorías (UFECI/MPF, informe 2024), subcategorías, severidades, medios, provincias y monedas.
  Las subcategorías, severidades y medios son **operativas de SICAR-C** (heredadas del MVP), no una clasificación de UFECI.
- `migrations/` — 0001 a 0003 (no destructivas). `test/` — pruebas unitarias. `tools/prueba/` — prueba de extremo a extremo en navegador (Worker real + D1 simulado).

## Configuración en Cloudflare
- Secreto `SALT` (obligatorio): huella de IP para el límite de frecuencia.
- Portal interno: crear una aplicación de Cloudflare Access que proteja `/interno*` y `/api/interno/*` y cargar `ACCESS_TEAM_DOMAIN`
  (p. ej. `ofca.cloudflareaccess.com`), `ACCESS_AUD` (Application Audience Tag) y `ADMIN_EMAILS` (correos autorizados, separados por comas).
  El Worker valida el JWT de Access en el servidor; sin esas variables el portal permanece cerrado.
- `LIMITE_HORA` y `AUTO_PUBLICAR` en `wrangler.toml`. Evidencias (R2): descomentar el bloque `r2_buckets` cuando R2 esté activo.
- Mapa base: OpenFreeMap (sin clave) vía MapLibre GL + maplibre-gl-leaflet.

## Estados
`pendiente_revision` → `publicada` | `rechazada` (se conservan los valores existentes en D1). Cada decisión queda en la tabla `auditoria`.

## Mapa de tres capas y time-lapse
- Capa 1: reportes ciudadanos publicados agrupados por provincia (ubicación aproximada = capital provincial). Capa 2: intensidad por provincia (cantidad, no tasa).
  Capa 3: línea de tiempo, comparación de intervalos y series. Todo se calcula en `public/nucleo.js` (probado en `test/nucleo.test.js`) sobre `/api/incidents`.
- Fecha utilizada: fecha de CARGA del reporte (el formulario no pide fecha del hecho). Zona horaria: Argentina (UTC-3).
- Fuente alternativa en la línea de tiempo: Informe UFECI 2024 (nacional, mensual, sin ubicación): anima indicadores, no el mapa.
- Límites conocidos: no hay geometrías provinciales verificadas (no hay coropletas), ni datos por departamento/partido/comuna, ni ubicaciones precisas.
- Pruebas locales: `npm test` (unitarias) y, con `node tools/prueba/servidor.mjs`, `python3 tools/prueba/e2e.py` y `e2e_capas.py` (Chromium; D1 simulado y Leaflet simulado).
  Los datos sintéticos del servidor de prueba existen sólo allí y nunca se publican.
