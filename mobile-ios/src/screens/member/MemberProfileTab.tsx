import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  AtSign,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Flame,
  Hourglass,
  Layers,
  Phone,
  QrCode,
  Save,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react-native';
import {
  LegalDocumentsModal,
  LegalDocumentTab,
} from '@/components/LegalDocumentsModal';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AppUser,
  MemberDashboardData,
  MemberProfileUpdateRequest,
} from '@/types/fitness';
import { formatTurkishDateLabel, getDaysRemaining } from '@/utils/dateHelpers';
import { MemberAvatar } from '@/screens/member/MemberAvatar';

interface Props {
  data: MemberDashboardData;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenPackageRenew: () => void;
  onOpenQr?: () => void;
  onShowBanner: (type: 'success' | 'warning' | 'error', text: string) => void;
}

export function MemberProfileTab({
  data,
  refreshing,
  onRefresh,
  onOpenPackageRenew,
  onOpenQr,
  onShowBanner,
}: Props) {
  const { reloadUsers, triggerGlobalRefresh, deleteMyAccount, isAdmin, authUser } =
    useAuthDemo();
  const member = data.member;

  const [fullName, setFullName] = useState<string>(member.full_name || '');
  const [phone, setPhone] = useState<string>(member.phone || '');
  const [instagramHandle, setInstagramHandle] = useState<string>(
    member.instagram_handle || ''
  );

  const [notifyReminders, setNotifyReminders] = useState<boolean>(
    member.notify_reminders ?? true
  );
  const [notifyWaitlist, setNotifyWaitlist] = useState<boolean>(
    member.notify_waitlist ?? true
  );
  const [notifyCampaigns, setNotifyCampaigns] = useState<boolean>(
    member.notify_campaigns ?? false
  );

  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [savingSwitchKey, setSavingSwitchKey] = useState<string | null>(null);
  const [legalModalTab, setLegalModalTab] = useState<LegalDocumentTab | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState<boolean>(false);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(member.full_name || '');
    setPhone(member.phone || '');
    setInstagramHandle(member.instagram_handle || '');
    setNotifyReminders(member.notify_reminders ?? true);
    setNotifyWaitlist(member.notify_waitlist ?? true);
    setNotifyCampaigns(member.notify_campaigns ?? false);
  }, [
    member.id,
    member.full_name,
    member.phone,
    member.instagram_handle,
    member.notify_reminders,
    member.notify_waitlist,
    member.notify_campaigns,
  ]);

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      onShowBanner('error', 'Ad Soyad alanı boş bırakılamaz.');
      return;
    }
    if (!phone.trim()) {
      onShowBanner('error', 'Telefon numarası boş bırakılamaz.');
      return;
    }

    setSavingProfile(true);
    try {
      const payload: MemberProfileUpdateRequest = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        instagram_handle: instagramHandle.trim(),
      };
      const updated = await apiRequest<AppUser>(`/member/${member.id}/profile`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setInstagramHandle(updated.instagram_handle || '');
      await reloadUsers();
      triggerGlobalRefresh();
      onShowBanner('success', 'Profil ve iletişim bilgileriniz güncellendi.');
    } catch (err: any) {
      onShowBanner('error', err?.message || 'Profil bilgileri güncellenemedi.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleNotification = async (
    field: 'notify_reminders' | 'notify_waitlist' | 'notify_campaigns',
    nextValue: boolean
  ) => {
    const prevReminders = notifyReminders;
    const prevWaitlist = notifyWaitlist;
    const prevCampaigns = notifyCampaigns;

    if (field === 'notify_reminders') setNotifyReminders(nextValue);
    if (field === 'notify_waitlist') setNotifyWaitlist(nextValue);
    if (field === 'notify_campaigns') setNotifyCampaigns(nextValue);

    setSavingSwitchKey(field);
    try {
      await apiRequest<AppUser>(`/member/${member.id}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: nextValue }),
      });
      await reloadUsers();
      triggerGlobalRefresh();
    } catch (err: any) {
      setNotifyReminders(prevReminders);
      setNotifyWaitlist(prevWaitlist);
      setNotifyCampaigns(prevCampaigns);
      onShowBanner('error', err?.message || 'Bildirim tercihi kaydedilemedi.');
    } finally {
      setSavingSwitchKey(null);
    }
  };

  const isPreviewingAnotherUser =
    isAdmin || (authUser?.id != null && authUser.id !== member.id);

  const handleOpenDeleteModal = () => {
    if (isPreviewingAnotherUser) {
      const msg =
        'Yönetici önizleme modunda bu üyenin hesabı buradan silinemez. Hesap silme işlemi yalnızca kullanıcının kendi oturumu üzerinden yapılabilir.';
      onShowBanner('warning', msg);
      Alert.alert('Yönetici Önizleme Modu', msg);
      return;
    }
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const handleConfirmDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteMyAccount();
      setDeleteModalVisible(false);
    } catch (err: any) {
      const msg =
        err?.message ||
        'Hesabınız silinirken bir sorun oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.';
      setDeleteError(msg);
      onShowBanner('error', msg);
      Alert.alert('Hesap Silinemedi', msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const memberAccessCode = `FIT-${1000 + member.id}`;
  const allPackages = Array.isArray(data.all_packages)
    ? data.all_packages
    : data.active_package
    ? [data.active_package]
    : [];
  const activePkg = allPackages.find((p) => p.is_active) ?? data.active_package;
  const pastPackages = allPackages.filter((p) => !p.is_active);
  const activeDaysLeft = activePkg ? getDaysRemaining(activePkg.expiry_date) : 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* 1. ÜYE PROFİL & KİMLİK KARTI */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeaderRow}>
            <MemberAvatar
              uri={member.avatar_url}
              name={member.full_name}
              size={72}
              borderRadius={22}
              accentColor={COLORS.primary}
            />
            <View style={styles.profileHeaderCol}>
              <View style={styles.badgesInline}>
                <View style={styles.idPill}>
                  <Text style={styles.idPillText}>{memberAccessCode}</Text>
                </View>
                <View style={styles.streakPill}>
                  <Flame size={11} color={COLORS.warningText} />
                  <Text style={styles.streakPillText}>
                    {member.streak_days ?? 0} Haftalık Seri
                  </Text>
                </View>
              </View>
              <Text style={styles.profileName}>{member.full_name}</Text>
              <Text style={styles.profileHandle}>
                {member.instagram_handle || 'Instagram hesabı eklenmedi'}
              </Text>
            </View>
          </View>

          {onOpenQr && (
            <TouchableOpacity
              style={styles.qrQuickStrip}
              onPress={onOpenQr}
              activeOpacity={0.82}
            >
              <View style={styles.qrQuickLeft}>
                <QrCode size={17} color={COLORS.primary} />
                <Text style={styles.qrQuickText}>Turnike QR Giriş Kartımı Göster</Text>
              </View>
              <Text style={styles.qrQuickAction}>Aç</Text>
            </TouchableOpacity>
          )}

          {member.notes && member.notes.trim().length > 0 ? (
            <View style={styles.healthNoteBox}>
              <AlertTriangle size={15} color={COLORS.warningText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.healthNoteLabel}>EĞİTMEN SAĞLIK & HASSASİYET NOTU</Text>
                <Text style={styles.healthNoteText}>{member.notes}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* Düzenlenebilir İletişim Alanları */}
          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ad Soyad</Text>
              <View style={styles.inputBox}>
                <User size={15} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.textInput}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Ad Soyad"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Telefon Numarası</Text>
              <View style={styles.inputBox}>
                <Phone size={15} color={COLORS.primary} />
                <TextInput
                  style={styles.textInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0533 000 00 00"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Instagram Hesabı (DM Randevu Eşleşmesi İçin)
              </Text>
              <View style={styles.inputBox}>
                <AtSign size={15} color={COLORS.secondary} />
                <TextInput
                  style={styles.textInput}
                  value={instagramHandle}
                  onChangeText={setInstagramHandle}
                  placeholder="@kullaniciadi"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, savingProfile && { opacity: 0.65 }]}
              disabled={savingProfile}
              onPress={handleSaveProfile}
              activeOpacity={0.85}
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Save size={16} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>Bilgileri Güncelle</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. PAKET GEÇMİŞİM & KALAN HAKLARIM */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeaderLeft}>
              <Layers size={17} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Paket Geçmişim & Haklarım</Text>
            </View>
            <Text style={styles.packageCountLabel}>{allPackages.length} Paket</Text>
          </View>

          {activePkg ? (
            <View style={styles.activePkgBox}>
              <View style={styles.activePkgTop}>
                <View style={styles.activeBadge}>
                  <ShieldCheck size={12} color={COLORS.primary} />
                  <Text style={styles.activeBadgeText}>AKTİF PAKET</Text>
                </View>
                <Text style={styles.activeDaysText}>
                  {activeDaysLeft >= 0 ? `${activeDaysLeft} Gün Kaldı` : 'Süresi Doldu'}
                </Text>
              </View>

              <Text style={styles.activePkgTitle}>{activePkg.package_name}</Text>

              <View style={styles.pkgProgressMeta}>
                <Text style={styles.pkgCreditsHighlight}>
                  {activePkg.remaining_credits} / {activePkg.total_credits} Ders Kredisi
                </Text>
                <Text style={styles.pkgExpiryText}>
                  Bitiş: {formatTurkishDateLabel(activePkg.expiry_date).full}
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${
                        activePkg.total_credits > 0
                          ? Math.min(
                              100,
                              (activePkg.remaining_credits / activePkg.total_credits) * 100
                            )
                          : 0
                      }%`,
                      backgroundColor:
                        activePkg.remaining_credits <= 2
                          ? COLORS.warning
                          : COLORS.primary,
                    },
                  ]}
                />
              </View>
            </View>
          ) : (
            <View style={styles.emptyPkgBox}>
              <Text style={styles.emptyPkgText}>
                Şu anda tanımlı aktif bir üyelik paketiniz bulunmuyor.
              </Text>
            </View>
          )}

          {pastPackages.length > 0 && (
            <View style={styles.pastPackagesBlock}>
              <Text style={styles.pastPackagesHeading}>GEÇMİŞ / TAMAMLANAN PAKETLER</Text>
              {pastPackages.map((pkg) => (
                <View key={pkg.id} style={styles.pastPkgRow}>
                  <CheckCircle2 size={16} color={COLORS.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pastPkgName}>{pkg.package_name}</Text>
                    <View style={styles.pastPkgMeta}>
                      <Calendar size={11} color={COLORS.textSecondary} />
                      <Text style={styles.pastPkgSub}>
                        Tamamlandı • {pkg.total_credits} Ders • Bitiş {pkg.expiry_date}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.renewBtn}
            onPress={onOpenPackageRenew}
            activeOpacity={0.86}
          >
            <CreditCard size={16} color={COLORS.white} />
            <Text style={styles.renewBtnText}>Paket Yenileme Ekranına Git</Text>
          </TouchableOpacity>
        </View>

        {/* 3. BİLDİRİM AYARLARI */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeaderLeft}>
              <Bell size={17} color={COLORS.secondary} />
              <Text style={styles.sectionTitle}>Bildirim Tercihleri</Text>
            </View>
            {savingSwitchKey ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.autoSaveHint}>Otomatik Kayıt</Text>
            )}
          </View>

          <View style={styles.switchItemRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchTitle}>Ders Hatırlatıcıları</Text>
              <Text style={styles.switchDesc}>
                Kayıtlı dersleriniz başlamadan 2 saat önce hatırlatma bildirimi alın.
              </Text>
            </View>
            <Switch
              value={notifyReminders}
              onValueChange={(val) => handleToggleNotification('notify_reminders', val)}
              trackColor={{ false: '#D4C4AA', true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.switchDivider} />

          <View style={styles.switchItemRow}>
            <View style={styles.switchTextCol}>
              <View style={styles.switchTitleWithIcon}>
                <Text style={styles.switchTitle}>Yedek Liste Sıra Bildirimleri</Text>
                <Hourglass size={12} color={COLORS.warningText} />
              </View>
              <Text style={styles.switchDesc}>
                Beklediğiniz dolu derste yer açılıp kaydınız onaylandığında haberdar olun.
              </Text>
            </View>
            <Switch
              value={notifyWaitlist}
              onValueChange={(val) => handleToggleNotification('notify_waitlist', val)}
              trackColor={{ false: '#D4C4AA', true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.switchDivider} />

          <View style={styles.switchItemRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchTitle}>Kampanya & Kulüp Haberleri</Text>
              <Text style={styles.switchDesc}>
                Sezon avantajları, yeni açılan grup dersleri ve stüdyo etkinlikleri.
              </Text>
            </View>
            <Switch
              value={notifyCampaigns}
              onValueChange={(val) => handleToggleNotification('notify_campaigns', val)}
              trackColor={{ false: '#D4C4AA', true: COLORS.primary }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        {/* 4. YASAL BELGELER & GİZLİLİK (KVKK) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderLeft}>
            <ShieldCheck size={17} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Yasal Belgeler & Gizlilik</Text>
          </View>

          <TouchableOpacity
            style={styles.legalRowBtn}
            onPress={() => setLegalModalTab('privacy')}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Gizlilik Politikası (KVKK)"
          >
            <View style={styles.legalRowLeft}>
              <ShieldCheck size={16} color={COLORS.primary} />
              <Text style={styles.legalRowText}>Gizlilik Politikası (KVKK)</Text>
            </View>
            <ChevronRight size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.legalRowBtn}
            onPress={() => setLegalModalTab('terms')}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Kullanım Koşulları"
          >
            <View style={styles.legalRowLeft}>
              <FileText size={16} color={COLORS.secondary} />
              <Text style={styles.legalRowText}>Kullanım Koşulları</Text>
            </View>
            <ChevronRight size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 5. HESAP YÖNETİMİ & KALICI SİLME */}
        <View style={styles.dangerCard}>
          <View style={styles.sectionHeaderLeft}>
            <Trash2 size={17} color={COLORS.danger} />
            <Text style={styles.dangerTitle}>Hesap Yönetimi</Text>
          </View>
          <Text style={styles.dangerDesc}>
            Hesabınızı kalıcı olarak sildiğinizde tüm randevularınız, kalan ders
            kredileriniz, vücut ölçümleriniz, beslenme kayıtlarınız ve profil
            bilgileriniz geri alınamayacak şekilde silinir.
          </Text>

          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={handleOpenDeleteModal}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Hesabımı Kalıcı Olarak Sil"
          >
            <Trash2 size={16} color={COLORS.dangerText} />
            <Text style={styles.deleteAccountBtnText}>Hesabımı Kalıcı Olarak Sil</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <LegalDocumentsModal
        visible={legalModalTab !== null}
        initialTab={legalModalTab ?? 'privacy'}
        onClose={() => setLegalModalTab(null)}
      />

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingAccount) setDeleteModalVisible(false);
        }}
      >
        <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteModalIconWrap}>
              <AlertTriangle size={24} color={COLORS.danger} />
            </View>

            <Text style={styles.deleteModalTitle}>Hesabımı Kalıcı Olarak Sil</Text>
            <Text style={styles.deleteModalBody}>
              Bu işlem geri alınamaz. Onayladığınızda hesabınız kapatılacak ve
              aşağıdaki verileriniz kalıcı olarak silinecektir:
            </Text>

            <View style={styles.deleteBulletList}>
              <Text style={styles.deleteBulletItem}>
                • Tüm aktif ve geçmiş ders randevularınız
              </Text>
              <Text style={styles.deleteBulletItem}>
                • Üyelik paketleriniz ve kalan ders kredileriniz
              </Text>
              <Text style={styles.deleteBulletItem}>
                • Vücut ölçümleriniz, sakatlık notlarınız ve beslenme kayıtlarınız
              </Text>
              <Text style={styles.deleteBulletItem}>
                • Profil, iletişim ve erişim bilgileriniz
              </Text>
            </View>

            {deleteError ? (
              <View style={styles.deleteModalErrorBox}>
                <AlertTriangle size={14} color={COLORS.danger} />
                <Text style={styles.deleteModalErrorText}>{deleteError}</Text>
              </View>
            ) : null}

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                disabled={deletingAccount}
                onPress={() => setDeleteModalVisible(false)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Vazgeç"
              >
                <Text style={styles.deleteCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteConfirmBtn,
                  deletingAccount && { opacity: 0.7 },
                ]}
                disabled={deletingAccount}
                onPress={handleConfirmDeleteAccount}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Hesabı Kalıcı Olarak Silmeyi Onayla"
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.deleteConfirmBtnText}>Kalıcı Olarak Sil</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileHeaderCol: {
    flex: 1,
    gap: 4,
  },
  badgesInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  idPill: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  idPillText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  streakPillText: {
    color: COLORS.warningText,
    fontSize: 11,
    fontWeight: '800',
  },
  profileName: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  profileHandle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  qrQuickStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FCF7EA',
    borderWidth: 1,
    borderColor: '#E5CB90',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  qrQuickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrQuickText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  qrQuickAction: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  healthNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.warningBg,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#EDD092',
  },
  healthNoteLabel: {
    color: COLORS.warningText,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  healthNoteText: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  formSection: {
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  saveBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13.5,
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  packageCountLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  activePkgBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5CB90',
    gap: 8,
  },
  activePkgTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadgeText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  activeDaysText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  activePkgTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  pkgProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  pkgCreditsHighlight: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  pkgExpiryText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EAE0D0',
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  emptyPkgBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyPkgText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  pastPackagesBlock: {
    gap: 8,
  },
  pastPackagesHeading: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pastPkgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pastPkgName: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  pastPkgMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pastPkgSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  renewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    paddingVertical: 13.5,
  },
  renewBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  autoSaveHint: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
  },
  switchItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTextCol: {
    flex: 1,
    gap: 3,
  },
  switchTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  switchTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  switchDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  switchDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  legalRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  legalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  legalRowText: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  dangerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    gap: 12,
    ...CARD_SHADOW,
  },
  dangerTitle: {
    color: COLORS.dangerText,
    fontSize: 16,
    fontWeight: '800',
  },
  dangerDesc: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 14,
    paddingVertical: 13.5,
  },
  deleteAccountBtnText: {
    color: COLORS.dangerText,
    fontSize: 13.5,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    gap: 12,
    ...CARD_SHADOW,
  },
  deleteModalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  deleteModalTitle: {
    color: COLORS.textPrimary,
    fontSize: 17.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  deleteModalBody: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '500',
  },
  deleteBulletList: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  deleteBulletItem: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  deleteModalErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 12,
    padding: 10,
  },
  deleteModalErrorText: {
    flex: 1,
    color: COLORS.dangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  deleteCancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelBtnText: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  deleteConfirmBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
});
