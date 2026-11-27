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
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  ArrowRight,
  Award,
  Calendar,
  Clock,
  Droplets,
  Flame,
  Gift,
  MapPin,
  Plus,
  QrCode,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { ActivityRing } from '@/components/ActivityRing';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { LiveGymOccupancyCard } from '@/components/LiveGymOccupancyCard';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import {
  AppUser,
  ClubHomeData,
  DailyWellness,
  EnergyStatus,
  MemberBookingItem,
  MemberDashboardData,
  MemberDashboardSummary,
  MemberDrawerRoute,
} from '@/types/fitness';
import { formatTurkishDateLabel, getDaysRemaining } from '@/utils/dateHelpers';
import { getCategoryVisuals } from '@/screens/member/MemberAvatar';

export interface MemberDashboardTabProps {
  member: AppUser;
  dashboard?: MemberDashboardData | null;
  summary?: MemberDashboardSummary | null;
  onRefreshParent: () => Promise<void> | void;
  onNavigate: (route: MemberDrawerRoute) => void;
  onOpenQr: () => void;
  onCancelBooking: (booking: MemberBookingItem) => Promise<void>;
  busyBookingId: number | null;
}

const HOME_ENERGY_CHOICES: Array<{
  key: EnergyStatus;
  label: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
}> = [
  {
    key: 'high',
    label: '🔋 Enerjik',
    activeBg: '#ECFDF5',
    activeBorder: '#34D399',
    activeText: '#047857',
  },
  {
    key: 'normal',
    label: '⚡ Normal',
    activeBg: '#EFF6FF',
    activeBorder: '#60A5FA',
    activeText: '#1D4ED8',
  },
  {
    key: 'low',
    label: '🪫 Uykusuz / Yorgunum',
    activeBg: '#FFFBEB',
    activeBorder: '#F59E0B',
    activeText: '#B45309',
  },
];

function formatLitersValue(ml: number): string {
  const liters = Math.max(0, ml) / 1000;
  const rounded = Math.round(liters * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toFixed(1);
  const twoDec = rounded.toFixed(2);
  return twoDec.endsWith('0') ? rounded.toFixed(1) : twoDec;
}

function deriveInviteCode(fullName: string, id: number): string {
  const clean = (fullName || 'UYE')
    .trim()
    .split(/\s+/)[0]
    .replace(/ğ/gi, 'G')
    .replace(/ü/gi, 'U')
    .replace(/ş/gi, 'S')
    .replace(/ı/gi, 'I')
    .replace(/i/gi, 'I')
    .replace(/ö/gi, 'O')
    .replace(/ç/gi, 'C')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return `${clean || `FIT${id}`}10`;
}

export function MemberDashboardTab({
  member,
  dashboard,
  summary,
  onRefreshParent,
  onNavigate,
  onOpenQr,
  onCancelBooking,
  busyBookingId,
}: MemberDashboardTabProps) {
  const { refreshSignal, triggerGlobalRefresh } = useAuthDemo();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [liveRefreshCount, setLiveRefreshCount] = useState<number>(0);
  const [localSummary, setLocalSummary] = useState<MemberDashboardSummary | null>(
    summary ?? null
  );
  const [loadingSummary, setLoadingSummary] = useState<boolean>(
    !summary && !dashboard
  );

  const effectiveSummary = summary ?? localSummary;
  const effectiveMember =
    effectiveSummary?.member ?? dashboard?.member ?? member;

  const [wellness, setWellness] = useState<DailyWellness>(() =>
    summary?.today_wellness ?? {
      member_id: member.id,
      date: new Date().toISOString().slice(0, 10),
      water_ml: 0,
      water_goal_ml: 3000,
      sleep_hours: 7.5,
      energy_status: 'normal',
      calories_intake: 0,
      calories_goal: 2100,
      protein_g: 0,
      protein_goal_g: 140,
      carbs_g: 0,
      carbs_goal_g: 220,
      fat_g: 0,
      fat_goal_g: 65,
    }
  );
  const [addingWater, setAddingWater] = useState<boolean>(false);

  const fallbackInviteCode = useMemo(
    () =>
      effectiveMember?.referral_code ||
      member.referral_code ||
      deriveInviteCode(effectiveMember?.full_name || member.full_name, member.id),
    [
      effectiveMember?.full_name,
      effectiveMember?.referral_code,
      member.full_name,
      member.id,
      member.referral_code,
    ]
  );

  const [inviteCode, setInviteCode] = useState<string>(fallbackInviteCode);
  const [referralCount, setReferralCount] = useState<number>(
    effectiveMember?.referral_count ?? member.referral_count ?? 0
  );

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

  // Üst bileşenden tekil özet API verisi geldiğinde tüm alt state'leri sıfır ekstra istekle senkronize et
  useEffect(() => {
    if (!effectiveSummary) return;
    if (
      effectiveSummary.today_wellness &&
      typeof effectiveSummary.today_wellness.water_ml === 'number'
    ) {
      setWellness(effectiveSummary.today_wellness);
    }
    if (effectiveSummary.member?.referral_code) {
      setInviteCode(effectiveSummary.member.referral_code);
    }
    if (typeof effectiveSummary.member?.referral_count === 'number') {
      setReferralCount(effectiveSummary.member.referral_count);
    }
    setLoadingSummary(false);
  }, [effectiveSummary]);

  // Eğer üst bileşen summary sağlamadıysa tekil GET /dashboard/{member_id}/summary (fallback /club/home/{id}) isteği at
  const fetchUnifiedSummary = useCallback(async () => {
    if (summary) return;
    try {
      const res = await apiRequest<MemberDashboardSummary>(
        `/dashboard/${member.id}/summary`
      );
      if (res && res.member) {
        setLocalSummary(res);
      }
    } catch {
      try {
        const homeFallback = await apiRequest<ClubHomeData>(
          `/club/home/${member.id}`
        );
        if (homeFallback?.member) {
          setInviteCode(
            homeFallback.member.referral_code ||
              deriveInviteCode(homeFallback.member.full_name, member.id)
          );
          setReferralCount(homeFallback.member.referral_count ?? 0);
        }
      } catch {
        // Yedek değerlerle kesintisiz devam et
      }
    } finally {
      setLoadingSummary(false);
    }
  }, [member.id, summary]);

  useEffect(() => {
    if (!summary) {
      fetchUnifiedSummary();
    }
  }, [fetchUnifiedSummary, refreshSignal, summary]);

  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!summary) {
      setLiveRefreshCount((c) => c + 1);
      await Promise.all([
        Promise.resolve(onRefreshParent()),
        fetchUnifiedSummary(),
      ]);
    } else {
      await Promise.resolve(onRefreshParent());
    }
    setRefreshing(false);
  }, [fetchUnifiedSummary, onRefreshParent, summary]);

  const handleQuickAddWater = useCallback(async () => {
    if (addingWater) return;
    setAddingWater(true);
    setWellness((prev) => ({
      ...prev,
      water_ml: prev.water_ml + 250,
    }));

    try {
      const updated = await apiRequest<DailyWellness>(
        `/wellness/${member.id}/water`,
        {
          method: 'POST',
          body: JSON.stringify({ amount_ml: 250 }),
        }
      );
      if (updated && typeof updated.water_ml === 'number') {
        setWellness(updated);
      }
      triggerGlobalRefresh();
    } catch {
      // Optimistic değer korunur
    } finally {
      setAddingWater(false);
    }
  }, [addingWater, member.id, triggerGlobalRefresh]);

  const handleQuickEnergySelect = useCallback(
    async (status: EnergyStatus) => {
      setWellness((prev) => ({
        ...prev,
        energy_status: status,
      }));
      try {
        const updated = await apiRequest<DailyWellness>(
          `/wellness/${member.id}/energy`,
          {
            method: 'POST',
            body: JSON.stringify({ energy_status: status }),
          }
        );
        if (updated && updated.energy_status) {
          setWellness(updated);
        }
        triggerGlobalRefresh();
      } catch {
        // Optimistic seçim korunur
      }
    },
    [member.id, triggerGlobalRefresh]
  );

  const firstName = useMemo(() => {
    const clean = (effectiveMember?.full_name || member.full_name || '').trim();
    return clean.split(/\s+/)[0] || 'Üyemiz';
  }, [effectiveMember?.full_name, member.full_name]);

  const greetingWord = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Günaydın';
    if (hour >= 12 && hour < 18) return 'Merhaba';
    return 'İyi akşamlar';
  }, []);

  const streakDays =
    effectiveSummary?.streak_days ??
    effectiveMember?.streak_days ??
    member.streak_days ??
    0;
  const pkg = effectiveSummary?.active_package ?? dashboard?.active_package ?? null;
  const remainingCredits =
    effectiveSummary?.remaining_credits ?? pkg?.remaining_credits ?? 0;
  const totalCredits =
    effectiveSummary?.total_credits ?? pkg?.total_credits ?? 0;
  const isLowCredits = remainingCredits <= 2;
  const daysLeft = getDaysRemaining(pkg?.expiry_date);

  const upcomingBooking = useMemo(() => {
    if (effectiveSummary) {
      return effectiveSummary.upcoming_booking ?? null;
    }
    return (dashboard?.my_bookings ?? []).find((b) => b.status === 'booked') ?? null;
  }, [dashboard?.my_bookings, effectiveSummary]);

  const upcomingSessionsPreview = useMemo(() => {
    return (effectiveSummary?.upcoming_sessions ?? []).slice(0, 3);
  }, [effectiveSummary?.upcoming_sessions]);

  const recentAnnouncementsPreview = useMemo(() => {
    return (effectiveSummary?.announcements ?? []).slice(0, 2);
  }, [effectiveSummary?.announcements]);

  const upcomingCatVis = upcomingBooking
    ? getCategoryVisuals(upcomingBooking.category)
    : null;

  const isCancellingUpcoming =
    upcomingBooking !== null && busyBookingId === upcomingBooking.booking_id;

  // Su halkası SVG ölçüleri
  const waterRingSize = 104;
  const waterStroke = 10;
  const waterCenter = waterRingSize / 2;
  const waterRadius = (waterRingSize - waterStroke * 2) / 2;
  const waterCircumference = 2 * Math.PI * waterRadius;
  const waterGoal = wellness.water_goal_ml > 0 ? wellness.water_goal_ml : 3000;
  const waterRatio = Math.max(0, Math.min(1, wellness.water_ml / waterGoal));
  const waterDashOffset = waterCircumference * (1 - waterRatio);

  if (loadingSummary && !effectiveSummary && !dashboard) {
    return <DashboardSkeleton />;
  }

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
        {/* 0. CANLI SALON YOĞUNLUK RADARI BENTO KARTI (EN ÜSTTE) */}
        <LiveGymOccupancyCard
          initialStatus={effectiveSummary?.live_status ?? null}
          refreshTrigger={liveRefreshCount}
        />

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

        {/* 2. KALAN SEANS & AKTİF REFORMER/CADILLAC PAKET KARTI */}
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
                  : 'Paket tanımlaması için stüdyo yönetimiyle iletişime geçebilirsiniz'}
              </Text>

              <TouchableOpacity
                style={styles.renewInlineLink}
                onPress={() => onNavigate('packages')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Paket bilgilerimi ve ders haklarımı gör"
              >
                <Text style={styles.renewInlineLinkText}>Paketimi Gör</Text>
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

        {/* 3. GÜNLÜK TOPARLANMA: SU TÜKETİM HALKASI & ENERJİ SEÇİCİSİ BENTO KARTI */}
        <View style={styles.recoveryBentoCard}>
          <View style={styles.recoveryHeaderRow}>
            <View style={styles.recoveryTitleLeft}>
              <View style={styles.recoveryIconBadge}>
                <Droplets size={16} color="#0284C7" />
              </View>
              <View>
                <Text style={styles.recoveryTitle}>Günlük Toparlanma & Su</Text>
                <Text style={styles.recoverySubtitle}>
                  Hidrasyon halkası & antrenman enerji durumu
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.nutritionJumpPill}
              onPress={() => onNavigate('nutrition')}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.nutritionJumpPillText}>🥗 AI Koç</Text>
              <ArrowRight size={13} color="#0D9488" />
            </TouchableOpacity>
          </View>

          {/* Su Halkası + +250 ml Tek Dokunuş Butonu */}
          <View style={styles.waterRow}>
            <TouchableOpacity
              style={styles.waterSvgWrap}
              onPress={handleQuickAddWater}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="+250 ml su ekle"
            >
              <Svg width={waterRingSize} height={waterRingSize}>
                <Defs>
                  <LinearGradient
                    id="homeWaterRingGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <Stop offset="0%" stopColor="#38BDF8" />
                    <Stop offset="100%" stopColor="#0D9488" />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx={waterCenter}
                  cy={waterCenter}
                  r={waterRadius}
                  stroke="#E0F2FE"
                  strokeWidth={waterStroke}
                  fill="none"
                />
                <Circle
                  cx={waterCenter}
                  cy={waterCenter}
                  r={waterRadius}
                  stroke="url(#homeWaterRingGrad)"
                  strokeWidth={waterStroke}
                  strokeLinecap="round"
                  strokeDasharray={`${waterCircumference} ${waterCircumference}`}
                  strokeDashoffset={waterDashOffset}
                  transform={`rotate(-90 ${waterCenter} ${waterCenter})`}
                  fill="none"
                />
              </Svg>
              <View style={styles.waterRingCenterLabel} pointerEvents="none">
                <Text style={styles.waterRingCurrentText}>
                  {formatLitersValue(wellness.water_ml)}
                </Text>
                <Text style={styles.waterRingGoalText}>
                  / {formatLitersValue(waterGoal)} L
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.waterRightInfo}>
              <Text style={styles.waterRatioHeadline}>
                {formatLitersValue(wellness.water_ml)} / {formatLitersValue(waterGoal)} L
              </Text>
              <Text style={styles.waterDescText}>
                Günlük su hedefinize ulaşmak için her bardakta dokunun.
              </Text>
              <TouchableOpacity
                style={[styles.quickWaterBtn, addingWater && { opacity: 0.75 }]}
                onPress={handleQuickAddWater}
                disabled={addingWater}
                activeOpacity={0.84}
                accessibilityRole="button"
              >
                <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.quickWaterBtnText}>💧 +250 ml Su Ekle</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bugün Nasıl Hissediyorsun? Seçicisi */}
          <View style={styles.energySectionBox}>
            <Text style={styles.energyPromptTitle}>Bugün Nasıl Hissediyorsun?</Text>
            <View style={styles.energyPillsRow}>
              {HOME_ENERGY_CHOICES.map((opt) => {
                const active = wellness.energy_status === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.energyChip,
                      active && {
                        backgroundColor: opt.activeBg,
                        borderColor: opt.activeBorder,
                      },
                    ]}
                    onPress={() => handleQuickEnergySelect(opt.key)}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.energyChipText,
                        active && { color: opt.activeText, fontWeight: '800' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {wellness.energy_status === 'low' && (
              <Text style={styles.lowEnergyHintText}>
                ⚡ Eğitmeninizin ekranına bugün düşük enerjili olduğunuz otomatik
                iletildi.
              </Text>
            )}
          </View>
        </View>

        {/* 4. ARKADAŞINI GETİR (+1 HEDİYE DERS) ÖZET DAVET KARTI */}
        <TouchableOpacity
          style={styles.referralPromoCard}
          onPress={() => onNavigate('referral')}
          activeOpacity={0.88}
          accessibilityRole="button"
        >
          <View style={styles.referralLeftIconBox}>
            <Gift size={24} color="#0D9488" strokeWidth={2.1} />
          </View>

          <View style={styles.referralCenterCol}>
            <View style={styles.referralTopTagRow}>
              <Text style={styles.referralCardTitle}>
                🎁 Arkadaşını Getir (+1 Hediye Ders)
              </Text>
            </View>
            <Text style={styles.referralCardDesc}>
              Özel kodun{' '}
              <Text style={styles.referralInlineCode}>{inviteCode}</Text> ile
              arkadaşını davet et, ikiniz de +1 ücretsiz seans kazanın!
              {referralCount > 0 ? ` (${referralCount} davet tamamlandı)` : ''}
            </Text>
          </View>

          <View style={styles.referralArrowCircle}>
            <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </TouchableOpacity>

        {/* 5. ERYA PİLATES İMZA MİMARİ KEMERLİ STÜDYO KARTI */}
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

        {/* 6. YAKLAŞAN SEANS RANDEVU KARTI */}
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

        {/* 7. YAN YANA 2 ADET HIZLI STÜDYO KISAYOLU (VEKTÖR İKONLU) */}
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

        {/* 8. YAKLAŞAN İLK 3 SEANS ÖZETİ (TEKİL ÖZET API) */}
        {upcomingSessionsPreview.length > 0 && (
          <View style={styles.summaryListCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.cardSectionTitle}>Yaklaşan Açık Dersler</Text>
              <TouchableOpacity
                onPress={() => onNavigate('schedule')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.summarySeeAllText}>Tüm Program →</Text>
              </TouchableOpacity>
            </View>
            {upcomingSessionsPreview.map((sess) => (
              <TouchableOpacity
                key={sess.id}
                style={styles.summarySessionRow}
                onPress={() => onNavigate('schedule')}
                activeOpacity={0.82}
              >
                <View style={styles.summaryTimePill}>
                  <Text style={styles.summaryTimeText}>{sess.start_time}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryRowTitle} numberOfLines={1}>
                    {sess.title}
                  </Text>
                  <Text style={styles.summaryRowSub} numberOfLines={1}>
                    {formatTurkishDateLabel(sess.date).primary} • {sess.trainer_name}
                  </Text>
                </View>
                <Text style={styles.summarySpotsText}>
                  {sess.is_full
                    ? 'Yedek'
                    : `${Math.max(0, sess.remaining_spots)} yer`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 9. STÜDYO DUYURULARI ÖZETİ (TEKİL ÖZET API) */}
        {recentAnnouncementsPreview.length > 0 && (
          <View style={styles.summaryListCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.cardSectionTitle}>Stüdyo Duyuruları</Text>
              <TouchableOpacity
                onPress={() => onNavigate('news')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.summarySeeAllText}>Tümü →</Text>
              </TouchableOpacity>
            </View>
            {recentAnnouncementsPreview.map((ann) => (
              <TouchableOpacity
                key={ann.id}
                style={styles.summaryAnnRow}
                onPress={() => onNavigate('news')}
                activeOpacity={0.82}
              >
                <Text style={styles.summaryRowTitle} numberOfLines={1}>
                  {ann.title}
                </Text>
                <Text style={styles.summaryRowSub} numberOfLines={2}>
                  {ann.content}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  summaryListCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summarySeeAllText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  summarySessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryTimePill: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  summaryTimeText: {
    fontFamily: FONTS.sans,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  summaryRowTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRowSub: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  summarySpotsText: {
    fontFamily: FONTS.sans,
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  summaryAnnRow: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
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
  recoveryBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 14,
    ...CARD_SHADOW,
  },
  recoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recoveryTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  recoveryIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  recoverySubtitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  nutritionJumpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  nutritionJumpPillText: {
    fontFamily: FONTS.sans,
    color: '#0F766E',
    fontSize: 11.5,
    fontWeight: '800',
  },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  waterSvgWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterRingCenterLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterRingCurrentText: {
    fontFamily: FONTS.serif,
    color: '#0F172A',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 24,
  },
  waterRingGoalText: {
    fontFamily: FONTS.sans,
    color: '#0284C7',
    fontSize: 10.5,
    fontWeight: '800',
  },
  waterRightInfo: {
    flex: 1,
    gap: 6,
  },
  waterRatioHeadline: {
    fontFamily: FONTS.sans,
    color: '#0284C7',
    fontSize: 15,
    fontWeight: '800',
  },
  waterDescText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  quickWaterBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 38,
    backgroundColor: '#0284C7',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 2,
  },
  quickWaterBtnText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  energySectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 9,
  },
  energyPromptTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  energyPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  energyChip: {
    paddingHorizontal: 11,
    paddingVertical: 7.5,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  energyChipText: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  lowEnergyHintText: {
    fontFamily: FONTS.sans,
    color: '#B45309',
    fontSize: 11.5,
    fontWeight: '700',
  },
  referralPromoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 24,
    padding: 17,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    ...CARD_SHADOW,
  },
  referralLeftIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralCenterCol: {
    flex: 1,
    gap: 4,
  },
  referralTopTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  referralCardTitle: {
    fontFamily: FONTS.serif,
    color: '#064E3B',
    fontSize: 18,
    fontWeight: '700',
  },
  referralCardDesc: {
    fontFamily: FONTS.sans,
    color: '#0F766E',
    fontSize: 12.2,
    fontWeight: '600',
    lineHeight: 17.5,
  },
  referralInlineCode: {
    fontWeight: '800',
    color: '#4F46E5',
  },
  referralArrowCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
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
