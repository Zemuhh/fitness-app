import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Edit3,
  Flame,
  Hourglass,
  Layers,
  MapPin,
  Percent,
  Phone,
  Users,
  X,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import {
  BodyZonesApiResponse,
  BodyZonesRecord,
  EnrichedTrainerMemberFields,
  MemberDailyWellness,
  extractBodyZoneAlerts,
  normalizeBodyZones,
} from '@/components/BodyHeatmapCard';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AttendanceStatus,
  TrainerAttendee,
  TrainerMemberCrm,
  TrainerScheduleData,
  TrainerSession,
  WaitlistEntry,
} from '@/types/fitness';
import { MemberAvatar, getCategoryVisuals } from '@/screens/member/MemberAvatar';
import { TrainerMemberCrmModal } from '@/screens/trainer/TrainerMemberCrmModal';
import {
  formatTurkishDateLabel,
  getTodayIso,
  getTomorrowIso,
} from '@/utils/dateHelpers';

interface Props {
  data: TrainerScheduleData;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAttendance: (bookingId: number, status: AttendanceStatus) => Promise<void>;
  onSaveMemberNote: (memberId: number, notes: string) => Promise<void>;
  onGoToCreateSession: () => void;
  busyBookingId: number | null;
  savingNote: boolean;
  focusDate?: string | null;
  onFocusDateConsumed?: () => void;
}

const ALL_DATES_KEY = 'ALL';

export function TrainerScheduleTab({
  data,
  refreshing,
  onRefresh,
  onMarkAttendance,
  onSaveMemberNote,
  onGoToCreateSession,
  busyBookingId,
  savingNote,
  focusDate,
  onFocusDateConsumed,
}: Props) {
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  const dateOptions = useMemo(() => {
    const set = new Set<string>([todayIso, tomorrowIso, ...data.available_dates]);
    return Array.from(set).sort();
  }, [data.available_dates, todayIso, tomorrowIso]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const hasToday = data.sessions.some((s) => s.date === todayIso);
    if (hasToday) return todayIso;
    const upcoming = data.available_dates.find((d) => d >= todayIso);
    return upcoming || todayIso;
  });

  const [expandedSessionIds, setExpandedSessionIds] = useState<Record<number, boolean>>({});
  const [editingMember, setEditingMember] = useState<TrainerAttendee | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [selectedCrmMember, setSelectedCrmMember] = useState<
    (TrainerMemberCrm & EnrichedTrainerMemberFields) | null
  >(null);
  const [memberSnapshots, setMemberSnapshots] = useState<
    Record<
      number,
      {
        zones?: BodyZonesRecord;
        wellness?: MemberDailyWellness;
      }
    >
  >({});

  useEffect(() => {
    if (focusDate) {
      setSelectedDate(focusDate);
      onFocusDateConsumed?.();
    }
  }, [focusDate, onFocusDateConsumed]);

  const visibleSessions = useMemo(() => {
    if (selectedDate === ALL_DATES_KEY) {
      return data.sessions;
    }
    return data.sessions.filter((s) => s.date === selectedDate);
  }, [data.sessions, selectedDate]);

  useEffect(() => {
    if (visibleSessions.length > 0) {
      setExpandedSessionIds((prev) => {
        const hasAnyVisible = visibleSessions.some((s) => prev[s.id] !== undefined);
        if (hasAnyVisible) return prev;
        return { ...prev, [visibleSessions[0].id]: true };
      });
    }
  }, [visibleSessions]);

  // Katılımcıların bölge haritası ve günlük enerji verilerini yedekli olarak çek
  useEffect(() => {
    const attendeeMap = new Map<
      number,
      TrainerAttendee & EnrichedTrainerMemberFields
    >();
    for (const sess of visibleSessions) {
      for (const att of sess.attendees) {
        if (!attendeeMap.has(att.member_id)) {
          attendeeMap.set(
            att.member_id,
            att as TrainerAttendee & EnrichedTrainerMemberFields
          );
        }
      }
    }

    if (attendeeMap.size === 0) return;

    let cancelled = false;

    const hydrate = async () => {
      await Promise.all(
        Array.from(attendeeMap.values()).map(async (att) => {
          let fetchedZones: BodyZonesRecord | undefined;
          let fetchedWellness: MemberDailyWellness | undefined;

          if (!att.body_zones) {
            try {
              const zRes = await apiRequest<BodyZonesApiResponse>(
                `/users/${att.member_id}/body-zones`
              );
              if (zRes?.zones) {
                fetchedZones = normalizeBodyZones(zRes.zones);
              }
            } catch {
              // sessiz yedek
            }
          }

          if (!att.today_energy_status) {
            try {
              fetchedWellness = await apiRequest<MemberDailyWellness>(
                `/wellness/${att.member_id}/today`
              );
            } catch {
              // sessiz yedek
            }
          }

          if (!cancelled && (fetchedZones || fetchedWellness)) {
            setMemberSnapshots((prev) => ({
              ...prev,
              [att.member_id]: {
                zones: fetchedZones ?? prev[att.member_id]?.zones,
                wellness: fetchedWellness ?? prev[att.member_id]?.wellness,
              },
            }));
          }
        })
      );
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [visibleSessions]);

  const openStudentHeatmapModal = useCallback(
    (att: TrainerAttendee) => {
      const enriched = att as TrainerAttendee & EnrichedTrainerMemberFields;
      const snap = memberSnapshots[att.member_id];
      setSelectedCrmMember({
        id: att.member_id,
        full_name: att.full_name,
        phone: att.phone,
        instagram_handle: att.instagram_handle,
        avatar_url: att.avatar_url,
        streak_days: 0,
        notes: att.notes || '',
        package_name: att.package_name,
        remaining_credits: att.remaining_credits,
        total_credits: att.total_credits,
        low_credit_warning: att.low_credit_warning,
        attended_sessions_count: 0,
        body_zones: snap?.zones ?? enriched.body_zones ?? null,
        today_energy_status:
          snap?.wellness?.energy_status ?? enriched.today_energy_status ?? null,
        today_water_ml: snap?.wellness?.water_ml ?? enriched.today_water_ml ?? null,
        water_goal_ml:
          snap?.wellness?.water_goal_ml ?? enriched.water_goal_ml ?? 3000,
        today_protein_g:
          snap?.wellness?.protein_g ?? enriched.today_protein_g ?? null,
        protein_goal_g:
          snap?.wellness?.protein_goal_g ?? enriched.protein_goal_g ?? 140,
      });
    },
    [memberSnapshots]
  );

  const summaryStats = useMemo(() => {
    const totalClasses = visibleSessions.length;
    const totalEnrolled = visibleSessions.reduce((acc, s) => acc + s.current_enrolled, 0);
    const totalCapacity = visibleSessions.reduce((acc, s) => acc + s.capacity, 0);
    const fillRatePct =
      totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
    const totalWaitlist = visibleSessions.reduce(
      (acc, s) => acc + (s.waitlist?.length ?? 0),
      0
    );
    return {
      totalClasses,
      totalEnrolled,
      totalCapacity,
      fillRatePct,
      totalWaitlist,
    };
  }, [visibleSessions]);

  const toggleExpand = (sessionId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSessionIds((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  const handleSelectDate = (dt: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(dt);
  };

  const handleAttendancePress = async (
    attendee: TrainerAttendee,
    targetStatus: 'attended' | 'no_show'
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextStatus: AttendanceStatus =
      attendee.status === targetStatus ? 'booked' : targetStatus;
    await onMarkAttendance(attendee.booking_id, nextStatus);
  };

  const openEditModal = (attendee: TrainerAttendee) => {
    setEditingMember(attendee);
    setNoteDraft(attendee.notes || '');
  };

  const handleConfirmNote = async () => {
    if (!editingMember) return;
    await onSaveMemberNote(editingMember.member_id, noteDraft);
    setEditingMember(null);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.secondary}
          />
        }
      >
        {/* Yatay Tarih Seçici */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateBar}
        >
          <TouchableOpacity
            style={[
              styles.datePill,
              selectedDate === ALL_DATES_KEY && styles.datePillActive,
            ]}
            onPress={() => handleSelectDate(ALL_DATES_KEY)}
            activeOpacity={0.85}
          >
            <Layers
              size={15}
              color={selectedDate === ALL_DATES_KEY ? COLORS.white : COLORS.secondary}
            />
            <View>
              <Text
                style={[
                  styles.datePillTitle,
                  selectedDate === ALL_DATES_KEY && styles.datePillTitleActive,
                ]}
              >
                Tümü
              </Text>
              <Text
                style={[
                  styles.datePillSub,
                  selectedDate === ALL_DATES_KEY && styles.datePillSubActive,
                ]}
              >
                {data.sessions.length} Ders
              </Text>
            </View>
          </TouchableOpacity>

          {dateOptions.map((dt) => {
            const active = selectedDate === dt;
            const fmt = formatTurkishDateLabel(dt);
            const countOnDate = data.sessions.filter((s) => s.date === dt).length;
            return (
              <TouchableOpacity
                key={dt}
                style={[styles.datePill, active && styles.datePillActive]}
                onPress={() => handleSelectDate(dt)}
                activeOpacity={0.85}
              >
                <View>
                  <Text
                    style={[styles.datePillTitle, active && styles.datePillTitleActive]}
                  >
                    {fmt.primary}
                  </Text>
                  <Text style={[styles.datePillSub, active && styles.datePillSubActive]}>
                    {fmt.secondary} • {countOnDate} Ders
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Günlük Özet Kartı */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryCardHeader}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.headerIconDot}>
                <Clock size={15} color={COLORS.secondary} />
              </View>
              <View>
                <Text style={styles.sectionHeading}>
                  {selectedDate === ALL_DATES_KEY
                    ? `Tüm Ders Akışım (${visibleSessions.length})`
                    : formatTurkishDateLabel(selectedDate).full}
                </Text>
                <Text style={styles.sectionSubText}>
                  Canlı kontenjan, katılımcı notları ve yoklama özeti
                </Text>
              </View>
            </View>

            {summaryStats.totalWaitlist > 0 && (
              <View style={styles.summaryWaitlistChip}>
                <Hourglass size={11} color={COLORS.warningText} />
                <Text style={styles.summaryWaitlistText}>
                  {summaryStats.totalWaitlist} Yedek
                </Text>
              </View>
            )}
          </View>

          <View style={styles.bentoStatsRow}>
            <View style={styles.miniBentoBox}>
              <View style={[styles.bentoIconWrap, { backgroundColor: COLORS.secondaryLight }]}>
                <Dumbbell size={15} color={COLORS.secondary} />
              </View>
              <Text style={styles.bentoStatNumber}>{summaryStats.totalClasses}</Text>
              <Text style={styles.bentoStatLabel} numberOfLines={1}>
                Toplam Ders
              </Text>
            </View>

            <View style={styles.miniBentoBox}>
              <View style={[styles.bentoIconWrap, { backgroundColor: COLORS.primaryLight }]}>
                <Users size={15} color={COLORS.primary} />
              </View>
              <Text style={styles.bentoStatNumber}>
                {summaryStats.totalEnrolled}
                <Text style={styles.bentoStatSubCap}>/{summaryStats.totalCapacity}</Text>
              </Text>
              <Text style={styles.bentoStatLabel} numberOfLines={1}>
                Kayıtlı Üye
              </Text>
            </View>

            <View style={styles.miniBentoBox}>
              <View
                style={[
                  styles.bentoIconWrap,
                  {
                    backgroundColor:
                      summaryStats.fillRatePct >= 80
                        ? COLORS.warningBg
                        : COLORS.primaryLight,
                  },
                ]}
              >
                <Percent
                  size={15}
                  color={
                    summaryStats.fillRatePct >= 80
                      ? COLORS.warningText
                      : COLORS.primary
                  }
                />
              </View>
              <Text
                style={[
                  styles.bentoStatNumber,
                  {
                    color:
                      summaryStats.fillRatePct >= 80
                        ? COLORS.warningText
                        : COLORS.primary,
                  },
                ]}
              >
                %{summaryStats.fillRatePct}
              </Text>
              <Text style={styles.bentoStatLabel} numberOfLines={1}>
                Doluluk Oranı
              </Text>
            </View>
          </View>
        </View>

        {/* Saatlik Ders Kartları & Yoklama Akışı */}
        {visibleSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Calendar size={26} color={COLORS.secondary} />
            </View>
            <Text style={styles.emptyTitle}>Seçili tarihte açık dersiniz bulunmuyor</Text>
            <Text style={styles.emptySub}>
              Üstten farklı bir gün seçebilir veya takviminize hemen yeni bir grup ya da
              birebir PT seansı ekleyebilirsiniz.
            </Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={onGoToCreateSession}
              activeOpacity={0.85}
            >
              <CalendarPlus size={16} color={COLORS.white} />
              <Text style={styles.emptyCreateBtnText}>Bu Güne Yeni Ders Aç</Text>
            </TouchableOpacity>
          </View>
        ) : (
          visibleSessions.map((session: TrainerSession) => {
            const expanded = Boolean(expandedSessionIds[session.id]);
            const isFull = session.current_enrolled >= session.capacity;
            const spotsLeft = Math.max(0, session.capacity - session.current_enrolled);
            const isLastSpot = !isFull && spotsLeft === 1;
            const fillRatio =
              session.capacity > 0
                ? Math.min(1, session.current_enrolled / session.capacity)
                : 0;
            const waitlistCount = session.waitlist?.length ?? 0;
            const catVisual = getCategoryVisuals(session.category);

            return (
              <View
                key={session.id}
                style={[
                  styles.sessionBentoCard,
                  expanded && styles.sessionBentoCardExpanded,
                ]}
              >
                <TouchableOpacity
                  style={styles.sessionHeaderTouch}
                  onPress={() => toggleExpand(session.id)}
                  activeOpacity={0.85}
                >
                  {/* Saat + Doluluk & Yedek Rozetleri */}
                  <View style={styles.sessionTopRow}>
                    <View style={styles.timeAndDateCol}>
                      <View style={styles.timePillBox}>
                        <Clock size={13} color={COLORS.secondary} />
                        <Text style={styles.bigStartTime}>{session.start_time}</Text>
                        <Text style={styles.endTimeSub}>- {session.end_time}</Text>
                      </View>
                      {selectedDate === ALL_DATES_KEY && (
                        <Text style={styles.allModeDateTag}>
                          {formatTurkishDateLabel(session.date).full}
                        </Text>
                      )}
                    </View>

                    <View style={styles.topRightGroup}>
                      {waitlistCount > 0 && (
                        <View style={styles.waitlistCountBadge}>
                          <Text style={styles.waitlistCountBadgeText}>
                            ⏳ {waitlistCount} Yedek
                          </Text>
                        </View>
                      )}

                      <View
                        style={[
                          styles.occupancyBadge,
                          isFull
                            ? styles.occupancyFull
                            : isLastSpot
                            ? styles.occupancyWarn
                            : styles.occupancyOpen,
                        ]}
                      >
                        <Text
                          style={[
                            styles.occupancyBadgeText,
                            {
                              color: isFull
                                ? COLORS.dangerText
                                : isLastSpot
                                ? COLORS.warningText
                                : COLORS.primary,
                            },
                          ]}
                        >
                          {session.current_enrolled}/{session.capacity}{' '}
                          {isFull ? 'Dolu' : 'Kayıt'}
                        </Text>
                      </View>

                      <View style={styles.chevronCircle}>
                        {expanded ? (
                          <ChevronUp size={17} color={COLORS.textSecondary} />
                        ) : (
                          <ChevronDown size={17} color={COLORS.textSecondary} />
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Ders Başlığı */}
                  <Text style={styles.sessionTitleText}>{session.title}</Text>

                  {/* Kategori Rozeti + Stüdyo Oda Bilgisi */}
                  <View style={styles.metaChipsRow}>
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor: catVisual.bg,
                          borderColor: catVisual.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.categoryBadgeText, { color: catVisual.color }]}
                      >
                        {catVisual.label}
                      </Text>
                    </View>

                    <View style={styles.roomBadge}>
                      <MapPin size={12} color={COLORS.textSecondary} />
                      <Text style={styles.roomBadgeText} numberOfLines={1}>
                        {session.room || 'Ana Stüdyo'}
                      </Text>
                    </View>
                  </View>

                  {/* Doluluk Çubuğu */}
                  <View style={styles.progressTrackWrap}>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.round(fillRatio * 100)}%`,
                            backgroundColor: isFull
                              ? COLORS.danger
                              : isLastSpot
                              ? COLORS.warning
                              : COLORS.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressHintText}>
                      {expanded
                        ? 'Katılımcı listesini daraltmak için dokunun'
                        : `${session.attendees.length} katılımcı${
                            waitlistCount > 0 ? ` • ${waitlistCount} yedek` : ''
                          } • Yoklama almak için dokunun`}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Açılır Detay: Katılımcılar & Yedek Liste */}
                {expanded && (
                  <View style={styles.expandedContentWrap}>
                    <View style={styles.subSectionHeader}>
                      <Users size={14} color={COLORS.primary} />
                      <Text style={styles.subSectionTitle}>
                        Katılımcı Listesi ({session.attendees.length}/{session.capacity})
                      </Text>
                    </View>

                    {session.attendees.length === 0 ? (
                      <View style={styles.noAttendeeCard}>
                        <Text style={styles.noAttendeeText}>
                          Bu derse henüz kayıtlı üye bulunmuyor.
                        </Text>
                      </View>
                    ) : (
                      session.attendees.map((att) => {
                        const enrichedAtt = att as TrainerAttendee &
                          EnrichedTrainerMemberFields;
                        const snap = memberSnapshots[att.member_id];
                        const effectiveZones = snap?.zones ?? enrichedAtt.body_zones;
                        const zoneAlerts = extractBodyZoneAlerts(effectiveZones);
                        const hasInjuredZone = zoneAlerts.some(
                          (z) => z.status === 'injured'
                        );
                        const hasWarningZone = zoneAlerts.some(
                          (z) => z.status === 'warning'
                        );
                        const effectiveEnergy =
                          snap?.wellness?.energy_status ??
                          enrichedAtt.today_energy_status ??
                          'normal';
                        const isLowEnergy = effectiveEnergy === 'low';

                        const isBusy = busyBookingId === att.booking_id;
                        const isLow = att.low_credit_warning || att.remaining_credits <= 2;
                        const hasNote = Boolean(att.notes && att.notes.trim().length > 0);

                        return (
                          <View
                            key={att.booking_id}
                            style={[
                              styles.attendeeCard,
                              hasWarningZone && styles.attendeeCardWarningBorder,
                              hasInjuredZone && styles.attendeeCardInjuredBorder,
                            ]}
                          >
                            {/* Üst Satır: Avatar + İsim/İletişim (Tıklanabilir Harita/CRM) + Kalan Kredi & Hızlı Harita */}
                            <View style={styles.attendeeHeaderRow}>
                              <TouchableOpacity
                                style={styles.attendeeIdentityTouch}
                                onPress={() => openStudentHeatmapModal(att)}
                                activeOpacity={0.8}
                              >
                                <MemberAvatar
                                  uri={att.avatar_url}
                                  name={att.full_name}
                                  size={44}
                                  borderRadius={14}
                                  accentColor={
                                    hasInjuredZone
                                      ? '#EF4444'
                                      : hasWarningZone || isLow
                                      ? COLORS.warning
                                      : COLORS.primary
                                  }
                                />

                                <View style={styles.attendeeInfoCol}>
                                  <View style={styles.attendeeNameInlineWrap}>
                                    <Text style={styles.attendeeName} numberOfLines={1}>
                                      {att.full_name}
                                    </Text>
                                    {zoneAlerts.length > 0 && (
                                      <View
                                        style={[
                                          styles.nameSideAlertDot,
                                          hasInjuredZone
                                            ? styles.nameSideAlertDotRed
                                            : styles.nameSideAlertDotAmber,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.nameSideAlertDotText,
                                            {
                                              color: hasInjuredZone
                                                ? '#B91C1C'
                                                : '#B45309',
                                            },
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {zoneAlerts[0].shortText}
                                          {zoneAlerts.length > 1
                                            ? ` +${zoneAlerts.length - 1}`
                                            : ''}
                                        </Text>
                                      </View>
                                    )}
                                  </View>

                                  <View style={styles.contactInlineRow}>
                                    <Phone size={11} color={COLORS.textMuted} />
                                    <Text
                                      style={styles.attendeeContactText}
                                      numberOfLines={1}
                                    >
                                      {att.phone}
                                      {att.instagram_handle
                                        ? ` • ${att.instagram_handle}`
                                        : ''}
                                    </Text>
                                  </View>
                                </View>
                              </TouchableOpacity>

                              <View style={styles.headerBadgesRight}>
                                <View
                                  style={[
                                    styles.remainingPill,
                                    isLow
                                      ? styles.remainingPillWarn
                                      : styles.remainingPillOk,
                                  ]}
                                >
                                  {isLow && <Flame size={11} color={COLORS.warningText} />}
                                  <Text
                                    style={[
                                      styles.remainingPillText,
                                      {
                                        color: isLow
                                          ? COLORS.warningText
                                          : COLORS.primary,
                                      },
                                    ]}
                                  >
                                    {att.remaining_credits}/{att.total_credits || '-'} Kredi
                                  </Text>
                                </View>

                                <TouchableOpacity
                                  style={styles.quickHeatmapBtn}
                                  onPress={() => openStudentHeatmapModal(att)}
                                  activeOpacity={0.8}
                                >
                                  <Activity size={13} color={COLORS.primary} />
                                  <Text style={styles.quickHeatmapBtnText}>Harita</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={styles.quickNoteIconBtn}
                                  onPress={() => openEditModal(att)}
                                  activeOpacity={0.78}
                                >
                                  <Edit3 size={14} color={COLORS.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* Kırmızı / Sarı Bölge Uyarıları (Vücut Haritası) */}
                            {zoneAlerts.length > 0 && (
                              <View style={styles.attendeeZoneBadgesWrap}>
                                {zoneAlerts.map((za) => (
                                  <TouchableOpacity
                                    key={za.zone}
                                    style={[
                                      styles.attendeeZoneAlertBadge,
                                      za.status === 'injured'
                                        ? styles.attendeeZoneAlertInjured
                                        : styles.attendeeZoneAlertWarning,
                                    ]}
                                    onPress={() => openStudentHeatmapModal(att)}
                                    activeOpacity={0.82}
                                  >
                                    <Text
                                      style={[
                                        styles.attendeeZoneAlertText,
                                        {
                                          color:
                                            za.status === 'injured'
                                              ? '#B91C1C'
                                              : '#B45309',
                                        },
                                      ]}
                                    >
                                      {za.badgeText}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}

                            {/* Müşteri O Gün "low" Enerji Seçtiyse Otomatik Uyarı Rozeti */}
                            {isLowEnergy && (
                              <TouchableOpacity
                                style={styles.lowEnergyAttendeeBadge}
                                onPress={() => openStudentHeatmapModal(att)}
                                activeOpacity={0.84}
                              >
                                <Zap size={14} color="#7C2D12" />
                                <Text style={styles.lowEnergyAttendeeBadgeText}>
                                  ⚡ Bugün Enerjisi/Uykusu Düşük - Tempolu Yüklenme
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Düşük Kredi Bilgilendirme Etiketi */}
                            {isLow && (
                              <View style={styles.lowCreditBanner}>
                                <Flame size={12} color={COLORS.warningText} />
                                <Text style={styles.lowCreditBannerText}>
                                  Paket yenileme zamanı yaklaştı (Kalan:{' '}
                                  {att.remaining_credits} ders)
                                </Text>
                              </View>
                            )}

                            {/* Kehribar Sakatlık / Özel Not Kutusu */}
                            {hasNote ? (
                              <TouchableOpacity
                                style={styles.injuryWarningBox}
                                onPress={() => openEditModal(att)}
                                activeOpacity={0.82}
                              >
                                <AlertTriangle size={15} color={COLORS.warningText} />
                                <Text style={styles.injuryWarningText}>
                                  {att.notes}
                                </Text>
                                <View style={styles.editNoteChip}>
                                  <Edit3 size={11} color={COLORS.warningText} />
                                  <Text style={styles.editNoteChipText}>Düzenle</Text>
                                </View>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.addNoteSubtleBtn}
                                onPress={() => openEditModal(att)}
                                activeOpacity={0.78}
                              >
                                <Edit3 size={12} color={COLORS.textSecondary} />
                                <Text style={styles.addNoteSubtleText}>
                                  Sakatlık / özel antrenman notu ekle
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Yoklama Aksiyon Butonları */}
                            <View style={styles.thumbActionsRow}>
                              <TouchableOpacity
                                style={[
                                  styles.thumbBtn,
                                  att.status === 'attended' && styles.thumbBtnAttendedActive,
                                ]}
                                disabled={isBusy}
                                onPress={() => handleAttendancePress(att, 'attended')}
                                activeOpacity={0.85}
                              >
                                {isBusy ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={
                                      att.status === 'attended'
                                        ? COLORS.white
                                        : COLORS.primary
                                    }
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.thumbBtnText,
                                      att.status === 'attended' &&
                                        styles.thumbBtnTextAttendedActive,
                                    ]}
                                  >
                                    ✅ Geldi
                                  </Text>
                                )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[
                                  styles.thumbBtn,
                                  att.status === 'no_show' && styles.thumbBtnNoShowActive,
                                ]}
                                disabled={isBusy}
                                onPress={() => handleAttendancePress(att, 'no_show')}
                                activeOpacity={0.85}
                              >
                                {isBusy ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={
                                      att.status === 'no_show'
                                        ? COLORS.white
                                        : COLORS.danger
                                    }
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.thumbBtnText,
                                      att.status === 'no_show' &&
                                        styles.thumbBtnTextNoShowActive,
                                    ]}
                                  >
                                    ❌ Gelmedi
                                  </Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}

                    {/* Yedek Listede Bekleyenler (Waitlist) */}
                    {waitlistCount > 0 && (
                      <View style={styles.waitlistSectionBox}>
                        <View style={styles.waitlistHeaderRow}>
                          <View style={styles.waitlistTitleCluster}>
                            <Hourglass size={14} color={COLORS.warningText} />
                            <Text style={styles.waitlistTitleText}>
                              Yedek Listede Bekleyenler ({waitlistCount})
                            </Text>
                          </View>
                          <View style={styles.autoPromoteTag}>
                            <Text style={styles.autoPromoteTagText}>
                              Otomatik Terfi Aktif
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.waitlistSubDesc}>
                          Derste iptal olduğunda sıradaki kredili üye otomatik olarak asil
                          listeye alınır.
                        </Text>

                        <View style={styles.waitlistRowsWrap}>
                          {session.waitlist.map((w: WaitlistEntry) => (
                            <View key={w.waitlist_id} style={styles.waitlistMemberRow}>
                              <View style={styles.waitlistPositionBadge}>
                                <Text style={styles.waitlistPositionText}>
                                  #{w.position}
                                </Text>
                              </View>

                              <MemberAvatar
                                uri={w.avatar_url}
                                name={w.full_name}
                                size={38}
                                borderRadius={12}
                                accentColor={COLORS.secondary}
                              />

                              <View style={styles.waitlistMemberInfo}>
                                <Text style={styles.waitlistMemberName} numberOfLines={1}>
                                  {w.full_name}
                                </Text>
                                <Text
                                  style={styles.waitlistMemberContact}
                                  numberOfLines={1}
                                >
                                  {w.phone}
                                  {w.instagram_handle ? ` • ${w.instagram_handle}` : ''}
                                </Text>
                              </View>

                              <View style={styles.waitlistCreditBadge}>
                                <Text style={styles.waitlistCreditText}>
                                  {w.remaining_credits}/{w.total_credits || '-'} Kredi
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Hızlı Sakatlık & Özel Antrenman Notu Düzenleme Modalı */}
      <Modal
        visible={Boolean(editingMember)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingMember(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderUserRow}>
                {editingMember && (
                  <MemberAvatar
                    uri={editingMember.avatar_url}
                    name={editingMember.full_name}
                    size={44}
                    borderRadius={14}
                    accentColor={COLORS.warning}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Sakatlık & Özel Antrenman Notu</Text>
                  <Text style={styles.modalSubtitle}>{editingMember?.full_name}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setEditingMember(null)}
              >
                <X size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Örn: Sol diz menisküs hassasiyeti var, derin squat ve sıçrama hareketlerinden kaçınılmalı..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingMember(null)}
                disabled={savingNote}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleConfirmNote}
                disabled={savingNote}
              >
                {savingNote ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Notu Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* İnteraktif Vücut Haritası & Öğrenci CRM Detay Modalı */}
      <TrainerMemberCrmModal
        visible={Boolean(selectedCrmMember)}
        member={selectedCrmMember}
        onClose={() => setSelectedCrmMember(null)}
        onMemberMutated={async () => {
          onRefresh();
        }}
        onZonesMutated={(mid, updatedZones) => {
          setMemberSnapshots((prev) => ({
            ...prev,
            [mid]: {
              ...prev[mid],
              zones: updatedZones,
            },
          }));
          setSelectedCrmMember((prev) =>
            prev && prev.id === mid ? { ...prev, body_zones: updatedZones } : prev
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  dateBar: {
    gap: 10,
    paddingBottom: 16,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  datePillActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  datePillTitle: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  datePillTitleActive: {
    color: COLORS.white,
  },
  datePillSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  datePillSubActive: {
    color: COLORS.secondaryLight,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...CARD_SHADOW,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconDot: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  summaryWaitlistChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  summaryWaitlistText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  bentoStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  miniBentoBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  bentoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoStatNumber: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  bentoStatSubCap: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  bentoStatLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  emptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCreateBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  sessionBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  sessionBentoCardExpanded: {
    borderColor: '#E5C5C9',
  },
  sessionHeaderTouch: {
    gap: 2,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  timeAndDateCol: {
    gap: 4,
  },
  timePillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bigStartTime: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  endTimeSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  allModeDateTag: {
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
    marginTop: 2,
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  waitlistCountBadge: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  waitlistCountBadgeText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  occupancyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  occupancyOpen: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  occupancyWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  occupancyFull: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  occupancyBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  chevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitleText: {
    color: COLORS.textPrimary,
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  metaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roomBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  progressTrackWrap: {
    gap: 7,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressHintText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  expandedContentWrap: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subSectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  noAttendeeCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noAttendeeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  attendeeCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 11,
  },
  attendeeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attendeeInfoCol: {
    flex: 1,
    gap: 3,
  },
  attendeeName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  contactInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attendeeContactText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  headerBadgesRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  remainingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  remainingPillOk: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  remainingPillWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  remainingPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  quickNoteIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowCreditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  lowCreditBannerText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '700',
  },
  injuryWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  injuryWarningText: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  editNoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editNoteChipText: {
    color: COLORS.warningText,
    fontSize: 10.5,
    fontWeight: '800',
  },
  addNoteSubtleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addNoteSubtleText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  thumbActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
  },
  thumbBtnAttendedActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  thumbBtnNoShowActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  thumbBtnText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  thumbBtnTextAttendedActive: {
    color: COLORS.white,
  },
  thumbBtnTextNoShowActive: {
    color: COLORS.white,
  },
  waitlistSectionBox: {
    marginTop: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 15,
    gap: 10,
  },
  waitlistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  waitlistTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  waitlistTitleText: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '800',
  },
  autoPromoteTag: {
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  autoPromoteTagText: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
  },
  waitlistSubDesc: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  waitlistRowsWrap: {
    gap: 8,
  },
  waitlistMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  waitlistPositionBadge: {
    minWidth: 30,
    height: 28,
    borderRadius: 9,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  waitlistPositionText: {
    color: COLORS.warningText,
    fontSize: 12,
    fontWeight: '900',
  },
  waitlistMemberInfo: {
    flex: 1,
    gap: 2,
  },
  waitlistMemberName: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  waitlistMemberContact: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  waitlistCreditBadge: {
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
  },
  waitlistCreditText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(34, 29, 25, 0.36)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 22,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 15,
    ...CARD_SHADOW,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalHeaderUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  closeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 14,
    padding: 14,
    minHeight: 110,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  modalSaveBtn: {
    flex: 1.4,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  attendeeCardWarningBorder: {
    borderColor: '#FCD34D',
    borderWidth: 1.4,
  },
  attendeeCardInjuredBorder: {
    borderColor: '#FCA5A5',
    borderWidth: 1.5,
  },
  attendeeIdentityTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  attendeeNameInlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  nameSideAlertDot: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  nameSideAlertDotRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  nameSideAlertDotAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  nameSideAlertDotText: {
    fontSize: 10,
    fontWeight: '800',
  },
  quickHeatmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 32,
  },
  quickHeatmapBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  attendeeZoneBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attendeeZoneAlertBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1.2,
  },
  attendeeZoneAlertInjured: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  attendeeZoneAlertWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  attendeeZoneAlertText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  lowEnergyAttendeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFF7ED',
    borderWidth: 1.2,
    borderColor: '#FB923C',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  lowEnergyAttendeeBadgeText: {
    flex: 1,
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
});
