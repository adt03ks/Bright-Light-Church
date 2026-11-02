'use strict';
const $=id=>document.getElementById(id);
const db=window.supabase.createClient(window.BLC_SUPABASE_URL,window.BLC_SUPABASE_ANON_KEY);
let authUser=null,records=[],selected=null;
function notice(message){$('notice').textContent=message;}
function must(data){if(data.error)throw data.error;return data.data;}
function resetEditor() { selected=null;$('content-form').reset();$('image-path').value='';$('preview').hidden=true;$('preview').removeAttribute('src'); }
function selectEntry(x){selected=x;$('page-key').value=x.page_key;$('slot-key').value=x.slot_key;$('title').value=x.title||'';$('caption').value=x.caption||'';$('alt').value=x.image_alt||'';$('image-path').value=x.image_path||'';$('published').checked=!!x.published;showPreview(x.image_path);}
function showPreview(path){if(!path){$('preview').hidden=true;return;}const {data}=db.storage.from('blc-site-images').getPublicUrl(path);$('preview').src=data.publicUrl;$('preview').hidden=false;}
function listEntries(){const q=$('filter').value.trim().toLowerCase();$('entries').replaceChildren();const matches=records.filter(x=>!q||x.page_key.includes(q));for(const x of matches){const b=document.createElement('button');b.type='button';b.className='entry';b.textContent=`${x.page_key} / ${x.slot_key} — ${x.published?'Published':'Draft'}`;b.onclick=()=>selectEntry(x);$('entries').append(b);}if(!matches.length)$('entries').textContent='No matching content yet.';}
async function load(){records=must(await db.from('blc_page_content').select('*').order('page_key').order('slot_key'));listEntries();}
async function init(){const r=await db.auth.getUser();authUser=r.data?.user||null;if(!authUser){$('signin-panel').hidden=false;$('editor-panel').hidden=true;return;}
 const role=must(await db.from('blc_content_roles').select('role').eq('auth_user_id',authUser.id).maybeSingle());if(!role){$('signin-panel').hidden=false;$('editor-panel').hidden=true;notice('This login does not have website content management permission.');return;}
 $('signin-panel').hidden=true;$('editor-panel').hidden=false;$('signed-in').textContent=`${authUser.email} (${role.role})`;await load();}
$('signin').addEventListener('submit',async e=>{e.preventDefault();try{must(await db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));notice('Signed in.');await init();}catch(err){notice(err.message)}});
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
$('filter').oninput=listEntries;$('reload').onclick=()=>load().catch(e=>notice(e.message));$('new').onclick=resetEditor;
$('content-form').addEventListener('submit',async e=>{e.preventDefault();try{
 const page=$('page-key').value.trim(),slot=$('slot-key').value.trim();if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(page)||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slot))throw Error('Page and slot keys must be lowercase letters, digits, hyphens or underscores.');
 let path=$('image-path').value||null;const file=$('image').files[0];if(file){if(file.size>5242880)throw Error('Images must be 5 MB or smaller.');const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};const ext=extensions[file.type];if(!ext)throw Error('Unsupported image format.');path=`${page}/${slot}/${crypto.randomUUID()}.${ext}`;must(await db.storage.from('blc-site-images').upload(path,file,{contentType:file.type,upsert:false}));}
 const row={page_key:page,slot_key:slot,title:$('title').value,caption:$('caption').value,image_alt:$('alt').value,image_path:path,published:$('published').checked,updated_by:authUser.id,updated_at:new Date().toISOString()};
 // Upsert requires select permission to see draft, which the content role has.
 must(await db.from('blc_page_content').upsert(row,{onConflict:'page_key,slot_key'}));notice('Content saved. Published updates will display on pages with the matching content slot.');$('image').value='';await load();const found=records.find(x=>x.page_key===page&&x.slot_key===slot);if(found)selectEntry(found);
 }catch(err){notice('Save failed: '+err.message)}});
init().catch(err=>notice(err.message));
