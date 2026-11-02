/* Bright Light Church calendar and birthday admin. Uses existing Supabase authentication. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const db = window.supabase?.createClient && window.BLC_SUPABASE_URL && window.BLC_SUPABASE_ANON_KEY
    ? window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY) : null;
  const allowedStaff = new Set(['super_admin', 'admin', 'secretary']);
  let events = [], members = [], consents = new Map(), publicBirthdays = [];
  let saving = false;

  function notice(text, error = false) {
    const el = $('notice'); el.textContent = text; el.className = 'notice' + (error ? ' error' : ''); el.hidden = false;
  }
  function unwrap(result) { if (result.error) throw result.error; return result.data; }
  function el(tag, className, text) {
    const x = document.createElement(tag);
    if (className) x.className = className;
    if (text !== undefined) x.textContent = text;
    return x;
  }
  function chicagoToday() {
    const p = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
    const v = key => p.find(x => x.type === key)?.value;
    return `${v('year')}-${v('month')}-${v('day')}`;
  }
  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Date missing';
    return new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
  }
  function nameOf(m) { return [m.honorific, m.preferred_name || m.first_name, m.last_name].filter(Boolean).join(' '); }
  function ageAt(birth, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null;
    const [y, m, d] = birth.split('-').map(Number), [yy, mm, dd] = today.split('-').map(Number);
    const leap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    return yy - y - ((mm < m || (mm === m && dd < day)) ? 1 : 0);
  }
  async function allRows(table, columns, orderKey) {
    const rows = []; let pos = 0;
    while (pos < 10000) {
      const r = unwrap(await db.from(table).select(columns).order(orderKey, {ascending:true}).range(pos, pos + 499));
      rows.push(...(r || []));
      if (!r || r.length < 500) break;
      pos += 500;
    }
    return rows;
  }
  function renderStats() {
    const today = chicagoToday();
    $('stat-published').textContent = String(events.filter(e => e.published && e.event_date >= today).length);
    $('stat-drafts').textContent = String(events.filter(e => !e.published).length);
    $('stat-birthdays').textContent = String(publicBirthdays.length);
  }
  function setTab(tab) {
    for (const key of ['events', 'birthdays']) {
      $('tab-' + key).setAttribute('aria-selected', String(key === tab));
      $('panel-' + key).hidden = key !== tab;
    }
    if (tab === 'birthdays') $('member-search').focus();
  }
  function resetForm() {
    $('event-form').reset();
    $('event-id').value = '';
    $('event-date').value = chicagoToday();
    $('event-editor-title').textContent = 'Add Church Event';
    $('edit-indicator').hidden = true;
    $('save-event').textContent = 'Save Event';
  }
  function editEvent(record) {
    $('event-id').value = record.id;
    $('event-title').value = record.title;
    $('event-date').value = record.event_date;
    $('event-start').value = record.start_time?.slice(0, 5) || '';
    $('event-end').value = record.end_time?.slice(0, 5) || '';
    $('event-location').value = record.location || '';
    $('event-description').value = record.description || '';
    $('event-url').value = record.details_url || '';
    $('event-published').checked = record.published;
    $('event-editor-title').textContent = 'Edit Church Event';
    $('edit-indicator').hidden = false;
    $('save-event').textContent = 'Save Changes';
    $('event-form').scrollIntoView({behavior:'smooth', block:'start'});
    $('event-title').focus({preventScroll:true});
  }
  function renderEvents() {
    const list = $('event-list'); list.replaceChildren();
    const needle = $('event-search').value.trim().toLowerCase();
    const filter = $('event-filter').value, today = chicagoToday();
    const filtered = events.filter(e => {
      if (needle && !`${e.title} ${e.location || ''} ${e.description || ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'drafts') return !e.published;
      if (filter === 'upcoming') return e.event_date >= today;
      if (filter === 'past') return e.event_date < today;
      return true;
    }).sort((a, b) => a.event_date.localeCompare(b.event_date));
    $('event-count').textContent = `${filtered.length} matching event${filtered.length === 1 ? '' : 's'}`;
    if (!filtered.length) { list.append(el('p', 'count', 'No matching events. Create an event or change the filter.')); return; }
    for (const e of filtered.slice(0, 250)) {
      const row = el('div','event-row'), detail = el('div'), actions = el('div','row-actions');
      detail.append(el('h3','', e.title));
      detail.append(el('p','', `${dateLabel(e.event_date)}${e.start_time ? ' · ' + e.start_time.slice(0,5) : ''}${e.location ? ' · ' + e.location : ''}`));
      actions.append(el('span', 'pill' + (e.published ? '' : ' draft'), e.published ? 'Published' : 'Draft'));
      const edit = el('button','btn secondary small','Edit'); edit.type = 'button'; edit.addEventListener('click', () => editEvent(e));
      const pub = el('button','btn secondary small', e.published ? 'Unpublish' : 'Publish'); pub.type = 'button';
      pub.addEventListener('click', () => setPublished(e, !e.published));
      actions.append(edit, pub); row.append(detail, actions); list.append(row);
    }
    if (filtered.length > 250) list.append(el('p','count','Showing first 250 entries. Use search to narrow results.'));
  }
  async function loadEvents() {
    events = await allRows('blc_calendar_events', 'id,title,description,event_date,start_time,end_time,location,details_url,published','event_date');
    renderEvents(); renderStats();
  }
  async function setPublished(record, publish) {
    if (!window.confirm(`${publish ? 'Publish' : 'Remove from the public calendar'}: ${record.title}?`)) return;
    try {
      const result = unwrap(await db.from('blc_calendar_events').update({published:publish}).eq('id',record.id).select('id').maybeSingle());
      if (!result) throw new Error('The event could not be changed. Check staff permissions.');
      await loadEvents(); notice(publish ? 'Event published to the public calendar.' : 'Event saved as a private draft.');
    } catch(e) { notice('Unable to change publication: ' + e.message, true); }
  }
  async function saveEvent(ev) {
    ev.preventDefault(); if (saving) return;
    const payload = {
      title: $('event-title').value.trim(), event_date: $('event-date').value,
      start_time: $('event-start').value || null, end_time: $('event-end').value || null,
      location: $('event-location').value.trim() || null,
      description: $('event-description').value.trim() || null,
      details_url: $('event-url').value.trim() || null,
      published: $('event-published').checked
    };
    if (!payload.title || !payload.event_date) { notice('Event name and date are required.', true); return; }
    if (payload.end_time && !payload.start_time) { notice('Add a start time if you enter an end time.', true); return; }
    if (payload.start_time && payload.end_time && payload.end_time <= payload.start_time) { notice('End time must be later than start time.', true); return; }
    if (payload.details_url && !/^https:\/\/\S+$/i.test(payload.details_url)) { notice('Event links must start with https://.', true); return; }
    saving = true; $('save-event').disabled = true;
    try {
      const id = $('event-id').value;
      let result;
      if (id) result = unwrap(await db.from('blc_calendar_events').update(payload).eq('id',id).select('id').maybeSingle());
      else result = unwrap(await db.from('blc_calendar_events').insert(payload).select('id').single());
      if (!result?.id) throw new Error('No event was saved. Verify calendar permissions.');
      resetForm(); await loadEvents();
      notice(payload.published ? 'Saved and published. Visitors can now see this event.' : 'Event saved as a private draft.');
    } catch(e) { notice('Could not save event: ' + e.message, true); }
    finally { saving = false; $('save-event').disabled = false; }
  }
  function renderMembers() {
    const target = $('member-list'); target.replaceChildren();
    const filter = $('birthday-filter').value, needle = $('member-search').value.trim().toLowerCase(), today = chicagoToday();
    const filtered = members.filter(m => {
      if (needle && !`${m.first_name} ${m.last_name} ${m.preferred_name || ''} ${m.honorific || ''}`.toLowerCase().includes(needle)) return false;
      const adult = (ageAt(m.date_of_birth, today) ?? -1) >= 18 && m.membership_status === 'active';
      const approved = consents.get(m.id)?.show_publicly === true;
      return filter === 'approved' ? approved : filter === 'not-approved' ? adult && !approved : filter === 'ineligible' ? !adult : true;
    });
    $('member-count').textContent = `${filtered.length} member${filtered.length===1?'':'s'} matched${filtered.length>100?' · showing the first 100':''}`;
    if (!filtered.length) { target.append(el('p','count','No matching members found.')); return; }
    for (const m of filtered.slice(0, 100)) {
      const age = ageAt(m.date_of_birth, today), eligible = age !== null && age >= 18 && m.membership_status === 'active';
      const approved = consents.get(m.id)?.show_publicly === true;
      const row = el('div','member-row'), details = el('div'), actions = el('div','row-actions');
      details.append(el('strong','',nameOf(m)));
      details.append(el('p','',`Birthday: ${m.date_of_birth ? m.date_of_birth.slice(5) : 'Not entered'} · Status: ${m.membership_status}`));
      if (!eligible) actions.append(el('span','pill ' + (age !== null && age < 18 ? 'minor' : 'muted'), age === null ? 'DOB missing' : age < 18 ? 'Minor · private' : 'Inactive / pending'));
      else actions.append(el('span','pill' + (approved ? '' : ' draft'),approved ? 'Public approved' : 'Private'));
      const toggle = el('button','btn secondary small', approved ? 'Remove Birthday' : 'Approve Birthday');
      toggle.type = 'button'; toggle.disabled = !eligible;
      toggle.addEventListener('click', () => changeConsent(m, approved, toggle));
      actions.append(toggle); row.append(details, actions); target.append(row);
    }
  }
  async function loadMembers() {
    const [ms, cs] = await Promise.all([
      allRows('blc_members','id,first_name,last_name,honorific,preferred_name,date_of_birth,membership_status','last_name'),
      allRows('blc_birthday_publication','member_id,show_publicly,consent_confirmed_at','member_id')
    ]);
    members = ms;
    consents = new Map(cs.map(c => [c.member_id,c]));
    renderMembers();
  }
  async function loadPublicBirthdays() {
    publicBirthdays = unwrap(await db.rpc('blc_public_next_30_birthdays')) || [];
    const box = $('upcoming-birthdays'); box.replaceChildren();
    if (!publicBirthdays.length) { box.append(el('p','count','No opted-in birthdays within the next 30 days.')); renderStats(); return; }
    for (const b of publicBirthdays) {
      const line = el('div','birthday-row'), date = el('span','birthday-day');
      const [year, month, day] = b.birthday_on.split('-').map(Number);
      date.append(el('small','',new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day)))));
      date.append(el('span','',String(day)));
      line.append(date,el('div','birthday-name',b.display_name));box.append(line);
    }
    renderStats();
  }
  async function changeConsent(member, wasApproved, button) {
    const name = nameOf(member), newStatus = !wasApproved;
    if (newStatus) {
      if (!window.confirm(`Has ${name} personally given permission to display their name and birthday (month and day only) on the PUBLIC Bright Light Church website?\n\nSelect OK ONLY if their permission has already been confirmed.`)) return;
    } else if (!window.confirm(`Remove ${name} from the public birthday calendar?`)) return;
    button.disabled = true;
    try {
      // RLS and database trigger record the acting staff member and approval timestamp.
      unwrap(await db.from('blc_birthday_publication').upsert({member_id:member.id,show_publicly:newStatus},{onConflict:'member_id'}));
      await Promise.all([loadMembers(),loadPublicBirthdays()]);
      notice(newStatus ? `${name}'s birthday may now appear when it is within 30 days.` : `${name}'s birthday is now private.`);
    } catch(e) { notice('Unable to update birthday permission: ' + e.message, true); button.disabled = false; }
  }
  async function init() {
    if (!db) { $('loading').textContent = 'Supabase connection is missing. Verify membership/config.js.'; return; }
    const result = await db.auth.getUser();
    if (result.error) throw result.error;
    const user = result.data?.user;
    if (!user) { $('loading').hidden = true; $('login-panel').hidden = false; return; }
    const staff = unwrap(await db.from('blc_staff_roles').select('role').eq('auth_user_id',user.id).maybeSingle());
    if (!staff || !allowedStaff.has(staff.role)) {
      $('loading').hidden = true; $('login-panel').hidden = true;
      notice('You are signed in, but this account does not have Events & Birthdays administration permission. Contact the church super administrator.', true);
      $('sign-out').hidden = false; return;
    }
    $('loading').hidden = true; $('login-panel').hidden = true; $('workspace').hidden = false; $('sign-out').hidden = false;
    $('account-info').textContent = `Signed in as ${user.email || 'staff member'} · ${staff.role.replace('_',' ')}`;
    resetForm();
    const results = await Promise.allSettled([loadEvents(),loadMembers(),loadPublicBirthdays()]);
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
    if (errors.length) notice('Some calendar data could not load: ' + errors.join(' · ') + '. Confirm the SQL migration is installed.', true);
  }
  $('login-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      if (!db) throw new Error('Supabase configuration is missing.');
      unwrap(await db.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value}));
      $('login-password').value = ''; await init();
    } catch(e) { notice('Sign-in failed: ' + e.message, true); }
  });
  $('sign-out').addEventListener('click', async () => { if (db) await db.auth.signOut(); location.replace('login.html'); });
  $('tab-events').addEventListener('click',()=>setTab('events'));
  $('tab-birthdays').addEventListener('click',()=>setTab('birthdays'));
  $('event-form').addEventListener('submit', saveEvent);
  $('clear-event').addEventListener('click', resetForm);
  $('event-search').addEventListener('input', renderEvents);
  $('event-filter').addEventListener('change', renderEvents);
  $('member-search').addEventListener('input', renderMembers);
  $('birthday-filter').addEventListener('change', renderMembers);
  $('refresh-events').addEventListener('click', async () => {try { await loadEvents(); notice('Event list refreshed.'); }catch(e){notice('Refresh failed: '+e.message,true);} });
  $('refresh-birthdays').addEventListener('click', async () => {try { await loadPublicBirthdays(); notice('Public birthday feed refreshed.'); }catch(e){notice('Refresh failed: '+e.message,true);} });
  init().catch(e => { $('loading').textContent = 'Unable to start the calendar dashboard.'; notice('Calendar admin error: ' + e.message, true); });
})();
