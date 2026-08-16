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
        { phoneNumber: "+34910000001", friendlyName: "Madrid", locality: "Madrid", region: "Madrid" },
      ]);

      const results = await adapter.searchAvailableNumbers("ES", { limit: 1 });

      expect(results).toHaveLength(1);
      expect(results[0].phoneNumber).toBe("+34910000001");
      expect(mockLocalList).toHaveBeenCalledWith({ limit: 1 });
    });

    it("falls back to mobile numbers when no local numbers are available", async () => {
      mockLocalList.mockRejectedValue(new Error("No local numbers"));
      mockMobileList.mockResolvedValue([
        { phoneNumber: "+34600000001", friendlyName: "Spain Mobile", locality: null, region: null },
      ]);

      const results = await adapter.searchAvailableNumbers("ES");

      expect(results).toHaveLength(1);
      expect(results[0].phoneNumber).toBe("+34600000001");
    });

    it("falls back to national numbers when no local or mobile numbers are available", async () => {
      mockLocalList.mockRejectedValue(new Error("No local numbers"));
      mockMobileList.mockRejectedValue(new Error("No mobile numbers"));
      mockNationalList.mockResolvedValue([
        { phoneNumber: "+34910000002", friendlyName: "Spain", locality: null, region: null },
      ]);

      const results = await adapter.searchAvailableNumbers("ES");

      expect(results).toHaveLength(1);
      expect(results[0].phoneNumber).toBe("+34910000002");
    });

    it("returns an empty array when no numbers are available", async () => {
      mockLocalList.mockRejectedValue(new Error("No local numbers"));
      mockMobileList.mockRejectedValue(new Error("No mobile numbers"));
      mockNationalList.mockRejectedValue(new Error("No national numbers"));

      const results = await adapter.searchAvailableNumbers("ES");

      expect(results).toEqual([]);
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
