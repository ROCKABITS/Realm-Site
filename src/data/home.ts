import { z } from 'astro/zod';
import raw from './home.json';
const required = z.string().trim().min(1);
const schema = z.object({
  eyebrow: required, heroTitle: required, heroEmphasis: required, heroDescription: required, heroPrimary: required, heroSecondary: required,
  collectionEyebrow: required, collectionTitle: required, collectionEmphasis: z.string().nullish().transform(x => x ?? ''), collectionLink: required,
  wikiEyebrow: required, wikiTitle: required, wikiEmphasis: z.string().nullish().transform(x => x ?? ''), wikiDescription: required,
  seasonLabel: required, seasonTitle: required, seasonEmphasis: z.string().nullish().transform(x => x ?? ''), seasonDescription: required,
});
export default schema.parse(raw);
