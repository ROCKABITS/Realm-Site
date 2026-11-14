import { marked } from 'marked';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Repository, RepositoryError, signIn, sessionKey, repository } from './repository';
import { readArticle, writeArticle, makeSlug, slugPattern, httpUrl, validateArticle, updateMod, wikiCategories, type Data, type Document, type Article } from './content';

type FileEntry = { name: string; path: string; sha: string; type: string };
type Picture = { key: string; src: string; source?: string; label?: string };
type Editor = { kind: string; document: Document; data: Data; article?: Article; slug?: string; dirty: boolean; busy: boolean; form?: HTMLFormElement; previousDraft?: Data };
const boot = JSON.parse(document.getElementById('admin-options')!.textContent!) as { pictures: Picture[]; screenshots: Picture[]; videos: Record<string, { label: string; url: string }> };
const q = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector)!;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]!));
const login = q('#admin-login'), app = q('#admin-app'), view = q('#admin-view');
const labels: Record<string, string> = { '': 'Visão geral', mods: 'Mods', wiki: 'Guias da wiki', changelog: 'Novidades', home: 'Página inicial', modpack: 'Modpack', settings: 'Definições', feedback: 'Feedback' };
const categoryNames: Record<string, string> = { 'Character & society': 'Personagens e sociedade', 'Economy & trade': 'Economia e comércio', 'Kingdom & justice': 'Reinos e justiça', 'Activities & rewards': 'Atividades e recompensas', 'Getting started': 'Primeiros passos' };
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' }); turndown.use(gfm);
turndown.addRule('source-image', { filter: node => node.nodeName === 'IMG' && !!(node as HTMLElement).dataset.originalSrc, replacement: (_content, node) => { const image = node as HTMLImageElement; return `![${image.alt.replace(/[\[\]]/g, '\\$&')}](${image.dataset.originalSrc})`; } });
const cache = new Map<string, Document>();
let api: Repository | undefined, site: Data = {}, catalogue: Data = {}, releases: Data = {}, files: Record<string, FileEntry[]> = {}, editor: Editor | undefined;
let currentRoute = '', generation = 0, publicationGeneration = 0;
let leaveFeedback: (() => void) | undefined;

function cleanHtml(source: string): string {
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(marked.parse(source, { async: false }), { FORBID_TAGS: ['style', 'iframe', 'object', 'form', 'input', 'button'], FORBID_ATTR: ['style', 'id', 'name'], SANITIZE_NAMED_PROPS: true });
  template.content.querySelectorAll('img').forEach(image => { delete image.dataset.originalSrc; const original = image.getAttribute('src'); const asset = boot.screenshots.find(item => item.source === original); if (asset) { image.src = asset.src; image.dataset.originalSrc = original!; } });
  return template.innerHTML;
}
const picture = (key: string) => boot.pictures.find(item => item.key === key)?.src ?? '';
const modName = (key: string) => catalogue.mods?.find((mod: Data) => mod.image === key)?.name ?? (key === 'season8Logo' ? 'Season 8' : key);
const href = (route: string) => `#/${route}`;
const titleOf = (route: string) => labels[route.split('/')[0]] ?? 'Administração';
const heading = (title: string, description: string, actions = '') => `<div class="view-heading"><div><span class="admin-eyebrow">O teu estúdio</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
const actionLink = (route: string, text: string) => `<a class="admin-button primary" href="${href(route)}">${esc(text)} <span aria-hidden="true">＋</span></a>`;
function notify(message: string, error = false) { const notice = q('#editor-notice', view); if (notice) { notice.textContent = message; notice.classList.toggle('error', error); } }
function errorText(error: unknown): string { return error instanceof RepositoryError ? error.message : 'A ligação falhou. O teu texto foi mantido. Tenta novamente.'; }
async function read(path: string) { if (!cache.has(path)) cache.set(path, await api!.read(path)); return cache.get(path)!; }
function closeMenu() { app.classList.remove('menu-open'); const button = q<HTMLButtonElement>('.admin-menu'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Abrir menu'); }
function localDraftKey(route = currentRoute) { return `realm-admin-draft:${route}`; }
function forgetDraft(route = currentRoute) { try { sessionStorage.removeItem(localDraftKey(route)); } catch { /* Storage can be disabled by the browser. */ } }
function snapshot(form: HTMLFormElement) { const data = new FormData(form); const result: Record<string, string[]> = {}; for (const key of new Set(data.keys())) result[key] = data.getAll(key).map(String); return result; }
function rememberDraft() { if (!editor?.form) return; try { sessionStorage.setItem(localDraftKey(), JSON.stringify({ sha: editor.document.sha ?? null, values: snapshot(editor.form) })); } catch { /* The unsaved-change guard still protects this tab. */ } }
function setDirty() { if (!editor || editor.busy) return; editor.dirty = true; const state = q('.save-state', view); state.textContent = 'Alterações por guardar'; state.classList.add('dirty'); q<HTMLButtonElement>('[data-save]', view).disabled = false; rememberDraft(); updatePreview(); }
function restoreDraft() {
  if (!editor?.form) return;
  try {
    const previous = JSON.parse(sessionStorage.getItem(localDraftKey() + ':previous') ?? 'null');
    if (previous) { editor.previousDraft = previous; q('[data-action=export]').textContent = 'Exportar rascunho anterior'; }
    const draft = JSON.parse(sessionStorage.getItem(localDraftKey()) ?? 'null');
    if (!draft) return;
    if (draft.sha !== (editor.document.sha ?? null)) { editor.previousDraft = draft; sessionStorage.setItem(localDraftKey() + ':previous', JSON.stringify(draft)); q('[data-action=export]').textContent = 'Exportar rascunho anterior'; notify('Existe um rascunho local de uma versão anterior. Podes exportá-lo para recuperar o texto.', true); return; }
    for (const element of Array.from(editor.form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) || !element.name) continue;
      const values = draft.values[element.name] ?? [];
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) element.checked = values.includes(element.value);
      else element.value = values[0] ?? '';
    }
    const rich = q('[data-rich-editor]', editor.form); if (rich) rich.innerHTML = cleanHtml(value('body'));
    setDirty(); notify('Recuperámos as alterações que ainda não tinhas publicado.');
  } catch { /* Invalid local drafts are never published automatically. */ }
}
async function canLeave() {
  if (!editor?.dirty) return true;
  if (editor.busy) return false;
  const dialog = q<HTMLDialogElement>('#leave-dialog');
  if (dialog.open) return false;
  return new Promise<boolean>(resolve => {
    const finish = (discard: boolean) => { dialog.close(); dialog.removeEventListener('cancel', cancel); q('[data-stay]', dialog).removeEventListener('click', stay); q('[data-discard]', dialog).removeEventListener('click', discardChanges); if (discard) forgetDraft(); resolve(discard); };
    const cancel = (event: Event) => { event.preventDefault(); finish(false); }, stay = () => finish(false), discardChanges = () => finish(true);
    dialog.addEventListener('cancel', cancel); q('[data-stay]', dialog).addEventListener('click', stay); q('[data-discard]', dialog).addEventListener('click', discardChanges); dialog.showModal(); q<HTMLButtonElement>('[data-stay]', dialog).focus();
  });
}
async function go(route: string, fromHistory = false, force = false) {
  if (!api) return;
  if (!force && route === currentRoute && view.childElementCount) { closeMenu(); return; }
  if (!await canLeave()) { if (fromHistory) history.replaceState(null, '', href(currentRoute)); return; }
  if (!fromHistory) history.pushState(null, '', href(route));
  leaveFeedback?.(); leaveFeedback = undefined;
  currentRoute = route; editor = undefined; const revision = ++generation; closeMenu();
  q('#topbar-section').textContent = titleOf(route);
  document.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach(link => { link.removeAttribute('aria-current'); if (link.dataset.route === route.split('/')[0]) link.setAttribute('aria-current', 'page'); });
  view.innerHTML = '<div class="panel" role="status">A abrir o teu conteúdo…</div>';
  try {
    const [section, id] = route.split('/');
    if (!section) dashboard();
    else if (section === 'feedback') { const { mountFeedbackModeration } = await import('./community-moderation'); if (revision === generation) leaveFeedback = mountFeedbackModeration(view); }
    else if (section === 'mods' && !id) renderMods();
    else if ((section === 'wiki' || section === 'changelog') && !id) await renderArticles(section, revision);
    else if (section === 'mods' && id) { const data = catalogue.mods.find((mod: Data) => mod.slug === id); if (!data) throw new Error('Mod desconhecido'); renderEditor({ kind: 'mod', document: await read('src/data/mods.json'), data: { ...data }, slug: id, dirty: false, busy: false }); }
    else if ((section === 'wiki' || section === 'changelog') && id) {
      if (!slugPattern.test(id)) throw new Error('Página desconhecida');
      const isNew = id === 'new'; const document = isNew ? { path: '', text: '' } : await read(`src/content/${section}/${id}.md`);
      if (revision !== generation) return;
      const article = isNew ? { data: section === 'wiki' ? { title: '', description: '', category: 'Getting started', order: 50, draft: true } : { title: '', version: '', date: new Date().toISOString().slice(0, 10), summary: '', draft: true }, body: '' } : readArticle(document.text);
      renderEditor({ kind: section, document, data: { ...article.data }, article, slug: isNew ? '' : id, dirty: false, busy: false });
    } else if (['home', 'settings', 'modpack'].includes(section)) {
      const document = await read(section === 'home' ? 'src/data/home.json' : 'src/data/site.json');
      if (revision !== generation) return;
      const data = JSON.parse(document.text); renderEditor({ kind: section, document, data: section === 'modpack' ? { ...data.modpack } : data, dirty: false, busy: false });
    } else view.innerHTML = heading('Esta página não existe.', 'Escolhe uma secção no menu para continuar.');
    if (revision === generation) window.scrollTo({ top: 0 });
  } catch (error) { if (revision === generation) view.innerHTML = heading('Não foi possível abrir esta página.', errorText(error), '<button type="button" class="admin-button secondary" data-action="retry">Tentar de novo</button>'); }
}
function dashboard() {
  view.innerHTML = heading('Olá, ROCKadm.', 'O que vamos criar hoje?') + `<section class="studio-hero"><div><span class="admin-eyebrow">Dá vida às tuas ideias</span><h2>O teu universo, bem organizado.</h2><p>Atualiza um mod, ajuda os jogadores com um guia ou prepara a próxima novidade.</p></div><a class="admin-button" href="#/mods">Gerir os mods <span aria-hidden="true">→</span></a></section>
    <div class="stats-grid"><a class="stat-card" href="#/mods"><div><strong>${catalogue.mods.length}</strong><span>Mods na coleção</span></div><span aria-hidden="true">◈</span></a><a class="stat-card" href="#/wiki"><div><strong>${files.wiki.length}</strong><span>Guias da wiki</span></div><span aria-hidden="true">▤</span></a><a class="stat-card" href="#/changelog"><div><strong>${files.changelog.length}</strong><span>Entradas de novidades</span></div><span aria-hidden="true">◷</span></a></div>
    <h2>Onde queres mexer?</h2><div class="quick-grid"><a class="quick-card" href="#/home"><h3>Página inicial</h3><p>Os títulos, os botões e a apresentação do site.</p><span class="card-link">Editar página <span aria-hidden="true">→</span></span></a><a class="quick-card" href="#/wiki/new"><h3>Um novo guia</h3><p>Explica uma funcionalidade ou ajuda a instalar um mod.</p><span class="card-link">Escrever guia <span aria-hidden="true">＋</span></span></a><a class="quick-card" href="#/modpack"><h3>${esc(site.modpack.name)}</h3><p>Acesso, versão e informações do teu modpack.</p><span class="card-link">Gerir modpack <span aria-hidden="true">→</span></span></a></div>
    <section class="panel"><div class="panel-heading"><h2>Últimas alterações</h2><a class="subtle-link" href="https://github.com/${repository}/commits/realm-studios-site/" target="_blank" rel="noopener noreferrer">Ver histórico <span class="external-mark" aria-hidden="true"></span></a></div><div id="recent-changes" role="status">A carregar as últimas alterações…</div></section>`;
  const revision = generation;
  void api!.request(`/repos/${repository}/commits?sha=realm-studios-site&per_page=4`).then(commits => {
    if (revision !== generation || !q('#recent-changes')) return;
    q('#recent-changes').innerHTML = commits.map((commit: Data) => `<a class="recent-row" href="https://github.com/${repository}/commit/${encodeURIComponent(commit.sha)}" target="_blank" rel="noopener noreferrer"><strong>${esc(commit.commit.message.split('\n')[0])}</strong><span>${esc(new Date(commit.commit.author.date).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }))} <span class="external-mark" aria-hidden="true"></span></span></a>`).join('');
  }).catch(() => { if (revision === generation && q('#recent-changes')) q('#recent-changes').textContent = 'O histórico está temporariamente indisponível.'; });
}
function listToolbar(placeholder: string, options: Array<[string, string]>) {
  return `<div class="list-toolbar"><label class="search-field"><span class="sr-admin">${esc(placeholder)}</span><input type="search" id="admin-search" placeholder="${esc(placeholder)}" /></label><label><span class="sr-admin">Filtrar lista</span><select id="admin-filter">${options.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('')}</select></label><span class="result-count" aria-live="polite" id="result-count"></span></div>`;
}
function filterList() { const query = q<HTMLInputElement>('#admin-search').value.toLocaleLowerCase(); const filter = q<HTMLSelectElement>('#admin-filter').value; let count = 0; view.querySelectorAll<HTMLElement>('[data-list-item]').forEach(item => { item.hidden = !(item.dataset.search!.includes(query) && (!filter || item.dataset.filter === filter)); if (!item.hidden) count++; }); q('#result-count').textContent = `${count} ${count === 1 ? 'resultado' : 'resultados'}`; q('#admin-empty').hidden = count !== 0; }
function bindFilter() { q('#admin-search').addEventListener('input', filterList); q('#admin-filter').addEventListener('change', filterList); filterList(); }
function renderMods() {
  view.innerHTML = heading('Os teus mods', 'Escolhe um mod para editar os textos, as imagens e o destaque na página inicial.') + listToolbar('Pesquisar mods…', [['', 'Todas as categorias'], ...site.categories.filter((category: string) => category !== 'All mods').map((category: string) => [category, categoryNames[category] ?? category])]) + `<div class="studio-mod-grid">${catalogue.mods.map((mod: Data) => {
    const release = releases.mods.find((release: Data) => release.slug === mod.slug)?.editions[0];
    return `<a class="studio-mod" href="#/mods/${esc(mod.slug)}" data-list-item data-search="${esc(`${mod.name} ${mod.description}`.toLocaleLowerCase())}" data-filter="${esc(mod.category)}"><div class="studio-mod-art">${mod.featured ? '<span class="badge featured">★ Em destaque</span>' : ''}<img src="${esc(picture(mod.image))}" alt="" width="106" height="106" /></div><div class="studio-mod-copy"><h2>${esc(mod.name)}</h2><p>${esc(categoryNames[mod.category] ?? mod.category)}${release ? ` · v${esc(release.version)}` : ''}</p><span class="card-link">Editar mod <span aria-hidden="true">→</span></span></div></a>`;
  }).join('')}</div><div class="empty-panel" id="admin-empty" hidden><h2>Nenhum mod encontrado.</h2><p>Experimenta outro nome ou uma categoria diferente.</p></div>`;
  bindFilter();
}
async function renderArticles(kind: string, revision: number) {
  const entries: Array<{ file: FileEntry; article: Article }> = [];
  for (let start = 0; start < files[kind].length; start += 5) {
    const batch = await Promise.all(files[kind].slice(start, start + 5).map(async file => ({ file, article: readArticle((await read(file.path)).text) })));
    if (revision !== generation) return;
    entries.push(...batch);
  }
  entries.sort((a, b) => kind === 'wiki' ? a.article.data.title.localeCompare(b.article.data.title) : String(b.article.data.date).localeCompare(String(a.article.data.date)));
  view.innerHTML = heading(kind === 'wiki' ? 'Guias da wiki' : 'Novidades do modpack', kind === 'wiki' ? 'Guias fáceis de encontrar. Edita os existentes ou começa um novo rascunho.' : 'Prepara as notas de cada versão e publica quando estiverem prontas.', actionLink(`${kind}/new`, kind === 'wiki' ? 'Novo guia' : 'Nova novidade')) + listToolbar(kind === 'wiki' ? 'Pesquisar guias…' : 'Pesquisar novidades…', [['', 'Todos os estados'], ['published', 'Publicados'], ['draft', 'Rascunhos']]) + `<div class="document-list">${entries.map(({ file, article: { data } }) => `<a class="document-row" href="#/${kind}/${esc(file.name.replace(/\.md$/, ''))}" data-list-item data-search="${esc(`${data.title} ${data.description ?? data.summary ?? ''}`.toLocaleLowerCase())}" data-filter="${data.draft ? 'draft' : 'published'}"><div><h2>${esc(data.title)}</h2><p>${esc(kind === 'wiki' ? categoryNames[data.category] ?? data.category : `Versão ${data.version} · ${data.date}`)}</p></div><span class="badge ${data.draft ? 'draft' : ''}">${data.draft ? 'Rascunho' : 'Publicado'}</span><span aria-hidden="true">→</span></a>`).join('')}</div><div class="empty-panel" id="admin-empty" hidden><h2>Ainda não há resultados.</h2><p>Experimenta outra pesquisa ou começa uma nova página.</p>${actionLink(`${kind}/new`, kind === 'wiki' ? 'Escrever guia' : 'Escrever novidade')}</div>`;
  bindFilter();
}

type Field = { name: string; label: string; type?: string; hint?: string; optional?: boolean; options?: Array<[string, string]>; readonly?: boolean };
function field(spec: Field, data: Data) {
  const text = esc(data[spec.name]); const id = `field-${spec.name}`;
  const control = spec.type === 'textarea' ? `<textarea id="${id}" name="${spec.name}" ${spec.optional ? '' : 'required'}>${text}</textarea>` : spec.options ? `<select id="${id}" name="${spec.name}">${spec.options.map(([value, label]) => `<option value="${esc(value)}" ${data[spec.name] === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>` : `<input id="${id}" name="${spec.name}" type="${spec.type ?? 'text'}" value="${text}" ${spec.optional ? '' : 'required'} ${spec.readonly ? 'readonly' : ''} ${spec.type === 'number' ? 'min="0" step="1"' : ''} ${spec.name === 'slug' ? 'pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="90"' : ''} />`;
  return `<div class="admin-field"><label for="${id}">${esc(spec.label)}</label>${control}${spec.optional || spec.hint ? `<small id="hint-${spec.name}">${spec.optional ? 'Opcional. ' : ''}${esc(spec.hint)}</small>` : ''}</div>`;
}
const group = (title: string, description: string, contents: string) => `<section class="editor-group"><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}${contents}</section>`;
const checkbox = (name: string, title: string, hint: string, checked: boolean) => `<label class="check-field"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''} /><span>${esc(title)}<small>${esc(hint)}</small></span></label>`;
function tabs(items: string[]) { return `<div class="editor-tabs" role="group" aria-label="Secções do formulário">${items.map((label, index) => `<button type="button" data-tab="${index}" aria-pressed="${index === 0}">${esc(label)}</button>`).join('')}</div>`; }
const tabPanel = (index: number, contents: string) => `<div data-panel="${index}" ${index ? 'hidden' : ''}>${contents}</div>`;
function modFields(data: Data) {
  return tabs(['Apresentação', 'Conteúdo', 'Imagens']) + tabPanel(0, group('A primeira impressão', 'Estes textos aparecem no catálogo e na página do mod.', [
    field({ name: 'name', label: 'Nome do mod' }, data), field({ name: 'label', label: 'Frase de apresentação' }, data), field({ name: 'description', label: 'Descrição curta', type: 'textarea' }, data), field({ name: 'category', label: 'Categoria', options: site.categories.filter((item: string) => item !== 'All mods').map((item: string) => [item, categoryNames[item] ?? item]) }, data), checkbox('featured', 'Destacar na página inicial', 'Mostra este mod entre os projetos em destaque.', !!data.featured),
  ].join(''))) + tabPanel(1, group('Conta a história do mod', 'Explica o que o jogador pode fazer e como começar.', [
    field({ name: 'story', label: 'Apresentação completa', type: 'textarea' }, data), field({ name: 'features', label: 'Funcionalidades', type: 'textarea', hint: 'Escreve uma funcionalidade por linha.' }, { features: data.features.join('\n') }), field({ name: 'firstStep', label: 'Como começar', type: 'textarea' }, data), field({ name: 'integrations', label: 'Compatibilidade e dependências', type: 'textarea', optional: true }, data),
  ].join(''))) + tabPanel(2, group('Logo do mod', 'Escolhe a imagem pela miniatura.', `<div class="image-choices">${boot.pictures.filter(item => item.key !== 'season8Logo').map(item => `<label class="image-choice"><input type="radio" name="image" value="${esc(item.key)}" ${data.image === item.key ? 'checked' : ''} required /><img src="${esc(item.src)}" alt="" width="75" height="75" /><span>${esc(modName(item.key))}</span></label>`).join('')}</div>`) + group('Imagens de jogo', 'Seleciona as capturas que queres mostrar na galeria.', `<div class="image-choices screenshot-choices">${boot.screenshots.map(item => `<label class="image-choice"><input type="checkbox" name="gallery" value="${esc(item.key)}" ${data.gallery?.includes(item.key) ? 'checked' : ''} /><img src="${esc(item.src)}" alt="" loading="lazy" /><span>${esc(item.label)}</span></label>`).join('')}</div>`) + group('Vídeo de apresentação', 'O vídeo aparece com controlos e sem reprodução automática.', field({ name: 'video', label: 'Vídeo', optional: true, options: [['', 'Sem vídeo'], ...Object.entries(boot.videos).map(([key, value]) => [key, value.label] as [string, string])] }, data)));
}
function homeFields(data: Data) {
  const items: Array<[string, string, Field[]]> = [
    ['Boas-vindas', 'A apresentação no topo da página.', [{ name: 'eyebrow', label: 'Texto pequeno acima do título' }, { name: 'heroTitle', label: 'Título principal' }, { name: 'heroEmphasis', label: 'Parte do título em destaque' }, { name: 'heroDescription', label: 'Introdução', type: 'textarea' }, { name: 'heroPrimary', label: 'Texto do botão dos mods' }, { name: 'heroSecondary', label: 'Texto do botão da wiki' }]],
    ['Coleção de mods', 'O título da secção que apresenta os projetos.', [{ name: 'collectionEyebrow', label: 'Texto pequeno' }, { name: 'collectionTitle', label: 'Título' }, { name: 'collectionEmphasis', label: 'Texto em destaque', optional: true }, { name: 'collectionLink', label: 'Texto da ligação para a coleção' }]],
    ['Wiki', 'O convite para consultar os guias.', [{ name: 'wikiEyebrow', label: 'Texto pequeno' }, { name: 'wikiTitle', label: 'Título' }, { name: 'wikiEmphasis', label: 'Texto em destaque', optional: true }, { name: 'wikiDescription', label: 'Descrição', type: 'textarea' }]],
    ['Modpack', 'A apresentação do modpack na página inicial.', [{ name: 'seasonLabel', label: 'Texto pequeno' }, { name: 'seasonTitle', label: 'Título' }, { name: 'seasonEmphasis', label: 'Texto em destaque', optional: true }, { name: 'seasonDescription', label: 'Descrição', type: 'textarea' }]],
  ];
  return tabs(items.map(([label]) => label)) + items.map(([title, description, fields], index) => tabPanel(index, group(title, description, fields.map(spec => field(spec, data)).join('')))).join('');
}
function articleFields(kind: string, data: Data, body: string, isNew: boolean, slug: string) {
  const metadata = kind === 'wiki' ? field({ name: 'description', label: 'Descrição curta', type: 'textarea' }, data) + `<div class="field-grid">${field({ name: 'category', label: 'Categoria', options: wikiCategories.map(item => [item, categoryNames[item] ?? item]) }, data)}${field({ name: 'mod', label: 'Mod associado', optional: true, options: [['', 'Guia geral'], ...catalogue.mods.map((mod: Data) => [mod.slug, mod.name])] }, data)}</div>` : `<div class="field-grid">${field({ name: 'version', label: 'Versão do modpack' }, data)}${field({ name: 'date', label: 'Data', type: 'date' }, data)}</div>` + field({ name: 'summary', label: 'Resumo', type: 'textarea' }, data);
  return group('Sobre esta página', 'Os textos do site são publicados em inglês.', field({ name: 'title', label: 'Título' }, data) + metadata + checkbox('draft', 'Guardar como rascunho', 'Os rascunhos ficam fora do site público até desmarcares esta opção.', !!data.draft)) + group('Conteúdo', 'Escreve diretamente no editor e usa os botões para formatar o texto.', `<label id="body-label" class="sr-admin">Conteúdo da página</label><div class="markdown-toolbar" role="group" aria-label="Formatação do texto"><button type="button" data-format="bold" aria-label="Negrito"><strong>B</strong></button><button type="button" data-format="heading" aria-label="Título de secção">H2</button><button type="button" data-format="list" aria-label="Lista">☷ Lista</button><button type="button" data-format="link" aria-label="Inserir ligação">Ligação</button><button type="button" data-format="code" aria-label="Bloco de código">&lt;/&gt;</button><button type="button" class="source-toggle" data-source aria-pressed="false">Markdown</button></div><div data-rich-editor class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="body-label">${cleanHtml(body)}</div><textarea name="body" class="markdown-source" aria-labelledby="body-label" hidden>${esc(body)}</textarea>`) + group('Endereço e organização', '', `<details class="advanced-options"><summary>${isNew ? 'Endereço da nova página' : 'Ver endereço e opções de organização'}</summary>${field({ name: 'slug', label: 'Endereço da página', readonly: !isNew, hint: isNew ? 'Criado a partir do título. Podes ajustá-lo antes de guardar.' : 'O endereço é fixo para preservar as ligações existentes.' }, { slug })}${kind === 'wiki' ? field({ name: 'order', label: 'Posição na lista', type: 'number', hint: 'Números mais baixos aparecem primeiro.' }, { order: data.order ?? 50 }) : ''}</details>`);
}
function settingsFields(data: Data) {
  return group('A identidade do estúdio', 'O nome e a descrição usados pelo site.', [field({ name: 'siteName', label: 'Nome do estúdio' }, data), field({ name: 'creator', label: 'Nome do criador' }, data), field({ name: 'description', label: 'Descrição do site', type: 'textarea' }, data)].join('')) + group('Onde te podem encontrar', 'Ligações usadas no menu e no rodapé.', [field({ name: 'github', label: 'Página no GitHub', type: 'url' }, data), field({ name: 'curseforge', label: 'Página no CurseForge', type: 'url' }, data)].join('')) + group('Outras opções', '', '<p>Para carregar ficheiros ou usar os controlos do editor anterior:</p><a class="admin-button secondary" href="/admin/legacy/">Abrir editor avançado <span class="external-mark" aria-hidden="true"></span></a>');
}
function modpackFields(data: Data) {
  return group('O teu modpack', 'Informações mostradas na página do modpack.', field({ name: 'name', label: 'Nome' }, data) + field({ name: 'version', label: 'Versão apresentada', optional: true, hint: 'Deixa em branco para usar a última novidade publicada.' }, data)) + group('Como os jogadores entram', 'Escolhe se o modpack é para o teu grupo ou tem um download público.', field({ name: 'distribution', label: 'Acesso', options: [['group', 'Reservado ao grupo'], ['public', 'Download público']] }, data) + `<div data-download-field>${field({ name: 'downloadUrl', label: 'Endereço do download', type: 'url', optional: true, hint: 'Obrigatório para disponibilizar um download público.' }, data)}</div>`);
}

function renderEditor(context: Editor) {
  editor = context;
  const { kind, data } = context; const isArticle = kind === 'wiki' || kind === 'changelog';
  const name = kind === 'mod' ? data.name : isArticle ? data.title || (kind === 'wiki' ? 'Novo guia' : 'Nova novidade') : labels[kind];
  const back = kind === 'mod' ? 'mods' : isArticle ? kind : '';
  const publicPath = kind === 'mod' ? `/mods/${context.slug}/` : kind === 'wiki' && context.slug ? `/wiki/${context.slug}/` : kind === 'changelog' && context.slug ? `/modpack/changelog/${context.slug}/` : kind === 'home' ? '/' : kind === 'modpack' ? '/modpack/' : kind === 'settings' ? '/' : undefined;
  view.innerHTML = `<a class="editor-back" href="${href(back)}">← ${back ? labels[back] : 'Visão geral'}</a>` + heading(name, kind === 'mod' ? 'Edita este mod e confirma a apresentação antes de publicar.' : 'Edita por secções e guarda quando estiver tudo pronto.', `${publicPath && !data.draft ? `<a class="admin-button quiet" href="${publicPath}" target="_blank" rel="noopener noreferrer">Ver página publicada <span class="external-mark" aria-hidden="true"></span></a>` : ''}<button type="button" class="admin-button secondary" data-action="preview" aria-pressed="true">Pré-visualização</button>`) + `<div id="editor-notice" class="editor-notice" role="status" aria-live="polite"></div><div class="editor-layout"><form class="editor-form" id="content-form" novalidate>${kind === 'mod' ? modFields(data) : kind === 'home' ? homeFields(data) : isArticle ? articleFields(kind, data, context.article!.body, !context.document.sha, context.slug!) : kind === 'modpack' ? modpackFields(data) : settingsFields(data)}<div class="save-bar"><span class="save-state" role="status">Sem alterações</span><div class="heading-actions"><button type="button" class="admin-button quiet" data-action="export">Exportar rascunho</button><button type="submit" class="admin-button primary" data-save disabled>Guardar e publicar <span aria-hidden="true"><span class="external-mark" aria-hidden="true"></span></span></button></div></div></form><aside class="editor-preview" aria-label="Pré-visualização das alterações"><span class="admin-eyebrow">Pré-visualização</span><div id="editor-preview-body"></div><p class="preview-caption">As alterações só chegam ao site depois de guardares e a publicação terminar.</p></aside></div>`;
  context.form = q<HTMLFormElement>('#content-form');
  context.form.addEventListener('input', event => {
    const target = event.target as HTMLElement;
    if (target.matches('[name=slug]')) target.dataset.manual = 'true';
    if (isArticle && target.matches('[name=title]') && !context.document.sha) { const slug = q<HTMLInputElement>('[name=slug]', context.form); if (!slug.dataset.manual) slug.value = makeSlug(value('title')); }
    if (target.closest('[data-rich-editor]')) q<HTMLTextAreaElement>('[name=body]', context.form).value = turndown.turndown(q('[data-rich-editor]', context.form).innerHTML);
    setDirty();
  });
  context.form.addEventListener('change', () => { updateDownloadField(); setDirty(); });
  context.form.addEventListener('submit', event => { event.preventDefault(); void saveEditor(); });
  q('[data-rich-editor]', context.form)?.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? ''); });
  restoreDraft(); updateDownloadField(); updatePreview();
}
function value(name: string): string { return (editor?.form?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value?.trim() ?? ''; }
const checked = (name: string) => !!q<HTMLInputElement>(`input[name="${name}"]`, editor!.form!).checked;
function updateDownloadField() { if (editor?.kind !== 'modpack') return; const isPublic = value('distribution') === 'public'; q<HTMLInputElement>('[name=downloadUrl]', editor.form).required = isPublic; q('[data-download-field]', editor.form).hidden = !isPublic; }
function updatePreview() {
  if (!editor?.form) return;
  const output = q('#editor-preview-body'); const { kind } = editor;
  if (kind === 'mod') { const selected = q<HTMLInputElement>('[name=image]:checked', editor.form)?.value ?? editor.data.image; output.innerHTML = `<img src="${esc(picture(selected))}" alt="" /><p class="preview-category">${esc(categoryNames[value('category')] ?? value('category'))}</p><h2>${esc(value('name'))}</h2><p>${esc(value('label'))}</p><p>${esc(value('description'))}</p><ul>${value('features').split('\n').filter(Boolean).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`; }
  else if (kind === 'wiki' || kind === 'changelog') output.innerHTML = `<span class="badge ${checked('draft') ? 'draft' : ''}">${checked('draft') ? 'Rascunho' : 'Público depois de guardar'}</span><h2 style="margin-top:18px">${esc(value('title') || 'O teu título')}</h2><p>${esc(value(kind === 'wiki' ? 'description' : 'summary'))}</p><div class="markdown-preview">${cleanHtml(value('body'))}</div>`;
  else if (kind === 'home') { const tab = q<HTMLElement>('[data-tab][aria-pressed=true]')?.dataset.tab ?? '0'; const keys = tab === '0' ? ['eyebrow', 'heroTitle', 'heroEmphasis', 'heroDescription'] : tab === '1' ? ['collectionEyebrow', 'collectionTitle', 'collectionEmphasis', 'collectionLink'] : tab === '2' ? ['wikiEyebrow', 'wikiTitle', 'wikiEmphasis', 'wikiDescription'] : ['seasonLabel', 'seasonTitle', 'seasonEmphasis', 'seasonDescription']; output.innerHTML = `<p class="preview-category">${esc(value(keys[0]))}</p><h2>${esc(value(keys[1]))} ${esc(value(keys[2]))}</h2><p>${esc(value(keys[3]))}</p>`; }
  else if (kind === 'modpack') output.innerHTML = `<img src="${esc(picture('season8Logo'))}" alt="" /><h2>${esc(value('name'))}</h2><p>${esc(value('version') || 'Versão da última novidade publicada')}</p><span class="badge">${value('distribution') === 'public' ? 'Download público' : 'Reservado ao grupo'}</span>`;
  else output.innerHTML = `<h2>${esc(value('siteName'))}</h2><p>Por ${esc(value('creator'))}</p><p>${esc(value('description'))}</p>`;
  output.querySelectorAll('a').forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
  const save = q<HTMLButtonElement>('[data-save]'); save.innerHTML = kind === 'wiki' || kind === 'changelog' ? (checked('draft') ? 'Guardar rascunho' : 'Guardar e publicar <span class="external-mark" aria-hidden="true"></span>') : 'Guardar e publicar <span class="external-mark" aria-hidden="true"></span>';
}
function showTab(index: string) { view.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== index; }); view.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === index))); updatePreview(); }
function collect(): { text: string; path: string; title: string; data: Data; article?: Article } {
  const context = editor!; const { kind } = context; let data: Data = { ...context.data };
  if (kind === 'mod') {
    for (const key of ['name', 'label', 'description', 'story', 'firstStep', 'integrations', 'category']) data[key] = value(key);
    data.features = value('features').split('\n').map(item => item.trim()).filter(Boolean); if (!data.features.length) throw new Error('Acrescenta pelo menos uma funcionalidade.');
    data.featured = checked('featured'); data.image = q<HTMLInputElement>('[name=image]:checked').value; data.gallery = new FormData(context.form).getAll('gallery').map(String); data.video = value('video');
    const source = updateMod(JSON.parse(context.document.text), context.slug!, data);
    return { path: context.document.path, text: JSON.stringify(source, null, 2) + '\n', title: data.name, data };
  }
  if (kind === 'wiki' || kind === 'changelog') {
    const slug = value('slug'); if (!slugPattern.test(slug) || slug === 'new') throw new Error('Escolhe um endereço com letras minúsculas, números e hífenes.');
    for (const key of kind === 'wiki' ? ['title', 'description', 'category', 'mod'] : ['title', 'version', 'date', 'summary']) data[key] = value(key);
    data.draft = checked('draft'); if (kind === 'wiki') data.order = Number(value('order'));
    const article = { data, body: value('body') }; const error = validateArticle(kind, article); if (error) throw new Error(error);
    return { path: context.document.path || `src/content/${kind}/${slug}.md`, text: writeArticle(article), title: data.title, data, article };
  }
  if (kind === 'home') { for (const key of Object.keys(context.data)) if (context.form!.elements.namedItem(key)) data[key] = value(key); }
  else if (kind === 'settings') { for (const key of ['siteName', 'creator', 'description', 'github', 'curseforge']) data[key] = value(key); if (!httpUrl(data.github) || !httpUrl(data.curseforge)) throw new Error('As ligações devem começar por https:// ou http://.'); }
  else {
    for (const key of ['name', 'version', 'distribution', 'downloadUrl']) data[key] = value(key);
    if (data.distribution === 'public' && !httpUrl(data.downloadUrl)) throw new Error('Indica um endereço de download válido para disponibilizar o modpack.');
    if (data.downloadUrl && !httpUrl(data.downloadUrl)) throw new Error('O endereço de download deve começar por https:// ou http://.');
  }
  const source = kind === 'modpack' ? { ...JSON.parse(context.document.text), modpack: data } : data;
  return { path: context.document.path, text: JSON.stringify(source, null, 2) + '\n', title: labels[kind], data };
}
async function saveEditor() {
  const context = editor; if (!context?.dirty || context.busy || !api) return;
  const invalid = Array.from(context.form!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')).find(input => !input.checkValidity());
  if (invalid) { const panel = invalid.closest<HTMLElement>('[data-panel]'); if (panel) showTab(panel.dataset.panel!); invalid.closest('details')?.setAttribute('open', ''); invalid.reportValidity(); invalid.focus(); return; }
  let result: ReturnType<typeof collect>;
  try { result = collect(); } catch (error) { notify((error as Error).message, true); return; }
  const previousRoute = currentRoute;
  context.busy = true; context.form!.setAttribute('aria-busy', 'true'); context.form!.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea').forEach(element => element.disabled = true); q<HTMLElement>('[data-rich-editor]', context.form)?.setAttribute('contenteditable', 'false'); notify('A guardar as alterações…');
  try {
    const response = await api.save({ ...context.document, path: result.path }, result.text, result.title);
    context.document = { path: result.path, sha: response.content.sha, text: result.text }; cache.set(result.path, context.document); context.data = result.data; context.article = result.article; context.dirty = false;
    forgetDraft(previousRoute);
    if (context.kind === 'mod') catalogue = JSON.parse(result.text);
    if (['settings', 'modpack'].includes(context.kind)) site = JSON.parse(result.text);
    if (['wiki', 'changelog'].includes(context.kind) && !context.slug) { context.slug = value('slug'); q<HTMLInputElement>('[name=slug]').readOnly = true; files[context.kind].push({ name: `${context.slug}.md`, path: result.path, sha: response.content.sha, type: 'file' }); currentRoute = `${context.kind}/${context.slug}`; history.replaceState(null, '', href(currentRoute)); }
    const state = q('.save-state'); state.textContent = 'Alterações guardadas'; state.classList.remove('dirty');
    notify(result.data.draft ? 'Rascunho guardado. Continua fora do site público.' : 'Alterações guardadas. A publicação do site está em curso.');
    void watchPublication(response.commit.sha);
  } catch (error) { notify(errorText(error), true); }
  finally { context.busy = false; context.form!.removeAttribute('aria-busy'); context.form!.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea').forEach(element => element.disabled = false); q<HTMLElement>('[data-rich-editor]', context.form)?.setAttribute('contenteditable', 'true'); q<HTMLButtonElement>('[data-save]').disabled = !context.dirty; }
}
async function watchPublication(sha: string) {
  const revision = ++publicationGeneration; const status = q('#publication-status');
  const show = (message: string, error = false) => { status.hidden = false; status.classList.toggle('error', error); status.innerHTML = `<span>${esc(message)}</span><a href="https://github.com/${repository}/commit/${encodeURIComponent(sha)}/checks" target="_blank" rel="noopener noreferrer">Ver estado <span class="external-mark" aria-hidden="true"></span></a>`; };
  show('Alterações guardadas · A aguardar a publicação…');
  for (let attempt = 0; attempt < 24 && api && revision === publicationGeneration; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 5000));
    if (!api || revision !== publicationGeneration) return;
    try {
      const data = await api.request(`/repos/${repository}/commits/${sha}/check-runs`);
      if (revision !== publicationGeneration) return;
      const failed = data.check_runs.find((check: Data) => check.status === 'completed' && !['success', 'neutral', 'skipped'].includes(check.conclusion));
      if (failed) { show(`As alterações ficaram guardadas, mas houve um erro em «${failed.name}». Abre o estado para ver os detalhes.`, true); return; }
      const deployed = data.check_runs.find((check: Data) => check.name === 'Cloudflare Pages' && check.conclusion === 'success');
      if (deployed && data.check_runs.every((check: Data) => check.status === 'completed')) { show('Publicado · O site já recebeu as alterações.'); return; }
    } catch { /* Keep the saved state and its history link if checks are delayed. */ }
  }
  if (revision === publicationGeneration) show('Alterações guardadas · A publicação ainda está a ser processada. Podes acompanhar o estado.');
}
function exportDraft() {
  if (!editor) return;
  let text: string;
  if (editor.previousDraft) { text = JSON.stringify(editor.previousDraft.values, null, 2); editor.previousDraft = undefined; try { sessionStorage.removeItem(localDraftKey() + ':previous'); } catch { /* Export still succeeds. */ } q('[data-action=export]').textContent = 'Exportar rascunho'; }
  else { try { text = collect().text; } catch { text = JSON.stringify(snapshot(editor.form!), null, 2); } }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `realm-${editor.slug || editor.kind}-rascunho.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function format(command: string) {
  if (!editor?.form) return;
  const source = q<HTMLTextAreaElement>('[name=body]', editor.form), rich = q<HTMLElement>('[data-rich-editor]', editor.form);
  if (!source.hidden) {
    const start = source.selectionStart, end = source.selectionEnd, selected = source.value.slice(start, end);
    const replacement = command === 'bold' ? `**${selected || 'texto'}**` : command === 'heading' ? `\n## ${selected || 'Título'}\n` : command === 'list' ? `\n- ${selected || 'Item'}\n` : command === 'code' ? `\n\`\`\`\n${selected || 'código'}\n\`\`\`\n` : `[${selected || 'texto'}](https://)`;
    source.setRangeText(replacement, start, end, 'select'); source.focus(); source.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  rich.focus();
  if (command === 'link') {
    const selection = window.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    if (!range || !rich.contains(range.commonAncestorContainer)) return;
    const dialog = q<HTMLDialogElement>('#link-dialog'); const form = q<HTMLFormElement>('form', dialog); form.reset();
    form.onsubmit = event => { event.preventDefault(); const url = q<HTMLInputElement>('[name=url]', form).value; if (!httpUrl(url)) { q<HTMLInputElement>('[name=url]', form).setCustomValidity('Usa um endereço http:// ou https://.'); form.reportValidity(); return; } dialog.close(); rich.focus(); selection!.removeAllRanges(); selection!.addRange(range); document.execCommand('createLink', false, url); rich.dispatchEvent(new Event('input', { bubbles: true })); };
    q<HTMLInputElement>('[name=url]', form).oninput = event => (event.target as HTMLInputElement).setCustomValidity(''); dialog.showModal(); return;
  }
  if (command === 'bold') document.execCommand('bold');
  else if (command === 'heading') document.execCommand('formatBlock', false, 'h2');
  else if (command === 'list') document.execCommand('insertUnorderedList');
  else document.execCommand('formatBlock', false, 'pre');
  rich.dispatchEvent(new Event('input', { bubbles: true }));
}
async function enter(token: string) {
  const status = q('#login-status'); status.textContent = 'A confirmar o acesso…';
  const client = new Repository(token);
  try {
    const user = await client.verify();
    const [modsDocument, siteDocument, releaseDocument, wiki, changelog] = await Promise.all([client.read('src/data/mods.json'), client.read('src/data/site.json'), client.read('src/data/releases.json'), client.list('src/content/wiki'), client.list('src/content/changelog')]);
    catalogue = JSON.parse(modsDocument.text); site = JSON.parse(siteDocument.text); releases = JSON.parse(releaseDocument.text); files = { wiki: wiki.filter(file => file.type === 'file' && file.name.endsWith('.md')), changelog: changelog.filter(file => file.type === 'file' && file.name.endsWith('.md')) };
    for (const document of [modsDocument, siteDocument, releaseDocument]) cache.set(document.path, document);
    api = client; try { sessionStorage.setItem(sessionKey, token); } catch { /* The current session remains in memory. */ }
    q('#admin-identity').textContent = `Sessão de ${user.login}`; login.hidden = true; app.hidden = false; status.textContent = '';
    await go(location.hash.replace(/^#\/?/, ''), true, true);
  } catch (error) { try { sessionStorage.removeItem(sessionKey); } catch { /* Nothing to clear. */ } api = undefined; status.textContent = error instanceof RepositoryError ? error.message : 'Não foi possível abrir o painel. Tenta entrar novamente.'; }
}
q<HTMLButtonElement>('#admin-signin').addEventListener('click', async event => { const button = event.currentTarget as HTMLButtonElement; button.disabled = true; q('#login-status').textContent = 'Conclui o login na janela do GitHub.'; try { await enter(await signIn()); } catch (error) { q('#login-status').textContent = (error as Error).message; } finally { button.disabled = false; } });
q('#admin-signout').addEventListener('click', async () => { if (!await canLeave()) return; publicationGeneration++; generation++; leaveFeedback?.(); leaveFeedback = undefined; api = undefined; editor = undefined; cache.clear(); view.innerHTML = ''; try { sessionStorage.removeItem(sessionKey); } catch { /* Storage can be disabled. */ } app.hidden = true; login.hidden = false; q('#publication-status').hidden = true; q('#login-status').textContent = 'Sessão terminada neste separador.'; history.replaceState(null, '', '#/'); });
q('.admin-menu').addEventListener('click', () => { const open = app.classList.toggle('menu-open'); q('.admin-menu').setAttribute('aria-expanded', String(open)); q('.admin-menu').setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu'); });
q('[data-cancel-link]').addEventListener('click', () => q<HTMLDialogElement>('#link-dialog').close());
document.addEventListener('keydown', event => { if (event.key === 'Escape' && app.classList.contains('menu-open')) { closeMenu(); q<HTMLButtonElement>('.admin-menu').focus(); } });
document.addEventListener('mousedown', event => { if ((event.target as Element).closest('[data-format]')) event.preventDefault(); });
document.addEventListener('click', event => {
  const target = event.target as Element; const link = target.closest<HTMLAnchorElement>('a[href^="#/"]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void go(link.hash.replace(/^#\/?/, '')); return; }
  const tab = target.closest<HTMLElement>('[data-tab]'); if (tab) { showTab(tab.dataset.tab!); return; }
  const button = target.closest<HTMLButtonElement>('[data-action]');
  if (button?.dataset.action === 'preview') { const layout = q('.editor-layout'); const hidden = layout.classList.toggle('preview-off'); button.setAttribute('aria-pressed', String(!hidden)); }
  if (button?.dataset.action === 'export') exportDraft();
  if (button?.dataset.action === 'retry') void go(currentRoute, true, true);
  const command = target.closest<HTMLElement>('[data-format]'); if (command) format(command.dataset.format!);
  if (target.closest('[data-source]') && editor?.form) { const source = q<HTMLTextAreaElement>('[name=body]', editor.form), rich = q('[data-rich-editor]', editor.form); source.hidden = !source.hidden; rich.hidden = !source.hidden; if (!rich.hidden) rich.innerHTML = cleanHtml(source.value); q('[data-source]').setAttribute('aria-pressed', String(!source.hidden)); }
});
window.addEventListener('hashchange', () => void go(location.hash.replace(/^#\/?/, ''), true));
window.addEventListener('beforeunload', event => { if (editor?.dirty) { event.preventDefault(); event.returnValue = ''; } });
try { const token = sessionStorage.getItem(sessionKey); if (token) void enter(token); } catch { /* Login still works without browser storage. */ }
