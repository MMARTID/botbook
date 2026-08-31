import twilio from "twilio";

let client: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio {
  if (client) {
    return client;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }

  if (apiKey && apiSecret) {
    client = twilio(apiKey, apiSecret, { accountSid });
    console.log("[Twilio] Client initialized with API Key");
  } else if (authToken) {
    client = twilio(accountSid, authToken);
    console.log("[Twilio] Client initialized with Auth Token");
  } else {
    throw new Error(
      "Twilio credentials are not configured. Provide either TWILIO_API_KEY + TWILIO_API_SECRET or TWILIO_AUTH_TOKEN"
    );
  }

  return client;
}
