'use strict';
let memberId = null;
async function refreshMemberPage() {
  const user = await currentUser();
  byId('authPanel').classList.toggle('hidden', !!user);
  byId('profilePanel').classList.toggle('hidden', !user);
  if (!user) { memberId = null; return; }
  const { data, error } = await client.from('blc_members').select('*').eq('auth_user_id', user.id).maybeSingle();
  if (error) return notify(error.message, true);
  memberId = data?.id || null;
  byId('profileStatus').textContent = data ? `Membership status: ${data.membership_status}. Member number: BLC-${String(data.member_number).padStart(6,'0')}` : 'Complete this form to submit your member record.';
  for (const name of ['first_name','last_name','preferred_name','email','phone','date_of_birth','anniversary_date','street_address','city','state','postal_code','spouse_name_text','household_name_text']) {
    byId('profileForm').elements[name].value = data?.[name] || (name === 'email' ? user.email || '' : '');
  }
  syncMinorCheckbox(byId('profileForm'));
}
byId('authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const { error } = await client.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});
  if (error) return notify(error.message,true);
  notify('Signed in.'); await refreshMemberPage();
});
byId('signUp').addEventListener('click', async () => {
  const form = byId('authForm');
  const { error } = await client.auth.signUp({email:form.elements.email.value.trim(),password:form.elements.password.value});
  if (error) return notify(error.message,true);
  notify('Account request received. Check your email for a confirmation link if required.');
  await refreshMemberPage();
});
byId('signOut').addEventListener('click',async()=>{await client.auth.signOut();notify('Signed out.');await refreshMemberPage();});
byId('profileForm').addEventListener('submit',async event=>{
  event.preventDefault(); const user=await currentUser(); if(!user)return notify('Sign in first.',true);
  try { validateMinor(event.currentTarget); } catch(err) { return notify(err.message,true); }
  const payload=memberPayload(event.currentTarget);
  const query=memberId?client.from('blc_members').update(payload).eq('id',memberId):client.from('blc_members').insert({...payload,auth_user_id:user.id});
  const {error}=await query;
  if(error)return notify(error.message,true);
  notify(memberId?'Profile saved.':'Profile submitted for administrative review.'); await refreshMemberPage();
});
attachMinorForm(byId('profileForm'));
refreshMemberPage();
