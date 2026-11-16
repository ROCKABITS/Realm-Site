export const memberNamespace = 'realm_studios';
// Retained for existing account metadata; the UI now uses uploaded photos or initials.
export const avatars = ['spark', 'book', 'globe', 'code', 'crown', 'leaf'] as const;
export type Avatar = typeof avatars[number];
export type Setup = { minecraft: string; loader: string };
export type Releases = Record<string, string>;
export type MemberState = {
  version: 1; name: string; avatar: Avatar; photoPath: string; setup: Setup;
  favoriteMods: string[]; favoriteGuides: string[];
  follows: Record<string, { seen: Releases }>;
};
export type Edition = { id: string; version: string; minecraft: string; loader: string; downloadUrl: string };
export type MemberMod = { slug: string; name: string; description: string; image: string; editions: Edition[] };
export type MemberGuide = { id: string; title: string; description: string; category: string };
export type MemberCatalogue = { mods: MemberMod[]; guides: MemberGuide[]; minecraft: string[]; loaders: string[] };
export type MemberOperation =
  | { type: 'profile'; name: string; avatar: Avatar; photoPath?: string; setup: Setup }
  | { type: 'favorite-mod' | 'favorite-guide'; id: string; active: boolean }
  | { type: 'follow'; id: string; active: boolean; releases: Releases }
  | { type: 'read'; id: string; releases: Releases };

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const idPattern = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;
const validId = (value: unknown): value is string => typeof value === 'string' && value.length <= 100 && idPattern.test(value);
const text = (value: unknown, length: number) => typeof value === 'string' ? Array.from(value.trim()).slice(0, length).join('') : '';
const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(validId))].slice(0, 200) : [];
export const validPhotoPath = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(value);
function releaseMap(value: unknown): Releases {
  return Object.fromEntries(Object.entries(object(value)).filter(([id, version]) => /^[a-z0-9][a-z0-9._-]{0,49}$/i.test(id) && typeof version === 'string').slice(0, 12).map(([id, version]) => [id, text(version, 40)]));
}
export function normaliseMember(metadata: unknown): MemberState {
  const raw = object(object(metadata)[memberNamespace]); const setup = object(raw.setup);
  return {
    version: 1, name: text(raw.name, 32), avatar: avatars.includes(raw.avatar) ? raw.avatar : 'spark', photoPath: validPhotoPath(raw.photoPath) ? raw.photoPath : '',
    setup: { minecraft: typeof setup.minecraft === 'string' && setup.minecraft.length <= 20 && /^\d+\.\d+(?:\.\d+)?$/.test(setup.minecraft) ? setup.minecraft : '', loader: ['Forge', 'NeoForge', 'Fabric', 'Quilt'].includes(setup.loader) ? setup.loader : '' },
    favoriteMods: ids(raw.favoriteMods), favoriteGuides: ids(raw.favoriteGuides),
    follows: Object.fromEntries(Object.entries(object(raw.follows)).filter(([id]) => validId(id)).slice(0, 100).map(([id, value]) => [id, { seen: releaseMap(object(value).seen) }])),
  };
}
export function currentReleases(editions: Array<Pick<Edition, 'id' | 'version'>>): Releases { return releaseMap(Object.fromEntries(editions.map(edition => [edition.id, edition.version]))); }
export function unreadEditions(state: MemberState, mod: MemberMod): Edition[] {
  const follow = Object.hasOwn(state.follows, mod.slug) ? state.follows[mod.slug] : undefined;
  return follow ? mod.editions.filter(edition => follow.seen[edition.id] !== edition.version) : [];
}
export function compatibleEditions(setup: Setup, editions: Edition[]): Edition[] {
  return editions.filter(edition => (!setup.minecraft || edition.minecraft === setup.minecraft) && (!setup.loader || edition.loader === setup.loader));
}
export function applyMemberOperation(state: MemberState, operation: MemberOperation): MemberState {
  const next = structuredClone(state);
  if (operation.type === 'profile') {
    if (Array.from(operation.name.trim()).length > 32) throw new Error('Choose a nickname with 32 characters or fewer.');
    next.name = operation.name; next.avatar = operation.avatar; next.setup = operation.setup;
    if (operation.photoPath !== undefined) next.photoPath = operation.photoPath;
  } else {
    if (!validId(operation.id)) throw new Error('This page could not be saved.');
    if (operation.type === 'favorite-mod' || operation.type === 'favorite-guide') {
      const key = operation.type === 'favorite-mod' ? 'favoriteMods' : 'favoriteGuides';
      next[key] = next[key].filter(id => id !== operation.id);
      if (operation.active) { if (next[key].length >= 200) throw new Error('Your collection is full. Remove an item before adding another.'); next[key].push(operation.id); }
    } else if (operation.type === 'follow') {
      if (!operation.active) delete next.follows[operation.id];
      else if (!Object.hasOwn(next.follows, operation.id)) { if (Object.keys(next.follows).length >= 100) throw new Error('You are following the maximum number of mods.'); next.follows[operation.id] = { seen: releaseMap(operation.releases) }; }
    } else if (operation.type === 'read' && Object.hasOwn(next.follows, operation.id)) next.follows[operation.id].seen = releaseMap(operation.releases);
  }
  return normaliseMember({ [memberNamespace]: next });
}
export function safeReturnPath(value: string | null): string | undefined {
  if (!value || value.includes('\\') || value.startsWith('//')) return;
  try {
    const path = decodeURIComponent(value);
    if (/^\/(?:mods\/[a-z0-9-]+|wiki\/[a-z0-9/-]+)\/$/.test(path) && !path.includes('..')) return path;
  } catch { /* Ignore malformed URLs. */ }
}
