'use strict';
(() => {
  const roleNames={super_admin:'Super Administrator',admin:'Administrator',secretary:'Membership Secretary',treasurer:'Treasurer',media:'Media Administrator',events:'Events Administrator'};
  // Only show links to existing implemented modules. Other permissions are
  // reserved for future separately protected pages.
  const modules=[
    {permission:'members_edit', label:'Member Management',href:'admin.html',description:'View member records'},
    {permission:'reports_view', label:'Missing Information Report',href:'missing-info-report.html',description:'Identify incomplete profiles'},
    {permission:'invitations_manage',label:'Invite Administrators',href:'invite.html',description:'Assign access and send account invitations'}
  ];
  const msg=(s,bad=false)=>{const el=byId('message');el.textContent=s;el.className=bad?'notice error':'notice';};
  async function refresh(){
    const user=await currentUser();
    byId('loginPanel').hidden=!!user;byId('portal').hidden=!user;byId('logout').classList.toggle('hidden',!user);
    if(!user){msg('Please sign in to continue.');return;}
    const [r,p,m]=await Promise.all([
      client.from('blc_staff_roles').select('role').eq('auth_user_id',user.id).maybeSingle(),
      client.from('blc_staff_permissions').select('permission').eq('auth_user_id',user.id),
      client.from('blc_members').select('id,first_name,last_name').eq('auth_user_id',user.id).maybeSingle()
    ]);
    if(r.error||p.error||m.error)return msg((r.error||p.error||m.error).message,true);
    const permissions=new Set((p.data||[]).map(x=>x.permission));
    byId('welcome').textContent=`Welcome${m.data?.first_name?', '+m.data.first_name:''}`;
    byId('roleLabel').textContent=r.data?`Assigned role: ${roleNames[r.data.role]||r.data.role}`:'Member account (no staff role)';
    byId('profileHint').textContent=m.data?`View your linked profile: ${m.data.first_name} ${m.data.last_name}`:'Create or request a link to your membership profile';
    const area=byId('tools');area.replaceChildren();
    for(const module of modules){if(!permissions.has(module.permission))continue;
      const a=document.createElement('a');a.className='portal-tile';a.href=module.href;
      const title=document.createElement('strong');title.textContent=module.label;
      const subtitle=document.createElement('span');subtitle.textContent=module.description;a.append(title,subtitle);area.append(a);
    }
    byId('noTools').classList.toggle('hidden',area.children.length>0);
    msg('Signed in successfully.');
  }
  byId('loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;
    const {error}=await client.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});
    if(error)return msg(error.message,true);await refresh();
  });
  byId('logout').addEventListener('click',async()=>{await client.auth.signOut();await refresh();});
  refresh();
})();
