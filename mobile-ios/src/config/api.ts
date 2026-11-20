import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * ============================================================================
 * AKILLI API ADRESİ YÖNETİMİ (BULUT PRODUCTION + YEREL GELİŞTİRME)
 * 1. Öncelik: `process.env.EXPO_PUBLIC_API_URL` (Vercel / Production canlı backend)
 * 2. Öncelik: `MANUAL_API_URL_OVERRIDE` veya `?api_url=` web sorgu parametresi
 * 3. Öncelik (Yerel Geliştirme):
 *    - Web localhost / 127.0.0.1 -> http://127.0.0.1:8000
 *    - Web yerel Wi-Fi IPv4 -> http://<LAN_IP>:8000
 *    - Native Expo Go -> Algılanan LAN IP veya http://192.168.1.147:8000
 * ============================================================================
 */
export const LOCAL_WIFI_IP = '192.168.1.147';
export const BACKEND_PORT = 8000;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

// Metro / Expo derlemesinde statik olarak gömülebilmesi için doğrudan erişim kullanılır
const ENV_PUBLIC_API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

// Geriye dönük dışa aktarım uyumluluğu korunur (eski geçici trycloudflare tüneli kaldırıldı)
export const PUBLIC_HTTPS_BACKEND_URL = ENV_PUBLIC_API_URL
  ? normalizeBaseUrl(ENV_PUBLIC_API_URL)
  : '';

// Özel bir URL zorlamak isterseniz buraya yazabilirsiniz (boş bırakıldığında otomatik algılar)
export const MANUAL_API_URL_OVERRIDE = '';

function isPrivateLanIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return false;
  }
  return (
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function extractLanIpv4(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^[a-zA-Z0-9+.-]+:\/\//, '');
  const host = cleaned.split('/')[0]?.split(':')[0]?.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    return null;
  }
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return isIpv4 ? host : null;
}

function readWebQueryApiOverride(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('api_url') || params.get('backend');
    if (fromQuery && /^https?:\/\//i.test(fromQuery.trim())) {
      return normalizeBaseUrl(fromQuery);
    }
  } catch {
    // ignore URL parsing errors
  }
  return null;
}

function resolveApiBaseUrl(): string {
  // 1. BİRİNCİ ÖNCELİK: Ortam değişkeni (Vercel / Canlı Bulut Backend URL)
  if (ENV_PUBLIC_API_URL.length > 0) {
    return normalizeBaseUrl(ENV_PUBLIC_API_URL);
  }

  if (MANUAL_API_URL_OVERRIDE.trim().length > 0) {
    return normalizeBaseUrl(MANUAL_API_URL_OVERRIDE);
  }

  const queryOverride = readWebQueryApiOverride();
  if (queryOverride) {
    return queryOverride;
  }

  // 2. Yerel Web Tarayıcı Geliştirme Ortamı:
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = (window.location.hostname || '').trim().toLowerCase();

    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:${BACKEND_PORT}`;
    }

    if (isPrivateLanIpv4(hostname)) {
      return `http://${hostname}:${BACKEND_PORT}`;
    }

    return `http://127.0.0.1:${BACKEND_PORT}`;
  }

  // 3. Native iOS / Android (Expo Go - Yerel Wi-Fi / LAN):
  const candidates = [
    Constants.expoConfig?.hostUri,
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost,
    (Constants as any).manifest?.debuggerHost,
    Constants.experienceUrl,
  ];

  for (const candidate of candidates) {
    const detectedIp = extractLanIpv4(candidate);
    if (detectedIp) {
      return `http://${detectedIp}:${BACKEND_PORT}`;
    }
  }

  // 4. Yedek: Yerel Wi-Fi IPv4 geliştirme adresi
  return `http://${LOCAL_WIFI_IP}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

function getFallbackBaseUrl(primaryBase: string): string | null {
  // Canlı ortam değişkeni tanımlıysa başka geçici adrese düşme
  if (ENV_PUBLIC_API_URL.length > 0) {
    const cleanEnvUrl = normalizeBaseUrl(ENV_PUBLIC_API_URL);
    return primaryBase !== cleanEnvUrl ? cleanEnvUrl : null;
  }

  // HTTPS sayfalarda mixed-content engeline takılmamak için HTTP fallback yapma
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:'
  ) {
    return null;
  }

  const localFallback =
    Platform.OS === 'web'
      ? `http://127.0.0.1:${BACKEND_PORT}`
      : `http://${LOCAL_WIFI_IP}:${BACKEND_PORT}`;

  return primaryBase !== localFallback ? localFallback : null;
}

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

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}`, requestInit);
  } catch (networkError) {
    const fallbackBase = getFallbackBaseUrl(API_BASE_URL);
    if (!fallbackBase) {
      throw networkError;
    }
    response = await fetch(`${fallbackBase}${normalizedPath}`, requestInit);
  }

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
