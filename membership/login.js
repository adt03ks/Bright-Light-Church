
'use strict';

(() => {
  const el = id => document.getElementById(id);

  const msg = (text, isError = false) => {
    const n = el('message');
    n.textContent = text;
    n.className = 'notice' + (isError ? ' error' : ' success');
    n.hidden = false;
  };

  let db;

  try {
    if (
      !window.supabase?.createClient ||
      !window.BLC_SUPABASE_URL ||
      !window.BLC_SUPABASE_ANON_KEY
    ) {
      throw Error('Supabase connection is not configured.');
    }

    db = window.supabase.createClient(
      window.BLC_SUPABASE_URL,
      window.BLC_SUPABASE_ANON_KEY
    );
  } catch (error) {
    msg(error.message, true);
    el('login-button').disabled = true;
    return;
  }

  let recoveryMode = false;

  const show = what => {
    [
      'login-panel',
      'reset-panel',
      'new-password-panel'
    ].forEach(id => {
      el(id).hidden = id !== what;
    });
  };

  // Detect recovery links before checking the login session.
  const url = new URL(window.location.href);

  const isRecoveryLink =
    url.hash.includes('type=recovery') ||
    url.searchParams.get('type') === 'recovery' ||
    url.searchParams.has('code');

  if (isRecoveryLink) {
    recoveryMode = true;
  }

  // Supabase validates the recovery link and creates a session.
  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      show('new-password-panel');
      msg('Reset link verified. Choose a new password.');
    }
  });

  const start = async () => {
    const { data, error } = await db.auth.getSession();

    if (error) {
      msg('Could not check login session: ' + error.message, true);
      return;
    }

    if (recoveryMode) {
      if (data?.session) {
        show('new-password-panel');
        msg('Choose your new password.');
      } else {
        msg(
          'Your recovery link could not be verified or has expired. Please request a new link.',
          true
        );
      }
      return;
    }

    if (data?.session) {
      location.replace('portal.html');
    }
  };

  // Normal staff login
  el('login-form').addEventListener('submit', async e => {
    e.preventDefault();

    const b = el('login-button');
    b.disabled = true;
    msg('Signing in…');

    try {
      const { error } = await db.auth.signInWithPassword({
        email: el('email').value.trim(),
        password: el('password').value
      });

      if (error) throw error;

      location.replace('portal.html');
    } catch (err) {
      msg(err.message || 'Sign in failed.', true);
      b.disabled = false;
    }
  });

  // Open the password reset request form
  el('show-reset').addEventListener('click', () => {
    el('reset-email').value = el('email').value;
    show('reset-panel');
    el('message').hidden = true;
  });

  // Cancel password reset request
  el('cancel-reset').addEventListener('click', () => {
    show('login-panel');
    el('message').hidden = true;
  });

  // Send password reset email
  el('reset-form').addEventListener('submit', async e => {
    e.preventDefault();

    const email = el('reset-email').value.trim();

    const { error } = await db.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          'https://brightlightchurch.org/membership/login.html'
      }
    );

    if (error) {
      return msg(error.message, true);
    }

    msg(
      'If that email belongs to an account, a password reset link has been sent.'
    );
  });

  // Save new password
  el('new-password-form').addEventListener('submit', async e => {
    e.preventDefault();

    const newPassword = el('new-password').value;

    if (!recoveryMode) {
      return msg(
        'Please open a valid password recovery link first.',
        true
      );
    }

    const { data: sessionData } = await db.auth.getSession();

    if (!sessionData?.session) {
      return msg(
        'Your recovery session has expired. Please request a new link.',
        true
      );
    }

    const { error } = await db.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return msg(error.message, true);
    }

    await db.auth.signOut();

    recoveryMode = false;

    show('login-panel');

    el('new-password').value = '';

    msg('Your password was updated. Please sign in.');
  });

  start().catch(err => msg(err.message, true));
})();
