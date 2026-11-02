'use strict';
let memberId = null;
const memberForm = byId('profileForm');
const claimForm = byId('claimForm');
function claimNotice(message, danger=false){
  const n=byId('claimStatus');n.textContent=message;n.className='notice'+(danger?' error':'');n.classList.remove('hidden');
}
async function refreshMemberPage(){
  const user=await currentUser();
  byId('authPanel').classList.toggle('hidden',!!user);
  byId('profilePanel').classList.toggle('hidden',!user);
  if(!user){memberId=null;return;}
  const {data,error}=await client.from('blc_members').select('*').eq('auth_user_id',user.id).maybeSingle();
  if(error)return notify('Unable to read member profile: '+error.message,true);
  memberId=data?.id||null;
  const found=!!data;
  byId('claimPanel').classList.toggle('hidden',found);
  memberForm.classList.toggle('hidden',!found);
  if(found){
    byId('profileStatus').textContent=`Membership status: ${data.membership_status}. Member number: BLC-${String(data.member_number).padStart(6,'0')}`;
    for(const field of ['first_name','last_name','preferred_name','email','phone','date_of_birth','anniversary_date','street_address','city','state','postal_code','spouse_name_text','household_name_text']){
      if(memberForm.elements[field])memberForm.elements[field].value=data[field]||(field==='email'?user.email||'':'');
    }
    syncMinorCheckbox(memberForm);
    return;
  }
  byId('profileStatus').textContent='This login is not yet connected to a church member profile.';
  if(!claimForm.elements.contact_email.value)claimForm.elements.contact_email.value=user.email||'';
  // Only a status is shown: NEVER disclose names or addresses of potential matches.
  const {data:claim,error:claimError}=await client.from('blc_profile_claims')
    .select('status,submitted_at,review_note').eq('requester_auth_user_id',user.id).maybeSingle();
  if(claimError){
    claimNotice('Unable to load link-request status. Check whether 07_account_claiming.sql was installed.',true);
    return;
  }
  byId('claimStatus').classList.add('hidden');
  if(claim?.status==='pending'){
    claimForm.classList.add('hidden');
    claimNotice('Your request is awaiting church staff review. Your existing record will appear here after staff verifies and connects it.');
  } else if(claim?.status==='rejected'){
    claimForm.classList.remove('hidden');
    claimNotice('This request could not be verified. Please confirm your information or contact the church office and submit another request.');
  } else if(claim?.status==='linked'||claim?.status==='created'){
    claimForm.classList.add('hidden');
    claimNotice('Your request has been approved. Refresh to load the connected record. If this persists, contact the church office.');
  } else {
    claimForm.classList.remove('hidden');
  }
}
byId('authForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;
  const {error}=await client.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});
  if(error)return notify(error.message,true);
  notify('Signed in.');await refreshMemberPage();
});
byId('signUp').addEventListener('click',async()=>{
  const f=byId('authForm');
  if(!f.reportValidity())return;
  const {error}=await client.auth.signUp({email:f.elements.email.value.trim(),password:f.elements.password.value});
  if(error)return notify(error.message,true);
  notify('Registration received. Check your email for confirmation if required, then sign in and request your existing member profile.');
  await refreshMemberPage();
});
byId('signOut').addEventListener('click',async()=>{
  await client.auth.signOut();memberId=null;notify('Signed out.');await refreshMemberPage();
});
claimForm.addEventListener('submit',async e=>{
  e.preventDefault();if(!claimForm.reportValidity())return;
  const btn=byId('claimSubmit');btn.disabled=true;
  try{
    const user=await currentUser();if(!user)throw new Error('Sign in first.');
    const fields=claimForm.elements;
    const {data,error}=await client.rpc('blc_request_profile_link',{
      p_first_name:fields.first_name.value.trim(),
      p_last_name:fields.last_name.value.trim(),
      p_contact_email:fields.contact_email.value.trim()||null,
      p_phone:fields.phone.value.trim()||null,
      p_date_of_birth:fields.date_of_birth.value||null
    });
    if(error)throw error;
    if(data==='already_linked')notify('This account is already connected to a member profile.');
    else notify('Request sent to church administration. No new member profile was created.');
    await refreshMemberPage();
  } catch(err){claimNotice(err.message||'Unable to submit request.',true);}
  finally{btn.disabled=false;}
});
memberForm.addEventListener('submit',async e=>{
  e.preventDefault();if(!memberId)return notify('Please submit an account-link request first.',true);
  const user=await currentUser();if(!user)return notify('Sign in first.',true);
  try{validateMinor(memberForm);}catch(err){return notify(err.message,true);}
  const payload=memberPayload(memberForm);
  // This form does not contain member_since; do not erase an existing join date.
  delete payload.member_since;
  const {error}=await client.from('blc_members').update(payload).eq('id',memberId).eq('auth_user_id',user.id);
  if(error)return notify('Could not save: '+error.message,true);
  notify('Member profile updated.');await refreshMemberPage();
});
attachMinorForm(memberForm);
refreshMemberPage().catch(err=>notify(err.message,true));
