import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Layers,
  Lock,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { AppUser, MemberPackage } from '@/types/fitness';
import {
  CheckoutSessionCreatedResponse,
  CheckoutSessionStatusResponse,
  CreateCheckoutSessionPayload,
  DigitalReceipt,
  InstallmentCount,
  MemberPaymentHistoryResponse,
  PackageCatalogPlan,
  PaymentHistoryItem,
} from '@/types/payment';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const THEME = {
  background: COLORS.background,
  surface: COLORS.surface,
  surfaceElevated: COLORS.surfaceElevated,
  selectedSurface: '#FCF7EA',
  border: COLORS.border,
  borderStrong: '#D4C4AA',
  primary: COLORS.primary,
  primarySoft: COLORS.primaryLight,
  primaryBorder: '#E5CB90',
  indigo: COLORS.secondary,
  indigoSoft: COLORS.secondaryLight,
  indigoBorder: '#E5C5C9',
  success: COLORS.success,
  successSoft: COLORS.successBg,
  successBorder: COLORS.successBorder,
  warning: COLORS.warningText,
  warningSoft: COLORS.warningBg,
  warningBorder: '#EDD092',
  danger: COLORS.danger,
  dangerSoft: COLORS.dangerBg,
  dangerBorder: '#F0BFC3',
  textPrimary: COLORS.textPrimary,
  textSecondary: COLORS.textSecondary,
  textMuted: COLORS.textMuted,
  white: COLORS.white,
};

export function formatTry(amount: number): string {
  return `₺${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTurkishDateTime(iso: string): string {
  if (!iso) return '';
  const normalized = iso.replace('T', ' ').slice(0, 16);
  const [datePart, timePart] = normalized.split(' ');
  if (!datePart) return iso;
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}${timePart ? ` • ${timePart}` : ''}`;
  }
  return normalized;
}

export function formatProviderLabel(provider?: string | null): string {
  if (provider === 'stripe') return 'Stripe Checkout (SSL)';
  if (provider === 'iyzico') return 'iyzico Korumalı Ödeme';
  return 'ERYA Pay • 256-Bit SSL & 3D Secure';
}

function buildAppReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  try {
    return Linking.createURL('payment-return');
  } catch {
    return 'fitnessapp://payment-return';
  }
}

function openLoadingPopupOnWeb(): Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  try {
    const popup = window.open('', '_blank');
    if (popup && popup.document) {
      popup.document.write(
        '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Güvenli Ödeme Hazırlanıyor...</title></head>' +
          '<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f6f1e9;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#221d19;">' +
          '<div style="text-align:center;padding:28px;background:#fff;border-radius:20px;border:1px solid #e6dccb;box-shadow:0 8px 24px rgba(0,0,0,0.06);max-width:360px;">' +
          '<div style="font-size:26px;margin-bottom:10px;">🔒</div>' +
          '<div style="font-weight:800;font-size:16px;margin-bottom:6px;">Güvenli Ödeme Geçidine Yönlendiriliyorsunuz</div>' +
          '<div style="font-size:13px;color:#6b5e51;">256-Bit SSL &amp; 3D Secure oturumunuz hazırlanıyor...</div>' +
          '</div></body></html>'
      );
      popup.document.close();
    }
    return popup;
  } catch {
    return null;
  }
}

async function openExternalCheckoutUrl(
  checkoutUrl: string,
  returnUrl: string,
  preOpenedPopup?: Window | null
): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (preOpenedPopup && !preOpenedPopup.closed) {
      preOpenedPopup.location.href = checkoutUrl;
      preOpenedPopup.focus?.();
      return;
    }
    const opened = window.open(checkoutUrl, '_blank');
    if (!opened) {
      window.location.assign(checkoutUrl);
    }
    return;
  }

  try {
    await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);
    return;
  } catch {
    // Fallback to standard browser sheet or system browser
  }

  try {
    await WebBrowser.openBrowserAsync(checkoutUrl);
  } catch {
    await Linking.openURL(checkoutUrl);
  }
}

export interface UseHostedCheckoutFlowOptions {
  memberId: number;
  onSessionSucceeded?: (statusData: CheckoutSessionStatusResponse) => Promise<void> | void;
  onError?: (message: string) => void;
}

export function useHostedCheckoutFlow({
  memberId,
  onSessionSucceeded,
  onError,
}: UseHostedCheckoutFlowOptions) {
  const [creatingSession, setCreatingSession] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);
  const [activeSession, setActiveSession] =
    useState<CheckoutSessionStatusResponse | null>(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState<DigitalReceipt | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handledSuccessIdsRef = useRef<Set<string>>(new Set());
  const activeSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.session_id ?? null;
  }, [activeSession?.session_id]);

  // Üye değiştiğinde oturum izleyiciyi temizle
  useEffect(() => {
    setActiveSession(null);
    setVerifiedReceipt(null);
    setCheckoutError(null);
  }, [memberId]);

  const checkSessionStatus = useCallback(
    async (sessionIdOverride?: string, silent = false) => {
      const targetId = sessionIdOverride || activeSessionIdRef.current;
      if (!targetId) return null;

      if (!silent) setCheckingStatus(true);
      try {
        const statusRes = await apiRequest<CheckoutSessionStatusResponse>(
          `/payments/sessions/${encodeURIComponent(targetId)}`
        );

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveSession(statusRes);

        if (statusRes.status === 'succeeded') {
          if (statusRes.receipt) {
            setVerifiedReceipt(statusRes.receipt);
          }
          setCheckoutError(null);

          if (!handledSuccessIdsRef.current.has(statusRes.session_id)) {
            handledSuccessIdsRef.current.add(statusRes.session_id);
            await Promise.resolve(onSessionSucceeded?.(statusRes));
          }
        } else if (statusRes.status === 'failed') {
          const msg =
            statusRes.failure_reason ||
            'Ödeme doğrulaması tamamlanamadı. Lütfen yeni bir ödeme oturumu başlatın.';
          setCheckoutError(msg);
          onError?.(msg);
        }

        return statusRes;
      } catch (err: any) {
        if (!silent) {
          const msg = err?.message || 'Ödeme durumu sorgulanamadı.';
          setCheckoutError(msg);
          onError?.(msg);
        }
        return null;
      } finally {
        if (!silent) setCheckingStatus(false);
      }
    },
    [onError, onSessionSucceeded]
  );

  // Web geri dönüş URL parametresini (?payment_session_id=...) yakala
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const returnedSessionId = url.searchParams.get('payment_session_id');
      if (returnedSessionId) {
        url.searchParams.delete('payment_session_id');
        url.searchParams.delete('payment_status');
        window.history.replaceState({}, '', url.toString());
        checkSessionStatus(returnedSessionId, false);
      }
    } catch {
      // Ignore malformed URL
    }
  }, [checkSessionStatus]);

  // Mobil deep-link geri dönüşlerini yakala
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      try {
        const parsed = Linking.parse(url);
        const sid = parsed.queryParams?.payment_session_id;
        if (typeof sid === 'string' && sid.length > 0) {
          checkSessionStatus(sid, false);
        }
      } catch {
        // Ignore
      }
    });
    return () => sub.remove();
  }, [checkSessionStatus]);

  // Aktif 'pending' veya 'requires_3ds' oturumu varken periyodik + ön plan sorgulaması
  const isWaitingForGateway =
    activeSession?.status === 'pending' || activeSession?.status === 'requires_3ds';

  useEffect(() => {
    if (!isWaitingForGateway || !activeSession?.session_id) return;
    const sid = activeSession.session_id;

    const timer = setInterval(() => {
      checkSessionStatus(sid, true);
    }, 2200);

    const appStateSub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          checkSessionStatus(sid, true);
        }
      }
    );

    let cleanupWebListeners: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onFocus = () => checkSessionStatus(sid, true);
      const onMessage = (ev: MessageEvent) => {
        if (
          ev?.data &&
          typeof ev.data === 'object' &&
          ev.data.type === 'ERYA_PAYMENT_EVENT' &&
          ev.data.session_id === sid
        ) {
          checkSessionStatus(sid, false);
        }
      };

      window.addEventListener('focus', onFocus);
      window.addEventListener('message', onMessage);

      let channel: BroadcastChannel | null = null;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          channel = new BroadcastChannel('erya_payment_channel');
          channel.onmessage = (ev) => {
            if (ev?.data?.session_id === sid) {
              checkSessionStatus(sid, false);
            }
          };
        } catch {
          channel = null;
        }
      }

      cleanupWebListeners = () => {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('message', onMessage);
        channel?.close();
      };
    }

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      cleanupWebListeners?.();
    };
  }, [isWaitingForGateway, activeSession?.session_id, checkSessionStatus]);

  const startCheckoutRedirect = useCallback(
    async (params: {
      planId?: number;
      planCode?: string;
      installmentCount?: InstallmentCount;
    }) => {
      setCheckoutError(null);
      setVerifiedReceipt(null);

      // Web'de popup engelleyicisine takılmamak için tıklama anında sekmeyi hazırla
      const preOpenedPopup = openLoadingPopupOnWeb();
      const returnUrl = buildAppReturnUrl();

      setCreatingSession(true);
      try {
        const payload: CreateCheckoutSessionPayload = {
          member_id: memberId,
          plan_id: params.planId,
          plan_code: params.planCode,
          installment_count: params.installmentCount ?? 1,
          payment_method: 'credit_card',
          return_url: returnUrl,
          cancel_url: returnUrl,
        };

        const created = await apiRequest<CheckoutSessionCreatedResponse>(
          '/payments/checkout-session',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        const initialStatus: CheckoutSessionStatusResponse = {
          session_id: created.session_id,
          status: created.status,
          provider: created.provider,
          member_id: created.member_id,
          member_name: '',
          plan_id: created.plan_id,
          plan_code: created.plan_code,
          plan_name: created.plan_name,
          plan_credits: created.plan_credits,
          amount: created.amount,
          currency: created.currency,
          installment_count: created.installment_count,
          monthly_installment_try:
            Math.round((created.amount / Math.max(1, created.installment_count)) * 100) /
            100,
          payment_method: 'credit_card',
          checkout_url: created.checkout_url,
          return_url: created.return_url ?? returnUrl,
          created_at: new Date().toISOString(),
          expires_at: created.expires_at,
          purchased_credits: created.plan_credits,
          carried_credits: 0,
        };

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveSession(initialStatus);
        activeSessionIdRef.current = created.session_id;
        setCreatingSession(false);

        await openExternalCheckoutUrl(created.checkout_url, returnUrl, preOpenedPopup);

        // Native tarayıcı kapandığında anında durumu sorgula
        if (Platform.OS !== 'web') {
          await checkSessionStatus(created.session_id, false);
        }

        return created;
      } catch (err: any) {
        try {
          preOpenedPopup?.close();
        } catch {
          // Ignore
        }
        setCreatingSession(false);
        const msg =
          err?.message || 'Güvenli ödeme oturumu başlatılırken bir hata oluştu.';
        setCheckoutError(msg);
        onError?.(msg);
        return null;
      }
    },
    [memberId, checkSessionStatus, onError]
  );

  const reopenActiveCheckoutPage = useCallback(async () => {
    if (!activeSession?.checkout_url) return;
    const returnUrl = activeSession.return_url || buildAppReturnUrl();
    await openExternalCheckoutUrl(activeSession.checkout_url, returnUrl);
    if (Platform.OS !== 'web') {
      await checkSessionStatus(activeSession.session_id, false);
    }
  }, [activeSession, checkSessionStatus]);

  const cancelActiveCheckoutSession = useCallback(async () => {
    if (!activeSession?.session_id) {
      setActiveSession(null);
      return;
    }
    try {
      await apiRequest<CheckoutSessionStatusResponse>(
        `/payments/checkout/${encodeURIComponent(activeSession.session_id)}/cancel`,
        { method: 'POST' }
      );
    } catch {
      // Ignore network error on cancel
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveSession(null);
    setCheckoutError(null);
  }, [activeSession]);

  return {
    creatingSession,
    checkingStatus,
    activeSession,
    isWaitingForGateway,
    verifiedReceipt,
    setVerifiedReceipt,
    checkoutError,
    setCheckoutError,
    startCheckoutRedirect,
    checkSessionStatus,
    reopenActiveCheckoutPage,
    cancelActiveCheckoutSession,
    dismissSessionTracker: () => setActiveSession(null),
  };
}

export interface PackageStoreScreenProps {
  member: AppUser;
  onPurchaseCompleted?: () => void;
  onClose?: () => void;
}

export function PackageStoreScreen({
  member,
  onPurchaseCompleted,
  onClose,
}: PackageStoreScreenProps) {
  const { reloadUsers, triggerGlobalRefresh } = useAuthDemo();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const receiptAnim = useRef(new Animated.Value(0)).current;

  const [plans, setPlans] = useState<PackageCatalogPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [installmentCount, setInstallmentCount] = useState<InstallmentCount>(1);
  const [historyData, setHistoryData] = useState<MemberPaymentHistoryResponse | null>(
    null
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStoreAndHistory = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const [fetchedPlans, fetchedHistory] = await Promise.all([
          apiRequest<PackageCatalogPlan[]>('/payments/packages'),
          apiRequest<MemberPaymentHistoryResponse>(
            `/payments/member/${member.id}/history`
          ),
        ]);

        setPlans(fetchedPlans);
        setHistoryData(fetchedHistory);

        setSelectedPlanId((prevId) => {
          if (prevId && fetchedPlans.some((p) => p.id === prevId)) {
            return prevId;
          }
          const popular =
            fetchedPlans.find((p) => p.popular_badge?.includes('En Çok')) ||
            fetchedPlans.find((p) => p.credits === 8) ||
            fetchedPlans[0];
          return popular ? popular.id : null;
        });
      } catch (err: any) {
        setLoadError(err?.message || 'Paket mağazası verileri yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member.id]
  );

  useEffect(() => {
    loadStoreAndHistory(false);
  }, [loadStoreAndHistory]);

  const {
    creatingSession,
    checkingStatus,
    activeSession,
    isWaitingForGateway,
    verifiedReceipt,
    setVerifiedReceipt,
    checkoutError,
    setCheckoutError,
    startCheckoutRedirect,
    checkSessionStatus,
    reopenActiveCheckoutPage,
    cancelActiveCheckoutSession,
    dismissSessionTracker,
  } = useHostedCheckoutFlow({
    memberId: member.id,
    onSessionSucceeded: async () => {
      receiptAnim.setValue(0);
      Animated.spring(receiptAnim, {
        toValue: 1,
        friction: 7,
        tension: 65,
        useNativeDriver: true,
      }).start();

      await Promise.all([
        loadStoreAndHistory(true),
        Promise.resolve(reloadUsers?.()),
      ]);
      triggerGlobalRefresh?.();
      onPurchaseCompleted?.();

      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 140);
    },
  });

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadStoreAndHistory(true);
    if (activeSession?.session_id && isWaitingForGateway) {
      checkSessionStatus(activeSession.session_id, true);
    }
  }, [loadStoreAndHistory, activeSession?.session_id, isWaitingForGateway, checkSessionStatus]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId]
  );

  const activePackage: MemberPackage | null = historyData?.active_package ?? null;
  const currentRemainingCredits = Math.max(0, activePackage?.remaining_credits ?? 0);
  const projectedTotalCredits = selectedPlan
    ? currentRemainingCredits + selectedPlan.credits
    : currentRemainingCredits;

  const handleSelectPlan = useCallback(
    (planId: number) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedPlanId(planId);
      setCheckoutError(null);
    },
    [setCheckoutError]
  );

  const handleLaunchPurchase = useCallback(
    async (planOverride?: PackageCatalogPlan) => {
      const targetPlan = planOverride ?? selectedPlan;
      if (!targetPlan) return;

      const created = await startCheckoutRedirect({
        planId: targetPlan.id,
        planCode: targetPlan.code,
        installmentCount,
      });

      if (created) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }, 120);
      }
    },
    [selectedPlan, installmentCount, startCheckoutRedirect]
  );

  if (loading && plans.length === 0) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loaderText}>
          Paket kataloğu ve güvenli ödeme bağlantısı hazırlanıyor...
        </Text>
      </View>
    );
  }

  const monthlyPayAmount = selectedPlan
    ? selectedPlan.price_try / installmentCount
    : 0;
  const combinedError = checkoutError || loadError;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={THEME.primary}
          />
        }
      >
        {/* ÜST BAŞLIK & KAPAT AKSİYONU */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <View style={styles.storePill}>
              <Zap size={13} color={THEME.primary} />
              <Text style={styles.storePillText}>256-BİT SSL & 3D SECURE ÖDEME</Text>
            </View>
            <Text style={styles.screenTitle}>Paket Mağazası & Satın Alma</Text>
            <Text style={styles.screenSubtitle}>
              Paketinizi seçip güvenli banka 3D Secure ödeme sayfasında işleminizi tamamlayın.
            </Text>
          </View>

          {onClose && (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityLabel="Mağazayı Kapat"
            >
              <X size={20} color={THEME.textPrimary} />
            </TouchableOpacity>
          )}
        </View>

        {/* CANLI ÖDEME OTURUMU TAKİP KARTI (BEKLEYEN / 3DS AŞAMASINDA) */}
        {activeSession && isWaitingForGateway && (
          <View style={styles.liveSessionCard}>
            <View style={styles.liveSessionTopRow}>
              <View style={styles.livePulseBadge}>
                <Clock size={13} color={THEME.warning} />
                <Text style={styles.livePulseBadgeText}>
                  {activeSession.status === 'requires_3ds'
                    ? 'ADIM 2/2 • 3D SECURE SMS ONAYI BEKLENİYOR'
                    : 'ADIM 1/2 • GÜVENLİ ÖDEME SAYFASI AÇIK'}
                </Text>
              </View>
              <ActivityIndicator size="small" color={THEME.primary} />
            </View>

            <Text style={styles.liveSessionTitle}>{activeSession.plan_name}</Text>
            <Text style={styles.liveSessionDesc}>
              {activeSession.status === 'requires_3ds'
                ? `${activeSession.bank_name || 'Banka'} 3D Secure ekranında telefonunuza gelen 6 haneli doğrulama şifresini onaylayın. Ödeme tamamlandığında bakiyeniz otomatik güncellenir.`
                : `${formatProviderLabel(activeSession.provider)} ödeme penceresi açıldı. Kart ve taksit bilgilerinizi girip 3D Secure onayını tamamladığınızda paketiniz anında tanımlanır.`}
            </Text>

            <View style={styles.liveSessionAmountStrip}>
              <Text style={styles.liveSessionAmountLabel}>Ödenecek Tutar</Text>
              <Text style={styles.liveSessionAmountVal}>
                {formatTry(activeSession.amount)}
                {activeSession.installment_count > 1
                  ? ` (${activeSession.installment_count} Taksit)`
                  : ' (Tek Çekim)'}
              </Text>
            </View>

            <View style={styles.liveSessionBtnGroup}>
              <TouchableOpacity
                style={styles.liveCheckBtn}
                onPress={() => checkSessionStatus(activeSession.session_id, false)}
                disabled={checkingStatus}
                activeOpacity={0.86}
              >
                {checkingStatus ? (
                  <ActivityIndicator size="small" color={THEME.white} />
                ) : (
                  <>
                    <RefreshCw size={15} color={THEME.white} />
                    <Text style={styles.liveCheckBtnText}>
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
                  <Lock size={14} color={THEME.primary} />
                  <Text style={styles.liveReopenBtnText}>
                    Ödeme Sayfasını Tekrar Aç
                  </Text>
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
          </View>
        )}

        {/* İPTAL / BAŞARISIZ OTURUM BİLDİRİMİ */}
        {activeSession &&
          (activeSession.status === 'cancelled' || activeSession.status === 'failed') &&
          !verifiedReceipt && (
            <View style={styles.cancelledNoticeCard}>
              <View style={styles.cancelledTopRow}>
                <AlertCircle size={18} color={THEME.danger} />
                <Text style={styles.cancelledTitle}>
                  {activeSession.status === 'failed'
                    ? 'Ödeme Doğrulaması Başarısız'
                    : 'Ödeme Oturumu İptal Edildi'}
                </Text>
              </View>
              <Text style={styles.cancelledSub}>
                {activeSession.failure_reason ||
                  'Kartınızdan herhangi bir tahsilat yapılmadı. Dilediğiniz zaman yeni bir ödeme oturumu başlatabilirsiniz.'}
              </Text>
              <TouchableOpacity
                style={styles.dismissNoticeBtn}
                onPress={dismissSessionTracker}
                activeOpacity={0.85}
              >
                <Text style={styles.dismissNoticeBtnText}>Bildirimi Kapat</Text>
              </TouchableOpacity>
            </View>
          )}

        {/* DOĞRULANMIŞ DİJİTAL MAKBUZ KARTI (status === 'succeeded') */}
        {verifiedReceipt && (
          <Animated.View
            style={[
              styles.receiptCard,
              {
                opacity: receiptAnim,
                transform: [
                  {
                    scale: receiptAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.receiptHeader}>
              <View style={styles.receiptSuccessBadge}>
                <CheckCircle2 size={17} color={THEME.white} />
                <Text style={styles.receiptSuccessBadgeText}>
                  3D SECURE ÖDEME ONAYLANDI
                </Text>
              </View>
              <View style={styles.receiptCodeBadge}>
                <Receipt size={13} color={THEME.primary} />
                <Text style={styles.receiptCodeText}>
                  {verifiedReceipt.transaction_code}
                </Text>
              </View>
            </View>

            <Text style={styles.receiptPlanTitle}>{verifiedReceipt.plan_name}</Text>
            <Text style={styles.receiptTimestamp}>
              Doğrulanmış Dijital Makbuz • {formatTurkishDateTime(verifiedReceipt.created_at)}
            </Text>

            <View style={styles.receiptCreditsGrid}>
              <View style={styles.receiptCreditItem}>
                <Text style={styles.receiptCreditValue}>
                  +{verifiedReceipt.purchased_credits}
                </Text>
                <Text style={styles.receiptCreditLabel}>Eklenen Ders</Text>
              </View>
              <View style={styles.receiptCreditItem}>
                <Text style={[styles.receiptCreditValue, { color: THEME.indigo }]}>
                  +{verifiedReceipt.carried_credits}
                </Text>
                <Text style={styles.receiptCreditLabel}>Devreden</Text>
              </View>
              <View style={[styles.receiptCreditItem, styles.receiptCreditItemHighlight]}>
                <Text style={[styles.receiptCreditValue, { color: THEME.primary }]}>
                  {verifiedReceipt.new_remaining_credits} Ders
                </Text>
                <Text style={[styles.receiptCreditLabel, { color: THEME.textPrimary }]}>
                  Yeni Bakiye
                </Text>
              </View>
            </View>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaKey}>Ödenen Tutar</Text>
              <Text style={styles.receiptMetaVal}>
                {formatTry(verifiedReceipt.amount_try)}
                {verifiedReceipt.installment_count > 1
                  ? ` (${verifiedReceipt.installment_count} x ${formatTry(
                      verifiedReceipt.monthly_installment_try
                    )})`
                  : ' (Tek Çekim)'}
              </Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaKey}>Ödeme Yöntemi</Text>
              <Text style={styles.receiptMetaVal}>
                {verifiedReceipt.payment_method_label} •{' '}
                {verifiedReceipt.masked_payment_info}
              </Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaKey}>Geçerlilik Sonu</Text>
              <Text style={styles.receiptMetaVal}>{verifiedReceipt.expiry_date}</Text>
            </View>

            <View style={styles.receiptActionsRow}>
              {onClose ? (
                <TouchableOpacity
                  style={styles.receiptPrimaryBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.receiptPrimaryBtnText}>
                    Üyelik Halkasını Gör ({verifiedReceipt.new_remaining_credits} Ders)
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.receiptSecondaryBtn}
                  onPress={() => setVerifiedReceipt(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.receiptSecondaryBtnText}>Makbuzu Gizle</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {/* MEVCUT BAKİYE & KREDİ BİRLEŞTİRME ÖNİZLEME KARTI */}
        <View style={styles.balanceBannerCard}>
          <View style={styles.balanceTopRow}>
            <View>
              <Text style={styles.balanceLabel}>AKTİF ÜYE BAKİYESİ</Text>
              <Text style={styles.balanceMemberName}>{member.full_name}</Text>
              <Text style={styles.balancePkgName}>
                {activePackage
                  ? activePackage.package_name
                  : 'Aktif üyelik paketi bulunmuyor'}
              </Text>
            </View>

            <View style={styles.balanceMetricGroup}>
              <View style={styles.balanceMetricBox}>
                <Text style={styles.balanceMetricValue}>{currentRemainingCredits}</Text>
                <Text style={styles.balanceMetricCaption}>Mevcut</Text>
              </View>
              {selectedPlan && (
                <>
                  <Text style={styles.balancePlusSign}>+</Text>
                  <View style={[styles.balanceMetricBox, styles.balanceMetricBoxSelected]}>
                    <Text style={[styles.balanceMetricValue, { color: THEME.indigo }]}>
                      {selectedPlan.credits}
                    </Text>
                    <Text style={styles.balanceMetricCaption}>Yeni</Text>
                  </View>
                  <Text style={styles.balancePlusSign}>=</Text>
                  <View style={[styles.balanceMetricBox, styles.balanceMetricBoxTotal]}>
                    <Text style={[styles.balanceMetricValue, { color: THEME.primary }]}>
                      {projectedTotalCredits}
                    </Text>
                    <Text style={[styles.balanceMetricCaption, { color: THEME.primary }]}>
                      Toplam
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.carryGuaranteeBar}>
            <ShieldCheck size={15} color={THEME.primary} />
            <Text style={styles.carryGuaranteeText}>
              {currentRemainingCredits > 0
                ? `Kredi Koruma Aktif: Mevcut ${currentRemainingCredits} dersiniz yanmadan yeni paketinize devredilir.`
                : '3D Secure banka doğrulaması tamamlandığı anda ders krediniz hesabınıza yüklenir.'}
            </Text>
          </View>
        </View>

        {combinedError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{combinedError}</Text>
          </View>
        )}

        {/* 1. BÖLÜM: PAKET VİTRİN KARTLARI */}
        <View style={styles.sectionHeader}>
          <Award size={18} color={THEME.primary} />
          <Text style={styles.sectionTitle}>1. Spor Paketinizi Seçin</Text>
        </View>

        <View style={styles.planList}>
          {plans.map((plan) => {
            const isSelected = selectedPlan?.id === plan.id;
            const isMostPopular = Boolean(plan.popular_badge?.includes('En Çok'));

            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, isSelected && styles.planCardSelected]}
                onPress={() => handleSelectPlan(plan.id)}
                activeOpacity={0.88}
              >
                <View style={styles.planTopBadgeRow}>
                  <View style={styles.creditsPill}>
                    <Layers size={13} color={THEME.primary} />
                    <Text style={styles.creditsPillText}>
                      {plan.credits} DERS KREDİSİ
                    </Text>
                  </View>

                  {plan.popular_badge ? (
                    <View
                      style={[
                        styles.popularBadge,
                        isMostPopular
                          ? styles.popularBadgePrimary
                          : styles.popularBadgeIndigo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.popularBadgeText,
                          isMostPopular
                            ? styles.popularBadgeTextPrimary
                            : styles.popularBadgeTextIndigo,
                        ]}
                      >
                        {plan.popular_badge}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.planMainRow}>
                  <View style={styles.planTitleCol}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planSubtitle}>{plan.subtitle}</Text>
                  </View>

                  <View style={styles.planPriceCol}>
                    <Text style={styles.planTotalPrice}>{formatTry(plan.price_try)}</Text>
                    <View style={styles.perLessonChip}>
                      <Text style={styles.perLessonText}>
                        {formatTry(plan.per_lesson_price_try)} / ders
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.planMetaStrip}>
                  <View style={styles.planMetaItem}>
                    <Calendar size={13} color={THEME.textSecondary} />
                    <Text style={styles.planMetaText}>{plan.duration_days} Gün Geçerli</Text>
                  </View>

                  {plan.savings_percent > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsBadgeText}>
                        %{plan.savings_percent} Avantaj ({formatTry(plan.savings_amount_try)} Kazanç)
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.featuresList}>
                  {plan.features.map((feat, idx) => (
                    <View key={idx} style={styles.featureRow}>
                      <Check size={14} color={THEME.primary} />
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.planSelectFooter}>
                  <View style={styles.planRadioGroup}>
                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && styles.radioOuterActive,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <Text
                      style={[
                        styles.planSelectLabel,
                        isSelected && styles.planSelectLabelActive,
                      ]}
                    >
                      {isSelected ? 'Seçili Paket' : 'Bu Paketi Seç'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.inlineBuyBtn,
                      creatingSession && { opacity: 0.65 },
                    ]}
                    disabled={creatingSession}
                    onPress={() => {
                      handleSelectPlan(plan.id);
                      handleLaunchPurchase(plan);
                    }}
                    activeOpacity={0.85}
                  >
                    <Lock size={13} color={THEME.white} />
                    <Text style={styles.inlineBuyBtnText}>Satın Al</Text>
                    <ArrowRight size={13} color={THEME.white} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 2. BÖLÜM: TAKSİT ÖN SEÇİMİ & GÜVENLİ ÖDEME GEÇİDİ YÖNLENDİRMESİ */}
        {selectedPlan && (
          <>
            <View style={styles.sectionHeader}>
              <CreditCard size={18} color={THEME.primary} />
              <Text style={styles.sectionTitle}>
                2. Taksit Seçimi & Güvenli Ödeme Geçidi
              </Text>
            </View>

            <View style={styles.paymentBentoCard}>
              <Text style={styles.inputLabel}>
                Vade Farksız Taksit Tercihiniz (Ödeme sayfasında da değiştirebilirsiniz)
              </Text>

              <View style={styles.installmentRow}>
                {([1, 3, 6] as InstallmentCount[]).map((count) => {
                  const isActive = installmentCount === count;
                  const perMonth = selectedPlan.price_try / count;
                  return (
                    <TouchableOpacity
                      key={count}
                      style={[
                        styles.installmentBox,
                        isActive && styles.installmentBoxActive,
                      ]}
                      onPress={() => setInstallmentCount(count)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.installmentTitle,
                          isActive && styles.installmentTitleActive,
                        ]}
                      >
                        {count === 1 ? 'Tek Çekim' : `${count} Taksit`}
                      </Text>
                      <Text style={styles.installmentSub}>
                        {count === 1
                          ? formatTry(perMonth)
                          : `${formatTry(perMonth)} / ay`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.gatewayInfoBox}>
                <View style={styles.gatewayInfoTop}>
                  <ShieldCheck size={18} color={THEME.primary} />
                  <Text style={styles.gatewayInfoTitle}>
                    256-Bit SSL & Banka 3D Secure Korumalı Ödeme
                  </Text>
                </View>
                <Text style={styles.gatewayInfoDesc}>
                  Kart bilgileriniz uygulama içinde saklanmaz. &quot;Satın Al&quot; butonuna
                  dokunduğunuzda doğrulamalı banka ödeme geçidine yönlendirilirsiniz; 3D
                  Secure SMS onayının ardından krediniz anında tanımlanır.
                </Text>
                <View style={styles.schemeRow}>
                  <View style={styles.schemePill}>
                    <Text style={styles.schemePillText}>VISA SECURE</Text>
                  </View>
                  <View style={styles.schemePill}>
                    <Text style={styles.schemePillText}>MASTERCARD ID CHECK</Text>
                  </View>
                  <View style={styles.schemePill}>
                    <Text style={styles.schemePillText}>BKM TROY 3D</Text>
                  </View>
                </View>
              </View>

              <View style={styles.checkoutFooter}>
                <View style={styles.checkoutSummaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkoutSummaryLabel}>Seçilen Paket</Text>
                    <Text style={styles.checkoutSummaryPlan}>{selectedPlan.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.checkoutSummaryPrice}>
                      {formatTry(selectedPlan.price_try)}
                    </Text>
                    <Text style={styles.checkoutSummarySub}>
                      {installmentCount > 1
                        ? `${installmentCount} x ${formatTry(monthlyPayAmount)} / ay`
                        : `Onay sonrası: ${projectedTotalCredits} ders`}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.payNowBtn,
                    creatingSession && styles.payNowBtnDisabled,
                  ]}
                  onPress={() => handleLaunchPurchase()}
                  disabled={creatingSession}
                  activeOpacity={0.88}
                >
                  {creatingSession ? (
                    <ActivityIndicator size="small" color={THEME.white} />
                  ) : (
                    <>
                      <Lock size={17} color={THEME.white} />
                      <Text style={styles.payNowBtnText}>
                        Satın Al • Güvenli Ödeme Sayfasına Git (
                        {formatTry(selectedPlan.price_try)})
                      </Text>
                      <ArrowRight size={17} color={THEME.white} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* 3. BÖLÜM: ÖDEME & PAKET GEÇMİŞİM */}
        <View style={styles.sectionHeader}>
          <History size={18} color={THEME.indigo} />
          <Text style={styles.sectionTitle}>Ödeme & Paket Geçmişim</Text>
        </View>

        {historyData && historyData.transactions.length > 0 ? (
          <View style={styles.historyList}>
            {historyData.transactions.map((tx: PaymentHistoryItem) => (
              <View key={tx.id} style={styles.historyCard}>
                <View style={styles.historyTopRow}>
                  <View style={styles.historyCodePill}>
                    <Receipt size={12} color={THEME.indigo} />
                    <Text style={styles.historyCodeText}>{tx.transaction_code}</Text>
                  </View>

                  <View
                    style={[
                      styles.historyStatusBadge,
                      tx.package_is_active
                        ? styles.historyStatusActive
                        : styles.historyStatusCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyStatusText,
                        tx.package_is_active
                          ? { color: THEME.primary }
                          : { color: THEME.textSecondary },
                      ]}
                    >
                      {tx.package_is_active ? 'Aktif Paket' : 'Tamamlandı'}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyMidRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyPlanName}>{tx.plan_name}</Text>
                    <Text style={styles.historySubInfo}>
                      {tx.payment_method_label} • {tx.masked_payment_info}
                    </Text>
                    <Text style={styles.historyDateText}>
                      {formatTurkishDateTime(tx.created_at)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.historyAmountText}>
                      {formatTry(tx.amount_try)}
                    </Text>
                    <Text style={styles.historyInstallmentText}>
                      {tx.installment_count > 1
                        ? `${tx.installment_count} Taksit`
                        : 'Tek Çekim'}
                    </Text>
                    <Text style={styles.historyCreditSummary}>
                      +{tx.plan_credits} Ders (Toplam: {tx.package_total_credits})
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistoryCard}>
            <Sparkles size={22} color={THEME.textMuted} />
            <Text style={styles.emptyHistoryTitle}>Henüz Dijital Ödeme Kaydı Yok</Text>
            <Text style={styles.emptyHistorySub}>
              Güvenli ödeme geçidinden bir paket satın aldığınızda doğrulanmış dijital
              makbuzlarınız burada listelenir.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default PackageStoreScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 44,
    gap: 18,
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: THEME.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loaderText: {
    color: THEME.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
  },
  storePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 2,
  },
  storePillText: {
    color: THEME.primary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  screenTitle: {
    color: THEME.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  liveSessionCard: {
    backgroundColor: '#FFFDF7',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: THEME.primary,
    gap: 12,
    ...CARD_SHADOW,
  },
  liveSessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  livePulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.warningSoft,
    borderWidth: 1,
    borderColor: THEME.warningBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexShrink: 1,
  },
  livePulseBadgeText: {
    color: THEME.warning,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  liveSessionTitle: {
    color: THEME.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  liveSessionDesc: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  liveSessionAmountStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  liveSessionAmountLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  liveSessionAmountVal: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  liveSessionBtnGroup: {
    gap: 8,
    marginTop: 2,
  },
  liveCheckBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  liveCheckBtnText: {
    color: THEME.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  liveSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  liveReopenBtn: {
    flex: 1,
    backgroundColor: THEME.primarySoft,
    borderWidth: 1,
    borderColor: THEME.primaryBorder,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  liveReopenBtnText: {
    color: THEME.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  liveCancelBtn: {
    backgroundColor: THEME.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveCancelBtnText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  cancelledNoticeCard: {
    backgroundColor: THEME.dangerSoft,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.dangerBorder,
    gap: 8,
  },
  cancelledTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelledTitle: {
    color: THEME.danger,
    fontSize: 14.5,
    fontWeight: '800',
  },
  cancelledSub: {
    color: THEME.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  dismissNoticeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: THEME.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.dangerBorder,
  },
  dismissNoticeBtnText: {
    color: THEME.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  balanceBannerCard: {
    backgroundColor: THEME.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  balanceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  balanceLabel: {
    color: THEME.textSecondary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  balanceMemberName: {
    color: THEME.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  balancePkgName: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  balanceMetricGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceMetricBox: {
    minWidth: 54,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: THEME.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  balanceMetricBoxSelected: {
    borderColor: THEME.indigoBorder,
    backgroundColor: THEME.indigoSoft,
  },
  balanceMetricBoxTotal: {
    borderColor: THEME.primaryBorder,
    backgroundColor: THEME.primarySoft,
  },
  balanceMetricValue: {
    color: THEME.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  balanceMetricCaption: {
    color: THEME.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  balancePlusSign: {
    color: THEME.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  carryGuaranteeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  carryGuaranteeText: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  receiptCard: {
    backgroundColor: THEME.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: THEME.success,
    gap: 12,
    ...CARD_SHADOW,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  receiptSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.success,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
  },
  receiptSuccessBadgeText: {
    color: THEME.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  receiptCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.primaryBorder,
  },
  receiptCodeText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  receiptPlanTitle: {
    color: THEME.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  receiptTimestamp: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: -6,
  },
  receiptCreditsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  receiptCreditItem: {
    flex: 1,
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  receiptCreditItemHighlight: {
    flex: 1.3,
    borderColor: THEME.primaryBorder,
    backgroundColor: THEME.primarySoft,
  },
  receiptCreditValue: {
    color: THEME.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  receiptCreditLabel: {
    color: THEME.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 2,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  receiptMetaKey: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  receiptMetaVal: {
    color: THEME.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  receiptActionsRow: {
    marginTop: 4,
  },
  receiptPrimaryBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  receiptPrimaryBtnText: {
    color: THEME.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  receiptSecondaryBtn: {
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  receiptSecondaryBtnText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: THEME.dangerSoft,
    borderWidth: 1,
    borderColor: THEME.dangerBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  errorBoxText: {
    color: THEME.danger,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    color: THEME.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  planList: {
    gap: 14,
  },
  planCard: {
    backgroundColor: THEME.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: THEME.border,
    gap: 12,
    ...CARD_SHADOW,
  },
  planCardSelected: {
    borderColor: THEME.primary,
    backgroundColor: THEME.selectedSurface,
  },
  planTopBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  creditsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  creditsPillText: {
    color: THEME.primary,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  popularBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  popularBadgePrimary: {
    backgroundColor: THEME.primary,
  },
  popularBadgeIndigo: {
    backgroundColor: THEME.indigoSoft,
    borderWidth: 1,
    borderColor: THEME.indigoBorder,
  },
  popularBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  popularBadgeTextPrimary: {
    color: THEME.white,
  },
  popularBadgeTextIndigo: {
    color: THEME.indigo,
  },
  planMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  planTitleCol: {
    flex: 1,
    gap: 4,
  },
  planName: {
    color: THEME.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  planSubtitle: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  planPriceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  planTotalPrice: {
    color: THEME.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  perLessonChip: {
    backgroundColor: THEME.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.primaryBorder,
  },
  perLessonText: {
    color: THEME.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  planMetaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  planMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  planMetaText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  savingsBadge: {
    backgroundColor: THEME.warningSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  savingsBadgeText: {
    color: THEME.warning,
    fontSize: 11,
    fontWeight: '800',
  },
  featuresList: {
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 12.5,
  },
  planSelectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  planRadioGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: THEME.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: THEME.primary,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: THEME.primary,
  },
  planSelectLabel: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  planSelectLabelActive: {
    color: THEME.primary,
    fontWeight: '800',
  },
  inlineBuyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  inlineBuyBtnText: {
    color: THEME.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  paymentBentoCard: {
    backgroundColor: THEME.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 15,
    ...CARD_SHADOW,
  },
  inputLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  installmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  installmentBox: {
    flex: 1,
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.border,
    gap: 2,
  },
  installmentBoxActive: {
    borderColor: THEME.primary,
    backgroundColor: THEME.primarySoft,
  },
  installmentTitle: {
    color: THEME.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  installmentTitleActive: {
    color: THEME.primary,
  },
  installmentSub: {
    color: THEME.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  gatewayInfoBox: {
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 8,
  },
  gatewayInfoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gatewayInfoTitle: {
    flex: 1,
    color: THEME.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  gatewayInfoDesc: {
    color: THEME.textSecondary,
    fontSize: 12,
    lineHeight: 17.5,
    fontWeight: '500',
  },
  schemeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  schemePill: {
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  schemePillText: {
    color: THEME.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  checkoutFooter: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 14,
  },
  checkoutSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  checkoutSummaryLabel: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  checkoutSummaryPlan: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  checkoutSummaryPrice: {
    color: THEME.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  checkoutSummarySub: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  payNowBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 15,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payNowBtnDisabled: {
    opacity: 0.65,
  },
  payNowBtnText: {
    color: THEME.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
    textAlign: 'center',
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.indigoSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  historyCodeText: {
    color: THEME.indigo,
    fontSize: 11.5,
    fontWeight: '800',
  },
  historyStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  historyStatusActive: {
    backgroundColor: THEME.primarySoft,
  },
  historyStatusCompleted: {
    backgroundColor: THEME.surfaceElevated,
  },
  historyStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  historyMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  historyPlanName: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  historySubInfo: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  historyDateText: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  historyAmountText: {
    color: THEME.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
  },
  historyInstallmentText: {
    color: THEME.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  historyCreditSummary: {
    color: THEME.primary,
    fontSize: 11.5,
    fontWeight: '800',
    marginTop: 3,
  },
  emptyHistoryCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    gap: 8,
    ...CARD_SHADOW,
  },
  emptyHistoryTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyHistorySub: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
});
