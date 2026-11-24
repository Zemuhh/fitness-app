import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Lock,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import {
  formatProviderLabel,
  formatTry,
  formatTurkishDateTime,
  useHostedCheckoutFlow,
} from '@/screens/payment/PackageStoreScreen';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  MemberDashboardData,
  PackageRenewResponse,
} from '@/types/fitness';
import {
  CheckoutSessionStatusResponse,
  InstallmentCount,
  MemberPaymentHistoryResponse,
  PackageCatalogPlan,
  PaymentHistoryItem,
} from '@/types/payment';
import { formatTurkishDateLabel, getDaysRemaining } from '@/utils/dateHelpers';

export interface MemberPackageRenewScreenProps {
  data: MemberDashboardData;
  refreshing?: boolean;
  onRefresh?: () => void;
  onRenewCompleted?: (res: PackageRenewResponse) => Promise<void> | void;
  onShowBanner?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

const FALLBACK_CATALOG: PackageCatalogPlan[] = [
  {
    id: 1,
    code: 'ERYA-GRUP-8',
    name: '8 Seans Grup Reformer Paketi',
    subtitle: '6-7 kişilik kemerli ayna stüdyoda postür, esneklik ve sıkılaşma',
    credits: 8,
    duration_days: 35,
    price_try: 3000,
    per_lesson_price_try: 375,
    savings_percent: 0,
    savings_amount_try: 0,
    popular_badge: 'En Çok Tercih Edilen',
    features: [
      '8 Seans Stüdyoda Yüz Yüze Butik Grup Reformer Pilates (6-7 Kişilik)',
      'Mevcut kalan seans haklarınızın üzerine anında eklenir',
      '4 Saate Kadar Ücretsiz İptal & Kredi İadesi (Dijital takip araçları tüm aktif kulüp üyelerine ücretsiz dahil)',
    ],
    is_active: true,
  },
  {
    id: 2,
    code: 'ERYA-DUET-8',
    name: '8 Seans Düet / Trio Reformer',
    subtitle: 'Arkadaşınızla veya 2-3 kişilik özel grupla yüksek odaklı Reformer',
    credits: 8,
    duration_days: 40,
    price_try: 4800,
    per_lesson_price_try: 600,
    savings_percent: 0,
    savings_amount_try: 0,
    popular_badge: 'Zarif Uyum',
    features: [
      '8 Seans Stüdyoda Yüz Yüze Düet veya Trio Reformer Pilates',
      'Birebir Eğitmen Eşliğinde Esneklik & Core Antrenmanı',
      '40 Gün Esnek Kullanım + Kredi Koruma',
    ],
    is_active: true,
  },
  {
    id: 3,
    code: 'ERYA-PRIVATE-8',
    name: '8 Seans Bireysel Reformer & Cadillac',
    subtitle: 'Seher Hoca & uzman kadroyla 1-1 skolyoz, postür ve omurga programı',
    credits: 8,
    duration_days: 45,
    price_try: 6800,
    per_lesson_price_try: 850,
    savings_percent: 0,
    savings_amount_try: 0,
    popular_badge: 'Klinik & Özel İlgi',
    features: [
      '8 Seans Stüdyoda Yüz Yüze 1-1 Reformer & Cadillac Trapeze Tower',
      'Birebir Eğitmen Eşliğinde Postür & Hareket Programı',
      '45 Gün Geçerlilik + Kredi Devir Garantisi',
    ],
    is_active: true,
  },
  {
    id: 4,
    code: 'ERYA-VIP-16',
    name: '16 Seans VIP Dönüşüm Paketi',
    subtitle: 'Tam kapsamlı Reformer + Cadillac ile dik duruş ve sıkılaşma serisi',
    credits: 16,
    duration_days: 75,
    price_try: 12000,
    per_lesson_price_try: 750,
    savings_percent: 12,
    savings_amount_try: 1600,
    popular_badge: 'Maksimum Avantaj',
    features: [
      '16 Seans Stüdyoda Yüz Yüze Reformer, Cadillac & Özel PT Dersleri',
      'Birebir Eğitmen Eşliğinde Haftalık Postür & Antrenman Programlama',
      'En Avantajlı Seans Birim Ücreti + 75 Gün Süre',
    ],
    is_active: true,
  },
];

function resolvePlanPalette(code: string, idx: number) {
  if (code.includes('PRIVATE') || idx === 2) {
    return {
      accentColor: COLORS.secondary,
      accentBg: COLORS.secondaryLight,
      accentBorder: COLORS.secondaryBorder,
    };
  }
  if (code.includes('VIP') || idx === 3) {
    return {
      accentColor: COLORS.walnut,
      accentBg: COLORS.surfaceElevated,
      accentBorder: COLORS.borderStrong,
    };
  }
  return {
    accentColor: COLORS.primary,
    accentBg: COLORS.primaryLight,
    accentBorder: COLORS.primaryBorder,
  };
}

export function MemberPackageRenewScreen({
  data,
  refreshing = false,
  onRefresh,
  onRenewCompleted,
  onShowBanner,
}: MemberPackageRenewScreenProps) {
  const { reloadUsers, triggerGlobalRefresh } = useAuthDemo();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const [catalogPlans, setCatalogPlans] = useState<PackageCatalogPlan[]>(FALLBACK_CATALOG);
  const [historyData, setHistoryData] = useState<MemberPaymentHistoryResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [installmentCount, setInstallmentCount] = useState<InstallmentCount>(1);
  const [submittingPlanCode, setSubmittingPlanCode] = useState<string | null>(null);

  const member = data.member;
  const activePkg = historyData?.active_package ?? data.active_package;
  const remaining = activePkg?.remaining_credits ?? 0;
  const total = activePkg?.total_credits ?? 0;
  const progressPct =
    total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const daysLeft = activePkg ? getDaysRemaining(activePkg.expiry_date) : 0;

  const loadCatalogAndHistory = useCallback(async () => {
    setCatalogError(null);
    try {
      const [plansRes, histRes] = await Promise.all([
        apiRequest<PackageCatalogPlan[]>('/payments/packages'),
        apiRequest<MemberPaymentHistoryResponse>(
          `/payments/member/${member.id}/history`
        ).catch(() => null),
      ]);
      if (Array.isArray(plansRes) && plansRes.length > 0) {
        setCatalogPlans(plansRes);
      }
      if (histRes) {
        setHistoryData(histRes);
      }
    } catch (err: any) {
      setCatalogError(
        err?.message ||
          'Güncel paket listesi sunucudan alınamadı. Bağlantınızı kontrol edip tekrar deneyebilirsiniz.'
      );
    }
  }, [member.id]);

  useEffect(() => {
    loadCatalogAndHistory();
  }, [loadCatalogAndHistory]);

  const handleGatewaySucceeded = useCallback(
    async (statusData: CheckoutSessionStatusResponse) => {
      await Promise.all([
        loadCatalogAndHistory(),
        Promise.resolve(reloadUsers?.()),
      ]);
      triggerGlobalRefresh?.();

      const newRemaining =
        statusData.new_remaining_credits ??
        statusData.active_package?.remaining_credits ??
        remaining + statusData.purchased_credits;
      const newTotal =
        statusData.new_total_credits ??
        statusData.active_package?.total_credits ??
        newRemaining;
      const expiryIso =
        statusData.package_expiry_date ??
        statusData.active_package?.expiry_date ??
        '';

      const successMessage = `${statusData.plan_name} 3D Secure ödemesi onaylandı! Yeni bakiyeniz: ${newRemaining} ders.`;

      const renewPayload: PackageRenewResponse = {
        message: successMessage,
        member_id: member.id,
        package_id: statusData.credited_package_id ?? statusData.active_package?.id ?? 0,
        package_name: statusData.credited_package_name ?? statusData.plan_name,
        added_credits: statusData.purchased_credits,
        remaining_credits: newRemaining,
        total_credits: newTotal,
        expiry_date: expiryIso,
      };

      await Promise.resolve(onRenewCompleted?.(renewPayload));
      onShowBanner?.('success', successMessage);

      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 120);
    },
    [
      loadCatalogAndHistory,
      reloadUsers,
      triggerGlobalRefresh,
      remaining,
      member.id,
      onRenewCompleted,
      onShowBanner,
    ]
  );

  const {
    creatingSession,
    checkingStatus,
    activeSession,
    isWaitingForGateway,
    verifiedReceipt,
    setVerifiedReceipt,
    checkoutError,
    startCheckoutRedirect,
    checkSessionStatus,
    reopenActiveCheckoutPage,
    cancelActiveCheckoutSession,
    dismissSessionTracker,
  } = useHostedCheckoutFlow({
    memberId: member.id,
    onSessionSucceeded: handleGatewaySucceeded,
    onError: (msg) => onShowBanner?.('error', msg),
  });

  const handleSelectAndRedirect = async (pkg: PackageCatalogPlan) => {
    setSubmittingPlanCode(pkg.code);
    try {
      const created = await startCheckoutRedirect({
        planId: pkg.id,
        planCode: pkg.code,
        installmentCount,
      });

      if (created) {
        onShowBanner?.(
          'warning',
          'Güvenli 3D Secure ödeme sayfası açıldı. Ödemeyi tamamladığınızda bakiyeniz otomatik güncellenir.'
        );
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }, 120);
      }
    } finally {
      setSubmittingPlanCode(null);
    }
  };

  const handlePullRefresh = useCallback(() => {
    loadCatalogAndHistory();
    if (activeSession?.session_id && isWaitingForGateway) {
      checkSessionStatus(activeSession.session_id, true);
    }
    onRefresh?.();
  }, [loadCatalogAndHistory, activeSession?.session_id, isWaitingForGateway, checkSessionStatus, onRefresh]);

  return (
    <ScrollView
      ref={scrollRef}
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
      {/* CANLI ÖDEME OTURUMU TAKİP KARTI */}
      {activeSession && isWaitingForGateway && (
        <View style={styles.liveSessionCard}>
          <View style={styles.liveTopRow}>
            <View style={styles.liveBadge}>
              <Clock size={13} color={COLORS.warningText} />
              <Text style={styles.liveBadgeText}>
                {activeSession.status === 'requires_3ds'
                  ? '3D SECURE BANKA SMS ONAYI BEKLENİYOR'
                  : 'GÜVENLİ ÖDEME SAYFASI AÇIK'}
              </Text>
            </View>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>

          <Text style={styles.liveTitle}>{activeSession.plan_name}</Text>
          <Text style={styles.liveDesc}>
            {activeSession.status === 'requires_3ds'
              ? `${activeSession.bank_name || 'Banka'} 3D Secure ekranındaki 6 haneli SMS kodunu onaylayın. İşlem tamamlandığında ders krediniz anında yüklenir.`
              : `${formatProviderLabel(activeSession.provider)} üzerinden ödemenizi tamamlayın. Uygulama ödeme durumunu otomatik takip ediyor.`}
          </Text>

          <View style={styles.liveMetaStrip}>
            <Text style={styles.liveMetaLabel}>Tutar & Taksit</Text>
            <Text style={styles.liveMetaVal}>
              {formatTry(activeSession.amount)}
              {activeSession.installment_count > 1
                ? ` (${activeSession.installment_count} Taksit)`
                : ' (Tek Çekim)'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.livePrimaryBtn}
            onPress={() => checkSessionStatus(activeSession.session_id, false)}
            disabled={checkingStatus}
            activeOpacity={0.86}
          >
            {checkingStatus ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <RefreshCw size={15} color={COLORS.white} />
                <Text style={styles.livePrimaryBtnText}>
                  Ödeme Durumunu Kontrol Et
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.liveSecondaryRow}>
            <TouchableOpacity
              style={styles.liveReopenBtn}
              onPress={reopenActiveCheckoutPage}
              activeOpacity={0.85}
            >
              <Lock size={13} color={COLORS.primary} />
              <Text style={styles.liveReopenBtnText}>Ödeme Sayfasını Aç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.liveCancelBtn}
              onPress={cancelActiveCheckoutSession}
              activeOpacity={0.85}
            >
              <Text style={styles.liveCancelBtnText}>İptal Et</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* İPTAL / HATA BİLDİRİMİ */}
      {activeSession &&
        (activeSession.status === 'cancelled' || activeSession.status === 'failed') &&
        !verifiedReceipt && (
          <View style={styles.errorNoticeCard}>
            <View style={styles.errorNoticeTop}>
              <AlertCircle size={17} color={COLORS.danger} />
              <Text style={styles.errorNoticeTitle}>
                {activeSession.status === 'failed'
                  ? 'Ödeme Doğrulanamadı'
                  : 'Ödeme Oturumu İptal Edildi'}
              </Text>
            </View>
            <Text style={styles.errorNoticeBody}>
              {activeSession.failure_reason ||
                'Kartınızdan herhangi bir çekim yapılmadı. Aşağıdan paketinizi seçerek yeni bir güvenli ödeme başlatabilirsiniz.'}
            </Text>
            <TouchableOpacity
              style={styles.errorNoticeDismiss}
              onPress={dismissSessionTracker}
              activeOpacity={0.85}
            >
              <Text style={styles.errorNoticeDismissText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        )}

      {/* DOĞRULANMIŞ DİJİTAL MAKBUZ ONAY KUTUSU */}
      {verifiedReceipt && (
        <View style={styles.confirmationCard}>
          <View style={styles.confirmationTopRow}>
            <View style={styles.confirmVerifiedPill}>
              <CheckCircle2 size={16} color={COLORS.white} />
              <Text style={styles.confirmVerifiedPillText}>
                3D SECURE ÖDEME ONAYLANDI
              </Text>
            </View>
            <View style={styles.confirmCodePill}>
              <Receipt size={12} color={COLORS.primary} />
              <Text style={styles.confirmCodeText}>
                {verifiedReceipt.transaction_code}
              </Text>
            </View>
          </View>

          <Text style={styles.confirmationTitle}>{verifiedReceipt.plan_name}</Text>
          <Text style={styles.confirmationBody}>
            +{verifiedReceipt.purchased_credits} yeni ders kredisi
            {verifiedReceipt.carried_credits > 0
              ? ` (+${verifiedReceipt.carried_credits} devreden krediyle birlikte)`
              : ''}{' '}
            hesabınıza tanımlandı. Yeni kullanılabilir bakiyeniz:{' '}
            {verifiedReceipt.new_remaining_credits} ders.
          </Text>

          <View style={styles.confirmDetailsBox}>
            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmDetailKey}>Ödenen Tutar</Text>
              <Text style={styles.confirmDetailVal}>
                {formatTry(verifiedReceipt.amount_try)}
                {verifiedReceipt.installment_count > 1
                  ? ` (${verifiedReceipt.installment_count} x ${formatTry(
                      verifiedReceipt.monthly_installment_try
                    )})`
                  : ' (Tek Çekim)'}
              </Text>
            </View>
            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmDetailKey}>Kart / Yöntem</Text>
              <Text style={styles.confirmDetailVal}>
                {verifiedReceipt.masked_payment_info}
              </Text>
            </View>
            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmDetailKey}>Son Geçerlilik</Text>
              <Text style={styles.confirmDetailVal}>
                {formatTurkishDateLabel(verifiedReceipt.expiry_date).full}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.hideReceiptBtn}
            onPress={() => setVerifiedReceipt(null)}
            activeOpacity={0.85}
          >
            <Text style={styles.hideReceiptBtnText}>Makbuzu Gizle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 1. MEVCUT AKTİF PAKET KARTI */}
      <View style={styles.currentPackageCard}>
        <View style={styles.currentTopRow}>
          <View style={styles.activeStatusBadge}>
            <ShieldCheck size={13} color={COLORS.primary} />
            <Text style={styles.activeStatusText}>MEVCUT ÜYELİK PAKETİM</Text>
          </View>

          {activePkg && (
            <Text style={styles.daysRemainingText}>
              {daysLeft >= 0 ? `${daysLeft} Gün Kaldı` : 'Süresi Doldu'}
            </Text>
          )}
        </View>

        <Text style={styles.currentPkgTitle}>
          {activePkg ? activePkg.package_name : 'Aktif Paketiniz Bulunmuyor'}
        </Text>

        <View style={styles.currentCreditsRow}>
          <Text style={styles.currentCreditsHighlight}>
            Kalan: {remaining} / {total} Ders
          </Text>
          {activePkg && (
            <View style={styles.expiryInline}>
              <Calendar size={12} color={COLORS.textSecondary} />
              <Text style={styles.expiryText}>
                Bitiş: {formatTurkishDateLabel(activePkg.expiry_date).full}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPct}%`,
                backgroundColor:
                  remaining <= 2 ? COLORS.warning : COLORS.primary,
              },
            ]}
          />
        </View>

        <Text style={styles.carryNoteText}>
          Yeni bir paket satın aldığınızda mevcut kalan ders kredileriniz yanmaz; 3D Secure ödeme onayıyla birlikte yeni bakiyenize eklenir.
        </Text>
      </View>

      {/* FİZİKSEL HİZMET ÖDEME BİLGİLENDİRME KARTI (APP STORE 3.1.3(e)) */}
      <View style={styles.physicalServiceBanner}>
        <View style={styles.physicalServiceHeader}>
          <ShieldCheck size={16} color={COLORS.primary} />
          <Text style={styles.physicalServiceTitle}>
            Stüdyoda Yüz Yüze Yapılan Fiziksel Antrenman / PT / Pilates Dersleri
          </Text>
        </View>
        <Text style={styles.physicalServiceDesc}>
          Bu ödeme yalnızca stüdyoda yüz yüze gerçekleştirilen fiziksel antrenman, PT ve reformer pilates ders paketleri içindir. AI Beslenme Analizi, Vücut Haritası ve İlerleme Takibi gibi uygulama içi dijital araçlar tüm aktif kulüp üyelerine ücretsiz dahildir.
        </Text>
      </View>

      {catalogError && (
        <View style={styles.catalogRetryBox}>
          <Text style={styles.catalogRetryText}>{catalogError}</Text>
          <TouchableOpacity
            style={styles.catalogRetryBtn}
            onPress={loadCatalogAndHistory}
            activeOpacity={0.85}
          >
            <Text style={styles.catalogRetryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {checkoutError && !activeSession && (
        <View style={styles.inlineErrBox}>
          <Text style={styles.inlineErrText}>{checkoutError}</Text>
        </View>
      )}

      {/* 2. YENİ PAKETLER & TAKSİT SEÇİCİ */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Stüdyo Ders Paketi Satın Al / Yenile</Text>
        <Text style={styles.sectionSub}>
          Stüdyoda yüz yüze alacağınız ders paketini ve taksit tercihinizi seçin; 256-Bit SSL & 3D Secure banka ödeme sayfasına yönlendirileceksiniz.
        </Text>
      </View>

      <View style={styles.installmentBarCard}>
        <Text style={styles.installmentBarLabel}>Vade Farksız Taksit Tercihi:</Text>
        <View style={styles.installmentPillsRow}>
          {([1, 3, 6] as InstallmentCount[]).map((cnt) => {
            const active = installmentCount === cnt;
            return (
              <TouchableOpacity
                key={cnt}
                style={[styles.instPill, active && styles.instPillActive]}
                onPress={() => setInstallmentCount(cnt)}
                activeOpacity={0.85}
              >
                <Text style={[styles.instPillText, active && styles.instPillTextActive]}>
                  {cnt === 1 ? 'Tek Çekim' : `${cnt} Taksit`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 3. SATIN ALINABİLİR PAKET KARTLARI */}
      {(catalogPlans ?? []).map((pkg, idx) => {
        const isSubmitting =
          creatingSession && submittingPlanCode === pkg.code;
        const palette = resolvePlanPalette(pkg.code, idx);
        const perClassPrice = Math.round(pkg.price_try / Math.max(1, pkg.credits));
        const installmentPreview =
          installmentCount > 1
            ? `${installmentCount} x ${formatTry(pkg.price_try / installmentCount)} / ay (Vade Farksız)`
            : 'Vade farksız 3 veya 6 taksit imkanı';

        return (
          <View
            key={pkg.code}
            style={[
              styles.planCard,
              pkg.popular_badge?.includes('En Çok')
                ? { borderColor: palette.accentBorder, borderWidth: 1.5 }
                : null,
            ]}
          >
            <View style={styles.planTopRow}>
              <View
                style={[
                  styles.creditsPill,
                  {
                    backgroundColor: palette.accentBg,
                    borderColor: palette.accentBorder,
                  },
                ]}
              >
                <Sparkles size={12} color={palette.accentColor} />
                <Text
                  style={[styles.creditsPillText, { color: palette.accentColor }]}
                >
                  +{pkg.credits} Ders Kredisi
                </Text>
              </View>

              {pkg.popular_badge ? (
                <View style={styles.popularBadge}>
                  <Star size={11} color={COLORS.warningText} fill={COLORS.warning} />
                  <Text style={styles.popularBadgeText}>{pkg.popular_badge}</Text>
                </View>
              ) : (
                <Text style={styles.durationText}>{pkg.duration_days} Gün Geçerli</Text>
              )}
            </View>

            <Text style={styles.planTitle}>{pkg.name}</Text>
            <Text style={styles.planSubtitle}>
              {pkg.duration_days} Gün Geçerli • {pkg.subtitle}
            </Text>

            <View style={styles.priceBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.priceAmount}>{formatTry(pkg.price_try)}</Text>
                <Text style={styles.priceInstallment}>{installmentPreview}</Text>
              </View>
              <View style={styles.perLessonPill}>
                <Text style={styles.perLessonText}>₺{perClassPrice} / ders</Text>
              </View>
            </View>

            <View style={styles.featureList}>
              {(pkg.features ?? []).map((feat, fIdx) => (
                <View key={`${pkg.code}-f-${fIdx}`} style={styles.featureRow}>
                  <CheckCircle2 size={14} color={palette.accentColor} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.selectPlanBtn,
                { backgroundColor: palette.accentColor },
                creatingSession && { opacity: isSubmitting ? 0.8 : 0.55 },
              ]}
              disabled={creatingSession}
              onPress={() => handleSelectAndRedirect(pkg)}
              activeOpacity={0.86}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Lock size={15} color={COLORS.white} />
                  <Text style={styles.selectPlanBtnText}>
                    Satın Al • Güvenli Ödemeye Git
                  </Text>
                  <ArrowRight size={15} color={COLORS.white} />
                </>
              )}
            </TouchableOpacity>
          </View>
        );
      })}

      {/* 4. SON ÖDEME GEÇMİŞİ */}
      {(historyData?.transactions ?? []).length > 0 && (
        <View style={styles.historySection}>
          <View style={styles.historyHeaderRow}>
            <History size={17} color={COLORS.secondary} />
            <Text style={styles.historySectionTitle}>Son Ödeme İşlemlerim</Text>
          </View>

          {(historyData?.transactions ?? []).slice(0, 5).map((tx: PaymentHistoryItem) => (
            <View key={tx.id} style={styles.historyRowCard}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.historyTxTitle}>{tx.plan_name}</Text>
                <Text style={styles.historyTxMeta}>
                  {tx.transaction_code} • {tx.masked_payment_info}
                </Text>
                <Text style={styles.historyTxDate}>
                  {formatTurkishDateTime(tx.created_at)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.historyTxAmount}>{formatTry(tx.amount_try)}</Text>
                <Text style={styles.historyTxInst}>
                  {tx.installment_count > 1
                    ? `${tx.installment_count} Taksit`
                    : 'Tek Çekim'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
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
    paddingBottom: 44,
  },
  liveSessionCard: {
    backgroundColor: '#FFFDF7',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    gap: 11,
    ...CARD_SHADOW,
  },
  liveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 1,
  },
  liveBadgeText: {
    color: COLORS.warningText,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  liveTitle: {
    color: COLORS.textPrimary,
    fontSize: 17.5,
    fontWeight: '800',
  },
  liveDesc: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  liveMetaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  liveMetaLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  liveMetaVal: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  livePrimaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  livePrimaryBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  liveSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  liveReopenBtn: {
    flex: 1,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  liveReopenBtnText: {
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  liveCancelBtn: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveCancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  errorNoticeCard: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    gap: 8,
  },
  errorNoticeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorNoticeTitle: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  errorNoticeBody: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  errorNoticeDismiss: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  errorNoticeDismissText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineErrBox: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
  },
  inlineErrText: {
    color: COLORS.danger,
    fontSize: 12.5,
    fontWeight: '700',
  },
  currentPackageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 11,
    ...CARD_SHADOW,
  },
  currentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeStatusText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  daysRemainingText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  currentPkgTitle: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  currentCreditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  currentCreditsHighlight: {
    color: COLORS.primary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  expiryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: '#EAE0D0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  carryNoteText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  confirmationCard: {
    backgroundColor: '#FCF7EA',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: COLORS.success,
    gap: 10,
    ...CARD_SHADOW,
  },
  confirmationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  confirmVerifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  confirmVerifiedPillText: {
    color: COLORS.white,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  confirmCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  confirmCodeText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  confirmationTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  confirmationBody: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  confirmDetailsBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  confirmDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  confirmDetailKey: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  confirmDetailVal: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  hideReceiptBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hideReceiptBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 12,
    gap: 4,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  installmentBarCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  installmentBarLabel: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  installmentPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  instPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  instPillActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  instPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  instPillTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...CARD_SHADOW,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  creditsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  creditsPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  popularBadgeText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  durationText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  planTitle: {
    color: COLORS.textPrimary,
    fontSize: 18.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  planSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: -4,
    lineHeight: 18,
  },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  priceAmount: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  priceInstallment: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  perLessonPill: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  perLessonText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  selectPlanBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  selectPlanBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  historySection: {
    marginTop: 8,
    gap: 10,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  historySectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
  },
  historyRowCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyTxTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  historyTxMeta: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  historyTxDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  historyTxAmount: {
    color: COLORS.primary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  historyTxInst: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  physicalServiceBanner: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 7,
    ...CARD_SHADOW,
  },
  physicalServiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  physicalServiceTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    lineHeight: 18,
  },
  physicalServiceDesc: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18.5,
    fontWeight: '500',
  },
  catalogRetryBox: {
    backgroundColor: COLORS.warningBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EDD092',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  catalogRetryText: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  catalogRetryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  catalogRetryBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
});
