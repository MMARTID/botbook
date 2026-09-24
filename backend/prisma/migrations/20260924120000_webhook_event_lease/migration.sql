-- Reintentos de webhooks que no se pierden (auditoría de seguridad, 24-09).
-- Antes la fila se creaba al recibir el evento y ya contaba como visto: si el
-- procesado fallaba, el reintento del proveedor chocaba con la unicidad y
-- recibía «200 deduped», así que el evento se perdía. Ahora la fila lleva el
-- estado del intento en curso: `claimedAt` es el lease (un `processing`
-- caducado se puede reclamar) y `attempts` cuenta los intentos.
--
-- Solo columnas nuevas, las dos con valor por defecto o nulas: la revisión
-- anterior del backend sigue funcionando contra este esquema (expand).
ALTER TABLE "voice_webhook_events" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "voice_webhook_events" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Los eventos que quedaron en `error` con el comportamiento antiguo no se
-- tocan: el proveedor ya no los va a reintentar y reclamarlos no serviría de
-- nada. Quedan como registro de lo que se perdió.
