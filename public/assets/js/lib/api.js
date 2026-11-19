/** Cliente HTTP da API do CRM System. Envia o cabeçalho anti-CSRF e trata sessão expirada. */

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

const AUTH_EXEMPT = ['/api/auth/login', '/api/auth/logout'];

async function request(method, url, body) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'CRMSystem' },
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.', 0);
  }

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const exempt = AUTH_EXEMPT.some((p) => url.startsWith(p));
    if (!exempt && response.status === 401) {
      const reason = data?.code === 'SESSION_REVOKED' ? 'sessao=encerrada' : data?.code === 'ACCOUNT_DISABLED' ? 'conta=desativada' : 'sessao=expirada';
      window.location.assign(`/login?${reason}`);
    }
    if (!exempt && response.status === 503 && data?.code === 'MAINTENANCE') window.location.assign('/login?manutencao=1');
    throw new ApiError(data?.error || `A operação falhou (erro ${response.status}).`, response.status, data);
  }
  return data;
}

/** Monta uma query string ignorando valores vazios. */
export function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url, body) => request('DELETE', url, body),
};
