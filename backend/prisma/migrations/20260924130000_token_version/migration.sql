-- Invalidar las sesiones al cambiar la contraseña (auditoría del 24-09).
-- Hasta ahora, cambiar o restablecer la contraseña no tocaba los JWT ya
-- emitidos: una sesión robada seguía valiendo los 7 días que dura el token.
-- El token pasa a llevar la versión con la que se emitió y el plugin de
-- autenticación la compara con esta columna.
--
-- Columna nueva con default: la revisión anterior del backend sigue
-- funcionando contra este esquema (expand), y los tokens ya emitidos —que no
-- llevan versión— se siguen aceptando mientras duren.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
