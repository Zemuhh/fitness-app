import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowRight,
  Award,
  Calendar,
  Clock,
  Flame,
  MapPin,
  QrCode,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react-native';
import { ActivityRing } from '@/components/ActivityRing';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import {
  AppUser,
  MemberBookingItem,
  MemberDashboardData,
  MemberDrawerRoute,
} from '@/types/fitness';
import { formatTurkishDateLabel, getDaysRemaining } from '@/utils/dateHelpers';
import { getCategoryVisuals } from '@/screens/member/MemberAvatar';

export interface MemberDashboardTabProps {
  member: AppUser;
  dashboard: MemberDashboardData;
  onRefreshParent: () => Promise<void> | void;
  onNavigate: (route: MemberDrawerRoute) => void;
  onOpenQr: () => void;
  onCancelBooking: (booking: MemberBookingItem) => Promise<void>;
  busyBookingId: number | null;
}

export function MemberDashboardTab({
  member,
  dashboard,
  onRefreshParent,
  onNavigate,
  onOpenQr,
  onCancelBooking,
  busyBookingId,
}: MemberDashboardTabProps) {
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.resolve(onRefreshParent());
    setRefreshing(false);
  }, [onRefreshParent]);

  const firstName = useMemo(() => {
    const clean = (dashboard.member?.full_name || member.full_name || '').trim();
    return clean.split(/\s+/)[0] || 'Üyemiz';
  }, [dashboard.member?.full_name, member.full_name]);

  const greetingWord = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Günaydın';
    if (hour >= 12 && hour < 18) return 'Merhaba';
    return 'İyi akşamlar';
  }, []);

  const streakDays = dashboard.member?.streak_days ?? member.streak_days ?? 0;
  const pkg = dashboard.active_package;
  const remainingCredits = pkg?.remaining_credits ?? 0;
  const totalCredits = pkg?.total_credits ?? 0;
  const isLowCredits = remainingCredits <= 2;
  const daysLeft = getDaysRemaining(pkg?.expiry_date);

  const upcomingBooking = useMemo(() => {
    return dashboard.my_bookings.find((b) => b.status === 'booked') ?? null;
  }, [dashboard.my_bookings]);

  const upcomingCatVis = upcomingBooking
    ? getCategoryVisuals(upcomingBooking.category)
    : null;

  const isCancellingUpcoming =
    upcomingBooking !== null && busyBookingId === upcomingBooking.booking_id;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {/* 1. ZARİF KARŞILAMA BAŞLIĞI & DÜZENLİ SERİ ROZETİ */}
        <View style={styles.greetingSection}>
          <View style={styles.greetingTextCol}>
            <Text style={styles.greetingTitle}>
              {greetingWord}, {firstName}
            </Text>
            <Text style={styles.greetingSubtitle}>
              Güçlü beden, dik duruş ve zihinsel denge için stüdyonuz hazır.
            </Text>
          </View>

          <View style={styles.streakBadge}>
            <Flame size={14} color={COLORS.primary} fill={COLORS.primaryMetallic} />
            <Text style={styles.streakBadgeText}>{streakDays} Haftalık Seri</Text>
          </View>
        </View>

        {/* 2. ERYA PİLATES İMZA MİMARİ KEMERLİ STÜDYO KARTI */}
        <View style={styles.studioSignatureBanner}>
          <View style={styles.archHaloTopLine} />
          <View style={styles.signatureTopRow}>
            <EryaBrandLogo size={38} />
            <View style={styles.signatureTextWrap}>
              <Text style={styles.signatureMotto}>
                DENGEYLE GÜÇLEN • ZARAFETLE PARLA
              </Text>
              <Text style={styles.signatureScriptQuote}>
                “A journey to your best self”
              </Text>
            </View>
          </View>

          <View style={styles.signatureMetaRow}>
            <View style={styles.locationChip}>
              <MapPin size={12} color={COLORS.primary} />
              <Text style={styles.locationChipText}>
                Eryaman Port AVM D:2/2C • 09:00–22:00
              </Text>
            </View>
            <View style={styles.multisportChip}>
              <Award size={12} color={COLORS.secondary} />
              <Text style={styles.multisportChipText}>MultiSport Geçerli</Text>
            </View>
          </View>
        </View>

        {/* 3. KALAN SEANS & AKTİF REFORMER/CADILLAC PAKET KARTI */}
        <View style={styles.creditsCard}>
          <View style={styles.creditsCardRow}>
            <View style={styles.creditsInfoCol}>
              <View
                style={[
                  styles.pkgStatusPill,
                  (!pkg || isLowCredits) && styles.pkgStatusPillWarning,
                ]}
              >
                <Sparkles
                  size={12}
                  color={!pkg || isLowCredits ? COLORS.secondary : COLORS.primary}
                />
                <Text
                  style={[
                    styles.pkgStatusPillText,
                    (!pkg || isLowCredits) && { color: COLORS.secondary },
                  ]}
                >
                  {pkg
                    ? isLowCredits
                      ? 'Seans Hakkı Azalıyor'
                      : `${Math.max(0, daysLeft)} Gün Geçerli`
                    : 'Aktif Paket Yok'}
                </Text>
              </View>

              <Text style={styles.pkgNameTitle} numberOfLines={2}>
                {pkg ? pkg.package_name : 'Henüz Aktif Paketiniz Yok'}
              </Text>

              <Text style={styles.pkgExpiryText}>
                {pkg
                  ? `Son Geçerlilik: ${formatTurkishDateLabel(pkg.expiry_date).full}`
                  : 'Reformer & Cadillac seansları için paket seçin'}
              </Text>

              <TouchableOpacity
                style={styles.renewInlineLink}
                onPress={() => onNavigate('packages')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Üyelik paketini yenile"
              >
                <Text style={styles.renewInlineLinkText}>Paketi Yenile</Text>
                <ArrowRight size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.ringWrapper}>
              <ActivityRing
                remaining={remainingCredits}
                total={totalCredits}
                size={128}
                strokeWidth={11}
              />
            </View>
          </View>
        </View>

        {/* 4. YAKLAŞAN SEANS RANDEVU KARTI */}
        <View style={styles.upcomingCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.headerIconBadge}>
                <Calendar size={15} color={COLORS.primary} />
              </View>
              <Text style={styles.cardSectionTitle}>Yaklaşan Seansım</Text>
            </View>

            {upcomingBooking && upcomingCatVis && (
              <View
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: upcomingCatVis.bg,
                    borderColor: upcomingCatVis.border,
                  },
                ]}
              >
                <Text
                  style={[styles.categoryBadgeText, { color: upcomingCatVis.color }]}
                >
                  {upcomingCatVis.label}
                </Text>
              </View>
            )}
          </View>

          {upcomingBooking ? (
            <View style={styles.upcomingBody}>
              <Text style={styles.upcomingClassTitle}>{upcomingBooking.title}</Text>

              <View style={styles.upcomingMetaBox}>
                <View style={styles.upcomingMetaRow}>
                  <Clock size={14} color={COLORS.primary} />
                  <Text style={styles.upcomingTimeText}>
                    {formatTurkishDateLabel(upcomingBooking.date).full} •{' '}
                    {upcomingBooking.start_time} - {upcomingBooking.end_time}
                  </Text>
                </View>

                <View style={styles.upcomingMetaSplit}>
                  <View style={styles.upcomingMetaRow}>
                    <User size={14} color={COLORS.secondary} />
                    <Text style={styles.upcomingSubText}>
                      {upcomingBooking.trainer_name}
                    </Text>
                  </View>

                  <View style={styles.upcomingMetaRow}>
                    <MapPin size={14} color={COLORS.walnut} />
                    <Text style={styles.upcomingSubText}>
                      {upcomingBooking.room || 'Kemerli Ayna Reformer Salonu'}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.cancelBookingBtn,
                  isCancellingUpcoming && { opacity: 0.65 },
                ]}
                disabled={isCancellingUpcoming}
                onPress={() => onCancelBooking(upcomingBooking)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Randevuyu iptal et ve 1 seans iade al"
              >
                {isCancellingUpcoming ? (
                  <ActivityIndicator size="small" color={COLORS.danger} />
                ) : (
                  <>
                    <XCircle size={15} color={COLORS.danger} />
                    <Text style={styles.cancelBookingBtnText}>
                      Randevuyu İptal Et (+1 Seans İade)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyUpcomingBox}>
              <Text style={styles.emptyUpcomingTitle}>
                Planlanmış aktif seansınız bulunmuyor
              </Text>
              <Text style={styles.emptyUpcomingDesc}>
                Reformer, Cadillac, Düet veya Bireysel ders saatlerini inceleyip yerinizi hemen ayırtabilirsiniz.
              </Text>
              <TouchableOpacity
                style={styles.chooseClassBtn}
                onPress={() => onNavigate('schedule')}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Calendar size={15} color={COLORS.white} />
                <Text style={styles.chooseClassBtnText}>Seans Saatlerini İncele</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 5. YAN YANA 2 ADET HIZLI STÜDYO KISAYOLU (VEKTÖR İKONLU) */}
        <View style={styles.shortcutsRow}>
          <TouchableOpacity
            style={styles.shortcutCard}
            onPress={() => onNavigate('schedule')}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Seans seç ve rezervasyon yap"
          >
            <View
              style={[
                styles.shortcutIconCircle,
                {
                  backgroundColor: COLORS.primaryLight,
                  borderColor: COLORS.primaryBorder,
                },
              ]}
            >
              <Calendar size={21} color={COLORS.primary} />
            </View>
            <Text style={styles.shortcutTitle}>Seans Seç</Text>
            <Text style={styles.shortcutSub}>Reformer & Cadillac Takvimi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutCard}
            onPress={onOpenQr}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Dijital stüdyo QR giriş kartını aç"
          >
            <View
              style={[
                styles.shortcutIconCircle,
                {
                  backgroundColor: COLORS.secondaryLight,
                  borderColor: COLORS.secondaryBorder,
                },
              ]}
            >
              <QrCode size={21} color={COLORS.secondary} />
            </View>
            <Text style={styles.shortcutTitle}>QR Stüdyo Giriş</Text>
            <Text style={styles.shortcutSub}>Dijital Üyelik Kartım</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  greetingSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  greetingTextCol: {
    flex: 1,
    gap: 4,
  },
  greetingTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 31,
  },
  greetingSubtitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18.5,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  streakBadgeText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  studioSignatureBanner: {
    backgroundColor: COLORS.espresso,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3E3326',
    gap: 12,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  archHaloTopLine: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 2.5,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: COLORS.primaryMetallic,
  },
  signatureTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signatureTextWrap: {
    flex: 1,
    gap: 2,
  },
  signatureMotto: {
    fontFamily: FONTS.sans,
    color: '#FAF0D7',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  signatureScriptQuote: {
    fontFamily: FONTS.serif,
    fontStyle: 'italic',
    color: '#E5CB90',
    fontSize: 16,
    fontWeight: '600',
  },
  signatureMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229, 203, 144, 0.18)',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationChipText: {
    fontFamily: FONTS.sans,
    color: '#D8CEBF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  multisportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(248, 236, 238, 0.94)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  multisportChipText: {
    fontFamily: FONTS.sans,
    color: COLORS.secondary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  creditsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  creditsCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  creditsInfoCol: {
    flex: 1,
    gap: 8,
  },
  pkgStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  pkgStatusPillWarning: {
    backgroundColor: COLORS.secondaryLight,
    borderColor: COLORS.secondaryBorder,
  },
  pkgStatusPillText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  pkgNameTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 25,
  },
  pkgExpiryText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  renewInlineLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    minHeight: 38,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: COLORS.primarySurface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  renewInlineLinkText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  ringWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSectionTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '800',
  },
  upcomingBody: {
    gap: 12,
  },
  upcomingClassTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 20.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  upcomingMetaBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  upcomingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  upcomingMetaSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  upcomingTimeText: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  upcomingSubText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 46,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 14,
    paddingVertical: 12,
  },
  cancelBookingBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.dangerText,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyUpcomingBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: 8,
  },
  emptyUpcomingTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyUpcomingDesc: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  chooseClassBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
  },
  chooseClassBtnText: {
    fontFamily: FONTS.sans,
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
    gap: 7,
    ...CARD_SHADOW,
  },
  shortcutIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  shortcutTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  shortcutSub: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
