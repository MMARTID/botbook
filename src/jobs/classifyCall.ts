import { Worker, Job } from "bullmq";
import { Anthropic } from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { ClassifyCallJob } from "../lib/queue.js";
import { CallOutcome } from "@prisma/client";
import { getRedis } from "../lib/redis.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Job processor: Classify call outcome using Claude Haiku
 */
export async function classifyCallWorker() {
  const redisConnection = getRedis();

  const worker = new Worker<ClassifyCallJob, unknown, string>(
    "classify-call",
    async (job: Job<ClassifyCallJob>) => {
      console.log(`[Job] Classifying call ${job.data.callId}`);

      try {
        const { callId, businessId, transcriptText } = job.data;

        // Verify call exists
        const call = await prisma.call.findUnique({
          where: { id: callId },
        });

        if (!call) {
          throw new Error(`Call ${callId} not found`);
        }

        // Classify the call using Claude Haiku
        const outcome = await classifyCallWithClaude(transcriptText);

        console.log(
          `[Job] Call ${callId} classified as: ${outcome}`
        );

        // Update call outcome in database
        const updatedCall = await prisma.call.update({
          where: { id: callId },
          data: {
            outcome,
          },
        });

        return { success: true, callId, outcome };
      } catch (error) {
        console.error(`[Job] Error classifying call ${job.data.callId}:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Job] Classification job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[Job] Classification job failed: ${job?.id}`, error);
  });

  return worker;
}

/**
 * Classify call using Claude Haiku 4.5 with zero-shot prompting
 */
async function classifyCallWithClaude(
  transcriptText: string
): Promise<CallOutcome> {
  const prompt = `Analyze the following call transcript and classify the outcome into ONE of these categories:
- RESOLVED: The customer's issue was successfully resolved or their request was fulfilled
- FRUSTRATED: The customer expressed frustration, anger, or dissatisfaction
- NO_ANSWER: The call ended without a clear resolution or the customer hung up
- ESCALATED: The call was transferred to a human or another department
- LEAD_CAPTURED: A sales lead, booking, or contact information was captured

Call Transcript:
---
${transcriptText}
---

Respond with ONLY the classification (one word from the list above, exactly as shown). Do not include any explanation.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const classification = message.content[0]?.type === "text" 
    ? message.content[0].text.trim().toUpperCase() 
    : "NO_ANSWER";

  // Validate the classification
  const validOutcomes: CallOutcome[] = [
    "RESOLVED",
    "FRUSTRATED",
    "NO_ANSWER",
    "ESCALATED",
    "LEAD_CAPTURED",
  ];

  if (validOutcomes.includes(classification as CallOutcome)) {
    return classification as CallOutcome;
  }

  // Default to NO_ANSWER if classification is invalid
  console.warn(
    `[Job] Invalid classification received: ${classification}, defaulting to NO_ANSWER`
  );
  return "NO_ANSWER";
}
