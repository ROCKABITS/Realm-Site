import type { User } from '@supabase/supabase-js';
import { getAuth } from './auth';
import { memberNamespace, normaliseMember, applyMemberOperation, type MemberOperation, type MemberState } from './member-model';
export type Member = { user: User; state: MemberState };
let current: Member | null = null;
let loading: Promise<Member | null> | undefined;
let subscribed = false;
let queue: Promise<unknown> = Promise.resolve();
let revision = 0;
export const memberEvent = 'realm:member-changed';
export function getCurrentMember() { return current; }
export function setVerifiedMember(user: User | null) {
  revision++;
  current = user ? { user, state: normaliseMember(user.user_metadata) } : null;
  document.dispatchEvent(new CustomEvent(memberEvent, { detail: current }));
  if (user) void bindAuth();
}
async function bindAuth() {
  if (subscribed) return;
  const auth = await getAuth(); if (subscribed) return; subscribed = true;
  auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') setVerifiedMember(null);
    if (event === 'SIGNED_IN' && session?.user.id !== current?.user.id) {
      if (current) setVerifiedMember(null);
      // Auth callbacks hold the SDK lock. Verify outside that callback.
      window.setTimeout(() => { void loadMember(true).catch(() => {}); }, 0);
    }
    if (event === 'USER_UPDATED' && session?.user.id === current?.user.id) window.setTimeout(() => { void loadMember(true).catch(() => {}); }, 0);
  });
}
export async function loadMember(refresh = false): Promise<Member | null> {
  if (loading) return loading;
  if (current && !refresh) return current;
  const started = revision;
  loading = (async () => {
    const auth = await getAuth(); await bindAuth();
    const { data: { session }, error } = await auth.getSession(); if (error) throw error;
    if (!session) { if (started === revision) setVerifiedMember(null); return current; }
    const result = await auth.getUser();
    if (started === revision) setVerifiedMember(result.data.user ?? null);
    if (result.error) throw result.error;
    return current;
  })().finally(() => { loading = undefined; });
  return loading;
}
export function updateMember(operation: MemberOperation): Promise<Member> {
  const expectedId = current?.user.id;
  if (!expectedId) return Promise.reject(new Error('Sign in to save this to your account.'));
  const perform = async (): Promise<Member> => {
    const auth = await getAuth();
    const verified = await auth.getUser();
    if (verified.error || !verified.data.user || verified.data.user.id !== expectedId || current?.user.id !== expectedId) throw new Error('Your session has changed. Sign in again before saving.');
    const next = applyMemberOperation(normaliseMember(verified.data.user.user_metadata), operation);
    const result = await auth.updateUser({ data: { [memberNamespace]: next } });
    if (result.error) throw new Error(result.error.status === 429 ? 'Too many changes. Wait a moment and try again.' : 'Your changes could not be saved. Please try again.');
    if (!result.data.user || result.data.user.id !== expectedId || current?.user.id !== expectedId) throw new Error('Your session changed before the save completed.');
    setVerifiedMember(result.data.user); return current!;
  };
  const run = async (): Promise<Member> => navigator.locks ? await navigator.locks.request(`realm-member:${expectedId}`, perform) : await perform();
  const task = queue.then(run, run); queue = task.catch(() => {}); return task;
}
