import type { User } from '@supabase/supabase-js';
import { getAuth, getAccountAvailability, authErrorMessage } from '../lib/auth';
import { setVerifiedMember, getCurrentMember } from '../lib/member-store';
import { safeReturnPath } from '../lib/member-model';
import { mountMemberDashboard } from './member-dashboard';
import { completePendingMemberAction } from './member-actions';

const page = document.querySelector<HTMLElement>('[data-account-page], [data-password-reset-page]');
if (page) void initialise(page);
// Email apps can reuse an already-open account tab without a document navigation.
window.addEventListener('hashchange', () => {
  const parameters = new URLSearchParams(location.hash.slice(1));
  if (page && (parameters.has('access_token') || parameters.has('error'))) location.reload();
});

async function initialise(root: HTMLElement) {
  const status = root.querySelector<HTMLElement>('[data-account-status]')!;
  const fields = root.querySelector<HTMLFieldSetElement>('[data-auth-fields]')!;
  const feedback = (message = '', tone = 'info') => { status.textContent = message; status.hidden = !message; status.dataset.tone = tone; };
  const unavailable = () => feedback('Visitor sign-in is currently unavailable. Please try again later. You can still browse the mods or use site administration.', 'error');
  const url = new URL(location.href);
  const emailLinkError = url.searchParams.has('error') || new URLSearchParams(url.hash.slice(1)).has('error');

  root.querySelectorAll<HTMLButtonElement>('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.getAttribute('aria-controls')!) as HTMLInputElement;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password'; button.textContent = reveal ? 'Hide' : 'Show'; button.setAttribute('aria-pressed', String(reveal));
    });
  });

  try {
    const availability = await getAccountAvailability();
    const auth = await getAuth();
    const { data: { session }, error: sessionError } = await auth.getSession();
    if (sessionError) { feedback('Your sign-in link could not be verified. Please sign in again or request another email.', 'error'); }
    const verifiedUser = session ? await auth.getUser() : null;
    const user = verifiedUser?.data.user ?? null;

    if (root.hasAttribute('data-password-reset-page')) {
      const form = root.querySelector<HTMLFormElement>('[data-reset-form]')!;
      const retry = root.querySelector<HTMLElement>('[data-retry-recovery]')!;
      history.replaceState(null, '', '/account/reset/');
      if (emailLinkError || !user) {
        feedback('Your recovery link is missing, expired or already used. Request a new email and open its latest link.', 'error');
        retry.hidden = false;
        // Remove expired link errors and any credentials left in the URL.
        history.replaceState(null, '', '/account/reset/');
        return;
      }
      feedback(); form.hidden = false; fields.disabled = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (fields.disabled || !form.reportValidity()) return;
        const password = form.querySelector<HTMLInputElement>('[name="password"]')!;
        const confirmation = form.querySelector<HTMLInputElement>('[name="confirm-password"]')!;
        if (password.value !== confirmation.value) { feedback('The passwords do not match.', 'error'); confirmation.focus(); return; }
        fields.disabled = true; feedback('Saving your new password…');
        try {
          const { error } = await auth.updateUser({ password: password.value });
          if (error) feedback(authErrorMessage(error), 'error');
          else { form.reset(); form.hidden = true; feedback('Your password has been updated. You can return to your account.', 'success'); }
        } catch { feedback(authErrorMessage(null), 'error'); }
        finally { fields.disabled = false; }
      });
      return;
    }

    const form = root.querySelector<HTMLFormElement>('[data-auth-form]')!;
    const authPanel = root.querySelector<HTMLElement>('[data-auth-panel]')!;
    const sessionPanel = root.querySelector<HTMLElement>('[data-session-panel]')!;
    const title = root.querySelector<HTMLElement>('[data-account-title]')!;
    const description = root.querySelector<HTMLElement>('[data-account-description]')!;
    const password = form.querySelector<HTMLInputElement>('[name="password"]')!;
    const submit = form.querySelector<HTMLButtonElement>('[data-auth-submit]')!;
    const signout = root.querySelector<HTMLButtonElement>('[data-signout]')!;
    const modeLinks = root.querySelectorAll<HTMLAnchorElement>('[data-auth-mode]');
    let mode = 'signin'; let busy = false;

    const setMode = (requested: string | null, clearFeedback = true) => {
      mode = ['signup', 'reset'].includes(requested ?? '') ? requested! : 'signin';
      if (mode === 'signup' && !availability.signup) mode = 'signin';
      if (clearFeedback) feedback();
      title.textContent = mode === 'signup' ? 'Join the Realm.' : mode === 'reset' ? 'Forgot your password?' : 'Welcome back.';
      description.textContent = mode === 'signup' ? 'Create your Realm account with your email and a password.' : mode === 'reset' ? 'We’ll send you a link to choose a new password.' : 'Sign in to your Realm account. New here? You can create one below.';
      modeLinks.forEach(link => {
        link.removeAttribute('aria-current');
        if (link.dataset.authMode === mode && link.closest('.account-tabs')) link.setAttribute('aria-current', 'page');
        if (link.dataset.authMode === 'signup' && !availability.signup) link.setAttribute('aria-disabled', 'true');
      });
      password.required = mode !== 'reset'; password.minLength = mode === 'signup' ? 12 : 1;
      password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      password.value = ''; password.type = 'password';
      const revealButton = form.querySelector<HTMLButtonElement>('[data-toggle-password]')!;
      revealButton.textContent = 'Show'; revealButton.setAttribute('aria-pressed', 'false');
      root.querySelector<HTMLElement>('[data-password-field]')!.hidden = mode === 'reset';
      root.querySelector<HTMLElement>('[data-password-hint]')!.hidden = mode !== 'signup';
      root.querySelector<HTMLElement>('.account-forgot')!.hidden = mode !== 'signin';
      root.querySelector<HTMLElement>('.account-return')!.hidden = mode !== 'reset';
      root.querySelector<HTMLElement>('[data-form-legend]')!.textContent = mode === 'reset' ? 'Request a password recovery email' : mode === 'signup' ? 'Create an account with your email and password' : 'Sign in with your email and password';
      submit.textContent = mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send recovery email' : 'Sign in';
      fields.disabled = false;
    };
    let returnHandled = false;
    const signedIn = (currentUser: User) => {
      const alreadyVisible = root.classList.contains('member-active') && getCurrentMember()?.user.id === currentUser.id;
      if (!alreadyVisible) feedback(); authPanel.hidden = true; sessionPanel.hidden = false; form.reset(); root.classList.add('member-active');
      title.textContent = 'Your Realm account.'; description.textContent = 'Your favourite mods, saved guides and the projects you follow. All in one place.';
      root.querySelector<HTMLElement>('[data-session-email]')!.textContent = currentUser.email ?? 'Realm account';
      if (!alreadyVisible) setVerifiedMember(currentUser); mountMemberDashboard(root.querySelector<HTMLElement>('[data-member-dashboard]')!);
      if (!returnHandled) {
        returnHandled = true;
        void (async () => {
          try { const pendingPath = await completePendingMemberAction(); const path = pendingPath ?? safeReturnPath(url.searchParams.get('next')); if (path) location.assign(path); }
          catch { feedback('You are signed in, but the item could not be saved. You can try again from its page.', 'error'); }
        })();
      }
    };
    const signedOut = () => { authPanel.hidden = false; sessionPanel.hidden = true; root.classList.remove('member-active'); root.querySelector<HTMLElement>('[data-session-email]')!.textContent = ''; setVerifiedMember(null); setMode(null); };

    modeLinks.forEach(link => link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); if (busy) return;
      if (link.getAttribute('aria-disabled') === 'true') { feedback('New accounts are currently unavailable.', 'error'); return; }
      history.pushState(null, '', link.href); setMode(link.dataset.authMode ?? null);
    }));
    window.addEventListener('popstate', () => { if (!authPanel.hidden) setMode(new URL(location.href).searchParams.get('mode')); });

    if (user) signedIn(user);
    else { setMode(url.searchParams.get('mode')); if (emailLinkError || sessionError) feedback('Your email link has expired or could not be verified. Please request a new one.', 'error'); }
    // The SDK consumes valid email-link fragments. Remove error parameters too.
    if (emailLinkError || url.hash) history.replaceState(null, '', '/account/');

    auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') signedOut();
      if (event === 'SIGNED_IN' && nextSession) {
        // Avoid awaiting another auth method inside the SDK's session lock.
        window.setTimeout(async () => { const { data } = await auth.getUser(); if (data.user) signedIn(data.user); }, 0);
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || fields.disabled || !form.reportValidity()) return;
      const email = form.querySelector<HTMLInputElement>('[name="email"]')!.value.trim();
      const secret = password.value;
      const action = mode;
      busy = true; fields.disabled = true; form.setAttribute('aria-busy', 'true');
      feedback(action === 'reset' ? 'Sending your recovery email…' : action === 'signup' ? 'Creating your account…' : 'Signing you in…');
      try {
        if (action === 'reset') {
          const { error } = await auth.resetPasswordForEmail(email, { redirectTo: new URL('/account/reset/', location.origin).href });
          if (error) feedback(authErrorMessage(error), 'error');
          else feedback('If an account exists for that email, a recovery link is on its way. Check your inbox and spam folder.', 'success');
        } else if (action === 'signup') {
          const { data, error } = await auth.signUp({ email, password: secret, options: { emailRedirectTo: new URL('/account/', location.origin).href } });
          if (error) feedback(authErrorMessage(error), 'error');
          else if (data.session) { const { data: verified } = await auth.getUser(); if (verified.user) signedIn(verified.user); else feedback(authErrorMessage(null), 'error'); }
          else { setMode('signin'); history.replaceState(null, '', '/account/'); feedback('Check your inbox for the confirmation link. If you already have an account, you can sign in or reset your password.', 'success'); }
        } else {
          const { error } = await auth.signInWithPassword({ email, password: secret });
          if (error) feedback(authErrorMessage(error), 'error');
          else { const { data } = await auth.getUser(); if (data.user) signedIn(data.user); else feedback(authErrorMessage(null), 'error'); }
        }
      } catch { feedback(authErrorMessage(null), 'error'); }
      finally { busy = false; fields.disabled = false; form.removeAttribute('aria-busy'); password.value = ''; }
    });
    signout.addEventListener('click', async () => {
      if (signout.disabled) return;
      signout.disabled = true;
      try { const { error } = await auth.signOut({ scope: 'local' }); if (error) feedback(authErrorMessage(error), 'error'); else { history.replaceState(null, '', '/account/'); signedOut(); feedback('You have signed out of this browser.', 'success'); } }
      catch { feedback(authErrorMessage(null), 'error'); }
      finally { signout.disabled = false; }
    });
  } catch {
    if (location.hash) history.replaceState(null, '', url.pathname + url.search);
    unavailable();
  }
}
