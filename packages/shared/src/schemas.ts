import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'member']);

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: UserRoleSchema.default('member'),
  password: z.string().min(8).max(128)
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const CreateAPIKeySchema = z.object({
  name: z.string().min(1).max(64)
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

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateAPIKeyInput = z.infer<typeof CreateAPIKeySchema>;
export type CreateUpstreamServerInput = z.infer<typeof CreateUpstreamServerSchema>;
export type UpdateUpstreamServerInput = z.infer<typeof UpdateUpstreamServerSchema>;
export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>;
