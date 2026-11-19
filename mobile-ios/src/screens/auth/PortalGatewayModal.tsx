import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Hash,
  KeyRound,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  X,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { AppUser } from '@/types/fitness';
import {
  PortalAdminLoginResponse,
  PortalLookupResponse,
  PortalQuickChip,
  PortalUserLoginResponse,
} from '@/types/authAdmin';

export type GatewayTabKey = 'lookup' | 'login' | 'admin';

export interface PortalGatewayModalProps {
  visible?: boolean;
  asModal?: boolean;
  initialTab?: GatewayTabKey;
  onClose?: () => void;
  onSelectUser?: (user: AppUser) => void;
  onOpenAdmin?: () => void;
}

const THEME = {
  bg: '#090D16',
  card: '#131B2E',
  elevated: '#1E293B',
  border: 'rgba(255, 255, 255, 0.08)',
  emerald: '#10B981',
  emeraldSoft: 'rgba(16, 185, 129, 0.14)',
  volt: '#A3E635',
  indigo: '#6366F1',
  indigoSoft: 'rgba(99, 102, 241, 0.16)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.15)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
};

const FALLBACK_CHIPS: PortalQuickChip[] = [
  {
    access_code: 'FIT-1003',
    user_id: 3,
    full_name: 'Ahmet Yılmaz',
    short_label: 'FIT-1003 • Ahmet',
    role: 'member',
    remaining_credits: 7,
    total_credits: 10,
  },
  {
    access_code: 'FIT-1004',
    user_id: 4,
    full_name: 'Zeynep Kaya',
    short_label: 'FIT-1004 • Zeynep',
    role: 'member',
    remaining_credits: 2,
    total_credits: 12,
  },
  {
    access_code: 'FIT-1005',
    user_id: 5,
    full_name: 'Mert Demir',
    short_label: 'FIT-1005 • Mert',
    role: 'member',
    remaining_credits: 5,
    total_credits: 8,
  },
  {
    access_code: 'FIT-1006',
    user_id: 6,
    full_name: 'Elif Şahin',
    short_label: 'FIT-1006 • Elif',
    role: 'member',
    remaining_credits: 1,
    total_credits: 10,
  },
  {
    access_code: 'FIT-1001',
    user_id: 1,
    full_name: 'Burak Hoca',
    short_label: 'FIT-1001 • Burak Hoca',
    role: 'trainer',
    remaining_credits: 0,
    total_credits: 0,
  },
];

export function PortalGatewayModal({
  visible,
  asModal,
  initialTab = 'lookup',
  onClose,
  onSelectUser,
  onOpenAdmin,
}: PortalGatewayModalProps) {
  const [activeTab, setActiveTab] = useState<GatewayTabKey>(initialTab);

  // Hızlı Çipler
  const [quickChips, setQuickChips] = useState<PortalQuickChip[]>(FALLBACK_CHIPS);

  // Sekme 1: Şifresiz ID Sorgulama State
  const [lookupInput, setLookupInput] = useState<string>('FIT-1003');
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupData, setLookupData] = useState<PortalLookupResponse | null>(null);

  // Sekme 2: Üye / Eğitmen Girişi State
  const [loginIdentifier, setLoginIdentifier] = useState<string>('FIT-1003');
  const [loginPin, setLoginPin] = useState<string>('');
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<PortalUserLoginResponse | null>(null);

  // Sekme 3: Admin Girişi State
  const [adminUsername, setAdminUsername] = useState<string>('admin');
  const [adminPassword, setAdminPassword] = useState<string>('admin123');
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const loadChipsAndInitialLookup = useCallback(async () => {
    try {
      const chips = await apiRequest<PortalQuickChip[]>('/portal/public-chips');
      if (Array.isArray(chips) && chips.length > 0) {
        setQuickChips(chips);
        const firstMember = chips.find((c) => c.role === 'member') || chips[0];
        if (firstMember && !lookupData) {
          setLookupInput(firstMember.access_code);
          const res = await apiRequest<PortalLookupResponse>(
            `/portal/lookup/${encodeURIComponent(firstMember.access_code)}`
          );
          setLookupData(res);
        }
      }
    } catch {
      // Çevrimdışıysa varsayılan çipler görünmeye devam eder
    }
  }, [lookupData]);

  useEffect(() => {
    const isShown = visible === undefined ? true : visible;
    if (isShown) {
      loadChipsAndInitialLookup();
    }
  }, [visible, loadChipsAndInitialLookup]);

  const handleLookup = useCallback(async (overrideCode?: string) => {
    const targetCode = (overrideCode ?? lookupInput).trim();
    if (!targetCode) {
      setLookupError('Lütfen FIT-1003 gibi özel ID kodunuzu girin.');
      return;
    }
    if (overrideCode !== undefined) {
      setLookupInput(overrideCode);
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await apiRequest<PortalLookupResponse>(
        `/portal/lookup/${encodeURIComponent(targetCode)}`
      );
      setLookupData(res);
    } catch (err: any) {
      setLookupData(null);
      setLookupError(err?.message || 'ID sorgulaması sırasında bir hata oluştu.');
    } finally {
      setLookupLoading(false);
    }
  }, [lookupInput]);

  const handleSwitchToMemberScreen = useCallback(
    (userSummary: AppUser) => {
      onSelectUser?.({
        id: userSummary.id,
        full_name: userSummary.full_name,
        phone: userSummary.phone,
        role: userSummary.role,
        instagram_handle: userSummary.instagram_handle,
        notes: userSummary.notes,
      });
      onClose?.();
    },
    [onSelectUser, onClose]
  );

  const handleUserLogin = useCallback(
    async (overrideIdentifier?: string) => {
      const idVal = (overrideIdentifier ?? loginIdentifier).trim();
      if (!idVal) {
        setLoginError('Telefon numaranızı veya FIT-XXXX ID kodunuzu girin.');
        return;
      }
      if (overrideIdentifier !== undefined) {
        setLoginIdentifier(overrideIdentifier);
      }
      setLoginLoading(true);
      setLoginError(null);
      setLoginSuccess(null);
      try {
        const res = await apiRequest<PortalUserLoginResponse>('/portal/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            identifier: idVal,
            pin_code: loginPin.trim() ? loginPin.trim() : null,
          }),
        });
        setLoginSuccess(res);
        onSelectUser?.({
          id: res.user.id,
          full_name: res.user.full_name,
          phone: res.user.phone,
          role: res.user.role,
          instagram_handle: res.user.instagram_handle,
          notes: res.user.notes,
        });
        onClose?.();
      } catch (err: any) {
        setLoginError(err?.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.');
      } finally {
        setLoginLoading(false);
      }
    },
    [loginIdentifier, loginPin, onSelectUser, onClose]
  );

  const handleAdminLogin = useCallback(async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setAdminError('Yönetici kullanıcı adı ve şifresi zorunludur.');
      return;
    }
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await apiRequest<PortalAdminLoginResponse>('/portal/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword.trim(),
        }),
      });
      if (res.authenticated) {
        onClose?.();
        onOpenAdmin?.();
      }
    } catch (err: any) {
      setAdminError(err?.message || 'Admin kimlik doğrulaması başarısız oldu.');
    } finally {
      setAdminLoading(false);
    }
  }, [adminUsername, adminPassword, onClose, onOpenAdmin]);

  const creditRatio =
    lookupData && lookupData.total_credits > 0
      ? Math.min(1, Math.max(0, lookupData.remaining_credits / lookupData.total_credits))
      : 0;

  const isLowCredit = lookupData?.role === 'member' && lookupData.low_credit_warning;

  const renderLookupTab = () => (
    <View style={styles.tabSection}>
      {/* Sorgulama Kutusu Bento Kartı */}
      <View style={styles.bentoCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconCircleEmerald}>
            <Hash size={18} color={THEME.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>ID ile Şifresiz Ders & Kredi Sorgula</Text>
            <Text style={styles.cardSubtitle}>
              Size atanan özel FIT-XXXX kodunu girerek kalan dersinizi ve programınızı anında görün.
            </Text>
          </View>
        </View>

        <View style={styles.searchInputRow}>
          <TextInput
            value={lookupInput}
            onChangeText={setLookupInput}
            placeholder="Örn: FIT-1003 veya 1003"
            placeholderTextColor={THEME.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.codeInput}
            onSubmitEditing={() => handleLookup()}
          />
          <TouchableOpacity
            style={styles.lookupButton}
            onPress={() => handleLookup()}
            disabled={lookupLoading}
            activeOpacity={0.85}
          >
            {lookupLoading ? (
              <ActivityIndicator size="small" color="#04130D" />
            ) : (
              <>
                <Search size={17} color="#04130D" />
                <Text style={styles.lookupButtonText}>Sorgula</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Hızlı Test Çipleri */}
        <Text style={styles.chipsLabel}>HIZLI DEMO ID ÇİPLERİ (TEK DOKUNUŞ):</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {quickChips.map((chip) => {
            const selected =
              lookupInput.trim().toUpperCase() === chip.access_code.toUpperCase();
            const isTrainerChip = chip.role === 'trainer';
            return (
              <TouchableOpacity
                key={chip.access_code}
                style={[
                  styles.quickChip,
                  selected &&
                    (isTrainerChip ? styles.quickChipActiveIndigo : styles.quickChipActive),
                ]}
                onPress={() => handleLookup(chip.access_code)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.quickChipText,
                    selected && styles.quickChipTextActive,
                  ]}
                >
                  {chip.short_label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {lookupError ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={16} color={THEME.danger} />
            <Text style={styles.errorBannerText}>{lookupError}</Text>
          </View>
        ) : null}
      </View>

      {/* Bento Sonuç Ekranı */}
      {lookupData ? (
        <View style={styles.lookupResultsWrap}>
          {/* 1. Hero Üye & Kalan Kredi Bento Kartı */}
          <View
            style={[
              styles.heroCreditCard,
              isLowCredit && { borderColor: 'rgba(245, 158, 11, 0.4)' },
            ]}
          >
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.badgeRow}>
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeBadgeText}>{lookupData.access_code}</Text>
                  </View>
                  <View
                    style={[
                      styles.roleBadge,
                      lookupData.role === 'trainer'
                        ? { backgroundColor: THEME.indigoSoft }
                        : { backgroundColor: THEME.emeraldSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleBadgeText,
                        {
                          color:
                            lookupData.role === 'trainer' ? '#A5B4FC' : THEME.emerald,
                        },
                      ]}
                    >
                      {lookupData.role === 'trainer' ? 'EĞİTMEN' : 'AKTİF ÜYE'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.memberNameHero}>{lookupData.full_name}</Text>
                <Text style={styles.packageTitleText}>
                  {lookupData.package_name || 'Aktif Paket Bulunmuyor'}
                </Text>
                {lookupData.expiry_date ? (
                  <Text style={styles.expiryText}>
                    Son Geçerlilik: {lookupData.expiry_date} • Tel: {lookupData.phone_masked}
                  </Text>
                ) : (
                  <Text style={styles.expiryText}>İletişim: {lookupData.phone_masked}</Text>
                )}
              </View>

              {/* Sağ Büyük Atletik Kredi Sayacı */}
              <View
                style={[
                  styles.creditMetricBox,
                  isLowCredit
                    ? { borderColor: THEME.amber, backgroundColor: THEME.amberSoft }
                    : { borderColor: THEME.emerald, backgroundColor: THEME.emeraldSoft },
                ]}
              >
                <Text
                  style={[
                    styles.creditBigValue,
                    { color: isLowCredit ? THEME.amber : THEME.emerald },
                  ]}
                >
                  {lookupData.role === 'member'
                    ? `${lookupData.remaining_credits}/${lookupData.total_credits}`
                    : `${lookupData.upcoming_bookings.length}`}
                </Text>
                <Text style={styles.creditMetricSub}>
                  {lookupData.role === 'member' ? 'KALAN DERS' : 'AKTİF SEANS'}
                </Text>
              </View>
            </View>

            {lookupData.role === 'member' ? (
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(6, Math.round(creditRatio * 100))}%`,
                        backgroundColor: isLowCredit ? THEME.amber : THEME.emerald,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressMetaRow}>
                  <Text style={styles.progressMetaText}>
                    Kullanılabilir Hak: {lookupData.remaining_credits} Ders
                  </Text>
                  {isLowCredit ? (
                    <View style={styles.lowWarningPill}>
                      <AlertTriangle size={12} color={THEME.amber} />
                      <Text style={styles.lowWarningText}>Paketiniz Azalıyor</Text>
                    </View>
                  ) : (
                    <View style={styles.healthyPill}>
                      <CheckCircle2 size={12} color={THEME.emerald} />
                      <Text style={styles.healthyPillText}>Kredi Durumu Uygun</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : null}

            {/* Üye / Eğitmen Ekranına Geç Aksiyonu */}
            {onSelectUser ? (
              <TouchableOpacity
                style={[
                  styles.switchProfileBtn,
                  lookupData.role === 'trainer' && { backgroundColor: THEME.indigo },
                ]}
                onPress={() => handleSwitchToMemberScreen(lookupData.user)}
                activeOpacity={0.88}
              >
                <Text
                  style={[
                    styles.switchProfileBtnText,
                    lookupData.role === 'trainer' && { color: '#FFFFFF' },
                  ]}
                >
                  {lookupData.role === 'trainer'
                    ? 'Eğitmen Ekranına Geç'
                    : 'Üye Ekranına Geç'}
                </Text>
                <ArrowRight
                  size={18}
                  color={lookupData.role === 'trainer' ? '#FFFFFF' : '#04130D'}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* 2. Yaklaşan Dersler Bento Kartı */}
          <View style={styles.bentoCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color={THEME.emerald} />
                <Text style={styles.sectionTitle}>Yaklaşan Ders Programı</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {lookupData.upcoming_bookings.length} Ders
                </Text>
              </View>
            </View>

            {lookupData.upcoming_bookings.length === 0 ? (
              <View style={styles.emptyLessonsBox}>
                <Dumbbell size={22} color={THEME.textMuted} />
                <Text style={styles.emptyLessonsText}>
                  Şu an planlanmış aktif bir ders randevusu bulunmuyor.
                </Text>
              </View>
            ) : (
              lookupData.upcoming_bookings.map((item) => (
                <View key={`up-${item.booking_id}-${item.session_id}`} style={styles.lessonItemCard}>
                  <View style={styles.lessonAccentBar} />
                  <View style={styles.lessonBody}>
                    <View style={styles.lessonTopRow}>
                      <View style={styles.timePill}>
                        <Clock size={13} color={THEME.volt} />
                        <Text style={styles.lessonTimeText}>
                          {item.start_time} - {item.end_time}
                        </Text>
                      </View>
                      <Text style={styles.lessonDayLabel}>{item.day_label}</Text>
                    </View>

                    <Text style={styles.lessonTitleText}>{item.title}</Text>

                    <View style={styles.lessonBottomRow}>
                      <View style={styles.trainerTag}>
                        <User size={12} color="#A5B4FC" />
                        <Text style={styles.trainerTagText}>{item.trainer_name}</Text>
                      </View>

                      <View style={styles.statusBookedTag}>
                        <CheckCircle2 size={12} color={THEME.emerald} />
                        <Text style={styles.statusBookedText}>
                          {lookupData.role === 'trainer'
                            ? `${item.current_enrolled}/${item.capacity} Kayıtlı`
                            : 'Kayıtlı'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* 3. Tamamlanan / Geçmiş Dersler (Varsa) */}
          {lookupData.past_bookings.length > 0 ? (
            <View style={styles.bentoCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Geçmiş & Yoklaması İşlenen Dersler</Text>
                <Text style={styles.pastCountSub}>
                  {lookupData.past_bookings.length} Kayıt
                </Text>
              </View>
              {lookupData.past_bookings.map((item) => {
                const isAttended = item.status === 'attended';
                return (
                  <View
                    key={`past-${item.booking_id}-${item.session_id}`}
                    style={styles.pastLessonRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pastLessonTitle}>{item.title}</Text>
                      <Text style={styles.pastLessonMeta}>
                        {item.date} • {item.start_time} • {item.trainer_name}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.pastStatusPill,
                        {
                          backgroundColor: isAttended
                            ? THEME.emeraldSoft
                            : THEME.dangerSoft,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: isAttended ? THEME.emerald : THEME.danger,
                          fontSize: 11.5,
                          fontWeight: '700',
                        }}
                      >
                        {isAttended ? 'Katıldı' : 'Katılmadı'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderUserLoginTab = () => (
    <View style={styles.tabSection}>
      <View style={styles.bentoCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconCircleEmerald}>
            <UserCheck size={18} color={THEME.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Üye & Eğitmen Girişi</Text>
            <Text style={styles.cardSubtitle}>
              FIT-XXXX kodunuz, telefon numaranız veya @kullanıcı adınız ile oturum açın.
            </Text>
          </View>
        </View>

        <Text style={styles.inputLabel}>TELEFON VEYA ÖZEL ID (FIT-XXXX)</Text>
        <TextInput
          value={loginIdentifier}
          onChangeText={setLoginIdentifier}
          placeholder="FIT-1003 veya 0533 210 34 11"
          placeholderTextColor={THEME.textMuted}
          autoCapitalize="none"
          style={styles.fullInput}
        />

        <Text style={[styles.inputLabel, { marginTop: 12 }]}>
          PIN KODU (OPSİYONEL • VARSAYILAN 1234)
        </Text>
        <TextInput
          value={loginPin}
          onChangeText={setLoginPin}
          placeholder="Boş bırakılabilir veya 1234"
          placeholderTextColor={THEME.textMuted}
          secureTextEntry
          keyboardType="number-pad"
          style={styles.fullInput}
        />

        {loginError ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={16} color={THEME.danger} />
            <Text style={styles.errorBannerText}>{loginError}</Text>
          </View>
        ) : null}

        {loginSuccess ? (
          <View style={styles.successBanner}>
            <CheckCircle2 size={16} color={THEME.emerald} />
            <Text style={styles.successBannerText}>
              {loginSuccess.message} ({loginSuccess.access_code})
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryActionBtn}
          onPress={() => handleUserLogin()}
          disabled={loginLoading}
          activeOpacity={0.85}
        >
          {loginLoading ? (
            <ActivityIndicator size="small" color="#04130D" />
          ) : (
            <>
              <KeyRound size={17} color="#04130D" />
              <Text style={styles.primaryActionBtnText}>Hesabıma Giriş Yap</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Hızlı Demo Hesap Seçici */}
      <View style={styles.bentoCard}>
        <Text style={styles.sectionTitle}>Tek Dokunuşla Demo Hesap Girişi</Text>
        <Text style={[styles.cardSubtitle, { marginTop: 4, marginBottom: 12 }]}>
          Test etmek istediğiniz üye veya eğitmen profiline doğrudan geçiş yapın:
        </Text>

        {quickChips.map((item) => {
          const isTrainer = item.role === 'trainer';
          return (
            <TouchableOpacity
              key={`login-quick-${item.access_code}`}
              style={styles.demoAccountRow}
              onPress={() => handleUserLogin(item.access_code)}
              activeOpacity={0.82}
            >
              <View
                style={[
                  styles.demoAvatar,
                  {
                    backgroundColor: isTrainer ? THEME.indigoSoft : THEME.emeraldSoft,
                  },
                ]}
              >
                <Text
                  style={{
                    color: isTrainer ? '#A5B4FC' : THEME.emerald,
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {item.full_name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.demoAccountName}>{item.full_name}</Text>
                <Text style={styles.demoAccountMeta}>
                  {item.access_code} •{' '}
                  {isTrainer
                    ? 'Eğitmen Yoklama & Program'
                    : `Üye (${item.remaining_credits}/${item.total_credits} Ders)`}
                </Text>
              </View>
              <ArrowRight size={17} color={THEME.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderAdminLoginTab = () => (
    <View style={styles.tabSection}>
      <View style={[styles.bentoCard, { borderColor: 'rgba(99, 102, 241, 0.35)' }]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconCircleIndigo}>
            <ShieldCheck size={19} color="#A5B4FC" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Stüdyo Admin & Veri Merkezi Girişi</Text>
            <Text style={styles.cardSubtitle}>
              Üye ID atama, Instagram/WhatsApp veri çekme ve birim yönlendirme konsolu.
            </Text>
          </View>
        </View>

        <Text style={styles.inputLabel}>YÖNETİCİ KULLANICI ADI</Text>
        <TextInput
          value={adminUsername}
          onChangeText={setAdminUsername}
          placeholder="admin"
          placeholderTextColor={THEME.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.fullInput}
        />

        <Text style={[styles.inputLabel, { marginTop: 12 }]}>YÖNETİCİ ŞİFRESİ</Text>
        <TextInput
          value={adminPassword}
          onChangeText={setAdminPassword}
          placeholder="••••••••"
          placeholderTextColor={THEME.textMuted}
          secureTextEntry
          style={styles.fullInput}
          onSubmitEditing={handleAdminLogin}
        />

        <TouchableOpacity
          style={styles.fillDemoAdminBtn}
          onPress={() => {
            setAdminUsername('admin');
            setAdminPassword('admin123');
            setAdminError(null);
          }}
          activeOpacity={0.8}
        >
          <Sparkles size={14} color="#A5B4FC" />
          <Text style={styles.fillDemoAdminText}>
            Prototip Admin Bilgilerini Doldur (admin / admin123)
          </Text>
        </TouchableOpacity>

        {adminError ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={16} color={THEME.danger} />
            <Text style={styles.errorBannerText}>{adminError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.adminSubmitBtn}
          onPress={handleAdminLogin}
          disabled={adminLoading}
          activeOpacity={0.88}
        >
          {adminLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Lock size={16} color="#FFFFFF" />
              <Text style={styles.adminSubmitBtnText}>Admin Yönetim Merkezini Aç</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const gatewayBody = (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Üst Başlık */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <View style={styles.brandBadge}>
              <Sparkles size={12} color={THEME.volt} />
              <Text style={styles.brandBadgeText}>ATHLETIC PORTAL • AKILLI ERİŞİM</Text>
            </View>
            <Text style={styles.headerTitle}>Üye Sorgulama & Giriş Kapısı</Text>
          </View>

          {onClose ? (
            <TouchableOpacity
              style={styles.closeIconBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <X size={20} color={THEME.textPrimary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 3 Sekmeli Geçiş Çubuğu */}
        <View style={styles.segmentedBar}>
          <TouchableOpacity
            style={[
              styles.segmentItem,
              activeTab === 'lookup' && styles.segmentItemActiveEmerald,
            ]}
            onPress={() => setActiveTab('lookup')}
            activeOpacity={0.85}
          >
            <Search
              size={14}
              color={activeTab === 'lookup' ? '#04130D' : THEME.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'lookup' && styles.segmentTextActiveDark,
              ]}
            >
              ID Sorgula
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentItem,
              activeTab === 'login' && styles.segmentItemActiveEmerald,
            ]}
            onPress={() => setActiveTab('login')}
            activeOpacity={0.85}
          >
            <UserCheck
              size={14}
              color={activeTab === 'login' ? '#04130D' : THEME.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'login' && styles.segmentTextActiveDark,
              ]}
            >
              Üye / Eğitmen
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentItem,
              activeTab === 'admin' && styles.segmentItemActiveIndigo,
            ]}
            onPress={() => setActiveTab('admin')}
            activeOpacity={0.85}
          >
            <ShieldCheck
              size={14}
              color={activeTab === 'admin' ? '#FFFFFF' : THEME.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'admin' && styles.segmentTextActiveLight,
              ]}
            >
              Admin
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'lookup' && renderLookupTab()}
          {activeTab === 'login' && renderUserLoginTab()}
          {activeTab === 'admin' && renderAdminLoginTab()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  const shouldUseModal = asModal ?? typeof visible === 'boolean';

  if (shouldUseModal) {
    return (
      <Modal
        visible={Boolean(visible)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        {gatewayBody}
      </Modal>
    );
  }

  if (visible === false) {
    return null;
  }

  return gatewayBody;
}

export default PortalGatewayModal;

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 12,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(163, 230, 53, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 5,
  },
  brandBadgeText: {
    color: THEME.volt,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: THEME.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedBar: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginBottom: 12,
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  segmentItemActiveEmerald: {
    backgroundColor: THEME.emerald,
  },
  segmentItemActiveIndigo: {
    backgroundColor: THEME.indigo,
  },
  segmentText: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  segmentTextActiveDark: {
    color: '#04130D',
    fontWeight: '800',
  },
  segmentTextActiveLight: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 36,
  },
  tabSection: {
    gap: 14,
  },
  bentoCard: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconCircleEmerald: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.emeraldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleIndigo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.indigoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    color: THEME.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  searchInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    backgroundColor: THEME.elevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  lookupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.emerald,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
  },
  lookupButtonText: {
    color: '#04130D',
    fontSize: 14,
    fontWeight: '800',
  },
  chipsLabel: {
    color: THEME.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  quickChip: {
    backgroundColor: THEME.elevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  quickChipActive: {
    backgroundColor: THEME.emeraldSoft,
    borderColor: THEME.emerald,
  },
  quickChipActiveIndigo: {
    backgroundColor: THEME.indigoSoft,
    borderColor: THEME.indigo,
  },
  quickChipText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  quickChipTextActive: {
    color: THEME.textPrimary,
    fontWeight: '800',
  },
  lookupResultsWrap: {
    gap: 14,
  },
  heroCreditCard: {
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  codeBadge: {
    backgroundColor: THEME.elevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  codeBadgeText: {
    color: THEME.volt,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberNameHero: {
    color: THEME.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  packageTitleText: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  expiryText: {
    color: THEME.textMuted,
    fontSize: 11.5,
    marginTop: 4,
  },
  creditMetricBox: {
    minWidth: 94,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditBigValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  creditMetricSub: {
    color: THEME.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  progressSection: {
    marginTop: 16,
  },
  progressTrack: {
    height: 8,
    backgroundColor: THEME.elevated,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressMetaText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  lowWarningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.amberSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  lowWarningText: {
    color: THEME.amber,
    fontSize: 11,
    fontWeight: '800',
  },
  healthyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.emeraldSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  healthyPillText: {
    color: THEME.emerald,
    fontSize: 11,
    fontWeight: '800',
  },
  switchProfileBtn: {
    marginTop: 16,
    backgroundColor: THEME.emerald,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  switchProfileBtnText: {
    color: '#04130D',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: THEME.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: THEME.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countBadgeText: {
    color: THEME.emerald,
    fontSize: 11.5,
    fontWeight: '800',
  },
  emptyLessonsBox: {
    backgroundColor: THEME.elevated,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyLessonsText: {
    color: THEME.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  lessonItemCard: {
    flexDirection: 'row',
    backgroundColor: THEME.elevated,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  lessonAccentBar: {
    width: 5,
    backgroundColor: THEME.emerald,
  },
  lessonBody: {
    flex: 1,
    padding: 13,
  },
  lessonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(163, 230, 53, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lessonTimeText: {
    color: THEME.volt,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  lessonDayLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  lessonTitleText: {
    color: THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  lessonBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trainerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.indigoSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  trainerTagText: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBookedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBookedText: {
    color: THEME.emerald,
    fontSize: 12,
    fontWeight: '800',
  },
  pastCountSub: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  pastLessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  pastLessonTitle: {
    color: THEME.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  pastLessonMeta: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pastStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9,
  },
  inputLabel: {
    color: THEME.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  fullInput: {
    backgroundColor: THEME.elevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: THEME.textPrimary,
    fontSize: 14.5,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  errorBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.dangerSoft,
    padding: 11,
    borderRadius: 12,
  },
  errorBannerText: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 12.5,
    fontWeight: '600',
  },
  successBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.emeraldSoft,
    padding: 11,
    borderRadius: 12,
  },
  successBannerText: {
    flex: 1,
    color: THEME.emerald,
    fontSize: 12.5,
    fontWeight: '700',
  },
  primaryActionBtn: {
    marginTop: 16,
    backgroundColor: THEME.emerald,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionBtnText: {
    color: '#04130D',
    fontSize: 14.5,
    fontWeight: '800',
  },
  demoAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: THEME.elevated,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  demoAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoAccountName: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  demoAccountMeta: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  fillDemoAdminBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: THEME.indigoSoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  fillDemoAdminText: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  adminSubmitBtn: {
    marginTop: 16,
    backgroundColor: THEME.indigo,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  adminSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
});
