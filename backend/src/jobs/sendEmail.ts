import { sendZohoMail } from "../lib/zohoMail.js";
import { SendEmailJob } from "../lib/jobTypes.js";

const FROM_ADDRESS: Record<SendEmailJob["fromAlias"], string> = {
  welcome: "welcome@alhabla.ai",
  support: "support@alhabla.ai",
};

export async function processSendEmailJob(data: SendEmailJob): Promise<void> {
  const { fromAlias, toAddress, subject, html } = data;
  console.log(`[Job] Enviando email "${subject}" a ${toAddress} desde ${fromAlias}@`);

  await sendZohoMail({
    fromAddress: FROM_ADDRESS[fromAlias],
    toAddress,
    subject,
    html,
  });
}
