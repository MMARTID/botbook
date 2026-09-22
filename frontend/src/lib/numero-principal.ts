/**
 * Copys de la pantalla «Usar Alhabla como número principal»
 * (app/ajustes/numero-principal). Viven aparte porque una página de Next.js
 * no puede exportar nada más que su componente y sus metadatos.
 */
export const TEXTO_SIN_MOVIL =
  "Sin tu móvil, tu recepcionista no puede pasarte llamadas: atendería todo ella. Añade primero tu móvil en Ajustes › Teléfono y vuelve aquí.";
export const TEXTO_MOVIL_FUERA_DE_ESPANA =
  "Tu recepcionista solo puede pasar llamadas a un móvil o fijo de España, y el móvil que tienes guardado no lo es. Cámbialo en Ajustes › Teléfono o deja que lo atienda todo ella.";
/** Caso C (o B con avisos al mismo móvil): la línea de siempre es el móvil
 * al que se pasarán las llamadas, así que no puede seguir desviada. */
export const TEXTO_MOVIL_SIN_DESVIO =
  "Es el móvil al que te pasará las llamadas tu recepcionista, así que no puede tener ningún desvío hacia el número de Alhabla: la llamada volvería a ella y tu móvil no sonaría nunca.";
export const TEXTO_QUITAR_DESVIOS =
  "Quita cualquier desvío que tuvieras en el móvil antes de confirmar. Este código anula todos los desvíos de una vez:";
/** Recordatorio en Ajustes › Teléfono cuando Alhabla ya es el principal. */
export const TEXTO_MOVIL_SIN_DESVIO_EN_AJUSTES =
  "Tu móvil no puede tener un desvío hacia el número de Alhabla: la llamada que te pase tu recepcionista volvería a ella y no te llegaría. Para anular todos los desvíos del móvil, marca ##002#.";
export const TEXTO_SIN_NUMERO =
  "Todavía no tienes un número de Alhabla activo. En cuanto lo tengas, aquí podrás usarlo como número principal.";
export const TEXTO_YA_ES_PRINCIPAL =
  "Tu número de Alhabla ya es tu número principal. Puedes cambiar cuándo te pasa llamadas desde Ajustes › Teléfono.";
