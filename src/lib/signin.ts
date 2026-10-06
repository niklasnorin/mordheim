/**
 * The sign-in form's behaviour, shared by the sign-in page (/signin/) and the Curfew's own gate, so the two never
 * drift. The form carries `data-mode` and three marked parts (`[data-auth-submit]`, `[data-auth-note]`,
 * `[data-auth-forgot]`); its tabs and the forgotten-password link carry `data-mode` too. Three ways through: sign in,
 * sign up (with the word at the gate when the campaign has one), or trade a game master's reset word for a new
 * password. A local development form signs in by name alone. On success, `done` decides where the browser goes.
 */
import { createAuthClient } from 'better-auth/client';

type Mode = 'in' | 'up' | 'reset';
const NOTE: Record<Mode, string> = {
  in: 'Signed in once, you stay signed in on this device for a Moon or so.',
  up: 'No emails are sent; the address is only your name at the gate. Keep the password somewhere; the game master can issue a reset word if it is lost.',
  reset: 'Ask the game master for a reset word, then give it here with a new password. Every device is signed out.',
};
const LABEL: Record<Mode, string> = { in: 'Sign in', up: 'Take the oath', reset: 'Set the new password' };

export interface SignInOptions {
  base: string;
  form: HTMLFormElement | null;
  /** The development sign-in by name, where the deployment has one. */
  devForm?: HTMLFormElement | null;
  toast: (text: string) => void;
  /** Where to go once the gate opens. */
  done: () => void;
}

export function authClientFor(base: string) {
  return createAuthClient({ baseURL: location.origin, basePath: `${base}/api/auth` });
}

/**
 * Where a sign-in should return to: a path on this site, from `?next=`, never another origin. Anything else goes
 * to the fallback.
 */
export function nextPath(base: string, given: string | null, fallback: string): string {
  if (!given || !given.startsWith('/') || given.startsWith('//') || given.includes('\\')) return fallback;
  return base && !given.startsWith(`${base}/`) && given !== base ? fallback : given;
}

export function wireSignIn({ base, form, devForm, toast, done }: SignInOptions): void {
  const authClient = authClientFor(base);
  if (form) {
    const part = <T extends HTMLElement>(name: string) => form.querySelector<T>(`[data-auth-${name}]`)!;
    const setMode = (mode: Mode) => {
      form.dataset.mode = mode;
      form.querySelectorAll<HTMLElement>('[data-when-up]').forEach((f) => { f.hidden = mode !== 'up'; });
      form.querySelectorAll<HTMLElement>('[data-when-reset]').forEach((f) => { f.hidden = mode !== 'reset'; });
      form.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
      const pwField = form.querySelector<HTMLElement>('[data-auth-password]')!, pw = pwField.querySelector('input')!;
      pw.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
      pwField.firstChild!.textContent = mode === 'reset' ? 'New password' : 'Password';
      part('submit').textContent = LABEL[mode];
      part('note').textContent = NOTE[mode];
      part('forgot').hidden = mode !== 'in';
    };
    form.querySelectorAll<HTMLButtonElement>('[role=tab], [data-auth-forgot]').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode as Mode)));
    setMode('in');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const email = String(data.get('email') ?? '').trim(), password = String(data.get('password') ?? '');
      const mode = form.dataset.mode as Mode;
      if (!email || !password) { toast('Email and password, both.'); return; }
      if (password.length < 8) { toast('The password needs at least eight characters.'); return; }
      const button = part<HTMLButtonElement>('submit');
      button.disabled = true;
      try {
        if (mode === 'reset') {
          const word = String(data.get('word') ?? '').trim();
          if (!word) throw new Error('The reset word, as the game master gave it to you.');
          const res = await fetch(new URL(`${base}/api/account/reset`, location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, word, newPassword: password }), credentials: 'same-origin' });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out.error ?? 'The city did not answer. Try again.');
          const { error } = await authClient.signIn.email({ email, password });
          if (error) throw new Error(error.message ?? 'The password is set, but the gate did not open. Sign in again.');
        } else if (mode === 'up') {
          const name = String(data.get('name') ?? '').trim();
          if (!name) throw new Error('Tell us your name.');
          const inviteCode = String(data.get('inviteCode') ?? '').trim();
          const { error } = await authClient.signUp.email({ email, password, name, ...(inviteCode ? { inviteCode } : {}) } as never);
          if (error) throw new Error(error.message ?? 'The gate did not open.');
        } else {
          const { error } = await authClient.signIn.email({ email, password });
          if (error) throw new Error(error.message ?? 'The gate did not open.');
        }
        done();
      } catch (err) {
        button.disabled = false;
        toast((err as Error).message);
      }
    });
  }
  // local development: a name becomes a player, created on first use
  devForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(devForm).get('name') ?? '').trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
    const email = `${slug}@curfew.local`, password = devForm.dataset.password!;
    devForm.querySelector('button')!.disabled = true;
    let { error } = await authClient.signIn.email({ email, password });
    if (error) ({ error } = await authClient.signUp.email({ email, password, name }));
    if (error) { devForm.querySelector('button')!.disabled = false; toast(error.message ?? 'The gate did not open.'); return; }
    done();
  });
}
