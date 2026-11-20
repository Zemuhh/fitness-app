import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { TrendingUp, Users } from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import { ClubLiveStatus, HourlyForecastItem } from '@/types/fitness';

export interface LiveGymOccupancyCardProps {
  refreshTrigger?: number;
}

const FALLBACK_LIVE_STATUS: ClubLiveStatus = {
  occupancy_pct: 36,
  active_members_count: 14,
  active_members_label: '14 Kişi',
  capacity: 40,
  status_level: 'low',
  status_badge: '🟢 Salon Şu An Ferah - Antrenman İçin Harika Saat',
  hourly_forecast: [
    { hour: '16:00', pct: 36 },
    { hour: '17:00', pct: 45 },
    { hour: '18:00', pct: 75 },
    { hour: '19:00', pct: 90 },
    { hour: '20:00', pct: 55 },
    { hour: '21:00', pct: 30 },
  ],
};

function getOccupancyPalette(pct: number) {
  if (pct >= 80) {
    return {
      accent: '#DC2626',
      bar: '#EF4444',
      softBg: '#FEF2F2',
      softBorder: '#FECACA',
      dot: '#EF4444',
      halo: 'rgba(239, 68, 68, 0.24)',
    };
  }
  if (pct >= 55) {
    return {
      accent: '#B45309',
      bar: '#F59E0B',
      softBg: '#FFFBEB',
      softBorder: '#FDE68A',
      dot: '#F59E0B',
      halo: 'rgba(245, 158, 11, 0.24)',
    };
  }
  return {
    accent: '#047857',
    bar: '#10B981',
    softBg: '#ECFDF5',
    softBorder: '#A7F3D0',
    dot: '#10B981',
    halo: 'rgba(16, 185, 129, 0.26)',
  };
}

function getBarColor(pct: number): string {
  if (pct >= 80) return '#EF4444';
  if (pct >= 55) return '#F59E0B';
  return '#10B981';
}

export function LiveGymOccupancyCard({ refreshTrigger = 0 }: LiveGymOccupancyCardProps) {
  const [liveStatus, setLiveStatus] = useState<ClubLiveStatus>(FALLBACK_LIVE_STATUS);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.85,
            duration: 1100,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1100,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.75,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseOpacity, pulseScale]);

  const fetchLiveStatus = useCallback(async () => {
    try {
      const res = await apiRequest<ClubLiveStatus>('/club/live-status');
      if (res && typeof res.occupancy_pct === 'number') {
        setLiveStatus({
          ...FALLBACK_LIVE_STATUS,
          ...res,
          hourly_forecast:
            Array.isArray(res.hourly_forecast) && res.hourly_forecast.length > 0
              ? res.hourly_forecast
              : FALLBACK_LIVE_STATUS.hourly_forecast,
        });
      }
    } catch {
      // Yedek veri ile kesintisiz gösterime devam et
    }
  }, []);

  useEffect(() => {
    fetchLiveStatus();
  }, [fetchLiveStatus, refreshTrigger]);

  const clampedPct = Math.max(0, Math.min(100, Math.round(liveStatus.occupancy_pct)));
  const palette = useMemo(() => getOccupancyPalette(clampedPct), [clampedPct]);

  const activeMembersText = useMemo(() => {
    if (liveStatus.active_members_label && liveStatus.active_members_label.trim().length > 0) {
      return liveStatus.active_members_label;
    }
    return `${liveStatus.active_members_count ?? 14} Kişi`;
  }, [liveStatus.active_members_count, liveStatus.active_members_label]);

  const currentHourPrefix = useMemo(() => {
    const h = new Date().getHours();
    return `${String(h).padStart(2, '0')}:00`;
  }, []);

  const forecastItems: HourlyForecastItem[] = useMemo(() => {
    return Array.isArray(liveStatus.hourly_forecast) && liveStatus.hourly_forecast.length > 0
      ? liveStatus.hourly_forecast
      : FALLBACK_LIVE_STATUS.hourly_forecast;
  }, [liveStatus.hourly_forecast]);

  return (
    <View style={styles.card}>
      {/* Üst Satır: Canlı Yeşil Nokta + Başlık + İçerideki Üye Sayısı */}
      <View style={styles.topHeaderRow}>
        <View style={styles.titleLeftGroup}>
          <View style={styles.liveDotContainer}>
            <Animated.View
              style={[
                styles.livePulseHalo,
                {
                  backgroundColor: '#10B981',
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.liveCoreDot} />
          </View>
          <View>
            <Text style={styles.liveEyebrow}>CANLI SALON RADARI</Text>
            <Text style={styles.cardTitle}>Canlı Kulüp Yoğunluğu</Text>
          </View>
        </View>

        <View style={styles.activeMembersPill}>
          <Users size={13} color="#0D9488" />
          <Text style={styles.activeMembersPillText}>İçeride {activeMembersText}</Text>
        </View>
      </View>

      {/* Ana Metrik Satırı: %36 Doluluk + İlerleme Çubuğu */}
      <View style={styles.metricsRow}>
        <View style={styles.pctBigBox}>
          <Text style={[styles.pctBigValue, { color: palette.accent }]}>
            %{clampedPct}
          </Text>
          <Text style={styles.pctCaption}>Anlık Doluluk</Text>
        </View>

        <View style={styles.meterCol}>
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                {
                  width: `${Math.max(6, clampedPct)}%`,
                  backgroundColor: palette.bar,
                },
              ]}
            />
          </View>
          <View style={styles.meterLegendRow}>
            <Text style={styles.meterLegendText}>Ferah (%0-54)</Text>
            <Text style={styles.meterLegendText}>Dengeli (%55-79)</Text>
            <Text style={styles.meterLegendText}>Yoğun (%80+)</Text>
          </View>
        </View>
      </View>

      {/* Durum Rozeti */}
      <View
        style={[
          styles.statusBadgeBox,
          {
            backgroundColor: palette.softBg,
            borderColor: palette.softBorder,
          },
        ]}
      >
        <Text style={[styles.statusBadgeText, { color: palette.accent }]}>
          {liveStatus.status_badge}
        </Text>
      </View>

      {/* Saatlik Mini Dikey Çubuk Grafiği */}
      <View style={styles.forecastContainer}>
        <View style={styles.forecastHeaderRow}>
          <View style={styles.forecastTitleWrap}>
            <TrendingUp size={13} color={COLORS.textSecondary} />
            <Text style={styles.forecastTitle}>Saatlik Yoğunluk Tahmini</Text>
          </View>
          <Text style={styles.forecastHint}>En rahat saatini seç</Text>
        </View>

        <View style={styles.barsRow}>
          {forecastItems.map((item) => {
            const pct = Math.max(8, Math.min(100, Math.round(item.pct)));
            const barColor = getBarColor(pct);
            const isNow = item.hour === currentHourPrefix;

            return (
              <View key={item.hour} style={styles.barColumn}>
                <Text
                  style={[
                    styles.barPctLabel,
                    isNow && { color: barColor, fontWeight: '800' },
                  ]}
                >
                  %{Math.round(item.pct)}
                </Text>

                <View
                  style={[
                    styles.barTrackVertical,
                    isNow && styles.barTrackVerticalActive,
                  ]}
                >
                  <View
                    style={[
                      styles.barFillVertical,
                      {
                        height: `${pct}%`,
                        backgroundColor: barColor,
                        opacity: isNow ? 1 : 0.85,
                      },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.barHourLabel,
                    isNow && styles.barHourLabelActive,
                  ]}
                >
                  {item.hour}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    gap: 13,
    ...CARD_SHADOW,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  liveDotContainer: {
    width: 28,
    height: 28,
    borderRadius: 99,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePulseHalo: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 99,
  },
  liveCoreDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: '#10B981',
  },
  liveEyebrow: {
    fontFamily: FONTS.sans,
    color: '#0D9488',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  cardTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  activeMembersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  activeMembersPillText: {
    fontFamily: FONTS.sans,
    color: '#0F766E',
    fontSize: 11.5,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pctBigBox: {
    minWidth: 82,
  },
  pctBigValue: {
    fontFamily: FONTS.serif,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 35,
    letterSpacing: -0.5,
  },
  pctCaption: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  meterCol: {
    flex: 1,
    gap: 6,
  },
  meterTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
  },
  meterLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meterLegendText: {
    fontFamily: FONTS.sans,
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadgeBox: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  forecastContainer: {
    backgroundColor: '#FAF8F5',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  forecastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forecastTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  forecastTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  forecastHint: {
    fontFamily: FONTS.sans,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    paddingTop: 2,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barPctLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  barTrackVertical: {
    width: '100%',
    maxWidth: 26,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#EAE4DA',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: 2,
  },
  barTrackVerticalActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  barFillVertical: {
    width: '100%',
    borderRadius: 6,
  },
  barHourLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
  },
  barHourLabelActive: {
    color: '#047857',
    fontWeight: '800',
  },
});
