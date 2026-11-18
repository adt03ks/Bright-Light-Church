(() => {
  'use strict';

  const form = document.getElementById('club-join-form');
  const message = document.getElementById('form-message');
  const submit = document.getElementById('submit-btn');
  const config = window.BLC_CLUB_CONFIG || {};
  let turnstileWidgetId = null;
  let captchaToken = '';

  function notify(text, type = '') {
    message.textContent = text;
    if (type) message.dataset.status = type;
    else delete message.dataset.status;
  }

  const projectUrl = String(config.supabaseProjectUrl || '').replace(/\/+$/, '');
  const siteKey = String(config.turnstileSiteKey || '');
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl) &&
    !projectUrl.includes('YOUR_') && Boolean(siteKey) && !siteKey.includes('YOUR_');

  if (!configured) {
    submit.disabled = true;
    notify('For any additional questions or requests, please contact Sis. Leslie Joseph at Ljoseph7@yahoo.com', 'error');
    return;
  }

  window.onClubTurnstileReady = () => {
    if (!window.turnstile) {
      notify('Human verification could not load. Please refresh the page.', 'error');
      return;
    }
    turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
      sitekey: siteKey,
      theme: 'light',
      callback: (token) => { captchaToken = token; },
      'expired-callback': () => { captchaToken = ''; },
      'error-callback': () => { captchaToken = ''; notify('Verification needs to be retried. Please refresh the page if needed.', 'error'); }
    });
  };
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onClubTurnstileReady&render=explicit';
  script.async = true;
  script.defer = true;
  script.onerror = () => notify('Human verification could not load. Please try again.', 'error');
  document.head.appendChild(script);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    notify('');
    if (!form.reportValidity()) return;
    if (!captchaToken) {
      notify('Please complete the human verification before joining.', 'error');
      return;
    }
    const payload = {
      full_name: form.elements.full_name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      consent: form.elements.consent.checked,
      website: form.elements.website.value,
      turnstile_token: captchaToken
    };

    submit.disabled = true;
    submit.textContent = 'Sending your registration…';
    try {
      const response = await fetch(`${projectUrl}/functions/v1/blc-womens-movie-club-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'We could not complete your registration. Please try again.');
      notify(data.message || 'Welcome to the fellowship! Your registration has been received.', 'success');
      if (!data.already_registered) form.reset();
      captchaToken = '';
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Something went wrong. Please try again.', 'error');
      captchaToken = '';
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Join the club today <span aria-hidden="true">↗</span>';
    }
  });
})();
