'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const msg=(text,isError=false)=>{const n=el('message');n.textContent=text;n.className='notice'+(isError?' error':' success');n.hidden=false;};
  let db;
  try {
    if(!window.supabase?.createClient || !window.BLC_SUPABASE_URL || !window.BLC_SUPABASE_ANON_KEY)throw Error('Supabase connection is not configured.');
    db=window.supabase.createClient(window.BLC_SUPABASE_URL,window.BLC_SUPABASE_ANON_KEY);
  } catch(error){msg(error.message,true);el('login-button').disabled=true;return;}
  let recoveryMode=false;
  const show=(what)=>{['login-panel','reset-panel','new-password-panel'].forEach(id=>el(id).hidden=id!==what);};
  // Supabase emits PASSWORD_RECOVERY after validating the emailed recovery link.
  db.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;show('new-password-panel');msg('Reset link verified. Choose a new password.');}});
  const start=async()=>{
    // Do not redirect during recovery, when a reset password form is required.
    const {data,error}=await db.auth.getSession();
    if(error)msg('Could not check login session: '+error.message,true);
    if(data?.session && !recoveryMode && !location.hash.includes('type=recovery') && !location.search.includes('type=recovery') && !new URLSearchParams(location.search).has('code')) location.replace('portal.html');
  };
  el('login-form').addEventListener('submit',async e=>{
    e.preventDefault();const b=el('login-button');b.disabled=true;msg('Signing in…');
    try{const {error}=await db.auth.signInWithPassword({email:el('email').value.trim(),password:el('password').value});if(error)throw error;location.replace('portal.html');}
    catch(err){msg(err.message||'Sign in failed.',true);b.disabled=false;}
  });
  el('show-reset').addEventListener('click',()=>{el('reset-email').value=el('email').value;show('reset-panel');el('message').hidden=true;});
  el('cancel-reset').addEventListener('click',()=>{show('login-panel');el('message').hidden=true;});
  el('reset-form').addEventListener('submit',async e=>{
    e.preventDefault();const {error}=await db.auth.resetPasswordForEmail(el('reset-email').value.trim(),{redirectTo:new URL('login.html',location.href).href});
    if(error)return msg(error.message,true);
    msg('If that email belongs to an account, a password reset link has been sent.');
  });
  el('new-password-form').addEventListener('submit',async e=>{
    e.preventDefault();const {error}=await db.auth.updateUser({password:el('new-password').value});
    if(error)return msg(error.message,true);
    // Avoid automatically creating a privileged session on another shared device.
    await db.auth.signOut();recoveryMode=false;show('login-panel');el('new-password').value='';msg('Your password was updated. Please sign in.');
  });
  start().catch(err=>msg(err.message,true));
})();
