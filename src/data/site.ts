import content from './site.json';
export const siteName=content.siteName;
export const creator=content.creator;
export const github=content.github;
export const curseforge=content.curseforge;
export const categories=content.categories;
export const modpack={name:content.modpack.name,version:content.modpack.version||null,downloadUrl:content.modpack.downloadUrl||null};
