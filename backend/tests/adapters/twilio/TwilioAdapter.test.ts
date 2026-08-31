import { describe, it, expect, vi, beforeEach } from "vitest";
import { TwilioAdapter } from "../../../src/adapters/twilio/TwilioAdapter.js";

const mockLocalList = vi.fn();
const mockMobileList = vi.fn();
const mockNationalList = vi.fn();
const mockIncomingPhoneNumbersCreate = vi.fn();
const mockIncomingPhoneNumbersRemove = vi.fn();
const mockIncomingPhoneNumbersFetch = vi.fn();

const mockTwilioClient = {
  availablePhoneNumbers: vi.fn(() => ({
    local: { list: mockLocalList },
    mobile: { list: mockMobileList },
    national: { list: mockNationalList },
  })),
  incomingPhoneNumbers: Object.assign(
    vi.fn(() => ({
      remove: mockIncomingPhoneNumbersRemove,
      fetch: mockIncomingPhoneNumbersFetch,
    })),
    { create: mockIncomingPhoneNumbersCreate }
  ),
};

vi.mock("../../../src/lib/twilio.js", () => ({
  getTwilioClient: vi.fn(() => mockTwilioClient),
}));

describe("TwilioAdapter", () => {
  let adapter: TwilioAdapter;

  beforeEach(() => {
    adapter = new TwilioAdapter();
    vi.clearAllMocks();
  });

  describe("searchAvailableNumbers", () => {
    it("returns local numbers when available", async () => {
      mockLocalList.mockResolvedValue([
        { phoneNumber: "+34910000001", friendlyName: "Madrid", locality: "Madrid", region: "Madrid", addressRequirements: "none" },
      ]);

      const results = await adapter.searchAvailableNumbers("ES", { limit: 1 });

      expect(results).toHaveLength(1);
      expect(results[0].phoneNumber).toBe("+34910000001");
      expect(results[0].addressRequirements).toBe("none");
      expect(mockLocalList).toHaveBeenCalledWith({ limit: 1 });
    });

    it("propaga addressRequirements distinto de 'none' sin filtrarlo (la política vive en phone/service.ts)", async () => {
      mockLocalList.mockResolvedValue([
        { phoneNumber: "+34910000003", friendlyName: "Bilbao", locality: "Bilbao", region: "Bilbao", addressRequirements: "local" },
      ]);

      const results = await adapter.searchAvailableNumbers("ES");

      expect(results[0].addressRequirements).toBe("local");
    });

    it("no cae a mobile/national si local falla — España prohíbe esos tipos para revendedores", async () => {
      mockLocalList.mockRejectedValue(new Error("No local numbers"));

      await expect(adapter.searchAvailableNumbers("ES")).rejects.toThrow("No local numbers");

      expect(mockMobileList).not.toHaveBeenCalled();
      expect(mockNationalList).not.toHaveBeenCalled();
    });
  });

  describe("purchaseNumber", () => {
    it("purchases a phone number and returns sid and phoneNumber", async () => {
      mockIncomingPhoneNumbersCreate.mockResolvedValue({
        sid: "PN123",
        phoneNumber: "+34910000001",
      });

      const result = await adapter.purchaseNumber("+34910000001");

      expect(result.sid).toBe("PN123");
      expect(result.phoneNumber).toBe("+34910000001");
      expect(mockIncomingPhoneNumbersCreate).toHaveBeenCalledWith({
        phoneNumber: "+34910000001",
      });
    });

    it("incluye bundleSid y addressSid cuando se especifican", async () => {
      mockIncomingPhoneNumbersCreate.mockResolvedValue({
        sid: "PN123",
        phoneNumber: "+34910000001",
      });

      await adapter.purchaseNumber("+34910000001", {
        bundleSid: "BUxxxxx",
        addressSid: "ADxxxxx",
      });

      expect(mockIncomingPhoneNumbersCreate).toHaveBeenCalledWith({
        phoneNumber: "+34910000001",
        bundleSid: "BUxxxxx",
        addressSid: "ADxxxxx",
      });
    });
  });

  describe("releaseNumber", () => {
    it("removes the phone number", async () => {
      mockIncomingPhoneNumbersRemove.mockResolvedValue(undefined);

      await adapter.releaseNumber("PN123");

      expect(mockIncomingPhoneNumbersRemove).toHaveBeenCalled();
    });
  });

  describe("getNumber", () => {
    it("returns number details when found", async () => {
      mockIncomingPhoneNumbersFetch.mockResolvedValue({
        sid: "PN123",
        phoneNumber: "+34910000001",
        friendlyName: "Test",
        status: "in-use",
      });

      const result = await adapter.getNumber("PN123");

      expect(result).toEqual({
        sid: "PN123",
        phoneNumber: "+34910000001",
        friendlyName: "Test",
        status: "in-use",
      });
    });

    it("returns null when number is not found", async () => {
      mockIncomingPhoneNumbersFetch.mockRejectedValue(new Error("Not found"));

      const result = await adapter.getNumber("PN999");

      expect(result).toBeNull();
    });
  });
});
