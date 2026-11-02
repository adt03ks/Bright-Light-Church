'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const notice=(text,err=false)=>{const n=el('message');n.textContent=text;n.className='notice'+(err?' error':'');n.hidden=false;};
  if(!window.supabase?.createClient||!window.BLC_SUPABASE_URL||!window.BLC_SUPABASE_ANON_KEY){el('loading').textContent='The portal needs a valid Supabase config.js connection.';return;}
  const db=window.supabase.createClient(window.BLC_SUPABASE_URL,window.BLC_SUPABASE_ANON_KEY);
  const makeCard=(title,summary,url,symbol)=>{
    const a=document.createElement('a');a.className='portal-card private';a.href=url;
    const icon=document.createElement('span');icon.className='symbol';icon.textContent=symbol;icon.setAttribute('aria-hidden','true');
    const h=document.createElement('h3');h.textContent=title;
    const p=document.createElement('p');p.textContent=summary;
    const action=document.createElement('span');action.className='launch';action.textContent='Open '+title+' →';
    a.append(icon,h,p,action);return a;
  };
  async function getOwnRecord(table,userId,columns){
    try{const {data,error}=await db.from(table).select(columns).eq('auth_user_id',userId).maybeSingle();if(error){console.warn('Permission lookup unavailable:',table,error.code);return null;}return data;}
    catch{return null;}
  }
  async function load(){
    const {data,error}=await db.auth.getUser();
    if(error||!data?.user){location.replace('login.html');return;}
    const user=data.user;el('account-email').textContent=user.email||'';
    const [memberResult,staff,finance,content,fundraiser]=await Promise.all([
      db.from('blc_members').select('first_name,last_name,membership_status,member_number').eq('auth_user_id',user.id).maybeSingle(),
      getOwnRecord('blc_staff_roles',user.id,'role'),
      getOwnRecord('blc_finance_roles',user.id,'role'),
      getOwnRecord('blc_content_roles',user.id,'role'),
      getOwnRecord('blc_fundraiser_roles',user.id,'role')
    ]);
    const member=memberResult.error?null:memberResult.data;
    el('display-name').textContent=member?('Welcome, '+[member.first_name,member.last_name].filter(Boolean).join(' ')+'!'):'Welcome, church member!';
    el('member-status').textContent=member?('Membership: '+member.membership_status):'Profile not submitted';
    el('profile-hint').textContent=member?('Member ID: BLC-'+String(member.member_number).padStart(6,'0')):'Complete your membership profile to connect your account to church records.';
    const links=el('staff-links');links.replaceChildren();
    if(staff && ['super_admin','admin','secretary'].includes(staff.role)){
      links.append(makeCard('Membership Admin','Manage member records, family connections, and review pending profiles.','admin.html','♧'));
      links.append(makeCard('Missing Information Report','Identify profiles missing birthdates, contact information, or addresses.','missing-info-report.html','▤'));
      links.append(makeCard('Events & Birthdays Admin','Manage church events and approved public birthday announcements.','calendar-admin.html','▦'));
    }
    if(content && ['content_admin','content_editor'].includes(content.role))links.append(makeCard('Content Admin','Update website photographs, headlines, announcements, and captions.','content-admin.html','✦'));
    if(finance && ['finance_admin','treasurer','finance_entry','hr_admin'].includes(finance.role))links.append(makeCard('Finance Center','View the finance workspace allowed by your assigned finance role.','finance.html','＄'));
    if(fundraiser && ['fundraiser_admin','fundraiser_entry'].includes(fundraiser.role))links.append(makeCard('Fundraiser Log','Private in-person collection records and fundraiser activity.','fundraiser-log.html','▣'));
    el('staff-section').hidden=links.children.length===0;
    el('member-only').hidden=links.children.length>0;
    el('loading').hidden=true;el('app').hidden=false;
    if(memberResult.error)notice('We could not load your member profile. Your sign-in is still active; please try the Member Profile page.',true);
  }
  el('sign-out').addEventListener('click',async()=>{await db.auth.signOut();location.replace('login.html');});
  load().catch(err=>{el('loading').textContent='Unable to load the portal. '+(err.message||'Please try again.');});
})();
