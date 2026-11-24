import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  History,
  Hourglass,
  MapPin,
  Megaphone,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  X,
  Zap,
} from 'lucide-react-native';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AnnouncementItem,
  MemberBookingItem,
  MemberDashboardData,
  MemberWaitlistItem,
} from '@/types/fitness';
import { formatTurkishDateLabel, getDaysRemaining } from '@/utils/dateHelpers';
import {
  getAnnouncementVisuals,
  getCategoryVisuals,
} from '@/screens/member/MemberAvatar';

export interface MemberQrTabProps {
  data: MemberDashboardData;
  accessCode?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenPackageStore?: () => void;
}

function buildDynamicQrMatrix(seedStr: string, size = 25): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const placeFinder = (rowStart: number, colStart: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowStart + r;
        const cc = colStart + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        reserved[rr][cc] = true;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[rr][cc] = inOuter && (onBorder || inCore);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  const alignCenter = size - 7;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = alignCenter + r;
      const cc = alignCenter + c;
      reserved[rr][cc] = true;
      matrix[rr][cc] = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
    }
  }

  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if (r === 6 || c === 6) {
        matrix[r][c] = (r + c) % 2 === 0;
        continue;
      }
      hash ^= (r * 31 + c * 17 + 97) & 0xff;
      hash = Math.imul(hash, 16777619);
      matrix[r][c] = ((hash >>> 3) & 1) === 1;
    }
  }

  return matrix;
}

export function MemberQrTab({
  data,
  accessCode,
  refreshing = false,
  onRefresh,
  onOpenPackageStore,
}: MemberQrTabProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [nonce, setNonce] = useState<number>(() => Math.floor(Date.now() / 30000));

  const blinkOpacity = useRef(new Animated.Value(1)).current;
  const blinkScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(blinkOpacity, {
            toValue: 0.3,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(blinkOpacity, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(blinkScale, {
            toValue: 1.35,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(blinkScale, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [blinkOpacity, blinkScale]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setNonce(Math.floor(Date.now() / 1000));
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const memberAccessId = accessCode ?? `FIT-${1000 + data.member.id}`;
  const pkg = data.active_package;
  const daysRemaining = pkg ? getDaysRemaining(pkg.expiry_date) : 0;
  const isActive = Boolean(
    pkg && pkg.is_active && pkg.remaining_credits > 0 && daysRemaining >= 0
  );

  const daysRemainingLabel = useMemo(() => {
    if (!pkg) return 'Paket Yok';
    if (daysRemaining > 0) return `${daysRemaining} Gün Kaldı`;
    if (daysRemaining === 0) return 'Bugün Son Gün';
    return 'Süresi Doldu';
  }, [pkg, daysRemaining]);

  const tokenPayload = useMemo(() => {
    return `${memberAccessId}-${pkg?.id ?? 0}-${nonce}`;
  }, [memberAccessId, pkg?.id, nonce]);

  const qrSize = 200;
  const gridCount = 25;
  const cellSize = qrSize / gridCount;
  const matrix = useMemo(
    () => buildDynamicQrMatrix(tokenPayload, gridCount),
    [tokenPayload]
  );

  const nextBooking = (data?.my_bookings ?? []).find((b) => b.status === 'booked');
  const recentCheckins = data?.recent_checkins ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        ) : undefined
      }
    >
      {/* 1. DAYLIGHT APPLE WALLET TARZI FERAH GİRİŞ KARTI */}
      <View style={styles.walletPassCard}>
        <View style={styles.passTopSection}>
          <View style={styles.studioBrandRow}>
            <View style={styles.studioLogoWrap}>
              <Sparkles size={16} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.studioName}>ERYA PİLATES REFORMER</Text>
              <Text style={styles.studioSub}>KADINLARA ÖZEL STÜDYO GİRİŞ KARTI</Text>
            </View>
            <View
              style={[
                styles.tierBadge,
                !isActive && styles.tierBadgeWarn,
              ]}
            >
              <Sparkles
                size={12}
                color={isActive ? COLORS.primary : COLORS.warningText}
              />
              <Text
                style={[
                  styles.tierBadgeText,
                  !isActive && { color: COLORS.warningText },
                ]}
              >
                {isActive ? 'AKTİF ÜYE' : 'PAKET KONTROL'}
              </Text>
            </View>
          </View>

          <View style={styles.passIdentityRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldMicroLabel}>ÜYE ADI SOYADI</Text>
              <Text style={styles.passMemberName} numberOfLines={1}>
                {data.member.full_name}
              </Text>
            </View>

            <View style={styles.idCodeBox}>
              <Text style={styles.fieldMicroLabel}>ÜYE KODU</Text>
              <Text style={styles.passIdValue}>{memberAccessId}</Text>
            </View>
          </View>
        </View>

        {/* Biniş Kartı Çentikli Çizgi */}
        <View style={styles.perforationRow}>
          <View style={[styles.punchNotch, styles.punchLeft]} />
          <View style={styles.dashedLine} />
          <View style={[styles.punchNotch, styles.punchRight]} />
        </View>

        {/* Orta QR Bölümü */}
        <View style={styles.passQrSection}>
          <View style={styles.whiteQrBoard}>
            <Svg width={qrSize} height={qrSize}>
              <Rect x={0} y={0} width={qrSize} height={qrSize} fill="#FFFFFF" rx={10} />
              {matrix.map((row, rIdx) =>
                row.map((filled, cIdx) =>
                  filled ? (
                    <Rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx * cellSize}
                      y={rIdx * cellSize}
                      width={cellSize + 0.4}
                      height={cellSize + 0.4}
                      fill={COLORS.textPrimary}
                      rx={1.4}
                    />
                  ) : null
                )
              )}
            </Svg>
          </View>

          <View style={styles.refreshStrip}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(secondsLeft / 30) * 100}%` },
                ]}
              />
            </View>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => {
                setNonce(Date.now());
                setSecondsLeft(30);
              }}
              activeOpacity={0.8}
            >
              <RefreshCw size={12} color={COLORS.primary} />
              <Text style={styles.refreshText}>{secondsLeft}s Yenile</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.liveStatusPill,
              !isActive && styles.liveStatusPillWarn,
            ]}
          >
            <View style={styles.dotContainer}>
              <Animated.View
                style={[
                  styles.liveDotHalo,
                  {
                    backgroundColor: isActive ? COLORS.primary : COLORS.warning,
                    opacity: blinkOpacity,
                    transform: [{ scale: blinkScale }],
                  },
                ]}
              />
              <View
                style={[
                  styles.liveDotCore,
                  { backgroundColor: isActive ? COLORS.primary : COLORS.warning },
                ]}
              />
            </View>
            <Text
              style={[
                styles.liveStatusText,
                !isActive && { color: COLORS.warningText },
              ]}
            >
              {isActive
                ? 'Turnike Geçişi İçin Hazır'
                : 'Turnike Geçişi • Paket Yenileme Önerilir'}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. ÜYELİK DURUMU & KALAN KREDİ ÖZETİ */}
      <View style={styles.summaryBentoCard}>
        <View style={styles.summaryHeaderRow}>
          <View style={styles.summaryHeaderLeft}>
            <QrCode size={17} color={COLORS.primary} />
            <Text style={styles.summaryTitle}>Üyelik & Paket Durumu</Text>
          </View>

          {onOpenPackageStore && (!isActive || (pkg?.remaining_credits ?? 0) <= 2) && (
            <TouchableOpacity
              style={styles.renewMiniBtn}
              onPress={onOpenPackageStore}
              activeOpacity={0.85}
            >
              <Zap size={12} color={COLORS.white} />
              <Text style={styles.renewMiniBtnText}>Paket Yenile</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMiniBox}>
            <Text style={styles.miniBoxLabel}>Durum</Text>
            <View style={styles.miniStatusInline}>
              <ShieldCheck
                size={14}
                color={isActive ? COLORS.primary : COLORS.warningText}
              />
              <Text
                style={[
                  styles.miniStatusText,
                  { color: isActive ? COLORS.primary : COLORS.warningText },
                ]}
              >
                {isActive ? 'Aktif' : 'Pasif'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryMiniBox}>
            <Text style={styles.miniBoxLabel}>Kalan Kredi</Text>
            <Text style={styles.miniBoxNumeric}>
              {pkg ? `${pkg.remaining_credits}/${pkg.total_credits}` : '0/0'}
            </Text>
          </View>

          <View style={styles.summaryMiniBox}>
            <Text style={styles.miniBoxLabel}>Kalan Süre</Text>
            <Text
              style={[
                styles.miniBoxDays,
                {
                  color:
                    daysRemaining <= 7 ? COLORS.warningText : COLORS.secondary,
                },
              ]}
              numberOfLines={1}
            >
              {daysRemainingLabel}
            </Text>
          </View>
        </View>

        {nextBooking && (
          <View style={styles.nextClassBanner}>
            <View style={styles.nextClassTop}>
              <Calendar size={13} color={COLORS.primary} />
              <Text style={styles.nextClassTag}>SIRADAKİ RANDEVUNUZ</Text>
            </View>
            <Text style={styles.nextClassName}>{nextBooking.title}</Text>
            <View style={styles.nextClassMetaRow}>
              <Clock size={13} color={COLORS.textSecondary} />
              <Text style={styles.nextClassTime}>
                {nextBooking.start_time} - {nextBooking.end_time}
              </Text>
              <Text style={styles.nextClassSub}>
                • {formatTurkishDateLabel(nextBooking.date).primary} •{' '}
                {nextBooking.room || 'Ana Stüdyo'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 3. SON SALON GİRİŞLERİM */}
      <View style={styles.summaryHeaderRow}>
        <View style={styles.summaryHeaderLeft}>
          <History size={17} color={COLORS.secondary} />
          <Text style={styles.summaryTitle}>Son Salon Girişlerim</Text>
        </View>
        <View style={styles.checkinsCountPill}>
          <Text style={styles.checkinsCountText}>{recentCheckins.length} Giriş</Text>
        </View>
      </View>

      {recentCheckins.length === 0 ? (
        <View style={styles.emptyCheckinsCard}>
          <CheckCircle2 size={26} color={COLORS.textMuted} />
          <Text style={styles.emptyCheckinsTitle}>Henüz tamamlanan giriş kaydı yok</Text>
          <Text style={styles.emptyCheckinsSub}>
            Salona QR kodunuzla giriş yapıp derslerinizi tamamladıkça giriş geçmişiniz burada listelenir.
          </Text>
        </View>
      ) : (
        recentCheckins.map((log) => {
          const dateFmt = formatTurkishDateLabel(log.date);
          const catVis = getCategoryVisuals(log.category);

          return (
            <View key={log.id} style={styles.checkinCard}>
              <View style={styles.checkinLeftIcon}>
                <CheckCircle2 size={18} color={COLORS.primary} />
              </View>

              <View style={styles.checkinBody}>
                <View style={styles.checkinTopRow}>
                  <Text style={styles.checkinDateText}>
                    {dateFmt.full} • Giriş {log.time}
                  </Text>
                  <View
                    style={[
                      styles.checkinCatBadge,
                      { backgroundColor: catVis.bg, borderColor: catVis.border },
                    ]}
                  >
                    <Text style={[styles.checkinCatText, { color: catVis.color }]}>
                      {catVis.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.checkinTitle}>{log.session_title}</Text>

                <View style={styles.checkinMetaRow}>
                  <View style={styles.checkinMetaItem}>
                    <User size={12} color={COLORS.secondary} />
                    <Text style={styles.checkinMetaText}>{log.trainer_name}</Text>
                  </View>
                  <View style={styles.checkinMetaItem}>
                    <MapPin size={12} color={COLORS.textSecondary} />
                    <Text style={styles.checkinMetaText}>{log.location}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

/* ============================================================================
 * AYDINLIK QR GİRİŞ MODALI (Header & Ana Sayfa Kısayolu İçin)
 * ============================================================================ */

export interface MemberQrModalProps {
  visible: boolean;
  data: MemberDashboardData | null;
  accessCode?: string;
  onClose: () => void;
  onOpenPackageRenew?: () => void;
}

export function MemberQrModal({
  visible,
  data,
  accessCode,
  onClose,
  onOpenPackageRenew,
}: MemberQrModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.modalIconBox}>
              <QrCode size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.modalTitle}>Dijital QR Giriş Kartı</Text>
              <Text style={styles.modalSub}>Turnikeye yaklaştırarak giriş yapabilirsiniz</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <X size={19} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {data ? (
          <MemberQrTab
            data={data}
            accessCode={accessCode}
            onOpenPackageStore={
              onOpenPackageRenew
                ? () => {
                    onClose();
                    setTimeout(() => onOpenPackageRenew(), 240);
                  }
                : undefined
            }
          />
        ) : (
          <View style={styles.modalLoader}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* ============================================================================
 * AYDINLIK BİLDİRİMLER & DURUM MODALI (Header Zil İkonu İçin)
 * ============================================================================ */

export interface MemberNotificationsModalProps {
  visible: boolean;
  dashboard: MemberDashboardData | null;
  announcements?: AnnouncementItem[];
  onClose: () => void;
  onGoToSchedule: () => void;
  onGoToNews: () => void;
  onGoToProfile: () => void;
  onCancelBooking: (booking: MemberBookingItem) => Promise<void>;
  onCancelWaitlistItem: (item: MemberWaitlistItem) => Promise<void>;
  busyBookingId: number | null;
  busyWaitlistId: number | null;
}

export function MemberNotificationsModal({
  visible,
  dashboard,
  announcements = [],
  onClose,
  onGoToSchedule,
  onGoToNews,
  onGoToProfile,
  onCancelBooking,
  onCancelWaitlistItem,
  busyBookingId,
  busyWaitlistId,
}: MemberNotificationsModalProps) {
  const waitlistItems = dashboard?.waitlist_items ?? [];
  const activeBookings = useMemo(
    () => (dashboard?.my_bookings ?? []).filter((b) => b.status === 'booked'),
    [dashboard?.my_bookings]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.modalIconBox}>
              <Bell size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.modalTitle}>Bildirimler & Hatırlatmalar</Text>
              <Text style={styles.modalSub}>
                Yaklaşan dersler, yedek sıra ve son haberler
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <X size={19} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Yedek Liste Sıraları */}
          <View style={styles.notifSectionHeader}>
            <Hourglass size={15} color={COLORS.warningText} />
            <Text style={styles.notifSectionTitle}>
              Yedek Liste Sıralarım ({waitlistItems.length})
            </Text>
          </View>

          {waitlistItems.length === 0 ? (
            <View style={styles.notifEmptyCard}>
              <Text style={styles.notifEmptyText}>
                Şu anda yedek listede beklediğiniz bir ders bulunmuyor.
              </Text>
            </View>
          ) : (
            waitlistItems.map((wItem) => {
              const isBusy = busyWaitlistId === wItem.waitlist_id;
              return (
                <View key={wItem.waitlist_id} style={styles.notifCard}>
                  <View style={styles.notifCardTop}>
                    <View style={styles.waitlistPosPill}>
                      <Text style={styles.waitlistPosPillText}>
                        ⏳ #{wItem.position}. Sıradasınız
                      </Text>
                    </View>
                    <Text style={styles.notifTimeLabel}>
                      {formatTurkishDateLabel(wItem.date).primary} • {wItem.start_time}
                    </Text>
                  </View>
                  <Text style={styles.notifCardTitle}>{wItem.title}</Text>
                  <Text style={styles.notifCardSub}>
                    {wItem.trainer_name} • Yer açıldığında otomatik onaylanır.
                  </Text>
                  <TouchableOpacity
                    style={[styles.notifLeaveWaitlistBtn, isBusy && { opacity: 0.6 }]}
                    disabled={isBusy}
                    onPress={() => onCancelWaitlistItem(wItem)}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={COLORS.warningText} />
                    ) : (
                      <Text style={styles.notifLeaveWaitlistText}>Yedek Listeden Çık</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {/* Yaklaşan Dersler */}
          <View style={styles.notifSectionHeader}>
            <CheckCircle2 size={15} color={COLORS.primary} />
            <Text style={styles.notifSectionTitle}>
              Onaylı Randevularım ({activeBookings.length})
            </Text>
          </View>

          {activeBookings.length === 0 ? (
            <View style={styles.notifEmptyCard}>
              <Text style={styles.notifEmptyText}>
                Yaklaşan onaylı randevunuz bulunmuyor.
              </Text>
              <TouchableOpacity
                style={styles.notifInlineBtn}
                onPress={() => {
                  onClose();
                  onGoToSchedule();
                }}
              >
                <Text style={styles.notifInlineBtnText}>Ders Vakitlerini İncele</Text>
              </TouchableOpacity>
            </View>
          ) : (
            activeBookings.map((bItem) => {
              const isBusy = busyBookingId === bItem.booking_id;
              return (
                <View key={bItem.booking_id} style={styles.notifCard}>
                  <View style={styles.notifCardTop}>
                    <View style={styles.bookedPill}>
                      <Text style={styles.bookedPillText}>✓ Onaylı Ders</Text>
                    </View>
                    <Text style={styles.notifTimeLabel}>
                      {formatTurkishDateLabel(bItem.date).primary} • {bItem.start_time}
                    </Text>
                  </View>
                  <Text style={styles.notifCardTitle}>{bItem.title}</Text>
                  <Text style={styles.notifCardSub}>
                    {bItem.room || 'Ana Stüdyo'} • {bItem.trainer_name}
                  </Text>

                  <TouchableOpacity
                    style={[styles.notifCancelBtn, isBusy && { opacity: 0.6 }]}
                    disabled={isBusy}
                    onPress={() => onCancelBooking(bItem)}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={COLORS.danger} />
                    ) : (
                      <Text style={styles.notifCancelBtnText}>
                        Randevuyu İptal Et (+1 Kredi İade)
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {/* Son Kulüp Haberleri */}
          <View style={styles.notifSectionHeader}>
            <Megaphone size={15} color={COLORS.secondary} />
            <Text style={styles.notifSectionTitle}>
              Son Kulüp Duyuruları ({Math.min(announcements.length, 3)})
            </Text>
          </View>

          {announcements.slice(0, 3).map((ann) => {
            const vis = getAnnouncementVisuals(ann.tag);
            return (
              <View key={ann.id} style={styles.notifCard}>
                <View style={styles.notifCardTop}>
                  <View
                    style={[
                      styles.annTagPill,
                      { backgroundColor: vis.bg, borderColor: vis.border },
                    ]}
                  >
                    <Text style={[styles.annTagText, { color: vis.color }]}>
                      {vis.label}
                    </Text>
                  </View>
                  <Text style={styles.notifTimeLabel}>
                    {formatTurkishDateLabel(ann.date).primary}
                  </Text>
                </View>
                <Text style={styles.notifCardTitle}>{ann.title}</Text>
                <Text style={styles.notifCardSub} numberOfLines={2}>
                  {ann.content}
                </Text>
              </View>
            );
          })}

          <View style={styles.notifFooterRow}>
            <TouchableOpacity
              style={styles.notifFooterLink}
              onPress={() => {
                onClose();
                onGoToNews();
              }}
            >
              <Text style={styles.notifFooterLinkText}>Tüm Haberleri Gör</Text>
              <ArrowRight size={14} color={COLORS.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notifFooterLink}
              onPress={() => {
                onClose();
                onGoToProfile();
              }}
            >
              <Text style={[styles.notifFooterLinkText, { color: COLORS.secondary }]}>
                Bildirim Ayarları
              </Text>
              <ArrowRight size={14} color={COLORS.secondary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 18,
    paddingBottom: 38,
    gap: 16,
  },
  walletPassCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  passTopSection: {
    padding: 20,
    backgroundColor: COLORS.surfaceElevated,
    gap: 16,
  },
  studioBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studioLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studioName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  studioSub: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tierBadgeWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  tierBadgeText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  passIdentityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldMicroLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  passMemberName: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  idCodeBox: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passIdValue: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  perforationRow: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
  },
  punchNotch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  punchLeft: {
    marginLeft: -11,
  },
  punchRight: {
    marginRight: -11,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 8,
  },
  passQrSection: {
    padding: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  whiteQrBoard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  refreshStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#EAE0D0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  refreshText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  liveStatusPill: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'stretch',
    backgroundColor: '#FCF7EA',
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  liveStatusPillWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  dotContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  liveDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveStatusText: {
    color: COLORS.primary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  summaryBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryTitle: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
  },
  renewMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
  },
  renewMiniBtnText: {
    color: COLORS.white,
    fontSize: 11.5,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryMiniBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  miniBoxLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  miniStatusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatusText: {
    fontSize: 14,
    fontWeight: '800',
  },
  miniBoxNumeric: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
  },
  miniBoxDays: {
    fontSize: 13,
    fontWeight: '800',
  },
  nextClassBanner: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  nextClassTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextClassTag: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  nextClassName: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  nextClassMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  nextClassTime: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  nextClassSub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  checkinsCountPill: {
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  checkinsCountText: {
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  emptyCheckinsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...CARD_SHADOW,
  },
  emptyCheckinsTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyCheckinsSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  checkinCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  checkinLeftIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinBody: {
    flex: 1,
    gap: 6,
  },
  checkinTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  checkinDateText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  checkinCatBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  checkinCatText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  checkinTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  checkinMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  checkinMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkinMetaText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  modalHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  modalSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  notifSectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  notifEmptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  notifEmptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  notifInlineBtn: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  notifInlineBtnText: {
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  notifCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...CARD_SHADOW,
  },
  notifCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  waitlistPosPill: {
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  waitlistPosPillText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  bookedPill: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bookedPillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  annTagPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  annTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  notifTimeLabel: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  notifCardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  notifCardSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18.5,
    fontWeight: '500',
  },
  notifLeaveWaitlistBtn: {
    marginTop: 4,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  notifLeaveWaitlistText: {
    color: COLORS.warningText,
    fontSize: 12.5,
    fontWeight: '800',
  },
  notifCancelBtn: {
    marginTop: 4,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: '#F0BFC3',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  notifCancelBtnText: {
    color: COLORS.dangerText,
    fontSize: 12.5,
    fontWeight: '800',
  },
  notifFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  notifFooterLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
  },
  notifFooterLinkText: {
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
});
