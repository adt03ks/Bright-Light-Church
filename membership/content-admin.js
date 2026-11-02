'use strict';

// Homepage slot descriptions correspond to data-blc-page="home" / data-blc-slot
// markers already installed in the Bright Light Church index.html.
const HOME_SECTIONS = [
  { key: 'hero', label: 'Top welcome banner', location: 'Very top of homepage', icon: '✦', description: 'Large worship hero photo, main headline, and introductory paragraph.' },
  { key: 'welcome', label: 'Welcome & fellowship', location: 'Below service times', icon: '♥', description: 'Church family photo, “Rooted in Scripture” headline, and first welcome paragraph.' },
  { key: 'values', label: 'Our church values', location: 'Dark blue section', icon: '▤', description: '“Faith for every generation” heading and the introductory line above the three value cards.' },
  { key: 'pastor', label: 'Meet our pastor', location: 'Pastor feature', icon: '♧', description: 'Pastor photo, Pastor Archie’s displayed name, and the first biography paragraph.' },
  { key: 'ministry-youth', label: 'Youth & children', location: 'First ministry card', icon: '★', description: 'Youth ministry photo, Youth & Children heading, and description.' },
  { key: 'ministry-prayer', label: 'Prayer & discipleship', location: 'Second ministry card', icon: '✧', description: 'Prayer ministry photo, heading, and description.' },
  { key: 'ministry-worship', label: 'Music & worship', location: 'Third ministry card', icon: '♫', description: 'Worship ministry photo, heading, and description.' },
  { key: 'watch', label: 'Bright Light TV', location: 'Featured message section', icon: '▶', description: 'Featured sermon image, “The Word goes where you are” heading, and paragraph.' },
  { key: 'events', label: 'Upcoming events', location: 'Events section', icon: '▦', description: 'Events heading and event description. The “Coming Soon” date block is not controlled here.' },
  { key: 'visit', label: 'Closing invitation', location: 'Bottom of homepage', icon: '⌂', description: '“Come as you are” heading only. The church address and buttons remain unchanged.' }
];

const $ = id => document.getElementById(id);
const db = (window.supabase?.createClient && window.BLC_SUPABASE_URL && window.BLC_SUPABASE_ANON_KEY)
  ? window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY)
  : null;
let authUser = null;
let records = [];
let selected = null;
let activeKey = null;
let frameReady = false;
let unsavedPreview = false;
let imageObjectUrl = null;

function notice(message) { $('notice').textContent = message; }
function must(result) { if (result.error) throw result.error; return result.data; }
function currentRow(page, slot) { return records.find(x => x.page_key === page && x.slot_key === slot) || null; }
function frameDocument() {
  try { return $('website-preview').contentDocument; }
  catch { return null; }
}
function selectedNode() {
  const doc = frameDocument();
  return doc && activeKey ? [...doc.querySelectorAll('[data-blc-page="home"][data-blc-slot]')]
    .find(el => el.dataset.blcSlot === activeKey) : null;
}
function setPreviewStatus(message, isUnsaved = false) {
  $('preview-status').textContent = message;
  $('preview-status').classList.toggle('unsaved', isUnsaved);
}
function clearObjectUrl() {
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = null;
}
function getPublicImageUrl(path) {
  if (!path) return null;
  return db.storage.from('blc-site-images').getPublicUrl(path)?.data?.publicUrl || null;
}
function imageThumbnail(path) {
  const url = getPublicImageUrl(path);
  if (!url) { $('preview').hidden = true; $('preview').removeAttribute('src'); return; }
  $('preview').src = url;
  $('preview').hidden = false;
}
function fillEntry(row) {
  selected = row;
  $('content-form').reset();
  $('page-key').value = row?.page_key || 'home';
  $('slot-key').value = row?.slot_key || activeKey || '';
  $('title').value = row?.title || '';
  $('caption').value = row?.caption || '';
  $('alt').value = row?.image_alt || '';
  $('image-path').value = row?.image_path || '';
  $('published').checked = !!row?.published;
  clearObjectUrl();
  imageThumbnail(row?.image_path);
}
function renderSections() {
  const container = $('section-list');
  container.replaceChildren();
  for (const section of HOME_SECTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'section-button' + (activeKey === section.key ? ' active' : '');
    button.dataset.key = section.key;
    button.setAttribute('aria-pressed', String(activeKey === section.key));
    const icon = document.createElement('span');
    icon.className = 'section-icon'; icon.textContent = section.icon;
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.className = 'section-text';
    const strong = document.createElement('strong'); strong.textContent = section.label;
    const small = document.createElement('small'); small.textContent = section.location;
    text.append(strong, small);
    button.append(icon, text);
    button.addEventListener('click', () => selectHomepageSection(section.key));
    container.appendChild(button);
  }
}
function renderRecords() {
  const query = $('filter').value.trim().toLowerCase();
  const entries = $('entries'); entries.replaceChildren();
  const results = records.filter(x => !query || x.page_key.includes(query));
  for (const row of results) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'entry';
    button.textContent = `${row.page_key} / ${row.slot_key} — ${row.published ? 'Published' : 'Draft'}`;
    button.addEventListener('click', () => {
      if (row.page_key === 'home' && HOME_SECTIONS.some(x => x.key === row.slot_key)) {
        selectHomepageSection(row.slot_key);
      } else {
        if (unsavedPreview) reloadPreview();
        activeKey = null; renderSections(); fillEntry(row);
        $('page-key').readOnly = false; $('slot-key').readOnly = false;
        $('selection-summary').replaceChildren();
        const heading = document.createElement('strong'); heading.textContent = `Editing ${row.page_key} / ${row.slot_key}`;
        const body = document.createElement('p'); body.textContent = 'This entry has no visual homepage mapping. The editor still works, but its page must have a matching content slot.';
        $('selection-summary').append(heading, body);
        $('current-content').hidden = true;
        for (const id of ['title-field','caption-field','image-field','alt-field','image-path-field','title-hint']) $(id).hidden = false;
        setPreviewStatus('Visual selection is currently available for the homepage only.');
      }
    });
    entries.appendChild(button);
  }
  if (!results.length) entries.textContent = 'No saved content for this page yet.';
}
function setEditorFieldAvailability(node) {
  const hasTitle = !!node?.querySelector('[data-blc-title]');
  const hasCaption = !!node?.querySelector('[data-blc-caption]');
  const hasImage = !!node?.querySelector('[data-blc-image]');
  $('title-field').hidden = !hasTitle;
  $('title-hint').hidden = !hasTitle;
  $('caption-field').hidden = !hasCaption;
  $('image-field').hidden = !hasImage;
  $('alt-field').hidden = !hasImage;
  $('image-path-field').hidden = !hasImage;
  $('current-content').hidden = !node;
  if (node) {
    $('current-title').textContent = node.querySelector('[data-blc-title]')?.textContent?.replace(/\s+/g, ' ').trim() || '(no editable headline)';
    $('current-caption').textContent = node.querySelector('[data-blc-caption]')?.textContent?.replace(/\s+/g, ' ').trim() || '(no editable caption)';
  }
}
function highlightSection(scrollTo = true) {
  const doc = frameDocument();
  if (!doc) return;
  doc.querySelectorAll('.blc-visual-selected').forEach(el => el.classList.remove('blc-visual-selected'));
  const node = selectedNode();
  if (!node) return;
  node.classList.add('blc-visual-selected');
  if (scrollTo) node.scrollIntoView({behavior:'smooth',block:'center'});
  setEditorFieldAvailability(node);
}
function selectHomepageSection(key, fromIframe = false) {
  const section = HOME_SECTIONS.find(item => item.key === key);
  if (!section) return;
  if (unsavedPreview && activeKey !== key) reloadPreview();
  activeKey = key;
  selected = null;
  fillEntry(currentRow('home', key));
  $('page-key').value = 'home';
  $('slot-key').value = key;
  $('page-key').readOnly = true; $('slot-key').readOnly = true;
  $('selection-summary').replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = section.label;
  const description = document.createElement('p'); description.textContent = section.description;
  const state = document.createElement('p');
  const row = currentRow('home', key);
  state.textContent = row ? (row.published ? 'Published content exists for this section.' : 'A draft exists for this section. It is not visible publicly.') : 'No custom content saved yet. The website currently uses its original text and imagery.';
  $('selection-summary').append(heading, description, state);
  const node = selectedNode();
  if (node) setEditorFieldAvailability(node);
  else {
    // Use known features when iframe has not finished loading yet.
    $('current-content').hidden = true;
    const available = key !== 'visit' && key !== 'events' && key !== 'values';
    $('image-field').hidden = !available;
    $('alt-field').hidden = !available;
    $('image-path-field').hidden = !available;
    $('caption-field').hidden = key === 'visit';
  }
  renderSections();
  renderRecords();
  highlightSection(!fromIframe);
  if (!unsavedPreview) setPreviewStatus(`Selected: ${section.label}. The gold outline shows which area will change.`);
}
function installPreviewInteractions() {
  const doc = frameDocument();
  if (!doc || !doc.head) {
    frameReady = false;
    setPreviewStatus('Preview is not accessible. Open this editor from the same domain as the website.');
    return;
  }
  frameReady = true;
  if (doc.getElementById('blc-visual-edit-style')) return;
  const style = doc.createElement('style');
  style.id = 'blc-visual-edit-style';
  style.textContent = `
    [data-blc-page="home"][data-blc-slot] {cursor:pointer !important; transition:outline-color .15s ease !important}
    [data-blc-page="home"][data-blc-slot]:hover {outline:3px dashed #f1bd4c !important;outline-offset:-2px !important}
    .blc-visual-selected {outline:5px solid #f1bd4c !important;outline-offset:-4px !important;position:relative !important}
    .blc-visual-selected::after {content:"SELECTED SECTION";position:absolute;z-index:2147483647;right:6px;top:6px;background:#f1bd4c;color:#182437;font:700 11px system-ui,sans-serif;padding:5px 9px;border-radius:4px;pointer-events:none}
    .blc-visual-selected [data-blc-title] {outline:3px dashed #9865db !important;outline-offset:3px !important}
    .blc-visual-selected [data-blc-caption] {outline:3px dashed #19a6a7 !important;outline-offset:3px !important}
    .blc-visual-selected [data-blc-image] {outline:4px solid #4c9ff0 !important;outline-offset:-3px !important}
  `;
  doc.head.appendChild(style);
  doc.addEventListener('click', (event) => {
    // Preview is for selecting content only, never navigating or submitting forms.
    event.preventDefault();
    event.stopImmediatePropagation();
    const section = event.target?.closest?.('[data-blc-page="home"][data-blc-slot]');
    if (section) selectHomepageSection(section.dataset.blcSlot, true);
  }, true);
  highlightSection(false);
  if (activeKey) setEditorFieldAvailability(selectedNode());
}
function reloadPreview() {
  unsavedPreview = false;
  const iframe = $('website-preview');
  // Same src navigation, not parent page reload: does not save or publish anything.
  iframe.contentWindow?.location.reload();
  setPreviewStatus('Resetting preview. No unsaved changes were published.');
}
function formatHeadline(element, raw) {
  if (!raw?.trim()) return;
  const doc = element.ownerDocument;
  const newNodes = [];
  raw.split('|').forEach((part,index) => {
    if (index) newNodes.push(doc.createElement('br'));
    for (const token of part.trim().split(/(\*[^*]+\*)/g)) {
      if (!token) continue;
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        const emph = doc.createElement('em'); emph.textContent = token.slice(1,-1); newNodes.push(emph);
      } else newNodes.push(doc.createTextNode(token));
    }
  });
  element.replaceChildren(...newNodes);
}
function replacePreviewImage(node, url, alt) {
  if (!node || !url) return;
  if (node.tagName === 'IMG') {node.src = url; node.alt = alt || ''; return;}
  node.dataset.image = url;
  node.style.backgroundImage = `url(${JSON.stringify(url)})`;
  node.style.backgroundSize = 'cover';
  node.style.backgroundPosition = 'center';
  node.style.backgroundRepeat = 'no-repeat';
  node.querySelectorAll('video, img, source').forEach(el => {
    el.hidden = true; el.style.display = 'none';
    if (el.tagName === 'VIDEO') el.pause();
  });
  node.querySelectorAll('.placeholder-label, .hero-placeholder').forEach(el => {el.hidden = true;el.style.display = 'none';});
  if (alt?.trim()) {node.setAttribute('role','img');node.setAttribute('aria-label',alt.trim());}
}
function previewChanges() {
  const node = selectedNode();
  if (!frameReady || !node) {
    notice('Select a homepage section first. The interactive preview only works on the same website domain.');
    return;
  }
  const title = node.querySelector('[data-blc-title]');
  if (title) formatHeadline(title,$('title').value);
  const caption = node.querySelector('[data-blc-caption]');
  if (caption && $('caption').value.trim()) {
    caption.textContent = $('caption').value;
    caption.style.whiteSpace = 'pre-line';
  }
  const image = node.querySelector('[data-blc-image]');
  const file = $('image').files[0];
  const newUrl = file ? imageObjectUrl : getPublicImageUrl($('image-path').value);
  if (image && newUrl) replacePreviewImage(image,newUrl,$('alt').value);
  unsavedPreview = true;
  highlightSection(false);
  node.scrollIntoView({behavior:'smooth',block:'center'});
  setPreviewStatus('PREVIEW ONLY — these changes are not saved or published. Click Save content when ready.',true);
  notice('You are viewing an unsaved preview. Your public website has not changed.');
}
async function loadRecords() {
  records = must(await db.from('blc_page_content').select('*').order('page_key').order('slot_key'));
  renderRecords();
}
async function init() {
  if (!db) { notice('Supabase configuration is missing. Check config.js and the Supabase browser library.');return; }
  const {data,error} = await db.auth.getUser();
  if (error) throw error;
  authUser = data?.user || null;
  if (!authUser) {$('signin-panel').hidden = false;$('editor-panel').hidden = true;return;}
  const role = must(await db.from('blc_content_roles').select('role').eq('auth_user_id',authUser.id).maybeSingle());
  if (!role) {$('signin-panel').hidden = false;$('editor-panel').hidden = true;notice('This login does not have website content editing permission.');return;}
  $('signin-panel').hidden = true;$('editor-panel').hidden = false;
  $('signed-in').textContent = `${authUser.email} • ${role.role}`;
  await loadRecords();
  const requestedSlot = new URLSearchParams(location.search).get('slot');
  selectHomepageSection(HOME_SECTIONS.some(item => item.key === requestedSlot) ? requestedSlot : 'hero');
}
$('signin').addEventListener('submit',async event=>{
  event.preventDefault();
  try {must(await db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));notice('Signed in.');await init();}
  catch (error) {notice(error.message);}
});
$('logout').addEventListener('click',async()=>{await db.auth.signOut();location.reload();});
$('filter').addEventListener('input',renderRecords);
$('reload').addEventListener('click',()=>loadRecords().catch(error=>notice(error.message)));
$('new').addEventListener('click',()=>{
  if (unsavedPreview) reloadPreview();
  activeKey=null;selected=null;fillEntry(null);
  $('page-key').value='';$('slot-key').value='';
  $('page-key').readOnly=false;$('slot-key').readOnly=false;
  for (const id of ['title-field','caption-field','image-field','alt-field','image-path-field','title-hint']) $(id).hidden = false;
  $('current-content').hidden = true;
  $('selection-summary').replaceChildren();
  const title=document.createElement('strong');title.textContent='New manual content slot';
  const desc=document.createElement('p');desc.textContent='For advanced use on pages with data-blc slot markers. Select a homepage section to return to visual editing.';
  $('selection-summary').append(title,desc);
  renderSections();
  highlightSection(false);
  setPreviewStatus('Manual entry mode: homepage selection is paused.');
});
$('desktop-size').addEventListener('click',()=>{
  $('preview-shell').classList.remove('mobile');
  $('desktop-size').classList.add('view-active');$('mobile-size').classList.remove('view-active');
  $('desktop-size').setAttribute('aria-pressed','true');$('mobile-size').setAttribute('aria-pressed','false');
});
$('mobile-size').addEventListener('click',()=>{
  $('preview-shell').classList.add('mobile');
  $('mobile-size').classList.add('view-active');$('desktop-size').classList.remove('view-active');
  $('mobile-size').setAttribute('aria-pressed','true');$('desktop-size').setAttribute('aria-pressed','false');
});
$('reload-preview').addEventListener('click',reloadPreview);
$('website-preview').addEventListener('load', installPreviewInteractions);
if ($('website-preview').contentDocument?.readyState === 'complete') installPreviewInteractions();
$('preview-changes').addEventListener('click',previewChanges);
$('image').addEventListener('change',()=>{
  clearObjectUrl();
  const file=$('image').files[0];
  if (file && file.type.startsWith('image/')) {
    imageObjectUrl=URL.createObjectURL(file);
    $('preview').src=imageObjectUrl;
    $('preview').hidden=false;
  } else imageThumbnail($('image-path').value);
});
$('content-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    if (!authUser) throw Error('You must sign in before editing website content.');
    const page=$('page-key').value.trim(),slot=$('slot-key').value.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(page)||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slot)) throw Error('Page and slot keys must be lowercase letters, numbers, hyphens, or underscores.');
    let path = $('image-path').value || null;
    const file=$('image').files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) throw Error('Image must be 5 MB or smaller.');
      const typeToExt={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
      const ext=typeToExt[file.type];
      if (!ext) throw Error('Only JPEG, PNG, WebP, and GIF images are supported.');
      path=`${page}/${slot}/${crypto.randomUUID()}.${ext}`;
      must(await db.storage.from('blc-site-images').upload(path,file,{contentType:file.type,upsert:false}));
    }
    const row={page_key:page,slot_key:slot,title:$('title').value,caption:$('caption').value,image_alt:$('alt').value,image_path:path,published:$('published').checked,updated_by:authUser.id,updated_at:new Date().toISOString()};
    must(await db.from('blc_page_content').upsert(row,{onConflict:'page_key,slot_key'}));
    $('image').value='';
    clearObjectUrl();
    unsavedPreview=false;
    await loadRecords();
    if (page==='home' && HOME_SECTIONS.some(section=>section.key===slot)) selectHomepageSection(slot);
    else fillEntry(currentRow(page,slot));
    reloadPreview();
    notice(row.published ? 'Saved and published. Refresh the public website to verify the change.' : 'Draft saved. The public website has not changed.');
  } catch (error) { notice('Save failed: '+error.message); }
});
init().catch(error=>notice(error.message));
