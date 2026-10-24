import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'member']);
export const UserStatusSchema = z.enum(['active', 'disabled']);

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: UserRoleSchema.default('member'),
  status: UserStatusSchema.default('active'),
  password: z.string().min(8).max(128)
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: UserRoleSchema.optional(),
  status: UserStatusSchema.optional(),
  password: z.string().min(8).max(128).optional()
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const CreateAPIKeySchema = z.object({
  name: z.string().min(1).max(64),
  userId: z.string().optional()
});

export const AuditFilterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  userId: z.string().optional(),
  upstreamSlug: z.string().optional(),
  toolName: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

export const UpstreamStatusSchema = z.enum(['connected', 'unreachable', 'disabled']);

export const CreateUpstreamServerSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens'
  }),
  url: z.string().url(),
  authToken: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().min(500).max(60000).default(10000)
});

export const UpdateUpstreamServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  authToken: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().min(500).max(60000).optional()
});

export const ChatMessageInputSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).optional().default([])
});

export const StoreStatusSchema = z.enum(['provisioning', 'ready', 'failed', 'deleting']);

export const CreateStoreSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(30).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must contain only lowercase alphanumeric characters and single hyphens'
  })
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateAPIKeyInput = z.infer<typeof CreateAPIKeySchema>;
export type CreateUpstreamServerInput = z.infer<typeof CreateUpstreamServerSchema>;
export type UpdateUpstreamServerInput = z.infer<typeof UpdateUpstreamServerSchema>;
export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>;
export type AuditFilterInput = z.infer<typeof AuditFilterSchema>;
export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;
