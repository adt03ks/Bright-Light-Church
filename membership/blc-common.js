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
    member_since: optional(values.member_since),
    street_address: optional(values.street_address), city: optional(values.city),
    state: optional(values.state), postal_code: optional(values.postal_code),
    spouse_name_text: optional(values.spouse_name_text),
    household_name_text: optional(values.household_name_text)
  };
}
async function currentUser() {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

// Age is calculated from the ISO birth date on each load. Never persist a manual
// minor flag: this automatically changes on the eighteenth birthday.
function isMinor(dateOfBirth, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth || '')) return false;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return false;
  const todayYear = now.getFullYear(), todayMonth = now.getMonth() + 1, todayDay = now.getDate();
  if (year > todayYear || (year === todayYear && (month > todayMonth || month === todayMonth && day > todayDay))) return false;
  return todayYear - year - (todayMonth < month || (todayMonth === month && todayDay < day) ? 1 : 0) < 18;
}
function syncMinorCheckbox(form) {
  const dob = form.elements.date_of_birth;
  const checkbox = form.elements.minor_confirm;
  if (!dob || !checkbox) return;
  if (dob.value) checkbox.checked = isMinor(dob.value);
}
function validateMinor(form) {
  const dob = form.elements.date_of_birth?.value || '';
  const checkbox = form.elements.minor_confirm;
  if (!checkbox) return;
  if (checkbox.checked && !dob) throw new Error('A birth date is required when the member is marked as a minor.');
  if (dob && checkbox.checked !== isMinor(dob)) throw new Error('The minor checkbox must match the birth date. Check the date of birth and try again.');
}
function attachMinorForm(form) {
  form.elements.date_of_birth.addEventListener('change', () => syncMinorCheckbox(form));
}
function appendMinorBadge(target, dateOfBirth) {
  if (!isMinor(dateOfBirth)) return;
  const badge = document.createElement('span');
  badge.className = 'minor-badge';
  badge.textContent = 'M';
  badge.title = 'Minor: under 18 years old';
  badge.setAttribute('aria-label', 'Minor: under 18 years old');
  target.append(document.createTextNode(' '), badge);
}
