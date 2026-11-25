/* Bright Light Church public events + 30-day birthdays. No access to private blc_members. */
(() => {
  'use strict';
  const mount = document.getElementById('blc-events-calendar');
  if (!mount) return;
  const CHURCH_TIMEZONE = 'America/Chicago';
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const db = window.supabase?.createClient && window.BLC_SUPABASE_URL && window.BLC_SUPABASE_ANON_KEY
    ? window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY) : null;
  let events = [], birthdays = [], selected = null, currentMonth = null, requestToken = 0;
  const el = (tag, cls, text) => { const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e; };
  function churchToday() {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:CHURCH_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get = key => Number(parts.find(part=>part.type===key)?.value || 1);
    return formatYMD(get('year'),get('month'),get('day'));
  }
  
  // Hide expired church events from the public calendar.

  function isUpcomingChurchEvent(event) {
    const today = churchToday();

    if (!event.event_date) return false;

    const endDate =
      event.end_date || event.event_date;

    if (endDate < today) return false;
    if (endDate > today) return true;

    if (event.end_time) {
      const nowTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: CHURCH_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).format(new Date());

      const match = String(event.end_time).match(
        /^(\d{1,2}):(\d{2})(?::(\d{2}))?/
      );

      if (match) {
        const endTime = [
          match[1].padStart(2, '0'),
          match[2],
          match[3] || '00'
        ].join(':');

        if (endTime <= nowTime) {
          return false;
        }
      }
    }

    return true;
  }

  function formatYMD(year,month,day){return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
  function parseYMD(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;}
  function isoDay(date){return formatYMD(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());}
  function plusDays(iso,amount){const date=parseYMD(iso);date.setUTCDate(date.getUTCDate()+amount);return isoDay(date);}
  function dateLabel(iso){const date=parseYMD(iso);return date?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(date):iso;}
  function birthMonthDay(iso){const date=parseYMD(iso);return {month:monthNames[date.getUTCMonth()].slice(0,3),day:date.getUTCDate()};}
  function niceTime(value){if(!value)return '';const parts=String(value).split(':').map(Number);const h=parts[0];return `${h%12||12}${parts[1] ? ':'+String(parts[1]).padStart(2,'0'):''} ${h<12?'AM':'PM'}`;}
  function link(href,label){try{const u=new URL(href,location.origin);if(u.protocol!=='https:')return null;const a=el('a','',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}}
  function shell(){
    mount.classList.add('blc-events-app');mount.replaceChildren();
    const heading=el('div','blc-calendar-heading');const introduction=el('div');
    introduction.append(el('p','blc-calendar-eyebrow','CHURCH LIFE & CELEBRATIONS'),el('h2','', 'Church Calendar'),el('p','', 'Explore upcoming gatherings and celebrate the birthdays of church members who have chosen to be listed.'));
    const legend=el('div','blc-calendar-legend');
    for(const [label,type] of [['Church events','event'],['Member birthdays','birthday']]){const span=el('span');span.append(el('span','blc-legend-dot'+(type==='birthday'?' birthday':'')),document.createTextNode(label));legend.append(span);}
    heading.append(introduction,legend);
    const grid=el('div','blc-calendar-grid');const calendar=el('div','blc-calendar-panel');
    const toolbar=el('div','blc-month-toolbar');const month=el('h3');month.id='blc-month-label';const nav=el('div','blc-month-nav');
    for(const [label,text,method] of [['Previous month','‹',-1],['Today','Today',0],['Next month','›',1]]){
      const b=el('button','',text);b.type='button';b.setAttribute('aria-label',label);b.addEventListener('click',()=>{const today=churchToday();if(method===0){const d=parseYMD(today);currentMonth={year:d.getUTCFullYear(),month:d.getUTCMonth()};selected=today;}else{const d=new Date(Date.UTC(currentMonth.year,currentMonth.month+method,1));currentMonth={year:d.getUTCFullYear(),month:d.getUTCMonth()};selected=null;}void load();});nav.append(b);
    }
    toolbar.append(month,nav);const weekdaysRow=el('div','blc-weekdays');weekdays.forEach(x=>weekdaysRow.append(el('span','',x)));
    const days=el('div','blc-calendar-days');days.id='blc-calendar-days';days.setAttribute('role','grid');days.setAttribute('aria-label','Monthly calendar');
    const detail=el('div','blc-day-detail');detail.id='blc-calendar-detail';calendar.append(toolbar,weekdaysRow,days,detail);
    const sidebar=el('aside','blc-upcoming-panel');const head=el('div','blc-upcoming-head');
    head.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.7 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
    head.append(el('h3','', 'Upcoming Birthdays'));
    sidebar.append(head,el('p','blc-subtitle','Today through the next 30 days · Dates shown without birth years'));
    const birthdayList=el('div','blc-birthday-list');birthdayList.id='blc-birthday-list';sidebar.append(birthdayList);
    const status=el('p','blc-events-status');status.id='blc-calendar-status';status.setAttribute('aria-live','polite');
    grid.append(calendar,sidebar);mount.append(heading,grid,status);
  }

  function itemsOn(day) {
    return [
      ...events
        .filter(event =>
          event.event_date === day &&
          isUpcomingChurchEvent(event)
        )
        .map(event => ({
          kind: 'event',
          data: event
        })),

      ...birthdays
        .filter(birthday =>
          birthday.birthday_on === day
        )
        .map(birthday => ({
          kind: 'birthday',
          data: birthday
        }))
    ];
  }

  function renderDays(){
    const days=document.getElementById('blc-calendar-days');days.replaceChildren();
    const today=churchToday(),first=new Date(Date.UTC(currentMonth.year,currentMonth.month,1));
    const firstGrid=new Date(first);firstGrid.setUTCDate(firstGrid.getUTCDate()-firstGrid.getUTCDay());
    const lastMonthDay=new Date(Date.UTC(currentMonth.year,currentMonth.month+1,0));
    const span=Math.ceil((first.getUTCDay()+lastMonthDay.getUTCDate())/7)*7;
    document.getElementById('blc-month-label').textContent=`${monthNames[currentMonth.month]} ${currentMonth.year}`;
    for(let i=0;i<span;i++){
      const date=new Date(firstGrid);date.setUTCDate(date.getUTCDate()+i);const day=isoDay(date),todayDay=day===today;
      const items=itemsOn(day);
      const b=el('button','blc-calendar-day'+(date.getUTCMonth()!==currentMonth.month?' is-outside':'')+(day===selected?' is-selected':'')+(todayDay?' is-today':''));
      b.type='button';b.setAttribute('role','gridcell');b.setAttribute('aria-label',`${dateLabel(day)}: ${items.length} event${items.length===1?'':'s'}`);b.setAttribute('aria-pressed',String(day===selected));
      b.append(el('span','blc-day-number',String(date.getUTCDate())));
      const dots=el('div','blc-day-dots');for(const item of items.slice(0,5)){dots.append(el('span','blc-day-dot'+(item.kind==='birthday'?' birthday':'')));}
      if(items.length>0)b.append(dots,el('span','blc-day-title',items[0].kind==='birthday'?`🎂 ${items[0].data.display_name}`:items[0].data.event_title));
      b.addEventListener('click',()=>{selected=day;if(date.getUTCMonth()!==currentMonth.month){currentMonth={year:date.getUTCFullYear(),month:date.getUTCMonth()};void load();}else{renderDays();renderDetails();}});days.append(b);
    }
  }
  
function openEventDetails(event) {

  if (!isUpcomingChurchEvent(event)) {
    return;
  }

  document.getElementById(
    'blc-event-dialog'
  )?.remove();

  const dialog = el(
    'dialog',
    'blc-event-dialog'
  );

  dialog.id = 'blc-event-dialog';

  const panel = el(
    'div',
    'blc-event-modal-panel'
  );

  const closeButton = el(
    'button',
    'blc-event-modal-close',
    '×'
  );

  closeButton.type = 'button';

  closeButton.setAttribute(
    'aria-label',
    'Close event details'
  );

  closeButton.addEventListener(
    'click',
    () => dialog.close()
  );

  panel.append(closeButton);

  // Display the promotional flyer.

  if (event.flyer_url) {

    const validImageLink = link(
      event.flyer_url,
      ''
    );

    if (validImageLink) {

      const image = el(
        'img',
        'blc-event-modal-image'
      );

      image.src = validImageLink.href;

      image.alt =
        `${event.event_title} promotional flyer`;

      image.addEventListener(
        'error',
        () => image.remove()
      );

      panel.append(image);
    }
  }

  const content = el(
    'div',
    'blc-event-modal-content'
  );

  content.append(
    el(
      'div',
      'blc-event-modal-label',
      'BRIGHT LIGHT CHURCH'
    )
  );

  const heading = el(
    'h2',
    '',
    event.event_title
  );

  heading.id = 'blc-event-dialog-title';

  dialog.setAttribute(
    'aria-labelledby',
    heading.id
  );

  content.append(heading);

  content.append(
    el(
      'p',
      'blc-event-modal-meta',
      '📅 ' + dateLabel(event.event_date)
    )
  );

  if (event.start_time) {

    let timeText =
      niceTime(event.start_time);

    if (event.end_time) {
      timeText +=
        ' – ' + niceTime(event.end_time);
    }

    content.append(
      el(
        'p',
        'blc-event-modal-meta',
        '🕒 ' + timeText + ' CT'
      )
    );
  }

  if (event.event_location) {

    content.append(
      el(
        'p',
        'blc-event-modal-meta',
        '📍 ' + event.event_location
      )
    );
  }

  if (event.event_description) {

    content.append(
      el(
        'h3',
        '',
        'About This Event'
      )
    );

    content.append(
      el(
        'p',
        'blc-event-modal-description',
        event.event_description
      )
    );
  }

  const actions = el(
    'div',
    'blc-event-modal-actions'
  );

  if (event.details_url) {

    const externalLink = link(
      event.details_url,
      'More Information / Registration ↗'
    );

    if (externalLink) {

      externalLink.className =
        'blc-event-modal-button';

      actions.append(externalLink);
    }
  }

  const shareButton = el(
    'button',
    'blc-event-modal-button',
    'Share Event'
  );

  shareButton.type = 'button';

  shareButton.addEventListener(
    'click',
    async () => {

      const shareUrl = new URL(
        window.location.pathname,
        window.location.origin
      );

      shareUrl.searchParams.set(
        'event',
        event.event_id
      );

      shareUrl.searchParams.set(
        'date',
        event.event_date
      );

      try {

        if (navigator.share) {

          await navigator.share({
            title: event.event_title,
            text: 'Join us at Bright Light Church!',
            url: shareUrl.href
          });

        } else {

          await navigator.clipboard.writeText(
            shareUrl.href
          );

          shareButton.textContent =
            'Link Copied!';

        }

      } catch (error) {

        if (error.name !== 'AbortError') {

          window.prompt(
            'Copy this event link:',
            shareUrl.href
          );

        }
      }

    }
  );

  actions.append(shareButton);
  content.append(actions);
  panel.append(content);
  dialog.append(panel);

  document.body.append(dialog);

  dialog.addEventListener(
    'click',
    event => {
      if (event.target === dialog) {
        dialog.close();
      }
    }
  );

  dialog.addEventListener(
    'close',
    () => dialog.remove()
  );

  dialog.showModal();

}

  
function renderDetails() {

  const holder = document.getElementById(
    'blc-calendar-detail'
  );

  holder.replaceChildren();

  const on = selected || churchToday();

  holder.append(
    el('h4', '', dateLabel(on))
  );

  const found = itemsOn(on);

  if (!found.length) {

    holder.append(
      el(
        'p',
        'blc-calendar-empty',
        'Nothing listed for this date.'
      )
    );

    return;
  }

  for (const item of found) {

    const entry = el(
      'div',
      'blc-event-detail'
    );

    if (item.kind === 'birthday') {

      entry.append(
        el(
          'div',
          'blc-event-type birthday',
          'Member Birthday'
        ),

        el(
          'strong',
          '',
          `🎂 ${item.data.display_name}`
        )
      );

    } else {

      const event = item.data;

      entry.append(
        el(
          'div',
          'blc-event-type',
          'Church Event'
        )
      );

      const button = el(
        'button',
        'blc-calendar-event-card'
      );

      button.type = 'button';

      button.addEventListener(
        'click',
        () => openEventDetails(event)
      );

      if (event.flyer_url) {

        const validImage = link(
          event.flyer_url,
          ''
        );

        if (validImage) {

          const image = el(
            'img',
            'blc-calendar-event-thumbnail'
          );

          image.src = validImage.href;

          image.alt =
            `${event.event_title} flyer`;

          image.loading = 'lazy';

          image.addEventListener(
            'error',
            () => image.remove()
          );

          button.append(image);
        }
      }

      const copy = el(
        'div',
        'blc-calendar-event-copy'
      );

      copy.append(
        el(
          'strong',
          '',
          event.event_title
        )
      );

      if (event.start_time) {

        copy.append(
          el(
            'p',
            '',
            niceTime(event.start_time) + ' CT'
          )
        );
      }

      if (event.event_location) {

        copy.append(
          el(
            'p',
            '',
            event.event_location
          )
        );
      }

      copy.append(
        el(
          'span',
          'blc-calendar-view-details',
          'View Event Details →'
        )
      );

      button.append(copy);
      entry.append(button);

    }

    holder.append(entry);

  }

}

  function renderBirthdays(){
    const target=document.getElementById('blc-birthday-list');target.replaceChildren();
    if(!birthdays.length){target.append(el('p','blc-calendar-empty','No public birthdays are listed for the next 30 days. Members must opt in before their birthdays appear.'));return;}
    for(const birth of birthdays){const row=el('div','blc-birthday-item'),d=birthMonthDay(birth.birthday_on),box=el('div','blc-birthday-date');box.append(el('small','',d.month),el('strong','',String(d.day)));const copy=el('div');copy.append(el('div','blc-birthday-name',birth.display_name),el('div','blc-birthday-note',birth.birthday_on===churchToday()?'Today!':'Upcoming celebration'));row.append(box,copy);target.append(row);}
  }
  async function load(){
    const token=++requestToken;const status=document.getElementById('blc-calendar-status');
    const first=new Date(Date.UTC(currentMonth.year,currentMonth.month,1));first.setUTCDate(first.getUTCDate()-first.getUTCDay());
    const start=isoDay(first),end=plusDays(start,41);status.textContent='Loading church calendar…';
    if(!db){status.textContent='Calendar configuration is missing. Contact the website administrator.';renderDays();renderBirthdays();return;}
    try{
      const [e,b]=await Promise.all([
       db.rpc('blc_public_calendar_events_v2', {
  p_start_date: start,
  p_end_date: end
}),
        db.rpc('blc_public_next_30_birthdays')
      ]);
      if(token!==requestToken)return;
      if(e.error)throw e.error;if(b.error)throw b.error;
      events = (Array.isArray(e.data) ? e.data : [])
  .filter(isUpcomingChurchEvent);

birthdays = Array.isArray(b.data) ? b.data : [];
      renderDays();renderDetails();renderBirthdays();
if (requestedEventId) {

  const requestedEvent = events.find(
    event =>
      String(event.event_id) ===
      String(requestedEventId)
  );

  if (requestedEvent) {

    selected = requestedEvent.event_date;

    renderDays();
    renderDetails();

    openEventDetails(requestedEvent);

  } else {

    status.textContent =
      'This event is no longer available.';

  }

  requestedEventId = null;

}
status.textContent=`Updated for Bright Light Church · ${monthNames[currentMonth.month]} ${currentMonth.year}`;
    }catch(error){if(token!==requestToken)return;events=[];birthdays=[];renderDays();renderDetails();renderBirthdays();status.textContent='Unable to load events or birthdays. Check that the database upgrade has been installed.';console.warn('[BLC Calendar]',error);}
  }
  
const eventParams = new URLSearchParams(
  window.location.search
);

let requestedEventId =
  eventParams.get('event');

const requestedEventDate =
  eventParams.get('date');

const today = churchToday();

const validRequestedDate =
  requestedEventDate &&
  parseYMD(requestedEventDate) &&
  requestedEventDate >= today
    ? requestedEventDate
    : today;

const initial = parseYMD(
  validRequestedDate
);

currentMonth = {
  year: initial.getUTCFullYear(),
  month: initial.getUTCMonth()
};

selected = validRequestedDate;

  
  shell();
  void load();

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        void load();
      }
    }
  );

  // Refresh public events every 60 seconds.

  setInterval(() => {
    if (!document.hidden) {
      events = events.filter(isUpcomingChurchEvent);

      renderDays();
      renderDetails();

      void load();
    }
  }, 60000);

})();
