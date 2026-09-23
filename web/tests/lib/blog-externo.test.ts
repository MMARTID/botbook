import { describe, expect, it, vi } from "vitest";
import { esImagenRemota, type ArticuloMeta } from "@/lib/blog";

describe("blog externo (BabyLoveGrowth)", () => {
  it("sin BABYLOVEGROWTH_BLOG_API_KEY el blog externo no existe y no se llama a nadie", async () => {
    // El entorno de tests no define la clave: el módulo tiene que comportarse
    // como «no hay artículos externos», no lanzar ni intentar una petición.
    const externo = await import("@/lib/blog-externo");
    expect(externo.HAY_BLOG_EXTERNO).toBe(false);
    await expect(externo.listarArticulosExternos()).resolves.toEqual([]);
    await expect(externo.leerArticuloExterno("lo-que-sea")).resolves.toBeNull();
  });

  it("distingue la foto del CDN externo de la del repositorio", () => {
    expect(esImagenRemota("https://cdn.babylovegrowth.ai/foto.jpg")).toBe(true);
    expect(esImagenRemota("/blog/mi-articulo/portada.jpg")).toBe(false);
  });

  it("mezcla por fecha y, si un slug está en los dos sitios, gana el del repositorio", async () => {
    const externos: ArticuloMeta[] = [
      {
        // Mismo slug que el artículo real del repositorio: tiene que perder.
        slug: "cuantas-llamadas-pierde-una-peluqueria",
        titulo: "Título de BabyLoveGrowth",
        resumen: "",
        fecha: "2026-09-30",
        autor: "Equipo de Alhabla",
        minutosDeLectura: 4,
        idioma: "es",
        origen: "babylovegrowth",
      },
      {
        slug: "articulo-solo-de-babylovegrowth",
        titulo: "Solo en BabyLoveGrowth",
        resumen: "",
        fecha: "2026-09-29",
        autor: "Equipo de Alhabla",
        minutosDeLectura: 4,
        idioma: "es",
        origen: "babylovegrowth",
      },
    ];
    vi.doMock("@/lib/blog-externo", () => ({
      listarArticulosExternos: async () => externos,
    }));
    vi.resetModules();
    const { listarTodosLosArticulos: listar, listarArticulos } = await import("@/lib/blog");
    const propios = listarArticulos();
    const todos = await listar();

    // Ningún slug repetido, y los del repositorio siguen todos ahí.
    expect(new Set(todos.map((a) => a.slug)).size).toBe(todos.length);
    for (const propio of propios) {
      expect(todos.find((a) => a.slug === propio.slug)?.origen).toBe("propio");
    }
    // El duplicado se cae y el que solo existe fuera entra.
    expect(todos.find((a) => a.slug === "cuantas-llamadas-pierde-una-peluqueria")?.origen).toBe("propio");
    expect(todos.find((a) => a.slug === "articulo-solo-de-babylovegrowth")?.origen).toBe("babylovegrowth");
    expect([...todos].sort((a, b) => b.fecha.localeCompare(a.fecha))).toEqual(todos);
    vi.doUnmock("@/lib/blog-externo");
  });
});
