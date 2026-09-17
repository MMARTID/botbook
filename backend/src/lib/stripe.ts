import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  // Sin timeout explícito el SDK espera 80s por intento y reintenta hasta 3
  // veces: 4 minutos colgado de una petición, más de lo que dura el lock del
  // checkout que la envuelve.
  stripeClient ??= new Stripe(apiKey, { timeout: 10_000 });
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return secret;
}
