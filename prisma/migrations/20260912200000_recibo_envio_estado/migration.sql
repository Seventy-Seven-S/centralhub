-- Desenlace del envío del recibo por correo.
-- Antes no se guardaba nada: si Resend fallaba, el error moría en el log del
-- servidor y nadie sabía que el cliente no recibió su comprobante.
CREATE TYPE "EnvioReciboEstado" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLO', 'SIN_CORREO');

ALTER TABLE "recibo_logs"
  ADD COLUMN "envioEstado"   "EnvioReciboEstado" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "envioDestino"  TEXT,
  ADD COLUMN "envioError"    TEXT,
  ADD COLUMN "envioAt"       TIMESTAMP(3),
  ADD COLUMN "envioIntentos" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "recibo_logs_envioEstado_idx" ON "recibo_logs"("envioEstado");
