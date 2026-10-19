-- Enlace de activación de un solo uso para el portal de clientes: reemplaza la
-- contraseña inicial adivinable (apellido + teléfono) que viajaba en claro en
-- el correo de bienvenida.
ALTER TABLE "client_users" ADD COLUMN "activationTokenHash" TEXT;
ALTER TABLE "client_users" ADD COLUMN "activationTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "client_users" ADD COLUMN "activationTokenUsedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "client_users_activationTokenHash_key" ON "client_users"("activationTokenHash");
