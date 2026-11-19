import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * ============================================================================
 * YEREL AĞ (WI-FI / HOTSPOT) YAPILANDIRMASI
 * Bilgisayarınızın tespit edilen yerel IP adresi aşağıda tanımlıdır.
 * Farklı bir ağa geçerseniz yalnızca LOCAL_WIFI_IP değerini güncelleyebilirsiniz.
 * ============================================================================
 */
export const LOCAL_WIFI_IP = '172.20.10.7';
export const BACKEND_PORT = 8000;

// Özel bir URL zorlamak isterseniz buraya yazabilirsiniz (örn: 'http://192.168.1.45:8000')
export const MANUAL_API_URL_OVERRIDE = '';

function resolveApiBaseUrl(): string {
  if (MANUAL_API_URL_OVERRIDE.trim().length > 0) {
    return MANUAL_API_URL_OVERRIDE.trim().replace(/\/+$/, '');
  }

  // Web tarayıcıda yerel test yapılıyorsa doğrudan localhost kullan
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:${BACKEND_PORT}`;
    }
    return `http://${hostname}:${BACKEND_PORT}`;
  }

  // Expo Go üzerinde Metro sunucusunun yerel IP adresini otomatik yakala (Tunnel değilse)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isIpv4) {
      return `http://${host}:${BACKEND_PORT}`;
    }
  }

  return `http://${LOCAL_WIFI_IP}:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

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
