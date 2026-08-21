import { z } from "zod";

const METHOD = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const kv = z.record(z.string(), z.string());

export const requestCreateSchema = z.object({
  collectionId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  method: METHOD.default("GET"),
  path: z.string().trim().min(1).max(500),
  body: z.string().max(100_000).optional().nullable(),
  headers: kv.optional().nullable(),
  params: kv.optional().nullable(),
  assertions: z.string().max(10_000).optional().nullable(),
});

export const requestUpdateSchema = requestCreateSchema
  .partial()
  .omit({ collectionId: true })
  .extend({ moveToCollectionId: z.string().min(1).optional() });

export const sendSchema = z.object({
  environmentId: z.string().min(1),
  /** Unsaved edits in the editor are sent as overrides so you can try before saving. */
  overrides: requestUpdateSchema.optional(),
});

export const runSchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  collectionId: z.string().min(1).nullable().optional(),
});

export const environmentSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  baseUrl: z
    .string()
    .trim()
    .url("Enter a full URL, e.g. https://staging.example.com")
    .max(500),
  kind: z.enum(["STATIC", "PR_PREVIEW"]).default("STATIC"),
  prNumber: z.number().int().positive().optional().nullable(),
  color: z.string().max(20).optional(),
  variables: kv.optional().nullable(),
});

export const environmentUpdateSchema = environmentSchema.partial().omit({ projectId: true });

export const collectionSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

export const issueFromFailureSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  epicId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  sprintId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
});
