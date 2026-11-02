// Add to any PUBLIC page AFTER config.js and Supabase JS; see README for placement.
(async()=>{
 if(!window.supabase||!window.BLC_SUPABASE_URL||!window.BLC_SUPABASE_ANON_KEY)return;
 const db=window.supabase.createClient(window.BLC_SUPABASE_URL,window.BLC_SUPABASE_ANON_KEY);
 const slots=[...document.querySelectorAll('[data-blc-page][data-blc-slot]')];
 const pages=[...new Set(slots.map(el=>el.dataset.blcPage))];
 for(const page of pages){
  const {data,error}=await db.from('blc_page_content').select('slot_key,title,caption,image_path,image_alt').eq('page_key',page).eq('published',true);
  if(error){console.warn('Content not loaded',error.message);continue;}
  for(const row of data||[]){for(const el of slots.filter(e=>e.dataset.blcPage===page&&e.dataset.blcSlot===row.slot_key)){
   const title=el.querySelector('[data-blc-title]');if(title)title.textContent=row.title||'';
   const caption=el.querySelector('[data-blc-caption]');if(caption)caption.textContent=row.caption||'';
   const image=el.querySelector('img[data-blc-image]');if(image&&row.image_path){image.src=db.storage.from('blc-site-images').getPublicUrl(row.image_path).data.publicUrl;image.alt=row.image_alt||'';}
  }}
 }
})();
