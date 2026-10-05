-- Idiomas de la recepcionista (2026-10-05): `agentSettings.voiceLanguage`
-- pasa a ser solo el idioma en que saluda y, con catalán, euskera o gallego
-- activo, el dueño elige si descuelga en esa lengua o en castellano
-- (normalizarIdiomas en src/lib/idiomas/ajustes.ts).
--
-- Hasta ahora, con una lengua cooficial activa la recepcionista saludaba
-- siempre en ella, dijera lo que dijera el JSON guardado: la regla anterior
-- corregía el saludo al leer, sin reescribir el JSON. Un negocio que guardó
-- `languages` con una cooficial y `voiceLanguage: "es-ES"` (posible del
-- 2026-09-11 al 2026-10-02) o sin `voiceLanguage`, y no ha vuelto a guardar,
-- saluda hoy en la cooficial; con la regla nueva saludaría en castellano sin
-- haberlo elegido (otro saludo, otro hash del payload de Telnyx, y el
-- reconciliador lo reescribiría al desplegar).
--
-- Esta migración guarda en esos negocios el saludo que ya tienen: la primera
-- cooficial activa en orden canónico (catalán, euskera, gallego), la misma
-- que elegía la regla anterior. Solo toca los que tienen alguna cooficial en
-- `languages` y no saludan ya en una de ellas; el resto queda igual. Solo
-- datos, sin cambios de esquema. Una sola sentencia: el test de integración
-- tests/integration/idiomas/saludoEnLaCooficial.test.ts la vuelve a
-- ejecutar sobre negocios de prueba.
UPDATE "businesses"
SET "agentSettings" = jsonb_set(
  "agentSettings",
  '{voiceLanguage}',
  CASE
    WHEN "agentSettings"->'languages' @> '["ca-ES"]'::jsonb THEN '"ca-ES"'::jsonb
    WHEN "agentSettings"->'languages' @> '["eu-ES"]'::jsonb THEN '"eu-ES"'::jsonb
    ELSE '"gl-ES"'::jsonb
  END
)
WHERE jsonb_typeof("agentSettings") = 'object'
  AND jsonb_typeof("agentSettings"->'languages') = 'array'
  AND (
    "agentSettings"->'languages' @> '["ca-ES"]'::jsonb
    OR "agentSettings"->'languages' @> '["eu-ES"]'::jsonb
    OR "agentSettings"->'languages' @> '["gl-ES"]'::jsonb
  )
  AND NOT (
    jsonb_typeof("agentSettings"->'voiceLanguage') = 'string'
    AND "agentSettings"->>'voiceLanguage' IN ('ca-ES', 'eu-ES', 'gl-ES')
    AND "agentSettings"->'languages' @> jsonb_build_array("agentSettings"->>'voiceLanguage')
  );
