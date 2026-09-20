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

export function paymentFailedEmail(input: {
  businessName: string;
  manageBillingUrl: string;
  suspensionAt: Date;
}): {
  subject: string;
  html: string;
} {
  const subject = `No hemos podido procesar tu pago — ${input.businessName}`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;color:#c53030;">No hemos podido cobrar tu suscripción</p>
    <p style="margin:0 0 16px 0;">Hola,</p>
    <p style="margin:0 0 16px 0;">
      El último intento de cobro de la suscripción de <strong>${input.businessName}</strong> no se ha
      completado. Si no se regulariza antes del <strong>${new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(input.suspensionAt)}</strong>,
      suspenderemos las llamadas que llegan a tu número de Alhabla.
    </p>
    ${ctaButton(input.manageBillingUrl, "Revisar método de pago")}
    <p style="margin:20px 0 0 0;">Si crees que esto es un error, responde a este correo y te ayudamos.</p>
    <p style="margin:16px 0 0 0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}

export function subscriptionCancellationInstructionsEmail(input: {
  businessName: string;
  serviceEndsAt: Date | null;
  manageBillingUrl: string;
}): { subject: string; html: string } {
  const subject = `Acción necesaria al cancelar Alhabla — ${input.businessName}`;
  const endDate = input.serviceEndsAt
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(input.serviceEndsAt)
    : "la fecha de finalización de tu suscripción";
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Tu baja está programada</p>
    <p style="margin:0 0 16px 0;">Hola,</p>
    <p style="margin:0 0 16px 0;">
      Tu suscripción de <strong>${input.businessName}</strong> finalizará el <strong>${endDate}</strong>.
    </p>
    <p style="margin:0 0 16px 0;">
      Antes de esa fecha, desactiva el desvío de llamadas de tu línea habitual hacia el número de Alhabla.
      Así evitarás que las llamadas de tus clientes queden sin atender al terminar el servicio.
    </p>
    ${ctaButton(input.manageBillingUrl, "Ver facturación")}
    <p style="margin:20px 0 0 0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}

export function passwordChangedEmail(): { subject: string; html: string } {
  const subject = "Tu contraseña de Alhabla ha cambiado";
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Contraseña actualizada</p>
    <p style="margin:0 0 16px 0;">La contraseña de acceso a tu cuenta de Alhabla se ha cambiado correctamente.</p>
    <p style="margin:0 0 16px 0;">Si no has sido tú, responde a este correo cuanto antes para que podamos proteger tu cuenta.</p>
    <p style="margin:0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}

export function passwordResetEmail(input: { resetUrl: string }): {
  subject: string;
  html: string;
} {
  const subject = "Restablece tu contraseña de Alhabla";
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Crea una contraseña nueva</p>
    <p style="margin:0 0 16px 0;">Hola,</p>
    <p style="margin:0 0 16px 0;">
      Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Alhabla.
      Pulsa el botón para elegir una nueva. El enlace caduca en <strong>1 hora</strong> y solo sirve una vez.
    </p>
    ${ctaButton(input.resetUrl, "Crear una contraseña nueva")}
    <p style="margin:20px 0 0 0;">
      Si no has pedido este cambio, puedes ignorar este correo: tu contraseña sigue siendo la misma.
    </p>
    <p style="margin:16px 0 0 0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}

export function accountDeletedEmail(input: { businessName: string }): {
  subject: string;
  html: string;
} {
  const subject = `Cuenta eliminada — ${input.businessName}`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Tu cuenta se ha eliminado</p>
    <p style="margin:0 0 16px 0;">Hemos eliminado la cuenta de <strong>${input.businessName}</strong> y cancelado su servicio.</p>
    <p style="margin:0 0 16px 0;"><strong>Importante:</strong> comprueba que el desvío de llamadas de tu línea habitual ya está desactivado.</p>
    <p style="margin:0;">Si necesitas ayuda, responde a este correo.<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}

export function usageWarningEmail(input: { businessName: string; planName: string; consumedMinutes: number; includedMinutes: number; extraMinuteCents: number; periodEndsAt: Date }): { subject: string; html: string } {
  const subject = `Te acercas a los minutos incluidos — ${input.businessName}`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Estás cerca del límite de tu plan</p>
    <p style="margin:0 0 16px 0;">Has consumido <strong>${input.consumedMinutes} de ${input.includedMinutes} minutos</strong> incluidos en tu plan ${input.planName}.</p>
    <p style="margin:0 0 16px 0;">A partir de ${input.includedMinutes} minutos, el consumo adicional se facturará a <strong>${(input.extraMinuteCents / 100).toFixed(2).replace(".", ",")} €/min</strong> hasta el ${new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(input.periodEndsAt)}.</p>
    <p style="margin:0;">Puedes consultar el consumo en Ajustes → Facturación.</p>
  `);
  return { subject, html };
}

export function pendingBookingAlertEmail(input: {
  businessName: string;
  clientName: string;
  clientPhone: string | null;
  formattedDateTime: string;
  panelUrl: string;
}): { subject: string; html: string } {
  const subject = `Una cita no ha llegado a tu calendario — ${input.businessName}`;
  const contacto = input.clientPhone
    ? `<strong>${input.clientName}</strong> (${input.clientPhone})`
    : `<strong>${input.clientName}</strong>`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Hay una cita pendiente de confirmar a mano</p>
    <p style="margin:0 0 16px 0;">Tu recepcionista ha atendido la llamada y ha tomado los datos, pero no ha podido dejar la cita en tu calendario.</p>
    <p style="margin:0 0 16px 0;">${contacto} pidió cita para el <strong>${input.formattedDateTime}</strong>.</p>
    <p style="margin:0;">Llámale para confirmarla, o revisa la conexión de tu calendario en el panel.</p>
    ${ctaButton(input.panelUrl, "Ver las citas pendientes")}
  `);
  return { subject, html };
}

/** Aviso #2 (recado) cuando el dueño no tiene WhatsApp activo. */
export function messageLeadEmail(input: {
  businessName: string;
  clientName: string | null;
  clientPhone: string | null;
  motivo: string;
  quiereQueLeLlamen: boolean;
  panelUrl: string;
}): { subject: string; html: string } {
  const quien = input.clientName ? `<strong>${input.clientName}</strong>` : "Un cliente";
  const telefono = input.clientPhone ? ` (${input.clientPhone})` : "";
  const subject = `Tienes un recado — ${input.businessName}`;
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Tienes un recado</p>
    <p style="margin:0 0 16px 0;">${quien}${telefono} ha llamado a ${input.businessName} y tu recepcionista ha tomado nota:</p>
    <p style="margin:0 0 16px 0;padding:12px 16px;background:#f4f4f5;border-radius:12px;">${input.motivo}</p>
    <p style="margin:0;">${input.quiereQueLeLlamen ? "Pide que le llames." : "No ha pedido que le llames; queda a tu criterio."}</p>
    ${ctaButton(input.panelUrl, "Ver las llamadas")}
  `);
  return { subject, html };
}

/** Aviso #5 (alerta operativa) por email cuando el dueño no tiene WhatsApp activo. */
export function operationalAlertEmail(input: {
  businessName: string;
  texto: string;
  panelUrl: string;
}): { subject: string; html: string } {
  const subject = `Necesita tu atención — ${input.businessName}`;
  const primera = input.texto.charAt(0).toUpperCase() + input.texto.slice(1);
  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Hay algo que revisar en ${input.businessName}</p>
    <p style="margin:0;">${primera}</p>
    ${ctaButton(input.panelUrl, "Ir a Ajustes")}
  `);
  return { subject, html };
}

export function weeklySummaryEmail(input: {
  businessName: string;
  weekStart: Date;
  weekEnd: Date;
  callCount: number;
  totalMinutes: number;
  bookingCount: number;
  leadCount: number;
  /** Citas que la recepcionista tomó pero que nunca llegaron al calendario:
   * si nadie las repesca, ese cliente se queda sin su hora. */
  pendingBookingCount: number;
  panelUrl: string;
}): { subject: string; html: string } {
  const formatter = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid",
  });
  const range = `${formatter.format(input.weekStart)} – ${formatter.format(input.weekEnd)}`;
  const subject = `Tu semana en Alhabla (${range}) — ${input.businessName}`;

  const statRow = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#52525b;font-size:14px;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;text-align:right;font-weight:700;font-size:16px;color:#0a0a0a;">${value}</td>
    </tr>`;

  const html = emailShell(`
    <p style="font-size:18px;font-weight:600;margin:0 0 16px 0;">Así ha ido la semana en ${input.businessName}</p>
    <p style="margin:0 0 16px 0;">Resumen del ${range} de tu recepcionista de voz:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
      ${statRow("Llamadas atendidas", String(input.callCount))}
      ${statRow("Minutos al teléfono", String(input.totalMinutes))}
      ${statRow("Citas reservadas", String(input.bookingCount))}
      ${statRow("Clientes interesados sin cita (leads)", String(input.leadCount))}
    </table>
    ${
      input.pendingBookingCount > 0
        ? `<p style="margin:0 0 8px 0;padding:12px 16px;background-color:#fdf6e3;border-radius:12px;color:#9f7a15;font-weight:600;">Tienes ${input.pendingBookingCount} ${
            input.pendingBookingCount === 1
              ? "cita que no llegó a tu calendario y sigue sin confirmar"
              : "citas que no llegaron a tu calendario y siguen sin confirmar"
          }.</p>`
        : ""
    }
    ${ctaButton(input.panelUrl, "Ver el detalle en tu panel")}
    <p style="margin:20px 0 0 0;">Un saludo,<br/>El equipo de Alhabla</p>
  `);
  return { subject, html };
}
