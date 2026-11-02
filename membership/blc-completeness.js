'use strict';
// Keep scoring identical in the member page, staff editor, and missing-info report.
// The optional home phone NEVER satisfies the mobile-phone field. The member
// can explicitly mark that a mobile phone is unavailable and provide a landline.
const BLC_COMPLETE_FIELDS = Object.freeze([
  { key: 'date_of_birth', label: 'Date of birth', ok: m => !!m.date_of_birth },
  { key: 'email', label: 'Email address', ok: m => !!clean(m.email || '') || m.email_unavailable === true },
  { key: 'phone', label: 'Cell phone', ok: m => !!clean(m.phone || '') || m.mobile_unavailable === true },
  { key: 'address', label: 'Home address', ok: m =>
    [m.street_address,m.city,m.state,m.postal_code].every(x => !!clean(x || '')) }
]);
function blcCompleteness(record) {
  const details = BLC_COMPLETE_FIELDS.map(f => ({key:f.key,label:f.label,complete: f.ok(record),
    notAvailable:(f.key==='email' && record.email_unavailable===true) || (f.key==='phone' && record.mobile_unavailable===true)}));
  const completeCount = details.filter(x=>x.complete).length;
  return { percent: Math.round(completeCount / details.length * 100), details,
    missing: details.filter(x=>!x.complete).map(x=>x.key) };
}
function blcRecordFromForm(form) {
  const val = name => form.elements[name]?.value?.trim() || null;
  return {
    date_of_birth:val('date_of_birth'),email:val('email'),phone:val('phone'),
    email_unavailable: !!form.elements.email_unavailable?.checked,
    mobile_unavailable: !!form.elements.mobile_unavailable?.checked,
    street_address:val('street_address'), city:val('city'),
    state:val('state'),postal_code:val('postal_code')
  };
}
function blcContactUI(form){
  const pairs = [['email_unavailable','email'], ['mobile_unavailable','phone']];
  for(const [flag, field] of pairs){
    const chk=form.elements[flag], input=form.elements[field];
    if(!chk||!input)continue;
    // Checkbox is an explicit assertion, never automatically inferred from blank input.
    if(chk.checked){ input.value=''; input.disabled=true; }
    else input.disabled=false;
  }
}
function blcSetContactFlags(form,m){
  if(form.elements.email_unavailable)form.elements.email_unavailable.checked=m.email_unavailable===true;
  if(form.elements.mobile_unavailable)form.elements.mobile_unavailable.checked=m.mobile_unavailable===true;
  if(form.elements.home_phone)form.elements.home_phone.value=m.home_phone||'';
  blcContactUI(form);
  blcUpdatePreview(form);
}
function blcBindContactForm(form){
  ['email_unavailable','mobile_unavailable'].forEach(name=>form.elements[name]?.addEventListener('change',()=>{
    blcContactUI(form);blcUpdatePreview(form);
  }));
  form.addEventListener('input',()=>blcUpdatePreview(form));
  form.addEventListener('change',()=>blcUpdatePreview(form));
  blcContactUI(form);
  blcUpdatePreview(form);
}
function blcUpdatePreview(form){
  // Add + edit forms may each have their own progress preview.
  const id=form.id==='addForm'?'addCompleteness':form.id==='editForm'?'editCompleteness':'memberCompleteness';
  const box=document.getElementById(id);
  if(box)blcRenderCompleteness(box,blcRecordFromForm(form));
}
function blcRenderCompleteness(container,m){
  if(!container)return;
  const {percent,details}=blcCompleteness(m);
  container.replaceChildren();
  const heading=document.createElement('div');heading.className='blc-score-heading';
  const title=document.createElement('strong');title.textContent='Profile completeness';
  const score=document.createElement('strong');score.textContent=percent+'%';
  heading.append(title,score);container.append(heading);
  const track=document.createElement('div');track.className='blc-score-track';track.setAttribute('role','progressbar');
  track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
  track.setAttribute('aria-valuenow',String(percent));track.setAttribute('aria-label','Profile completeness');
  const bar=document.createElement('div');bar.className='blc-score-fill';bar.style.width=percent+'%';
  track.append(bar);container.append(track);
  const items=document.createElement('ul');items.className='blc-score-items';
  for(const f of details){
    const li=document.createElement('li');li.className=f.complete?'is-complete':'is-missing';
    li.textContent=(f.complete?'✓ ':'○ ')+f.label+(f.notAvailable?' — Not available (accepted)':'');
    items.append(li);
  }
  container.append(items);
  const note=document.createElement('small');note.textContent='Email and cell phone count as complete when explicitly marked unavailable. A blank field alone remains incomplete.';
  container.append(note);
}
function blcCheckContactFlags(form){
  if(form.elements.email_unavailable?.checked && form.elements.email?.value?.trim())
    throw new Error('Clear the email address or uncheck “No email address available.”');
  if(form.elements.mobile_unavailable?.checked && form.elements.phone?.value?.trim())
    throw new Error('Clear the cell number or uncheck “No cell phone available.”');
}
