import { getCurrentMember, memberEvent, updateMember, type Member } from '../lib/member-store';
import { currentReleases, unreadEditions, compatibleEditions, type MemberCatalogue, type MemberMod, type MemberOperation, type MemberState } from '../lib/member-model';
import { getAuth } from '../lib/auth';
import { communityRpc, sameMember, verifiedMember } from '../lib/community';
import { deletePhoto, preparePhoto, showPhoto, uploadPhoto } from '../lib/profile-photo';
const mounted = new WeakSet<HTMLElement>();
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const smallButton = (action: string, id: string, label: string) => `<button type="button" class="member-small-button" data-collection-action="${action}" data-collection-id="${esc(id)}">${esc(label)}</button>`;
const empty = (title: string, description: string, path: string, label: string) => `<div class="member-empty"><h4>${esc(title)}</h4><p>${esc(description)}</p><a class="text-link" href="${path}">${label} <span aria-hidden="true">→</span></a></div>`;
function compatibleBadge(state: MemberState, mod: MemberMod) { if (!state.setup.minecraft && !state.setup.loader) return ''; const matches = compatibleEditions(state.setup, mod.editions).length > 0; return `<span class="member-compatibility" data-matches="${matches}">${matches ? 'Matches your setup' : 'Different version or loader'}</span>`; }

export function mountMemberDashboard(root: HTMLElement) {
  if (mounted.has(root)) return; mounted.add(root);
  const catalogue = JSON.parse(root.querySelector('#member-catalogue')!.textContent!) as MemberCatalogue;
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const form = q<HTMLFormElement>('[data-member-profile]'); const fields = form.querySelector('fieldset')!;
  let profileDirty = false; let savingProfile = false; let previousUserId: string | undefined;
  let pendingPhoto: Blob | null = null, removePhoto = false, previewUrl = '', photoRevision = 0, preparingPhoto = false;
  const photoInput = q<HTMLInputElement>('#member-photo'), photoPreview = q('[data-photo-preview]'), photoStatus = q('[data-photo-status]');
  function clearPhotoDraft() { pendingPhoto = null; removePhoto = false; preparingPhoto = false; photoRevision++; photoInput.value = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; photoStatus.textContent = ''; }
  const inFlight = new Set<string>();
  function feedback(message = '', error = false) { const status = q('[data-member-status]'); status.textContent = message; status.hidden = !message; status.dataset.tone = error ? 'error' : 'success'; }
  function render(member: Member | null) {
    if (!member) {
      previousUserId = undefined; profileDirty = false; form.reset(); clearPhotoDraft(); showPhoto(q('[data-member-avatar]'), '', 'Adventurer'); showPhoto(photoPreview, '', 'Adventurer'); q('[data-member-name]').textContent = 'Adventurer';
      q('[data-saved-mods]').replaceChildren(); q('[data-saved-guides]').replaceChildren(); q('[data-followed-mods]').replaceChildren(); q('[data-saved-count]').textContent = '0'; q('[data-follow-count]').textContent = '0'; q('[data-unread-count]').hidden = true; feedback(); return;
    }
    const { state } = member;
    if (previousUserId !== member.user.id) { profileDirty = false; form.reset(); clearPhotoDraft(); previousUserId = member.user.id; feedback(); }
    q('[data-member-name]').textContent = state.name || 'Adventurer';
    const path = state.photoPath.startsWith(`${member.user.id}/`) ? state.photoPath : '';
    showPhoto(q('[data-member-avatar]'), path, state.name);
    if (!profileDirty && !savingProfile) {
      q<HTMLInputElement>('[name=nickname]').value = state.name;
      q<HTMLSelectElement>('[name=minecraft]').value = state.setup.minecraft; q<HTMLSelectElement>('[name=loader]').value = state.setup.loader;
    }
    if (!pendingPhoto && !removePhoto) showPhoto(photoPreview, path, state.name);
    q<HTMLButtonElement>('[data-photo-remove]').disabled = savingProfile || (!path && !pendingPhoto);
    q('[data-saved-count]').textContent = String(state.favoriteMods.length + state.favoriteGuides.length); q('[data-follow-count]').textContent = String(Object.keys(state.follows).length);
    const unread = catalogue.mods.filter(mod => unreadEditions(state, mod).length > 0).length; q('[data-unread-count]').textContent = `${unread} new`; q('[data-unread-count]').hidden = unread === 0;
    q('[data-saved-mods]').innerHTML = state.favoriteMods.length ? state.favoriteMods.map(id => {
      const mod = catalogue.mods.find(mod => mod.slug === id);
      return mod ? `<article class="member-mod-card"><a href="/mods/${esc(mod.slug)}/"><div class="member-mod-image"><img src="${esc(mod.image)}" alt="" width="100" height="100" /></div><div class="member-mod-copy"><h4>${esc(mod.name)}</h4><p>${esc(mod.description)}</p>${compatibleBadge(state, mod)}</div></a><div class="member-mod-bottom"><a class="text-link" href="/mods/${esc(mod.slug)}/">View mod <span aria-hidden="true">→</span></a>${smallButton('remove-mod', id, 'Remove')}</div></article>` : `<article class="member-mod-card member-unavailable"><h4>Mod no longer listed</h4><p>${esc(id)}</p>${smallButton('remove-mod', id, 'Remove')}</article>`;
    }).join('') : empty('Start your own collection.', 'Use Save on a mod to keep it here. Your collection follows your account across devices.', '/mods/', 'Find your next mod');
    q('[data-saved-guides]').innerHTML = state.favoriteGuides.length ? state.favoriteGuides.map(id => { const guide = catalogue.guides.find(guide => guide.id === id); return `<article class="member-guide-row"><div>${guide ? `<a href="/wiki/${esc(guide.id)}/"><h4>${esc(guide.title)}</h4><p>${esc(guide.description)}</p></a>` : `<h4>Guide no longer available</h4><p>${esc(id)}</p>`}</div>${smallButton('remove-guide', id, 'Remove')}</article>`; }).join('') : empty('A little knowledge, saved for later.', 'Save a player guide while reading to add it to your list.', '/wiki/', 'Explore the wiki');
    const followed = catalogue.mods.filter(mod => Object.hasOwn(state.follows, mod.slug)).sort((a, b) => Number(unreadEditions(state, b).length > 0) - Number(unreadEditions(state, a).length > 0) || a.name.localeCompare(b.name));
    const selected = q<HTMLSelectElement>('[data-update-filter]').value === 'unread' ? followed.filter(mod => unreadEditions(state, mod).length > 0) : followed;
    q('[data-followed-mods]').innerHTML = selected.length ? selected.map(mod => {
      const news = unreadEditions(state, mod);
      return `<article class="member-follow-card"><div class="member-follow-heading"><img src="${esc(mod.image)}" alt="" width="60" height="60" /><div><a href="/mods/${esc(mod.slug)}/"><h4>${esc(mod.name)}</h4></a>${compatibleBadge(state, mod)}</div>${news.length ? '<span class="member-new-badge">New release</span>' : '<span class="member-current-badge">Up to date</span>'}</div><div class="member-editions">${mod.editions.map(edition => `<div><div><strong>v${esc(edition.version)}</strong><span>${esc(edition.loader)} · Minecraft ${esc(edition.minecraft)}</span>${news.some(item => item.id === edition.id) ? '<small>New</small>' : ''}</div><a class="text-link" href="${esc(edition.downloadUrl)}" aria-label="Download ${esc(mod.name)} for ${esc(edition.loader)} ${esc(edition.minecraft)}">Download <span aria-hidden="true">↓</span></a></div>`).join('')}</div><div class="member-follow-bottom">${news.length ? smallButton('read', mod.slug, 'Mark as read') : '<span>New versions will appear here.</span>'}${smallButton('unfollow', mod.slug, 'Unfollow')}</div></article>`;
    }).join('') : followed.length ? empty('You’re all caught up.', 'There are no unread releases for the mods you follow.', '/mods/', 'Explore more mods') : empty('Follow the projects you play.', 'Choose Follow updates on a mod page. New versions will be collected here.', '/mods/', 'Discover the mods');
    for (const id of Object.keys(state.follows).filter(id => !catalogue.mods.some(mod => mod.slug === id))) q('[data-followed-mods]').insertAdjacentHTML('beforeend', `<div class="member-guide-row"><div><h4>Mod no longer listed</h4><p>${esc(id)}</p></div>${smallButton('unfollow', id, 'Unfollow')}</div>`);
    root.querySelectorAll<HTMLButtonElement>('[data-collection-action]').forEach(button => { button.disabled = inFlight.has(`${button.dataset.collectionAction}:${button.dataset.collectionId}`); });
  }
  function activateTab(name: string, focus = false) {
    root.querySelectorAll<HTMLButtonElement>('[data-member-tab]').forEach(button => { const selected = button.dataset.memberTab === name; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; if (selected && focus) button.focus(); });
    root.querySelectorAll<HTMLElement>('[data-member-panel]').forEach(panel => { panel.hidden = panel.dataset.memberPanel !== name; });
    feedback();
  }
  root.addEventListener('click', async event => {
    const tab = (event.target as Element).closest<HTMLElement>('[data-member-tab]'); if (tab) { activateTab(tab.dataset.memberTab!); return; }
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-collection-action]'); if (!button) return;
    const action = button.dataset.collectionAction!, id = button.dataset.collectionId!, key = `${action}:${id}`; if (inFlight.has(key)) return;
    inFlight.add(key); button.disabled = true; feedback();
    let operation: MemberOperation;
    if (action === 'remove-mod' || action === 'remove-guide') operation = { type: action === 'remove-mod' ? 'favorite-mod' : 'favorite-guide', id, active: false };
    else if (action === 'unfollow') operation = { type: 'follow', id, active: false, releases: {} };
    else { const mod = catalogue.mods.find(mod => mod.slug === id); if (!mod) { inFlight.delete(key); return; } operation = { type: 'read', id, releases: currentReleases(mod.editions) }; }
    try { await updateMember(operation); feedback(action === 'read' ? 'Marked as read.' : 'Your collection has been updated.'); }
    catch { feedback('Your change could not be saved. Please try again.', true); }
    finally { inFlight.delete(key); render(getCurrentMember()); }
  });
  root.querySelector('[role=tablist]')!.addEventListener('keydown', event => {
    const keyboard = event as KeyboardEvent; const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-member-tab]')); const selected = tabs.findIndex(tab => tab === document.activeElement);
    if (selected < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(keyboard.key)) return; keyboard.preventDefault();
    const next = keyboard.key === 'Home' ? 0 : keyboard.key === 'End' ? tabs.length - 1 : (selected + (keyboard.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    activateTab(tabs[next].dataset.memberTab!, true);
  });
  q('[data-update-filter]').addEventListener('change', () => render(getCurrentMember()));
  form.addEventListener('input', () => { profileDirty = true; }); form.addEventListener('change', () => { profileDirty = true; });
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0]; if (!file) return;
    const revision = ++photoRevision, id = getCurrentMember()?.user.id; preparingPhoto = true; photoStatus.textContent = 'Preparing your photo…';
    try {
      const blob = await preparePhoto(file); if (revision !== photoRevision || !id || !sameMember(id)) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(blob); pendingPhoto = blob; removePhoto = false; profileDirty = true;
      photoPreview.dataset.photoKey = 'preview'; const image = new Image(); image.alt = 'New profile photo preview'; image.src = previewUrl; photoPreview.replaceChildren(image);
      q<HTMLButtonElement>('[data-photo-remove]').disabled = false; photoStatus.textContent = 'Photo ready. Save your profile to apply it.';
    } catch (error) { if (revision === photoRevision) photoStatus.textContent = (error as Error).message; }
    finally { if (revision === photoRevision) preparingPhoto = false; }
  });
  q('[data-photo-remove]').addEventListener('click', () => { clearPhotoDraft(); removePhoto = true; profileDirty = true; showPhoto(photoPreview, '', q<HTMLInputElement>('[name=nickname]').value); photoStatus.textContent = 'Photo will be removed when you save your profile.'; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (savingProfile || preparingPhoto || !form.reportValidity()) return;
    const values = new FormData(form); savingProfile = true; fields.disabled = true; feedback('Saving your profile…');
    const expected = getCurrentMember()?.user.id; let uploaded = '', metadataSaved = false;
    try {
      if (!expected) throw new Error('SESSION_CHANGED');
      const member = await verifiedMember(expected), oldPath = member.state.photoPath;
      const path = pendingPhoto ? (uploaded = await uploadPhoto(expected, pendingPhoto)) : removePhoto ? '' : oldPath;
      if (!sameMember(expected)) throw new Error('SESSION_CHANGED');
      await updateMember({ type: 'profile', name: String(values.get('nickname') ?? ''), avatar: member.state.avatar, photoPath: path, setup: { minecraft: String(values.get('minecraft') ?? ''), loader: String(values.get('loader') ?? '') } });
      metadataSaved = true; if (!sameMember(expected)) return;
      profileDirty = false; clearPhotoDraft();
      let synced = false; try { await verifiedMember(expected); await communityRpc('sync_profile'); synced = true; } catch { /* The account is saved; retrying also updates the public comment identity. */ }
      if (!sameMember(expected)) return;
      if (synced && oldPath && oldPath !== path && oldPath.startsWith(`${expected}/`)) await deletePhoto(oldPath).catch(() => {});
      feedback(synced ? 'Profile saved. Your preferences are available on your other devices.' : 'Profile saved. Your comment profile could not be refreshed yet; save again to retry.');
    } catch (error) {
      if (uploaded && !metadataSaved && expected && sameMember(expected)) {
        const { data } = await (await getAuth()).getUser();
        if (data.user?.id === expected && data.user.user_metadata?.realm_studios?.photoPath !== uploaded) await deletePhoto(uploaded).catch(() => {});
      }
      if (expected && sameMember(expected)) feedback(error instanceof Error && (/32 characters|photo/i.test(error.message)) ? error.message : 'Your profile could not be saved. Your edits are still here; please try again.', true);
    }
    finally { savingProfile = false; fields.disabled = false; render(getCurrentMember()); }
  });
  document.addEventListener(memberEvent, () => render(getCurrentMember())); render(getCurrentMember());
}
