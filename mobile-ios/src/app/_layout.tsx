import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { ResponsiveMobileFrame } from '@/components/ResponsiveMobileFrame';
import { AuthDemoProvider } from '@/context/AuthDemoContext';

function upsertMetaTag(name: string, content: string): void {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector(
    `meta[name="${name}"]`
  ) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function upsertLinkTag(id: string, rel: string, href: string): void {
  if (typeof document === 'undefined') return;
  const existing =
    (document.getElementById(id) as HTMLLinkElement | null) ||
    (document.querySelector(`link[rel="${rel}"][href="${href}"]`) as HTMLLinkElement | null);
  if (existing) {
    existing.href = href;
    return;
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'FitClub Studio';

      upsertMetaTag(
        'viewport',
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      );
      upsertMetaTag('apple-mobile-web-app-capable', 'yes');
      upsertMetaTag('mobile-web-app-capable', 'yes');
      upsertMetaTag('apple-mobile-web-app-status-bar-style', 'default');
      upsertMetaTag('apple-mobile-web-app-title', 'FitClub');
      upsertMetaTag('theme-color', '#0D9488');

      upsertLinkTag('fitclub-pwa-manifest', 'manifest', '/manifest.json');
      upsertLinkTag('fitclub-apple-touch-icon', 'apple-touch-icon', '/icon.png');
      upsertLinkTag(
        'erya-google-fonts',
        'stylesheet',
        'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
      );

      if (!document.getElementById('fitclub-responsive-frame-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'fitclub-responsive-frame-style';
        styleEl.textContent = `
          html, body, #root {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #E2E8F0;
            -webkit-tap-highlight-color: transparent;
            overscroll-behavior-y: none;
          }
          @media (max-width: 480px) {
            html, body, #root {
              background-color: #F4F7FB;
            }
          }
          @media (min-width: 481px) {
            [aria-modal="true"] {
              max-width: 430px !important;
              margin-left: auto !important;
              margin-right: auto !important;
              overflow: hidden !important;
            }
          }
        `;
        document.head.appendChild(styleEl);
      }
    }
  }, []);

  return (
    <SafeAreaProvider>
      <ResponsiveMobileFrame>
        <AuthDemoProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#F4F7FB' },
            }}
          >
            <Stack.Screen name="index" />
          </Stack>
          <PwaInstallBanner />
        </AuthDemoProvider>
      </ResponsiveMobileFrame>
    </SafeAreaProvider>
  );
}
