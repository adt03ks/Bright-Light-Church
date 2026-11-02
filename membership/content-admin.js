'use strict';
/* Bright Light Church Content Manager, multi-page visual editor.
   Requires existing CMS RLS, membership/config.js, and same-origin public pages.
*/
const $ = id => document.getElementById(id);
const db = window.supabase?.createClient && window.BLC_SUPABASE_URL && window.BLC_SUPABASE_ANON_KEY
  ? window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY) : null;
const FALLBACK_PAGES = [
  {key:'home',label:'Home',file:'index.html'},
  {key:'about',label:'Our Story',file:'about.html'},
  {key:'leadership',label:'Leadership',file:'leadership.html'},
  {key:'ministries',label:'Ministries',file:'ministries.html'},
  {key:'watch',label:'Bright Light TV',file:'watch.html'},
  {key:'events',label:'Events',file:'events.html'},
  {key:'visit',label:'Plan a Visit',file:'visit.html'},
  {key:'giving',label:'Giving',file:'giving.html'},
  {key:'contact',label:'Contact & Prayer',file:'contact.html'},
  {key:'services',label:'Church Services',file:'services.html'}
];
const HOME_LABELS={
  hero:'Top welcome banner',welcome:'Welcome & fellowship',values:'Our church values',
  pastor:'Meet our pastor','ministry-youth':'Youth & children',
  'ministry-prayer':'Prayer & discipleship','ministry-worship':'Music & worship',
  watch:'Bright Light TV',events:'Upcoming events',visit:'Closing invitation'
};
let pages=FALLBACK_PAGES;
let pageKey='home',activeKey=null,sections=[],records=[],authUser=null;
let frameReady=false,unsavedPreview=false,imageObjectUrl=null;
const notice=message=>{$('notice').textContent=message;};
const must=r=>{if(r.error)throw r.error;return r.data;};
const currentPage=()=>pages.find(x=>x.key===pageKey) || pages[0];
const currentRow=(key,slot)=>records.find(r=>r.page_key===key&&r.slot_key===slot)||null;
function frameDocument(){try{return $('website-preview').contentDocument;}catch{return null;}}
function scoped(node, selector){if(node?.matches?.(selector))return node;return [...(node?.querySelectorAll(selector)||[])].find(x=>x.closest('[data-blc-slot]')===node)||null;}
function selectedNode(){const doc=frameDocument();return doc && [...doc.querySelectorAll('[data-blc-page][data-blc-slot]')].find(x=>x.dataset.blcPage===pageKey&&x.dataset.blcSlot===activeKey)||null;}
function status(message,unsaved=false){$('preview-status').textContent=message;$('preview-status').classList.toggle('unsaved',unsaved);}
function clearImage(){if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=null;}
function imageUrl(path){return path&&db?db.storage.from('blc-site-images').getPublicUrl(path)?.data?.publicUrl:null;}
function imageThumb(path){const url=imageUrl(path);$('preview').hidden=!url;if(url)$('preview').src=url;else $('preview').removeAttribute('src');}
function fillForm(row){$('content-form').reset();$('page-key').value=row?.page_key||pageKey;$('slot-key').value=row?.slot_key||activeKey||'';$('title').value=row?.title||'';$('caption').value=row?.caption||'';$('alt').value=row?.image_alt||'';$('image-path').value=row?.image_path||'';$('published').checked=!!row?.published;clearImage();imageThumb(row?.image_path);}
function getSections(){
  const doc=frameDocument();
  if(!doc)return [];
  return [...doc.querySelectorAll('[data-blc-page][data-blc-slot]')]
    .filter(el=>el.dataset.blcPage===pageKey)
    .map((el,i)=>{
      const key=el.dataset.blcSlot;
      const name=el.dataset.blcEditorLabel||((pageKey==='home'&&HOME_LABELS[key])||'')||scoped(el,'h1,h2,h3,h4')?.textContent?.replace(/\s+/g,' ').trim()||`Section ${i+1}`;
      const fields=[scoped(el,'[data-blc-title]'),scoped(el,'[data-blc-caption]'),scoped(el,'[data-blc-image]')].filter(Boolean).length;
      return {key,label:name.slice(0,70),number:i+1,fields};
    }).filter(s=>s.fields);
}
function renderSections(){
  const list=$('section-list');list.replaceChildren();$('section-count').textContent=String(sections.length);
  for(const s of sections){
    const btn=document.createElement('button');btn.type='button';btn.className='section-button'+(activeKey===s.key?' active':'');btn.setAttribute('aria-pressed',String(activeKey===s.key));
    const symbol=document.createElement('span');symbol.className='section-icon';symbol.textContent=String(s.number).padStart(2,'0');
    const txt=document.createElement('span');txt.className='section-text';const h=document.createElement('strong');h.textContent=s.label;const sub=document.createElement('small');sub.textContent=`${s.fields} editable field${s.fields===1?'':'s'}`;txt.append(h,sub);btn.append(symbol,txt);
    btn.addEventListener('click',()=>selectSection(s.key));list.appendChild(btn);
  }
  if(!sections.length){const p=document.createElement('p');p.className='hint';p.textContent='No editable sections detected. Verify this page has the new site integration.';list.appendChild(p);}
}
function renderRecords(){
  const q=$('filter').value.trim().toLowerCase();const list=$('entries');list.replaceChildren();
  const found=records.filter(r=>r.page_key===pageKey&&(!q||`${r.page_key} ${r.slot_key}`.includes(q)));
  for(const row of found){
    const b=document.createElement('button');b.type='button';b.className='entry';b.textContent=`${row.slot_key} — ${row.published?'Published':'Draft'}`;
    b.addEventListener('click',()=>{if(sections.some(s=>s.key===row.slot_key))selectSection(row.slot_key);else notice(`The saved slot ${row.slot_key} does not match a current section of this page. It may belong to an older page layout.`);});list.appendChild(b);
  }
  if(!found.length)list.textContent='No saved content for this page yet.';
}
function fields(node){
  const title=scoped(node,'[data-blc-title]'),caption=scoped(node,'[data-blc-caption]'),image=scoped(node,'[data-blc-image]');
  $('title-field').hidden=$('title-hint').hidden=!title;
  $('caption-field').hidden=!caption;
  $('image-field').hidden=$('alt-field').hidden=$('image-path-field').hidden=!image;
  $('current-content').hidden=!node;
  if(node){$('current-title').textContent=title?.textContent?.replace(/\s+/g,' ').trim()||'(no editable headline)';$('current-caption').textContent=caption?.textContent?.replace(/\s+/g,' ').trim()||'(no editable caption)';}
}
function highlight(scroll=true){
  const doc=frameDocument();if(!doc)return;
  doc.querySelectorAll('.blc-visual-selected').forEach(el=>el.classList.remove('blc-visual-selected'));
  const node=selectedNode();if(!node)return;
  node.classList.add('blc-visual-selected');fields(node);
  if(scroll)node.scrollIntoView({behavior:'smooth',block:'center'});
}
function selectSection(key,fromFrame=false){
  const section=sections.find(s=>s.key===key);if(!section)return;
  if(unsavedPreview&&activeKey!==key)reloadPreview();
  activeKey=key;fillForm(currentRow(pageKey,key));
  $('page-key').readOnly=true;$('slot-key').readOnly=true;
  $('selection-summary').replaceChildren();const h=document.createElement('strong');h.textContent=`${currentPage().label} → ${section.label}`;
  const p=document.createElement('p');const row=currentRow(pageKey,key);p.textContent=row?(row.published?'This section currently has published content.':'This section has a saved draft.'):'This section is showing the original website content.';
  $('selection-summary').append(h,p);renderSections();renderRecords();fields(selectedNode());highlight(!fromFrame);
  if(!unsavedPreview)status(`Selected: ${section.label}. The gold border identifies the section you are editing.`);
}
function loadPage(key,desiredSlot){
  const page=pages.find(p=>p.key===key);if(!page)return;
  pageKey=key;activeKey=desiredSlot||null;sections=[];frameReady=false;unsavedPreview=false;clearImage();
  $('page-select').value=pageKey;
  $('open-page').href=`../${encodeURIComponent(page.file)}`;
  $('website-preview').title=`Clickable visual preview: ${page.label}`;
  $('website-preview').src=`../${encodeURIComponent(page.file)}?blc_visual_editor=1`;
  $('section-list').replaceChildren();$('section-count').textContent='…';
  $('selection-summary').textContent='Loading page sections…';$('current-content').hidden=true;
  $('content-form').reset();status(`Loading ${page.label} preview…`);renderRecords();
}
function installFrame(){
  const doc=frameDocument();if(!doc?.head){frameReady=false;status('Cannot access the page preview. Check that you are on the same domain.');return;}
  frameReady=true;
  if(!doc.getElementById('blc-visual-edit-style')){
    const style=doc.createElement('style');style.id='blc-visual-edit-style';style.textContent=`
      [data-blc-page][data-blc-slot]{cursor:pointer!important;transition:outline-color .15s ease!important}
      [data-blc-page][data-blc-slot]:hover{outline:3px dashed #f1bd4c!important;outline-offset:-2px!important}
      .blc-visual-selected{outline:5px solid #f1bd4c!important;outline-offset:-4px!important;position:relative!important}
      .blc-visual-selected::after{content:'SELECTED SECTION';position:absolute;z-index:2147483647;right:6px;top:6px;background:#f1bd4c;color:#182437;font:700 11px system-ui,sans-serif;padding:5px 9px;border-radius:4px;pointer-events:none}
      .blc-visual-selected [data-blc-title]{outline:3px dashed #9865db!important;outline-offset:3px!important}
      .blc-visual-selected [data-blc-caption]{outline:3px dashed #19a6a7!important;outline-offset:3px!important}
      .blc-visual-selected [data-blc-image]{outline:4px solid #4c9ff0!important;outline-offset:-3px!important}`;
    doc.head.appendChild(style);
    doc.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      const el=event.target?.closest?.('[data-blc-page][data-blc-slot]');
      if(el&&el.dataset.blcPage===pageKey)selectSection(el.dataset.blcSlot,true);
    },true);
    // Prevent accidental typing or form submission inside the real page preview.
    doc.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
  }
  sections=getSections();renderSections();
  if(!sections.length){status('No editable sections found. The page may be missing the CMS script, or the file may not exist.');return;}
  selectSection(sections.some(s=>s.key===activeKey)?activeKey:sections[0].key,true);
}
function reloadPreview(){
  if(!$('website-preview').contentWindow)return;
  unsavedPreview=false;frameReady=false;$('website-preview').contentWindow.location.reload();status('Resetting the preview. No changes have been saved.');
}
function formatHeadline(el,raw){
  if(!raw?.trim())return;
  const doc=el.ownerDocument;const output=[];
  raw.split('|').forEach((line,i)=>{if(i)output.push(doc.createElement('br'));for(const part of line.trim().split(/(\*[^*]+\*)/g)){
    if(!part)continue;if(part.startsWith('*')&&part.endsWith('*')&&part.length>2){const em=doc.createElement('em');em.textContent=part.slice(1,-1);output.push(em);}else output.push(doc.createTextNode(part));
  }});el.replaceChildren(...output);
}
function replaceImage(node,url,alt){
  if(!node||!url)return;
  if(node.tagName==='IMG'){node.src=url;if(alt)node.alt=alt;return;}
  node.dataset.image=url;node.style.backgroundImage=`url(${JSON.stringify(url)})`;
  node.style.backgroundSize='cover';node.style.backgroundPosition='center';node.style.backgroundRepeat='no-repeat';
  node.querySelectorAll('video,img,source').forEach(el=>{el.hidden=true;el.style.display='none';if(el.tagName==='VIDEO')el.pause();});
  node.querySelectorAll('.placeholder-label,.hero-placeholder').forEach(el=>{el.hidden=true;el.style.display='none';});
  if(alt?.trim()){node.setAttribute('role','img');node.setAttribute('aria-label',alt.trim());}
}
function previewChanges(){
  const node=selectedNode();if(!frameReady||!node){notice('Select a section in a connected page first.');return;}
  const title=scoped(node,'[data-blc-title]');if(title)formatHeadline(title,$('title').value);
  const caption=scoped(node,'[data-blc-caption]');if(caption&&$('caption').value.trim()){
    caption.textContent=$('caption').value;caption.style.whiteSpace='pre-line';
  }
  const image=scoped(node,'[data-blc-image]');const file=$('image').files[0];
  const url=file?imageObjectUrl:imageUrl($('image-path').value);if(image&&url)replaceImage(image,url,$('alt').value);
  unsavedPreview=true;highlight(false);node.scrollIntoView({behavior:'smooth',block:'center'});
  status('PREVIEW ONLY: Unsaved changes are visible in this frame, not on the public website.',true);
  notice('This is an unsaved preview. Nothing has been published.');
}
async function loadRecords(){records=must(await db.from('blc_page_content').select('*').order('page_key').order('slot_key'));renderRecords();}
async function loadPageManifest(){
  try{
    const response=await fetch('./blc-pages.json',{cache:'no-cache'});if(response.ok){
      const obj=await response.json();const candidates=Array.isArray(obj?.pages)?obj.pages:[];
      const safe=candidates.filter(p=>p&&/^[a-z0-9][a-z0-9_-]{0,79}$/.test(p.key)&&/^[a-z0-9][a-z0-9_-]*\.html$/.test(p.file)&&typeof p.label==='string');
      if(safe.length)pages=safe;
    }}catch(error){console.warn('Using default page list; no manifest installed.',error);}
  const picker=$('page-select');picker.replaceChildren();for(const p of pages){const option=document.createElement('option');option.value=p.key;option.textContent=p.label;picker.appendChild(option);}
}
async function init(){
  if(!db){notice('Supabase configuration is missing. Check membership/config.js.');return;}
  const {data,error}=await db.auth.getUser();if(error)throw error;authUser=data?.user||null;
  if(!authUser){$('signin-panel').hidden=false;$('editor-panel').hidden=true;return;}
  const role=must(await db.from('blc_content_roles').select('role').eq('auth_user_id',authUser.id).maybeSingle());
  if(!role){$('signin-panel').hidden=false;$('editor-panel').hidden=true;notice('Your login does not have website editing permission.');return;}
  $('signin-panel').hidden=true;$('editor-panel').hidden=false;$('signed-in').textContent=`${authUser.email} • ${role.role}`;
  await Promise.all([loadRecords(),loadPageManifest()]);
  const params=new URLSearchParams(location.search);const requestedPage=params.get('page')||'home';
  loadPage(pages.some(p=>p.key===requestedPage)?requestedPage:pages[0].key,params.get('slot'));
}
$('signin').addEventListener('submit',async event=>{event.preventDefault();try{must(await db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));notice('Signed in.');await init();}catch(error){notice(error.message);}});
$('logout').addEventListener('click',async()=>{await db.auth.signOut();location.reload();});
$('page-select').addEventListener('change',value=>loadPage(value.target.value));
$('filter').addEventListener('input',renderRecords);
$('reload').addEventListener('click',()=>loadRecords().catch(e=>notice(e.message)));
$('desktop-size').addEventListener('click',()=>{$('preview-shell').classList.remove('mobile');$('desktop-size').classList.add('view-active');$('mobile-size').classList.remove('view-active');});
$('mobile-size').addEventListener('click',()=>{$('preview-shell').classList.add('mobile');$('mobile-size').classList.add('view-active');$('desktop-size').classList.remove('view-active');});
$('reload-preview').addEventListener('click',reloadPreview);
$('website-preview').addEventListener('load',installFrame);
$('preview-changes').addEventListener('click',previewChanges);
$('image').addEventListener('change',()=>{clearImage();const file=$('image').files[0];if(file&&file.type.startsWith('image/')){imageObjectUrl=URL.createObjectURL(file);$('preview').src=imageObjectUrl;$('preview').hidden=false;}else imageThumb($('image-path').value);});
$('content-form').addEventListener('submit',async event=>{
  event.preventDefault();try{
    if(!authUser||!selectedNode())throw Error('Choose an editable section of the website before saving.');
    const page=pageKey,slot=activeKey;
    let path=$('image-path').value||null;
    const file=$('image').files[0];
    if(file){
      if(file.size>5*1024*1024)throw Error('Image must be 5 MB or smaller.');
      const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
      const ext=types[file.type];if(!ext)throw Error('Only JPEG, PNG, WebP and GIF images are supported.');
      path=`${page}/${slot}/${crypto.randomUUID()}.${ext}`;
      must(await db.storage.from('blc-site-images').upload(path,file,{contentType:file.type,upsert:false}));
    }
    const row={page_key:page,slot_key:slot,title:$('title').value,caption:$('caption').value,image_alt:$('alt').value,image_path:path,published:$('published').checked,updated_by:authUser.id,updated_at:new Date().toISOString()};
    must(await db.from('blc_page_content').upsert(row,{onConflict:'page_key,slot_key'}));
    clearImage();$('image').value='';unsavedPreview=false;
    await loadRecords();reloadPreview();
    notice(row.published?'Saved and published. Refresh the public website to verify.':'Draft saved. The public website has not changed.');
  }catch(error){notice('Save failed: '+error.message);}
});
init().catch(error=>notice(error.message));
