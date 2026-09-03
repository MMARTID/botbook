// Envío de correo transaccional vía la API REST de Zoho Mail (cuenta en el
// centro de datos .eu). welcome@alhabla.ai y support@alhabla.ai son alias de
// "enviar como" de la misma cuenta autenticada — no hace falta reautenticar
// por alias, un único refresh token cubre ambos.
const ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.eu";
const ZOHO_MAIL_BASE_URL = "https://mail.zoho.eu";

let cachedAccessToken: { token: string; expiresAt: number } | undefined;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

async function getZohoAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const params = new URLSearchParams({
    refresh_token: requireEnv("ZOHO_REFRESH_TOKEN"),
    client_id: requireEnv("ZOHO_CLIENT_ID"),
    client_secret: requireEnv("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  const response = await fetch(`${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(`Zoho OAuth token refresh failed: ${data.error ?? response.status}`);
  }

  // Margen de 60s para no usar un token a punto de caducar.
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedAccessToken.token;
}

export async function sendZohoMail(input: {
  fromAddress: string;
  toAddress: string;
  subject: string;
  html: string;
}): Promise<void> {
  const accessToken = await getZohoAccessToken();
  const accountId = requireEnv("ZOHO_ACCOUNT_ID");

  const response = await fetch(`${ZOHO_MAIL_BASE_URL}/api/accounts/${accountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject: input.subject,
      content: input.html,
      mailFormat: "html",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zoho Mail send failed (${response.status}): ${body}`);
  }
}
