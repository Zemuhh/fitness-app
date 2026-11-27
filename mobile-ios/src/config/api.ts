/**
 * Canlı Bulut Backend API Yapılandırması (HTTPS - Render Production)
 */
export const API_BASE_URL = 'https://fitness-appp.onrender.com';

const NETWORK_ERROR_TR =
  'Bağlantı kurulamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
const SERVER_ERROR_TR =
  'Sunucuya şu an ulaşılamıyor. Lütfen kısa bir süre sonra tekrar deneyin.';
const TIMEOUT_ERROR_TR =
  'İstek zaman aşımına uğradı. Lütfen bağlantınızı kontrol edip tekrar deneyin.';
const AUTH_ERROR_TR =
  'Oturumunuz sona erdi veya kimlik doğrulaması başarısız oldu. Lütfen tekrar giriş yapın.';
const FORBIDDEN_ERROR_TR = 'Bu işlem için yetkiniz bulunmuyor.';
const NOT_FOUND_ERROR_TR = 'İstenen kayıt veya içerik bulunamadı.';
const RATE_LIMIT_ERROR_TR =
  'Çok fazla istek gönderildi. Lütfen kısa bir süre bekleyip tekrar deneyin.';
const VALIDATION_ERROR_TR = 'Girilen bilgileri kontrol edip tekrar deneyin.';

const RAW_TECHNICAL_PATTERNS = [
  /failed to fetch/i,
  /network request failed/i,
  /networkerror/i,
  /load failed/i,
  /typeerror/i,
  /syntaxerror/i,
  /json parse error/i,
  /unexpected token/i,
  /500 internal server error/i,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway timeout/i,
  /<!doctype/i,
  /<html/i,
  /econnrefused/i,
  /enotfound/i,
  /abort(ed)?/i,
];

function isTechnicalRawMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  return RAW_TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function normalizeTurkishApiError(rawError: unknown, status?: number): string {
  if (typeof status === 'number') {
    if (status >= 500) {
      if (typeof rawError === 'string' && !isTechnicalRawMessage(rawError)) {
        return rawError.trim();
      }
      return SERVER_ERROR_TR;
    }
    if (status === 429) {
      return RATE_LIMIT_ERROR_TR;
    }
    if (status === 401) {
      if (
        typeof rawError === 'string' &&
        rawError.trim() &&
        !/^(unauthorized|not authenticated|invalid token)$/i.test(rawError.trim()) &&
        !isTechnicalRawMessage(rawError)
      ) {
        return rawError.trim();
      }
      return AUTH_ERROR_TR;
    }
    if (status === 403) {
      if (
        typeof rawError === 'string' &&
        rawError.trim() &&
        !/^forbidden$/i.test(rawError.trim()) &&
        !isTechnicalRawMessage(rawError)
      ) {
        return rawError.trim();
      }
      return FORBIDDEN_ERROR_TR;
    }
    if (status === 404) {
      if (
        typeof rawError === 'string' &&
        rawError.trim() &&
        !/^not found$/i.test(rawError.trim()) &&
        !isTechnicalRawMessage(rawError)
      ) {
        return rawError.trim();
      }
      return NOT_FOUND_ERROR_TR;
    }
    if (status === 422) {
      if (typeof rawError === 'string' && !isTechnicalRawMessage(rawError)) {
        return rawError.trim();
      }
      return VALIDATION_ERROR_TR;
    }
  }

  if (typeof rawError === 'string') {
    const trimmed = rawError.trim();
    if (!trimmed) return NETWORK_ERROR_TR;
    if (/abort/i.test(trimmed) || /timeout/i.test(trimmed)) {
      return TIMEOUT_ERROR_TR;
    }
    if (isTechnicalRawMessage(trimmed)) {
      return typeof status === 'number' && status >= 500
        ? SERVER_ERROR_TR
        : NETWORK_ERROR_TR;
    }
    return trimmed;
  }

  if (rawError instanceof Error) {
    if (rawError.name === 'AbortError') {
      return TIMEOUT_ERROR_TR;
    }
    return normalizeTurkishApiError(rawError.message, status);
  }

  return typeof status === 'number' && status >= 500
    ? SERVER_ERROR_TR
    : NETWORK_ERROR_TR;
}

function extractResponseErrorDetail(data: any): string | undefined {
  if (!data) return undefined;
  if (typeof data === 'string') return data;
  if (typeof data === 'object') {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0];
      if (typeof first === 'string') return first;
      if (first && typeof first.msg === 'string') return first.msg;
    }
    if (typeof data.message === 'string') return data.message;
    if (typeof data.error === 'string') return data.error;
  }
  return undefined;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const baseHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const mergedHeaders =
    options.headers instanceof Headers
      ? (() => {
          const next = new Headers(baseHeaders);
          options.headers.forEach((value, key) => {
            if (isFormData && key.toLowerCase() === 'content-type') return;
            next.set(key, value);
          });
          return next;
        })()
      : {
          ...baseHeaders,
          ...(options.headers as Record<string, string> | undefined),
        };

  const requestInit: RequestInit = {
    ...options,
    headers: mergedHeaders,
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}`, requestInit);
  } catch (err: unknown) {
    throw new Error(normalizeTurkishApiError(err));
  }

  let text = '';
  try {
    text = await response.text();
  } catch (err: unknown) {
    throw new Error(normalizeTurkishApiError(err, response.status));
  }

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const rawDetail = extractResponseErrorDetail(data);
    throw new Error(normalizeTurkishApiError(rawDetail, response.status));
  }

  return data as T;
}
