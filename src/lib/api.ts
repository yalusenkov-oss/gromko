const RAW_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

function normalizeApiBase(raw?: string): string {
  if (!raw) return '/api';

  const cleaned = raw.replace(/\/+$/, '');

  // Common production setup: VITE_API_URL is set to backend origin only.
  if (/^https?:\/\//i.test(cleaned) && !/\/api$/i.test(cleaned)) {
    return `${cleaned}/api`;
  }

  return cleaned || '/api';
}

export const API_BASE = normalizeApiBase(RAW_API_URL);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}
