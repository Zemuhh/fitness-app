import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Edit3,
  Flame,
  Users,
  X,
} from 'lucide-react-native';
import { COLORS } from '@/theme/colors';
import { TrainerAttendee, TrainerScheduleData, TrainerSession } from '@/types/fitness';
import { formatTurkishDateLabel, getTodayIso, getTomorrowIso } from '@/utils/dateHelpers';

interface Props {
  data: TrainerScheduleData;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAttendance: (bookingId: number, status: 'attended' | 'no_show') => Promise<void>;
  onSaveMemberNote: (memberId: number, notes: string) => Promise<void>;
  busyBookingId: number | null;
  savingNote: boolean;
}

export function TrainerScheduleTab({
  data,
  refreshing,
  onRefresh,
  onMarkAttendance,
  onSaveMemberNote,
  busyBookingId,
  savingNote,
}: Props) {
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();

  const dateOptions = useMemo(() => {
    const set = new Set<string>([todayIso, tomorrowIso, ...data.available_dates]);
    return Array.from(set).sort();
  }, [data.available_dates, todayIso, tomorrowIso]);

  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Record<number, boolean>>({});
  const [editingMember, setEditingMember] = useState<TrainerAttendee | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  const daySessions = useMemo(
    () => data.sessions.filter((s) => s.date === selectedDate),
    [data.sessions, selectedDate]
  );

  // İlk ders kartını varsayılan olarak açık getir
  useEffect(() => {
    if (daySessions.length > 0) {
      setExpandedSessionIds((prev) => {
        const hasAnyForDay = daySessions.some((s) => prev[s.id] !== undefined);
        if (hasAnyForDay) return prev;
        return { ...prev, [daySessions[0].id]: true };
      });
    }
  }, [daySessions]);

  const totalClassesToday = daySessions.length;
  const totalMembersToday = useMemo(
    () => daySessions.reduce((acc, s) => acc + s.attendees.length, 0),
    [daySessions]
  );
  const completedCount = useMemo(
    () =>
      daySessions.reduce(
        (acc, s) =>
          acc +
          s.attendees.filter((a) => a.status === 'attended' || a.status === 'no_show').length,
        0
      ),
    [daySessions]
  );

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
    bookingId: number,
    status: 'attended' | 'no_show'
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await onMarkAttendance(bookingId, status);
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
            tintColor={COLORS.trainerAccent}
          />
        }
      >
        {/* En Üstte Yan Yana 3 Mini Bento İstatistik Kutusu */}
        <View style={styles.bentoStatsRow}>
          <View style={styles.miniBentoBox}>
            <View style={[styles.bentoIconWrap, { backgroundColor: COLORS.indigoSoft }]}>
              <Dumbbell size={15} color={COLORS.trainerAccent} />
            </View>
            <Text style={styles.bentoStatNumber}>{totalClassesToday}</Text>
            <Text style={styles.bentoStatLabel} numberOfLines={1}>
              Bugünkü Ders
            </Text>
          </View>

          <View style={styles.miniBentoBox}>
            <View style={[styles.bentoIconWrap, { backgroundColor: COLORS.emeraldSoft }]}>
              <Users size={15} color={COLORS.primary} />
            </View>
            <Text style={styles.bentoStatNumber}>{totalMembersToday}</Text>
            <Text style={styles.bentoStatLabel} numberOfLines={1}>
              Toplam Katılımcı
            </Text>
          </View>

          <View style={styles.miniBentoBox}>
            <View style={[styles.bentoIconWrap, { backgroundColor: 'rgba(163, 230, 53, 0.14)' }]}>
              <CheckCircle2 size={15} color={COLORS.accentVolt} />
            </View>
            <Text style={[styles.bentoStatNumber, { color: COLORS.accentVolt }]}>
              {completedCount}/{totalMembersToday}
            </Text>
            <Text style={styles.bentoStatLabel} numberOfLines={1}>
              Tamamlanan
            </Text>
          </View>
        </View>

        {/* Yatay Gün Seçici Strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateBar}
        >
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
                <Text style={[styles.datePillTitle, active && styles.datePillTitleActive]}>
                  {fmt.primary}
                </Text>
                <Text style={[styles.datePillSub, active && styles.datePillSubActive]}>
                  {fmt.secondary} • {countOnDate}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Bölüm Başlığı */}
        <View style={styles.sectionHeaderRow}>
          <Clock size={15} color={COLORS.trainerAccent} />
          <Text style={styles.sectionHeading}>
            Saatlik Zaman Çizelgesi • {formatTurkishDateLabel(selectedDate).full}
          </Text>
        </View>

        {/* Saatlik Zaman Çizelgesi (Timeline) */}
        {daySessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Calendar size={30} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Seçili tarihte dersiniz bulunmuyor</Text>
            <Text style={styles.emptySub}>
              Üstteki takvim şeridinden diğer günleri seçerek programınızı görüntüleyebilirsiniz.
            </Text>
          </View>
        ) : (
          daySessions.map((session: TrainerSession, idx: number) => {
            const expanded = Boolean(expandedSessionIds[session.id]);
            const isFull = session.current_enrolled >= session.capacity;
            const spotsLeft = Math.max(0, session.capacity - session.current_enrolled);
            const isLastSpot = !isFull && spotsLeft === 1;
            const isLast = idx === daySessions.length - 1;

            return (
              <View key={session.id} style={styles.timelineRow}>
                {/* Sol Timeline Rayı */}
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      expanded && styles.timelineDotExpanded,
                    ]}
                  />
                  {!isLast && <View style={styles.timelineLine} />}
                </View>

                {/* Ana Ders Bento Kartı */}
                <View style={styles.sessionBentoCard}>
                  <TouchableOpacity
                    style={styles.sessionHeaderTouch}
                    onPress={() => toggleExpand(session.id)}
                    activeOpacity={0.85}
                  >
                    {/* Sol Üstte Dev Puntolu Saat + Sağ Üstte Doluluk Rozeti */}
                    <View style={styles.sessionTopRow}>
                      <View style={styles.bigTimeCluster}>
                        <Text style={styles.bigStartTime}>{session.start_time}</Text>
                        <Text style={styles.endTimeSub}>- {session.end_time}</Text>
                      </View>

                      <View style={styles.topRightGroup}>
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
                                  ? COLORS.danger
                                  : isLastSpot
                                  ? COLORS.warning
                                  : COLORS.primary,
                              },
                            ]}
                          >
                            {session.current_enrolled}/{session.capacity}{' '}
                            {isFull ? 'Dolu' : 'Kayıt'}
                          </Text>
                        </View>

                        {expanded ? (
                          <ChevronUp size={18} color={COLORS.textSecondary} />
                        ) : (
                          <ChevronDown size={18} color={COLORS.textSecondary} />
                        )}
                      </View>
                    </View>

                    <Text style={styles.sessionTitleText}>{session.title}</Text>

                    <Text style={styles.tapHint}>
                      {expanded
                        ? 'Katılımcı listesini daraltmak için dokunun'
                        : `${session.attendees.length} katılımcı • Yoklama & sakatlık notları için dokunun`}
                    </Text>
                  </TouchableOpacity>

                  {/* Katılımcı Alt Kartları */}
                  {expanded && (
                    <View style={styles.attendeeListWrap}>
                      {session.attendees.length === 0 ? (
                        <Text style={styles.noAttendeeText}>
                          Bu derse henüz kayıtlı üye bulunmuyor.
                        </Text>
                      ) : (
                        session.attendees.map((att) => {
                          const isBusy = busyBookingId === att.booking_id;
                          const isLow = att.remaining_credits <= 2;
                          const hasNote = Boolean(att.notes && att.notes.trim().length > 0);

                          return (
                            <View key={att.booking_id} style={styles.attendeeCard}>
                              {/* Üst Satır: İsim + Sağda Kalan Ders Hap Rozeti */}
                              <View style={styles.attendeeHeaderRow}>
                                <View style={styles.nameWithEditCol}>
                                  <Text style={styles.attendeeName} numberOfLines={1}>
                                    {att.full_name}
                                  </Text>
                                  {att.instagram_handle ? (
                                    <Text style={styles.attendeeHandle}>
                                      {att.instagram_handle}
                                    </Text>
                                  ) : null}
                                </View>

                                <View style={styles.headerBadgesRight}>
                                  <View
                                    style={[
                                      styles.remainingPill,
                                      isLow ? styles.remainingPillWarn : styles.remainingPillOk,
                                    ]}
                                  >
                                    {isLow && <Flame size={12} color={COLORS.warning} />}
                                    <Text
                                      style={[
                                        styles.remainingPillText,
                                        { color: isLow ? COLORS.warning : COLORS.primary },
                                      ]}
                                    >
                                      Kalan: {att.remaining_credits} Ders
                                    </Text>
                                  </View>

                                  <TouchableOpacity
                                    style={styles.quickNoteIconBtn}
                                    onPress={() => openEditModal(att)}
                                    activeOpacity={0.78}
                                  >
                                    <Edit3 size={14} color={COLORS.textSecondary} />
                                  </TouchableOpacity>
                                </View>
                              </View>

                              {/* İsmin Hemen Altında Sakatlık / Özel Uyarı Kutusu */}
                              {hasNote ? (
                                <TouchableOpacity
                                  style={styles.injuryWarningBox}
                                  onPress={() => openEditModal(att)}
                                  activeOpacity={0.82}
                                >
                                  <AlertTriangle size={16} color={COLORS.warning} />
                                  <Text style={styles.injuryWarningText}>
                                    ⚠️ {att.notes}
                                  </Text>
                                  <View style={styles.editNoteChip}>
                                    <Edit3 size={11} color={COLORS.warning} />
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

                              {/* Altta Başparmak Dostu Geniş Yan Yana Yoklama Butonları */}
                              <View style={styles.thumbActionsRow}>
                                <TouchableOpacity
                                  style={[
                                    styles.thumbBtn,
                                    att.status === 'attended' && styles.thumbBtnAttendedActive,
                                  ]}
                                  disabled={isBusy}
                                  onPress={() =>
                                    handleAttendancePress(att.booking_id, 'attended')
                                  }
                                  activeOpacity={0.85}
                                >
                                  {isBusy ? (
                                    <ActivityIndicator size="small" color={COLORS.white} />
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
                                  onPress={() =>
                                    handleAttendancePress(att.booking_id, 'no_show')
                                  }
                                  activeOpacity={0.85}
                                >
                                  {isBusy ? (
                                    <ActivityIndicator size="small" color={COLORS.white} />
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
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Hızlı Sakatlık & Antrenman Notu Düzenleme Modalı */}
      <Modal
        visible={Boolean(editingMember)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingMember(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Sakatlık & Antrenman Notu</Text>
                <Text style={styles.modalSubtitle}>{editingMember?.full_name}</Text>
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
              placeholder="Örn: Bel fıtığı hassasiyeti var, ağır deadlift yerine core stabilizasyon uygulanmalı..."
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
        </View>
      </Modal>
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
    padding: 16,
    paddingBottom: 36,
  },
  bentoStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  miniBentoBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
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
    letterSpacing: -0.5,
  },
  bentoStatLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  dateBar: {
    gap: 10,
    paddingVertical: 4,
    marginBottom: 16,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  datePillActive: {
    backgroundColor: COLORS.trainerAccent,
    borderColor: COLORS.trainerAccent,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  datePillTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  datePillTitleActive: {
    color: COLORS.white,
  },
  datePillSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  datePillSubActive: {
    color: '#E0E7FF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 14,
  },
  sectionHeading: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    paddingVertical: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    marginTop: 10,
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 5,
    lineHeight: 19,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineRail: {
    width: 16,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 2,
    borderColor: COLORS.trainerAccent,
    marginTop: 22,
  },
  timelineDotExpanded: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.accentVolt,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  sessionBentoCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  sessionHeaderTouch: {
    padding: 18,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bigTimeCluster: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  bigStartTime: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  endTimeSub: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  occupancyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  occupancyOpen: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  occupancyWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.40)',
  },
  occupancyFull: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.40)',
  },
  occupancyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sessionTitleText: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tapHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  attendeeListWrap: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: 'rgba(9, 13, 22, 0.55)',
    padding: 14,
    gap: 12,
  },
  noAttendeeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 10,
  },
  attendeeCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  attendeeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameWithEditCol: {
    flex: 1,
  },
  attendeeName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  attendeeHandle: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  remainingPillOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  remainingPillWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: COLORS.warning,
  },
  remainingPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  quickNoteIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  injuryWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  injuryWarningText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  editNoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editNoteChipText: {
    color: COLORS.warning,
    fontSize: 10.5,
    fontWeight: '800',
  },
  addNoteSubtleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addNoteSubtleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  thumbActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumbBtnAttendedActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbBtnNoShowActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  thumbBtnTextAttendedActive: {
    color: '#090D16',
  },
  thumbBtnTextNoShowActive: {
    color: COLORS.white,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.84)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: COLORS.accentVolt,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  closeModalBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteInput: {
    backgroundColor: COLORS.background,
    color: COLORS.textPrimary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    minHeight: 115,
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.trainerAccent,
    alignItems: 'center',
  },
  modalSaveText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
