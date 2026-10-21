ALTER TABLE reportes ADD COLUMN moneda TEXT;
ALTER TABLE reportes ADD COLUMN monto_valor REAL;
ALTER TABLE reportes ADD COLUMN monto_estado TEXT NOT NULL DEFAULT 'sin_perdida';
ALTER TABLE reportes ADD COLUMN revisado_por TEXT;
ALTER TABLE reportes ADD COLUMN revisado_utc TEXT;
ALTER TABLE reportes ADD COLUMN observaciones TEXT;
CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_utc TEXT NOT NULL, usuario TEXT NOT NULL, accion TEXT NOT NULL,
  reporte_id TEXT NOT NULL, estado_anterior TEXT, estado_nuevo TEXT, observacion TEXT
);
CREATE INDEX idx_auditoria_reporte ON auditoria (reporte_id, creado_utc);
CREATE INDEX idx_reportes_estado_fecha ON reportes (estado, creado_utc);
CREATE INDEX idx_reportes_perdida ON reportes (perdida_economica, moneda);
