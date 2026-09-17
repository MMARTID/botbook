import { telnyxAdapter } from "../adapters/telnyx/TelnyxAdapter.js";
import { SendSmsJob } from "../lib/jobTypes.js";
import { reclamarEnvio } from "../lib/messageIdempotency.js";

export async function processSendSmsJob(data: SendSmsJob): Promise<void> {
  const { fromNumber, toNumber, text, messagingProfileId } = data;
  if (!(await reclamarEnvio("sms", data.idempotencyKey))) {
    return;
  }
  console.log(`[Job] Enviando SMS a ${toNumber} desde ${fromNumber}`);

  await telnyxAdapter.sendSms({
    from: fromNumber,
    to: toNumber,
    text,
    messagingProfileId,
  });
}
