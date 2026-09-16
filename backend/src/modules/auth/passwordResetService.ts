import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { enqueueEmailJob } from "../../lib/cloudTasks.js";
import {
  passwordChangedEmail,
  passwordResetEmail,
} from "../../lib/emailTemplates.js";
import { AccountActionError } from "./accountService.js";

/**
 * Recuperación de contraseña sin tabla nueva: el token vive en Redis con
 * caducidad, igual que el `state` de Google OAuth. Se guarda solo su hash —
 * un volcado de Redis no sirve para restablecer nada — y se consume con
 * `getdel`, así que cada enlace vale una única vez.
 */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

const RESET_KEY_PREFIX = "auth:password-reset:";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:3001").replace(
    /\/$/,
    ""
  );
}

export function buildPasswordResetUrl(token: string) {
  return `${getFrontendUrl()}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
}

/**
 * Siempre resuelve sin distinguir si el email existe: la respuesta al usuario
 * es la misma en ambos casos para no permitir enumerar cuentas. Las cuentas
 * creadas con Google (sin contraseña) también pueden usarlo — recibir el
 * correo demuestra que el buzón es suyo, igual que fijarla desde Ajustes.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true },
  });

  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  await getRedis().set(
    `${RESET_KEY_PREFIX}${hashToken(token)}`,
    user.id,
    "EX",
    PASSWORD_RESET_TTL_SECONDS
  );

  const message = passwordResetEmail({ resetUrl: buildPasswordResetUrl(token) });
  try {
    await enqueueEmailJob({
      fromAlias: "support",
      toAddress: user.email,
      ...message,
    });
  } catch (error) {
    // Sin correo no hay enlace: el usuario debe saber que puede reintentar
    // en vez de esperar un mensaje que no va a llegar.
    console.error(
      `[Auth] No se pudo enviar el correo de restablecimiento a ${user.email}:`,
      error instanceof Error ? error.message : String(error)
    );
    throw new AccountActionError(
      "No hemos podido enviar el correo. Inténtalo de nuevo en unos minutos.",
      502
    );
  }
}

export async function resetPasswordWithToken(input: {
  token: string;
  newPassword: string;
}) {
  const userId = await getRedis().getdel(
    `${RESET_KEY_PREFIX}${hashToken(input.token)}`
  );

  if (!userId) {
    throw new AccountActionError(
      "El enlace no es válido o ha caducado. Pide uno nuevo.",
      400
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, businessId: true },
  });

  if (!user) {
    throw new AccountActionError(
      "El enlace no es válido o ha caducado. Pide uno nuevo.",
      400
    );
  }

  const password = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password },
  });

  try {
    await enqueueEmailJob({
      fromAlias: "support",
      toAddress: user.email,
      ...passwordChangedEmail(),
    });
  } catch (error) {
    // La confirmación es secundaria: la contraseña ya está cambiada y el
    // usuario no debe ver un error por un correo que no salió.
    console.error(
      `[Auth] No se pudo enviar la confirmación de cambio de contraseña a ${user.email}:`,
      error instanceof Error ? error.message : String(error)
    );
  }

  return user;
}
