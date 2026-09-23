-- El token de sesión se borraba en el instante en que se usaba para renovar.
-- Con dos pestañas abiertas, la segunda llegaba con un token ya gastado y
-- sacaba a la persona del sistema en plena captura. Ahora se marca cuándo se
-- rotó y se acepta unos segundos más.
ALTER TABLE "refresh_tokens" ADD COLUMN "rotated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
