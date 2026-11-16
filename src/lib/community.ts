import { getSupabase } from './auth';
import { getCurrentMember, loadMember } from './member-store';

export type Comment = { id: string; body: string; author_id: string; display_name: string; avatar_path: string | null; created_at: string; updated_at: string; can_edit: boolean; can_delete: boolean; moderator: boolean; resource_type?: 'mod' | 'guide'; resource_id?: string; hidden_at?: string | null };
export type Summary = { likes: number; comments: number; liked: boolean; moderator: boolean };
export async function communityRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (await getSupabase()).rpc(`realm_feedback_${name}`, args);
  if (error) throw error;
  return data as T;
}
export async function verifiedMember(expected?: string) {
  const member = await loadMember(true);
  if (!member || (expected && member.user.id !== expected)) throw new Error('SESSION_CHANGED');
  return member;
}
export function sameMember(id: string) { return getCurrentMember()?.user.id === id; }
export function communityError(error: unknown): string {
  const value = error as { message?: string; code?: string };
  if (value?.message?.includes('COMMENT_RATE_LIMIT')) return 'Please wait 30 seconds between comments. The daily limit is 50 comments.';
  if (value?.message?.includes('COMMENT_LENGTH')) return 'Write between 1 and 2,000 characters.';
  if (value?.message === 'SESSION_CHANGED' || value?.code === '42501' || value?.code === 'PGRST301') return 'Your session or permissions changed. Refresh the page and sign in again.';
  if (value?.code === 'PGRST202') return 'Community feedback is being set up. Please try again shortly.';
  return 'We could not complete that request. Please try again.';
}
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
