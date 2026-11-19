import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS, FONTS } from '@/theme/colors';

interface ActivityRingProps {
  remaining: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

/**
 * ERYA Pilates Yuvarlak 3000K Altın Hale Ayna İlerleme Halkası
 * Cadillac alanındaki ikonik arkadan aydınlatmalı yuvarlak altın LED aynadan ilham alır.
 */
export function ActivityRing({
  remaining,
  total,
  size = 132,
  strokeWidth = 11,
}: ActivityRingProps) {
  const safeTotal = total > 0 ? total : 1;
  const clampedRatio = Math.max(0, Math.min(1, total > 0 ? remaining / safeTotal : 0));
  const isLow = remaining <= 2;

  const pulseAnim = useRef(new Animated.Value(0.86)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.84,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const center = size / 2;
  const radius = (size - strokeWidth * 1.95) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clampedRatio);

  const gradId = isLow ? 'eryaRoseAmberGrad' : 'eryaChampagneGoldGrad';

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {/* 3000K Sıcak Altın Ayna Halesi */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.softHalo,
          {
            width: size - 6,
            height: size - 6,
            borderRadius: (size - 6) / 2,
            backgroundColor: isLow
              ? 'rgba(248, 236, 238, 0.55)'
              : 'rgba(250, 240, 215, 0.52)',
            borderColor: isLow ? COLORS.secondaryBorder : COLORS.primaryBorder,
            opacity: pulseAnim,
          },
        ]}
      />

      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="eryaChampagneGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#E2BE68" />
            <Stop offset="50%" stopColor="#C9A452" />
            <Stop offset="100%" stopColor="#9A7328" />
          </LinearGradient>
          <LinearGradient id="eryaRoseAmberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={COLORS.secondary} />
            <Stop offset="100%" stopColor={COLORS.warningText} />
          </LinearGradient>
        </Defs>

        {/* Sıcak Mermer/Taş İz Halkası */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={COLORS.track}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* İnce 3000K Altın Hale Yansıması */}
        {clampedRatio > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={isLow ? COLORS.secondaryLight : COLORS.primaryLight}
            strokeWidth={strokeWidth + 4}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
            fill="none"
          />
        )}

        {/* Ana Şampanya Altını İlerleme Halkası */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${center} ${center})`}
          fill="none"
        />
      </Svg>

      {/* Merkez Sayısal Gösterge */}
      <View style={styles.centerContent} pointerEvents="none">
        <View style={styles.ratioRow}>
          <Text
            style={[
              styles.remainingText,
              { color: isLow ? COLORS.secondary : COLORS.espresso },
            ]}
          >
            {remaining}
          </Text>
          <Text style={styles.totalText}>/{total}</Text>
        </View>
        <Text
          style={[
            styles.captionText,
            { color: isLow ? COLORS.secondary : COLORS.primary },
          ]}
        >
          KALAN SEANS
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  softHalo: {
    position: 'absolute',
    borderWidth: 1,
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  remainingText: {
    fontFamily: FONTS.serif,
    fontSize: 31,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  totalText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  captionText: {
    fontFamily: FONTS.sans,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 2,
  },
});
