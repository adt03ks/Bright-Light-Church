'use strict';
(() => {
  const status = document.getElementById('status');
  const form = document.getElementById('passwordForm');
  const complete = document.getElementById('complete');
  const saveButton = document.getElementById('saveButton');
  const show = (message, kind = '') => { status.textContent = message; status.className = kind; };

  if (!window.supabase || !window.BLC_SUPABASE_URL || !window.BLC_SUPABASE_ANON_KEY) {
    show('Account setup is not configured. Please contact the church administrator.', 'error');
    return;
  }
  const client = window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const errorDescription = query.get('error_description') || hash.get('error_description');
  const incomingInvite = query.has('code') || hash.has('access_token') || query.has('token_hash');
  let invitedUserId = null;

  const verifyInvite = async () => {
    if (errorDescription) {
      show('The invitation could not be verified. It may have expired or already been used. Please request a fresh invitation.', 'error');
      return;
    }
    if (!incomingInvite) {
      show('Open the activation link from your invitation email. This page cannot create an account without a valid invitation.', 'error');
      return;
    }
    try {
      // Supabase JS automatically consumes the standard #access_token or ?code callback.
      // The token_hash branch supports custom email-template verification links.
      if (query.has('token_hash')) {
        const type = query.get('type') === 'recovery' ? 'recovery' : 'invite';
        const { error } = await client.auth.verifyOtp({ token_hash: query.get('token_hash'), type });
        if (error) throw error;
      }
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('No verified session');
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || !user || user.id !== session.user.id) throw new Error('Session validation failed');
      invitedUserId = user.id;
      document.getElementById('accountLabel').textContent = `Creating a password for ${user.email || 'your account'}`;
      // Remove tokens from address bar once processed (never put tokens in logs).
      history.replaceState(null, '', window.location.pathname);
      form.hidden = false;
      show('Invitation verified. Choose your password below.', 'success');
    } catch (_) {
      show('This invitation could not be verified. Please request a new invitation and open it in a private browser window.', 'error');
    }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('password').value;
    if (password.length < 12) return show('Please use at least 12 characters.', 'error');
    if (password !== document.getElementById('confirmPassword').value) return show('Passwords do not match.', 'error');
    if (!invitedUserId) return show('The invitation must be verified first.', 'error');
    saveButton.disabled = true;
    show('Saving your password…');
    try {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || user?.id !== invitedUserId) throw new Error('Invitation session is no longer valid. Request another invitation.');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      form.hidden = true;
      complete.hidden = false;
      show('Your password was saved successfully.', 'success');
      // Clean up invitation session; sign in deliberately using the new password.
      await client.auth.signOut();
    } catch (error) {
      show(error?.message || 'Unable to save password. Please try again.', 'error');
    } finally { saveButton.disabled = false; }
  });
  verifyInvite();
})();
