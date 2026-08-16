import {
  VapiCreateAssistantRequest,
  VapiCall,
  VapiAssistant,
  VapiPhoneNumber,
  VapiCreatePhoneNumberRequest,
} from "./types.js";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

/**
 * VapiAdapter - Single source of truth for all Vapi API interactions.
 * This abstraction allows the rest of the codebase to be agnostic to Vapi,
 * making it easy to swap providers later.
 */
export class VapiAdapter {
  private apiKey: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.VAPI_API_KEY || "";
    this.baseUrl = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
    this.webhookSecret = process.env.VAPI_WEBHOOK_SECRET || "";
  }

  private ensureApiKey() {
    if (!this.apiKey) {
      throw new Error("VAPI_API_KEY not set in environment");
    }
  }

  /**
   * Create a new voice assistant in Vapi
   */
  async createAssistant(
    assistantConfig: VapiCreateAssistantRequest
  ): Promise<VapiAssistant> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(assistantConfig),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create Vapi assistant (${response.status} ${response.statusText}): ${error}`
      );
    }

    return (await response.json()) as VapiAssistant;
  }

  /**
   * Update an existing voice assistant
   */
  async updateAssistant(
    assistantId: string,
    assistantConfig: Partial<VapiCreateAssistantRequest>
  ): Promise<VapiAssistant> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(assistantConfig),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to update Vapi assistant ${assistantId} (${response.status} ${response.statusText}): ${error}`
      );
    }

    return (await response.json()) as VapiAssistant;
  }

  /**
   * Get an assistant by ID
   */
  async getAssistant(assistantId: string): Promise<VapiAssistant> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get Vapi assistant: ${assistantId}`);
    }

    return (await response.json()) as VapiAssistant;
  }

  /**
   * Delete an assistant
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/assistant/${assistantId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete Vapi assistant: ${assistantId}`);
    }
  }

  /**
   * Get a call by ID
   */
  async getCall(callId: string): Promise<VapiCall> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/call/${callId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get Vapi call: ${callId}`);
    }

    return (await response.json()) as VapiCall;
  }

  /**
   * Lightweight health check: verifies that the Vapi API is reachable.
   * Any HTTP response (even 401/403) means the service is up; network errors mean it is down.
   */
  async checkHealth(): Promise<void> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/assistant?limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Vapi health check failed (${response.status} ${response.statusText})`);
    }
  }

  /**
   * Validate Vapi webhook signature using HMAC-SHA256.
   * Vapi sends the signature in the `x-vapi-signature` header.
   */
  validateWebhookSignature(
    payload: string,
    signature: string
  ): boolean {
    if (!this.webhookSecret) {
      throw new Error("VAPI_WEBHOOK_SECRET is not configured");
    }
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payload, "utf8")
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8")
      );
    } catch {
      return false;
    }
  }

  /**
   * Download recording from Vapi URL
   */
  async downloadRecording(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download recording from: ${url}`);
    }
    return response.arrayBuffer();
  }

  /**
   * Upload a file to Vapi
   */
  async uploadFile(
    filePath: string,
    assistantId?: string,
    mimeType?: string
  ): Promise<any> {
    this.ensureApiKey();
    const formData = new FormData();
    const fileBuffer = await fs.promises.readFile(filePath);
    const filename = path.basename(filePath);
    const fileBlob = new Blob(
      [fileBuffer],
      mimeType ? { type: mimeType } : undefined
    );

    formData.append("file", fileBlob, filename);
    if (assistantId) {
      formData.append("assistantId", assistantId);
    }

    const response = await fetch(`${this.baseUrl}/file`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file to Vapi: ${error}`);
    }

    return await response.json();
  }

  /**
   * Create a phone number in Vapi
   */
  async createPhoneNumber(
    payload: VapiCreatePhoneNumberRequest
  ): Promise<VapiPhoneNumber> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/phone-number`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create Vapi phone number (${response.status} ${response.statusText}): ${error}`
      );
    }

    return (await response.json()) as VapiPhoneNumber;
  }

  /**
   * Update a phone number (e.g. associate to a different assistant)
   */
  async updatePhoneNumber(
    phoneNumberId: string,
    payload: Partial<Pick<VapiCreatePhoneNumberRequest, "assistantId" | "name">>
  ): Promise<VapiPhoneNumber> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/phone-number/${phoneNumberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to update Vapi phone number ${phoneNumberId} (${response.status} ${response.statusText}): ${error}`
      );
    }

    return (await response.json()) as VapiPhoneNumber;
  }

  /**
   * Delete a phone number from Vapi
   */
  async deletePhoneNumber(phoneNumberId: string): Promise<void> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/phone-number/${phoneNumberId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete Vapi phone number: ${phoneNumberId}`);
    }
  }

  /**
   * List phone numbers in the Vapi org
   */
  async listPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    this.ensureApiKey();
    const response = await fetch(`${this.baseUrl}/phone-number`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list Vapi phone numbers`);
    }

    return (await response.json()) as VapiPhoneNumber[];
  }
}

// Export singleton instance
export const vapiAdapter = new VapiAdapter();
