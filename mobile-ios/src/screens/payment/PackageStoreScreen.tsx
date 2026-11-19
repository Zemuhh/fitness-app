import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {
  Award,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  History,
  Landmark,
  Layers,
  Lock,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { AppUser, MemberPackage } from '@/types/fitness';
import {
  DigitalReceipt,
  InstallmentCount,
  MemberPaymentHistoryResponse,
  PackageCatalogPlan,
  PaymentCheckoutResponse,
  PaymentHistoryItem,
  PaymentMethodType,
} from '@/types/payment';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const THEME = {
  background: '#090D16',
  surface: '#131B2E',
  surfaceElevated: '#1E293B',
  metallicStart: '#0F172A',
  metallicInner: '#17233B',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.15)',
  primary: '#10B981',
  primarySoft: 'rgba(16, 185, 129, 0.14)',
  accentVolt: '#A3E635',
  accentVoltSoft: 'rgba(163, 230, 53, 0.16)',
  indigo: '#6366F1',
  indigoSoft: 'rgba(99, 102, 241, 0.16)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
};

export interface PackageStoreScreenProps {
  member: AppUser;
  onPurchaseCompleted?: () => void;
  onClose?: () => void;
}

function formatTry(amount: number): string {
  return `₺${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCardNumberInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : '';
}

function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatTurkishDateTime(iso: string): string {
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

export function PackageStoreScreen({
  member,
  onPurchaseCompleted,
  onClose,
}: PackageStoreScreenProps) {
  const { triggerGlobalRefresh } = useAuthDemo();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const receiptAnim = useRef(new Animated.Value(0)).current;

  const [plans, setPlans] = useState<PackageCatalogPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [historyData, setHistoryData] = useState<MemberPaymentHistoryResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('credit_card');
  const [installmentCount, setInstallmentCount] = useState<InstallmentCount>(1);
  const [cardHolderName, setCardHolderName] = useState<string>(
    member.full_name.toLocaleUpperCase('tr-TR')
  );
  const [cardNumber, setCardNumber] = useState<string>('');
  const [expiryMmYy, setExpiryMmYy] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');

  const [lastReceipt, setLastReceipt] = useState<DigitalReceipt | null>(null);

  useEffect(() => {
    setCardHolderName(member.full_name.toLocaleUpperCase('tr-TR'));
    setLastReceipt(null);
    setErrorMsg(null);
  }, [member.id, member.full_name]);

  const loadStoreAndHistory = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg(null);
      try {
        const [fetchedPlans, fetchedHistory] = await Promise.all([
          apiRequest<PackageCatalogPlan[]>('/payments/plans'),
          apiRequest<MemberPaymentHistoryResponse>(`/payments/member/${member.id}/history`),
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
        setErrorMsg(err?.message || 'Paket mağazası verileri yüklenemedi.');
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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadStoreAndHistory(true);
  }, [loadStoreAndHistory]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null,
    [plans, selectedPlanId]
  );

  const activePackage: MemberPackage | null = historyData?.active_package ?? null;
  const currentRemainingCredits = Math.max(0, activePackage?.remaining_credits ?? 0);
  const projectedTotalCredits = selectedPlan
    ? currentRemainingCredits + selectedPlan.credits
    : currentRemainingCredits;

  const handleSelectPlan = useCallback((planId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedPlanId(planId);
    setErrorMsg(null);
  }, []);

  const handleSelectMethod = useCallback((method: PaymentMethodType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPaymentMethod(method);
    if (method !== 'credit_card') {
      setInstallmentCount(1);
    }
    setErrorMsg(null);
  }, []);

  const handleFillDemoCard = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPaymentMethod('credit_card');
    setCardHolderName(member.full_name.toLocaleUpperCase('tr-TR'));
    setCardNumber('4543 6012 8940 4242');
    setExpiryMmYy('09/29');
    setCvv('842');
    setErrorMsg(null);
  }, [member.full_name]);

  const previewCardNumber = useMemo(() => {
    const clean = cardNumber.replace(/\D/g, '');
    if (clean.length === 0) return '••••  ••••  ••••  4242';
    const padded = clean.padEnd(16, '•');
    return `${padded.slice(0, 4)}  ${padded.slice(4, 8)}  ${padded.slice(8, 12)}  ${padded.slice(12, 16)}`;
  }, [cardNumber]);

  const handleCheckout = useCallback(async () => {
    if (!selectedPlan) return;
    setErrorMsg(null);

    if (paymentMethod === 'credit_card') {
      const cleanDigits = cardNumber.replace(/\D/g, '');
      if (cardHolderName.trim().length < 3) {
        setErrorMsg('Lütfen kart üzerindeki ad soyad bilgisini girin veya "Demo Test Kartı Doldur" butonuna dokunun.');
        return;
      }
      if (cleanDigits.length < 12 || cleanDigits.length > 16) {
        setErrorMsg('Lütfen geçerli bir 16 haneli kart numarası girin.');
        return;
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryMmYy.trim())) {
        setErrorMsg('Son kullanma tarihini AA/YY formatında girin (örn. 09/29).');
        return;
      }
      if (cvv.replace(/\D/g, '').length < 3) {
        setErrorMsg('Lütfen 3 haneli CVV güvenlik kodunu girin.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await apiRequest<PaymentCheckoutResponse>('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          member_id: member.id,
          plan_id: selectedPlan.id,
          payment_method: paymentMethod,
          card_holder_name: cardHolderName.trim(),
          card_number: paymentMethod === 'credit_card' ? cardNumber : undefined,
          expiry_mm_yy: paymentMethod === 'credit_card' ? expiryMmYy : undefined,
          cvv: paymentMethod === 'credit_card' ? cvv : undefined,
          installment_count: paymentMethod === 'credit_card' ? installmentCount : 1,
        }),
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLastReceipt(response.receipt);
      setCvv('');

      receiptAnim.setValue(0);
      Animated.spring(receiptAnim, {
        toValue: 1,
        friction: 7,
        tension: 65,
        useNativeDriver: true,
      }).start();

      await loadStoreAndHistory(true);
      triggerGlobalRefresh();
      onPurchaseCompleted?.();

      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 120);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ödeme işlemi sırasında bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedPlan,
    paymentMethod,
    cardNumber,
    cardHolderName,
    expiryMmYy,
    cvv,
    member.id,
    installmentCount,
    receiptAnim,
    loadStoreAndHistory,
    triggerGlobalRefresh,
    onPurchaseCompleted,
  ]);

  if (loading && plans.length === 0) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loaderText}>Paket mağazası ve üyelik bakiyeniz hazırlanıyor...</Text>
      </View>
    );
  }

  const effectiveInstallment: InstallmentCount =
    paymentMethod === 'credit_card' ? installmentCount : 1;
  const monthlyPayAmount = selectedPlan
    ? selectedPlan.price_try / effectiveInstallment
    : 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
              <Zap size={13} color={THEME.accentVolt} />
              <Text style={styles.storePillText}>PRO STORE • ANINDA AKTİVASYON</Text>
            </View>
            <Text style={styles.screenTitle}>Paket Satın Al & Yenile</Text>
            <Text style={styles.screenSubtitle}>
              Mevcut ders haklarınız yanmaz; yeni paketinizle otomatik birleşir.
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

        {/* MEVCUT BAKİYE & KREDİ BİRLEŞTİRME ÖNİZLEME BENTO KARTI */}
        <View style={styles.balanceBannerCard}>
          <View style={styles.balanceTopRow}>
            <View>
              <Text style={styles.balanceLabel}>AKTİF ÜYE BAKİYESİ</Text>
              <Text style={styles.balanceMemberName}>{member.full_name}</Text>
              <Text style={styles.balancePkgName}>
                {activePackage ? activePackage.package_name : 'Aktif paket bulunmuyor'}
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
                    <Text style={[styles.balanceMetricValue, { color: THEME.accentVolt }]}>
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
                ? `Kredi Koruma Aktif: Mevcut ${currentRemainingCredits} dersiniz yanmadan yeni paketinize eklenir.`
                : 'Seçtiğiniz paket ödeme onayıyla birlikte saniyeler içinde hesabınıza tanımlanır.'}
            </Text>
          </View>
        </View>

        {/* DİJİTAL MAKBUZ ONAY KARTI (ÖDEME TAMAMLANDIĞINDA GÖSTERİLİR) */}
        {lastReceipt && (
          <Animated.View
            style={[
              styles.receiptCard,
              {
                opacity: receiptAnim,
                transform: [
                  {
                    scale: receiptAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.receiptHeader}>
              <View style={styles.receiptSuccessBadge}>
                <CheckCircle2 size={18} color="#052E16" />
                <Text style={styles.receiptSuccessBadgeText}>ÖDEME ONAYLANDI</Text>
              </View>
              <View style={styles.receiptCodeBadge}>
                <Receipt size={13} color={THEME.accentVolt} />
                <Text style={styles.receiptCodeText}>{lastReceipt.transaction_code}</Text>
              </View>
            </View>

            <Text style={styles.receiptPlanTitle}>{lastReceipt.plan_name}</Text>
            <Text style={styles.receiptTimestamp}>
              Dijital Makbuz • {formatTurkishDateTime(lastReceipt.created_at)}
            </Text>

            <View style={styles.receiptCreditsGrid}>
              <View style={styles.receiptCreditItem}>
                <Text style={styles.receiptCreditValue}>+{lastReceipt.purchased_credits}</Text>
                <Text style={styles.receiptCreditLabel}>Eklenen Ders</Text>
              </View>
              <View style={styles.receiptCreditItem}>
                <Text style={[styles.receiptCreditValue, { color: THEME.indigo }]}>
                  +{lastReceipt.carried_credits}
                </Text>
                <Text style={styles.receiptCreditLabel}>Devreden</Text>
              </View>
              <View style={[styles.receiptCreditItem, styles.receiptCreditItemHighlight]}>
                <Text style={[styles.receiptCreditValue, { color: THEME.accentVolt }]}>
                  {lastReceipt.new_total_credits} Ders
                </Text>
                <Text style={[styles.receiptCreditLabel, { color: THEME.textPrimary }]}>
                  Yeni Toplam Bakiye
                </Text>
              </View>
            </View>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaKey}>Ödenen Tutar</Text>
              <Text style={styles.receiptMetaVal}>
                {formatTry(lastReceipt.amount_try)}
                {lastReceipt.installment_count > 1
                  ? ` (${lastReceipt.installment_count} x ${formatTry(lastReceipt.monthly_installment_try)})`
                  : ' (Tek Çekim)'}
              </Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaKey}>Ödeme Yöntemi</Text>
              <Text style={styles.receiptMetaVal}>
                {lastReceipt.payment_method_label} • {lastReceipt.masked_payment_info}
              </Text>
            </View>
            <View style={styles.receiptMetaRow}>
              <Text style={styles.receiptMetaKey}>Paket Geçerlilik Tarihi</Text>
              <Text style={styles.receiptMetaVal}>{lastReceipt.expiry_date}</Text>
            </View>

            <View style={styles.receiptActionsRow}>
              {onClose ? (
                <TouchableOpacity
                  style={styles.receiptPrimaryBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.receiptPrimaryBtnText}>
                    Üyelik Halkasını Gör ({lastReceipt.new_total_credits} Ders)
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.receiptSecondaryBtn}
                  onPress={() => setLastReceipt(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.receiptSecondaryBtnText}>Makbuzu Gizle</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
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
                style={[
                  styles.planCard,
                  isSelected && styles.planCardSelected,
                ]}
                onPress={() => handleSelectPlan(plan.id)}
                activeOpacity={0.88}
              >
                {/* Üst Rozet Satırı */}
                <View style={styles.planTopBadgeRow}>
                  <View style={styles.creditsPill}>
                    <Layers size={13} color={THEME.primary} />
                    <Text style={styles.creditsPillText}>{plan.credits} DERS KREDİSİ</Text>
                  </View>

                  {plan.popular_badge ? (
                    <View
                      style={[
                        styles.popularBadge,
                        isMostPopular ? styles.popularBadgeVolt : styles.popularBadgeIndigo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.popularBadgeText,
                          isMostPopular
                            ? styles.popularBadgeTextVolt
                            : styles.popularBadgeTextIndigo,
                        ]}
                      >
                        {plan.popular_badge}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Paket Başlığı & Fiyat */}
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

                {/* Süre & Tasarruf Bilgisi */}
                <View style={styles.planMetaStrip}>
                  <View style={styles.planMetaItem}>
                    <Calendar size={13} color={THEME.textSecondary} />
                    <Text style={styles.planMetaText}>{plan.duration_days} Gün Geçerli</Text>
                  </View>

                  {plan.savings_percent > 0 && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsBadgeText}>
                        %{plan.savings_percent} Ders Başı Avantaj ({formatTry(plan.savings_amount_try)} Kazanç)
                      </Text>
                    </View>
                  )}
                </View>

                {/* Paket Özellikleri */}
                <View style={styles.featuresList}>
                  {plan.features.map((feat, idx) => (
                    <View key={idx} style={styles.featureRow}>
                      <Check size={14} color={isSelected ? THEME.accentVolt : THEME.primary} />
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </View>

                {/* Seçim Göstergesi */}
                <View style={styles.planSelectFooter}>
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
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 2. BÖLÜM: ÖDEME YÖNTEMİ & PROTOTİP ÖDEME MODÜLÜ */}
        <View style={styles.sectionHeader}>
          <CreditCard size={18} color={THEME.primary} />
          <Text style={styles.sectionTitle}>2. Ödeme Yöntemi & Taksit</Text>
        </View>

        <View style={styles.paymentBentoCard}>
          {/* Ödeme Yöntemi Seçici */}
          <View style={styles.methodSelectorRow}>
            <TouchableOpacity
              style={[
                styles.methodTab,
                paymentMethod === 'credit_card' && styles.methodTabActive,
              ]}
              onPress={() => handleSelectMethod('credit_card')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.methodTabText,
                  paymentMethod === 'credit_card' && styles.methodTabTextActive,
                ]}
              >
                💳 Kredi / Banka Kartı
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.methodTab,
                paymentMethod === 'apple_pay' && styles.methodTabActive,
              ]}
              onPress={() => handleSelectMethod('apple_pay')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.methodTabText,
                  paymentMethod === 'apple_pay' && styles.methodTabTextActive,
                ]}
              >
                 Apple Pay (Prototip)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.methodTab,
                paymentMethod === 'bank_transfer' && styles.methodTabActive,
              ]}
              onPress={() => handleSelectMethod('bank_transfer')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.methodTabText,
                  paymentMethod === 'bank_transfer' && styles.methodTabTextActive,
                ]}
              >
                🏦 Havale / FAST
              </Text>
            </TouchableOpacity>
          </View>

          {paymentMethod === 'credit_card' && (
            <View style={styles.creditCardSection}>
              {/* Canlı Metalik Koyu Kredi Kartı Önizlemesi */}
              <View style={styles.metallicCardPreview}>
                <View style={styles.metallicGlowAccent} />
                <View style={styles.metallicTopRow}>
                  <View style={styles.emvChip}>
                    <View style={styles.emvChipInner} />
                  </View>
                  <View style={styles.metallicBrandWrap}>
                    <Text style={styles.metallicBrandText}>ATHLETIC BLACK</Text>
                    <Text style={styles.metallicInstallmentPill}>
                      {installmentCount === 1 ? 'TEK ÇEKİM' : `${installmentCount} TAKSİT`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.metallicCardDigits}>{previewCardNumber}</Text>

                <View style={styles.metallicBottomRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metallicFieldCaption}>KART SAHİBİ</Text>
                    <Text style={styles.metallicFieldValue} numberOfLines={1}>
                      {cardHolderName.trim() || 'AD SOYAD'}
                    </Text>
                  </View>
                  <View style={styles.metallicExpiryBox}>
                    <Text style={styles.metallicFieldCaption}>SKT</Text>
                    <Text style={styles.metallicFieldValue}>{expiryMmYy || 'AA/YY'}</Text>
                  </View>
                </View>
              </View>

              {/* Tek Dokunuşla Demo Test Kartı Doldur */}
              <TouchableOpacity
                style={styles.demoFillBtn}
                onPress={handleFillDemoCard}
                activeOpacity={0.85}
              >
                <Sparkles size={16} color={THEME.accentVolt} />
                <Text style={styles.demoFillBtnText}>Demo Test Kartı Doldur</Text>
              </TouchableOpacity>

              {/* Kart Form Alanları */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Kart Üzerindeki İsim</Text>
                <TextInput
                  style={styles.textInput}
                  value={cardHolderName}
                  onChangeText={(txt) => setCardHolderName(txt.toLocaleUpperCase('tr-TR'))}
                  placeholder="AHMET YILMAZ"
                  placeholderTextColor={THEME.textMuted}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Kart Numarası (Tam numara asla kaydedilmez)</Text>
                <TextInput
                  style={styles.textInput}
                  value={cardNumber}
                  onChangeText={(txt) => setCardNumber(formatCardNumberInput(txt))}
                  placeholder="4543 6012 8940 4242"
                  placeholderTextColor={THEME.textMuted}
                  keyboardType="number-pad"
                  maxLength={19}
                />
              </View>

              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Son Kullanma (AA/YY)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={expiryMmYy}
                    onChangeText={(txt) => setExpiryMmYy(formatExpiryInput(txt))}
                    placeholder="09/29"
                    placeholderTextColor={THEME.textMuted}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>CVV Güvenlik Kodu</Text>
                  <TextInput
                    style={styles.textInput}
                    value={cvv}
                    onChangeText={(txt) => setCvv(txt.replace(/\D/g, '').slice(0, 4))}
                    placeholder="842"
                    placeholderTextColor={THEME.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              {/* Taksit Seçici */}
              <Text style={[styles.inputLabel, { marginTop: 4 }]}>
                Taksit Seçeneği (Vade Farksız Sporcu Avantajı)
              </Text>
              <View style={styles.installmentRow}>
                {([1, 3, 6] as InstallmentCount[]).map((count) => {
                  const isActive = installmentCount === count;
                  const perMonth = selectedPlan ? selectedPlan.price_try / count : 0;
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
            </View>
          )}

          {paymentMethod === 'apple_pay' && (
            <View style={styles.altMethodBox}>
              <View style={styles.altMethodIconCircle}>
                <Smartphone size={22} color={THEME.accentVolt} />
              </View>
              <Text style={styles.altMethodTitle}> Apple Pay Hızlı Ödeme (Prototip)</Text>
              <Text style={styles.altMethodDesc}>
                Kart bilgilerinizi paylaşmadan Apple Cüzdan biyometrik doğrulama simülasyonu ile
                paketiniz anında hesabınıza tanımlanır.
              </Text>
              <View style={styles.altMethodTag}>
                <ShieldCheck size={14} color={THEME.primary} />
                <Text style={styles.altMethodTagText}>Tokenize Dijital Cüzdan • Tek Çekim</Text>
              </View>
            </View>
          )}

          {paymentMethod === 'bank_transfer' && (
            <View style={styles.altMethodBox}>
              <View style={styles.altMethodIconCircle}>
                <Landmark size={22} color={THEME.indigo} />
              </View>
              <Text style={styles.altMethodTitle}>7/24 Anında FAST / Havale (Prototip)</Text>
              <Text style={styles.altMethodDesc}>
                Alıcı: Athletic Studio Performans A.Ş.{'\n'}
                IBAN: TR42 0006 2000 0045 2026 0010 99{'\n'}
                Açıklama Kodu: FIT-{1000 + member.id}
              </Text>
              <View style={styles.altMethodTag}>
                <RefreshCw size={14} color={THEME.primary} />
                <Text style={styles.altMethodTagText}>
                  Prototip modunda FAST ödemeniz anında doğrulanır
                </Text>
              </View>
            </View>
          )}

          {errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{errorMsg}</Text>
            </View>
          )}

          {/* Ödeme Özeti & Onay Butonu */}
          {selectedPlan && (
            <View style={styles.checkoutFooter}>
              <View style={styles.checkoutSummaryRow}>
                <View>
                  <Text style={styles.checkoutSummaryLabel}>Seçilen Paket</Text>
                  <Text style={styles.checkoutSummaryPlan}>{selectedPlan.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.checkoutSummaryPrice}>
                    {formatTry(selectedPlan.price_try)}
                  </Text>
                  <Text style={styles.checkoutSummarySub}>
                    {effectiveInstallment > 1
                      ? `${effectiveInstallment} x ${formatTry(monthlyPayAmount)} / ay`
                      : `Yeni bakiye: ${projectedTotalCredits} ders`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.payNowBtn, submitting && styles.payNowBtnDisabled]}
                onPress={handleCheckout}
                disabled={submitting}
                activeOpacity={0.88}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#052E16" />
                ) : (
                  <>
                    <Lock size={17} color="#052E16" />
                    <Text style={styles.payNowBtnText}>
                      {paymentMethod === 'apple_pay'
                        ? ` Pay ile Öde • ${formatTry(selectedPlan.price_try)}`
                        : paymentMethod === 'bank_transfer'
                        ? `FAST Ödemesini Onayla • ${formatTry(selectedPlan.price_try)}`
                        : `Güvenli Ödemeyi Tamamla • ${formatTry(selectedPlan.price_try)}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

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
                    <Receipt size={12} color={THEME.accentVolt} />
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
                    <Text style={styles.historyAmountText}>{formatTry(tx.amount_try)}</Text>
                    <Text style={styles.historyInstallmentText}>
                      {tx.installment_count > 1 ? `${tx.installment_count} Taksit` : 'Tek Çekim'}
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
            <Receipt size={24} color={THEME.textMuted} />
            <Text style={styles.emptyHistoryTitle}>Henüz Dijital Ödeme Kaydı Yok</Text>
            <Text style={styles.emptyHistorySub}>
              Yukarıdaki paketlerden birini satın aldığınızda dijital makbuzlarınız ve paket
              geçmişiniz burada listelenir.
            </Text>
            {activePackage && (
              <View style={styles.seededPkgPill}>
                <Text style={styles.seededPkgPillText}>
                  Mevcut Tanımlı Paket: {activePackage.package_name} ({activePackage.remaining_credits}/
                  {activePackage.total_credits} Ders • SKT: {activePackage.expiry_date})
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 42,
    gap: 16,
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
    backgroundColor: THEME.accentVoltSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 2,
  },
  storePillText: {
    color: THEME.accentVolt,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  screenTitle: {
    color: THEME.textPrimary,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    color: THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBannerCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 14,
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
    minWidth: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: THEME.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  balanceMetricBoxSelected: {
    borderColor: 'rgba(163, 230, 53, 0.35)',
    backgroundColor: 'rgba(163, 230, 53, 0.08)',
  },
  balanceMetricBoxTotal: {
    borderColor: 'rgba(16, 185, 129, 0.45)',
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
    paddingVertical: 9,
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
    backgroundColor: '#0E2229',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: THEME.primary,
    gap: 12,
    shadowColor: THEME.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    backgroundColor: THEME.primary,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
  },
  receiptSuccessBadgeText: {
    color: '#052E16',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  receiptCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.borderStrong,
  },
  receiptCodeText: {
    color: THEME.accentVolt,
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
    backgroundColor: THEME.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  receiptCreditItemHighlight: {
    flex: 1.3,
    borderColor: 'rgba(163, 230, 53, 0.45)',
    backgroundColor: 'rgba(163, 230, 53, 0.1)',
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
    backgroundColor: THEME.accentVolt,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  receiptPrimaryBtnText: {
    color: '#090D16',
    fontSize: 13.5,
    fontWeight: '800',
  },
  receiptSecondaryBtn: {
    backgroundColor: THEME.surface,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.borderStrong,
  },
  receiptSecondaryBtnText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
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
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: THEME.border,
    gap: 12,
  },
  planCardSelected: {
    borderColor: THEME.primary,
    backgroundColor: '#132235',
    shadowColor: THEME.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
  popularBadgeVolt: {
    backgroundColor: THEME.accentVolt,
  },
  popularBadgeIndigo: {
    backgroundColor: THEME.indigoSoft,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  popularBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  popularBadgeTextVolt: {
    color: '#090D16',
  },
  popularBadgeTextIndigo: {
    color: '#A5B4FC',
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
    lineHeight: 17,
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
    backgroundColor: THEME.surfaceElevated,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  perLessonText: {
    color: THEME.accentVolt,
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
    paddingTop: 4,
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
    opacity: 0.9,
  },
  planSelectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
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
  paymentBentoCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 16,
  },
  methodSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodTab: {
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: THEME.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
  },
  methodTabActive: {
    borderColor: THEME.primary,
    backgroundColor: THEME.primarySoft,
  },
  methodTabText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  methodTabTextActive: {
    color: THEME.textPrimary,
    fontWeight: '800',
  },
  creditCardSection: {
    gap: 12,
  },
  metallicCardPreview: {
    backgroundColor: THEME.metallicStart,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    gap: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  metallicGlowAccent: {
    position: 'absolute',
    right: -35,
    top: -35,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
  },
  metallicTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emvChip: {
    width: 40,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emvChipInner: {
    width: 22,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.55)',
  },
  metallicBrandWrap: {
    alignItems: 'flex-end',
    gap: 4,
  },
  metallicBrandText: {
    color: THEME.textSecondary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  metallicInstallmentPill: {
    color: THEME.accentVolt,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(163, 230, 53, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  metallicCardDigits: {
    color: THEME.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  metallicBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  metallicExpiryBox: {
    alignItems: 'flex-end',
  },
  metallicFieldCaption: {
    color: THEME.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metallicFieldValue: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  demoFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: THEME.indigoSoft,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.45)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  demoFillBtnText: {
    color: '#C7D2FE',
    fontSize: 12.5,
    fontWeight: '800',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  installmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  installmentBox: {
    flex: 1,
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    gap: 3,
  },
  installmentBoxActive: {
    borderColor: THEME.primary,
    backgroundColor: THEME.primarySoft,
  },
  installmentTitle: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  installmentTitleActive: {
    color: THEME.primary,
    fontWeight: '800',
  },
  installmentSub: {
    color: THEME.textPrimary,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  altMethodBox: {
    backgroundColor: THEME.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 8,
  },
  altMethodIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: THEME.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altMethodTitle: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  altMethodDesc: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    lineHeight: 19,
  },
  altMethodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  altMethodTagText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: THEME.dangerSoft,
    borderWidth: 1,
    borderColor: THEME.danger,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  errorBoxText: {
    color: '#FCA5A5',
    fontSize: 12.5,
    fontWeight: '700',
  },
  checkoutFooter: {
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 14,
    gap: 12,
  },
  checkoutSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  checkoutSummaryLabel: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  checkoutSummaryPlan: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 1,
  },
  checkoutSummaryPrice: {
    color: THEME.accentVolt,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  checkoutSummarySub: {
    color: THEME.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    shadowColor: THEME.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  payNowBtnDisabled: {
    opacity: 0.65,
  },
  payNowBtnText: {
    color: '#052E16',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 10,
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
    backgroundColor: THEME.surfaceElevated,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  historyCodeText: {
    color: THEME.accentVolt,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyPlanName: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  historySubInfo: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  historyDateText: {
    color: THEME.textMuted,
    fontSize: 11.5,
    marginTop: 2,
  },
  historyAmountText: {
    color: THEME.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  historyInstallmentText: {
    color: THEME.textSecondary,
    fontSize: 11.5,
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
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    gap: 8,
  },
  emptyHistoryTitle: {
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  emptyHistorySub: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  seededPkgPill: {
    marginTop: 4,
    backgroundColor: THEME.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  seededPkgPillText: {
    color: THEME.primary,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
});
