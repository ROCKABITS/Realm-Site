import { z } from 'astro/zod';
import raw from './site.json';
const content = z.object({
  siteName: z.string().min(1), creator: z.string().min(1), description: z.string().min(1), github: z.url(), curseforge: z.url(),
  categories: z.array(z.string().min(1)).min(2),
  modpack: z.object({ name: z.string().min(1), version: z.string().nullish().transform(x => x ?? ''), downloadUrl: z.preprocess(x => x || '', z.union([z.literal(''), z.url()])), distribution: z.enum(['group', 'public']).default('group') }),
}).parse(raw);
if (content.modpack.distribution === 'public' && !content.modpack.downloadUrl) throw new Error('A public modpack needs a download URL.');
export const { siteName, creator, description, github, curseforge, categories, modpack } = content;
