import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { COLORS } from '@/theme/colors';
import { AvailableSession, MemberDashboardData } from '@/types/fitness';
import { formatTurkishDateLabel, getTodayIso, getTomorrowIso } from '@/utils/dateHelpers';

interface CalendarPillItem {
  key: string;
  topLabel: string;
  bottomLabel: string;
  count: number;
}

interface Props {
  data: MemberDashboardData;
  refreshing: boolean;
  onRefresh: () => void;
  onBookSession: (session: AvailableSession) => Promise<void>;
  onCancelBySession: (session: AvailableSession) => Promise<void>;
  busySessionId: number | null;
}

export function MemberBookingTab({
  data,
  refreshing,
  onRefresh,
  onBookSession,
  onCancelBySession,
  busySessionId,
}: Props) {
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  const [selectedKey, setSelectedKey] = useState<string>(todayIso);

  const calendarPills: CalendarPillItem[] = useMemo(() => {
    const uniqueDates = new Set<string>([todayIso, tomorrowIso]);
    data.available_sessions.forEach((s) => uniqueDates.add(s.date));
    const sortedDates = Array.from(uniqueDates).sort();

    const datePills: CalendarPillItem[] = sortedDates.map((iso) => {
      const fmt = formatTurkishDateLabel(iso);
      const count = data.available_sessions.filter((s) => s.date === iso).length;
      return {
        key: iso,
        topLabel: fmt.primary,
        bottomLabel: fmt.secondary,
        count,
      };
    });

    datePills.push({
      key: 'all',
      topLabel: 'Tümü',
      bottomLabel: `${data.available_sessions.length} Seans`,
      count: data.available_sessions.length,
    });

    return datePills;
  }, [data.available_sessions, todayIso, tomorrowIso]);

  const filteredSessions = useMemo(() => {
    if (selectedKey === 'all') return data.available_sessions;
    return data.available_sessions.filter((s) => s.date === selectedKey);
  }, [data.available_sessions, selectedKey]);

  const remainingCredits = data.active_package?.remaining_credits ?? 0;
  const totalCredits = data.active_package?.total_credits ?? 0;

  const handleSelectDay = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedKey(key);
  };

  const handleBookPress = async (session: AvailableSession) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await onBookSession(session);
  };

  const handleCancelPress = async (session: AvailableSession) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await onCancelBySession(session);
  };

  return (
    <View style={styles.container}>
      {/* Yatay Hap (Pill) Calendar Strip */}
      <View style={styles.calendarStripWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendarStripContent}
        >
          {calendarPills.map((pill) => {
            const active = selectedKey === pill.key;
            return (
              <TouchableOpacity
                key={pill.key}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => handleSelectDay(pill.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.dayPillTop, active && styles.dayPillTopActive]}>
                  {pill.topLabel}
                </Text>
                <Text style={[styles.dayPillBottom, active && styles.dayPillBottomActive]}>
                  {pill.bottomLabel}
                </Text>
                <View style={[styles.dayDotBadge, active && styles.dayDotBadgeActive]}>
                  <Text style={[styles.dayDotText, active && styles.dayDotTextActive]}>
                    {pill.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Kredi Durum Şeridi */}
      <View style={styles.creditStrip}>
        <View style={styles.creditStripLeft}>
          <Sparkles size={14} color={COLORS.accentVolt} />
          <Text style={styles.creditStripLabel}>Kullanılabilir Ders Bakiyesi</Text>
        </View>
        <View
          style={[
            styles.creditCountBadge,
            remainingCredits <= 2 && styles.creditCountBadgeWarn,
          ]}
        >
          <Text
            style={[
              styles.creditCountText,
              remainingCredits <= 2 && { color: COLORS.warning },
            ]}
          >
            {remainingCredits}/{totalCredits} Ders
          </Text>
        </View>
      </View>

      {/* Aciliyet Hissi Veren Ders Kartları */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {filteredSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Calendar size={30} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Seçili günde açık ders yok</Text>
            <Text style={styles.emptySub}>
              Üstteki takvim şeridinden diğer günleri veya &ldquo;Tümü&rdquo; sekmesini seçebilirsiniz.
            </Text>
          </View>
        ) : (
          filteredSessions.map((session) => {
            const computedSpots =
              typeof session.remaining_spots === 'number'
                ? session.remaining_spots
                : Math.max(0, session.capacity - session.current_enrolled);
            const isFull =
              session.is_full ||
              session.current_enrolled >= session.capacity ||
              computedSpots <= 0;
            const isLastSpot = !isFull && computedSpots === 1;
            const isBooked = session.is_booked_by_member;
            const isBusy = busySessionId === session.id;

            const fillRatio =
              session.capacity > 0
                ? Math.max(0, Math.min(1, session.current_enrolled / session.capacity))
                : 1;

            const accentColor = isFull
              ? COLORS.danger
              : isLastSpot
              ? COLORS.warning
              : COLORS.primary;

            const dateLabel = formatTurkishDateLabel(session.date);

            return (
              <View key={session.id} style={styles.sessionCard}>
                {/* Sol Kenar Dikey Aciliyet Renk Şeridi */}
                <View style={[styles.leftAccentBar, { backgroundColor: accentColor }]} />

                <View style={styles.cardInner}>
                  {/* Üst Satır: Saat & Kontenjan + Scarcity Bar */}
                  <View style={styles.topRow}>
                    <View style={styles.timeBadge}>
                      <Clock size={14} color={COLORS.primary} />
                      <Text style={styles.timeText}>{session.start_time}</Text>
                      <Text style={styles.timeEndText}>- {session.end_time}</Text>
                    </View>

                    <View style={styles.scarcityCol}>
                      <View style={styles.capacityHeaderRow}>
                        <Users size={12} color={accentColor} />
                        <Text style={[styles.capacityText, { color: accentColor }]}>
                          {session.current_enrolled}/{session.capacity}{' '}
                          {isFull ? 'Dolu' : 'Kontenjan'}
                        </Text>
                      </View>
                      {/* İnce Doluluk Çubuğu (Scarcity Progress Bar) */}
                      <View style={styles.scarcityTrack}>
                        <View
                          style={[
                            styles.scarcityFill,
                            {
                              width: `${fillRatio * 100}%`,
                              backgroundColor: accentColor,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Son 1 Kişilik Yer Aciliyet Rozeti */}
                  {isLastSpot && (
                    <View style={styles.lastSpotBadge}>
                      <Flame size={13} color={COLORS.warning} />
                      <Text style={styles.lastSpotBadgeText}>🔥 Son 1 Kişilik Yer!</Text>
                    </View>
                  )}

                  {/* Ders Başlığı & Eğitmen Bilgisi */}
                  <Text style={styles.sessionTitle}>{session.title}</Text>

                  <View style={styles.metaRow}>
                    <View style={styles.trainerChip}>
                      <Dumbbell size={13} color={COLORS.trainerAccent} />
                      <Text style={styles.trainerText}>{session.trainer_name}</Text>
                    </View>
                    <Text style={styles.dateSubText}>{dateLabel.full}</Text>
                  </View>

                  {/* Aksiyon Butonu */}
                  {isBooked ? (
                    <TouchableOpacity
                      style={[styles.bookedCancelBtn, isBusy && { opacity: 0.65 }]}
                      disabled={isBusy}
                      onPress={() => handleCancelPress(session)}
                      activeOpacity={0.82}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color={COLORS.danger} />
                      ) : (
                        <>
                          <CheckCircle2 size={15} color={COLORS.danger} />
                          <Text style={styles.bookedCancelBtnText}>
                            ✓ Kayıtlısın (İptal Et)
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : isFull ? (
                    <View style={styles.fullDisabledBtn}>
                      <Text style={styles.fullDisabledBtnText}>Kontenjan Dolu</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.bookNowBtn,
                        (isBusy || remainingCredits <= 0) && styles.bookNowBtnDisabled,
                      ]}
                      disabled={isBusy || remainingCredits <= 0}
                      onPress={() => handleBookPress(session)}
                      activeOpacity={0.86}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color="#090D16" />
                      ) : (
                        <Text style={styles.bookNowBtnText}>
                          {remainingCredits <= 0 ? 'Kredi Yetersiz' : 'Hemen Kayıt Ol'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  calendarStripWrapper: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  calendarStripContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 6,
  },
  dayPillTop: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dayPillTopActive: {
    color: '#090D16',
  },
  dayPillBottom: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  dayPillBottomActive: {
    color: 'rgba(9, 13, 22, 0.78)',
  },
  dayDotBadge: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  dayDotBadgeActive: {
    backgroundColor: 'rgba(9, 13, 22, 0.18)',
  },
  dayDotText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dayDotTextActive: {
    color: '#090D16',
  },
  creditStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  creditStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  creditStripLabel: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  creditCountBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.30)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  creditCountBadgeWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  creditCountText: {
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 34,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    paddingVertical: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  leftAccentBar: {
    width: 5,
  },
  cardInner: {
    flex: 1,
    padding: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  timeEndText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scarcityCol: {
    minWidth: 108,
    alignItems: 'flex-end',
    gap: 5,
  },
  capacityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  capacityText: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scarcityTrack: {
    width: 108,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  scarcityFill: {
    height: '100%',
    borderRadius: 999,
  },
  lastSpotBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
  },
  lastSpotBadgeText: {
    color: COLORS.warning,
    fontSize: 11.5,
    fontWeight: '800',
  },
  sessionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  trainerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trainerText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  dateSubText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  bookNowBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  bookNowBtnDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
  },
  bookNowBtnText: {
    color: '#090D16',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  bookedCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    borderRadius: 12,
    paddingVertical: 12,
  },
  bookedCancelBtnText: {
    color: COLORS.danger,
    fontSize: 13.5,
    fontWeight: '800',
  },
  fullDisabledBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.30)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  fullDisabledBtnText: {
    color: COLORS.danger,
    fontSize: 13.5,
    fontWeight: '800',
  },
});
