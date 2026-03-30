-- MIGRACION V4.3: Disponibilidad Granular
-- Ejecutar en Supabase SQL Editor

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS custom_availability JSONB DEFAULT '{
  "1": {"enabled": true, "start": "09:00", "end": "18:00"},
  "2": {"enabled": true, "start": "09:00", "end": "18:00"},
  "3": {"enabled": true, "start": "09:00", "end": "18:00"},
  "4": {"enabled": true, "start": "09:00", "end": "18:00"},
  "5": {"enabled": true, "start": "09:00", "end": "18:00"},
  "6": {"enabled": true, "start": "09:00", "end": "12:00"},
  "0": {"enabled": false, "start": "00:00", "end": "00:00"}
}'::jsonb;

COMMENT ON COLUMN businesses.custom_availability IS 'Horarios especificos por dia de la semana (0=Dom, 1=Lun, etc)';
