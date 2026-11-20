import { z, type ZodError } from "zod";
import type { CallToolResult } from "./types.js";

/** Page size for list tools: a positive integer, default 50. */
export const pageSize = z.number().int().positive().default(50);

/** 1-based page number for list tools: a positive integer, default 1. */
export const pageNo = z.number().int().positive().default(1);

/** Formats an input validation failure as an MCP tool error. */
export function invalidInput(error: ZodError): CallToolResult {
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
