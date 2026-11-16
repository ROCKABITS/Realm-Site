import { loadMember, getCurrentMember, updateMember, memberEvent, type Member } from '../lib/member-store';
import { compatibleEditions, safeReturnPath, type MemberOperation, type Releases, type Edition } from '../lib/member-model';

const pending = new WeakSet<HTMLButtonElement>();
const intentKey = 'realm-member-pending-action';
function operationFor(button: HTMLButtonElement, member: Member | null): MemberOperation {
  const id = button.dataset.memberId!; const action = button.dataset.memberAction;
  if (action === 'follow') return { type: 'follow', id, active: !member || !Object.hasOwn(member.state.follows, id), releases: JSON.parse(button.dataset.memberReleases ?? '{}') as Releases };
  return { type: action === 'favorite-guide' ? 'favorite-guide' : 'favorite-mod', id, active: !member || !(action === 'favorite-guide' ? member.state.favoriteGuides : member.state.favoriteMods).includes(id) };
}
export function memberToast(message: string, error = false) {
  const toast = document.querySelector<HTMLElement>('#member-toast'); if (!toast) return;
  toast.querySelector<HTMLElement>('[data-toast-message]')!.textContent = message; toast.hidden = false; toast.dataset.tone = error ? 'error' : 'success';
}
function render(member: Member | null) {
  document.querySelectorAll<HTMLButtonElement>('[data-member-action]').forEach(button => {
    const id = button.dataset.memberId!; const action = button.dataset.memberAction!;
    const active = !!member && (action === 'follow' ? Object.hasOwn(member.state.follows, id) : (action === 'favorite-guide' ? member.state.favoriteGuides : member.state.favoriteMods).includes(id));
    button.setAttribute('aria-pressed', String(active)); button.disabled = pending.has(button);
    const name = button.dataset.memberName ?? 'this item';
    const label = action === 'follow' ? (active ? 'Following' : 'Follow updates') : (active ? 'Saved' : action === 'favorite-guide' ? 'Save guide' : 'Save');
    button.querySelector<HTMLElement>('[data-member-label]')!.textContent = label;
    button.setAttribute('aria-label', action === 'follow' ? `${active ? 'Unfollow' : 'Follow'} ${name}` : active ? `Remove ${name} from saved` : `Save ${name}`);
    button.title = button.getAttribute('aria-label')!;
  });
  const label = document.querySelector<HTMLElement>('[data-account-nav-label]');
  if (label) { label.textContent = member?.state.name || 'Account'; label.closest('a')!.title = member ? 'Your Realm account' : 'Sign in or create an account'; }
  document.querySelectorAll<HTMLElement>('[data-member-setup-note]').forEach(note => {
    const setup = member?.state.setup; note.hidden = !setup || (!setup.minecraft && !setup.loader); if (note.hidden) { note.replaceChildren(); return; }
    const editions = JSON.parse(note.dataset.memberEditions!) as Edition[]; const compatible = compatibleEditions(setup!, editions);
    note.textContent = compatible.length ? `Matches your setup: ${[setup!.minecraft, setup!.loader].filter(Boolean).join(' · ')}. ` : `No edition matches your saved setup: ${[setup!.minecraft, setup!.loader].filter(Boolean).join(' · ')}. `;
    const link = document.createElement('a'); link.href = compatible.length === 1 ? compatible[0].downloadUrl : compatible.length ? '#downloads' : '/account/'; link.textContent = compatible.length === 1 ? `Download ${compatible[0].loader} for Minecraft ${compatible[0].minecraft}` : compatible.length ? 'See compatible editions' : 'Edit your setup'; note.append(link); note.dataset.matches = String(compatible.length > 0);
  });
}

// Only an explicit Save/Follow click creates an intent. URL parameters cannot create one.
export async function completePendingMemberAction(): Promise<string | undefined> {
  let text: string | null;
  try { text = sessionStorage.getItem(intentKey); sessionStorage.removeItem(intentKey); } catch { return; }
  if (!text || text.length > 10_000) return;
  let intent: { operation: MemberOperation; created: number; next: string };
  try { intent = JSON.parse(text); } catch { return; }
  if (!intent || typeof intent !== 'object' || !intent.operation || typeof intent.operation !== 'object' || !['favorite-mod', 'favorite-guide', 'follow'].includes(intent.operation.type) || !('active' in intent.operation) || intent.operation.active !== true || typeof intent.created !== 'number' || Date.now() - intent.created > 15 * 60_000 || intent.created > Date.now()) return;
  const path = safeReturnPath(intent.next); if (!path) return;
  await updateMember(intent.operation); return path;
}

document.addEventListener(memberEvent, () => render(getCurrentMember()));
document.addEventListener('click', async event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-member-action]'); if (!button || pending.has(button)) return;
  pending.add(button); button.disabled = true; button.setAttribute('aria-busy', 'true');
  try {
    const member = await loadMember(); const operation = operationFor(button, member);
    if (!member) {
      const path = safeReturnPath(`/${operation.type === 'favorite-guide' ? 'wiki' : 'mods'}/${button.dataset.memberId}/`);
      if (path) { try { sessionStorage.setItem(intentKey, JSON.stringify({ operation, created: Date.now(), next: path })); } catch { /* Login still works when storage is disabled. */ } }
      location.assign(`/account/${path ? `?next=${encodeURIComponent(path)}` : ''}`); return;
    }
    await updateMember(operation);
    memberToast(operation.type === 'follow' ? operation.active ? 'Following this mod. New releases will appear in your account.' : 'You stopped following this mod.' : 'active' in operation && operation.active ? 'Saved to your account.' : 'Removed from your collection.');
  } catch (error) { memberToast(error instanceof Error && error.message.includes('session') ? error.message : 'We could not save that change. Please try again.', true); }
  finally { pending.delete(button); button.removeAttribute('aria-busy'); render(getCurrentMember()); }
});
document.querySelector('[data-toast-dismiss]')?.addEventListener('click', () => { document.querySelector<HTMLElement>('#member-toast')!.hidden = true; });
try { if (localStorage.getItem('realm-studios-auth') && !document.querySelector('[data-account-page]')) void loadMember().catch(() => {}); } catch { /* Account actions can initialise an in-memory session when clicked. */ }
