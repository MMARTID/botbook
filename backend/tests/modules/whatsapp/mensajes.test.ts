import { describe, it, expect, afterEach } from "vitest";
import {
  ayudaDueno,
  bajaDueno,
  bienvenidaTrasAlta,
  clienteConocido,
  listarNegocios,
  panelUrl,
  yaActivo,
} from "../../../src/modules/whatsapp/mensajes.js";

describe("listarNegocios", () => {
  it("uno, dos y tres negocios", () => {
    expect(listarNegocios(["Peluquería Ana"])).toBe("Peluquería Ana");
    expect(listarNegocios(["Peluquería Ana", "Barbería Ana"])).toBe(
      "Peluquería Ana y Barbería Ana"
    );
    expect(listarNegocios(["A", "B", "C"])).toBe("A, B y C");
    expect(listarNegocios([])).toBe("");
  });
});

describe("copy del número de negocios", () => {
  it("la bienvenida tras el alta solo menciona el panel cuando se apuntó otro móvil", () => {
    const sinCambio = bienvenidaTrasAlta({
      negocios: ["Peluquería Ana"],
      movilApuntado: false,
    });
    expect(sinCambio).toContain("recepcionista de Peluquería Ana");
    expect(sinCambio).toContain("STOP");
    expect(sinCambio).not.toContain("He apuntado este móvil");

    const conCambio = bienvenidaTrasAlta({
      negocios: ["Peluquería Ana", "Barbería Ana"],
      movilApuntado: true,
    });
    expect(conCambio).toContain("Peluquería Ana y Barbería Ana");
    expect(conCambio.split("\n")[2]).toBe(
      "He apuntado este móvil en tu panel, en Ajustes › WhatsApp."
    );
  });

  it("la ayuda lleva el enlace al panel y los tres comandos", () => {
    const texto = ayudaDueno({
      negocios: ["Peluquería Ana"],
      panelUrl: "https://alhabla.ai/ajustes#whatsapp",
    });
    expect(texto).toContain("https://alhabla.ai/ajustes#whatsapp");
    expect(texto).toContain("AYUDA:");
    expect(texto).toContain("STOP:");
    expect(texto).toContain("ALTA:");
  });

  it("baja y ya activo nombran los negocios pasados", () => {
    expect(bajaDueno({ negocios: ["A", "B"] })).toContain("avisos de A y B");
    expect(yaActivo({ negocios: ["A"] })).toContain(
      "Los avisos de A ya están activos"
    );
  });
});

describe("copy del número de clientes", () => {
  it("cliente conocido con y sin teléfono válido del negocio", () => {
    expect(
      clienteConocido({ negocio: "Peluquería Ana", telefono: "+34930000000" })
    ).toContain("llama al negocio al +34930000000");
    expect(
      clienteConocido({ negocio: "Peluquería Ana", telefono: null })
    ).toContain("llama directamente al negocio");
  });
});

describe("panelUrl", () => {
  const original = process.env.FRONTEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it("usa FRONTEND_URL y cae a alhabla.ai", () => {
    process.env.FRONTEND_URL = "http://localhost:3001";
    expect(panelUrl()).toBe("http://localhost:3001/ajustes#whatsapp");
    delete process.env.FRONTEND_URL;
    expect(panelUrl()).toBe("https://alhabla.ai/ajustes#whatsapp");
  });
});
