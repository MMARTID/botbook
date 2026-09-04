import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelnyxAdapter } from "../../../src/adapters/telnyx/TelnyxAdapter.js";

const mockAvailablePhoneNumbersList = vi.fn();
const mockNumberOrdersCreate = vi.fn();
const mockNumberOrdersRetrieve = vi.fn();
const mockPhoneNumbersDelete = vi.fn();
const mockPhoneNumbersRetrieve = vi.fn();

const mockTelnyxClient = {
  availablePhoneNumbers: { list: mockAvailablePhoneNumbersList },
  numberOrders: {
    create: mockNumberOrdersCreate,
    retrieve: mockNumberOrdersRetrieve,
  },
  phoneNumbers: {
    delete: mockPhoneNumbersDelete,
    retrieve: mockPhoneNumbersRetrieve,
  },
};

vi.mock("../../../src/lib/telnyx.js", () => ({
  getTelnyxClient: vi.fn(() => mockTelnyxClient),
}));

describe("TelnyxAdapter", () => {
  let adapter: TelnyxAdapter;

  beforeEach(() => {
    adapter = new TelnyxAdapter();
    vi.clearAllMocks();
  });

  describe("searchAvailableNumbers", () => {
    it("returns local numbers when available", async () => {
      mockAvailablePhoneNumbersList.mockResolvedValue({
        data: [
          {
            phone_number: "+34886020712",
            cost_information: { upfront_cost: "1.00000", monthly_cost: "1.00000", currency: "USD" },
            region_information: [
              { region_type: "location", region_name: "PONTEVEDRA" },
              { region_type: "country_code", region_name: "ES" },
            ],
          },
        ],
      });

      const results = await adapter.searchAvailableNumbers("ES", { limit: 1 });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        phoneNumber: "+34886020712",
        region: "PONTEVEDRA",
        upfrontCost: "1.00000",
        monthlyCost: "1.00000",
        currency: "USD",
      });
      expect(mockAvailablePhoneNumbersList).toHaveBeenCalledWith({
        filter: { country_code: "ES", phone_number_type: "local", limit: 1 },
      });
    });

    it("no filtra por requisitos de dirección por número — Telnyx los resuelve con el Requirement Group en el pedido, no en la búsqueda", async () => {
      mockAvailablePhoneNumbersList.mockResolvedValue({
        data: [{ phone_number: "+34858160727" }],
      });

      const results = await adapter.searchAvailableNumbers("ES");

      expect(results[0]).not.toHaveProperty("addressRequirements");
    });

    it("filtra por localidad cuando se especifica (Requirement Group tipo individual)", async () => {
      mockAvailablePhoneNumbersList.mockResolvedValue({
        data: [{ phone_number: "+34930453216" }],
      });

      await adapter.searchAvailableNumbers("ES", { limit: 5, locality: "Barcelona" });

      expect(mockAvailablePhoneNumbersList).toHaveBeenCalledWith({
        filter: {
          country_code: "ES",
          phone_number_type: "local",
          limit: 5,
          locality: "Barcelona",
        },
      });
    });

    it("propaga el error si la búsqueda falla", async () => {
      mockAvailablePhoneNumbersList.mockRejectedValue(new Error("Telnyx down"));

      await expect(adapter.searchAvailableNumbers("ES")).rejects.toThrow("Telnyx down");
    });
  });

  describe("purchaseNumber", () => {
    it("crea un pedido y devuelve su estado", async () => {
      mockNumberOrdersCreate.mockResolvedValue({
        data: {
          id: "order_123",
          status: "success",
          requirements_met: true,
          phone_numbers: [{ id: "pn_123", phone_number: "+34886020712", status: "success" }],
        },
      });

      const result = await adapter.purchaseNumber("+34886020712", {
        requirementGroupId: "req_group_123",
        connectionId: "conn_123",
      });

      expect(result).toEqual({
        orderId: "order_123",
        status: "success",
        phoneNumber: "+34886020712",
        phoneNumberId: "pn_123",
        requirementsMet: true,
      });
      expect(mockNumberOrdersCreate).toHaveBeenCalledWith({
        connection_id: "conn_123",
        phone_numbers: [
          { phone_number: "+34886020712", requirement_group_id: "req_group_123" },
        ],
      });
    });

    it("puede quedar en estado 'pending' mientras Telnyx revisa los requisitos regulatorios", async () => {
      mockNumberOrdersCreate.mockResolvedValue({
        data: { id: "order_456", status: "pending", phone_numbers: [{ phone_number: "+34886020712" }] },
      });

      const result = await adapter.purchaseNumber("+34886020712");

      expect(result.status).toBe("pending");
      expect(mockNumberOrdersCreate).toHaveBeenCalledWith({
        phone_numbers: [{ phone_number: "+34886020712" }],
      });
    });
  });

  describe("getNumberOrder", () => {
    it("sondea el estado de un pedido existente", async () => {
      mockNumberOrdersRetrieve.mockResolvedValue({
        data: {
          id: "order_123",
          status: "success",
          phone_numbers: [{ id: "pn_123", phone_number: "+34886020712" }],
        },
      });

      const result = await adapter.getNumberOrder("order_123");

      expect(result.status).toBe("success");
      expect(mockNumberOrdersRetrieve).toHaveBeenCalledWith("order_123");
    });
  });

  describe("releaseNumber", () => {
    it("elimina el número", async () => {
      mockPhoneNumbersDelete.mockResolvedValue(undefined);

      await adapter.releaseNumber("pn_123");

      expect(mockPhoneNumbersDelete).toHaveBeenCalledWith("pn_123");
    });
  });

  describe("getNumber", () => {
    it("returns number details when found", async () => {
      mockPhoneNumbersRetrieve.mockResolvedValue({
        data: { id: "pn_123", phone_number: "+34886020712", status: "active" },
      });

      const result = await adapter.getNumber("pn_123");

      expect(result).toEqual({
        id: "pn_123",
        phoneNumber: "+34886020712",
        status: "active",
      });
    });

    it("returns null when number is not found", async () => {
      mockPhoneNumbersRetrieve.mockRejectedValue(new Error("Not found"));

      const result = await adapter.getNumber("pn_999");

      expect(result).toBeNull();
    });
  });
});
