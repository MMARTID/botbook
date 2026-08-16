import { z } from "zod";
import { PLAN_IDS } from "./catalog.js";

export const CreateCheckoutSessionSchema = z.object({
  planId: z.enum(PLAN_IDS),
});

export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionSchema>;
