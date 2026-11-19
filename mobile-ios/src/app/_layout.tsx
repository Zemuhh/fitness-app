import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthDemoProvider } from '@/context/AuthDemoContext';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'ERYA Pilates & Reformer • Stüdyo Uygulaması';
      const existing = document.getElementById('erya-google-fonts');
      if (!existing) {
        const link = document.createElement('link');
        link.id = 'erya-google-fonts';
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
        document.head.appendChild(link);
      }
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AuthDemoProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#090D16' },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      </AuthDemoProvider>
    </SafeAreaProvider>
  );
}
