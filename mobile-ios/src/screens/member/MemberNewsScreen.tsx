import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowRight,
  BookOpenCheck,
  Clock,
  Megaphone,
  ShieldAlert,
  Sparkles,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { AnnouncementItem, MemberDrawerRoute } from '@/types/fitness';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';
import { getAnnouncementVisuals } from '@/screens/member/MemberAvatar';

export interface MemberNewsScreenProps {
  onNavigate?: (route: MemberDrawerRoute) => void;
}

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

export function MemberNewsScreen({ onNavigate }: MemberNewsScreenProps) {
  const { refreshSignal } = useAuthDemo();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<NewsCategoryFilter>('Tümü');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<AnnouncementItem[]>('/announcements');
      setItems(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Duyurular ve bilgilendirmeler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements(items.length > 0);
  }, [fetchAnnouncements, refreshSignal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnnouncements(true);
  }, [fetchAnnouncements]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => matchesNewsCategory(item.tag, selectedCat));
  }, [items, selectedCat]);

  const handleSelectCategory = (cat: NewsCategoryFilter) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCat(cat);
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>Haberler ve kulüp rehberi yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ÜST KATEGORİ FİLTRE ÇİPLERİ */}
      <View style={styles.filterStrip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {NEWS_CATEGORIES.map((cat) => {
            const active = selectedCat === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => handleSelectCategory(cat)}
                activeOpacity={0.84}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* SABİT ÖZET BİLGİ KUTUSU: ÇALIŞMA SAATLERİ & 4 SAAT KURALI (Tümü ve Kurallar'da görünür) */}
        {(selectedCat === 'Tümü' || selectedCat === 'Kurallar & Bilgilendirme') && (
          <View style={styles.quickGuideCard}>
            <View style={styles.quickGuideHeader}>
              <View style={styles.quickGuideIconBox}>
                <Clock size={16} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickGuideTitle}>ERYA Pilates Çalışma Saatleri & Stüdyo Rehberi</Text>
                <Text style={styles.quickGuideSub}>Eryaman Port AVM D:2/2C • Kaydırmaz çorap & kişisel havlu zorunludur</Text>
              </View>
            </View>

            <View style={styles.hoursRow}>
              <View style={styles.hourPill}>
                <Text style={styles.hourLabel}>Çalışma Saatleri</Text>
                <Text style={styles.hourValue}>09:00 - 22:00</Text>
              </View>
              <View style={styles.hourPill}>
                <Text style={styles.hourLabel}>WhatsApp & İletişim</Text>
                <Text style={styles.hourValue}>0551 497 90 09</Text>
              </View>
            </View>

            <View style={styles.ruleAlertBox}>
              <ShieldAlert size={16} color={COLORS.warningText} />
              <Text style={styles.ruleAlertText}>
                Ders iptalleri derse en geç 4 saat kala yapılmalıdır. Zamanında iptal edilen derslerin kredisi anında paketinize iade edilir.
              </Text>
            </View>
          </View>
        )}

        {errorMsg && items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchAnnouncements(false)}
            >
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Megaphone size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Bu kategoride duyuru bulunamadı</Text>
            <Text style={styles.emptySub}>
              Tüm kulüp bilgilendirmelerini görmek için "Tümü" filtresini seçebilirsiniz.
            </Text>
          </View>
        ) : (
          filteredItems.map((ann) => {
            const vis = getAnnouncementVisuals(ann.tag);
            const dateFmt = formatTurkishDateLabel(ann.date);
            const lowerTag = (ann.tag || '').toLocaleLowerCase('tr-TR');
            const isCampaign = lowerTag.includes('kampanya');
            const isNews = lowerTag.includes('haber') || lowerTag.includes('yeni');

            return (
              <View key={ann.id} style={styles.articleCard}>
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

                  <Text style={styles.dateText}>{dateFmt.full}</Text>
                </View>

                <Text style={styles.articleTitle}>{ann.title}</Text>
                <Text style={styles.articleContent}>{ann.content}</Text>

                {onNavigate && (isCampaign || isNews) && (
                  <TouchableOpacity
                    style={styles.articleCtaLink}
                    onPress={() =>
                      onNavigate(isCampaign ? 'packages' : 'schedule')
                    }
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.articleCtaText,
                        { color: isCampaign ? COLORS.warningText : COLORS.primary },
                      ]}
                    >
                      {isCampaign
                        ? 'Paket Yenileme & Avantajları İncele'
                        : 'Ders Vakitlerini İncele & Kayıt Ol'}
                    </Text>
                    <ArrowRight
                      size={14}
                      color={isCampaign ? COLORS.warningText : COLORS.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerBox: {
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
  },
  filterStrip: {
    backgroundColor: COLORS.background,
    paddingTop: 12,
    paddingBottom: 8,
  },
  filterScrollContent: {
    paddingHorizontal: 18,
    gap: 8,
  },
  filterChip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 38,
  },
  quickGuideCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 13,
    ...CARD_SHADOW,
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
  quickGuideTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  quickGuideSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
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
  articleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
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
  dateText: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },
  articleTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  articleContent: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 20.5,
    fontWeight: '500',
  },
  articleCtaLink: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  articleCtaText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...CARD_SHADOW,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
