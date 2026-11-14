import type { BrowserContext } from '@playwright/test';

export const alice = '00000000-0000-4000-8000-000000000001'; export const bob = '00000000-0000-4000-8000-000000000002';
const makeUser = (id: string, email: string) => ({ id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { provider_value: 'preserve-me' } as Record<string, any>, identities: [], created_at: new Date().toISOString() });
const jwt = (id: string) => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'test-signature'].join('.');
const session = (user: ReturnType<typeof makeUser>) => ({ access_token: jwt(user.id), refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user });
export function authServer() {
  const users: Record<string, ReturnType<typeof makeUser>> = { [alice]: makeUser(alice, 'alice@example.test'), [bob]: makeUser(bob, 'bob@example.test') };
  const server = {
    users, writes: [] as Array<{ id: string; body: any }>, failNext: false, forceUser: '', writeDelay: 0,
    async attach(context: BrowserContext, id: string | null = alice) {
      if (id) await context.addInitScript(value => localStorage.setItem('realm-studios-auth', JSON.stringify(value)), session(structuredClone(users[id])));
      await context.route('**/rest/v1/rpc/**', route => route.fulfill({ json: { code: 'PGRST202', message: 'Not installed in this fixture' }, status: 404, headers: { 'access-control-allow-origin': '*' } }));
      await context.route('**/auth/v1/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname.replace('/auth/v1/', '');
        const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Supabase-Api-Version', 'x-supabase-api-version': '2024-01-01' };
        if (path === 'settings') return route.fulfill({ headers, json: { external: { email: true }, disable_signup: false } });
        if (path === 'token') { const user = Object.values(users).find(user => user.email === request.postDataJSON().email); return route.fulfill({ headers, status: user ? 200 : 400, json: user ? session(user) : { code: 'invalid_credentials' } }); }
        if (path === 'logout') return route.fulfill({ status: 204, headers });
        let userId: string; try { userId = JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url').toString()).sub; } catch { userId = ''; }
        const user = users[server.forceUser || userId];
        if (!user) return route.fulfill({ status: 401, headers, json: { code: 'bad_jwt', msg: 'Invalid session' } });
        if (path === 'user') {
          if (request.method() === 'PUT') {
            const body = request.postDataJSON(); server.writes.push({ id: user.id, body });
            if (server.failNext) { server.failNext = false; return route.fulfill({ status: 400, headers, json: { code: 'validation_failed', msg: 'Simulated failure' } }); }
            if (server.writeDelay) await new Promise(resolve => setTimeout(resolve, server.writeDelay));
            user.user_metadata = { ...user.user_metadata, ...body.data };
          }
          return route.fulfill({ headers, json: structuredClone(user) });
        }
        return route.fulfill({ status: 404, headers, json: { message: 'Unmocked endpoint' } });
      });
    },
  };
  return server;
}
