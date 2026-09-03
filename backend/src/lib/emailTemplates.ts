function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <span style="font-size:20px;font-weight:700;color:#0a0a0a;">Alhabla</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;color:#0a0a0a;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" width="480" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:16px 32px;color:#52525b;font-size:12px;text-align:center;">
                Alhabla · recepcionista de voz con IA para tu negocio
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 24px;background-color:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">${label}</a>`;
}

export function paymentApprovedEmail(input: { businessName: string; planName: string }): {
  subject: string;
  html: string;
} {
  const subject = `Bienvenido a Alhabla, ${input.businessName}`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">¡Ya está todo listo!</p>
    <p style="margin:0 0 16px 0;">Hola,</p>
    <p style="margin:0 0 16px 0;">
      Tu suscripción al plan <strong>${input.planName}</strong> se ha activado correctamente.
      Tu recepcionista de voz con IA ya puede empezar a atender llamadas de <strong>${input.businessName}</strong>.
    </p>
    <p style="margin:0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}

export function paymentFailedEmail(input: { businessName: string; manageBillingUrl: string }): {
  subject: string;
  html: string;
} {
  const subject = `No hemos podido procesar tu pago — ${input.businessName}`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;color:#c53030;">No hemos podido cobrar tu suscripción</p>
    <p style="margin:0 0 16px 0;">Hola,</p>
    <p style="margin:0 0 16px 0;">
      El último intento de cobro de la suscripción de <strong>${input.businessName}</strong> no se ha
      completado. Revisa tu método de pago para evitar una interrupción del servicio.
    </p>
    ${ctaButton(input.manageBillingUrl, "Revisar método de pago")}
    <p style="margin:20px 0 0 0;">Si crees que esto es un error, responde a este correo y te ayudamos.</p>
    <p style="margin:16px 0 0 0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}
