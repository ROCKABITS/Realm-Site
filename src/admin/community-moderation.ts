import { communityRpc, communityError, escapeHtml as esc, verifiedMember, sameMember, type Comment } from '../lib/community';
import { getCurrentMember, loadMember, memberEvent } from '../lib/member-store';

export function mountFeedbackModeration(root: HTMLElement) {
  let active = true, busy = false, revision = 0, items: Comment[] = [], hasMore = false;
  root.innerHTML = '<div class="view-heading"><div><span class="admin-eyebrow">A tua comunidade</span><h1>Feedback</h1><p>Comentários dos mods e da wiki. Podes ocultar, restaurar ou apagar uma publicação.</p></div></div><div class="panel moderation-panel"><p role="status" data-moderation-status>A confirmar o acesso…</p><div data-moderation-list></div><button type="button" class="admin-button secondary" data-moderation-more hidden>Carregar mais comentários</button></div>';
  const status = root.querySelector<HTMLElement>('[data-moderation-status]')!, list = root.querySelector<HTMLElement>('[data-moderation-list]')!, more = root.querySelector<HTMLButtonElement>('[data-moderation-more]')!;
  function render() {
    list.innerHTML = items.length ? items.map(item => `<article class="moderation-comment" data-moderation-id="${esc(item.id)}"><div class="moderation-meta"><strong>${esc(item.display_name)}</strong><span class="badge ${item.hidden_at ? 'draft' : ''}">${item.hidden_at ? 'Oculto' : 'Público'}</span><time>${esc(new Date(item.created_at).toLocaleString('pt-PT'))}</time></div><a href="/${item.resource_type === 'mod' ? 'mods' : 'wiki'}/${esc(item.resource_id)}/#feedback" target="_blank" rel="noopener noreferrer">${item.resource_type === 'mod' ? 'Mod' : 'Guia'} · ${esc(item.resource_id)}</a><p>${esc(item.body)}</p><div class="moderation-actions"><button class="admin-button secondary" type="button" data-moderation-action="visibility">${item.hidden_at ? 'Restaurar comentário' : 'Ocultar comentário'}</button><button class="admin-button secondary" type="button" data-moderation-action="delete">Apagar definitivamente</button></div></article>`).join('') : '<div class="empty-state"><h2>A conversa começa aqui.</h2><p>Os comentários publicados nos mods e na wiki vão aparecer neste painel.</p></div>';
    more.hidden = !hasMore; root.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = busy);
  }
  async function refresh(append = false) {
    if (!active || busy) return;
    const ticket = ++revision; busy = true; status.textContent = 'A carregar os comentários…'; render();
    try {
      const member = await loadMember(true); if (!active || ticket !== revision) return;
      if (!member) { list.innerHTML = '<p>Entra também na tua <a href="/account/" target="_blank" rel="noopener noreferrer">conta do site</a> para moderar os comentários. Depois volta a este painel.</p>'; status.textContent = 'É necessária uma sessão do site.'; return; }
      const allowed = await communityRpc<boolean>('is_moderator'); if (!active || ticket !== revision) return;
      if (!allowed) { status.textContent = 'Esta conta do site não tem permissões de moderação. Entra com a conta de administrador.'; list.innerHTML = '<a href="/account/" target="_blank" rel="noopener noreferrer">Abrir a minha conta</a>'; return; }
      const cursor = append ? items.at(-1) : undefined;
      const data = await communityRpc<{ items: Comment[] }>('moderation', cursor ? { p_before_time: cursor.created_at, p_before_id: cursor.id } : {});
      if (!active || ticket !== revision || !sameMember(member.user.id)) return;
      const page = data.items.slice(0, 20); items = append ? [...items, ...page.filter(item => !items.some(old => old.id === item.id))] : page; hasMore = data.items.length > 20;
      status.textContent = 'Acesso de moderação ativo. Ocultar retira um comentário do site sem o apagar.'; render();
    } catch { if (active && ticket === revision) { status.textContent = 'Não foi possível carregar os comentários. Tenta abrir esta secção novamente.'; } }
    finally { if (active && ticket === revision) { busy = false; root.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false); } }
  }
  async function onClick(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-moderation-action]'); if (!button || busy || !active) return;
    const id = button.closest<HTMLElement>('[data-moderation-id]')!.dataset.moderationId!, item = items.find(item => item.id === id)!;
    const expected = getCurrentMember()?.user.id; if (!expected) return;
    if (button.dataset.moderationAction === 'delete' && !window.confirm('Apagar este comentário definitivamente? Esta ação não pode ser anulada.')) return;
    busy = true; render();
    try {
      await verifiedMember(expected); if (!active || !sameMember(expected)) return;
      if (button.dataset.moderationAction === 'delete') { await communityRpc('comment_delete', { p_comment: id }); items = items.filter(comment => comment.id !== id); }
      else { await communityRpc('set_hidden', { p_comment: id, p_hidden: !item.hidden_at }); item.hidden_at = item.hidden_at ? null : new Date().toISOString(); }
      if (active && sameMember(expected)) { status.textContent = 'Comentário atualizado.'; render(); }
    } catch (error) { if (active) status.textContent = communityError(error); }
    finally { if (active) { busy = false; root.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false); } }
  }
  more.addEventListener('click', () => { void refresh(true); }); list.addEventListener('click', onClick);
  let identity = getCurrentMember()?.user.id;
  const onMember = () => { const next = getCurrentMember()?.user.id; if (next === identity) return; identity = next; revision++; busy = false; items = []; hasMore = false; render(); void refresh(); };
  document.addEventListener(memberEvent, onMember); void refresh();
  return () => { active = false; revision++; document.removeEventListener(memberEvent, onMember); list.removeEventListener('click', onClick); };
}
