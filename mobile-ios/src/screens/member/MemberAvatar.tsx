import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, FONTS } from '@/theme/colors';

interface MemberAvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  borderRadius?: number;
  accentColor?: string;
}

export function getInitials(fullName: string): string {
  const parts = (fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'ER';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase('tr-TR');
}

export function MemberAvatar({
  uri,
  name,
  size = 52,
  borderRadius = 16,
  accentColor = COLORS.secondary,
}: MemberAvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const showImage = Boolean(uri && uri.trim().length > 0 && !failed);
  const initials = getInitials(name);
  const fontSize = Math.max(12, Math.round(size * 0.34));

  const isPrimary = accentColor === COLORS.primary;
  const isWarning = accentColor === COLORS.warning || accentColor === COLORS.warningText;

  const containerBg = isPrimary
    ? COLORS.primaryLight
    : isWarning
    ? COLORS.warningBg
    : COLORS.secondaryLight;

  const containerBorder = isPrimary
    ? COLORS.primaryBorder
    : isWarning
    ? COLORS.warningBorder
    : COLORS.secondaryBorder;

  const initialsColor = isPrimary
    ? COLORS.primary
    : isWarning
    ? COLORS.warningText
    : COLORS.secondary;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          borderColor: containerBorder,
          backgroundColor: containerBg,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={{
            width: size - 3,
            height: size - 3,
            borderRadius: Math.max(4, borderRadius - 1.5),
          }}
          contentFit="cover"
          transition={200}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize, color: initialsColor }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

export function getCategoryVisuals(category?: string | null): {
  color: string;
  bg: string;
  border: string;
  label: string;
} {
  const normalized = (category || 'Reformer').trim();
  const lower = normalized.toLocaleLowerCase('tr-TR');

  if (lower.includes('cadillac') || lower.includes('tower')) {
    return {
      color: COLORS.secondary,
      bg: COLORS.secondaryLight,
      border: COLORS.secondaryBorder,
      label: normalized,
    };
  }
  if (lower.includes('düet') || lower.includes('duet') || lower.includes('trio')) {
    return {
      color: COLORS.walnut,
      bg: COLORS.surfaceElevated,
      border: COLORS.borderStrong,
      label: normalized,
    };
  }
  if (
    lower.includes('bireysel') ||
    lower.includes('birebir') ||
    lower.includes('özel') ||
    lower.includes('pt')
  ) {
    return {
      color: COLORS.secondary,
      bg: COLORS.secondaryLight,
      border: COLORS.secondaryBorder,
      label: normalized,
    };
  }
  if (lower.includes('reformer') || lower.includes('pilates')) {
    return {
      color: COLORS.primary,
      bg: COLORS.primaryLight,
      border: COLORS.primaryBorder,
      label: normalized,
    };
  }
  return {
    color: COLORS.primary,
    bg: COLORS.primaryLight,
    border: COLORS.primaryBorder,
    label: normalized,
  };
}

export function getAnnouncementVisuals(tag?: string | null): {
  color: string;
  bg: string;
  border: string;
  label: string;
} {
  const normalized = (tag || 'Stüdyo Haberleri').trim();
  const lower = normalized.toLocaleLowerCase('tr-TR');

  if (lower.includes('kampanya') || lower.includes('multisport')) {
    return {
      color: COLORS.primary,
      bg: COLORS.primaryLight,
      border: COLORS.primaryBorder,
      label: normalized,
    };
  }
  if (
    lower.includes('kural') ||
    lower.includes('bilgi') ||
    lower.includes('bakım') ||
    lower.includes('bakim')
  ) {
    return {
      color: COLORS.secondary,
      bg: COLORS.secondaryLight,
      border: COLORS.secondaryBorder,
      label: normalized,
    };
  }
  return {
    color: COLORS.walnut,
    bg: COLORS.surfaceElevated,
    border: COLORS.borderStrong,
    label: normalized,
  };
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  initials: {
    fontFamily: FONTS.sans,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
});
