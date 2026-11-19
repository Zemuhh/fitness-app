import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS } from '@/theme/colors';

interface ActivityRingProps {
  remaining: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function ActivityRing({
  remaining,
  total,
  size = 136,
  strokeWidth = 12,
}: ActivityRingProps) {
  const safeTotal = total > 0 ? total : 1;
  const clampedRatio = Math.max(0, Math.min(1, total > 0 ? remaining / safeTotal : 0));
  const isLow = remaining <= 2;

  const pulseAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.82,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const center = size / 2;
  const radius = (size - strokeWidth * 1.8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clampedRatio);

  const glowColor = isLow ? COLORS.warning : COLORS.primary;
  const gradId = isLow ? 'amberRingGrad' : 'voltRingGrad';

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      {/* Yumuşak Neon Parlama Halkası */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.neonHalo,
          {
            width: size - 10,
            height: size - 10,
            borderRadius: (size - 10) / 2,
            shadowColor: isLow ? COLORS.warning : COLORS.accentVolt,
            borderColor: isLow
              ? 'rgba(245, 158, 11, 0.22)'
              : 'rgba(163, 230, 53, 0.20)',
            opacity: pulseAnim,
          },
        ]}
      />

      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="voltRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={COLORS.primary} />
            <Stop offset="100%" stopColor={COLORS.accentVolt} />
          </LinearGradient>
          <LinearGradient id="amberRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={COLORS.warning} />
            <Stop offset="100%" stopColor="#FB923C" />
          </LinearGradient>
        </Defs>

        {/* Arka Plan İz Halkası */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Dış Parlama Katmanı */}
        {clampedRatio > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={glowColor}
            strokeOpacity={0.26}
            strokeWidth={strokeWidth + 5}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            rotation="-90"
            origin={`${center}, ${center}`}
            fill="none"
          />
        )}

        {/* Ana İlerleme Halkası */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${center}, ${center}`}
          fill="none"
        />
      </Svg>

      {/* Merkez Atletik Sayısal Gösterge */}
      <View style={styles.centerContent} pointerEvents="none">
        <View style={styles.ratioRow}>
          <Text
            style={[
              styles.remainingText,
              { color: isLow ? COLORS.warning : COLORS.textPrimary },
            ]}
          >
            {remaining}
          </Text>
          <Text style={styles.totalText}> / {total}</Text>
        </View>
        <Text
          style={[
            styles.captionText,
            { color: isLow ? COLORS.warning : COLORS.accentVolt },
          ]}
        >
          KALAN DERS
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
  neonHalo: {
    position: 'absolute',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
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
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  totalText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  captionText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 3,
  },
});
