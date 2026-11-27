import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';

function usePulseOpacity() {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 820,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 820,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return pulse;
}

interface SkeletonBlockProps {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  opacity: Animated.Value;
  tone?: 'track' | 'elevated';
  style?: object;
}

function SkeletonBlock({
  width = '100%',
  height,
  radius = 10,
  opacity,
  tone = 'track',
  style,
}: SkeletonBlockProps) {
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tone === 'elevated' ? COLORS.surfaceElevated : COLORS.track,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Daylight Wellness (ERYA Pilates Reformer) ana sayfa iskelet yükleyicisi.
 * İlk yüklemede boş ekran veya tekdüze spinner yerine yumuşak pulse kartları gösterir.
 */
export const DashboardSkeleton = React.memo(function DashboardSkeleton() {
  const pulse = usePulseOpacity();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Canlı Salon Yoğunluk Kartı İskeleti */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.rowGap}>
            <SkeletonBlock width={30} height={30} radius={15} opacity={pulse} />
            <View style={styles.colGapSm}>
              <SkeletonBlock width={110} height={10} radius={5} opacity={pulse} />
              <SkeletonBlock width={165} height={17} radius={7} opacity={pulse} />
            </View>
          </View>
          <SkeletonBlock width={86} height={26} radius={999} opacity={pulse} tone="elevated" />
        </View>

        <View style={styles.rowGapMd}>
          <SkeletonBlock width={72} height={38} radius={10} opacity={pulse} />
          <View style={[styles.colGapSm, { flex: 1 }]}>
            <SkeletonBlock width="100%" height={10} radius={999} opacity={pulse} />
            <View style={styles.rowBetween}>
              <SkeletonBlock width={62} height={9} radius={4} opacity={pulse} tone="elevated" />
              <SkeletonBlock width={68} height={9} radius={4} opacity={pulse} tone="elevated" />
              <SkeletonBlock width={58} height={9} radius={4} opacity={pulse} tone="elevated" />
            </View>
          </View>
        </View>

        <SkeletonBlock width="100%" height={36} radius={13} opacity={pulse} tone="elevated" />

        <View style={styles.forecastSkeletonBox}>
          <View style={styles.barsRow}>
            {[36, 48, 66, 78, 54, 34].map((h, i) => (
              <View key={i} style={styles.barCol}>
                <SkeletonBlock width={22} height={h * 0.55} radius={6} opacity={pulse} />
                <SkeletonBlock width={28} height={9} radius={4} opacity={pulse} tone="elevated" />
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* 2. Karşılama & Seri Rozeti İskeleti */}
      <View style={styles.greetingRow}>
        <View style={[styles.colGapSm, { flex: 1 }]}>
          <SkeletonBlock width="68%" height={26} radius={8} opacity={pulse} />
          <SkeletonBlock width="90%" height={13} radius={6} opacity={pulse} tone="elevated" />
        </View>
        <SkeletonBlock width={112} height={30} radius={999} opacity={pulse} tone="elevated" />
      </View>

      {/* 3. Kalan Seans & Halka Kartı İskeleti */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={[styles.colGapMd, { flex: 1, marginRight: 14 }]}>
            <SkeletonBlock width={120} height={24} radius={999} opacity={pulse} tone="elevated" />
            <SkeletonBlock width="92%" height={20} radius={7} opacity={pulse} />
            <SkeletonBlock width="74%" height={13} radius={6} opacity={pulse} tone="elevated" />
            <SkeletonBlock width={110} height={15} radius={6} opacity={pulse} />
          </View>
          <SkeletonBlock width={114} height={114} radius={57} opacity={pulse} />
        </View>
      </View>

      {/* 4. Günlük Toparlanma & Su Halkası İskeleti */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.rowGap}>
            <SkeletonBlock width={34} height={34} radius={11} opacity={pulse} />
            <View style={styles.colGapSm}>
              <SkeletonBlock width={150} height={16} radius={6} opacity={pulse} />
              <SkeletonBlock width={185} height={11} radius={5} opacity={pulse} tone="elevated" />
            </View>
          </View>
          <SkeletonBlock width={68} height={26} radius={999} opacity={pulse} tone="elevated" />
        </View>

        <View style={styles.rowGapMd}>
          <SkeletonBlock width={96} height={96} radius={48} opacity={pulse} />
          <View style={[styles.colGapMd, { flex: 1 }]}>
            <SkeletonBlock width="58%" height={20} radius={7} opacity={pulse} />
            <SkeletonBlock width="95%" height={12} radius={5} opacity={pulse} tone="elevated" />
            <SkeletonBlock width="100%" height={38} radius={12} opacity={pulse} />
          </View>
        </View>

        <View style={styles.energyRow}>
          <SkeletonBlock width="31%" height={34} radius={10} opacity={pulse} tone="elevated" />
          <SkeletonBlock width="31%" height={34} radius={10} opacity={pulse} tone="elevated" />
          <SkeletonBlock width="31%" height={34} radius={10} opacity={pulse} tone="elevated" />
        </View>
      </View>

      {/* 5. Yaklaşan Seans Kartı İskeleti */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <SkeletonBlock width={140} height={17} radius={6} opacity={pulse} />
          <SkeletonBlock width={94} height={24} radius={999} opacity={pulse} tone="elevated" />
        </View>
        <SkeletonBlock width="78%" height={19} radius={7} opacity={pulse} />
        <SkeletonBlock width="100%" height={56} radius={14} opacity={pulse} tone="elevated" />
      </View>
    </ScrollView>
  );
});

export interface LazyScreenFallbackProps {
  label?: string;
  dark?: boolean;
}

/**
 * React.lazy + Suspense geçişlerinde kullanılan Daylight Wellness uyumlu yükleme göstergesi.
 */
export const LazyScreenFallback = React.memo(function LazyScreenFallback({
  label = 'Stüdyo ekranı hazırlanıyor...',
  dark = false,
}: LazyScreenFallbackProps) {
  return (
    <View style={[styles.lazyContainer, dark && styles.lazyContainerDark]}>
      <View style={[styles.lazyCard, dark && styles.lazyCardDark]}>
        <ActivityIndicator
          size="small"
          color={dark ? COLORS.primaryMetallic : COLORS.primary}
        />
        <Text style={[styles.lazyLabel, dark && styles.lazyLabelDark]}>{label}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 14,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowGapMd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  colGapSm: {
    gap: 6,
  },
  colGapMd: {
    gap: 9,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
  forecastSkeletonBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 60,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  energyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  lazyContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lazyContainerDark: {
    backgroundColor: '#0B111E',
  },
  lazyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    ...CARD_SHADOW,
  },
  lazyCardDark: {
    backgroundColor: '#131C2E',
    borderColor: '#23324F',
  },
  lazyLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  lazyLabelDark: {
    color: '#CBD5E1',
  },
});
