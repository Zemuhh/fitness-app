/**
 * Canlı Bulut Backend API Yapılandırması (HTTPS - Render Production)
 */
export const API_BASE_URL = 'https://fitness-app-kii6.onrender.com';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const requestInit: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, requestInit);

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && (data.detail || data.message)) ||
      `Sunucu hatası (${response.status})`;
    throw new Error(String(errorMessage));
  }

  return data as T;
}
