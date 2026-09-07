import { telnyxAdapter } from "../adapters/telnyx/TelnyxAdapter.js";
import { SendSmsJob } from "../lib/jobTypes.js";

export async function processSendSmsJob(data: SendSmsJob): Promise<void> {
  const { fromNumber, toNumber, text } = data;
  console.log(`[Job] Enviando SMS a ${toNumber} desde ${fromNumber}`);

  await telnyxAdapter.sendSms({ from: fromNumber, to: toNumber, text });
}
