'use strict';
const client = window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY);
const byId = id => document.getElementById(id);
function notify(message, error = false) {
  const el = byId('message'); el.textContent = message;
  el.className = error ? 'notice error' : 'notice';
}
function clean(v) { return typeof v === 'string' ? v.trim() : v; }
function optional(v) { return clean(v) || null; }
function memberPayload(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  return {
    first_name: clean(values.first_name), last_name: clean(values.last_name),
    preferred_name: optional(values.preferred_name), email: optional(values.email),
    phone: optional(values.phone), date_of_birth: optional(values.date_of_birth),
    anniversary_date: optional(values.anniversary_date),
    member_since: optional(values.member_since)
  };
}
async function currentUser() {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
