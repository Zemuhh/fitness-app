import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  Hourglass,
  MapPin,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AppUser,
  AvailableSession,
  BookingActionResponse,
  TrainerDetail,
  WaitlistActionResponse,
} from '@/types/fitness';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';
import { getCategoryVisuals, MemberAvatar } from '@/screens/member/MemberAvatar';

interface TrainerDetailModalProps {
  visible: boolean;
  trainerId: number | null;
  member: AppUser;
  remainingCredits: number;
  onClose: () => void;
  onSessionMutated: (
    type: 'success' | 'warning' | 'error',
    message: string
  ) => Promise<void> | void;
  onOpenPackageStore: () => void;
}

export function TrainerDetailModal({
  visible,
  trainerId,
  member,
  remainingCredits,
  onClose,
  onSessionMutated,
  onOpenPackageStore,
}: TrainerDetailModalProps) {
  const [detail, setDetail] = useState<TrainerDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<number | null>(null);
  const [localFeedback, setLocalFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const showLocalFeedback = useCallback(
    (type: 'success' | 'warning' | 'error', text: string) => {
      setLocalFeedback({ type, text });
      setTimeout(() => {
        setLocalFeedback((prev) => (prev?.text === text ? null : prev));
      }, 3800);
    },
    []
  );

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!trainerId) return;
      if (!silent) setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiRequest<TrainerDetail>(
          `/trainers/${trainerId}?member_id=${member.id}`
        );
        setDetail(res);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Eğitmen detayları yüklenemedi.');
      } finally {
        setLoading(false);
      }
    },
    [trainerId, member.id]
  );

  useEffect(() => {
    if (visible && trainerId) {
      setLocalFeedback(null);
      fetchDetail(false);
    }
  }, [visible, trainerId, fetchDetail]);

  const handleBookSession = async (session: AvailableSession) => {
    if (remainingCredits <= 0) {
      onOpenPackageStore();
      return;
    }
    setBusySessionId(session.id);
    try {
      const res = await apiRequest<BookingActionResponse>('/bookings/create', {
        method: 'POST',
        body: JSON.stringify({
          member_id: member.id,
          session_id: session.id,
        }),
      });
      const msg = `${session.title} dersine kaydınız alındı! Kalan kredi: ${res.remaining_credits}`;
      showLocalFeedback('success', msg);
      await fetchDetail(true);
      await onSessionMutated('success', msg);
    } catch (err: any) {
      showLocalFeedback('error', err?.message || 'Derse kayıt olunamadı.');
    } finally {
      setBusySessionId(null);
    }
  };

  const handleCancelBooking = async (session: AvailableSession) => {
    setBusySessionId(session.id);
    try {
      const res = await apiRequest<BookingActionResponse>('/bookings/cancel', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: session.booking_id ?? undefined,
          member_id: member.id,
          session_id: session.id,
        }),
      });
      const msg = res.promoted_from_waitlist_member_name
        ? `Kaydınız iptal edildi (+1 kredi iade). Yedek listeden ${res.promoted_from_waitlist_member_name} otomatik derse alındı.`
        : `${session.title} kaydınız iptal edildi. Kalan kredi: ${res.remaining_credits}`;
      showLocalFeedback('success', msg);
      await fetchDetail(true);
      await onSessionMutated('success', msg);
    } catch (err: any) {
      showLocalFeedback('error', err?.message || 'Kayıt iptal edilemedi.');
    } finally {
      setBusySessionId(null);
    }
  };

  const handleJoinWaitlist = async (session: AvailableSession) => {
    if (remainingCredits <= 0) {
      onOpenPackageStore();
      return;
    }
    setBusySessionId(session.id);
    try {
      const res = await apiRequest<WaitlistActionResponse>('/bookings/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          member_id: member.id,
          session_id: session.id,
        }),
      });
      const msg = `${session.title} için yedek listeye #${res.position}. sıradan yazıldınız!`;
      showLocalFeedback('warning', msg);
      await fetchDetail(true);
      await onSessionMutated('warning', msg);
    } catch (err: any) {
      showLocalFeedback('error', err?.message || 'Yedek listeye yazılamadı.');
    } finally {
      setBusySessionId(null);
    }
  };

  const handleLeaveWaitlist = async (session: AvailableSession) => {
    setBusySessionId(session.id);
    try {
      await apiRequest<WaitlistActionResponse>('/bookings/waitlist/cancel', {
        method: 'POST',
        body: JSON.stringify({
          waitlist_id: session.waitlist_id ?? undefined,
          member_id: member.id,
          session_id: session.id,
        }),
      });
      const msg = `${session.title} yedek listesinden çıkıldı.`;
      showLocalFeedback('success', msg);
      await fetchDetail(true);
      await onSessionMutated('success', msg);
    } catch (err: any) {
      showLocalFeedback('error', err?.message || 'Yedek listeden çıkılamadı.');
    } finally {
      setBusySessionId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        {/* Aydınlık Modal Üst Barı */}
        <View style={styles.headerBar}>
          <View style={styles.headerBadge}>
            <Sparkles size={13} color={COLORS.secondary} />
            <Text style={styles.headerBadgeText}>EĞİTMEN PROFİLİ & AÇIK DERSLER</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityLabel="Eğitmen detayını kapat"
          >
            <X size={19} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {localFeedback && (
          <View
            style={[
              styles.feedbackBanner,
              localFeedback.type === 'success'
                ? styles.feedbackSuccess
                : localFeedback.type === 'warning'
                ? styles.feedbackWarning
                : styles.feedbackError,
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                {
                  color:
                    localFeedback.type === 'success'
                      ? COLORS.primary
                      : localFeedback.type === 'warning'
                      ? COLORS.warningText
                      : COLORS.dangerText,
                },
              ]}
            >
              {localFeedback.text}
            </Text>
          </View>
        )}

        {loading && !detail ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Eğitmen profili ve açık dersler yükleniyor...</Text>
          </View>
        ) : errorMsg && !detail ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchDetail(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : detail ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero Eğitmen Kimlik Kartı */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <MemberAvatar
                  uri={detail.avatar_url}
                  name={detail.full_name}
                  size={80}
                  borderRadius={24}
                  accentColor={COLORS.secondary}
                />
                <View style={styles.heroInfoCol}>
                  <View style={styles.ratingRow}>
                    <View style={styles.ratingPill}>
                      <Star size={12} color={COLORS.warningText} fill={COLORS.warning} />
                      <Text style={styles.ratingText}>{detail.rating.toFixed(1)}</Text>
                    </View>
                    <View style={styles.expPill}>
                      <Text style={styles.expText}>{detail.experience_years} Yıl Deneyim</Text>
                    </View>
                  </View>

                  <Text style={styles.trainerName}>{detail.full_name}</Text>
                  <Text style={styles.specialtyText}>
                    {detail.specialty || 'Atletik Performans & Kondisyon'}
                  </Text>
                  {detail.instagram_handle ? (
                    <Text style={styles.handleText}>{detail.instagram_handle}</Text>
                  ) : null}
                </View>
              </View>

              {/* 3 İstatistik Kutusu */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{detail.monthly_classes_given}</Text>
                  <Text style={styles.statLabel}>Aylık Ders</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, { color: COLORS.primary }]}>
                    {detail.total_students_count}
                  </Text>
                  <Text style={styles.statLabel}>Aktif Üye</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, { color: COLORS.secondary }]}>
                    %{detail.attendance_rate_pct}
                  </Text>
                  <Text style={styles.statLabel}>Katılım</Text>
                </View>
              </View>
            </View>

            {/* Hakkında / Biyografi */}
            {detail.bio ? (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Dumbbell size={16} color={COLORS.secondary} />
                  <Text style={styles.sectionTitle}>Uzmanlık & Yaklaşım</Text>
                </View>
                <Text style={styles.bioText}>{detail.bio}</Text>
              </View>
            ) : null}

            {/* Sertifikalar */}
            {detail.certificates && detail.certificates.length > 0 ? (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Award size={16} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Sertifikalar & Lisanslar</Text>
                </View>
                <View style={styles.certList}>
                  {detail.certificates.map((cert, index) => (
                    <View key={`${cert}-${index}`} style={styles.certBadge}>
                      <CheckCircle2 size={13} color={COLORS.primary} />
                      <Text style={styles.certBadgeText}>{cert}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Bu Eğitmenin Açık Dersleri */}
            <View style={styles.openSessionsHeader}>
              <View style={styles.sectionHeaderRow}>
                <Calendar size={17} color={COLORS.primary} />
                <Text style={styles.openSessionsTitle}>Açık Ders Vakitleri</Text>
              </View>
              <View style={styles.creditMiniPill}>
                <Text style={styles.creditMiniPillText}>Kalan: {remainingCredits} Ders</Text>
              </View>
            </View>

            {(detail.open_sessions ?? []).length === 0 ? (
              <View style={styles.emptySessionsCard}>
                <Calendar size={26} color={COLORS.textMuted} />
                <Text style={styles.emptySessionsTitle}>Yaklaşan açık ders bulunmuyor</Text>
                <Text style={styles.emptySessionsSub}>
                  Eğitmenin yeni seansları açıldığında buradan anında kayıt olabilirsiniz.
                </Text>
              </View>
            ) : (
              (detail.open_sessions ?? []).map((session) => {
                const isFull =
                  session.is_full || session.current_enrolled >= session.capacity;
                const spotsLeft = Math.max(0, session.capacity - session.current_enrolled);
                const isLastSpot = !isFull && spotsLeft === 1;
                const isBooked = session.is_booked_by_member;
                const isWaitlisted = Boolean(session.is_waitlisted_by_member);
                const isBusy = busySessionId === session.id;
                const catVis = getCategoryVisuals(session.category);
                const dateLabel = formatTurkishDateLabel(session.date);
                const fillRatio =
                  session.capacity > 0
                    ? Math.min(1, session.current_enrolled / session.capacity)
                    : 1;
                const statusColor =
                  isFull || isLastSpot ? COLORS.warningText : COLORS.primary;
                const barColor =
                  isFull || isLastSpot ? COLORS.warning : COLORS.primary;

                return (
                  <View key={session.id} style={styles.sessionCard}>
                    <View style={styles.sessionTopRow}>
                      <View style={styles.timePill}>
                        <Clock size={13} color={COLORS.primary} />
                        <Text style={styles.timeText}>
                          {session.start_time} - {session.end_time}
                        </Text>
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

                    <Text style={styles.sessionTitle}>{session.title}</Text>

                    <View style={styles.sessionMetaRow}>
                      <View style={styles.metaChip}>
                        <Calendar size={12} color={COLORS.textSecondary} />
                        <Text style={styles.metaChipText}>{dateLabel.full}</Text>
                      </View>
                      <View style={styles.metaChip}>
                        <MapPin size={12} color={COLORS.secondary} />
                        <Text style={styles.metaChipText}>
                          {session.room || 'Ana Stüdyo'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.capacityContainer}>
                      <View style={styles.capacityLabelRow}>
                        <View style={styles.capacityLeftInfo}>
                          <Users size={12} color={statusColor} />
                          <Text style={[styles.capacityValueText, { color: statusColor }]}>
                            {session.current_enrolled}/{session.capacity}{' '}
                            {isFull ? 'Kontenjan Dolu' : 'Kayıtlı'}
                          </Text>
                        </View>
                        {isLastSpot ? (
                          <View style={styles.lastSpotInline}>
                            <Flame size={12} color={COLORS.warningText} />
                            <Text style={styles.lastSpotText}>Son 1 Yer!</Text>
                          </View>
                        ) : isFull && (session.waitlist_count ?? 0) > 0 ? (
                          <Text style={styles.waitlistCountText}>
                            {session.waitlist_count} kişi yedekte
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.capacityTrack}>
                        <View
                          style={[
                            styles.capacityFill,
                            { width: `${fillRatio * 100}%`, backgroundColor: barColor },
                          ]}
                        />
                      </View>
                    </View>

                    {isBooked ? (
                      <TouchableOpacity
                        style={[styles.cancelBtn, isBusy && styles.disabledBtn]}
                        disabled={isBusy}
                        onPress={() => handleCancelBooking(session)}
                        activeOpacity={0.84}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={COLORS.danger} />
                        ) : (
                          <>
                            <CheckCircle2 size={15} color={COLORS.danger} />
                            <Text style={styles.cancelBtnText}>✓ Kayıtlısın (İptal Et)</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : isFull ? (
                      isWaitlisted ? (
                        <TouchableOpacity
                          style={[styles.waitlistedLeaveBtn, isBusy && styles.disabledBtn]}
                          disabled={isBusy}
                          onPress={() => handleLeaveWaitlist(session)}
                          activeOpacity={0.84}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={COLORS.warningText} />
                          ) : (
                            <>
                              <Hourglass size={15} color={COLORS.warningText} />
                              <Text style={styles.waitlistedLeaveBtnText}>
                                ⏳ Yedek Listedesin (#{session.waitlist_position ?? 1} • Çık)
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.waitlistJoinBtn, isBusy && styles.disabledBtn]}
                          disabled={isBusy}
                          onPress={() => handleJoinWaitlist(session)}
                          activeOpacity={0.86}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={COLORS.warningText} />
                          ) : (
                            <>
                              <Hourglass size={15} color={COLORS.warningText} />
                              <Text style={styles.waitlistJoinBtnText}>
                                {remainingCredits <= 0
                                  ? 'Ders Hakkı Yetersiz • Paket Bilgilerim'
                                  : '⏳ Yedek Listeye Yazıl'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )
                    ) : (
                      <TouchableOpacity
                        style={[styles.bookBtn, isBusy && styles.disabledBtn]}
                        disabled={isBusy}
                        onPress={() => handleBookSession(session)}
                        activeOpacity={0.86}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={COLORS.white} />
                        ) : (
                          <Text style={styles.bookBtnText}>
                            {remainingCredits <= 0
                              ? 'Ders Hakkı Yetersiz • Paket Bilgilerim'
                              : 'Hemen Kayıt Ol'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  headerBadgeText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBanner: {
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  feedbackWarning: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  feedbackError: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  feedbackText: {
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...CARD_SHADOW,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroInfoCol: {
    flex: 1,
    gap: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ratingText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  expPill: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  expText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  trainerName: {
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  specialtyText: {
    color: COLORS.secondary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  handleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  statNumber: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  bioText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  certList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
  },
  certBadgeText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  openSessionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  openSessionsTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  creditMiniPill: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  creditMiniPillText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  emptySessionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...CARD_SHADOW,
  },
  emptySessionsTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  emptySessionsSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...CARD_SHADOW,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  timeText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
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
  sessionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  sessionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaChipText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  capacityContainer: {
    gap: 6,
  },
  capacityLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capacityLeftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  capacityValueText: {
    fontSize: 12,
    fontWeight: '800',
  },
  lastSpotInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastSpotText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  waitlistCountText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '700',
  },
  capacityTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#EAE0D0',
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 999,
  },
  bookBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: '#F0BFC3',
    borderRadius: 14,
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: COLORS.dangerText,
    fontSize: 13,
    fontWeight: '800',
  },
  waitlistJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 14,
    paddingVertical: 12.5,
  },
  waitlistJoinBtnText: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '800',
  },
  waitlistedLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 14,
    paddingVertical: 12,
  },
  waitlistedLeaveBtnText: {
    color: COLORS.warningText,
    fontSize: 13,
    fontWeight: '800',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
