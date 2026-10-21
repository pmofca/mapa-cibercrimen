CREATE TABLE reportes (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  creado_utc TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('pendiente_revision','publicada','rechazada')),
  motivo_retencion TEXT,
  tipo TEXT NOT NULL, severidad TEXT NOT NULL, provincia TEXT NOT NULL,
  localidad TEXT, medio TEXT,
  perdida_economica INTEGER NOT NULL DEFAULT 0,
  descripcion TEXT NOT NULL,
  evidencia_clave TEXT, evidencia_tipo TEXT
);
CREATE INDEX idx_reportes_publico ON reportes (estado, provincia, tipo);
CREATE INDEX idx_reportes_fecha ON reportes (creado_utc);
CREATE TABLE limite (clave TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX idx_limite ON limite (clave, ts);
