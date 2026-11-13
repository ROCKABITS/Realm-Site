import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY?.trim();
let client: Promise<SupabaseClient> | undefined;

// All values here are public browser configuration. Never use a service-role key.
export const authConfigured = !!url && !!key && /^https:\/\//.test(url);

const timedFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
});

export async function getAuth() {
  if (!authConfigured) throw new Error('Account service is not configured');
  if (!client) client = import('@supabase/supabase-js').then(({ createClient }) => createClient(url!, key!, {
      auth: { storageKey: 'realm-studios-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: timedFetch },
    }));
  return (await client).auth;
}

export async function getAccountAvailability(): Promise<{ signup: boolean }> {
  if (!authConfigured) throw new Error('Account service is not configured');
  const response = await timedFetch(`${url}/auth/v1/settings`, { headers: { apikey: key! }, credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error('Account service is unavailable');
  const settings = await response.json();
  if (settings?.external?.email !== true) throw new Error('Email sign-in is unavailable');
  return { signup: settings.disable_signup !== true };
}

export function authErrorMessage(error: { code?: string; status?: number } | null): string {
  switch (error?.code) {
    case 'invalid_credentials': return 'That email and password combination did not work. Please try again.';
    case 'email_not_confirmed': return 'Confirm your email using the link in your inbox, then sign in.';
    case 'weak_password': return 'Choose a stronger password with at least 12 characters.';
    case 'same_password': return 'Choose a password different from your current one.';
    case 'signup_disabled': return 'New accounts are currently unavailable. Existing accounts can still sign in.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many attempts. Wait a moment before trying again.';
    case 'otp_expired':
    case 'flow_state_expired': return 'This email link has expired. Please request a new one.';
  }
  return error?.status === 429 ? 'Too many attempts. Wait a moment before trying again.' : 'We could not complete that request. Please try again in a moment.';
}
