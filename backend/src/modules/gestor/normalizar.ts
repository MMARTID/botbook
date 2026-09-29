/** Sin acentos, en minúsculas y con los espacios colapsados: para comparar
 * lo que escribe el dueño (o el LLM) con nombres guardados — «Corte» con
 * «corte», «Maria José» con «María José». */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
