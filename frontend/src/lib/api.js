import { appConfig } from '../config/app';

export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http')
    ? path
    : `${appConfig.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error || data.message || response.statusText;
    throw new Error(message || 'Request failed');
  }

  return data;
}
