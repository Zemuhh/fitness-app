import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Award,
  Check,
  Copy,
  Gift,
  Share2,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, FONTS } from '@/theme/colors';
import {
  AppUser,
  MemberDrawerRoute,
  MemberPackage,
  MemberReferralInfo,
  ReferralRedeemResponse,
} from '@/types/fitness';

export interface MemberReferralScreenProps {
  member: AppUser;
  activePackage?: MemberPackage | null;
  onCreditsUpdated?: () => Promise<void> | void;
  onNavigate?: (route: MemberDrawerRoute) => void;
  onShowBanner?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

const CONFETTI_PIECES = [
  { emoji: '🎉', left: '8%', delay: 0, color: '#10B981' },
  { emoji: '✨', left: '22%', delay: 60, color: '#4F46E5' },
  { emoji: '🎁', left: '38%', delay: 110, color: '#0D9488' },
  { emoji: '🥳', left: '54%', delay: 40, color: '#F59E0B' },
  { emoji: '🎊', left: '72%', delay: 90, color: '#6366F1' },
  { emoji: '💚', left: '88%', delay: 130, color: '#059669' },
];

function deriveFallbackCode(fullName: string, id: number): string {
  const first = (fullName || 'UYE')
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
  return `${first || `FIT${id}`}10`;
}

async function copyTextCrossPlatform(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback textarea yöntemi
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  return true;
}

export function MemberReferralScreen({
  member,
  activePackage,
  onCreditsUpdated,
  onShowBanner,
}: MemberReferralScreenProps) {
  const { refreshSignal, triggerGlobalRefresh } = useAuthDemo();

  const fallbackCode = useMemo(
    () => member.referral_code || deriveFallbackCode(member.full_name, member.id),
    [member.full_name, member.id, member.referral_code]
  );

  const [referral, setReferral] = useState<MemberReferralInfo>(() => ({
    member_id: member.id,
    member_name: member.full_name,
    referral_code: fallbackCode,
    referral_count: member.referral_count ?? 0,
    earned_free_credits: member.referral_count ?? 0,
    remaining_credits: activePackage?.remaining_credits ?? 0,
  }));

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [redeemingDemo, setRedeemingDemo] = useState<boolean>(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(
    null
  );

  const celebrationScale = useRef(new Animated.Value(0.88)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const confettiProgress = useRef(new Animated.Value(0)).current;

  const fetchReferral = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiRequest<MemberReferralInfo>(`/referral/${member.id}`);
      if (res && res.referral_code) {
        setReferral(res);
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          'Davet istatistikleri güncellenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.'
      );
    } finally {
      setRefreshing(false);
    }
  }, [member.id]);

  useEffect(() => {
    fetchReferral();
  }, [fetchReferral, refreshSignal]);

  useEffect(() => {
    if (typeof activePackage?.remaining_credits === 'number') {
      setReferral((prev) => ({
        ...prev,
        remaining_credits: Math.max(
          prev.remaining_credits,
          activePackage.remaining_credits
        ),
      }));
    }
  }, [activePackage?.remaining_credits]);

  const handlePullRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReferral();
  }, [fetchReferral]);

  const shareMessage = useMemo(() => {
    return `Beraber antrenman yapalım! 💪 Kayıt olurken benim özel davet kodumu (${referral.referral_code}) girersen ikimiz de anında +1 Ücretsiz Ders kazanıyoruz! 🎁`;
  }, [referral.referral_code]);

  const handleCopyCode = useCallback(async () => {
    await copyTextCrossPlatform(referral.referral_code);
    setCopied(true);
    onShowBanner?.(
      'success',
      `Davet kodunuz (${referral.referral_code}) panoya kopyalandı!`
    );
    setTimeout(() => {
      setCopied(false);
    }, 2500);
  }, [onShowBanner, referral.referral_code]);

  const handleShareInvite = useCallback(async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      await copyTextCrossPlatform(shareMessage);
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
          await (navigator as any).share({
            title: 'FitClub +1 Ücretsiz Ders Daveti',
            text: shareMessage,
          });
          return;
        }
      } catch {
        // Kullanıcı paylaşım penceresini kapattıysa WhatsApp Web'e geçme
        return;
      }

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
      try {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      } catch {
        await Linking.openURL(whatsappUrl);
      }
      onShowBanner?.(
        'success',
        'Davet mesajınız kopyalandı ve WhatsApp paylaşım ekranı açıldı!'
      );
      return;
    }

    try {
      await Share.share({
        title: 'Arkadaşını Getir (+1 Ücretsiz Ders)',
        message: shareMessage,
      });
    } catch {
      // Paylaşım iptal edildi
    }
  }, [onShowBanner, shareMessage]);

  const triggerCelebrationAnimation = useCallback(() => {
    celebrationScale.setValue(0.86);
    celebrationOpacity.setValue(0);
    confettiProgress.setValue(0);

    Animated.parallel([
      Animated.spring(celebrationScale, {
        toValue: 1,
        friction: 6,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(celebrationOpacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(confettiProgress, {
        toValue: 1,
        duration: 1350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [celebrationOpacity, celebrationScale, confettiProgress]);

  const handleSimulateDemoRedeem = useCallback(async () => {
    if (redeemingDemo) return;
    setRedeemingDemo(true);

    try {
      const res = await apiRequest<ReferralRedeemResponse>('/referral/redeem', {
        method: 'POST',
        body: JSON.stringify({
          referral_code: referral.referral_code,
          is_demo_simulation: true,
        }),
      });

      const successText =
        res?.message ||
        '🎉 Tebrikler! Arkadaşınız katıldığı için paketinize +1 Hediye Ders eklendi!';

      setReferral((prev) => ({
        ...prev,
        referral_count:
          typeof res?.referral_count === 'number'
            ? res.referral_count
            : prev.referral_count + 1,
        earned_free_credits:
          typeof res?.referral_count === 'number'
            ? res.referral_count
            : prev.earned_free_credits + (res?.bonus_credits_added ?? 1),
        remaining_credits:
          typeof res?.remaining_credits === 'number'
            ? res.remaining_credits
            : prev.remaining_credits + (res?.bonus_credits_added ?? 1),
      }));

      setCelebrationMessage(successText);
      triggerCelebrationAnimation();

      await Promise.resolve(onCreditsUpdated?.());
      triggerGlobalRefresh();
    } catch (err: any) {
      onShowBanner?.(
        'error',
        err?.message || 'Demo davet simülasyonu sırasında sunucuya ulaşılamadı.'
      );
    } finally {
      setRedeemingDemo(false);
    }
  }, [
    onCreditsUpdated,
    onShowBanner,
    redeemingDemo,
    referral.referral_code,
    triggerCelebrationAnimation,
    triggerGlobalRefresh,
  ]);

  const confettiTranslateY = confettiProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, -22],
  });

  const confettiFade = confettiProgress.interpolate({
    inputRange: [0, 0.2, 0.85, 1],
    outputRange: [0, 1, 1, 0.25],
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullRefresh}
          tintColor="#0D9488"
        />
      }
    >
      {/* 1. PASTEL NANE YEŞİLİ & İNDİGO HERO HEDİYE KARTI */}
      <View style={styles.heroCard}>
        <View style={styles.giftHaloOuter}>
          <View style={styles.giftHaloInner}>
            <Gift size={34} color="#0D9488" strokeWidth={2.1} />
          </View>
        </View>

        <View style={styles.rewardPill}>
          <Sparkles size={13} color="#4F46E5" />
          <Text style={styles.rewardPillText}>İKİLİ KAZANÇ PROGRAMI • +1 DERS</Text>
        </View>

        <Text style={styles.heroTitle}>
          Beraber Antrenman Yapacağın Arkadaşını Davet Et, İkiniz de +1 Ücretsiz
          Ders Kazanın!
        </Text>

        <Text style={styles.heroSubtitle}>
          Arkadaşın kayıt ekranında senin davet kodunu girdiğinde hem senin aktif
          paketine hem de arkadaşının hesabına anında +1 ders tanımlanır.
        </Text>

        {/* Özet Sayaçlar */}
        <View style={styles.statsStrip}>
          <View style={styles.statBox}>
            <Users size={15} color="#0D9488" />
            <Text style={styles.statNumber}>{referral.referral_count}</Text>
            <Text style={styles.statLabel}>Katılan Arkadaş</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Gift size={15} color="#4F46E5" />
            <Text style={[styles.statNumber, { color: '#4F46E5' }]}>
              +{referral.earned_free_credits}
            </Text>
            <Text style={styles.statLabel}>Hediye Ders</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Award size={15} color="#059669" />
            <Text style={[styles.statNumber, { color: '#059669' }]}>
              {referral.remaining_credits} Ders
            </Text>
            <Text style={styles.statLabel}>Kalan Hakkım</Text>
          </View>
        </View>
      </View>

      {/* 2. KİŞİYE ÖZEL DAVET KODU & PAYLAŞIM KARTI */}
      <View style={styles.codeCard}>
        <Text style={styles.codeSectionEyebrow}>SANA ÖZEL DAVET KODUN</Text>

        <View style={styles.codeDisplayBox}>
          <Text style={styles.codeBigText} selectable>
            {referral.referral_code}
          </Text>
        </View>

        <View style={styles.actionButtonsCol}>
          <TouchableOpacity
            style={[styles.copyBtn, copied && styles.copyBtnSuccess]}
            onPress={handleCopyCode}
            activeOpacity={0.84}
            accessibilityRole="button"
          >
            {copied ? (
              <>
                <Check size={17} color="#047857" strokeWidth={2.5} />
                <Text style={[styles.copyBtnText, { color: '#047857' }]}>
                  ✅ Kod Panoya Kopyalandı!
                </Text>
              </>
            ) : (
              <>
                <Copy size={17} color="#0D9488" strokeWidth={2.2} />
                <Text style={styles.copyBtnText}>📋 Kodu Kopyala</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareSocialBtn}
            onPress={handleShareInvite}
            activeOpacity={0.86}
            accessibilityRole="button"
          >
            <Share2 size={17} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.shareSocialBtnText}>
              📲 WhatsApp / Instagram'dan Davet Gönder
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity
            style={styles.retryPillBtn}
            onPress={handlePullRefresh}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.retryPillBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. CANLI DEMO SİMÜLASYON & KONFETİ KUTLAMA KARTI (YALNIZCA GELİŞTİRME ORTAMI) */}
      {__DEV__ && (
        <View style={styles.demoCard}>
          <View style={styles.demoHeaderRow}>
            <View style={styles.demoBadgeIcon}>
              <Zap size={16} color="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoTitle}>Hızlı Canlı Test & Kredi Simülasyonu</Text>
              <Text style={styles.demoSubtitle}>
                Yeni bir arkadaşınızın davet kodunuzla kayıt olma anını tek dokunuşla
                canlı test edin.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.demoTriggerBtn, redeemingDemo && { opacity: 0.72 }]}
            onPress={handleSimulateDemoRedeem}
            disabled={redeemingDemo}
            activeOpacity={0.86}
            accessibilityRole="button"
          >
            {redeemingDemo ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.demoTriggerBtnText}>
                ⚡ Demo Test: Arkadaşım Bu Kodla Kayıt Oldu Simülasyonu
              </Text>
            )}
          </TouchableOpacity>

          {/* Neşeli Konfeti & Kutlama Başarı Kartı */}
          {celebrationMessage && (
            <Animated.View
              style={[
                styles.celebrationBanner,
                {
                  opacity: celebrationOpacity,
                  transform: [{ scale: celebrationScale }],
                },
              ]}
            >
              {/* Konfeti Parçacıkları */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.confettiRow,
                  {
                    opacity: confettiFade,
                    transform: [{ translateY: confettiTranslateY }],
                  },
                ]}
              >
                {CONFETTI_PIECES.map((piece, index) => (
                  <Text key={index} style={styles.confettiEmoji}>
                    {piece.emoji}
                  </Text>
                ))}
              </Animated.View>

              <View style={styles.celebrationInnerRow}>
                <View style={styles.celebrationIconCircle}>
                  <Text style={{ fontSize: 24 }}>🎉</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.celebrationTitle}>{celebrationMessage}</Text>
                  <Text style={styles.celebrationSub}>
                    Güncel Kalan Ders Hakkınız:{' '}
                    <Text style={styles.celebrationHighlight}>
                      {referral.remaining_credits} Ders
                    </Text>{' '}
                    • Toplam Davet: {referral.referral_count} Kişi
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4FBF8',
  },
  content: {
    padding: 18,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    gap: 12,
    ...CARD_SHADOW,
  },
  giftHaloOuter: {
    width: 82,
    height: 82,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftHaloInner: {
    width: 62,
    height: 62,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  rewardPillText: {
    fontFamily: FONTS.sans,
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  heroTitle: {
    fontFamily: FONTS.serif,
    color: '#064E3B',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  heroSubtitle: {
    fontFamily: FONTS.sans,
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 19,
  },
  statsStrip: {
    marginTop: 4,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#D1FAE5',
  },
  statNumber: {
    fontFamily: FONTS.serif,
    color: '#0D9488',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontFamily: FONTS.sans,
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  codeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    gap: 14,
    ...CARD_SHADOW,
  },
  codeSectionEyebrow: {
    fontFamily: FONTS.sans,
    color: '#0D9488',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  codeDisplayBox: {
    width: '100%',
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderColor: '#0D9488',
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBigText: {
    fontFamily: FONTS.sans,
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },
  actionButtonsCol: {
    width: '100%',
    gap: 10,
  },
  copyBtn: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#5EEAD4',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  copyBtnSuccess: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  copyBtnText: {
    fontFamily: FONTS.sans,
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '800',
  },
  shareSocialBtn: {
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0D9488',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  shareSocialBtnText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  demoCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    gap: 14,
    ...CARD_SHADOW,
  },
  demoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  demoBadgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoTitle: {
    fontFamily: FONTS.sans,
    color: '#1E1B4B',
    fontSize: 14.5,
    fontWeight: '800',
  },
  demoSubtitle: {
    fontFamily: FONTS.sans,
    color: '#4338CA',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17.5,
    marginTop: 2,
  },
  demoTriggerBtn: {
    minHeight: 50,
    backgroundColor: '#4F46E5',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  demoTriggerBtnText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  celebrationBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#34D399',
    gap: 8,
    overflow: 'hidden',
  },
  confettiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  confettiEmoji: {
    fontSize: 18,
  },
  celebrationInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  celebrationIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationTitle: {
    fontFamily: FONTS.sans,
    color: '#065F46',
    fontSize: 13.5,
    fontWeight: '800',
    lineHeight: 19,
  },
  celebrationSub: {
    fontFamily: FONTS.sans,
    color: '#047857',
    fontSize: 12,
    fontWeight: '600',
  },
  celebrationHighlight: {
    fontWeight: '800',
    color: '#064E3B',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: '#B91C1C',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  retryPillBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryPillBtnText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
