import modsContent from './mods.json';

export type Mod = { slug:string; name:string; label:string; version:string; category:string; image:string; description:string; story:string; features:string[]; firstStep:string; integrations:string; folder:string; jar:string; featured?:boolean; };
export const mods: Mod[] = modsContent.mods as Mod[];
export const getMod = (slug:string) => mods.find(mod => mod.slug === slug);
export const sourceUrl = (mod:Mod) => `https://github.com/ROCKABITS/Mods/tree/main/${mod.folder}`;
export const downloadUrl = (mod:Mod) => `https://github.com/ROCKABITS/Mods/raw/refs/heads/main/mod-pronto/${mod.jar}`;
