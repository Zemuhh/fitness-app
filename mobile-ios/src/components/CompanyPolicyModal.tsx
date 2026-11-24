import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileText,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { apiRequest } from '@/config/api';
import { FONTS } from '@/theme/colors';
import { CurrentPolicyResponse, PolicyAcceptResponse } from '@/types/authAdmin';

const MONO_FONT = Platform.select({
  web: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  ios: 'Menlo',
  default: 'monospace',
});

const PALETTE = {
  bg: '#111214',
  surface: '#181A1E',
  documentBg: '#131518',
  border: 'rgba(250, 246, 238, 0.09)',
  borderStrong: 'rgba(250, 246, 238, 0.16)',
  accent: '#C9A452',
  accentInk: '#111214',
  accentBorder: 'rgba(201, 164, 82, 0.55)',
  textPrimary: '#F5F2EB',
  textSecondary: '#A8A298',
  textMuted: '#757068',
  success: '#6DA67A',
  successBg: 'rgba(109, 166, 122, 0.10)',
  successBorder: 'rgba(109, 166, 122, 0.28)',
  danger: '#E07A74',
  dangerBg: 'rgba(224, 122, 116, 0.10)',
  dangerBorder: 'rgba(224, 122, 116, 0.28)',
};

const FALLBACK_POLICY: CurrentPolicyResponse = {
  version: '2026.1',
  title: 'Şirket Politikası, Stüdyo Kuralları ve KVKK Sözleşmesi',
  company_name: 'ERYA Pilates & Reformer',
  effective_date: '2026-01-01',
  full_text: '',
  sections: [
    {
      heading: '1. Üyelik ve Erişim Güvenliği',
      body: 'Stüdyo yöneticisi tarafından adınıza tanımlanan erişim kodu kişiye özeldir. Hesabınız üzerinden yapılan rezervasyonlar, iptaller ve yoklama kayıtları doğrudan üyelik paketinizle ilişkilendirilir.',
    },
    {
      heading: '2. Ders Rezervasyonu ve İptal Politikası',
      body: 'Rezervasyon yapıldığında aktif paketinizden 1 ders kredisi düşülür. Ders saatinden önce kurallara uygun şekilde iptal edilen seansların kredisi hesabınıza iade edilir. Haber verilmeden katılınmayan seanslar kullanılmış sayılır.',
    },
    {
      heading: '3. Stüdyo Kullanım ve Hijyen Kuralları',
      body: 'Derslere zamanında katılım beklenir. Reformer ve stüdyo ekipmanları eğitmen yönlendirmesiyle kullanılır; kaymaz çorap ve temiz spor kıyafeti zorunludur.',
    },
    {
      heading: '4. Sağlık Beyanı ve Fiziksel Uygunluk',
      body: 'Mevcut sakatlık, ameliyat geçmişi, kronik rahatsızlık veya hamilelik gibi özel sağlık durumlarının seans öncesinde stüdyo yönetimine ve eğitmene bildirilmesi üyenin sorumluluğundadır.',
    },
    {
      heading: '5. KVKK Aydınlatma ve Dijital Kayıt Onayı',
      body: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında kimlik, iletişim, rezervasyon ve sağlık notu verileriniz yalnızca stüdyo hizmetlerinin yürütülmesi ve güvenliği amacıyla işlenir. Bu onay, dijital imza kaydı olarak tarih ve doğrulama özetiyle arşivlenir.',
    },
  ],
};

export interface CompanyPolicyModalProps {
  authToken: string | null;
  userId: number | null;
  userFullName: string;
  userRole?: string;
  onAccepted: (acceptedAt?: string) => void;
  onLogout: () => void;
}

export function CompanyPolicyModal({
  authToken,
  userId,
  userFullName,
  onAccepted,
  onLogout,
}: CompanyPolicyModalProps) {
  const [policy, setPolicy] = useState<CurrentPolicyResponse>(FALLBACK_POLICY);
  const [loadingPolicy, setLoadingPolicy] = useState<boolean>(true);
  const [signerName, setSignerName] = useState<string>(userFullName || '');
  const [signerFocused, setSignerFocused] = useState<boolean>(false);
  const [acceptedChecked, setAcceptedChecked] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PolicyAcceptResponse | null>(null);

  const continueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (userFullName && !signerName) {
      setSignerName(userFullName);
    }
  }, [userFullName, signerName]);

  useEffect(() => {
    return () => {
      if (continueTimerRef.current) {
        clearTimeout(continueTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCurrentPolicy = async () => {
      setLoadingPolicy(true);
      try {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }
        const data = await apiRequest<CurrentPolicyResponse>('/policy/current', {
          method: 'GET',
          headers,
        });
        if (!active) return;

        if (data && Array.isArray(data.sections) && data.sections.length > 0) {
          setPolicy(data);
        } else if (data && data.full_text) {
          setPolicy({
            ...FALLBACK_POLICY,
            ...data,
            sections: [
              {
                heading: data.title || FALLBACK_POLICY.title,
                body: data.full_text,
              },
            ],
          });
        }

        if (data?.policy_accepted) {
          onAccepted();
        }
      } catch {
        // Ağ gecikmesi veya erişim hatasında yedek sözleşme maddeleriyle devam edilir
      } finally {
        if (active) {
          setLoadingPolicy(false);
        }
      }
    };

    loadCurrentPolicy();

    return () => {
      active = false;
    };
  }, [authToken, onAccepted]);

  const handleContinueNow = useCallback(() => {
    if (continueTimerRef.current) {
      clearTimeout(continueTimerRef.current);
      continueTimerRef.current = null;
    }
    onAccepted(receipt?.accepted_at);
  }, [onAccepted, receipt]);

  const handleSubmitAccept = useCallback(async () => {
    const cleanName = signerName.trim();
    if (cleanName.length < 2) {
      setErrorMessage('Lütfen dijital onay için adınızı ve soyadınızı girin.');
      return;
    }
    if (!acceptedChecked) {
      setErrorMessage('Devam etmek için sözleşme onay kutusunu işaretlemeniz gerekir.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const payload: { user_id?: number; signer_name: string; accepted: true } = {
        signer_name: cleanName,
        accepted: true,
      };
      if (typeof userId === 'number' && Number.isFinite(userId)) {
        payload.user_id = userId;
      }

      const response = await apiRequest<PolicyAcceptResponse>('/policy/accept', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response?.accepted) {
        throw new Error(
          response?.message || 'Sözleşme onayı sunucu tarafından doğrulanamadı.'
        );
      }

      setReceipt(response);
      continueTimerRef.current = setTimeout(() => {
        onAccepted(response.accepted_at);
      }, 950);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Sözleşme onayı kaydedilemedi. Lütfen tekrar deneyin.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [acceptedChecked, authToken, onAccepted, signerName, userId]);

  const canSubmit = signerName.trim().length >= 2 && acceptedChecked && !submitting;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.pageContainer}>
          {/* Üst Başlık */}
          <View style={styles.topHeader}>
            <View style={styles.brandRow}>
              <EryaBrandLogo size={32} showWordmark compact lightText />
              <TouchableOpacity
                style={styles.logoutLink}
                onPress={onLogout}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Çıkış Yap"
              >
                <LogOut size={15} strokeWidth={1.5} color={PALETTE.textSecondary} />
                <Text style={styles.logoutLinkText}>Çıkış Yap</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.screenTitle}>İlk Giriş Sözleşme Onayı</Text>
            <Text style={styles.screenSubtitle}>
              Stüdyo paneline geçmeden önce aşağıdaki politika ve KVKK metnini tek seferlik
              olarak onaylamanız gerekir.
            </Text>
          </View>

          {/* Kaydırılabilir Sözleşme Belgesi Kartı */}
          <View style={styles.documentCard}>
            <View style={styles.documentHeader}>
              <View style={styles.documentHeaderLeft}>
                <FileText size={16} strokeWidth={1.5} color={PALETTE.accent} />
                <Text style={styles.documentTitle} numberOfLines={2}>
                  {policy.title}
                </Text>
              </View>
              <View style={styles.documentMetaRow}>
                <Text style={styles.documentMetaText}>{policy.company_name}</Text>
                <Text style={styles.documentMetaDot}>·</Text>
                <Text style={styles.documentMetaMono}>Sürüm {policy.version}</Text>
                {policy.effective_date ? (
                  <>
                    <Text style={styles.documentMetaDot}>·</Text>
                    <Text style={styles.documentMetaMono}>{policy.effective_date}</Text>
                  </>
                ) : null}
                {loadingPolicy ? (
                  <ActivityIndicator
                    size="small"
                    color={PALETTE.textMuted}
                    style={styles.metaSpinner}
                  />
                ) : null}
              </View>
            </View>

            <ScrollView
              style={styles.documentScroll}
              contentContainerStyle={styles.documentScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {policy.sections.map((section, idx) => (
                <View
                  key={`${section.heading}-${idx}`}
                  style={[
                    styles.sectionBlock,
                    idx === policy.sections.length - 1 && styles.sectionBlockLast,
                  ]}
                >
                  <Text style={styles.sectionHeading}>{section.heading}</Text>
                  <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Alt Dijital Onay ve İmza Alanı */}
          <View style={styles.approvalPanel}>
            {receipt ? (
              <View style={styles.receiptBox}>
                <View style={styles.receiptHeader}>
                  <ShieldCheck size={18} strokeWidth={1.5} color={PALETTE.success} />
                  <Text style={styles.receiptTitle}>
                    Sözleşme onayınız sunucuya kaydedildi
                  </Text>
                </View>

                <View style={styles.receiptMetaList}>
                  {receipt.file_name ? (
                    <View style={styles.receiptMetaRow}>
                      <Text style={styles.receiptMetaLabel}>Arşiv dosyası</Text>
                      <Text style={styles.receiptMetaValue} numberOfLines={1}>
                        {receipt.file_name}
                      </Text>
                    </View>
                  ) : null}
                  {receipt.sha256 ? (
                    <View style={styles.receiptMetaRow}>
                      <Text style={styles.receiptMetaLabel}>SHA-256 özeti</Text>
                      <Text style={styles.receiptMetaValue} numberOfLines={1}>
                        {receipt.sha256.slice(0, 20)}...
                      </Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleContinueNow}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Panele Devam Et"
                >
                  <Text style={styles.primaryButtonText}>Panele Devam Et</Text>
                  <ArrowRight size={18} strokeWidth={1.75} color={PALETTE.accentInk} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Dijital onay ad-soyad</Text>
                <View
                  style={[
                    styles.inputRow,
                    signerFocused && styles.inputRowFocused,
                  ]}
                >
                  <User
                    size={16}
                    strokeWidth={1.5}
                    color={signerFocused ? PALETTE.accent : PALETTE.textMuted}
                  />
                  <TextInput
                    value={signerName}
                    onChangeText={(val) => {
                      setSignerName(val);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    onFocus={() => setSignerFocused(true)}
                    onBlur={() => setSignerFocused(false)}
                    placeholder="Adınız ve soyadınız"
                    placeholderTextColor={PALETTE.textMuted}
                    autoCapitalize="words"
                    returnKeyType="done"
                    style={styles.textInput}
                    accessibilityLabel="Dijital onay ad-soyad"
                  />
                </View>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => {
                    setAcceptedChecked((prev) => !prev);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedChecked }}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      acceptedChecked && styles.checkboxBoxChecked,
                    ]}
                  >
                    {acceptedChecked ? (
                      <Check size={14} strokeWidth={2.2} color={PALETTE.accentInk} />
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    Şirket Politika, Stüdyo Kuralları ve KVKK Sözleşmesini okudum,
                    anladım ve kabul ediyorum
                  </Text>
                </TouchableOpacity>

                {errorMessage ? (
                  <View style={styles.errorBox}>
                    <AlertCircle size={16} strokeWidth={1.5} color={PALETTE.danger} />
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                ) : null}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      styles.primaryButtonFlex,
                      !canSubmit && styles.buttonMuted,
                    ]}
                    onPress={handleSubmitAccept}
                    disabled={submitting}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Onayla ve Devam Et"
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={PALETTE.accentInk} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>Onayla ve Devam Et</Text>
                        <ArrowRight
                          size={18}
                          strokeWidth={1.75}
                          color={PALETTE.accentInk}
                        />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: PALETTE.bg,
  },
  flexOne: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },
  topHeader: {
    gap: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
  },
  logoutLinkText: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  screenTitle: {
    fontFamily: FONTS.serif,
    color: PALETTE.textPrimary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
  },
  screenSubtitle: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  documentCard: {
    flex: 1,
    minHeight: 180,
    backgroundColor: PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    overflow: 'hidden',
  },
  documentHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
    backgroundColor: PALETTE.documentBg,
    gap: 6,
  },
  documentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentTitle: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: PALETTE.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  documentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 24,
  },
  documentMetaText: {
    fontFamily: FONTS.sans,
    color: PALETTE.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
  documentMetaDot: {
    color: PALETTE.textMuted,
    fontSize: 12,
  },
  documentMetaMono: {
    fontFamily: MONO_FONT,
    color: PALETTE.textMuted,
    fontSize: 11,
    fontWeight: '400',
  },
  metaSpinner: {
    marginLeft: 4,
  },
  documentScroll: {
    flex: 1,
  },
  documentScrollContent: {
    padding: 16,
  },
  sectionBlock: {
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  sectionBlockLast: {
    paddingBottom: 4,
    marginBottom: 0,
    borderBottomWidth: 0,
  },
  sectionHeading: {
    fontFamily: FONTS.sans,
    color: PALETTE.textPrimary,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionBody: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '400',
  },
  approvalPanel: {
    backgroundColor: PALETTE.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.border,
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: -4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.documentBg,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    gap: 10,
  },
  inputRowFocused: {
    borderColor: PALETTE.accentBorder,
  },
  textInput: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: PALETTE.textPrimary,
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: 0,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: PALETTE.borderStrong,
    backgroundColor: PALETTE.documentBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: PALETTE.accent,
    borderColor: PALETTE.accent,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: PALETTE.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: PALETTE.dangerBg,
    borderWidth: 1,
    borderColor: PALETTE.dangerBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: PALETTE.danger,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.accent,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 16,
    gap: 8,
  },
  primaryButtonFlex: {
    flex: 1,
  },
  primaryButtonText: {
    fontFamily: FONTS.sans,
    color: PALETTE.accentInk,
    fontSize: 14.5,
    fontWeight: '600',
  },
  buttonMuted: {
    opacity: 0.5,
  },
  receiptBox: {
    gap: 12,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.successBg,
    borderWidth: 1,
    borderColor: PALETTE.successBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  receiptTitle: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: PALETTE.success,
    fontSize: 13.5,
    fontWeight: '500',
  },
  receiptMetaList: {
    backgroundColor: PALETTE.documentBg,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  receiptMetaLabel: {
    fontFamily: FONTS.sans,
    color: PALETTE.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
  receiptMetaValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: MONO_FONT,
    color: PALETTE.textSecondary,
    fontSize: 11.5,
    fontWeight: '400',
  },
});
