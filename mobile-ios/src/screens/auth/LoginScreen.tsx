import React, { useCallback, useState } from 'react';
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
  KeyRound,
  X,
} from 'lucide-react-native';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import {
  LegalDocumentsModal,
  LegalDocumentTab,
} from '@/components/LegalDocumentsModal';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { FONTS } from '@/theme/colors';

const MONO_FONT = Platform.select({
  web: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  ios: 'Menlo',
  default: 'monospace',
});

const PALETTE = {
  bg: '#111214',
  surface: '#181A1E',
  inputBg: '#131518',
  border: 'rgba(250, 246, 238, 0.09)',
  borderStrong: 'rgba(250, 246, 238, 0.16)',
  accent: '#C9A452',
  accentInk: '#111214',
  accentBorder: 'rgba(201, 164, 82, 0.55)',
  accentTint: 'rgba(201, 164, 82, 0.08)',
  textPrimary: '#F5F2EB',
  textSecondary: '#A8A298',
  textMuted: '#757068',
  danger: '#E07A74',
  dangerBg: 'rgba(224, 122, 116, 0.10)',
  dangerBorder: 'rgba(224, 122, 116, 0.28)',
};

export function LoginScreen() {
  const { loginWithAccessCode, panelConfig } = useAuthDemo();

  const [accessCode, setAccessCode] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [legalModalTab, setLegalModalTab] = useState<LegalDocumentTab | null>(null);

  const handleCodeLogin = useCallback(async () => {
    const cleanCode = accessCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage('Lütfen size verilen erişim kodunu girin.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await loginWithAccessCode(cleanCode);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Erişim kodu doğrulanamadı. Kodu kontrol edip tekrar deneyin.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [accessCode, loginWithAccessCode]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.headerBlock}>
              <EryaBrandLogo size={44} showWordmark lightText />

              <Text style={styles.title}>Stüdyo Girişi</Text>
              <Text style={styles.subtitle}>
                Stüdyo yöneticiniz tarafından size özel oluşturulan erişim koduyla giriş yapın
              </Text>
            </View>

            {panelConfig?.studio_banner_enabled &&
            (panelConfig.studio_banner_title || panelConfig.studio_banner_message) ? (
              <View style={styles.bannerCard}>
                {panelConfig.studio_banner_title ? (
                  <Text style={styles.bannerTitle}>{panelConfig.studio_banner_title}</Text>
                ) : null}
                {panelConfig.studio_banner_message ? (
                  <Text style={styles.bannerMessage}>
                    {panelConfig.studio_banner_message}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Erişim kodu</Text>
              <View
                style={[
                  styles.codeInputRow,
                  isFocused && styles.inputRowFocused,
                ]}
              >
                <KeyRound
                  size={18}
                  strokeWidth={1.5}
                  color={isFocused ? PALETTE.accent : PALETTE.textMuted}
                />
                <TextInput
                  value={accessCode}
                  onChangeText={(val) => {
                    setAccessCode(val.toUpperCase());
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="ERYA-4821"
                  placeholderTextColor={PALETTE.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="go"
                  onSubmitEditing={handleCodeLogin}
                  style={styles.codeInput}
                  accessibilityLabel="Erişim kodu"
                />
                {accessCode.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      setAccessCode('');
                      if (errorMessage) setErrorMessage(null);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Kodu temizle"
                  >
                    <X size={16} strokeWidth={1.5} color={PALETTE.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={styles.helperText}>
                Kodunuzu bilmiyorsanız stüdyo resepsiyonu veya yöneticinizden talep
                edebilirsiniz.
              </Text>

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <AlertCircle size={16} strokeWidth={1.5} color={PALETTE.danger} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                onPress={handleCodeLogin}
                disabled={submitting}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Giriş Yap"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={PALETTE.accentInk} />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Giriş Yap</Text>
                    <ArrowRight
                      size={18}
                      strokeWidth={1.75}
                      color={PALETTE.accentInk}
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.legalLinksRow}>
              <TouchableOpacity
                style={styles.legalLinkBtn}
                onPress={() => setLegalModalTab('privacy')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Gizlilik Politikası (KVKK)"
              >
                <Text style={styles.legalLinkText}>Gizlilik Politikası (KVKK)</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}>•</Text>
              <TouchableOpacity
                style={styles.legalLinkBtn}
                onPress={() => setLegalModalTab('terms')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Kullanım Koşulları"
              >
                <Text style={styles.legalLinkText}>Kullanım Koşulları</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>ERYA Pilates & Reformer</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LegalDocumentsModal
        visible={legalModalTab !== null}
        initialTab={legalModalTab ?? 'privacy'}
        onClose={() => setLegalModalTab(null)}
      />
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  headerBlock: {
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontFamily: FONTS.serif,
    color: PALETTE.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
    marginTop: 24,
  },
  subtitle: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    marginTop: 8,
  },
  bannerCard: {
    backgroundColor: PALETTE.accentTint,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  bannerTitle: {
    fontFamily: FONTS.sans,
    color: PALETTE.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  bannerMessage: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  fieldLabel: {
    fontFamily: FONTS.sans,
    color: PALETTE.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  codeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.inputBg,
    borderWidth: 1,
    borderColor: PALETTE.borderStrong,
    borderRadius: 10,
    height: 56,
    paddingHorizontal: 16,
    gap: 12,
  },
  codeInput: {
    flex: 1,
    fontFamily: MONO_FONT,
    color: PALETTE.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1.6,
    paddingVertical: 0,
  },
  inputRowFocused: {
    borderColor: PALETTE.accentBorder,
  },
  helperText: {
    fontFamily: FONTS.sans,
    color: PALETTE.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    marginTop: 12,
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
    marginTop: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: PALETTE.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.accent,
    borderRadius: 10,
    height: 52,
    marginTop: 20,
    gap: 8,
  },
  primaryButtonText: {
    fontFamily: FONTS.sans,
    color: PALETTE.accentInk,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
  },
  legalLinkBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  legalLinkText: {
    fontFamily: FONTS.sans,
    color: PALETTE.accent,
    fontSize: 12.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: PALETTE.textMuted,
    fontSize: 12,
  },
  footer: {
    alignItems: 'center',
    marginTop: 14,
  },
  footerText: {
    fontFamily: FONTS.sans,
    color: PALETTE.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
});
