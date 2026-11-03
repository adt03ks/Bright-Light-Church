'use strict';
(() => {
  const presets={
    secretary:['members_view','members_edit','households_manage','reports_view'],
    admin:['members_view','members_edit','households_manage','reports_view'],
    treasurer:['finance_view'],media:['calendar_manage'],events:['fundraiser_manage'],
    super_admin:['members_view','members_edit','households_manage','reports_view','calendar_manage','finance_view','fundraiser_manage','invitations_manage']
  };
  const permissions=[
    ['members_view','View Member Directory','Read member profiles and contacts'],
    ['members_edit','Edit Member Profiles','Create and edit member information'],
    ['households_manage','Manage Households','Link spouses and families'],
    ['reports_view','Membership Reports','Review missing profile information'],
    ['calendar_manage','Church Calendar','Reserved for a protected calendar module'],
    ['finance_view','Finance','Reserved for finance integration'],
    ['fundraiser_manage','Fundraiser Management','Reserved for protected fundraiser integration'],
    ['invitations_manage','Send Staff Invitations','Super Administrator only']
  ];
  let members=[];
  const msg=(message,error=false)=>{byId('message').textContent=message;byId('message').className=error?'notice error':'notice';};
  function buildPermissionList(){const box=byId('permissionChoices');
    for(const [id,label,description] of permissions){const wrap=document.createElement('label');wrap.className='permission-option';
      const input=document.createElement('input');input.type='checkbox';input.value=id;input.name='permission';
      const content=document.createElement('span');const title=document.createElement('strong');title.textContent=label;
      const small=document.createElement('small');small.textContent=description;content.append(title,small);wrap.append(input,content);box.append(wrap);
    }
  }
  function selectedPermissions(){return [...document.querySelectorAll('input[name="permission"]:checked')].map(c=>c.value);}
  function applyPreset(){const role=byId('inviteRole').value;const set=new Set(presets[role]||[]);
    document.querySelectorAll('input[name="permission"]').forEach(el=>{el.checked=set.has(el.value);
      el.disabled=(el.value==='invitations_manage'&&role!=='super_admin')||(el.value==='finance_view'&&!['super_admin','treasurer'].includes(role));
    });
  }
  function renderMemberOptions(){const search=byId('memberSearch').value.trim().toLowerCase(),old=byId('memberSelect').value;
    const select=byId('memberSelect');select.replaceChildren(new Option('No existing profile — create later',''));
    const available=members.filter(m=>!m.auth_user_id && (!search||[m.first_name,m.last_name,m.email].join(' ').toLowerCase().includes(search))).slice(0,100);
    for(const m of available){select.add(new Option(`${m.first_name} ${m.last_name} — ${m.email||'email not recorded'}`,m.id));}
    if(available.some(m=>m.id===old)) select.value=old;
  }
  async function init(){const user=await currentUser();if(!user)return msg('Sign in first.',true);
    const [role,p]=await Promise.all([
      client.from('blc_staff_roles').select('role').eq('auth_user_id',user.id).maybeSingle(),
      client.from('blc_staff_permissions').select('permission').eq('auth_user_id',user.id)
    ]);
    if(role.error||p.error)return msg((role.error||p.error).message,true);
    if(role.data?.role!=='super_admin'||!(p.data||[]).some(x=>x.permission==='invitations_manage'))return msg('This account cannot invite administrators.',true);
    const result=await client.from('blc_members').select('id,first_name,last_name,email,auth_user_id').order('last_name').limit(1000);
    if(result.error)return msg(result.error.message,true);
    members=result.data||[];byId('locked').hidden=true;byId('invitePanel').hidden=false;msg('You are authorized to send administrator invitations.');renderMemberOptions();
  }
  byId('inviteRole').addEventListener('change',applyPreset);
  byId('memberSearch').addEventListener('input',renderMemberOptions);
  byId('inviteForm').addEventListener('submit',async e=>{e.preventDefault();const submit=byId('sendInvite');submit.disabled=true;
    try {
      const role=byId('inviteRole').value, email=byId('inviteEmail').value.trim().toLowerCase();
      const memberId=byId('memberSelect').value||null, perms=selectedPermissions();
      if(!perms.length)throw Error('Select at least one permission.');
      if(memberId){const member=members.find(m=>m.id===memberId);
        if(member?.email?.trim()&&member.email.trim().toLowerCase()!==email)throw Error('Selected member email differs. Update the member profile email first.');
      }
      msg('Sending invitation and recording access…');
      const {data,error}=await client.functions.invoke('blc-invite-staff',{
        body:{email,role,permissions:perms,memberId}
      });
      if(error){let reason=data?.error||error.message||'Unable to send invitation';
        if(error.context && typeof error.context.json==='function'){try{const detail=await error.context.json();reason=detail.error||reason;}catch(_){}}
        throw new Error(reason);}
      if(!data?.success)throw new Error(data?.error||'Invitation could not be completed');
      byId('successText').textContent=`Sent to ${email} • Role: ${role} • Member profile: ${memberId?'linked':'not yet linked'}.`;
      byId('invitePanel').hidden=true;byId('success').hidden=false;msg('Invitation sent. Access is now configured.');
    }catch(error){msg(error.message||'Could not send invitation.',true);}finally{submit.disabled=false;}
  });
  buildPermissionList();applyPreset();init();
})();
