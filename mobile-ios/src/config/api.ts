import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * ============================================================================
 * CANLI GENEL PAYLAŞIM (HTTPS CLOUDFLARE TUNNEL) & YEREL AĞ (LAN) YAPILANDIRMASI
 * - Google Chrome / Safari üzerinden canlı HTTPS paylaşım linkinden girildiğinde:
 *   PUBLIC_HTTPS_BACKEND_URL otomatik kullanılır (sıfır CORS ve sıfır Mixed-Content hatası).
 * - Bilgisayardan (localhost / 127.0.0.1) girildiğinde: http://127.0.0.1:8000
 * - Aynı Wi-Fi ağındaki telefondan (LAN IPv4 / Expo Go) girildiğinde:
 *   http://192.168.1.147:8000 (4G/5G veya tünel bağlantısında HTTPS tünele geçer).
 * ============================================================================
 */
export const LOCAL_WIFI_IP = '192.168.1.147';
export const BACKEND_PORT = 8000;

// Canlı Cloudflare HTTPS Backend Tüneli (Google Chrome & Uzaktan Canlı Erişim)
export const PUBLIC_HTTPS_BACKEND_URL =
  'https://vacancies-allocation-opportunity-summary.trycloudflare.com';

// Özel bir URL zorlamak isterseniz buraya yazabilirsiniz (boş bırakıldığında otomatik algılar)
export const MANUAL_API_URL_OVERRIDE = '';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

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
  if (MANUAL_API_URL_OVERRIDE.trim().length > 0) {
    return normalizeBaseUrl(MANUAL_API_URL_OVERRIDE);
  }

  const envUrl =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL
      ? process.env.EXPO_PUBLIC_API_URL.trim()
      : '';
  if (envUrl.length > 0) {
    return normalizeBaseUrl(envUrl);
  }

  const queryOverride = readWebQueryApiOverride();
  if (queryOverride) {
    return queryOverride;
  }

  // 1. Web Tarayıcı (Google Chrome, Safari, Mobil Tarayıcı):
  //    - HTTPS tünelden (*.trycloudflare.com veya genel alan adı) girildiğinde HTTPS Backend Tüneli
  //    - localhost / 127.0.0.1 üzerinden HTTP ile girildiğinde http://127.0.0.1:8000
  //    - Yerel Wi-Fi IPv4 üzerinden HTTP ile girildiğinde http://192.168.x.x:8000
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = (window.location.hostname || '').trim().toLowerCase();

    if (
      protocol === 'https:' ||
      hostname.endsWith('.trycloudflare.com') ||
      (hostname.length > 0 &&
        hostname !== 'localhost' &&
        hostname !== '127.0.0.1' &&
        !isPrivateLanIpv4(hostname))
    ) {
      if (PUBLIC_HTTPS_BACKEND_URL.trim().length > 0) {
        return normalizeBaseUrl(PUBLIC_HTTPS_BACKEND_URL);
      }
    }

    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:${BACKEND_PORT}`;
    }

    return `http://${hostname}:${BACKEND_PORT}`;
  }

  // 2. iOS / Android (Expo Go - Yerel Wi-Fi veya Tünel / Hücresel Veri):
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

  // Eğer Expo Tunnel (exp.direct) veya hücresel ağ üzerinden bağlanıldıysa genel HTTPS tünelini kullan
  if (PUBLIC_HTTPS_BACKEND_URL.trim().length > 0) {
    return normalizeBaseUrl(PUBLIC_HTTPS_BACKEND_URL);
  }

  // 3. Yedek: Bilgisayarın yerel IPv4 adresi
  return `http://${LOCAL_WIFI_IP}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

function getFallbackBaseUrl(primaryBase: string): string | null {
  const cleanTunnel = PUBLIC_HTTPS_BACKEND_URL.trim()
    ? normalizeBaseUrl(PUBLIC_HTTPS_BACKEND_URL)
    : null;

  // HTTPS sayfalarda mixed-content engeline takılmamak için HTTP fallback yapma
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:'
  ) {
    return cleanTunnel && cleanTunnel !== primaryBase ? cleanTunnel : null;
  }

  if (cleanTunnel && primaryBase !== cleanTunnel) {
    return cleanTunnel;
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
