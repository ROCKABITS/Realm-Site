import { communityRpc, communityError, escapeHtml as esc, verifiedMember, sameMember, type Comment, type Summary } from '../lib/community';
import { getCurrentMember, loadMember, memberEvent } from '../lib/member-store';
import { showPhoto } from '../lib/profile-photo';

document.querySelectorAll<HTMLElement>('[data-feedback]').forEach(root => {
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const args = { p_type: root.dataset.kind!, p_id: root.dataset.resource! };
  const form = q<HTMLFormElement>('[data-feedback-compose]'), body = form.elements.namedItem('body') as HTMLTextAreaElement;
  const like = q<HTMLButtonElement>('[data-feedback-like]'), more = q<HTMLButtonElement>('[data-feedback-more]');
  const list = q('[data-feedback-comments]'), status = q('[data-feedback-status]');
  let identity = getCurrentMember()?.user.id ?? null, generation = 0, busy = false, ready = false;
  let summary: Summary = { likes: 0, comments: 0, liked: false, moderator: false }, comments: Comment[] = [], cursor: Comment | undefined, hasMore = false;
  function message(text = '', error = false) { status.textContent = text; status.hidden = !text; status.dataset.error = String(error); }
  function controls() {
    like.disabled = busy || !ready; more.disabled = busy || !ready;
    form.hidden = !identity; q('[data-feedback-gate]').hidden = !!identity;
    body.disabled = busy || !ready;
    form.querySelector<HTMLButtonElement>('[type=submit]')!.disabled = busy || !ready;
    list.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = busy || !ready);
    q<HTMLButtonElement>('[data-feedback-refresh]').disabled = busy;
  }
  function renderSummary() {
    q('[data-like-count]').textContent = String(summary.likes); q('[data-comment-count]').textContent = String(summary.comments);
    q('[data-like-label]').textContent = summary.liked ? 'Liked' : 'Like';
    like.setAttribute('aria-pressed', String(summary.liked)); like.setAttribute('aria-label', `${summary.liked ? 'Unlike' : 'Like'} ${root.dataset.name}`);
  }
  function renderComments() {
    list.innerHTML = comments.length ? comments.map(comment => {
      const date = new Date(comment.created_at), edited = new Date(comment.updated_at).getTime() - date.getTime() > 1000;
      return `<article class="feedback-comment" data-comment="${esc(comment.id)}"><span class="feedback-avatar" data-comment-photo></span><div class="feedback-comment-content"><div class="feedback-comment-meta"><strong>${esc(comment.display_name)}</strong>${comment.moderator ? '<span class="feedback-team">Realm team</span>' : ''}<time datetime="${esc(comment.created_at)}">${esc(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</time>${edited ? '<span class="feedback-edited">edited</span>' : ''}</div><p class="feedback-comment-body">${esc(comment.body)}</p><div class="feedback-comment-actions">${comment.can_edit ? '<button class="feedback-text-button" type="button" data-comment-action="edit">Edit</button>' : ''}${comment.can_delete ? '<button class="feedback-text-button" type="button" data-comment-action="delete">Delete</button>' : ''}${summary.moderator ? '<button class="feedback-text-button" type="button" data-comment-action="hide">Hide</button>' : ''}</div></div></article>`;
    }).join('') : '<div class="feedback-empty"><p>No comments yet.</p><span>Be the first to share your experience.</span></div>';
    list.querySelectorAll<HTMLElement>('[data-comment]').forEach(row => { const comment = comments.find(item => item.id === row.dataset.comment)!; showPhoto(row.querySelector('[data-comment-photo]')!, comment.avatar_path || '', comment.display_name); });
    more.hidden = !hasMore; controls();
  }
  async function refresh() {
    const revision = ++generation; ready = false; controls(); message('Loading community feedback…');
    try {
      const [nextSummary, page] = await Promise.all([communityRpc<Summary>('summary', args), communityRpc<{ items: Comment[] }>('page', args)]);
      if (revision !== generation) return;
      summary = nextSummary; comments = page.items.slice(0, 20); hasMore = page.items.length > 20; cursor = comments.at(-1); ready = true;
      renderSummary(); renderComments(); message();
    } catch (error) { if (revision === generation) { message(communityError(error), true); controls(); } }
  }
  function signIn() { location.assign(`/account/?next=${encodeURIComponent(location.pathname)}`); }
  async function write(action: (id: string) => Promise<void>) {
    if (busy || !ready) return;
    if (!identity) { signIn(); return; }
    const id = identity, revision = generation; busy = true; controls(); message();
    try { await verifiedMember(id); if (!sameMember(id) || revision !== generation) return; await action(id); }
    catch (error) { if (sameMember(id) && revision === generation) message(communityError(error), true); }
    finally { if (sameMember(id)) { busy = false; controls(); } }
  }
  like.addEventListener('click', () => { void write(async id => {
    const result = await communityRpc<Summary>('like', { ...args, p_active: !summary.liked });
    if (sameMember(id)) { summary = result; renderSummary(); }
  }); });
  form.addEventListener('input', () => { q('[data-feedback-length]').textContent = `${Array.from(body.value).length.toLocaleString('en-GB')} / 2,000`; });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!body.value.trim() || Array.from(body.value.trim()).length > 2000) { message('Write between 1 and 2,000 characters.', true); return; }
    const draft = body.value;
    void write(async id => { await communityRpc('comment_create', { ...args, p_body: draft }); if (sameMember(id)) { body.value = ''; q('[data-feedback-length]').textContent = '0 / 2,000'; await refresh(); message('Comment posted. Thank you for sharing your feedback.'); } });
  });
  more.addEventListener('click', async () => {
    if (busy || !cursor) return; const revision = generation; busy = true; controls();
    try {
      const page = await communityRpc<{ items: Comment[] }>('page', { ...args, p_before_time: cursor.created_at, p_before_id: cursor.id });
      if (revision !== generation) return;
      const next = page.items.slice(0, 20); comments.push(...next.filter(item => !comments.some(old => old.id === item.id))); hasMore = page.items.length > 20; cursor = next.at(-1); renderComments(); message();
    } catch (error) { if (revision === generation) message(communityError(error), true); }
    finally { if (revision === generation) { busy = false; controls(); } }
  });
  async function confirmDelete() {
    const dialog = q<HTMLDialogElement>('[data-feedback-delete]'); dialog.returnValue = 'cancel'; dialog.showModal();
    return new Promise<boolean>(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true }));
  }
  list.addEventListener('click', async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-comment-action]'); if (!button || busy) return;
    const row = button.closest<HTMLElement>('[data-comment]')!, comment = comments.find(item => item.id === row.dataset.comment)!;
    const action = button.dataset.commentAction;
    if (action === 'edit' && comment.can_edit) {
      row.querySelector('.feedback-comment-content')!.innerHTML = `<form data-feedback-edit><label for="edit-${esc(comment.id)}">Edit your comment</label><textarea id="edit-${esc(comment.id)}" name="body" rows="4" maxlength="4000" required>${esc(comment.body)}</textarea><div class="feedback-comment-actions"><button class="feedback-text-button" type="submit">Save changes</button><button class="feedback-text-button" type="button" data-comment-action="cancel">Cancel</button></div></form>`;
      row.querySelector('textarea')!.focus(); return;
    }
    if (action === 'cancel') { renderComments(); return; }
    if (action !== 'delete' && action !== 'hide') return;
    const expected = identity; if (action === 'delete' && !await confirmDelete()) return; if (identity !== expected) return;
    void write(async id => {
      await communityRpc(action === 'delete' ? 'comment_delete' : 'set_hidden', { p_comment: comment.id, ...(action === 'hide' ? { p_hidden: true } : {}) });
      if (sameMember(id)) await refresh();
    });
  });
  list.addEventListener('submit', event => {
    const edit = (event.target as Element).closest<HTMLFormElement>('[data-feedback-edit]'); if (!edit) return; event.preventDefault();
    const comment = comments.find(item => item.id === edit.closest<HTMLElement>('[data-comment]')!.dataset.comment)!;
    const draft = String(new FormData(edit).get('body') ?? '').trim();
    if (!draft || Array.from(draft).length > 2000) { message('Write between 1 and 2,000 characters.', true); return; }
    void write(async id => { await communityRpc('comment_edit', { p_comment: comment.id, p_body: draft }); if (sameMember(id)) { comment.body = draft; comment.updated_at = new Date().toISOString(); renderComments(); message('Comment updated.'); } });
  });
  q('[data-feedback-refresh]').addEventListener('click', () => { void refresh(); });
  document.addEventListener(memberEvent, () => {
    const next = getCurrentMember()?.user.id ?? null; if (next === identity) return;
    identity = next; busy = false; form.reset(); q('[data-feedback-length]').textContent = '0 / 2,000'; comments = []; list.replaceChildren();
    const dialog = q<HTMLDialogElement>('[data-feedback-delete]'); if (dialog.open) dialog.close('cancel');
    void refresh();
  });
  void loadMember().catch(() => {}); void refresh();
});
