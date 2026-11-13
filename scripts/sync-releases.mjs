import { readFile, writeFile } from 'node:fs/promises';
import { selectRelease, normalizeRelease } from './releases.mjs';
const root = new URL('../', import.meta.url);
const sources = JSON.parse(await readFile(new URL('src/data/catalog-sources.json', root), 'utf8'));
const headers = { 'User-Agent': 'Realm-Studios-Catalog', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
async function get(url) { const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (!response.ok) throw new Error(`${response.status}: ${url}`); return response.json(); }
const revision = await get('https://api.github.com/repos/ROCKABITS/Mods/commits/main');
const commit = revision.sha;
const tree = await get(`https://api.github.com/repos/ROCKABITS/Mods/git/trees/${revision.commit.tree.sha}?recursive=1`);
if (tree.truncated) throw new Error('Incomplete release tree');
const paths = tree.tree.filter(x => x.type === 'blob').map(x => x.path);
const mods = [];
for (const source of sources.mods) {
  const editions = await Promise.all(source.editions.map(async edition => {
    const release = selectRelease(paths, edition);
    if (!release) throw new Error(`No JAR found for ${source.slug}/${edition.id}`);
    const metaPath = release.path.replace(/\.jar$/, '.build.json');
    const metadata = paths.includes(metaPath) ? await get(`https://raw.githubusercontent.com/ROCKABITS/Mods/${commit}/${metaPath}`) : {};
    return normalizeRelease(release, edition, metadata, commit, source.folder);
  }));
  mods.push({ slug: source.slug, editions });
}
const output = { repository: 'ROCKABITS/Mods', releaseCommit: commit, mods };
const file = new URL('src/data/releases.json', root);
const serialized = JSON.stringify(output, null, 2) + '\n';
let previous = ''; try { previous = await readFile(file, 'utf8'); } catch {}
if (previous !== serialized) { await writeFile(file, serialized); console.log(`Updated ${mods.length} mods from ${commit}`); }
else console.log('Release catalogue is current.');
