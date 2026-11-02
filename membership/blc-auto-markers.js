/* Bright Light Church visual CMS: identify safe editorial regions on public pages.
   Defer this script BEFORE blc-public-content.js.
   Content/form elements, links, footers, navigation, and any personal data are not editable.
   To keep identifiers stable when restructuring pages, add explicit data-blc-slot identifiers.
*/
(function () {
  'use strict';
  const filename = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const page = filename === 'index.html' ? 'home' : filename.replace(/\.html?$/, '').replace(/[^a-z0-9_-]/g,'-');
  const main = document.querySelector('main');
  if (!main || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(page)) return;

  // On the homepage, preserve the explicit original, hand-mapped content slots.
  if (page === 'home' && main.querySelector('[data-blc-page="home"][data-blc-slot]')) return;

  const nearestSlot = node => node.closest('[data-blc-slot]');
  const isEditableElement = node => !!node && !node.closest('form,nav,footer,header,[data-blc-skip],.site-header,.site-footer,script,style,template');
  const own = (slot,selector) => Array.from(slot.querySelectorAll(selector)).find(node => isEditableElement(node) && nearestSlot(node) === slot);
  const tidy = text => (text || '').replace(/\s+/g,' ').trim().slice(0,90);
  function mark(slot,key,label) {
    if (!slot || slot.hasAttribute('data-blc-slot')) return;
    slot.dataset.blcPage = page;
    slot.dataset.blcSlot = key;
    slot.dataset.blcEditorLabel = label;
    const title = own(slot,'h1,h2,h3,h4');
    const caption = own(slot,'p:not(.eyebrow):not(.tiny-label):not(.pending):not(.foot-small),[data-blc-caption]');
    const image = slot.matches('img,[data-image]') ? slot : own(slot,'[data-image],img');
    if (title && !title.hasAttribute('data-blc-title')) title.dataset.blcTitle='';
    if (caption && !caption.hasAttribute('data-blc-caption')) caption.dataset.blcCaption='';
    if (image && !image.hasAttribute('data-blc-image')) image.dataset.blcImage='';
    if (!title && !caption && !image) {
      slot.removeAttribute('data-blc-page');slot.removeAttribute('data-blc-slot');slot.removeAttribute('data-blc-editor-label');
    }
  }

  // Top-level editorial sections, not embedded signup forms or nested sections.
  let sections=Array.from(main.querySelectorAll('section')).filter(el=>!el.parentElement.closest('section'));
  if (!sections.length) {
    sections=Array.from(main.children).filter(el=>el.matches('article,div') && !el.matches('.hidden,[hidden]'));
  }
  if (!sections.length) sections=[main];
  sections.forEach((section,i)=>{
    const sectionNumber=String(i+1).padStart(2,'0');
    const title=section.querySelector('h1,h2,h3');
    const sectionLabel=tidy(title?.textContent) || `Page section ${i+1}`;
    // Create smaller, independent editorial cards inside a section.
    const candidates=Array.from(section.querySelectorAll('article,.ministry-card,.leader-card,.team-card,.event-card,.sermon-card,.service-card,.staff-card,.feature-card,.value-card'));
    const cards=candidates.filter(el=>el!==section && !candidates.some(parent=>parent!==el && parent.contains(el)) && !el.closest('form'));
    cards.forEach((card,j)=>{
      const cardTitle=tidy(card.querySelector('h2,h3,h4')?.textContent) || `Card ${j+1}`;
      mark(card,`card-${sectionNumber}-${String(j+1).padStart(2,'0')}`,cardTitle);
    });
    // When a section has several separate photographs, expose each photo
    // individually. A section with one photo keeps its title + photo together.
    const individualPhotos=Array.from(section.querySelectorAll('[data-image],img')).filter(el=>{
      if(el.matches('img') && el.parentElement.closest('[data-image]'))return false;
      const parentSlot=el.closest('[data-blc-slot]');
      return !parentSlot || parentSlot===section;
    });
    if(individualPhotos.length>1){
      individualPhotos.forEach((photo,j)=>{
        const alt=photo.getAttribute('alt')||photo.getAttribute('aria-label');
        mark(photo,`photo-${sectionNumber}-${String(j+1).padStart(2,'0')}`,tidy(alt)||`Photo ${j+1} — ${sectionLabel}`);
      });
    }
    mark(section,`section-${sectionNumber}`,sectionLabel);
  });
})();
