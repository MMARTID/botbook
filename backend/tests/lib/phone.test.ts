import { describe, it, expect } from "vitest";
import {
  formatearTelefonoLegible,
  isValidE164Phone,
} from "../../src/lib/phone.js";

describe("formatearTelefonoLegible", () => {
  it("+34930454394 → +34 930 454 394; otros tal cual", () => {
    expect(formatearTelefonoLegible("+34930454394")).toBe("+34 930 454 394");
    expect(formatearTelefonoLegible("+34692138456")).toBe("+34 692 138 456");
    expect(formatearTelefonoLegible("+33612345678")).toBe("+33612345678");
    expect(formatearTelefonoLegible("+3493045439")).toBe("+3493045439");
    expect(formatearTelefonoLegible("TEMP-abc")).toBe("TEMP-abc");
  });
});

describe("isValidE164Phone", () => {
  it("acepta E.164 y rechaza el resto", () => {
    expect(isValidE164Phone("+34600123456")).toBe(true);
    expect(isValidE164Phone("600123456")).toBe(false);
    expect(isValidE164Phone("+34 600 123 456")).toBe(false);
  });
});
