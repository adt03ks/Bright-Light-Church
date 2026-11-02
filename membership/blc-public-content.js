/* Bright Light Church public content loader — compatible with existing pages.
   Install at membership/blc-public-content.js, AFTER Supabase UMD + config.js.
   Replaces only content explicitly published in blc_page_content.
*/
(async function loadBrightLightContent() {
  'use strict';
  if (typeof window.supabase?.createClient !== 'function' ||
      !window.BLC_SUPABASE_URL || !window.BLC_SUPABASE_ANON_KEY) {
    console.warn('[BLC Content] Supabase or membership/config.js not available. Original page content is retained.');
    return;
  }

  const slots = Array.from(document.querySelectorAll('[data-blc-page][data-blc-slot]'));
  if (!slots.length) return;
  const db = window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY);

  // Use text nodes, BR and EM only: published headlines cannot inject HTML.
  // In the content editor, type: "The Word is | *unchanging.* | His light shines on."
  // | = line break; *words* = emphasized words. Both are optional.
  function updateHeadline(element, raw) {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const newNodes = [];
    raw.split('|').forEach((line, index) => {
      if (index) newNodes.push(document.createElement('br'));
      const tokens = line.trim().split(/(\*[^*]+\*)/g);
      for (const token of tokens) {
        if (!token) continue;
        if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
          const em = document.createElement('em');
          em.textContent = token.slice(1, -1);
          newNodes.push(em);
        } else {
          newNodes.push(document.createTextNode(token));
        }
      }
    });
    element.replaceChildren(...newNodes);
  }

  function updateImage(container, path, alt) {
    if (!path) return;
    const result = db.storage.from('blc-site-images').getPublicUrl(path);
    const publicUrl = result?.data?.publicUrl;
    if (!publicUrl) return;

    // Supports conventional <img> tags (older content slots) AND this site's
    // data-image <div> placeholders, including the optional homepage hero video.
    if (container.tagName === 'IMG') {
      container.src = publicUrl;
      container.alt = alt || container.alt || '';
      return;
    }
    const nestedImage = container.querySelector('img[data-blc-image]');
    if (nestedImage) {
      nestedImage.src = publicUrl;
      nestedImage.alt = alt || nestedImage.alt || '';
      return;
    }

    // Reuse the background-image system already present in the church design.
    container.dataset.image = publicUrl;
    container.style.backgroundImage = `url(${JSON.stringify(publicUrl)})`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';
    // Existing script.js may have injected a video or img into the placeholder.
    // Hide these only when the content editor has published a replacement photo.
    container.querySelectorAll('img, video, source').forEach(el => {
      el.hidden = true;
      el.style.display = 'none';
      if (el.tagName === 'VIDEO') el.pause();
    });
    container.querySelectorAll('.placeholder-label, .hero-placeholder').forEach(el => {
      el.hidden = true;
      el.style.display = 'none';
    });
    if (typeof alt === 'string' && alt.trim()) {
      container.setAttribute('role', 'img');
      container.setAttribute('aria-label', alt.trim());
    }
  }

  try {
    const pages = [...new Set(slots.map(el => el.dataset.blcPage))];
    for (const page of pages) {
      const { data: records, error } = await db
        .from('blc_page_content')
        .select('slot_key,title,caption,image_path,image_alt')
        .eq('page_key', page)
        .eq('published', true);
      if (error) {
        console.warn(`[BLC Content] Failed to load ${page}:`, error.message);
        continue;
      }
      const bySlot = new Map((records || []).map(record => [record.slot_key, record]));
      for (const element of slots.filter(el => el.dataset.blcPage === page)) {
        const record = bySlot.get(element.dataset.blcSlot);
        if (!record) continue;  // Retain existing design and text until published.
        const headline = element.querySelector('[data-blc-title]');
        if (headline) updateHeadline(headline, record.title);
        const caption = element.querySelector('[data-blc-caption]');
        if (caption && typeof record.caption === 'string' && record.caption.trim()) {
          caption.textContent = record.caption;
          if (record.caption.includes('\n')) caption.style.whiteSpace = 'pre-line';
        }
        const image = element.querySelector('[data-blc-image]');
        if (image && record.image_path) updateImage(image, record.image_path, record.image_alt);
      }
    }
  } catch (error) {
    // Public page should continue displaying its original static content.
    console.warn('[BLC Content] Unable to retrieve published content:', error);
  }
})();
