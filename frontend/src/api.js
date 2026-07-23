const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

export async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a solicitação.');
  return body;
}
