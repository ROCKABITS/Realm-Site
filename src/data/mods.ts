import { z } from 'astro/zod';
import content from './mods.json';
import releaseContent from './releases.json';
import { artwork } from './artwork';
import { categories } from './site';
import { gallery, videos } from './media';
import { releaseSchema, type editionSchema } from './schema';
export type Edition = z.infer<typeof editionSchema>;
const editorialSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string().min(1), label: z.string().min(1),
  category: z.string().refine(x => categories.includes(x), 'Unknown category'),
  image: z.string().refine(x => x in artwork, 'Unknown artwork key'),
  description: z.string().min(1), story: z.string().min(1), features: z.array(z.string()).min(1), firstStep: z.string().min(1), integrations: z.string(),
  featured: z.boolean().nullish().transform(x => x ?? false), gallery: z.array(z.string().refine(x => x in gallery, 'Unknown screenshot')).nullish().transform(x => x ?? []),
  video: z.preprocess(x => x || undefined, z.string().refine(x => x in videos, 'Unknown video').optional()),
});
const editorial = editorialSchema.array().parse(content.mods);
if (new Set(editorial.map(x => x.slug)).size !== editorial.length) throw new Error('Duplicate mod slug');
const releases = releaseSchema.parse(releaseContent);
export const mods = editorial.map(mod => {
  const release = releases.mods.find(x => x.slug === mod.slug);
  if (!release) throw new Error(`Missing release metadata for ${mod.slug}. Run npm run sync:releases.`);
  return { ...mod, editions: release.editions, version: release.editions[0].version };
});
export type Mod = typeof mods[number];
export const getMod = (slug: string) => mods.find(mod => mod.slug === slug);
export const sourceUrl = (mod: Mod) => mod.editions[0].sourceUrl;
export const downloadUrl = (mod: Mod) => mod.editions[0].downloadUrl;
