import { z } from 'astro/zod';
const text = z.string().trim().min(1);
const url = z.url();
export const editionSchema = z.object({
  id: text, version: z.string().regex(/^\d+\.\d+\.\d+$/), minecraft: text,
  loader: z.enum(['NeoForge', 'Forge']), loaderVersion: text, java: z.number().int().positive(),
  status: z.enum(['Beta', 'Release']).nullable(), jar: z.string().endsWith('.jar'), downloadUrl: url, sourceUrl: url, sha256: z.string().optional(),
});
export const releaseSchema = z.object({ repository: text, releaseCommit: z.string().regex(/^[a-f0-9]{40}$/), mods: z.array(z.object({ slug: text, editions: z.array(editionSchema).min(1) })) });
