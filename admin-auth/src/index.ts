interface Env { GITHUB_CLIENT_ID:string; GITHUB_CLIENT_SECRET:string; CMS_ORIGIN:string; ALLOWED_GITHUB_LOGIN:string; }
const COOKIE='realm_admin_oauth_state';
const baseHeaders=(extra:Record<string,string>={})=>({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
const reply=(body:string,status=200,extra:Record<string,string>={})=>new Response(body,{status,headers:baseHeaders({'Content-Type':'text/plain; charset=utf-8',...extra})});
const esc=(s:string)=>s.replace(/</g,'\\u003c');
export default { async fetch(request:Request,env:Env):Promise<Response> {
 const url=new URL(request.url);
 if(url.pathname==='/auth'){
  if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.CMS_ORIGIN)return reply('OAuth is not configured',500);
  const state=crypto.randomUUID()+crypto.randomUUID();
  const auth=new URL('https://github.com/login/oauth/authorize');
  auth.searchParams.set('client_id',env.GITHUB_CLIENT_ID);auth.searchParams.set('redirect_uri',new URL('/callback',url.origin).toString());auth.searchParams.set('scope','public_repo');auth.searchParams.set('state',state);
  return new Response(null,{status:302,headers:baseHeaders({'Location':auth.toString(),'Set-Cookie':COOKIE+'='+state+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600'})});
 }
 if(url.pathname==='/callback'){
  const code=url.searchParams.get('code'),state=url.searchParams.get('state');const cookie=request.headers.get('Cookie')||'';
  const expected=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);const clear={'Set-Cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'};
  if(!code||!state||!expected||state!==expected)return reply('OAuth state verification failed',400,clear);
  const tokenRes=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code})});
  const tokenData=await tokenRes.json() as {access_token?:string};if(!tokenRes.ok||!tokenData.access_token)return reply('GitHub token exchange failed',502,clear);
  const userRes=await fetch('https://api.github.com/user',{headers:{'Authorization':'Bearer '+tokenData.access_token,'Accept':'application/vnd.github+json','User-Agent':'Realm-Studios-Admin'}});
  const user=await userRes.json() as {login?:string};if(!userRes.ok||user.login?.toLowerCase()!==env.ALLOWED_GITHUB_LOGIN.toLowerCase())return reply('This GitHub account is not allowed to edit this site.',403,clear);
  const message='authorization:github:success:'+JSON.stringify({token:tokenData.access_token,provider:'github'});const origin=JSON.stringify(env.CMS_ORIGIN);
  const html='<!doctype html><meta charset="utf-8"><title>Signed in</title><p>Signed in to GitHub. You can close this window.</p><script>(function(){var origin='+esc(origin)+',message='+esc(JSON.stringify(message))+';function receive(e){if(e.origin!==origin)return;window.removeEventListener("message",receive);e.source.postMessage(message,origin);setTimeout(function(){window.close()},300)}window.addEventListener("message",receive);window.opener.postMessage("authorizing:github",origin)})();</script>';
  return new Response(html,{headers:baseHeaders({'Content-Type':'text/html; charset=utf-8',...clear,'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"})});
 }
 return reply('Not found',404);
}};
