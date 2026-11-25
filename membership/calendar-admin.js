
/* Bright Light Church Calendar and Birthday Administration
   Supports multi-day events, promotional flyers,
   automatic expiration and member birthday permissions.
*/

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const db =
    window.supabase?.createClient &&
    window.BLC_SUPABASE_URL &&
    window.BLC_SUPABASE_ANON_KEY
      ? window.supabase.createClient(
          window.BLC_SUPABASE_URL,
          window.BLC_SUPABASE_ANON_KEY
        )
      : null;

  const allowedStaff = new Set([
    'super_admin',
    'admin',
    'secretary'
  ]);

  const CHURCH_TIMEZONE = 'America/Chicago';

  let events = [];
  let members = [];
  let consents = new Map();
  let publicBirthdays = [];
  let saving = false;

  // =========================================
  // EVENT IMAGE CONFIGURATION
  // =========================================

  const EVENT_IMAGE_BUCKET = 'blc-site-images';

  const EVENT_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

  const EVENT_IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };

  let pendingEventFlyer = null;
  let flyerPreviewObjectUrl = null;

  // =========================================
  // GENERAL HELPERS
  // =========================================

  function notice(text, error = false) {

    const target = $('notice');

    target.textContent = text;

    target.className =
      'notice' + (error ? ' error' : '');

    target.hidden = false;

  }

  function unwrap(result) {

    if (result.error) {
      throw result.error;
    }

    return result.data;

  }

  function el(tag, className, text) {

    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;

  }

  // =========================================
  // CENTRAL TIME AND EVENT DATE HELPERS
  // =========================================

  function chicagoToday() {

    const parts = new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: CHURCH_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    ).formatToParts(new Date());

    const value = key =>
      parts.find(part => part.type === key)?.value;

    return `${value('year')}-${value('month')}-${value('day')}`;

  }

  function chicagoTime() {

    return new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: CHURCH_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }
    ).format(new Date());

  }

  // Determine whether an event has expired.
  // Multi-day events expire using their end date.

  function isUpcomingEvent(record) {

    if (!record.event_date) {
      return false;
    }

    const today = chicagoToday();

    const endDate =
      record.end_date || record.event_date;

    if (endDate > today) {
      return true;
    }

    if (endDate < today) {
      return false;
    }

    // No ending time means the event remains
    // active through the entire ending date.

    if (!record.end_time) {
      return true;
    }

    const currentTime = chicagoTime();

    const endTime =
      record.end_time.length === 5
        ? record.end_time + ':00'
        : record.end_time.slice(0, 8);

    return endTime > currentTime;

  }

  function dateLabel(value) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
      return 'Date missing';
    }

    return new Intl.DateTimeFormat(
      'en-US',
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      }
    ).format(
      new Date(`${value}T12:00:00Z`)
    );

  }

  function eventDateRange(record) {

    const startDate = record.event_date;

    const endDate =
      record.end_date || startDate;

    if (startDate === endDate) {
      return dateLabel(startDate);
    }

    return (
      dateLabel(startDate) +
      ' – ' +
      dateLabel(endDate)
    );

  }

  function adminTimeLabel(value) {

    if (!value) {
      return '';
    }

    const parts = value.split(':');

    const hour = Number(parts[0]);

    const minute = parts[1] || '00';

    return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;

  }

  // =========================================
  // MEMBER HELPERS
  // =========================================

  function nameOf(member) {

    return [
      member.honorific,
      member.preferred_name || member.first_name,
      member.last_name
    ].filter(Boolean).join(' ');

  }

  function ageAt(birth, today) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) {
      return null;
    }

    const [y, m, d] =
      birth.split('-').map(Number);

    const [yy, mm, dd] =
      today.split('-').map(Number);

    const leap =
      (yy % 4 === 0 && yy % 100 !== 0) ||
      yy % 400 === 0;

    const day =
      m === 2 && d === 29 && !leap
        ? 28
        : d;

    return yy - y - (
      (mm < m || (mm === m && dd < day))
        ? 1
        : 0
    );

  }

  // =========================================
  // DATABASE PAGINATION
  // =========================================

  async function allRows(
    table,
    columns,
    orderKey
  ) {

    const rows = [];

    let pos = 0;

    while (pos < 10000) {

      const result = unwrap(
        await db
          .from(table)
          .select(columns)
          .order(orderKey, {
            ascending: true
          })
          .range(pos, pos + 499)
      );

      rows.push(...(result || []));

      if (!result || result.length < 500) {
        break;
      }

      pos += 500;

    }

    return rows;

  }

  // =========================================
  // DASHBOARD STATISTICS
  // =========================================

  function renderStats() {

    $('stat-published').textContent = String(

      events.filter(event =>
        event.published &&
        isUpcomingEvent(event)
      ).length

    );

    $('stat-drafts').textContent = String(

      events.filter(event =>
        !event.published
      ).length

    );

    $('stat-birthdays').textContent = String(
      publicBirthdays.length
    );

  }

  // =========================================
  // DASHBOARD TABS
  // =========================================

  function setTab(tab) {

    for (const key of ['events', 'birthdays']) {

      $('tab-' + key).setAttribute(
        'aria-selected',
        String(key === tab)
      );

      $('panel-' + key).hidden =
        key !== tab;

    }

    if (tab === 'birthdays') {
      $('member-search').focus();
    }

  }

  // =========================================
  // EVENT FLYER MANAGEMENT
  // =========================================

  function releaseFlyerPreview() {

    if (flyerPreviewObjectUrl) {

      URL.revokeObjectURL(
        flyerPreviewObjectUrl
      );

      flyerPreviewObjectUrl = null;

    }

  }

  function safeFlyerUrl(value) {

    if (!value) {
      return '';
    }

    try {

      const url = new URL(value);

      return url.protocol === 'https:'
        ? url.href
        : '';

    } catch {

      return '';

    }

  }

  function showFlyerPreview(src, message) {

    const image = $('event-flyer-preview');

    const wrapper =
      $('event-flyer-preview-wrap');

    if (src) {

      image.src = src;

      wrapper.hidden = false;

    } else {

      image.removeAttribute('src');

      wrapper.hidden = true;

    }

    $('event-flyer-status').textContent =
      message ||
      'No promotional image selected.';

  }

  function resetEventFlyer() {

    releaseFlyerPreview();

    pendingEventFlyer = null;

    $('event-flyer').value = '';

    $('event-flyer-url').value = '';

    showFlyerPreview(
      '',
      'No promotional image selected.'
    );

  }

  function loadExistingFlyer(url) {

    resetEventFlyer();

    const safeUrl = safeFlyerUrl(url);

    $('event-flyer-url').value = safeUrl;

    if (safeUrl) {

      showFlyerPreview(
        safeUrl,
        'Current saved event flyer.'
      );

    }

  }

  function selectEventFlyer() {

    if (saving) {
      return;
    }

    const input = $('event-flyer');

    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!EVENT_IMAGE_TYPES[file.type]) {

      input.value = '';

      notice(
        'Please select a JPG, PNG, WebP or GIF image.',
        true
      );

      return;

    }

    if (file.size > EVENT_IMAGE_MAX_SIZE) {

      input.value = '';

      notice(
        'The selected image exceeds the 5 MB upload limit.',
        true
      );

      return;

    }

    releaseFlyerPreview();

    pendingEventFlyer = file;

    flyerPreviewObjectUrl =
      URL.createObjectURL(file);

    const sizeMb =
      (file.size / (1024 * 1024)).toFixed(2);

    showFlyerPreview(

      flyerPreviewObjectUrl,

      `${file.name} · ${sizeMb} MB · Ready to upload when the event is saved.`

    );

  }

  function removeEventFlyer() {

    if (saving) {
      return;
    }

    const confirmed = window.confirm(

      'Remove the promotional image from this event? Save the event to apply this change.'

    );

    if (!confirmed) {
      return;
    }

    resetEventFlyer();

    $('event-flyer-status').textContent =
      'Image removed. Save the event to apply this change.';

  }

  async function uploadEventFlyer(file) {

    if (!file) {

      return $('event-flyer-url').value || null;

    }

    const extension =
      EVENT_IMAGE_TYPES[file.type];

    if (!extension) {

      throw new Error(
        'Unsupported event image format.'
      );

    }

    if (file.size > EVENT_IMAGE_MAX_SIZE) {

      throw new Error(
        'The image exceeds the 5 MB limit.'
      );

    }

    const fileName =
      `${crypto.randomUUID()}.${extension}`;

    const path = `events/${fileName}`;

    $('event-flyer-status').textContent =
      'Uploading promotional image…';

    const uploadResult = await db.storage

      .from(EVENT_IMAGE_BUCKET)

      .upload(path, file, {

        cacheControl: '3600',

        contentType: file.type,

        upsert: false

      });

    if (uploadResult.error) {

      throw uploadResult.error;

    }

    const publicResult = db.storage

      .from(EVENT_IMAGE_BUCKET)

      .getPublicUrl(path);

    const publicUrl = safeFlyerUrl(
      publicResult.data?.publicUrl
    );

    if (!publicUrl) {

      throw new Error(

        'The image uploaded, but its public URL could not be generated.'

      );

    }

    $('event-flyer-url').value = publicUrl;

    pendingEventFlyer = null;

    releaseFlyerPreview();

    $('event-flyer').value = '';

    showFlyerPreview(

      publicUrl,

      'Image uploaded successfully. Saving event…'

    );

    return publicUrl;

  }

  // =========================================
  // RESET EVENT FORM
  // =========================================

  function resetForm() {

    if (saving) {
      return;
    }

    $('event-form').reset();

    $('event-id').value = '';

    $('event-date').value = chicagoToday();

    $('event-end-date').value = '';

    $('event-end-date').min =
      $('event-date').value;

    $('event-editor-title').textContent =
      'Add Church Event';

    $('edit-indicator').hidden = true;

    $('save-event').textContent =
      'Save Event';

    resetEventFlyer();

  }

  // =========================================
  // EDIT EXISTING EVENT
  // =========================================

  function editEvent(record) {

    if (saving) {
      return;
    }

    $('event-id').value = record.id;

    $('event-title').value = record.title;

    $('event-date').value = record.event_date;

    $('event-end-date').min =
      record.event_date;

    $('event-end-date').value =
      record.end_date || record.event_date;

    $('event-start').value =
      record.start_time?.slice(0, 5) || '';

    $('event-end').value =
      record.end_time?.slice(0, 5) || '';

    $('event-location').value =
      record.location || '';

    $('event-description').value =
      record.description || '';

    $('event-url').value =
      record.details_url || '';

    $('event-published').checked =
      record.published;

    loadExistingFlyer(record.flyer_url);

    $('event-editor-title').textContent =
      'Edit Church Event';

    $('edit-indicator').hidden = false;

    $('save-event').textContent =
      'Save Changes';

    $('event-form').scrollIntoView({

      behavior: 'smooth',

      block: 'start'

    });

    $('event-title').focus({

      preventScroll: true

    });

  }

  // =========================================
  // RENDER SAVED EVENTS
  // =========================================

  function renderEvents() {

    const list = $('event-list');

    list.replaceChildren();

    const needle =
      $('event-search').value.trim().toLowerCase();

    const filter =
      $('event-filter').value;

    const filtered = events.filter(event => {

      const searchable =

        `${event.title} ${event.location || ''} ${event.description || ''}`

          .toLowerCase();

      if (needle && !searchable.includes(needle)) {

        return false;

      }

      if (filter === 'drafts') {

        return !event.published;

      }

      if (filter === 'upcoming') {

        return isUpcomingEvent(event);

      }

      if (filter === 'past') {

        return !isUpcomingEvent(event);

      }

      return true;

    }).sort((a, b) =>

      a.event_date.localeCompare(b.event_date)

    );

    $('event-count').textContent =

      `${filtered.length} matching event${filtered.length === 1 ? '' : 's'}`;

    if (!filtered.length) {

      list.append(

        el(

          'p',

          'count',

          'No matching events. Create an event or change the filter.'

        )

      );

      return;

    }

    for (const event of filtered.slice(0, 250)) {

      const row = el('div', 'event-row');

      const detail = el('div');

      const actions = el('div', 'row-actions');

      // Display saved event flyer.

      const savedFlyerUrl =
        safeFlyerUrl(event.flyer_url);

      if (savedFlyerUrl) {

        const thumbnail = el(

          'img',

          'saved-event-thumbnail'

        );

        thumbnail.src = savedFlyerUrl;

        thumbnail.alt =

          `${event.title} promotional flyer`;

        thumbnail.loading = 'lazy';

        thumbnail.addEventListener(

          'error',

          () => thumbnail.remove()

        );

        detail.append(thumbnail);

      }

      // Event title.

      detail.append(

        el('h3', '', event.title)

      );

      // Display the complete event date range.

      detail.append(

        el(

          'p',

          '',

          eventDateRange(event) +

          (event.location
            ? ' · ' + event.location
            : '')

        )

      );

      // Display starting and ending times.

      if (event.start_time || event.end_time) {

        const timeDetails = [];

        if (event.start_time) {

          timeDetails.push(

            'Starts: ' +

            adminTimeLabel(event.start_time)

          );

        }

        if (event.end_time) {

          timeDetails.push(

            'Ends: ' +

            adminTimeLabel(event.end_time)

          );

        }

        detail.append(

          el(

            'p',

            '',

            timeDetails.join(' · ') + ' CT'

          )

        );

      }

      // Determine publication status.

      const expired =
        !isUpcomingEvent(event);

      let statusText = 'Draft';

      let statusClass = 'pill draft';

      if (event.published && expired) {

        statusText = 'Expired';

        statusClass = 'pill expired';

      } else if (event.published) {

        statusText = 'Published';

        statusClass = 'pill';

      }

      actions.append(

        el(

          'span',

          statusClass,

          statusText

        )

      );

      // Edit event button.

      const edit = el(

        'button',

        'btn secondary small',

        'Edit'

      );

      edit.type = 'button';

      edit.addEventListener(

        'click',

        () => editEvent(event)

      );

      // Publish or unpublish button.

      const pub = el(

        'button',

        'btn secondary small',

        event.published

          ? 'Unpublish'

          : 'Publish'

      );

      pub.type = 'button';

      pub.addEventListener(

        'click',

        () => setPublished(

          event,

          !event.published

        )

      );

      actions.append(edit, pub);

      row.append(detail, actions);

      list.append(row);

    }

    if (filtered.length > 250) {

      list.append(

        el(

          'p',

          'count',

          'Showing first 250 entries. Use search to narrow results.'

        )

      );

    }

  }

  // =========================================
  // LOAD EVENTS FROM SUPABASE
  // =========================================

  async function loadEvents() {

    events = await allRows(

      'blc_calendar_events',

      'id,title,description,event_date,end_date,start_time,end_time,location,details_url,published,flyer_url',

      'event_date'

    );

    renderEvents();

    renderStats();

  }

  // =========================================
  // PUBLISH OR UNPUBLISH EVENT
  // =========================================

  async function setPublished(record, publish) {

    if (saving) {
      return;
    }

    const action = publish

      ? 'Publish'

      : 'Remove from the public calendar';

    if (!window.confirm(

      `${action}: ${record.title}?`

    )) {

      return;

    }

    saving = true;

    try {

      const result = unwrap(

        await db

          .from('blc_calendar_events')

          .update({

            published: publish

          })

          .eq('id', record.id)

          .select('id')

          .maybeSingle()

      );

      if (!result) {

        throw new Error(

          'The event could not be changed. Check staff permissions.'

        );

      }

      await loadEvents();

      if (publish && isUpcomingEvent(record)) {

        notice(

          'Event published to the church homepage and public calendar.'

        );

      } else if (publish) {

        notice(

          'Event marked as published, but its end date or time has passed. It will not appear publicly.'

        );

      } else {

        notice(

          'Event saved as a private draft.'

        );

      }

    } catch (error) {

      notice(

        'Unable to change publication: ' +

        error.message,

        true

      );

    } finally {

      saving = false;

    }

  }

  // =========================================
  // SAVE EVENT
  // =========================================

  async function saveEvent(ev) {

    ev.preventDefault();

    if (saving) {
      return;
    }

    const payload = {

      title:
        $('event-title').value.trim(),

      event_date:
        $('event-date').value,

      end_date:
        $('event-end-date').value ||
        $('event-date').value,

      start_time:
        $('event-start').value || null,

      end_time:
        $('event-end').value || null,

      location:
        $('event-location').value.trim() || null,

      description:
        $('event-description').value.trim() || null,

      details_url:
        $('event-url').value.trim() || null,

      published:
        $('event-published').checked,

      flyer_url:
        $('event-flyer-url').value || null

    };

    // Validate required information.

    if (!payload.title || !payload.event_date) {

      notice(

        'Event name and start date are required.',

        true

      );

      return;

    }

    // Validate date range.

    if (payload.end_date < payload.event_date) {

      notice(

        'The end date cannot be earlier than the start date.',

        true

      );

      return;

    }

    // Validate time order for same-day events.

    const sameDayEvent =

      payload.end_date === payload.event_date;

    if (

      sameDayEvent &&

      payload.start_time &&

      payload.end_time &&

      payload.end_time <= payload.start_time

    ) {

      notice(

        'For a single-day event, the end time must be later than the start time.',

        true

      );

      return;

    }

    // Validate external event links.

    if (

      payload.details_url &&

      !/^https:\/\/\S+$/i.test(payload.details_url)

    ) {

      notice(

        'Event links must start with https://.',

        true

      );

      return;

    }

    saving = true;

    // Disable form controls while saving.

    const formControls = Array.from(

      $('event-form').querySelectorAll(

        'input, textarea, select, button'

      )

    );

    const previousDisabledStates =

      formControls.map(

        control => control.disabled

      );

    formControls.forEach(control => {

      control.disabled = true;

    });

    $('save-event').textContent =

      pendingEventFlyer

        ? 'Uploading Image…'

        : 'Saving Event…';

    let saved = false;

    try {

      const id = $('event-id').value;

      // Upload newly selected promotional flyer.

      if (pendingEventFlyer) {

        payload.flyer_url =

          await uploadEventFlyer(

            pendingEventFlyer

          );

      }

      $('save-event').textContent =

        'Saving Event…';

      let result;

      // Update an existing event.

      if (id) {

        result = unwrap(

          await db

            .from('blc_calendar_events')

            .update(payload)

            .eq('id', id)

            .select('id')

            .maybeSingle()

        );

      } else {

        // Create a new event.

        result = unwrap(

          await db

            .from('blc_calendar_events')

            .insert(payload)

            .select('id')

            .single()

        );

      }

      if (!result?.id) {

        throw new Error(

          'No event was saved. Verify calendar permissions.'

        );

      }

      saved = true;

    } catch (error) {

      notice(

        'Could not save event: ' +

        error.message,

        true

      );

    } finally {

      saving = false;

      formControls.forEach(

        (control, index) => {

          control.disabled =

            previousDisabledStates[index];

        }

      );

      $('save-event').textContent =

        $('event-id').value

          ? 'Save Changes'

          : 'Save Event';

    }

    if (!saved) {

      return;

    }

    resetForm();

    try {

      await loadEvents();

      if (

        payload.published &&

        isUpcomingEvent(payload)

      ) {

        notice(

          'Event saved and published. Upcoming events and their flyers will appear on the church homepage and public calendar.'

        );

      } else if (payload.published) {

        notice(

          'Event saved. Its end date or time has passed, so it is not publicly displayed.'

        );

      } else {

        notice(

          'Event saved as a private calendar draft.'

        );

      }

    } catch (error) {

      notice(

        'Event saved successfully, but the event list could not refresh: ' +

        error.message,

        true

      );

    }

  }

  // =========================================
  // MEMBER BIRTHDAY MANAGEMENT
  // =========================================

  function renderMembers() {

    const target = $('member-list');

    target.replaceChildren();

    const filter =

      $('birthday-filter').value;

    const needle =

      $('member-search').value.trim().toLowerCase();

    const today = chicagoToday();

    const filtered = members.filter(member => {

      const searchable =

        `${member.first_name} ${member.last_name} ${member.preferred_name || ''} ${member.honorific || ''}`

          .toLowerCase();

      if (

        needle &&

        !searchable.includes(needle)

      ) {

        return false;

      }

      const adult =

        (ageAt(member.date_of_birth, today) ?? -1) >= 18 &&

        member.membership_status === 'active';

      const approved =

        consents.get(member.id)?.show_publicly === true;

      if (filter === 'approved') {

        return approved;

      }

      if (filter === 'not-approved') {

        return adult && !approved;

      }

      if (filter === 'ineligible') {

        return !adult;

      }

      return true;

    });

    $('member-count').textContent =

      `${filtered.length} member${filtered.length === 1 ? '' : 's'} matched${filtered.length > 100 ? ' · showing the first 100' : ''}`;

    if (!filtered.length) {

      target.append(

        el(

          'p',

          'count',

          'No matching members found.'

        )

      );

      return;

    }

    for (const member of filtered.slice(0, 100)) {

      const age =

        ageAt(member.date_of_birth, today);

      const eligible =

        age !== null &&

        age >= 18 &&

        member.membership_status === 'active';

      const approved =

        consents.get(member.id)?.show_publicly === true;

      const row = el('div', 'member-row');

      const details = el('div');

      const actions = el('div', 'row-actions');

      details.append(

        el(

          'strong',

          '',

          nameOf(member)

        )

      );

      details.append(

        el(

          'p',

          '',

          `Birthday: ${member.date_of_birth ? member.date_of_birth.slice(5) : 'Not entered'} · Status: ${member.membership_status}`

        )

      );

      if (!eligible) {

        const statusClass =

          'pill ' +

          (

            age !== null && age < 18

              ? 'minor'

              : 'muted'

          );

        const statusText =

          age === null

            ? 'DOB missing'

            : age < 18

              ? 'Minor · private'

              : 'Inactive / pending';

        actions.append(

          el(

            'span',

            statusClass,

            statusText

          )

        );

      } else {

        actions.append(

          el(

            'span',

            'pill' + (approved ? '' : ' draft'),

            approved

              ? 'Public approved'

              : 'Private'

          )

        );

      }

      const toggle = el(

        'button',

        'btn secondary small',

        approved

          ? 'Remove Birthday'

          : 'Approve Birthday'

      );

      toggle.type = 'button';

      toggle.disabled = !eligible;

      toggle.addEventListener(

        'click',

        () => changeConsent(

          member,

          approved,

          toggle

        )

      );

      actions.append(toggle);

      row.append(details, actions);

      target.append(row);

    }

  }

  // =========================================
  // LOAD MEMBERS AND BIRTHDAY PERMISSIONS
  // =========================================

  async function loadMembers() {

    const [memberRows, consentRows] =

      await Promise.all([

        allRows(

          'blc_members',

          'id,first_name,last_name,honorific,preferred_name,date_of_birth,membership_status',

          'last_name'

        ),

        allRows(

          'blc_birthday_publication',

          'member_id,show_publicly,consent_confirmed_at',

          'member_id'

        )

      ]);

    members = memberRows;

    consents = new Map(

      consentRows.map(consent => [

        consent.member_id,

        consent

      ])

    );

    renderMembers();

  }

  // =========================================
  // PUBLIC BIRTHDAY PREVIEW
  // =========================================

  async function loadPublicBirthdays() {

    publicBirthdays = unwrap(

      await db.rpc(

        'blc_public_next_30_birthdays'

      )

    ) || [];

    const box = $('upcoming-birthdays');

    box.replaceChildren();

    if (!publicBirthdays.length) {

      box.append(

        el(

          'p',

          'count',

          'No opted-in birthdays within the next 30 days.'

        )

      );

      renderStats();

      return;

    }

    for (const birthday of publicBirthdays) {

      const line =

        el('div', 'birthday-row');

      const date =

        el('span', 'birthday-day');

      const [year, month, day] =

        birthday.birthday_on.split('-').map(Number);

      const monthName =

        new Intl.DateTimeFormat(

          'en-US',

          {

            month: 'short',

            timeZone: 'UTC'

          }

        ).format(

          new Date(

            Date.UTC(year, month - 1, day)

          )

        );

      date.append(

        el('small', '', monthName)

      );

      date.append(

        el('span', '', String(day))

      );

      line.append(

        date,

        el(

          'div',

          'birthday-name',

          birthday.display_name

        )

      );

      box.append(line);

    }

    renderStats();

  }

  // =========================================
  // UPDATE BIRTHDAY CONSENT
  // =========================================

  async function changeConsent(

    member,

    wasApproved,

    button

  ) {

    const name = nameOf(member);

    const newStatus = !wasApproved;

    if (newStatus) {

      const confirmed = window.confirm(

        `Has ${name} personally given permission to display their name and birthday (month and day only) on the PUBLIC Bright Light Church website?\n\nSelect OK ONLY if their permission has already been confirmed.`

      );

      if (!confirmed) {

        return;

      }

    } else {

      if (!window.confirm(

        `Remove ${name} from the public birthday calendar?`

      )) {

        return;

      }

    }

    button.disabled = true;

    try {

      unwrap(

        await db

          .from('blc_birthday_publication')

          .upsert(

            {

              member_id: member.id,

              show_publicly: newStatus

            },

            {

              onConflict: 'member_id'

            }

          )

      );

      await Promise.all([

        loadMembers(),

        loadPublicBirthdays()

      ]);

      notice(

        newStatus

          ? `${name}'s birthday may now appear when it is within 30 days.`

          : `${name}'s birthday is now private.`

      );

    } catch (error) {

      notice(

        'Unable to update birthday permission: ' +

        error.message,

        true

      );

      button.disabled = false;

    }

  }

  // =========================================
  // STAFF AUTHENTICATION
  // =========================================

  async function init() {

    if (!db) {

      $('loading').textContent =

        'Supabase connection is missing. Verify membership/config.js.';

      return;

    }

    const sessionResult =

      await db.auth.getSession();

    if (sessionResult.error) {

      throw sessionResult.error;

    }

    if (!sessionResult.data?.session) {

      $('loading').hidden = true;

      $('login-panel').hidden = false;

      $('workspace').hidden = true;

      return;

    }

    const result =

      await db.auth.getUser();

    if (result.error) {

      throw result.error;

    }

    const user = result.data?.user;

    if (!user) {

      $('loading').hidden = true;

      $('login-panel').hidden = false;

      $('workspace').hidden = true;

      return;

    }

    const staff = unwrap(

      await db

        .from('blc_staff_roles')

        .select('role')

        .eq('auth_user_id', user.id)

        .maybeSingle()

    );

    if (

      !staff ||

      !allowedStaff.has(staff.role)

    ) {

      $('loading').hidden = true;

      $('login-panel').hidden = true;

      $('workspace').hidden = true;

      notice(

        'You are signed in, but this account does not have Events & Birthdays administration permission. Contact the church super administrator.',

        true

      );

      $('sign-out').hidden = false;

      return;

    }

    $('loading').hidden = true;

    $('login-panel').hidden = true;

    $('workspace').hidden = false;

    $('sign-out').hidden = false;

    $('account-info').textContent =

      `Signed in as ${user.email || 'staff member'} · ${staff.role.replace('_', ' ')}`;

    resetForm();

    const results =

      await Promise.allSettled([

        loadEvents(),

        loadMembers(),

        loadPublicBirthdays()

      ]);

    const errors = results

      .filter(result =>

        result.status === 'rejected'

      )

      .map(result =>

        result.reason?.message ||

        String(result.reason)

      );

    if (errors.length) {

      notice(

        'Some calendar data could not load: ' +

        errors.join(' · ') +

        '. Confirm the SQL migration is installed.',

        true

      );

    }

  }

  // =========================================
  // LOGIN FORM
  // =========================================

  $('login-form').addEventListener(

    'submit',

    async ev => {

      ev.preventDefault();

      try {

        if (!db) {

          throw new Error(

            'Supabase configuration is missing.'

          );

        }

        unwrap(

          await db.auth.signInWithPassword({

            email:

              $('login-email').value.trim(),

            password:

              $('login-password').value

          })

        );

        $('login-password').value = '';

        await init();

      } catch (error) {

        notice(

          'Sign-in failed: ' +

          error.message,

          true

        );

      }

    }

  );

  // =========================================
  // SIGN OUT
  // =========================================

  $('sign-out').addEventListener(

    'click',

    async () => {

      if (db) {

        await db.auth.signOut();

      }

      location.replace('login.html');

    }

  );

  // =========================================
  // TAB CONTROLS
  // =========================================

  $('tab-events').addEventListener(

    'click',

    () => setTab('events')

  );

  $('tab-birthdays').addEventListener(

    'click',

    () => setTab('birthdays')

  );

  // =========================================
  // EVENT FORM CONTROLS
  // =========================================

  $('event-form').addEventListener(

    'submit',

    saveEvent

  );

  $('clear-event').addEventListener(

    'click',

    resetForm

  );

  // Automatically enforce the minimum end date.

  $('event-date').addEventListener(

    'change',

    () => {

      const startDate =

        $('event-date').value;

      const endInput =

        $('event-end-date');

      endInput.min = startDate;

      if (

        endInput.value &&

        endInput.value < startDate

      ) {

        endInput.value = startDate;

      }

    }

  );

  // =========================================
  // EVENT FLYER CONTROLS
  // =========================================

  $('event-flyer').addEventListener(

    'change',

    selectEventFlyer

  );

  $('replace-event-flyer').addEventListener(

    'click',

    () => {

      if (!saving) {

        $('event-flyer').click();

      }

    }

  );

  $('remove-event-flyer').addEventListener(

    'click',

    removeEventFlyer

  );

  $('event-flyer-preview').addEventListener(

    'error',

    () => {

      $('event-flyer-status').textContent =

        'The image preview could not be loaded. Please verify the image or select a replacement.';

    }

  );

  window.addEventListener(

    'pagehide',

    releaseFlyerPreview

  );

  // =========================================
  // SEARCH AND FILTER CONTROLS
  // =========================================

  $('event-search').addEventListener(

    'input',

    renderEvents

  );

  $('event-filter').addEventListener(

    'change',

    renderEvents

  );

  $('member-search').addEventListener(

    'input',

    renderMembers

  );

  $('birthday-filter').addEventListener(

    'change',

    renderMembers

  );

  // =========================================
  // MANUAL REFRESH CONTROLS
  // =========================================

  $('refresh-events').addEventListener(

    'click',

    async () => {

      try {

        await loadEvents();

        notice('Event list refreshed.');

      } catch (error) {

        notice(

          'Refresh failed: ' +

          error.message,

          true

        );

      }

    }

  );

  $('refresh-birthdays').addEventListener(

    'click',

    async () => {

      try {

        await loadPublicBirthdays();

        notice(

          'Public birthday feed refreshed.'

        );

      } catch (error) {

        notice(

          'Refresh failed: ' +

          error.message,

          true

        );

      }

    }

  );

  // =========================================
  // AUTOMATIC EXPIRATION DISPLAY REFRESH
  // =========================================

  setInterval(() => {

    if (

      !saving &&

      !$('workspace').hidden

    ) {

      renderEvents();

      renderStats();

    }

  }, 60000);

  // =========================================
  // INITIALIZE APPLICATION
  // =========================================

  init().catch(error => {

    $('loading').textContent =

      'Unable to start the calendar dashboard.';

    notice(

      'Calendar admin error: ' +

      error.message,

      true

    );

  });

})();
