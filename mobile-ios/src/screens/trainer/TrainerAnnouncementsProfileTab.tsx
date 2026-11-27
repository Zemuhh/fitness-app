import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Award,
  BookOpenCheck,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  FileText,
  MapPin,
  Megaphone,
  Percent,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react-native';
import {
  LegalDocumentsModal,
  LegalDocumentTab,
} from '@/components/LegalDocumentsModal';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AnnouncementItem,
  AppUser,
  ClubHomeData,
  TrainerDetail,
  TrainerScheduleData,
} from '@/types/fitness';
import {
  MemberAvatar,
  getAnnouncementVisuals,
  getCategoryVisuals,
} from '@/screens/member/MemberAvatar';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';

type ViewMode = 'all' | 'announcements' | 'profile';

const NEWS_CATEGORIES = [
  'Tümü',
  'Kulüp Haberleri',
  'Kurallar & Bilgilendirme',
  'Kampanyalar',
] as const;

type NewsCategoryFilter = (typeof NEWS_CATEGORIES)[number];

function matchesNewsCategory(tag: string, selected: NewsCategoryFilter): boolean {
  if (selected === 'Tümü') return true;
  const lower = (tag || '').toLocaleLowerCase('tr-TR');
  if (selected === 'Kulüp Haberleri') {
    return lower.includes('haber') || lower.includes('yeni');
  }
  if (selected === 'Kurallar & Bilgilendirme') {
    return (
      lower.includes('kural') ||
      lower.includes('bilgi') ||
      lower.includes('bakım') ||
      lower.includes('bakim')
    );
  }
  if (selected === 'Kampanyalar') {
    return lower.includes('kampanya');
  }
  return true;
}

export interface TrainerAnnouncementsProfileProps {
  trainer: AppUser;
  schedule: TrainerScheduleData | null;
  onGoToCreateSession: () => void;
  onViewDateInSchedule: (dateIso: string) => void;
  onShowBanner?: (type: 'success' | 'error', text: string) => void;
}

export function TrainerAnnouncementsProfileTab({
  trainer,
  schedule,
  onGoToCreateSession,
  onViewDateInSchedule,
  onShowBanner,
}: TrainerAnnouncementsProfileProps) {
  const { refreshSignal, deleteMyAccount, isAdmin, authUser } = useAuthDemo();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedNewsCat, setSelectedNewsCat] = useState<NewsCategoryFilter>('Tümü');

  const [detail, setDetail] = useState<TrainerDetail | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [legalModalTab, setLegalModalTab] = useState<LegalDocumentTab | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState<boolean>(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState<boolean>(false);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchAll = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const [trainerRes, announcementsRes] = await Promise.allSettled([
          apiRequest<TrainerDetail>(`/trainers/${trainer.id}`),
          apiRequest<AnnouncementItem[]>('/announcements'),
        ]);

        let trainerFailed = false;
        if (trainerRes.status === 'fulfilled') {
          setDetail(trainerRes.value);
        } else {
          trainerFailed = true;
        }

        if (announcementsRes.status === 'fulfilled') {
          setAnnouncements(
            Array.isArray(announcementsRes.value) ? announcementsRes.value : []
          );
        } else {
          try {
            const fallbackHome = await apiRequest<ClubHomeData>('/club/home/4');
            setAnnouncements(
              Array.isArray(fallbackHome?.announcements)
                ? fallbackHome.announcements
                : []
            );
          } catch (innerErr: any) {
            const errMsg =
              innerErr?.message ||
              'Kulüp duyuruları ve profil verileri yüklenemedi. Lütfen tekrar deneyin.';
            if (trainerFailed) {
              setLoadError(errMsg);
            }
            onShowBanner?.('error', errMsg);
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [trainer.id, onShowBanner]
  );

  useEffect(() => {
    fetchAll(Boolean(detail && detail.id === trainer.id));
  }, [fetchAll, refreshSignal, trainer.id]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll(true);
  }, [fetchAll]);

  const handleSelectViewMode = (mode: ViewMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewMode(mode);
  };

  const handleSelectNewsCategory = (cat: NewsCategoryFilter) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedNewsCat(cat);
  };

  const openSessions = useMemo(
    () => (Array.isArray(detail?.open_sessions) ? detail.open_sessions : []),
    [detail?.open_sessions]
  );

  const safeAnnouncements = useMemo(
    () => (Array.isArray(announcements) ? announcements : []),
    [announcements]
  );

  const computedFillRate = useMemo(() => {
    if (schedule && schedule.average_fill_rate_pct > 0) {
      return schedule.average_fill_rate_pct;
    }
    if (openSessions.length > 0) {
      const cap = openSessions.reduce((a, s) => a + s.capacity, 0);
      const enr = openSessions.reduce((a, s) => a + s.current_enrolled, 0);
      return cap > 0 ? Math.round((enr / cap) * 1000) / 10 : 0;
    }
    return 0;
  }, [schedule, openSessions]);

  const filteredAnnouncements = useMemo(() => {
    return safeAnnouncements.filter((item) =>
      matchesNewsCategory(item.tag, selectedNewsCat)
    );
  }, [safeAnnouncements, selectedNewsCat]);

  const isPreviewingAnotherUser =
    isAdmin || (authUser?.id != null && authUser.id !== trainer.id);

  const handleOpenDeleteModal = () => {
    if (isPreviewingAnotherUser) {
      const msg =
        'Yönetici önizleme modunda bu eğitmenin hesabı buradan silinemez. Hesap silme işlemi yalnızca kullanıcının kendi oturumu üzerinden yapılabilir.';
      onShowBanner?.('error', msg);
      Alert.alert('Yönetici Önizleme Modu', msg);
      return;
    }
    setDeleteError(null);
    setDeleteConfirmed(false);
    setDeleteModalVisible(true);
  };

  const handleCloseDeleteModal = () => {
    if (deletingAccount) return;
    setDeleteConfirmed(false);
    setDeleteModalVisible(false);
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deleteConfirmed) return;
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteMyAccount();
      setDeleteConfirmed(false);
      setDeleteModalVisible(false);
    } catch (err: any) {
      const msg =
        err?.message ||
        'Hesabınız silinirken bir sorun oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.';
      setDeleteError(msg);
      onShowBanner?.('error', msg);
      Alert.alert('Hesap Silinemedi', msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const displayRating = detail?.rating ?? trainer.rating ?? 4.9;
  const displayExp = detail?.experience_years ?? trainer.experience_years ?? 5;
  const displaySpecialty =
    detail?.specialty || trainer.specialty || 'Atletik Performans & PT Koçu';
  const displayBio =
    detail?.bio ||
    trainer.bio ||
    trainer.notes ||
    'Fonksiyonel kuvvet, postür analizi ve sürdürülebilir kondisyon gelişimi üzerine bireysel ve grup antrenmanları yürütmektedir.';
  const displayCerts = Array.isArray(detail?.certificates) && detail.certificates.length > 0
    ? detail.certificates
    : Array.isArray(trainer.certificates)
    ? trainer.certificates
    : [];

  const showProfileSections = viewMode === 'all' || viewMode === 'profile';
  const showAnnouncementSections = viewMode === 'all' || viewMode === 'announcements';

  if (loading && !detail && announcements.length === 0) {
    return (
      <View style={styles.loaderCenter}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loaderText}>
          Kulüp duyuruları ve eğitmen profiliniz yükleniyor...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.secondary}
          />
        }
      >
        {/* Üst Görünüm Seçici Çipleri */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modePillsRow}
        >
          <TouchableOpacity
            style={[
              styles.modePill,
              viewMode === 'all' && styles.modePillActiveIndigo,
            ]}
            onPress={() => handleSelectViewMode('all')}
            activeOpacity={0.85}
          >
            <Sparkles
              size={13}
              color={viewMode === 'all' ? COLORS.white : COLORS.secondary}
            />
            <Text
              style={[
                styles.modePillText,
                viewMode === 'all' && styles.modePillTextActive,
              ]}
            >
              Tümü (Özet)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modePill,
              viewMode === 'announcements' && styles.modePillActiveTeal,
            ]}
            onPress={() => handleSelectViewMode('announcements')}
            activeOpacity={0.85}
          >
            <Megaphone
              size={13}
              color={viewMode === 'announcements' ? COLORS.white : COLORS.primary}
            />
            <Text
              style={[
                styles.modePillText,
                viewMode === 'announcements' && styles.modePillTextActive,
              ]}
            >
              Kulüp Duyuruları ({safeAnnouncements.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modePill,
              viewMode === 'profile' && styles.modePillActiveIndigo,
            ]}
            onPress={() => handleSelectViewMode('profile')}
            activeOpacity={0.85}
          >
            <Award
              size={13}
              color={viewMode === 'profile' ? COLORS.white : COLORS.secondary}
            />
            <Text
              style={[
                styles.modePillText,
                viewMode === 'profile' && styles.modePillTextActive,
              ]}
            >
              Profilim & İstatistikler
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {loadError ? (
          <View style={styles.errorRetryCard}>
            <AlertTriangle size={16} color={COLORS.danger} />
            <Text style={styles.errorRetryText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchAll(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Tekrar Dene"
            >
              <RefreshCw size={13} color={COLORS.white} />
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 1. EĞİTMEN KİMLİK & HAKKIMDA KARTI */}
        {showProfileSections && (
          <View style={styles.card}>
            <View style={styles.heroTopRow}>
              <MemberAvatar
                uri={detail?.avatar_url ?? trainer.avatar_url}
                name={detail?.full_name ?? trainer.full_name}
                size={72}
                borderRadius={22}
                accentColor={COLORS.secondary}
              />

              <View style={styles.heroIdentityCol}>
                <View style={styles.verifiedCoachPill}>
                  <ShieldCheck size={12} color={COLORS.primary} />
                  <Text style={styles.verifiedCoachText}>BAŞ EĞİTMEN PROFİLİ</Text>
                </View>

                <Text style={styles.heroNameText}>
                  {detail?.full_name ?? trainer.full_name}
                </Text>
                <Text style={styles.heroSpecialtyText}>{displaySpecialty}</Text>

                <View style={styles.heroContactRow}>
                  <Phone size={11} color={COLORS.textMuted} />
                  <Text style={styles.heroContactText}>
                    {detail?.phone ?? trainer.phone}
                    {detail?.instagram_handle || trainer.instagram_handle
                      ? ` • ${detail?.instagram_handle || trainer.instagram_handle}`
                      : ''}
                  </Text>
                </View>
              </View>
            </View>

            {/* Puan & Deneyim Rozet Şeridi */}
            <View style={styles.heroBadgesRow}>
              <View style={styles.ratingHighlightBox}>
                <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={styles.ratingHighlightText}>
                  {displayRating.toFixed(1)} Puan
                </Text>
              </View>

              <View style={styles.expHighlightBox}>
                <Award size={14} color={COLORS.secondary} />
                <Text style={styles.expHighlightText}>{displayExp} Yıl Deneyim</Text>
              </View>

              <View style={styles.activeClassesHighlightBox}>
                <Dumbbell size={13} color={COLORS.primary} />
                <Text style={styles.activeClassesHighlightText}>
                  {detail?.active_sessions_count ?? schedule?.sessions?.length ?? 0} Açık Seans
                </Text>
              </View>
            </View>

            <View style={styles.bioInnerBox}>
              <Text style={styles.bioLabel}>Hakkımda & Antrenman Yaklaşımı</Text>
              <Text style={styles.bioBodyText}>{displayBio}</Text>
            </View>
          </View>
        )}

        {/* 2. AYLIK PERFORMANS & DERS İSTATİSTİKLERİ KARTI */}
        {showProfileSections && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardHeading}>Aylık Ders & Katılım İstatistiklerim</Text>
                <Text style={styles.cardSubText}>Son 30 günlük canlı stüdyo verisi</Text>
              </View>
            </View>

            <View style={styles.bentoGrid2x2}>
              <View style={styles.statBentoTile}>
                <View style={[styles.tileIconBox, { backgroundColor: COLORS.secondaryLight }]}>
                  <Dumbbell size={16} color={COLORS.secondary} />
                </View>
                <Text style={styles.tileBigNumber}>
                  {detail?.monthly_classes_given ?? schedule?.monthly_sessions_count ?? 0}
                </Text>
                <Text style={styles.tileLabel}>Aylık Ders</Text>
              </View>

              <View style={styles.statBentoTile}>
                <View style={[styles.tileIconBox, { backgroundColor: COLORS.primaryLight }]}>
                  <Users size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.tileBigNumber}>
                  {detail?.total_students_count ?? schedule?.monthly_attendees_count ?? 0}
                </Text>
                <Text style={styles.tileLabel}>Aktif Öğrenci</Text>
              </View>

              <View style={styles.statBentoTile}>
                <View style={[styles.tileIconBox, { backgroundColor: COLORS.primaryLight }]}>
                  <UserCheck size={16} color={COLORS.primary} />
                </View>
                <Text style={[styles.tileBigNumber, { color: COLORS.primary }]}>
                  %{detail?.attendance_rate_pct ?? 97.5}
                </Text>
                <Text style={styles.tileLabel}>Katılım Oranı</Text>
              </View>

              <View style={styles.statBentoTile}>
                <View style={[styles.tileIconBox, { backgroundColor: COLORS.warningBg }]}>
                  <Percent size={16} color={COLORS.warningText} />
                </View>
                <Text style={[styles.tileBigNumber, { color: COLORS.warningText }]}>
                  %{computedFillRate}
                </Text>
                <Text style={styles.tileLabel}>Ortalama Doluluk</Text>
              </View>
            </View>
          </View>
        )}

        {/* 3. KULÜP DUYURULARI & STÜDYO REHBERİ BÖLÜMÜ */}
        {showAnnouncementSections && (
          <>
            <View style={styles.sectionBlockHeader}>
              <View style={styles.sectionBlockLeft}>
                <View style={styles.sectionBlockIcon}>
                  <Megaphone size={15} color={COLORS.primary} />
                </View>
                <View>
                  <Text style={styles.sectionBlockTitle}>
                    Kulüp Duyuruları & Bilgilendirmeler
                  </Text>
                  <Text style={styles.sectionBlockSub}>
                    Stüdyo kuralları, kampanyalar ve güncel duyuru akışı
                  </Text>
                </View>
              </View>
            </View>

            {/* Duyuru Kategori Filtre Çipleri */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.newsCatRow}
            >
              {NEWS_CATEGORIES.map((cat) => {
                const active = selectedNewsCat === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.newsCatChip, active && styles.newsCatChipActive]}
                    onPress={() => handleSelectNewsCategory(cat)}
                    activeOpacity={0.84}
                  >
                    <Text
                      style={[
                        styles.newsCatChipText,
                        active && styles.newsCatChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Çalışma Saatleri & İptal Kuralı Rehber Kartı */}
            {(selectedNewsCat === 'Tümü' ||
              selectedNewsCat === 'Kurallar & Bilgilendirme') && (
              <View style={styles.card}>
                <View style={styles.quickGuideHeader}>
                  <View style={styles.quickGuideIconBox}>
                    <Clock size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardHeading}>
                      Stüdyo Çalışma Saatleri & Eğitmen Rehberi
                    </Text>
                    <Text style={styles.cardSubText}>
                      Temiz spor ayakkabı ve kişisel havlu kuralı tüm stüdyolarda geçerlidir
                    </Text>
                  </View>
                </View>

                <View style={styles.hoursRow}>
                  <View style={styles.hourPill}>
                    <Text style={styles.hourLabel}>Hafta İçi</Text>
                    <Text style={styles.hourValue}>07:00 - 22:30</Text>
                  </View>
                  <View style={styles.hourPill}>
                    <Text style={styles.hourLabel}>Hafta Sonu</Text>
                    <Text style={styles.hourValue}>08:30 - 20:00</Text>
                  </View>
                </View>

                <View style={styles.ruleAlertBox}>
                  <ShieldAlert size={16} color={COLORS.warningText} />
                  <Text style={styles.ruleAlertText}>
                    Üye ders iptalleri derse en geç 4 saat kala yapılmalıdır. Zamanında
                    iptal edilen kontenjanlara yedek listedeki sıradaki üye otomatik atanır.
                  </Text>
                </View>
              </View>
            )}

            {/* Duyuru Kartları */}
            {filteredAnnouncements.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  Seçili kategoride güncel kulüp duyurusu bulunmuyor.
                </Text>
              </View>
            ) : (
              filteredAnnouncements.map((ann) => {
                const vis = getAnnouncementVisuals(ann.tag);
                const dateFmt = formatTurkishDateLabel(ann.date);
                const lowerTag = (ann.tag || '').toLocaleLowerCase('tr-TR');
                const isCampaign = lowerTag.includes('kampanya');
                const isNews = lowerTag.includes('haber') || lowerTag.includes('yeni');

                return (
                  <View key={ann.id} style={styles.card}>
                    <View style={styles.articleTopRow}>
                      <View
                        style={[
                          styles.tagBadge,
                          { backgroundColor: vis.bg, borderColor: vis.border },
                        ]}
                      >
                        {isCampaign ? (
                          <Sparkles size={11} color={vis.color} />
                        ) : isNews ? (
                          <Megaphone size={11} color={vis.color} />
                        ) : (
                          <BookOpenCheck size={11} color={vis.color} />
                        )}
                        <Text style={[styles.tagBadgeText, { color: vis.color }]}>
                          {vis.label}
                        </Text>
                      </View>

                      <Text style={styles.articleDateText}>{dateFmt.full}</Text>
                    </View>

                    <Text style={styles.articleTitle}>{ann.title}</Text>
                    <Text style={styles.articleContent}>{ann.content}</Text>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* 4. ULUSLARARASI SERTİFİKALAR KARTI */}
        {showProfileSections && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeading}>Uluslararası Sertifikalar & Uzmanlık</Text>
              <View style={styles.certCountPill}>
                <Text style={styles.certCountText}>{displayCerts.length}</Text>
              </View>
            </View>

            {displayCerts.length === 0 ? (
              <Text style={styles.emptyText}>
                Kayıtlı sertifika bilgisi bulunmuyor.
              </Text>
            ) : (
              <View style={styles.certsListWrap}>
                {displayCerts.map((cert, idx) => (
                  <View key={`${cert}-${idx}`} style={styles.certItemRow}>
                    <CheckCircle2 size={16} color={COLORS.primary} />
                    <Text style={styles.certItemText}>{cert}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 5. YAKLAŞAN AÇIK SEANSLARIM KARTI */}
        {showProfileSections && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeading}>
                Yaklaşan Açık Seanslarım ({openSessions.length})
              </Text>
              <TouchableOpacity
                style={styles.quickAddSlotBtn}
                onPress={onGoToCreateSession}
                activeOpacity={0.85}
              >
                <CalendarPlus size={13} color={COLORS.white} />
                <Text style={styles.quickAddSlotBtnText}>Yeni Ders Aç</Text>
              </TouchableOpacity>
            </View>

            {openSessions.length === 0 ? (
              <Text style={styles.emptyText}>
                Yaklaşan açık dersiniz bulunmuyor. &quot;Yeni Ders Aç&quot; butonuyla
                takviminize seans ekleyebilirsiniz.
              </Text>
            ) : (
              <View style={styles.openSessionsList}>
                {openSessions.slice(0, 6).map((sess) => {
                  const vis = getCategoryVisuals(sess.category);
                  return (
                    <TouchableOpacity
                      key={sess.id}
                      style={styles.openSessionRow}
                      onPress={() => onViewDateInSchedule(sess.date)}
                      activeOpacity={0.82}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.openSessTopBadges}>
                          <View
                            style={[
                              styles.miniCatPill,
                              { backgroundColor: vis.bg, borderColor: vis.border },
                            ]}
                          >
                            <Text style={[styles.miniCatText, { color: vis.color }]}>
                              {vis.label}
                            </Text>
                          </View>
                          <Text style={styles.openSessDateText}>
                            {formatTurkishDateLabel(sess.date).full}
                          </Text>
                        </View>

                        <Text style={styles.openSessTitle} numberOfLines={1}>
                          {sess.title}
                        </Text>

                        <View style={styles.openSessMetaRow}>
                          <Clock size={11} color={COLORS.textMuted} />
                          <Text style={styles.openSessMetaText}>
                            {sess.start_time} - {sess.end_time}
                          </Text>
                          <MapPin size={11} color={COLORS.textMuted} />
                          <Text style={styles.openSessMetaText} numberOfLines={1}>
                            {sess.room || 'Ana Stüdyo'}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.openSessRightBadge,
                          sess.is_full && styles.openSessRightBadgeFull,
                        ]}
                      >
                        <Text
                          style={[
                            styles.openSessCountText,
                            {
                              color: sess.is_full ? COLORS.dangerText : COLORS.primary,
                            },
                          ]}
                        >
                          {sess.current_enrolled}/{sess.capacity}
                        </Text>
                        <Text
                          style={[
                            styles.openSessCountSub,
                            sess.is_full && { color: COLORS.dangerText },
                          ]}
                        >
                          {sess.is_full ? 'Dolu' : 'Kayıt'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 6. YASAL BELGELER & GİZLİLİK (KVKK) */}
        {showProfileSections && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.legalCardTitleRow}>
                <ShieldCheck size={17} color={COLORS.primary} />
                <Text style={styles.cardHeading}>Yasal Belgeler & Gizlilik</Text>
              </View>
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
        )}

        {/* 7. HESAP YÖNETİMİ & KALICI SİLME */}
        {showProfileSections && (
          <View style={styles.dangerCard}>
            <View style={styles.legalCardTitleRow}>
              <Trash2 size={17} color={COLORS.danger} />
              <Text style={styles.dangerTitle}>Hesap Yönetimi</Text>
            </View>
            <Text style={styles.dangerDesc}>
              Hesabınızı kalıcı olarak sildiğinizde eğitmen profiliniz, kişisel
              bilgileriniz ve hesabınıza bağlı oturum kayıtları geri alınamayacak
              şekilde silinir.
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
        )}
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
        onRequestClose={handleCloseDeleteModal}
      >
        <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteModalIconWrap}>
              <AlertTriangle size={24} color={COLORS.danger} />
            </View>

            <Text style={styles.deleteModalTitle}>Hesabımı Kalıcı Olarak Sil</Text>
            <Text style={styles.deleteModalBody}>
              Bu işlem geri alınamaz. Onayladığınızda eğitmen hesabınız kapatılacak ve
              ilişkili kişisel verileriniz kalıcı olarak silinecektir:
            </Text>

            <View style={styles.deleteBulletList}>
              <Text style={styles.deleteBulletItem}>
                • Eğitmen profil, iletişim ve erişim bilgileriniz
              </Text>
              <Text style={styles.deleteBulletItem}>
                • Hesabınıza bağlı aktif oturumlar ve kayıtlar
              </Text>
              <Text style={styles.deleteBulletItem}>
                • Kişisel ölçümler, randevu ve paket kayıtlarınız (varsa)
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.deleteConsentRow,
                deleteConfirmed && styles.deleteConsentRowChecked,
              ]}
              onPress={() => setDeleteConfirmed((prev) => !prev)}
              disabled={deletingAccount}
              activeOpacity={0.82}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: deleteConfirmed }}
              accessibilityLabel="Hesabımın ve tüm kişisel verilerimin kalıcı olarak silineceğini onaylıyorum"
            >
              <View
                style={[
                  styles.deleteCheckbox,
                  deleteConfirmed && styles.deleteCheckboxChecked,
                ]}
              >
                {deleteConfirmed ? (
                  <Check size={13} color={COLORS.white} strokeWidth={2.6} />
                ) : null}
              </View>
              <Text style={styles.deleteConsentText}>
                Hesabımın ve tüm kişisel verilerimin kalıcı olarak silineceğini,
                bu işlemin geri alınamayacağını onaylıyorum.
              </Text>
            </TouchableOpacity>

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
                onPress={handleCloseDeleteModal}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Vazgeç"
              >
                <Text style={styles.deleteCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteConfirmBtn,
                  (!deleteConfirmed || deletingAccount) &&
                    styles.deleteConfirmBtnDisabled,
                ]}
                disabled={!deleteConfirmed || deletingAccount}
                onPress={handleConfirmDeleteAccount}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ disabled: !deleteConfirmed || deletingAccount }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loaderCenter: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loaderText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  modePillsRow: {
    gap: 8,
    paddingBottom: 16,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    ...CARD_SHADOW,
  },
  modePillActiveIndigo: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  modePillActiveTeal: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modePillText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  modePillTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIdentityCol: {
    flex: 1,
    gap: 4,
  },
  verifiedCoachPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E5CB90',
  },
  verifiedCoachText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  heroNameText: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  heroSpecialtyText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  heroContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  heroContactText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningBg,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#EDD092',
  },
  ratingHighlightText: {
    color: COLORS.warningText,
    fontSize: 12.5,
    fontWeight: '800',
  },
  expHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondaryLight,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E5C5C9',
  },
  expHighlightText: {
    color: COLORS.secondary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  activeClassesHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E5CB90',
  },
  activeClassesHighlightText: {
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  bioInnerBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  bioLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  bioBodyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeading: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  cardSubText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  bentoGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBentoTile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  tileIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBigNumber: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tileLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 2,
  },
  sectionBlockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionBlockIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlockTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionBlockSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  newsCatRow: {
    gap: 8,
    paddingBottom: 14,
  },
  newsCatChip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
  },
  newsCatChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  newsCatChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  newsCatChipTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  quickGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickGuideIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 10,
  },
  hourPill: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  hourLabel: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  hourValue: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  ruleAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDD092',
  },
  ruleAlertText: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
  },
  articleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  articleDateText: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  articleTitle: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  articleContent: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  certCountPill: {
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  certCountText: {
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  certsListWrap: {
    gap: 8,
  },
  certItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  certItemText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  quickAddSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  quickAddSlotBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
  openSessionsList: {
    gap: 9,
  },
  openSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  openSessTopBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  miniCatPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  miniCatText: {
    fontSize: 10,
    fontWeight: '800',
  },
  openSessDateText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  openSessTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  openSessMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  openSessMetaText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginRight: 6,
  },
  openSessRightBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5CB90',
  },
  openSessRightBadgeFull: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  openSessCountText: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  openSessCountSub: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  errorRetryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 16,
    padding: 13,
    marginBottom: 14,
  },
  errorRetryText: {
    flex: 1,
    color: COLORS.dangerText,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.danger,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
  },
  legalCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  deleteConsentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 13,
    padding: 12,
  },
  deleteConsentRowChecked: {
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.dangerBorder,
  },
  deleteCheckbox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  deleteCheckboxChecked: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  deleteConsentText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 12.2,
    lineHeight: 17.5,
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
  deleteConfirmBtnDisabled: {
    opacity: 0.45,
  },
  deleteConfirmBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
});
