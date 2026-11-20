import { z } from "zod";
import { pageNo, pageSize } from "./input-schema.js";

const id = z.number().int().positive();

/** Validates `halopsa_clients_update` arguments. At least one field must change. */
export const clientUpdateSchema = z
  .object({
    client_id: id,
    name: z.string().min(1).optional(),
    website: z.string().optional(),
    phonenumber: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
    inactive: z.boolean().optional(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "client_id" && v[k as keyof typeof v] !== undefined),
    { message: "provide at least one field to update" }
  );

/** Validates `halopsa_clients_list_contacts` arguments. */
export const contactListSchema = z.object({
  client_id: id.optional(),
  site_id: id.optional(),
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});

/** Validates `halopsa_clients_create_contact` arguments. */
export const contactCreateSchema = z.object({
  client_id: id,
  name: z.string().min(1),
  emailaddress: z.string().optional(),
  phonenumber: z.string().optional(),
  mobilephone: z.string().optional(),
  site_id: id.optional(),
  notes: z.string().optional(),
});

/** Validates `halopsa_clients_update_contact` arguments. At least one field must change. */
export const contactUpdateSchema = z
  .object({
    contact_id: id,
    name: z.string().min(1).optional(),
    emailaddress: z.string().optional(),
    phonenumber: z.string().optional(),
    mobilephone: z.string().optional(),
    site_id: id.optional(),
    notes: z.string().optional(),
    inactive: z.boolean().optional(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "contact_id" && v[k as keyof typeof v] !== undefined),
    { message: "provide at least one field to update" }
  );

/** Validates `halopsa_clients_list_sites` arguments. */
export const siteListSchema = z.object({
  client_id: id.optional(),
  inactive: z.boolean().optional(),
  search: z.string().optional(),
  limit: pageSize,
  page_no: pageNo,
});
