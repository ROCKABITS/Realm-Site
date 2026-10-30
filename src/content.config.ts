import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const wiki = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/wiki' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['Getting started', 'Character & society', 'Economy & trade', 'Kingdom & justice', 'Activities & rewards']),
    mod: z.string().optional(),
    order: z.number().default(50),
  }),
});

const changelog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/changelog' }),
  schema: z.object({
    title: z.string(),
    version: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { wiki, changelog };
