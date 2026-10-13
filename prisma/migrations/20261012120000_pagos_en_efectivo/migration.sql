-- Hasta hoy todo se ha cobrado en efectivo (confirmado por el equipo,
-- 2026-10-12). La migración del sistema viejo y el alta de contratos marcaban
-- los cobros como transferencia por omisión.
--
-- Solo cobros (ingresos). Devoluciones y traspasos no son dinero que entró y
-- se quedan como están: pasarlos a efectivo los metería al corte diario de
-- quien los registró.
UPDATE "payments" SET "paymentMethod" = 'CASH'
WHERE "paymentMethod" = 'TRANSFER'
  AND "paymentType" IN ('DOWN_PAYMENT', 'INSTALLMENT', 'EXTRA_PAYMENT', 'RESERVATION_DEPOSIT', 'ADJUSTMENT');
