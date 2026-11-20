import { z } from "zod";
import { pageNo, pageSize } from "./input-schema.js";

const categoryName = z.string().optional();

/**
 * Validates `halopsa_categories_list` arguments (inactive, search, page size,
 * and 1-based page number) before they are sent to Halo.
 */
export const categoryListSchema = z.object({
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});

/**
 * Validates `halopsa_categories_get` arguments. `category_id` must be a
 * positive integer.
 */
export const categoryGetSchema = z.object({
  category_id: z.number().int().positive(),
});

/**
 * Validates optional `category_1`–`category_4` names on ticket create and
 * update. Values are Halo category names, not ids.
 */
export const ticketCategorySchema = z.object({
  category_1: categoryName,
  category_2: categoryName,
  category_3: categoryName,
  category_4: categoryName,
});

/**
 * Ticket list filters accept `category_1` only. The Halo list API does not
 * filter on `category_2`–`category_4`, so those keys are rejected instead of
 * being dropped. Create and update still use {@link ticketCategorySchema}.
 */
function unsupportedListCategory(level: 2 | 3 | 4) {
  // zod 4.6 tightened z.undefined() to require the key be present (even if
  // explicitly undefined) — a missing key now fails with "expected
  // nonoptional". .optional() restores the original behavior: a missing key
  // and an explicit undefined both pass, while any real value is rejected.
  return z.undefined({
    error: `not a list filter. halopsa_tickets_list only filters on category_1; assign category_${level} with ticket create or update`,
  }).optional();
}

/** Validates ticket-list category input and rejects `category_2`–`category_4`. */
export const ticketListCategorySchema = z.object({
  category_1: categoryName,
  category_2: unsupportedListCategory(2),
  category_3: unsupportedListCategory(3),
  category_4: unsupportedListCategory(4),
});
