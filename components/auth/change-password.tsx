"use client";
import { useState } from "react";
export function ChangePassword(){const [error,setError]=useState(''),[busy,setBusy]=useState(false);
return <form className="mx-auto my-16 max-w-md space-y-5 rounded-3xl border border-line bg-panel p-8" onSubmit={async event=>{
event.preventDefault();if(busy)return;setBusy(true);setError('');const form=new FormData(event.currentTarget);
try{const response=await fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword')})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Unable to change password.');window.location.assign('/dashboard');}catch(e){setError(e instanceof Error?e.message:'Unable to change password.');}finally{setBusy(false);}}}>
<h1 className="text-2xl font-semibold">Change your password</h1><p>Set a new password before continuing to your account.</p>
<label className="block">Current password<input className="mt-2 w-full rounded-lg border border-line bg-panel p-3" type="password" name="currentPassword" autoComplete="current-password" required maxLength={128}/></label>
<label className="block">New password<input className="mt-2 w-full rounded-lg border border-line bg-panel p-3" type="password" name="newPassword" autoComplete="new-password" required minLength={8} maxLength={128}/></label>
{error?<p role="alert">{error}</p>:null}<button className="rounded-xl bg-indigo-600 px-5 py-3 text-white" disabled={busy}>{busy?'Saving…':'Save password'}</button></form>;}
