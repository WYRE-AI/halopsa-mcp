import { z } from "zod";
import { pageNo, pageSize } from "./input-schema.js";

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
