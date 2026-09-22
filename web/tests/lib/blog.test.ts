import { describe, expect, it } from "vitest";
import {
  articulosRelacionados,
  minutosDeLectura,
  type ArticuloMeta,
} from "@/lib/blog";

function meta(
  slug: string,
  sector?: string,
  fecha = "2026-09-01"
): ArticuloMeta {
  return {
    slug,
    titulo: slug,
    resumen: "",
    fecha,
    autor: "Equipo de Alhabla",
    sector,
    minutosDeLectura: 1,
  };
}

describe("blog", () => {
  it("estima los minutos de lectura a 200 palabras por minuto, mínimo 1", () => {
    expect(minutosDeLectura("hola")).toBe(1);
    expect(minutosDeLectura(Array(450).fill("palabra").join(" "))).toBe(2);
    // La sintaxis de Markdown no cuenta como palabras.
    expect(minutosDeLectura("## Título\n\n- **negrita** _cursiva_")).toBe(1);
  });

  it("«Sigue leyendo»: primero el mismo sector, luego el resto, nunca el propio", () => {
    const todos = [
      meta("a", "barberia", "2026-09-05"),
      meta("b", "peluqueria", "2026-09-04"),
      meta("c", "barberia", "2026-09-03"),
      meta("d", undefined, "2026-09-02"),
      meta("e", "fisioterapia", "2026-09-01"),
    ];
    expect(
      articulosRelacionados(meta("a", "barberia"), todos).map((a) => a.slug)
    ).toEqual(["c", "b", "d"]);
    expect(
      articulosRelacionados(meta("d"), todos, 2).map((a) => a.slug)
    ).toEqual(["a", "b"]);
  });
});
