import { describe, expect, it } from "vitest";
import {
  errorPrevioDeApple,
  normalizarContrasenaDeApp,
  pareceContrasenaDeApp,
} from "@/lib/apple-app-password";

describe("apple-app-password", () => {
  it("normaliza guiones, espacios y mayúsculas al formato de Apple", () => {
    expect(normalizarContrasenaDeApp("ABCD-EFGH-IJKL-MNOP")).toBe(
      "abcd-efgh-ijkl-mnop"
    );
    expect(normalizarContrasenaDeApp("abcdefghijklmnop")).toBe(
      "abcd-efgh-ijkl-mnop"
    );
    expect(normalizarContrasenaDeApp(" abcd efgh ijkl mnop ")).toBe(
      "abcd-efgh-ijkl-mnop"
    );
  });

  it("deja tal cual (recortado) lo que no tiene 16 letras, para que lo juzgue el servidor", () => {
    expect(normalizarContrasenaDeApp(" otra-cosa ")).toBe("otra-cosa");
    expect(pareceContrasenaDeApp("otra-cosa")).toBe(false);
  });

  it("errorPrevioDeApple: primero el Apple ID, luego la contraseña, luego nada", () => {
    expect(errorPrevioDeApple("pelu", "abcd-efgh-ijkl-mnop")).toMatch(
      /correo completo/
    );
    expect(errorPrevioDeApple("pelu@icloud.com", "Secreta2026!")).toMatch(
      /no parece/
    );
    expect(
      errorPrevioDeApple("pelu@icloud.com", "ABCDEFGHIJKLMNOP")
    ).toBeNull();
  });
});
