import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { COLORS, FONTS } from '@/theme/colors';

interface EryaBrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  compact?: boolean;
  lightText?: boolean;
}

/**
 * ERYA PİLATES REFORMER — Özel Geometrik Altın Üçgen (Delta) & Zarif Denge/Lotus Logosu
 * Stüdyonun dış cephesindeki 3B altın tabela ve iç mekandaki kemerli ayna/duvar armasından uyarlanmıştır.
 */
export function EryaBrandLogo({
  size = 36,
  showWordmark = false,
  compact = false,
  lightText = false,
}: EryaBrandLogoProps) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.emblemHalo,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.34),
            backgroundColor: lightText
              ? 'rgba(250, 240, 215, 0.14)'
              : COLORS.primaryLight,
            borderColor: lightText
              ? 'rgba(229, 193, 108, 0.45)'
              : COLORS.primaryBorder,
          },
        ]}
      >
        <Svg width={size * 0.68} height={size * 0.68} viewBox="0 0 48 48">
          <Defs>
            <LinearGradient id="eryaGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#E2BE68" />
              <Stop offset="50%" stopColor="#C9A452" />
              <Stop offset="100%" stopColor="#9A7328" />
            </LinearGradient>
          </Defs>
          {/* Kemerli Ayna / Hale Çember İzi */}
          <Circle
            cx="24"
            cy="25"
            r="20"
            stroke="url(#eryaGoldGrad)"
            strokeWidth="1.4"
            strokeOpacity="0.45"
            fill="none"
          />
          {/* Geometrik Altın Delta Üçgeni (ERYA 'A' & Denge Formu) */}
          <Path
            d="M24 6 L41 38 H7 Z"
            stroke="url(#eryaGoldGrad)"
            strokeWidth="2.8"
            strokeLinejoin="round"
            fill="none"
          />
          {/* İç Zarif Lotus / Pilates Denge Silüeti */}
          <Path
            d="M24 17 C21.2 22.5, 19.5 27.5, 24 33 C28.5 27.5, 26.8 22.5, 24 17 Z"
            fill="url(#eryaGoldGrad)"
          />
          <Path
            d="M15.5 34.5 C18.5 30.5, 21.5 29.5, 24 33 C26.5 29.5, 29.5 30.5, 32.5 34.5"
            stroke="url(#eryaGoldGrad)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </View>

      {showWordmark && (
        <View style={styles.wordmarkCol}>
          <Text
            style={[
              styles.eryaSerif,
              compact && styles.eryaSerifCompact,
              lightText && { color: '#FAF0D7' },
            ]}
          >
            ERYA
          </Text>
          <Text
            style={[
              styles.pilatesSans,
              compact && styles.pilatesSansCompact,
              lightText && { color: '#E5CB90' },
            ]}
          >
            PİLATES REFORMER
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  emblemHalo: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  wordmarkCol: {
    justifyContent: 'center',
  },
  eryaSerif: {
    fontFamily: FONTS.serif,
    color: COLORS.espresso,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 2.6,
    lineHeight: 21,
  },
  eryaSerifCompact: {
    fontSize: 16,
    letterSpacing: 2.2,
    lineHeight: 18,
  },
  pilatesSans: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginTop: 1,
  },
  pilatesSansCompact: {
    fontSize: 7.5,
    letterSpacing: 1.7,
  },
});
