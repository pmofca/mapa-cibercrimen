# SICAR-C (primera versión)
Worker de Cloudflare + D1 (reportes) + R2 (evidencia privada). Sin dependencias en tiempo de ejecución.

## Puesta en marcha (una sola vez)
1. `npm install` y `npx wrangler login` (autorización en tu cuenta, desde tu máquina).
2. `npx wrangler d1 create sicar-c` → copiá el `database_id` en `wrangler.toml`.
3. `npx wrangler r2 bucket create sicar-c-evidencia`
4. `npx wrangler secret put SALT` (cualquier cadena larga y aleatoria; sirve para anonimizar IP).
5. Pedí una clave gratuita de CARTO (https://carto.com/basemaps/apikey) y pegala en `CARTO_KEY` de `wrangler.toml`.
6. `npm run db:migrar` y `npm run deploy`. La URL queda en `*.workers.dev`.
Desarrollo local: `npm run db:migrar:local` y `npm run dev`. Pruebas: `npm test`.

## Revisar reportes pendientes (sin portal todavía)
`npx wrangler d1 execute sicar-c --remote --command "SELECT id,creado_utc,tipo,provincia,motivo_retencion FROM reportes WHERE estado='pendiente_revision'"`
Cambiar estado: `UPDATE reportes SET estado='publicada' WHERE id='...'`.

## Pendiente (no implementado)
Portal interno autenticado, ingesta automática, opciones exactas de los selects del formulario de referencia, límites/umbrales de publicación definitivos, Leaflet alojado localmente con SRI.
