import { describe, expect, it } from "vitest";
import {
  esDestinoInterno,
  etiquetaDeRama,
  urlDePrevisualizacion,
} from "@/lib/preview/url";

describe("vista previa del blog", () => {
  it("convierte la rama al subdominio de Vercel", () => {
    expect(etiquetaDeRama("blog/Cuántas llamadas")).toBe(
      "blog-cu-ntas-llamadas"
    );
    expect(etiquetaDeRama("blog/" + "a".repeat(80)).length).toBeLessThanOrEqual(
      63 - "alhabla-web-git-".length - "-mmartids-projects".length
    );
  });

  it("main va a la web publicada; otra rama a su despliegue; en local a la ruta", () => {
    const entorno = { enVercel: true, sitio: "https://alhabla.ai" };
    expect(urlDePrevisualizacion("main", "/blog/x", entorno)).toBe(
      "https://alhabla.ai/blog/x"
    );
    expect(urlDePrevisualizacion("blog/x", "/blog/x", entorno)).toBe(
      "https://alhabla-web-git-blog-x-mmartids-projects.vercel.app/blog/x"
    );
    expect(
      urlDePrevisualizacion("blog/x", "/blog/x", { enVercel: false, sitio: "" })
    ).toBe("/blog/x");
  });

  it("solo acepta destinos internos", () => {
    expect(esDestinoInterno("/blog/x")).toBe(true);
    expect(esDestinoInterno("//evil.example")).toBe(false);
    expect(esDestinoInterno("https://evil.example")).toBe(false);
  });
});
