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

describe("limpiarHtml", () => {
  const hero = "https://media.babylovegrowth.ai/blog-images/organization-55595/1790119610252_Ilustracion.jpeg";

  it("quita el <h1> y la foto de cabecera repetidos al principio", async () => {
    const { limpiarHtml } = await import("@/lib/blog-externo");
    const html = `<h1 id="whatsapp" tabindex="-1">WhatsApp Business para citas</h1>\n<p><img src="${hero}" alt="Ilustración"></p>\n<p>Primer párrafo.</p>`;
    const limpio = limpiarHtml(html, hero);
    expect(limpio).not.toContain("<h1");
    expect(limpio).not.toContain(hero);
    expect(limpio.startsWith("<p>Primer párrafo.")).toBe(true);
  });

  it("no toca un <h1> ni la foto si aparecen en medio del artículo", async () => {
    const { limpiarHtml } = await import("@/lib/blog-externo");
    const html = `<p>Intro.</p><h1>Un h1 en medio</h1><p><img src="${hero}"></p>`;
    const limpio = limpiarHtml(html, hero);
    expect(limpio).toContain("<h1>Un h1 en medio</h1>");
    expect(limpio).toContain(hero);
  });

  it("difiere la carga de las imágenes del cuerpo sin pisar las que ya lo declaran", async () => {
    const { limpiarHtml } = await import("@/lib/blog-externo");
    const limpio = limpiarHtml('<p><img src="a.jpg"></p><p><img loading="eager" src="b.jpg"></p>');
    expect(limpio).toContain('<img loading="lazy" src="a.jpg">');
    expect(limpio).toContain('<img loading="eager" src="b.jpg">');
  });

  it("aguanta un artículo sin h1 ni foto de cabecera", async () => {
    const { limpiarHtml } = await import("@/lib/blog-externo");
    expect(limpiarHtml("<p>Solo texto.</p>")).toBe("<p>Solo texto.</p>");
  });
});
