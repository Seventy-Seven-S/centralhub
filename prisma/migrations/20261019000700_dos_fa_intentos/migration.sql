-- Intentos fallidos del código 2FA vigente: al quinto se invalida el código.
ALTER TABLE "users" ADD COLUMN "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0;
