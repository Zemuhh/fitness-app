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
import Svg, { Path } from 'react-native-svg';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Gift,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react-native';
import { EryaBrandLogo } from '@/components/EryaBrandLogo';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { FONTS } from '@/theme/colors';
import { AuthSessionOut } from '@/types/authAdmin';

function GoogleColorIcon({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
      <Path
        fill="#34A853"
        d="M3.5 16.5l3.2-2.4c.9 2.2 3 3.8 5.3 3.8 1.9 0 3.5-.6 4.6-1.7l3 2.3C17.8 20.5 15.1 21.6 12 21.6c-3.8 0-7.1-2.1-8.5-5.1z"
      />
      <Path
        fill="#FBBC05"
        d="M6.7 14.1c-.2-.6-.4-1.3-.4-2.1s.2-1.5.4-2.1L3.5 7.5C2.8 8.9 2.4 10.4 2.4 12s.4 3.1 1.1 4.5l3.2-2.4z"
      />
      <Path
        fill="#4285F4"
        d="M21.2 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.2c-.3 1.4-1.1 2.5-2.2 3.2l3 2.3c1.8-1.6 3.2-4.1 3.2-7.4z"
      />
    </Svg>
  );
}

const DARK = {
  bg: '#090D16',
  card: '#111827',
  inputBg: '#0D1422',
  border: '#1F2C42',
  borderFocus: '#C9A452',
  gold: '#C9A452',
  goldBright: '#E2BE68',
  goldSoft: 'rgba(201, 164, 82, 0.14)',
  goldBorder: 'rgba(201, 164, 82, 0.34)',
  emeraldSoft: 'rgba(16, 185, 129, 0.14)',
  emeraldBorder: 'rgba(16, 185, 129, 0.36)',
  emeraldText: '#6EE7B7',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  danger: '#F87171',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  dangerBorder: 'rgba(248, 113, 113, 0.32)',
  googleBtnBg: '#162033',
  googleBtnBorder: '#293852',
};

type AuthMode = 'login' | 'register';
type FocusField =
  | 'identifier'
  | 'password'
  | 'regName'
  | 'regEmail'
  | 'regPhone'
  | 'regPassword'
  | 'referralCode'
  | null;

export function LoginScreen() {
  const {
    loginWithPassword,
    loginWithGoogle,
    completeTokenLogin,
    panelConfig,
  } = useAuthDemo();

  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Giriş Alanları
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Kayıt Ol Alanları
  const [regFullName, setRegFullName] = useState<string>('');
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>('');
  const [showRegPassword, setShowRegPassword] = useState<boolean>(false);

  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [googleBusy, setGoogleBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allowGoogle = panelConfig?.allow_google_login !== false;

  const switchAuthMode = useCallback((nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setErrorMessage(null);
    setFocusedField(null);
  }, []);

  const handleSubmitLogin = useCallback(async () => {
    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage('Lütfen e-posta adresinizi veya kullanıcı adınızı girin.');
      return;
    }
    if (!password) {
      setErrorMessage('Lütfen şifrenizi girin.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await loginWithPassword(cleanId, password);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
    } finally {
      setSubmitting(false);
    }
  }, [identifier, password, loginWithPassword]);

  const handleSubmitRegister = useCallback(async () => {
    const cleanName = regFullName.trim();
    const cleanEmail = regEmail.trim().toLowerCase();
    const cleanPhone = regPhone.trim();
    const cleanReferral = referralCode.trim().toUpperCase();

    if (!cleanName) {
      setErrorMessage('Lütfen adınızı ve soyadınızı girin.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }
    if (!regPassword || regPassword.length < 4) {
      setErrorMessage('Lütfen en az 4 karakterli bir şifre belirleyin.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload: Record<string, string> = {
        full_name: cleanName,
        email: cleanEmail,
        password: regPassword,
        phone: cleanPhone || '0500 000 00 00',
      };
      if (cleanReferral.length > 0) {
        payload.referral_code = cleanReferral;
      }

      const session = await apiRequest<AuthSessionOut>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await completeTokenLogin(session.token);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Kayıt işlemi tamamlanamadı. Lütfen bilgilerinizi kontrol edin.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [regFullName, regEmail, regPhone, regPassword, referralCode, completeTokenLogin]);

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleBusy(true);
    setErrorMessage(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google ile giriş başlatılamadı.');
    } finally {
      setGoogleBusy(false);
    }
  }, [loginWithGoogle]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Dekoratif Yumuşak Arka Plan Işıltıları */}
      <View pointerEvents="none" style={styles.ambientGlowTop} />
      <View pointerEvents="none" style={styles.ambientGlowBottom} />

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerColumn}>
            {/* Üst Marka Bölümü */}
            <View style={styles.brandSection}>
              <EryaBrandLogo size={48} showWordmark lightText />
              <View style={styles.studioPill}>
                <Sparkles size={12} color={DARK.goldBright} />
                <Text style={styles.studioPillText}>GÜVENLİ STÜDYO OTURUMU</Text>
              </View>
              <Text style={styles.heroTitle}>
                {authMode === 'login' ? 'Hoş Geldiniz' : 'Yeni Üye Kaydı'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {authMode === 'login'
                  ? 'Devam etmek için e-posta adresiniz, kullanıcı adınız veya Google hesabınız ile giriş yapın.'
                  : 'Dakikalar içinde stüdyo hesabınızı oluşturun; davet kodunuz varsa +1 hediye ders kazanın.'}
              </Text>
            </View>

            {/* Stüdyo Duyuru Bandı (Admin tarafından aktif edildiyse) */}
            {panelConfig?.studio_banner_enabled &&
            (panelConfig.studio_banner_title || panelConfig.studio_banner_message) ? (
              <View style={styles.studioBannerBox}>
                {panelConfig.studio_banner_title ? (
                  <Text style={styles.studioBannerTitle}>{panelConfig.studio_banner_title}</Text>
                ) : null}
                {panelConfig.studio_banner_message ? (
                  <Text style={styles.studioBannerText}>{panelConfig.studio_banner_message}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Ana Giriş / Kayıt Kartı */}
            <View style={styles.loginCard}>
              {/* Giriş Yap / Kayıt Ol Sekme Seçici */}
              <View style={styles.modeSwitchTrack}>
                <TouchableOpacity
                  style={[
                    styles.modeSwitchTab,
                    authMode === 'login' && styles.modeSwitchTabActive,
                  ]}
                  onPress={() => switchAuthMode('login')}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.modeSwitchTabText,
                      authMode === 'login' && styles.modeSwitchTabTextActive,
                    ]}
                  >
                    Giriş Yap
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeSwitchTab,
                    authMode === 'register' && styles.modeSwitchTabActive,
                  ]}
                  onPress={() => switchAuthMode('register')}
                  activeOpacity={0.85}
                >
                  <UserPlus
                    size={14}
                    color={authMode === 'register' ? '#090D16' : DARK.textSecondary}
                  />
                  <Text
                    style={[
                      styles.modeSwitchTabText,
                      authMode === 'register' && styles.modeSwitchTabTextActive,
                    ]}
                  >
                    Kayıt Ol
                  </Text>
                </TouchableOpacity>
              </View>

              {authMode === 'login' ? (
                <>
                  {/* E-posta / Kullanıcı Adı */}
                  <Text style={styles.fieldLabel}>E-posta veya Kullanıcı Adı</Text>
                  <View
                    style={[
                      styles.inputRow,
                      focusedField === 'identifier' && styles.inputRowFocused,
                    ]}
                  >
                    <User
                      size={18}
                      color={focusedField === 'identifier' ? DARK.gold : DARK.textMuted}
                    />
                    <TextInput
                      value={identifier}
                      onChangeText={(val) => {
                        setIdentifier(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('identifier')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="ornek@eposta.com veya kullanıcı adı"
                      placeholderTextColor={DARK.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="next"
                      style={styles.textInput}
                    />
                  </View>

                  {/* Şifre */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Şifre</Text>
                  <View
                    style={[
                      styles.inputRow,
                      focusedField === 'password' && styles.inputRowFocused,
                    ]}
                  >
                    <Lock
                      size={18}
                      color={focusedField === 'password' ? DARK.gold : DARK.textMuted}
                    />
                    <TextInput
                      value={password}
                      onChangeText={(val) => {
                        setPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Şifrenizi girin"
                      placeholderTextColor={DARK.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={handleSubmitLogin}
                      style={styles.textInput}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((prev) => !prev)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={DARK.textSecondary} />
                      ) : (
                        <Eye size={18} color={DARK.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Hata Kutusu */}
                  {errorMessage ? (
                    <View style={styles.errorBanner}>
                      <AlertCircle size={16} color={DARK.danger} />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}

                  {/* Ana Giriş Yap Butonu */}
                  <TouchableOpacity
                    style={[styles.primaryLoginBtn, submitting && styles.btnDisabled]}
                    onPress={handleSubmitLogin}
                    disabled={submitting || googleBusy}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityLabel="Giriş Yap"
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#090D16" />
                    ) : (
                      <>
                        <Text style={styles.primaryLoginBtnText}>Giriş Yap</Text>
                        <ArrowRight size={18} color="#090D16" strokeWidth={2.4} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Google ile Giriş Yap */}
                  {allowGoogle && (
                    <>
                      <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>veya</Text>
                        <View style={styles.dividerLine} />
                      </View>

                      <TouchableOpacity
                        style={[styles.googleBtn, googleBusy && styles.btnDisabled]}
                        onPress={handleGoogleSignIn}
                        disabled={submitting || googleBusy}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Google ile Giriş Yap"
                      >
                        {googleBusy ? (
                          <ActivityIndicator size="small" color={DARK.textPrimary} />
                        ) : (
                          <>
                            <GoogleColorIcon size={19} />
                            <Text style={styles.googleBtnText}>Google ile Giriş Yap</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Hızlı Kayıt Ol Davet Yönlendirmesi */}
                  <TouchableOpacity
                    style={styles.switchHintBtn}
                    onPress={() => switchAuthMode('register')}
                    activeOpacity={0.8}
                  >
                    <Gift size={14} color={DARK.goldBright} />
                    <Text style={styles.switchHintText}>
                      Hesabınız yok mu?{' '}
                      <Text style={styles.switchHintHighlight}>
                        Davet Kodu ile Kayıt Olun (+1 Hediye Ders)
                      </Text>
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Ad Soyad */}
                  <Text style={styles.fieldLabel}>Ad Soyad</Text>
                  <View
                    style={[
                      styles.inputRow,
                      focusedField === 'regName' && styles.inputRowFocused,
                    ]}
                  >
                    <User
                      size={18}
                      color={focusedField === 'regName' ? DARK.gold : DARK.textMuted}
                    />
                    <TextInput
                      value={regFullName}
                      onChangeText={(val) => {
                        setRegFullName(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('regName')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Adınız ve Soyadınız"
                      placeholderTextColor={DARK.textMuted}
                      autoCapitalize="words"
                      returnKeyType="next"
                      style={styles.textInput}
                    />
                  </View>

                  {/* E-posta Adresi */}
                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>E-posta Adresi</Text>
                  <View
                    style={[
                      styles.inputRow,
                      focusedField === 'regEmail' && styles.inputRowFocused,
                    ]}
                  >
                    <Mail
                      size={18}
                      color={focusedField === 'regEmail' ? DARK.gold : DARK.textMuted}
                    />
                    <TextInput
                      value={regEmail}
                      onChangeText={(val) => {
                        setRegEmail(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('regEmail')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="ornek@eposta.com"
                      placeholderTextColor={DARK.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="next"
                      style={styles.textInput}
                    />
                  </View>

                  {/* Telefon Numarası */}
                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                    Telefon Numarası (Opsiyonel)
                  </Text>
                  <View
                    style={[
                      styles.inputRow,
                      focusedField === 'regPhone' && styles.inputRowFocused,
                    ]}
                  >
                    <Phone
                      size={18}
                      color={focusedField === 'regPhone' ? DARK.gold : DARK.textMuted}
                    />
                    <TextInput
                      value={regPhone}
                      onChangeText={(val) => {
                        setRegPhone(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('regPhone')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="05XX XXX XX XX"
                      placeholderTextColor={DARK.textMuted}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                      style={styles.textInput}
                    />
                  </View>

                  {/* Şifre */}
                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Şifre</Text>
                  <View
                    style={[
                      styles.inputRow,
                      focusedField === 'regPassword' && styles.inputRowFocused,
                    ]}
                  >
                    <Lock
                      size={18}
                      color={focusedField === 'regPassword' ? DARK.gold : DARK.textMuted}
                    />
                    <TextInput
                      value={regPassword}
                      onChangeText={(val) => {
                        setRegPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('regPassword')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Şifrenizi belirleyin"
                      placeholderTextColor={DARK.textMuted}
                      secureTextEntry={!showRegPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      style={styles.textInput}
                    />
                    <TouchableOpacity
                      onPress={() => setShowRegPassword((prev) => !prev)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showRegPassword ? (
                        <EyeOff size={18} color={DARK.textSecondary} />
                      ) : (
                        <Eye size={18} color={DARK.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Opsiyonel Davet Kodu Alanı */}
                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                    Davet Kodu (Opsiyonel - Örn: AHMET10)
                  </Text>
                  <View
                    style={[
                      styles.inputRow,
                      styles.referralInputRow,
                      focusedField === 'referralCode' && styles.inputRowFocused,
                    ]}
                  >
                    <Gift
                      size={18}
                      color={
                        focusedField === 'referralCode' || referralCode.trim().length > 0
                          ? DARK.emeraldText
                          : DARK.goldBright
                      }
                    />
                    <TextInput
                      value={referralCode}
                      onChangeText={(val) => {
                        setReferralCode(val.toUpperCase());
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('referralCode')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Davet Kodu (Opsiyonel - Örn: AHMET10)"
                      placeholderTextColor={DARK.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmitRegister}
                      style={styles.textInput}
                    />
                  </View>

                  {/* Hata Kutusu */}
                  {errorMessage ? (
                    <View style={styles.errorBanner}>
                      <AlertCircle size={16} color={DARK.danger} />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}

                  {/* Kayıt Ol Butonu */}
                  <TouchableOpacity
                    style={[styles.primaryLoginBtn, submitting && styles.btnDisabled]}
                    onPress={handleSubmitRegister}
                    disabled={submitting || googleBusy}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityLabel="Kayıt Ol"
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#090D16" />
                    ) : (
                      <>
                        <Text style={styles.primaryLoginBtnText}>
                          Hesap Oluştur & Başla
                        </Text>
                        <ArrowRight size={18} color="#090D16" strokeWidth={2.4} />
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Form Altı +1 Hediye Ders Bilgilendirme Kutusu */}
                  <View style={styles.referralBonusInfoBox}>
                    <Gift size={16} color={DARK.emeraldText} />
                    <Text style={styles.referralBonusInfoText}>
                      🎁 Arkadaşınızın davet kodunu girerek kayıt olduğunuzda hem size hem
                      arkadaşınıza anında{' '}
                      <Text style={styles.referralBonusBold}>+1 Hediye Ders</Text> kredisi
                      tanımlanır!
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.switchHintBtn}
                    onPress={() => switchAuthMode('login')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.switchHintText}>
                      Zaten üye misiniz?{' '}
                      <Text style={styles.switchHintHighlight}>Giriş Yapın</Text>
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Alt Güvenlik Bilgisi */}
            <View style={styles.footerRow}>
              <ShieldCheck size={14} color={DARK.textMuted} />
              <Text style={styles.footerText}>
                ERYA Pilates & Reformer • Şifreli Oturum Doğrulaması
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DARK.bg,
  },
  flexOne: {
    flex: 1,
  },
  ambientGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(201, 164, 82, 0.08)',
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  centerColumn: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  studioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: DARK.goldSoft,
    borderWidth: 1,
    borderColor: DARK.goldBorder,
  },
  studioPillText: {
    fontFamily: FONTS.sans,
    color: DARK.goldBright,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroTitle: {
    fontFamily: FONTS.serif,
    color: DARK.textPrimary,
    fontSize: 30,
    fontWeight: '700',
    marginTop: 12,
    letterSpacing: 0.3,
  },
  heroSubtitle: {
    fontFamily: FONTS.sans,
    color: DARK.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 340,
  },
  studioBannerBox: {
    backgroundColor: 'rgba(201, 164, 82, 0.11)',
    borderWidth: 1,
    borderColor: DARK.goldBorder,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 16,
  },
  studioBannerTitle: {
    fontFamily: FONTS.sans,
    color: DARK.goldBright,
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  studioBannerText: {
    fontFamily: FONTS.sans,
    color: DARK.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  loginCard: {
    backgroundColor: DARK.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: DARK.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 8,
  },
  modeSwitchTrack: {
    flexDirection: 'row',
    backgroundColor: DARK.inputBg,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: DARK.border,
    marginBottom: 18,
    gap: 6,
  },
  modeSwitchTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeSwitchTabActive: {
    backgroundColor: DARK.gold,
  },
  modeSwitchTabText: {
    fontFamily: FONTS.sans,
    color: DARK.textSecondary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  modeSwitchTabTextActive: {
    color: '#090D16',
  },
  fieldLabel: {
    fontFamily: FONTS.sans,
    color: DARK.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: DARK.inputBg,
    borderWidth: 1.2,
    borderColor: DARK.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  referralInputRow: {
    borderColor: DARK.goldBorder,
  },
  inputRowFocused: {
    borderColor: DARK.borderFocus,
    backgroundColor: '#10192B',
  },
  textInput: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: DARK.textPrimary,
    fontSize: 14.5,
    paddingVertical: 12,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: DARK.dangerBg,
    borderWidth: 1,
    borderColor: DARK.dangerBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: '#FCA5A5',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  primaryLoginBtn: {
    marginTop: 22,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: DARK.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryLoginBtnText: {
    fontFamily: FONTS.sans,
    color: '#090D16',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  referralBonusInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 14,
    backgroundColor: DARK.emeraldSoft,
    borderWidth: 1,
    borderColor: DARK.emeraldBorder,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  referralBonusInfoText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: '#D1FAE5',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  referralBonusBold: {
    color: DARK.emeraldText,
    fontWeight: '800',
  },
  switchHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 4,
  },
  switchHintText: {
    fontFamily: FONTS.sans,
    color: DARK.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  switchHintHighlight: {
    color: DARK.goldBright,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: DARK.border,
  },
  dividerText: {
    fontFamily: FONTS.sans,
    color: DARK.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  googleBtn: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: DARK.googleBtnBg,
    borderWidth: 1,
    borderColor: DARK.googleBtnBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleBtnText: {
    fontFamily: FONTS.sans,
    color: DARK.textPrimary,
    fontSize: 14.5,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 22,
  },
  footerText: {
    fontFamily: FONTS.sans,
    color: DARK.textMuted,
    fontSize: 11.5,
    fontWeight: '500',
  },
});
