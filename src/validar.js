import { PROVINCIAS } from './provincias.js';
// Categorías = taxonomía UFECI 2024 (verificada en el informe). Severidad y medio: PROVISORIOS hasta confirmar las opciones del formulario de referencia.
export const TIPOS = ['Fraude en línea', 'Usurpación de identidad', 'Acceso ilegítimo', 'Phishing', 'Acoso', 'Otros'];
export const SEVERIDADES = ['Baja', 'Media', 'Alta', 'Crítica'];
export const MEDIOS = ['WhatsApp', 'Correo electrónico', 'SMS', 'Llamada telefónica', 'Redes sociales', 'Sitio web o marketplace', 'Otro'];
const limpiar = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : '');

export function validar(f) {
  const v = Object.fromEntries(['tipo', 'severidad', 'provincia', 'localidad', 'medio', 'perdida', 'descripcion', 'token'].map((k) => [k, limpiar(f[k])]));
  const e = {};
  if (!TIPOS.includes(v.tipo)) e.tipo = 'Seleccioná el tipo de amenaza.';
  if (!SEVERIDADES.includes(v.severidad)) e.severidad = 'Seleccioná la severidad.';
  if (!(v.provincia in PROVINCIAS)) e.provincia = 'Seleccioná la provincia.';
  if (v.localidad.length > 80) e.localidad = 'La localidad no puede superar los 80 caracteres.';
  if (v.medio && !MEDIOS.includes(v.medio)) e.medio = 'Seleccioná una opción de la lista.';
  if (!['', 'si', 'no'].includes(v.perdida)) e.perdida = 'Respuesta no válida.';
  if (v.descripcion.length < 20) e.descripcion = 'Describí el hecho con al menos 20 caracteres.';
  else if (v.descripcion.length > 3000) e.descripcion = 'La descripción no puede superar los 3000 caracteres.';
  if (!/^[0-9a-f-]{36}$/i.test(v.token)) e.token = 'Solicitud no válida. Recargá la página e intentá de nuevo.';
  return { ok: Object.keys(e).length === 0, errores: e, datos: v };
}

const SENSIBLES = new Set(['Acoso']);
const PII = [/[\w.+-]+@[\w-]+\.[\w.]+/, /\b\d{7,}\b/, /\+?\d[\d\s().-]{8,}\d/, /https?:\/\//i];
// Política conservadora: sólo se publica (como conteo provincial) lo que no es sensible ni contiene datos personales/enlaces.
export function decidirPublicacion(d, autoPublicar) {
  if (SENSIBLES.has(d.tipo)) return { estado: 'pendiente_revision', motivo: 'categoria_sensible' };
  if (PII.some((r) => r.test(d.descripcion) || r.test(d.localidad))) return { estado: 'pendiente_revision', motivo: 'posibles_datos_personales' };
  if (!autoPublicar) return { estado: 'pendiente_revision', motivo: 'publicacion_automatica_desactivada' };
  return { estado: 'publicada', motivo: null };
}
