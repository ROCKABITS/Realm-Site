import { encodeContent, decodeContent, type Document } from './content';
export const repository = 'ROCKABITS/Realm-Site';
export const branch = 'realm-studios-site';
export const owner = 'ROCKABITS';
export const oauthOrigin = 'https://realm-studios-admin-auth.rockabits2007.workers.dev';
export const sessionKey = 'realm-studios-admin-session';
export class RepositoryError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
export class Repository {
  token: string;
  constructor(token: string) { this.token = token; }
  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const message = response.status === 401 ? 'A sessão expirou. Volta a entrar com o GitHub.' : response.status === 409 || response.status === 422 ? 'Este conteúdo mudou entretanto ou já existe. O teu texto foi mantido. Exporta o rascunho e reabre a página para comparar as alterações.' : response.status === 403 ? 'O GitHub recusou o pedido. Verifica as permissões ou aguarda se fizeste muitos pedidos.' : 'Não foi possível contactar o repositório. Tenta novamente.';
      throw new RepositoryError(message, response.status);
    }
    return response.json();
  }
  async verify() {
    const user = await this.request('/user');
    if (user.login?.toLowerCase() !== owner.toLowerCase()) throw new RepositoryError('Esta conta não tem acesso à administração do Realm Studios.', 403);
    return user;
  }
  async read(path: string): Promise<Document> {
    const result = await this.request(`/repos/${repository}/contents/${path}?ref=${branch}`);
    return { path, sha: result.sha, text: decodeContent(result.content) };
  }
  async list(folder: string) {
    return this.request(`/repos/${repository}/contents/${folder}?ref=${branch}`) as Promise<Array<{ name: string; path: string; sha: string; type: string }>>;
  }
  async save(document: Document, text: string, title: string) {
    return this.request(`/repos/${repository}/contents/${document.path}`, { method: 'PUT', body: JSON.stringify({ branch, message: `Update ${title} from Realm Studios admin`, content: encodeContent(text), ...(document.sha ? { sha: document.sha } : {}) }) });
  }
}

export function signIn(): Promise<string> {
  const popup = window.open(`${oauthOrigin}/auth`, 'realm-admin-login', 'popup,width=650,height=740');
  if (!popup) return Promise.reject(new Error('Permite a janela de login do GitHub no teu navegador e tenta novamente.'));
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); clearInterval(closed); window.removeEventListener('message', receive); popup.close(); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== oauthOrigin || event.source !== popup || typeof event.data !== 'string') return;
      if (event.data === 'authorizing:github') { popup.postMessage('authorizing:github', oauthOrigin); return; }
      const prefix = 'authorization:github:success:';
      if (event.data.startsWith(prefix)) {
        try { const data = JSON.parse(event.data.slice(prefix.length)); if (typeof data.token !== 'string' || !data.token || data.provider !== 'github') throw new Error(); cleanup(); resolve(data.token); }
        catch { cleanup(); reject(new Error('A resposta de login não é válida. Tenta novamente.')); }
      }
    };
    window.addEventListener('message', receive);
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('O login demorou demasiado tempo. Tenta novamente.')); }, 180_000);
    const closed = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error('Fechaste a janela antes de concluir o login.')); } }, 500);
  });
}
