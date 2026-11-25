
/* =========================================
   BRIGHT LIGHT CHURCH
   PUBLIC UPCOMING EVENTS CAROUSEL
   ========================================= */

(() => {
  'use strict';

  const mount = document.getElementById('blc-event-carousel');

  if (!mount) return;

  const TIMEZONE = 'America/Chicago';
  const AUTOPLAY_MS = 6000;
  const REFRESH_MS = 60000;

  const track = document.getElementById('blc-carousel-track');
  const controls = document.getElementById('blc-carousel-controls');
  const previousButton = document.getElementById('blc-event-prev');
  const nextButton = document.getElementById('blc-event-next');
  const pauseButton = document.getElementById('blc-carousel-pause');
  const dots = document.getElementById('blc-carousel-dots');
  const count = document.getElementById('blc-carousel-count');

  const db =
    window.supabase?.createClient &&
    window.BLC_SUPABASE_URL &&
    window.BLC_SUPABASE_ANON_KEY
      ? window.supabase.createClient(
          window.BLC_SUPABASE_URL,
          window.BLC_SUPABASE_ANON_KEY
        )
      : null;

  let events = [];
  let currentIndex = 0;
  let autoplayTimer = null;
  let manuallyPaused = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  let hovering = false;
  let focused = false;
  let loading = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let lastSignature = null;

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

  function churchNow() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());

    const get = type =>
      parts.find(part => part.type === type)?.value;

    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      time: `${get('hour')}:${get('minute')}:${get('second')}`
    };
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return null;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = parseDate(value);

    if (!date) return '';

    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function normalizeTime(value) {
    if (!value) return '';

    const match = String(value).match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

    if (!match) return '';

    return [
      match[1].padStart(2, '0'),
      match[2],
      match[3] || '00'
    ].join(':');
  }

  function formatTime(value) {
    const time = normalizeTime(value);

    if (!time) return '';

    const [hour, minute] = time.split(':').map(Number);

    return `${hour % 12 || 12}:${String(minute)
      .padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  function isUpcoming(event) {
    const now = churchNow();

    if (!parseDate(event.event_date)) {
      return false;
    }

    const endDate = event.end_date || event.event_date;

    if (endDate < now.date) return false;
    if (endDate > now.date) return true;

    const endTime = normalizeTime(event.end_time);

    if (endTime && endTime <= now.time) {
      return false;
    }

    // Without an end time, retain today's event
    // until midnight Central Time.

    return true;
  }

  
function eventKey(event) {
  if (event.event_id != null) {
    return String(event.event_id);
  }

  return JSON.stringify([
    event.event_date,
    event.start_time,
    event.event_title,
    event.event_location
  ]);
}


  function safeUrl(value) {
    if (!value) return null;

    try {
      const url = new URL(value, window.location.origin);

      return url.protocol === 'https:'
        ? url.href
        : null;

    } catch {
      return null;
    }
  }

  function showMessage(title, description) {
    const message = el('div', 'blc-carousel-message');

    message.append(
      el('span', '', '✦'),
      el('h3', '', title),
      el('p', '', description)
    );

    track.replaceChildren(message);
    controls.hidden = true;
    count.textContent = 'Church Events';

    stopAutoplay();
  }

  function stopAutoplay() {
    if (autoplayTimer !== null) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();

    if (
      events.length < 2 ||
      manuallyPaused ||
      hovering ||
      focused ||
      document.hidden
    ) {
      return;
    }

    autoplayTimer = setInterval(() => {
      move(1);
    }, AUTOPLAY_MS);
  }

  function updatePauseButton() {
    pauseButton.textContent =
      manuallyPaused ? '▶' : 'Ⅱ';

    pauseButton.setAttribute(
      'aria-label',
      manuallyPaused
        ? 'Resume automatic scrolling'
        : 'Pause automatic scrolling'
    );

    pauseButton.title = manuallyPaused
      ? 'Resume slideshow'
      : 'Pause slideshow';

    pauseButton.setAttribute(
      'aria-pressed',
      String(manuallyPaused)
    );
  }

  function removeExpiredEvents() {
    const active = events[currentIndex];
    const activeKey = active ? eventKey(active) : null;

    const validEvents = events.filter(isUpcoming);

    if (validEvents.length === events.length) {
      return false;
    }

    events = validEvents;

    const matchingIndex = events.findIndex(
      event => eventKey(event) === activeKey
    );

    currentIndex = matchingIndex >= 0
      ? matchingIndex
      : 0;

    return true;
  }

  function renderDots() {
    dots.replaceChildren();

    events.forEach((event, index) => {
      const button = el(
        'button',
        'blc-carousel-dot' +
        (index === currentIndex ? ' is-active' : '')
      );

      button.type = 'button';

      button.setAttribute(
        'aria-label',
        `View event ${index + 1}: ${event.event_title}`
      );

      button.setAttribute(
        'aria-current',
        index === currentIndex ? 'true' : 'false'
      );

      button.addEventListener('click', () => {
        currentIndex = index;
        render();
        startAutoplay();

        dots.children[currentIndex]?.focus();
      });

      dots.append(button);
    });
  }

  function render() {
    removeExpiredEvents();

    if (!events.length) {
      showMessage(
        'Stay Connected',
        'New church events will appear here as soon as they are announced.'
      );

      return;
    }

    if (currentIndex >= events.length) {
      currentIndex = 0;
    }

    const event = events[currentIndex];
    const date = parseDate(event.event_date);

    const slide = el('article', 'blc-event-slide');

    slide.setAttribute('aria-roledescription', 'slide');

    slide.setAttribute(
      'aria-label',
      `${currentIndex + 1} of ${events.length}`
    );

    const dateBox = el('div', 'blc-carousel-date');

    const month = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short'
    }).format(date);

    dateBox.append(
      el('span', 'blc-carousel-month', month),
      el('strong', 'blc-carousel-day',
        String(date.getUTCDate())),
      el('span', 'blc-carousel-year',
        String(date.getUTCFullYear()))
    );

    const copy = el('div', 'blc-carousel-copy');

  
const eventHeading = el('h3');

const titleLink = el(
  'a',
  'blc-carousel-title-link',
  event.event_title || 'Church Event'
);

titleLink.href =
  `events.html?event=${encodeURIComponent(event.event_id)}&date=${encodeURIComponent(event.event_date)}`;

eventHeading.append(titleLink);

copy.append(
  el(
    'div',
    'blc-carousel-label',
    'Upcoming Church Event'
  ),

  eventHeading,

  el(
    'p',
    'blc-carousel-meta',
    formatDate(event.event_date) +
    (event.start_time
      ? ` · ${formatTime(event.start_time)} CT`
      : '')
  )
);


    if (event.event_location) {
      copy.append(
        el(
          'p',
          'blc-carousel-meta',
          `Location: ${event.event_location}`
        )
      );
    }

    if (event.event_description) {
      copy.append(
        el(
          'p',
          'blc-carousel-description',
          event.event_description
        )
      );
    }

    const detailsLink = el(
      'a',
      'blc-carousel-event-link',
      'View Event Details →'
    );

   
const eventPageUrl =
  `events.html?event=${encodeURIComponent(event.event_id)}&date=${encodeURIComponent(event.event_date)}`;

detailsLink.href = eventPageUrl;


    copy.append(detailsLink);
    slide.append(dateBox, copy);

    // Optional flyer support, if returned by the public RPC.

    const flyerUrl = safeUrl(
      event.flyer_url ||
      event.image_url ||
      event.event_image_url
    );

    if (flyerUrl) {
      const image = el('img', 'blc-carousel-flyer');

      image.src = flyerUrl;
      image.alt = `${event.event_title} event flyer`;
      image.loading = 'lazy';

      image.addEventListener('error', () => {
        image.remove();
      });

      
const imageLink = el(
  'a',
  'blc-carousel-flyer-link'
);

imageLink.href = eventPageUrl;

imageLink.setAttribute(
  'aria-label',
  `View details for ${event.event_title}`
);

imageLink.append(image);

slide.append(imageLink);

    }

    track.replaceChildren(slide);

    controls.hidden = events.length < 2;

    count.textContent =
      `Event ${currentIndex + 1} of ${events.length}`;

    renderDots();
    updatePauseButton();
  }

  function move(direction) {
    removeExpiredEvents();

    if (!events.length) {
      render();
      return;
    }

    currentIndex =
      (currentIndex + direction + events.length) %
      events.length;

    render();
  }

  async function loadEvents() {
    if (loading) return;

    if (!db) {
      showMessage(
        'Upcoming Events',
        'Please visit our church calendar for upcoming gatherings.'
      );

      console.warn('[BLC Events] Missing Supabase configuration.');
      return;
    }

    loading = true;

    try {
const { data, error } = await db.rpc(
  'blc_public_upcoming_events'
);

      if (error) throw error;

      const upcoming = (Array.isArray(data) ? data : [])
        .filter(isUpcoming)
        .sort((a, b) => {
          const first =
            `${a.event_date} ${normalizeTime(a.start_time)}`;

          const second =
            `${b.event_date} ${normalizeTime(b.start_time)}`;

          return first.localeCompare(second);
        });

      const signature = JSON.stringify(upcoming);

      if (signature !== lastSignature ||
          JSON.stringify(events) !== signature) {

        const active = events[currentIndex];
        const activeKey = active ? eventKey(active) : null;

        events = upcoming;
        lastSignature = signature;

        const matchingIndex = events.findIndex(
          event => eventKey(event) === activeKey
        );

        currentIndex = matchingIndex >= 0
          ? matchingIndex
          : 0;

        render();
        startAutoplay();
      }

    } catch (error) {
      console.warn('[BLC Event Carousel]', error);

      if (!events.length) {
        showMessage(
          'Stay Connected',
          'Upcoming events are temporarily unavailable. Please check back soon.'
        );
      }

    } finally {
      loading = false;
    }
  }

  previousButton.addEventListener('click', () => {
    move(-1);
    startAutoplay();
  });

  nextButton.addEventListener('click', () => {
    move(1);
    startAutoplay();
  });

  pauseButton.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;

    updatePauseButton();
    startAutoplay();
  });

  mount.addEventListener('mouseenter', () => {
    hovering = true;
    stopAutoplay();
  });

  mount.addEventListener('mouseleave', () => {
    hovering = false;
    startAutoplay();
  });

  mount.addEventListener('focusin', () => {
    focused = true;
    stopAutoplay();
  });

  mount.addEventListener('focusout', event => {
    focused = mount.contains(event.relatedTarget);

    if (!focused) {
      startAutoplay();
    }
  });

  mount.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
      startAutoplay();
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
      startAutoplay();
    }
  });

  track.addEventListener('touchstart', event => {
    touchStartX = event.changedTouches[0].screenX;
    touchStartY = event.changedTouches[0].screenY;
    stopAutoplay();
  }, { passive: true });

  track.addEventListener('touchend', event => {
    const differenceX =
      touchStartX - event.changedTouches[0].screenX;

    const differenceY =
      touchStartY - event.changedTouches[0].screenY;

    if (
      Math.abs(differenceX) > 50 &&
      Math.abs(differenceX) > Math.abs(differenceY)
    ) {
      move(differenceX > 0 ? 1 : -1);
    }

    startAutoplay();

  }, { passive: true });

  track.addEventListener('touchcancel', startAutoplay);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      if (removeExpiredEvents()) {
        render();
      }

      void loadEvents();
      startAutoplay();
    }
  });

  updatePauseButton();
  void loadEvents();

  // Refresh published events every minute.

  setInterval(() => {
    if (!document.hidden) {
      if (removeExpiredEvents()) {
        render();
        startAutoplay();
      }

      void loadEvents();
    }
  }, REFRESH_MS);

})();
