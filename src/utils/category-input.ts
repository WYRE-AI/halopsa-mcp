import { z, type ZodError } from "zod";
import type { CallToolResult } from "./types.js";

const pageSize = z.number().int().positive().default(50);
const pageNo = z.number().int().positive().default(1);

export const categoryListSchema = z.object({
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});

export const categoryGetSchema = z.object({
  category_id: z.number().int().positive(),
});

export const ticketCategorySchema = z.object({
  category_1: z.string().optional(),
  category_2: z.string().optional(),
  category_3: z.string().optional(),
  category_4: z.string().optional(),
});

export function invalidCategoryInput(error: ZodError): CallToolResult {
  return {
    content: [{
      type: "text",
      text: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    }],
    isError: true,
  };
}
