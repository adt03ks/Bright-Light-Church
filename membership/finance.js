'use strict';
// Uses the same config.js as existing membership pages.
const db = window.supabase.createClient(window.BLC_SUPABASE_URL, window.BLC_SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const displayDate = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US') : '';
const msg = s => $('message').textContent = s;
let user,role,people=[],categories=[],employees=[];
const canStatements = () => ['finance_admin','treasurer'].includes(role);
const canHR = () => ['finance_admin','hr_admin'].includes(role);
async function call(query){if(query.error)throw query.error;return query.data;}
function opt(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o)}
function cell(tr,s){const td=document.createElement('td');td.textContent=s;tr.append(td);return td}
function safeNum(v){return Number(v||0)}
function showTab(tab){['ledger','statement','hr'].forEach(x=>$(x).hidden=x!==tab);}
async function start(){
 const a=await db.auth.getUser(); user=a.data?.user;
 $('signin').hidden=!!user; $('finance').hidden=!user;
 if(!user)return;
 const r=await call(await db.from('blc_finance_roles').select('role').eq('auth_user_id',user.id).maybeSingle());
 if(!r){$('finance').hidden=true;msg('Access denied. Finance role required.');return;}
 role=r.role;$('role').textContent=`Signed in as ${role.replaceAll('_',' ')}`;
 document.querySelector('[data-tab="statement"]').hidden=!canStatements();
 document.querySelector('[data-tab="hr"]').hidden=!canHR();
 people=await call(await db.rpc('blc_finance_member_choices'));
 people.forEach(p=>{opt($('member'),p.id,p.display_name);opt($('statementMember'),p.id,p.display_name);opt($('employeeMember'),p.id,p.display_name)});
 if(role!=='hr_admin'){
 categories=await call(await db.from('blc_contribution_categories').select('id,name,is_tax_deductible').eq('active',true).order('name'));
 categories.forEach(c=>opt($('category'),c.id,c.name));
 }
 $('date').value=new Date().toISOString().slice(0,10);$('year').value=new Date().getFullYear()-1;
 if(role!=='hr_admin')await loadDonations();if(canHR())await loadEmployees();
 document.querySelector('[data-tab="ledger"]').hidden=role==='hr_admin';showTab(role==='hr_admin'?'hr':'ledger');
}
async function loadDonations(){
 const rows=await call(await db.from('blc_contributions').select('id,donor_name,contribution_date,amount,payment_method,voided_at,category_id').order('contribution_date',{ascending:false}).limit(100));
 $('contributions').replaceChildren();
 for(const c of rows){const tr=document.createElement('tr');cell(tr,displayDate(c.contribution_date));cell(tr,c.donor_name);cell(tr,categories.find(k=>k.id===c.category_id)?.name||'');cell(tr,money(c.amount));cell(tr,c.payment_method);cell(tr,c.voided_at?'Voided':'Posted');
 const td=cell(tr,'');if(!c.voided_at&&canStatements()){const b=document.createElement('button');b.textContent='Void';b.onclick=async()=>{const reason=prompt('Reason for voiding this entry (minimum 5 characters):');if(!reason)return;try{await call(await db.rpc('blc_void_contribution',{p_id:c.id,p_reason:reason}));await loadDonations();msg('Contribution voided. Enter a corrected replacement if needed.')}catch(e){msg(e.message)}};td.append(b)}$('contributions').append(tr)}
}
$('login').addEventListener('submit',async e=>{e.preventDefault();try{await call(await db.auth.signInWithPassword({email:$('email').value,password:$('password').value}));await start()}catch(err){msg(err.message)}});
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('member').onchange=()=>{const p=people.find(x=>x.id===$('member').value);if(p)$('donor').value=p.display_name};
$('donation').onsubmit=async e=>{e.preventDefault();try{const amount=safeNum($('amount').value),benefit=safeNum($('benefit').value);if(benefit>amount)throw Error('Benefit amount cannot exceed contribution');
 await call(await db.from('blc_contributions').insert({member_id:$('member').value||null,donor_name:$('donor').value.trim(),contribution_date:$('date').value,category_id:$('category').value,amount,payment_method:$('method').value,reference_number:$('reference').value.trim()||null,batch_reference:$('batch').value.trim()||null,donor_received_benefit:benefit>0,goods_services_value:benefit,notes:$('notes').value.trim()||null,created_by:user.id}));
 $('donation').reset();$('date').value=new Date().toISOString().slice(0,10);$('benefit').value='0';await loadDonations();msg('Contribution saved successfully.');}catch(err){msg(err.message)}};
$('generate').onclick=async()=>{try{if(!canStatements())throw Error('Not authorized');const id=$('statementMember').value,year=Number($('year').value);if(!id||!Number.isInteger(year)||year<2000||year>2100)throw Error('Select a member and valid calendar year');
 const [rows,addr]=await Promise.all([call(await db.from('blc_contributions').select('contribution_date,amount,goods_services_value,category_id,voided_at').eq('member_id',id).gte('contribution_date',`${year}-01-01`).lte('contribution_date',`${year}-12-31`).is('voided_at',null).order('contribution_date')),call(await db.rpc('blc_finance_donor_address',{p_member_id:id}))]);
 const a=addr[0];const allowed=rows.filter(r=>categories.find(c=>c.id===r.category_id)?.is_tax_deductible);const total=allowed.reduce((sum,r)=>sum+safeNum(r.amount)-safeNum(r.goods_services_value),0);
 const nonprofit=$('churchAddress').value.trim()||'Bright Light Church — mailing address to be confirmed';const sign=$('signature').value.trim()||'Authorized Finance Officer';
 const detail=allowed.map(r=>`${displayDate(r.contribution_date)}  ${categories.find(c=>c.id===r.category_id)?.name||'Contribution'}  ${money(r.amount)}${Number(r.goods_services_value)>0?' (goods/services value: '+money(r.goods_services_value)+')':''}`).join('\n');
 const hasBenefits=allowed.some(r=>safeNum(r.goods_services_value)>0);
 $('statementPreview').textContent=`${nonprofit}\n\nANNUAL CONTRIBUTION STATEMENT — ${year}\nGenerated: ${new Date().toLocaleDateString()}\n\n${a?.display_name||people.find(x=>x.id===id)?.display_name||'Donor'}\n${[a?.street_address,[a?.city,a?.state,a?.postal_code].filter(Boolean).join(' ')].filter(Boolean).join('\n')}\n\n${detail||'No qualifying recorded contributions for the selected year.'}\n\nRecorded potentially deductible amount: ${money(total)}\n\n${hasBenefits?'Some contributions involved goods or services. Values recorded above were subtracted; review the tax treatment and the nature of any benefits before issuing.':'No goods or services were provided in exchange for the contributions listed above, other than intangible religious benefits, if applicable. Verify this statement is accurate before issuing.'}\n\nPlease retain this document with your tax records. Donations are subject to applicable tax law and individual circumstances.\n\n${sign}\nBright Light Church`;
 msg('Preview generated. Treasurer must verify records and wording before issuing.');}catch(err){msg(err.message)}};
function printDoc(type){document.body.classList.add(type);window.print();document.body.classList.remove(type)}
$('print').onclick=()=>printDoc('print-statement');
async function loadEmployees(){employees=await call(await db.from('blc_employment_records').select('*').order('employee_name'));$('employmentSelect').replaceChildren();employees.forEach(e=>opt($('employmentSelect'),e.id,`${e.employee_name} — ${e.position_title}`))}
$('employment').onsubmit=async e=>{e.preventDefault();try{await call(await db.from('blc_employment_records').insert({member_id:$('employeeMember').value||null,employee_name:$('employeeName').value.trim(),position_title:$('position').value.trim(),start_date:$('start').value,end_date:$('end').value||null,employment_status:$('employmentStatus').value,employment_type:$('employmentType').value}));await loadEmployees();msg('Employment record saved.');}catch(err){msg(err.message)}};
$('pay').onsubmit=async e=>{e.preventDefault();try{if(!$('employmentSelect').value)throw Error('Select an employee');await call(await db.from('blc_pay_records').insert({employment_id:$('employmentSelect').value,pay_date:$('payDate').value,period_start:$('periodStart').value||null,period_end:$('periodEnd').value||null,gross_amount:$('gross').value,net_amount:$('net').value||null,payroll_reference:$('payRef').value.trim()||null,created_by:user.id}));$('pay').reset();msg('Pay record saved.');}catch(err){msg(err.message)}};
$('verify').onclick=async()=>{try{const em=employees.find(x=>x.id===$('employmentSelect').value);if(!em)throw Error('Select employee');let q=db.from('blc_pay_records').select('pay_date,gross_amount,net_amount').eq('employment_id',em.id).order('pay_date');if($('rangeStart').value)q=q.gte('pay_date',$('rangeStart').value);if($('rangeEnd').value)q=q.lte('pay_date',$('rangeEnd').value);const pays=await call(await q);const gross=pays.reduce((s,p)=>s+safeNum(p.gross_amount),0);const period=[displayDate($('rangeStart').value),displayDate($('rangeEnd').value)].filter(Boolean).join(' through ')||'all recorded dates';
 $('verificationPreview').textContent=`BRIGHT LIGHT CHURCH\nEMPLOYMENT / INCOME VERIFICATION — DRAFT\n${new Date().toLocaleDateString()}\n\n${$('recipient').value.trim()||'To whom it may concern'}:\n\nThis letter confirms that ${em.employee_name} is recorded as a ${em.employment_type} serving as ${em.position_title} at Bright Light Church.\nEmployment start: ${displayDate(em.start_date)}\n${em.end_date?'Employment end: '+displayDate(em.end_date)+'\n':''}Current recorded status: ${em.employment_status}\n\nRecorded gross payments (${period}): ${money(gross)} across ${pays.length} pay entries. This amount reflects available church payroll records for the specified dates; it does not establish current annual compensation or future income.\n\nThis draft must be checked against official payroll records and approved by an authorized church representative before being sent to any third party.\n\nAuthorized signature: _____________________\nTitle: _____________________\nContact information: _____________________\nDate: _____________________`;
 msg('Draft prepared. Confirm consent/authorization and payroll completeness before release.');}catch(err){msg(err.message)}};
$('printVerification').onclick=()=>printDoc('print-verify');
start().catch(e=>msg(e.message));
