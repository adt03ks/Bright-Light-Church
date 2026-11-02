'use strict';
(() => {
  const el=id=>document.getElementById(id);let db,user,records=[];
  const notice=(text,error=false)=>{el('message').textContent=text;el('message').className='notice'+(error?' error':' success');};
  const must=result=>{if(result.error)throw result.error;return result.data;};
  const txt=(v)=>String(v??'');
  const blank=(v)=>{const s=txt(v).trim();return s||null;};
  function buildRow(r){
    const tr=document.createElement('tr');
    [r.recorded_on,r.supporter_name,r.event_name,r.reference_code||'—',r.ticket_count,Number(r.amount_received).toLocaleString('en-US',{style:'currency',currency:'USD'}),r.payment_method].forEach(v=>{const td=document.createElement('td');td.textContent=txt(v);tr.append(td);});return tr;
  }
  async function refresh(){
    records=must(await db.from('blc_fundraiser_collection_log').select('id,recorded_on,supporter_name,supporter_email,supporter_phone,event_name,reference_code,ticket_count,amount_received,payment_method,notes').order('recorded_on',{ascending:false}).limit(1000));
    const b=el('rows');b.replaceChildren();records.forEach(r=>b.append(buildRow(r)));el('record-count').textContent=`Showing ${records.length} most recent records (up to 1,000).`;
  }
  // Prevent spreadsheet formula injection on exported user-supplied fields.
  function csvCell(value){let s=txt(value).replace(/\r|\n/g,' ');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  el('export').addEventListener('click',()=>{
    const columns=['recorded_on','supporter_name','supporter_email','supporter_phone','event_name','reference_code','ticket_count','amount_received','payment_method','notes'];
    const csv=[columns.join(','),...records.map(r=>columns.map(c=>csvCell(r[c])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='bright-light-church-fundraiser-log.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  el('refresh').addEventListener('click',()=>refresh().catch(e=>notice(e.message,true)));
  function todayLocal(){const n=new Date();return [n.getFullYear(),String(n.getMonth()+1).padStart(2,'0'),String(n.getDate()).padStart(2,'0')].join('-');}
  el('entry-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=el('save');button.disabled=true;
    const f={event_name:el('event').value.trim(),recorded_on:el('date').value,supporter_name:el('person').value.trim(),supporter_email:blank(el('email').value),supporter_phone:blank(el('phone').value),reference_code:blank(el('ref').value),ticket_count:Number(el('tickets').value),amount_received:Number(el('amount').value),payment_method:el('method').value,notes:blank(el('notes').value),created_by:user.id};
    try{
      if(!Number.isSafeInteger(f.ticket_count)||f.ticket_count<0||!Number.isFinite(f.amount_received)||f.amount_received<0)throw Error('Invalid tickets or amount.');
      must(await db.from('blc_fundraiser_collection_log').insert(f));
      notice('Collection record saved.');
      const event=el('event').value;el('entry-form').reset();el('event').value=event;
      el('date').value=todayLocal();
      await refresh();
    }catch(err){notice(err.message||'Unable to save collection.',true);}finally{button.disabled=false;}
  });
  async function init(){
    if(!window.supabase?.createClient||!window.BLC_SUPABASE_URL||!window.BLC_SUPABASE_ANON_KEY)throw Error('Supabase is not configured.');
    db=window.supabase.createClient(window.BLC_SUPABASE_URL,window.BLC_SUPABASE_ANON_KEY);
    const auth=must(await db.auth.getUser());user=auth.user;
    if(!user){location.replace('login.html');return;}
    const role=must(await db.from('blc_fundraiser_roles').select('role').eq('auth_user_id',user.id).maybeSingle());
    if(!role||!['fundraiser_admin','fundraiser_entry'].includes(role.role)){notice('Access denied. Your account does not have fundraiser access.',true);return;}
    el('workspace').hidden=false;el('date').value=todayLocal();
    await refresh();notice('Signed in with fundraiser permissions.');
  }
  init().catch(e=>notice('Unable to open Fundraiser Log: '+e.message,true));
})();
