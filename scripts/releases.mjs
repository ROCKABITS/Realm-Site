export function compareVersions(a, b) {
  const av = a.split('.').map(Number), bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return av[i] - bv[i];
  return 0;
}
export function selectRelease(paths, edition) {
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^mod-pronto/${escape(edition.prefix)}-(\\d+\\.\\d+\\.\\d+)${escape(edition.suffix || '')}\\.jar$`);
  return paths.map(path => ({ path, match: path.match(pattern) })).filter(x => x.match)
    .map(x => ({ path: x.path, version: x.match[1] })).sort((a, b) => compareVersions(b.version, a.version))[0];
}
export function normalizeRelease(release, edition, metadata, commit, folder) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid release commit');
  const filename = release.path.split('/').at(-1);
  return {
    id: edition.id, version: release.version, minecraft: String(metadata.minecraft || edition.minecraft),
    loader: edition.loader, loaderVersion: String(metadata.forge || metadata.neoforge || edition.loaderVersion),
    java: Number(metadata.java || edition.java), status: metadata.status === 'Beta' ? 'Beta' : metadata.status === 'Release' ? 'Release' : null,
    jar: filename, downloadUrl: `https://github.com/ROCKABITS/Mods/raw/${commit}/${release.path}`,
    sourceUrl: `https://github.com/ROCKABITS/Mods/tree/${metadata.source_commit || commit}/${edition.folder || folder}`,
    ...(metadata.jar_sha256 ? { sha256: metadata.jar_sha256 } : {}),
  };
}
