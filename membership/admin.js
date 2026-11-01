'use strict';
let roster=[];
async function refreshAdmin() {
  const user=await currentUser();
  const {data:staff,error:roleError}=user?await client.from('blc_staff_roles').select('role').eq('auth_user_id',user.id).maybeSingle():{data:null};
  const authorized=!!staff;
  byId('loginPanel').classList.toggle('hidden',!!user);
  byId('dashboard').classList.toggle('hidden',!authorized);
  byId('signOut').classList.toggle('hidden',!user);
  if(roleError)return notify(roleError.message,true);
  if(user&&!authorized) return notify('This account does not have church staff access. Ask the Super Administrator to assign a role.',true);
  if(authorized)await loadMembers();
}
async function loadMembers(){
  // Phase 1 displays up to 1,000 members; add server-side pagination for larger lists.
  const {data,error}=await client.from('blc_members').select('id,member_number,first_name,last_name,email,phone,membership_status,created_at').order('last_name').limit(1000);
  if(error)return notify(error.message,true);
  roster=data||[];
  byId('total').textContent=roster.length;
  byId('pending').textContent=roster.filter(x=>x.membership_status==='pending').length;
  byId('active').textContent=roster.filter(x=>x.membership_status==='active').length;
  renderMembers();
}
function renderMembers(){
  const search=byId('search').value.trim().toLowerCase(),status=byId('filter').value;
  const filtered=roster.filter(m=>(status==='all'||m.membership_status===status)&&[m.first_name,m.last_name,m.email,m.phone].join(' ').toLowerCase().includes(search));
  byId('resultsNote').textContent=`Showing ${filtered.length} of ${roster.length} loaded profiles.`;
  const tbody=byId('memberRows');tbody.replaceChildren();
  for(const m of filtered){
    const tr=document.createElement('tr');
    const name=document.createElement('td');name.textContent=`${m.first_name} ${m.last_name} (BLC-${String(m.member_number).padStart(6,'0')})`;
    const contact=document.createElement('td');contact.textContent=[m.email,m.phone].filter(Boolean).join(' • ');
    const status=document.createElement('td');status.textContent=m.membership_status;
    const action=document.createElement('td');
    const select=document.createElement('select');select.setAttribute('aria-label',`Status for ${m.first_name} ${m.last_name}`);
    for(const opt of ['pending','active','inactive','visitor']){const option=document.createElement('option');option.value=opt;option.textContent=opt;option.selected=opt===m.membership_status;select.append(option);}
    select.addEventListener('change',async()=>{
      select.disabled=true;
      const {error}=await client.from('blc_members').update({membership_status:select.value}).eq('id',m.id);
      if(error)notify(error.message,true);else notify('Member status updated.');
      await loadMembers();
    });
    action.append(select);tr.append(name,contact,status,action);tbody.append(tr);
  }
}
byId('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();const f=event.currentTarget;
  const {error}=await client.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});
  if(error)return notify(error.message,true);
  notify('Signed in.');await refreshAdmin();
});
byId('addForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const payload={...memberPayload(event.currentTarget),membership_status:'active'};
  const {error}=await client.from('blc_members').insert(payload);
  if(error)return notify(error.message,true);
  event.currentTarget.reset();notify('Member added.');await loadMembers();
});
byId('search').addEventListener('input',renderMembers);
byId('filter').addEventListener('change',renderMembers);
byId('refresh').addEventListener('click',loadMembers);
byId('signOut').addEventListener('click',async()=>{await client.auth.signOut();notify('Signed out.');await refreshAdmin();});
refreshAdmin();
