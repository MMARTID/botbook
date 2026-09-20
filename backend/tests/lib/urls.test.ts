import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appUrl, origenesPermitidos, webUrl } from "../../src/lib/urls.js";

const VARS = ["APP_URL", "WEB_URL", "FRONTEND_URL", "EXTRA_ALLOWED_ORIGIN"];
const previas: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) {
    previas[v] = process.env[v];
    delete process.env[v];
  }
});
afterEach(() => {
  for (const v of VARS) {
    if (previas[v] === undefined) delete process.env[v];
    else process.env[v] = previas[v];
  }
});

describe("urls", () => {
  it("sin variables, las dos apuntan a localhost:3001", () => {
    expect(appUrl()).toBe("http://localhost:3001");
    expect(webUrl("/register")).toBe("http://localhost:3001/register");
  });

  it("FRONTEND_URL sigue valiendo como respaldo de las dos, sin barra final", () => {
    process.env.FRONTEND_URL = "https://alhabla.ai/";
    expect(appUrl("/ajustes#whatsapp")).toBe(
      "https://alhabla.ai/ajustes#whatsapp"
    );
    expect(webUrl()).toBe("https://alhabla.ai");
  });

  it("APP_URL manda sobre FRONTEND_URL y WEB_URL sobre las dos", () => {
    process.env.FRONTEND_URL = "https://vieja.alhabla.ai";
    process.env.APP_URL = "https://app.alhabla.ai";
    expect(appUrl("/login")).toBe("https://app.alhabla.ai/login");
    expect(webUrl()).toBe("https://app.alhabla.ai");
    process.env.WEB_URL = "https://alhabla.ai";
    expect(webUrl("/blog")).toBe("https://alhabla.ai/blog");
  });

  it("CORS admite app, web y el origen extra, sin duplicados ni vacíos", () => {
    process.env.APP_URL = "https://app.alhabla.ai";
    process.env.WEB_URL = "https://alhabla.ai";
    process.env.EXTRA_ALLOWED_ORIGIN = " ";
    expect([...origenesPermitidos()]).toEqual([
      "https://app.alhabla.ai",
      "https://alhabla.ai",
    ]);
    process.env.EXTRA_ALLOWED_ORIGIN = "https://tunel.trycloudflare.com";
    expect(origenesPermitidos().has("https://tunel.trycloudflare.com")).toBe(
      true
    );
    delete process.env.WEB_URL;
    expect(origenesPermitidos().size).toBe(2);
  });
});
