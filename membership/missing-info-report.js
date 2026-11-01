'use strict';
let members = [];
const requiredLabels = {date_of_birth:'Birthdate',phone:'Phone',email:'Email',address:'Address'};
const missing = m => {
  const fields=[];
  if(!m.date_of_birth) fields.push('date_of_birth');
  if(!m.phone?.trim()) fields.push('phone');
  if(!m.email?.trim()) fields.push('email');
  if(![m.street_address,m.city,m.state,m.postal_code].every(v=>typeof v==='string'&&v.trim())) fields.push('address');
  return fields;
};
const fullName = m => [m.honorific,m.first_name,m.last_name].filter(Boolean).join(' ');
function matched(){const q=byId('search').value.toLowerCase().trim(),f=byId('field').value,s=byId('status').value;
 return members.filter(m=>{const x=missing(m);return x.length&&(f==='any'||x.includes(f))&&(s==='all'||m.membership_status===s)&&fullName(m).toLowerCase().includes(q);});}
function cell(text){const el=document.createElement('td');el.textContent=text;return el;}
function render(){
 const incomplete=members.filter(m=>missing(m).length).length;
 byId('memberCount').textContent=members.length;
 byId('incompleteCount').textContent=incomplete;
 byId('completeCount').textContent=members.length-incomplete;
 const results=matched();byId('reportNote').textContent=`Showing ${results.length} incomplete member profiles${results.length?' (filtered)':''}.`;
 const tbody=byId('rows');tbody.replaceChildren();
 for(const m of results){const tr=document.createElement('tr');tr.append(cell(fullName(m)),cell(m.membership_status||'—'));
 const labels=document.createElement('td'),wrap=document.createElement('div');wrap.className='missing-list';for(const k of missing(m)){const b=document.createElement('span');b.className='missing-chip';b.textContent=requiredLabels[k];wrap.append(b);}labels.append(wrap);tr.append(labels,cell(String(missing(m).length)));
 const linkCell=document.createElement('td'),link=document.createElement('a');link.href='admin.html?member='+encodeURIComponent(m.id);link.textContent='Edit member';linkCell.append(link);tr.append(linkCell);tbody.append(tr);
 }
}
async function load(){byId('refresh').disabled=true;try{
 const all=[];const PAGE=500;
 for(let offset=0;;offset+=PAGE){const {data,error}=await client.from('blc_members').select('id,member_number,honorific,first_name,last_name,membership_status,date_of_birth,email,phone,street_address,city,state,postal_code').order('member_number',{ascending:true}).range(offset,offset+PAGE-1);if(error)throw error;all.push(...(data||[]));if(!data||data.length<PAGE)break;}
 members=all;render();notify('Report updated.');
 }catch(e){notify('Could not load the report: '+e.message,true);}finally{byId('refresh').disabled=false;}}
async function init(){const user=await currentUser();const {data:role,error}=user?await client.from('blc_staff_roles').select('role').eq('auth_user_id',user.id).maybeSingle():{data:null,error:null};const allowed=!!role&&['super_admin','admin','secretary'].includes(role.role);
 byId('loginPanel').classList.toggle('hidden',!!user);byId('report').classList.toggle('hidden',!allowed);byId('signOut').classList.toggle('hidden',!user);
 if(error)notify(error.message,true);else if(user&&!allowed)notify('This account does not have church staff access.',true);
 if(allowed)await load();}
function safeCsv(v){const str=String(v??'');return '"'+(/^[\s]*[=+@-]/.test(str)?"'"+str:str).replaceAll('"','""')+'"';}
function download(){const results=matched();const headers=['Member ID','Member name','Status','Missing birthdate','Missing phone','Missing email','Missing address','Missing count'];const rows=[headers,...results.map(m=>{const fields=missing(m);return [m.member_number,fullName(m),m.membership_status,...['date_of_birth','phone','email','address'].map(k=>fields.includes(k)?'Yes':'No'),fields.length];})];
 const content='\uFEFF'+rows.map(r=>r.map(safeCsv).join(',')).join('\r\n');const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='blc-missing-member-information-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
byId('loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const {error}=await client.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});if(error)return notify(error.message,true);await init();});
for(const id of ['search','field','status'])byId(id).addEventListener(id==='search'?'input':'change',render);
byId('refresh').addEventListener('click',load);byId('export').addEventListener('click',download);byId('signOut').addEventListener('click',async()=>{await client.auth.signOut();members=[];await init();});init();
