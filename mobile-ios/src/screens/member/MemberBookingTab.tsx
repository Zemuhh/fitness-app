import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
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
  Filter,
  Flame,
  Hourglass,
  MapPin,
  RotateCcw,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react-native';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { AvailableSession, MemberDashboardData } from '@/types/fitness';
import { formatTurkishDateLabel, getTodayIso, getTomorrowIso } from '@/utils/dateHelpers';
import { getCategoryVisuals, MemberAvatar } from '@/screens/member/MemberAvatar';

interface CalendarPillItem {
  key: string;
  topLabel: string;
  bottomLabel: string;
  count: number;
}

const CATEGORY_FILTERS = [
  'Tümü',
  'Grup Reformer',
  'Bireysel Reformer',
  'Cadillac & Tower',
  'Düet & Trio',
] as const;

interface TrainerFilterOption {
  id: number;
  name: string;
  avatar_url?: string | null;
}

interface Props {
  data: MemberDashboardData;
  refreshing: boolean;
  onRefresh: () => void;
  onBookSession: (session: AvailableSession) => Promise<void>;
  onCancelBySession: (session: AvailableSession) => Promise<void>;
  onJoinWaitlist: (session: AvailableSession) => Promise<void>;
  onCancelWaitlist: (session: AvailableSession) => Promise<void>;
  onOpenPackageRenew: () => void;
  onOpenTrainerDetail: (trainerId: number) => void;
  busySessionId: number | null;
}

interface SessionCardItemProps {
  session: AvailableSession;
  isBusy: boolean;
  remainingCredits: number;
  onBookSession: (session: AvailableSession) => Promise<void>;
  onCancelBySession: (session: AvailableSession) => Promise<void>;
  onJoinWaitlist: (session: AvailableSession) => Promise<void>;
  onCancelWaitlist: (session: AvailableSession) => Promise<void>;
  onOpenPackageRenew: () => void;
  onOpenTrainerDetail: (trainerId: number) => void;
}

const SessionCardItem = React.memo(function SessionCardItem({
  session,
  isBusy,
  remainingCredits,
  onBookSession,
  onCancelBySession,
  onJoinWaitlist,
  onCancelWaitlist,
  onOpenPackageRenew,
  onOpenTrainerDetail,
}: SessionCardItemProps) {
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
  const isWaitlisted = Boolean(session.is_waitlisted_by_member);

  const fillRatio =
    session.capacity > 0
      ? Math.max(0, Math.min(1, session.current_enrolled / session.capacity))
      : 1;

  const statusColor = isBooked
    ? COLORS.primary
    : isFull || isLastSpot || isWaitlisted
    ? COLORS.warningText
    : COLORS.primary;

  const barFillColor = isBooked
    ? COLORS.primary
    : isFull || isLastSpot || isWaitlisted
    ? COLORS.warning
    : COLORS.primary;

  const catVis = getCategoryVisuals(session.category);
  const dateLabel = formatTurkishDateLabel(session.date);

  return (
    <View style={styles.sessionCard}>
      {/* Üst Satır: Saat & Kategori Rozeti */}
      <View style={styles.topRow}>
        <View style={styles.timeBadge}>
          <Clock size={14} color={COLORS.primary} />
          <Text style={styles.timeText}>{session.start_time}</Text>
          <Text style={styles.timeEndText}>- {session.end_time}</Text>
        </View>

        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: catVis.bg, borderColor: catVis.border },
          ]}
        >
          <Text style={[styles.categoryBadgeText, { color: catVis.color }]}>
            {catVis.label}
          </Text>
        </View>
      </View>

      {/* Son 1 Kişilik Yer veya Yedek Liste Bilgi Rozeti */}
      {isLastSpot && !isBooked ? (
        <View style={styles.lastSpotBadge}>
          <Flame size={13} color={COLORS.warningText} />
          <Text style={styles.lastSpotBadgeText}>🔥 Son 1 Kişilik Yer!</Text>
        </View>
      ) : isFull && !isBooked ? (
        <View style={styles.waitlistInfoBadge}>
          <Hourglass size={12} color={COLORS.warningText} />
          <Text style={styles.waitlistInfoBadgeText}>
            Kontenjan Dolu
            {(session.waitlist_count ?? 0) > 0
              ? ` • ${session.waitlist_count} kişi yedek listede`
              : ' • Yedek liste açık'}
          </Text>
        </View>
      ) : null}

      {/* Ders Başlığı */}
      <Text style={styles.sessionTitle}>{session.title}</Text>

      {/* Eğitmen & Stüdyo & Tarih Satırı */}
      <View style={styles.detailsGrid}>
        <TouchableOpacity
          style={styles.trainerChipBtn}
          onPress={() => onOpenTrainerDetail(session.trainer_id)}
          activeOpacity={0.8}
        >
          <MemberAvatar
            uri={session.trainer_avatar_url}
            name={session.trainer_name}
            size={28}
            borderRadius={9}
            accentColor={COLORS.secondary}
          />
          <Text style={styles.trainerText}>{session.trainer_name}</Text>
        </TouchableOpacity>

        <View style={styles.roomDateRight}>
          <View style={styles.roomInline}>
            <MapPin size={12} color={COLORS.secondary} />
            <Text style={styles.roomText} numberOfLines={1}>
              {session.room || 'Ana Stüdyo'}
            </Text>
          </View>
          <Text style={styles.dateSubText}>{dateLabel.full}</Text>
        </View>
      </View>

      {/* Görsel Doluluk Çubuğu */}
      <View style={styles.occupancyWrap}>
        <View style={styles.occupancyTopRow}>
          <View style={styles.occupancyLabelLeft}>
            <Users size={13} color={statusColor} />
            <Text style={[styles.occupancyText, { color: statusColor }]}>
              {session.current_enrolled}/{session.capacity}{' '}
              {isFull ? 'Dolu' : 'Kayıtlı'}
            </Text>
          </View>
          <Text style={styles.spotsRemainText}>
            {isFull ? 'Yedek Liste Aktif' : `${computedSpots} boş kontenjan`}
          </Text>
        </View>
        <View style={styles.scarcityTrack}>
          <View
            style={[
              styles.scarcityFill,
              {
                width: `${fillRatio * 100}%`,
                backgroundColor: barFillColor,
              },
            ]}
          />
        </View>
      </View>

      {/* AKSİYON BUTONLARI */}
      {isBooked ? (
        <TouchableOpacity
          style={[styles.bookedCancelBtn, isBusy && styles.disabledBtn]}
          disabled={isBusy}
          onPress={async () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            await onCancelBySession(session);
          }}
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
        isWaitlisted ? (
          <TouchableOpacity
            style={[styles.waitlistedLeaveBtn, isBusy && styles.disabledBtn]}
            disabled={isBusy}
            onPress={async () => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              await onCancelWaitlist(session);
            }}
            activeOpacity={0.84}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={COLORS.warningText} />
            ) : (
              <Text style={styles.waitlistedLeaveBtnText}>
                ⏳ Yedek Listedesin (#{session.waitlist_position ?? 1} • Çık)
              </Text>
            )}
          </TouchableOpacity>
        ) : remainingCredits <= 0 ? (
          <TouchableOpacity
            style={styles.waitlistJoinBtn}
            onPress={onOpenPackageRenew}
            activeOpacity={0.86}
          >
            <Text style={styles.waitlistJoinBtnText}>
              ⏳ Ders Hakkı Yetersiz • Paket Bilgilerim
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.waitlistJoinBtn, isBusy && styles.disabledBtn]}
            disabled={isBusy}
            onPress={async () => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              await onJoinWaitlist(session);
            }}
            activeOpacity={0.86}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={COLORS.warningText} />
            ) : (
              <Text style={styles.waitlistJoinBtnText}>
                ⏳ Yedek Listeye Yazıl
              </Text>
            )}
          </TouchableOpacity>
        )
      ) : remainingCredits <= 0 ? (
        <TouchableOpacity
          style={styles.topUpActionBtn}
          onPress={onOpenPackageRenew}
          activeOpacity={0.86}
        >
          <Text style={styles.topUpActionBtnText}>
            Ders Hakkı Yetersiz • Paket Bilgilerim
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.bookNowBtn, isBusy && styles.disabledBtn]}
          disabled={isBusy}
          onPress={async () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            await onBookSession(session);
          }}
          activeOpacity={0.86}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.bookNowBtnText}>Hemen Kayıt Ol</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

export function MemberBookingTab({
  data,
  refreshing,
  onRefresh,
  onBookSession,
  onCancelBySession,
  onJoinWaitlist,
  onCancelWaitlist,
  onOpenPackageRenew,
  onOpenTrainerDetail,
  busySessionId,
}: Props) {
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayIso);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | 'all'>('all');

  const availableSessions = data?.available_sessions ?? [];
  const waitlistItems = data?.waitlist_items ?? [];

  const trainerOptions: TrainerFilterOption[] = useMemo(() => {
    const map = new Map<number, TrainerFilterOption>();
    availableSessions.forEach((s) => {
      if (!map.has(s.trainer_id)) {
        map.set(s.trainer_id, {
          id: s.trainer_id,
          name: s.trainer_name,
          avatar_url: s.trainer_avatar_url,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [availableSessions]);

  const calendarPills: CalendarPillItem[] = useMemo(() => {
    const uniqueDates = new Set<string>([todayIso, tomorrowIso]);
    availableSessions.forEach((s) => uniqueDates.add(s.date));
    const sortedDates = Array.from(uniqueDates).sort();

    const datePills: CalendarPillItem[] = sortedDates.map((iso) => {
      const fmt = formatTurkishDateLabel(iso);
      const count = availableSessions.filter((s) => s.date === iso).length;
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
      bottomLabel: `${availableSessions.length} Seans`,
      count: availableSessions.length,
    });

    return datePills;
  }, [availableSessions, todayIso, tomorrowIso]);

  const filteredSessions = useMemo(() => {
    return availableSessions.filter((s) => {
      if (selectedDateKey !== 'all' && s.date !== selectedDateKey) {
        return false;
      }
      if (selectedCategory !== 'Tümü') {
        const sessCat = (s.category || 'Fonksiyonel').toLocaleLowerCase('tr-TR');
        const targetCat = selectedCategory.toLocaleLowerCase('tr-TR');
        if (!sessCat.includes(targetCat) && sessCat !== targetCat) {
          return false;
        }
      }
      if (selectedTrainerId !== 'all' && s.trainer_id !== selectedTrainerId) {
        return false;
      }
      return true;
    });
  }, [availableSessions, selectedDateKey, selectedCategory, selectedTrainerId]);

  const remainingCredits = data.active_package?.remaining_credits ?? 0;
  const totalCredits = data.active_package?.total_credits ?? 0;
  const hasActiveFilter = selectedCategory !== 'Tümü' || selectedTrainerId !== 'all';

  const handleSelectDay = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDateKey(key);
  };

  const handleSelectCategory = (cat: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCategory(cat);
  };

  const handleSelectTrainer = (id: number | 'all') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTrainerId(id);
  };

  const handleResetFilters = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDateKey('all');
    setSelectedCategory('Tümü');
    setSelectedTrainerId('all');
  }, []);

  const renderSessionItem = useCallback(
    ({ item }: { item: AvailableSession }) => (
      <SessionCardItem
        session={item}
        isBusy={busySessionId === item.id}
        remainingCredits={remainingCredits}
        onBookSession={onBookSession}
        onCancelBySession={onCancelBySession}
        onJoinWaitlist={onJoinWaitlist}
        onCancelWaitlist={onCancelWaitlist}
        onOpenPackageRenew={onOpenPackageRenew}
        onOpenTrainerDetail={onOpenTrainerDetail}
      />
    ),
    [
      busySessionId,
      onBookSession,
      onCancelBySession,
      onCancelWaitlist,
      onJoinWaitlist,
      onOpenPackageRenew,
      onOpenTrainerDetail,
      remainingCredits,
    ]
  );

  const keyExtractor = useCallback((item: AvailableSession) => String(item.id), []);

  return (
    <View style={styles.container}>
      {/* 1. FERAH YATAY GÜN SEÇİCİ ŞERİT */}
      <View style={styles.calendarStripWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalStripContent}
        >
          {calendarPills.map((pill) => {
            const active = selectedDateKey === pill.key;
            return (
              <TouchableOpacity
                key={pill.key}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => handleSelectDay(pill.key)}
                activeOpacity={0.84}
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

      {/* 2. KATEGORİ & EĞİTMEN FİLTRE ÇİPLERİ */}
      <View style={styles.filterBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalStripContent}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => handleSelectCategory(cat)}
                activeOpacity={0.84}
              >
                <Dumbbell
                  size={12}
                  color={active ? COLORS.white : COLORS.primary}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalStripContent}
        >
          <TouchableOpacity
            style={[
              styles.trainerFilterChip,
              selectedTrainerId === 'all' && styles.trainerFilterChipActive,
            ]}
            onPress={() => handleSelectTrainer('all')}
            activeOpacity={0.84}
          >
            <Filter
              size={12}
              color={selectedTrainerId === 'all' ? COLORS.white : COLORS.secondary}
            />
            <Text
              style={[
                styles.trainerFilterText,
                selectedTrainerId === 'all' && styles.trainerFilterTextActive,
              ]}
            >
              Tüm Hocalar
            </Text>
          </TouchableOpacity>

          {trainerOptions.map((tr) => {
            const active = selectedTrainerId === tr.id;
            return (
              <TouchableOpacity
                key={tr.id}
                style={[
                  styles.trainerFilterChip,
                  active && styles.trainerFilterChipActive,
                ]}
                onPress={() => handleSelectTrainer(tr.id)}
                activeOpacity={0.84}
              >
                <UserCheck
                  size={12}
                  color={active ? COLORS.white : COLORS.secondary}
                />
                <Text
                  style={[
                    styles.trainerFilterText,
                    active && styles.trainerFilterTextActive,
                  ]}
                >
                  {tr.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. KREDİ BAKİYE ŞERİDİ */}
      <View style={styles.creditStrip}>
        <View style={styles.creditStripLeft}>
          <Sparkles size={14} color={COLORS.primary} />
          <Text style={styles.creditStripLabel}>
            Kalan Bakiye:{' '}
            <Text
              style={{
                color: remainingCredits <= 2 ? COLORS.warningText : COLORS.primary,
                fontWeight: '800',
              }}
            >
              {remainingCredits} / {totalCredits} Ders
            </Text>
          </Text>
        </View>

        {waitlistItems.length > 0 ? (
          <View style={styles.waitlistSummaryBadge}>
            <Hourglass size={12} color={COLORS.warningText} />
            <Text style={styles.waitlistSummaryText}>
              {waitlistItems.length} Yedek Sıra
            </Text>
          </View>
        ) : remainingCredits <= 2 ? (
          <TouchableOpacity
            style={styles.topUpMiniBtn}
            onPress={onOpenPackageRenew}
            activeOpacity={0.84}
          >
            <Text style={styles.topUpMiniBtnText}>Paketimi Gör</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.sessionCountHint}>{filteredSessions.length} Açık Seans</Text>
        )}
      </View>

      {/* 4. FERAH BEYAZ DERS KARTLARI LİSTESİ (FlatList + React.memo) */}
      <FlatList
        data={filteredSessions}
        keyExtractor={keyExtractor}
        renderItem={renderSessionItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Calendar size={30} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Bu filtrede açık ders bulunamadı</Text>
            <Text style={styles.emptySub}>
              {hasActiveFilter
                ? 'Seçtiğiniz kategori veya eğitmen filtresinde bu tarihte seans görünmüyor.'
                : 'Üstteki takvim şeridinden diğer günleri veya "Tümü" sekmesini seçebilirsiniz.'}
            </Text>
            <TouchableOpacity
              style={styles.resetFiltersBtn}
              onPress={handleResetFilters}
              activeOpacity={0.85}
            >
              <RotateCcw size={14} color={COLORS.white} />
              <Text style={styles.resetFiltersBtnText}>Tüm Dersleri Göster</Text>
            </TouchableOpacity>
          </View>
        }
      />
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
    paddingBottom: 8,
  },
  horizontalStripContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayPillTop: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  dayPillTopActive: {
    color: COLORS.white,
  },
  dayPillBottom: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  dayPillBottomActive: {
    color: 'rgba(255, 255, 255, 0.88)',
  },
  dayDotBadge: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dayDotBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  dayDotText: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  dayDotTextActive: {
    color: COLORS.white,
  },
  filterBlock: {
    gap: 8,
    marginBottom: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  trainerFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trainerFilterChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  trainerFilterText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  trainerFilterTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  creditStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  creditStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creditStripLabel: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  waitlistSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  waitlistSummaryText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  topUpMiniBtn: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  topUpMiniBtnText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  sessionCountHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 34,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  resetFiltersBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  resetFiltersBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 13,
    ...CARD_SHADOW,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 11,
  },
  timeText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  timeEndText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  lastSpotBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  lastSpotBadgeText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  waitlistInfoBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  waitlistInfoBadgeText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  sessionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  detailsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  trainerChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trainerText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  roomDateRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 1,
  },
  roomInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomText: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  dateSubText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  occupancyWrap: {
    gap: 6,
  },
  occupancyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  occupancyLabelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  occupancyText: {
    fontSize: 12,
    fontWeight: '800',
  },
  spotsRemainText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  scarcityTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: '#EAE0D0',
    overflow: 'hidden',
  },
  scarcityFill: {
    height: '100%',
    borderRadius: 999,
  },
  bookNowBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookNowBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  bookedCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: '#F0BFC3',
    borderRadius: 14,
    paddingVertical: 12.5,
  },
  bookedCancelBtnText: {
    color: COLORS.dangerText,
    fontSize: 13.5,
    fontWeight: '800',
  },
  waitlistJoinBtn: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistJoinBtnText: {
    color: COLORS.warningText,
    fontSize: 13.5,
    fontWeight: '800',
  },
  waitlistedLeaveBtn: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 14,
    paddingVertical: 12.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistedLeaveBtnText: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '800',
  },
  topUpActionBtn: {
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topUpActionBtnText: {
    color: COLORS.secondary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
