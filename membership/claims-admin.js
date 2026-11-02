'use strict';
(()=>{
  const el=id=>document.getElementById(id);
  const note=(message,error=false)=>{el('status').textContent=message;el('status').className='notice'+(error?' error':'');};
  const db=window.supabase?.createClient?.(window.BLC_SUPABASE_URL,window.BLC_SUPABASE_ANON_KEY);
  if(!db){note('Cannot connect to Supabase. Check your existing config.js.',true);return;}
  const make=(tag,text,cls)=>{
    const node=document.createElement(tag);if(text!==undefined)node.textContent=text;
    if(cls)node.className=cls;return node;
  };
  let authorized=false;
  const review=async(claim,action,memberId=null)=>{
    if(!authorized)return;
    const actionText=action==='link'?'LINK THIS WEBSITE ACCOUNT to the selected member':action==='create'?'CREATE A NEW PENDING MEMBER PROFILE':'REJECT THIS REQUEST';
    if(!window.confirm(actionText+' for '+claim.first_name+' '+claim.last_name+'?\n\nOnly continue after verifying the applicant’s identity.'))return;
    const detail=window.prompt('Staff verification note (recommended):','');
    if(detail===null)return;
    const {error}=await db.rpc('blc_review_profile_claim',{
      p_claim_id:claim.id,p_action:action,p_member_id:memberId,p_note:detail.trim()||null
    });
    if(error){note('Action failed: '+error.message,true);return;}
    note(action==='link'?'Login connected to the existing member record.':action==='create'?'New member profile created with pending status.':'Request rejected.');
    await load();
  };
  const candidateRow=(claim,m)=>{
    const box=make('div',undefined,'match-result');
    box.append(make('strong',`${m.full_name} (BLC-${String(m.member_number).padStart(6,'0')})`));
    box.append(make('small',`Matches: ${m.matching_fields||'None'} · Score: ${m.score} · Status: ${m.member_status}`));
    box.append(make('small',[m.member_email,m.member_phone].filter(Boolean).join(' • ')||'No contact details on file'));
    if(m.already_linked){box.append(make('p','Already attached to another login — cannot link automatically. Investigate with the church office.','warning'));}
    else{
      const b=make('button','Verify & Link to This Profile');b.type='button';b.addEventListener('click',()=>review(claim,'link',m.member_id));
      box.append(b);
    }
    return box;
  };
  async function candidates(claim,container){
    const {data,error}=await db.rpc('blc_claim_candidates',{p_claim_id:claim.id});
    if(error){container.append(make('p','Could not read possible matches: '+error.message,'warning'));return;}
    const list=data||[];
    container.append(make('p',list.length?`${list.length} possible match(es). Verify the person before linking.`:'No matching profile found by email, phone, or full name.'));
    for(const m of list)container.append(candidateRow(claim,m));
    const actions=make('div',undefined,'match-actions');
    const create=make('button','Create New Pending Profile','secondary');create.type='button';
    create.addEventListener('click',()=>{
      if(list.length && !window.confirm('Possible matches exist. Creating a new profile may duplicate an existing member. Have you verified none belong to this applicant?'))return;
      review(claim,'create');
    });
    const reject=make('button','Reject Request','secondary');reject.type='button';reject.addEventListener('click',()=>review(claim,'reject'));
    actions.append(create,reject);container.append(actions);
  }
  async function load(){
    if(!authorized)return;
    const {data,error}=await db.from('blc_profile_claims')
      .select('id,requester_auth_user_id,login_email,first_name,last_name,contact_email,phone,date_of_birth,status,submitted_at')
      .eq('status','pending').order('submitted_at',{ascending:true}).limit(200);
    if(error){note('Unable to load requests: '+error.message,true);return;}
    const area=el('requests');area.replaceChildren();el('count').textContent=(data||[]).length+' awaiting review';
    for(const claim of data||[]){
      const card=make('article',undefined,'reviewcard');
      card.append(make('h3',`${claim.first_name} ${claim.last_name}`));
      card.append(make('p',`Login email: ${claim.login_email}`));
      card.append(make('p',`Entered contact: ${[claim.contact_email,claim.phone].filter(Boolean).join(' • ')||'Not provided'}`));
      card.append(make('small',`Birth date supplied: ${claim.date_of_birth||'No'} · Submitted: ${new Date(claim.submitted_at).toLocaleString()}`));
      const box=make('div');box.append(make('p','Searching for matches…'));card.append(box);area.append(card);
      // Candidate retrieval stays behind the staff-authorized Supabase function.
      box.replaceChildren();await candidates(claim,box);
    }
    if(!data?.length)area.append(make('p','There are no account connection requests awaiting review.'));
    note('Signed in as authorized membership staff. Confirm identity before approving any request.');
  }
  async function start(){
    const {data,error}=await db.auth.getUser();
    if(error||!data?.user){note('Sign in at Member Sign In, then return to this page.',true);return;}
    const {data:staff,error:roleError}=await db.from('blc_staff_roles')
      .select('role').eq('auth_user_id',data.user.id).maybeSingle();
    if(roleError){note('Cannot verify your role: '+roleError.message,true);return;}
    if(!staff||!['super_admin','admin','secretary'].includes(staff.role)){note('This account does not have membership administration permission.',true);return;}
    authorized=true;el('requestArea').classList.remove('hidden');el('reload').hidden=false;
    await load();
  }
  el('reload').addEventListener('click',load);
  start().catch(e=>note(e.message||'Unexpected error.',true));
})();
