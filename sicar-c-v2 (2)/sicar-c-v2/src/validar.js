import { TAX } from './taxonomia.js';
const limpiar = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : '');

// Interpreta montos en formato es-AR ("1.500.000", "1500000,50", "$ 50.000"). Devuelve número o null.
export function parsearMonto(txt) {
  let t = txt.replace(/u\$s|usd|ars|\$|\s/gi, '');
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 1e12 ? Math.round(n * 100) / 100 : null;
}

export function validar(f) {
  const v = {};
  for (const k of ['category', 'subcategory', 'province', 'severity', 'description', 'locality', 'medium', 'hasLoss', 'lossAmount', 'currency', 'token']) v[k] = limpiar(f?.[k]);
  v.amountUnknown = f?.amountUnknown === true || f?.amountUnknown === 'true';
  const e = {};
  if (!TAX.categorias.includes(v.category)) e.category = 'Seleccioná el tipo de amenaza.';
  if (v.subcategory && !(TAX.subcategorias[v.category] || []).includes(v.subcategory)) e.subcategory = 'La subcategoría no corresponde al tipo de amenaza.';
  if (!TAX.severidades.includes(v.severity)) e.severity = 'Seleccioná la severidad.';
  if (!TAX.provincias.includes(v.province)) e.province = 'Seleccioná la provincia.';
  if (v.locality.length > 80) e.locality = 'La localidad no puede superar los 80 caracteres.';
  if (v.medium && !TAX.medios.includes(v.medium)) e.medium = 'Seleccioná una opción de la lista.';
  if (!['si', 'no'].includes(v.hasLoss)) e.hasLoss = 'Indicá si tuviste una pérdida económica.';
  // Pérdida económica: combinaciones válidas
  let perdida = 0, monto_estado = 'sin_perdida', monto_valor = null, moneda = null;
  if (v.hasLoss === 'si') {
    perdida = 1;
    if (!TAX.monedas.includes(v.currency || 'ARS')) e.currency = 'La moneda debe ser ARS o USD.';
    else if (v.amountUnknown || !v.lossAmount) monto_estado = 'no_declarado';
    else {
      const n = parsearMonto(v.lossAmount);
      if (n === null) e.lossAmount = 'Ingresá un monto numérico válido, o marcá que no lo sabés.';
      else { monto_estado = 'declarado'; monto_valor = n; moneda = v.currency || 'ARS'; }
    }
  }
  if (v.description.length < 20) e.description = 'Describí el evento con al menos 20 caracteres.';
  else if (v.description.length > 3000) e.description = 'La descripción no puede superar los 3000 caracteres.';
  if (!/^[0-9a-f-]{36}$/i.test(v.token)) e.token = 'Solicitud no válida. Recargá la página e intentá de nuevo.';
  return { ok: Object.keys(e).length === 0, errores: e, datos: { ...v, perdida, monto_estado, monto_valor, moneda } };
}

const SENSIBLES = new Set(['Acoso']); // acoso, extorsión, difusión de contenido íntimo: siempre revisión
const PII = [/[\w.+-]+@[\w-]+\.[\w.]+/, /\b\d{7,}\b/, /\+?\d[\d\s().-]{8,}\d/, /https?:\/\//i];
export function decidirPublicacion(d, autoPublicar) {
  if (SENSIBLES.has(d.category)) return { estado: 'pendiente_revision', motivo: 'categoria_sensible' };
  if (PII.some((r) => r.test(d.description) || r.test(d.locality))) return { estado: 'pendiente_revision', motivo: 'posibles_datos_personales' };
  if (!autoPublicar) return { estado: 'pendiente_revision', motivo: 'publicacion_automatica_desactivada' };
  return { estado: 'publicada', motivo: null };
}
