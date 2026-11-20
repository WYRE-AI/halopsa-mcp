import { z, type ZodError } from "zod";
import type { CallToolResult } from "./types.js";

const pageSize = z.number().int().positive().default(50);
const pageNo = z.number().int().positive().default(1);
const id = z.number().int().positive();

/** Validates `halopsa_statuses_list` arguments. */
export const statusListSchema = z.object({
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});

/** Validates `halopsa_statuses_get` arguments. */
export const statusGetSchema = z.object({ status_id: id });

/** Validates `halopsa_items_list` arguments. */
export const itemListSchema = z.object({
  type: z.enum(["product", "service", "bundle"]).optional(),
  category: z.string().optional(),
  supplier_id: id.optional(),
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});

/** Validates `halopsa_items_get` arguments. */
export const itemGetSchema = z.object({ item_id: id });

/** Validates `halopsa_contracts_list` arguments. */
export const contractListSchema = z.object({
  client_id: id.optional(),
  site_id: id.optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});

/** Validates `halopsa_contracts_get` arguments. */
export const contractGetSchema = z.object({ contract_id: id });

/** Formats an input validation failure as an MCP tool error. */
export function invalidCatalogInput(error: ZodError): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      },
    ],
    isError: true,
  };
}
