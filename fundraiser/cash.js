import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = id => document.getElementById(id);
const cfg = window.BLC_CASH_CONFIG;
const validConfig = cfg?.supabaseUrl?.startsWith('https://') && cfg?.supabaseAnonKey && !cfg.supabaseAnonKey.includes('YOUR-');
const db = validConfig ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
let receipts = [];
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const message = (s, error=false) => { $('message').textContent=s; $('message').style.color=error?'#a32936':'#155b3d'; };
const localDate = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
$('date').value = localDate();
function td(row, value){const cell=document.createElement('td');cell.textContent=String(value??'');row.append(cell);}
async function showApp(){
  const {data:{user},error} = await db.auth.getUser();
  if(error||!user){$('loginCard').classList.remove('hidden');$('app').classList.add('hidden');return;}
  const {data:allowed,error:checkError}=await db.rpc('blc_can_manage_fundraiser_cash');
  if(checkError||allowed!==true){$('loginCard').classList.remove('hidden');$('app').classList.add('hidden');message('This account is not authorized to manage fundraiser cash.',true);return;}
  $('signedIn').textContent=user.email;
  $('loginCard').classList.add('hidden');$('app').classList.remove('hidden');
  await refresh();
}
async function refresh(){
  const {data,error}=await db.from('blc_fundraiser_cash_receipts').select('id,contributor_name,pledge_reference,amount_cents,received_on,collected_by,receipt_reference,notes,created_at').is('voided_at',null).order('received_on',{ascending:false}).limit(1000);
  if(error){message('Unable to load cash receipts: '+error.message,true);return;}
  receipts=data||[];
  $('count').textContent=String(receipts.length);
  $('total').textContent=money(receipts.reduce((sum,r)=>sum+r.amount_cents,0));
  $('rows').replaceChildren();
  for(const r of receipts){const tr=document.createElement('tr');[r.received_on,r.contributor_name,money(r.amount_cents),r.collected_by,r.pledge_reference||'—',r.receipt_reference||'—',new Date(r.created_at).toLocaleString()].forEach(v=>td(tr,v));$('rows').append(tr);}
  if(receipts.length===1000)message('Showing the latest 1,000 cash receipts. Export covers only these displayed records.');else message('Cash records loaded.');
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!db)return message('Configure cash-config.js first.',true);
  const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if(error)return message(error.message,true);
  $('password').value='';await showApp();
});
$('cashForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('save');button.disabled=true;
  try{
    const raw=$('amount').value;const amount=Number(raw);const cents=Math.round(amount*100);
    if(!Number.isFinite(amount)||amount<=0||cents<=0||Math.abs(amount*100-cents)>0.0001)throw new Error('Enter a valid cash amount with no more than two decimal places.');
    if(!$('contributor').value.trim()||!$('collector').value.trim())throw new Error('Contributor and collector are required.');
    const payload={contributor_name:$('contributor').value.trim(),amount_cents:cents,received_on:$('date').value,collected_by:$('collector').value.trim(),pledge_reference:$('pledge').value.trim()||null,receipt_reference:$('receipt').value.trim()||null,notes:$('notes').value.trim()||null};
    const {error}=await db.from('blc_fundraiser_cash_receipts').insert(payload);
    if(error)throw error;
    $('cashForm').reset();$('date').value=localDate();message('Cash receipt saved successfully.');await refresh();
  }catch(error){message('Could not save: '+error.message,true);}finally{button.disabled=false;}
});
$('refresh').addEventListener('click',refresh);
$('logout').addEventListener('click',async()=>{await db.auth.signOut();$('app').classList.add('hidden');$('loginCard').classList.remove('hidden');message('Signed out.');});
$('export').addEventListener('click',()=>{
  const cols=['received_on','contributor_name','amount_cents','collected_by','pledge_reference','receipt_reference','notes','created_at'];
  // Prefix spreadsheet formula characters to prevent CSV formula injection.
  const escapeCSV=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const content=[cols.join(','),...receipts.map(r=>cols.map(c=>escapeCSV(r[c])).join(','))].join('\r\n');
  const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='blc-cash-receipts.csv';a.click();URL.revokeObjectURL(url);
});
if(!db)message('Copy cash-config.example.js to cash-config.js and enter your Supabase public URL/key.',true);
else showApp().catch(e=>message(e.message,true));
