import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthDemoProvider } from '@/context/AuthDemoContext';
import { COLORS } from '@/theme/colors';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthDemoProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      </AuthDemoProvider>
    </SafeAreaProvider>
  );
}
