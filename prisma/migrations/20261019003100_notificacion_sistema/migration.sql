-- Avisos del propio sistema (p. ej. que el correo dejó de salir). No son de un
-- apartado, contrato ni pago, y meterlos en uno de esos tipos confundiría al
-- que los lea.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM';
