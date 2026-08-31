import Telnyx from "telnyx";

let client: Telnyx | null = null;

export function getTelnyxClient(): Telnyx {
  if (client) {
    return client;
  }

  const apiKey = process.env.TELNYX_API_KEY;

  if (!apiKey) {
    throw new Error("TELNYX_API_KEY is not configured");
  }

  client = new Telnyx({ apiKey });
  console.log("[Telnyx] Client initialized");

  return client;
}
