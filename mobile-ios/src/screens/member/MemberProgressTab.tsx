import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Activity,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  MapPin,
  MessageSquareQuote,
  Scale,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { BodyHeatmapCard } from '@/components/BodyHeatmapCard';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { AppUser, BodyMetric, MemberMetricsSummary } from '@/types/fitness';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';
import { getCategoryVisuals } from '@/screens/member/MemberAvatar';

interface Props {
  member: AppUser;
  onGoToSchedule: () => void;
  onOpenTrainerDetail: (trainerId: number) => void;
}

function formatSignedDiff(val: number, unit: string): string {
  const rounded = Math.round(val * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded}${unit}`;
}

export function MemberProgressTab({
  member,
  onGoToSchedule,
  onOpenTrainerDetail,
}: Props) {
  const { refreshSignal, triggerGlobalRefresh } = useAuthDemo();
  const [summary, setSummary] = useState<MemberMetricsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [heatmapRefreshTick, setHeatmapRefreshTick] = useState<number>(0);
  const loadedMemberIdRef = useRef<number | null>(null);

  const fetchMetrics = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiRequest<MemberMetricsSummary>(
          `/member/${member.id}/metrics`
        );
        setSummary(res);
        loadedMemberIdRef.current = res.member_id;
      } catch (err: any) {
        setErrorMsg(err?.message || 'Gelişim ve InBody ölçümleri yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member.id]
  );

  useEffect(() => {
    const isSilent = loadedMemberIdRef.current === member.id;
    fetchMetrics(isSilent);
  }, [fetchMetrics, refreshSignal, member.id]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setHeatmapRefreshTick((prev) => prev + 1);
    fetchMetrics(true);
  }, [fetchMetrics]);

  const reversedMetrics = useMemo(() => {
    if (!summary?.metrics) return [];
    return [...summary.metrics].reverse();
  }, [summary?.metrics]);

  if (loading && !summary) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>InBody vücut analizi ve gelişim geçmişiniz yükleniyor...</Text>
      </View>
    );
  }

  if (errorMsg && !summary) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => fetchMetrics(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.retryBtnText}>Yeniden Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const latest = summary?.latest ?? null;
  const weightDiff = summary?.weight_diff_kg ?? 0;
  const fatDiff = summary?.body_fat_diff_pct ?? 0;
  const muscleDiff = summary?.muscle_mass_diff_kg ?? 0;
  const completedSessions = summary?.completed_sessions ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* ÜST BAŞLIK & TAMAMLANAN SEANS ÖZETİ */}
      <View style={styles.headerBanner}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.inbodyTag}>
            <Activity size={12} color={COLORS.primary} />
            <Text style={styles.inbodyTagText}>INBODY VÜCUT ANALİZİ</Text>
          </View>
          <Text style={styles.screenTitle}>Vücut Analizim & Gelişim</Text>
          <Text style={styles.screenSub}>
            {latest
              ? `Son ölçüm: ${formatTurkishDateLabel(latest.date).full}`
              : 'Henüz vücut analizi kaydı girilmedi'}
          </Text>
        </View>

        <View style={styles.completedCountBox}>
          <Award size={16} color={COLORS.primary} />
          <Text style={styles.completedCountNum}>
            {summary?.completed_sessions_count ?? 0}
          </Text>
          <Text style={styles.completedCountLabel}>Ders Bitti</Text>
        </View>
      </View>

      {/* 1. YAĞ ORANI BÜYÜK VURGU KARTI */}
      <View style={styles.bigStatCard}>
        <View style={styles.bigStatTopRow}>
          <View style={styles.statLabelCluster}>
            <View style={[styles.statIconWrap, { backgroundColor: COLORS.primaryLight }]}>
              <Flame size={18} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.bigStatCategory}>VÜCUT YAĞ ORANI</Text>
              <Text style={styles.bigStatSubHint}>Metabolik Kompozisyon</Text>
            </View>
          </View>

          <Text style={styles.bigStatMainValue}>
            {latest ? `%${latest.body_fat_pct.toFixed(1)}` : '-'}
          </Text>
        </View>

        <View
          style={[
            styles.diffBanner,
            fatDiff <= 0 ? styles.diffBannerPositive : styles.diffBannerAmber,
          ]}
        >
          {fatDiff <= 0 ? (
            <TrendingDown size={15} color={COLORS.primary} />
          ) : (
            <TrendingUp size={15} color={COLORS.warningText} />
          )}
          <Text
            style={[
              styles.diffBannerText,
              { color: fatDiff <= 0 ? COLORS.primary : COLORS.warningText },
            ]}
          >
            Önceki ölçüme göre {formatSignedDiff(fatDiff, '%')} Yağ Oranı
          </Text>
        </View>
      </View>

      {/* YAN YANA 2 BÜYÜK KART: KAS KÜTLESİ & KİLO */}
      <View style={styles.dualBigRow}>
        <View style={[styles.bigStatCard, { flex: 1 }]}>
          <View style={styles.statIconWrapIndigo}>
            <Dumbbell size={17} color={COLORS.secondary} />
          </View>
          <Text style={styles.bigStatCategory}>İSKELET KAS KÜTLESİ</Text>
          <Text style={styles.dualMainValue}>
            {latest ? `${latest.muscle_mass_kg.toFixed(1)} kg` : '-'}
          </Text>

          <View
            style={[
              styles.compactDiffPill,
              muscleDiff >= 0 ? styles.diffBannerPositive : styles.diffBannerAmber,
            ]}
          >
            <Text
              style={[
                styles.compactDiffText,
                { color: muscleDiff >= 0 ? COLORS.primary : COLORS.warningText },
              ]}
            >
              {formatSignedDiff(muscleDiff, ' kg')} Kas
            </Text>
          </View>
        </View>

        <View style={[styles.bigStatCard, { flex: 1 }]}>
          <View style={styles.statIconWrapAmber}>
            <Scale size={17} color={COLORS.warningText} />
          </View>
          <Text style={styles.bigStatCategory}>GÜNCEL KİLO</Text>
          <Text style={styles.dualMainValue}>
            {latest ? `${latest.weight_kg.toFixed(1)} kg` : '-'}
          </Text>

          <View
            style={[
              styles.compactDiffPill,
              weightDiff <= 0 ? styles.diffBannerPositive : styles.diffBannerIndigo,
            ]}
          >
            <Text
              style={[
                styles.compactDiffText,
                { color: weightDiff <= 0 ? COLORS.primary : COLORS.secondary },
              ]}
            >
              {formatSignedDiff(weightDiff, ' kg')} Kilo
            </Text>
          </View>
        </View>
      </View>

      {/* İNTERAKTİF KAS & SAKATLIK HARİTASI */}
      <BodyHeatmapCard
        userId={member.id}
        userName={member.full_name}
        title="İnteraktif Kas & Sakatlık Haritam"
        subtitle="Bölgelere dokunarak sağlam, hassasiyet veya sakatlık durumunuzu eğitmeninizle anında paylaşın"
        refreshKey={refreshSignal + heatmapRefreshTick}
        onZonesSaved={() => triggerGlobalRefresh()}
      />

      {/* 2. EĞİTMENİN SON ANTRENMAN & BESLENME TAVSİYESİ */}
      {summary?.latest_trainer_comment ? (
        <View style={styles.coachAdviceCard}>
          <View style={styles.coachAdviceHeader}>
            <View style={styles.coachAdviceIconBox}>
              <MessageSquareQuote size={18} color={COLORS.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.coachAdviceTag}>KOÇ DEĞERLENDİRMESİ</Text>
              <Text style={styles.coachAdviceTitle}>
                Antrenman & Beslenme Tavsiyesi
              </Text>
            </View>
          </View>

          <Text style={styles.coachAdviceBody}>{summary.latest_trainer_comment}</Text>
        </View>
      ) : null}

      {/* 3. GEÇMİŞ ÖLÇÜM KAYITLARI ZAMAN ÇİZELGESİ */}
      <View style={styles.sectionHeaderRow}>
        <Activity size={17} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>
          Ölçüm Geçmişim ({reversedMetrics.length})
        </Text>
      </View>

      {reversedMetrics.length === 0 ? (
        <View style={styles.emptyCard}>
          <Scale size={26} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Henüz InBody ölçümü bulunmuyor</Text>
          <Text style={styles.emptySub}>
            Eğitmeniniz ilk vücut analizinizi girdiğinde karşılaştırmalı ölçümleriniz burada listelenir.
          </Text>
        </View>
      ) : (
        reversedMetrics.map((m: BodyMetric, idx: number) => {
          const olderMetric = reversedMetrics[idx + 1] ?? null;
          const isLatest = idx === 0;
          const dateFmt = formatTurkishDateLabel(m.date);

          const wDelta = olderMetric
            ? Math.round((m.weight_kg - olderMetric.weight_kg) * 10) / 10
            : null;
          const fDelta = olderMetric
            ? Math.round((m.body_fat_pct - olderMetric.body_fat_pct) * 10) / 10
            : null;
          const musDelta = olderMetric
            ? Math.round((m.muscle_mass_kg - olderMetric.muscle_mass_kg) * 10) / 10
            : null;

          return (
            <View
              key={m.id}
              style={[
                styles.metricHistoryCard,
                isLatest && styles.metricHistoryCardLatest,
              ]}
            >
              <View style={styles.metricHistoryHeader}>
                <Text style={styles.metricHistoryDate}>{dateFmt.full}</Text>
                {isLatest ? (
                  <View style={styles.latestChip}>
                    <Text style={styles.latestChipText}>GÜNCEL ÖLÇÜM</Text>
                  </View>
                ) : (
                  <Text style={styles.olderIndexText}>
                    #{reversedMetrics.length - idx}. Ölçüm
                  </Text>
                )}
              </View>

              <View style={styles.metricValuesStrip}>
                <View style={styles.metricValueCol}>
                  <Text style={styles.metricMiniLabel}>Kilo</Text>
                  <Text style={styles.metricMiniVal}>{m.weight_kg.toFixed(1)} kg</Text>
                  {wDelta !== null && (
                    <Text
                      style={[
                        styles.metricDeltaText,
                        { color: wDelta <= 0 ? COLORS.primary : COLORS.textSecondary },
                      ]}
                    >
                      {formatSignedDiff(wDelta, ' kg')}
                    </Text>
                  )}
                </View>

                <View style={styles.metricValueCol}>
                  <Text style={styles.metricMiniLabel}>Yağ Oranı</Text>
                  <Text style={[styles.metricMiniVal, { color: COLORS.primary }]}>
                    %{m.body_fat_pct.toFixed(1)}
                  </Text>
                  {fDelta !== null && (
                    <Text
                      style={[
                        styles.metricDeltaText,
                        { color: fDelta <= 0 ? COLORS.primary : COLORS.warningText },
                      ]}
                    >
                      {formatSignedDiff(fDelta, '%')}
                    </Text>
                  )}
                </View>

                <View style={styles.metricValueCol}>
                  <Text style={styles.metricMiniLabel}>Kas Kütlesi</Text>
                  <Text style={[styles.metricMiniVal, { color: COLORS.secondary }]}>
                    {m.muscle_mass_kg.toFixed(1)} kg
                  </Text>
                  {musDelta !== null && (
                    <Text
                      style={[
                        styles.metricDeltaText,
                        { color: musDelta >= 0 ? COLORS.primary : COLORS.warningText },
                      ]}
                    >
                      {formatSignedDiff(musDelta, ' kg')}
                    </Text>
                  )}
                </View>
              </View>

              {m.trainer_comment ? (
                <View style={styles.metricCommentBox}>
                  <Text style={styles.metricCommentText}>
                    💬 {m.trainer_comment}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {/* 4. TAMAMLANAN GEÇMİŞ DERSLERİM */}
      <View style={styles.sectionHeaderBetween}>
        <View style={styles.sectionHeaderRow}>
          <CheckCircle2 size={17} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>
            Tamamlanan Derslerim ({completedSessions.length})
          </Text>
        </View>

        <TouchableOpacity
          style={styles.planNewLink}
          onPress={onGoToSchedule}
          activeOpacity={0.8}
        >
          <Text style={styles.planNewLinkText}>Yeni Ders</Text>
          <ArrowRight size={13} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {completedSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Dumbbell size={26} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Henüz tamamlanmış dersiniz yok</Text>
          <Text style={styles.emptySub}>
            Katıldığınız derslerin yoklaması onaylandığında geçmişiniz burada birikir.
          </Text>
        </View>
      ) : (
        completedSessions.map((sess) => {
          const catVis = getCategoryVisuals(sess.category);
          const dateFmt = formatTurkishDateLabel(sess.date);

          return (
            <View key={sess.booking_id} style={styles.completedSessionCard}>
              <View style={styles.completedTopRow}>
                <View style={styles.completedDateBadge}>
                  <Calendar size={12} color={COLORS.primary} />
                  <Text style={styles.completedDateText}>{dateFmt.full}</Text>
                </View>

                <View
                  style={[
                    styles.completedCatBadge,
                    { backgroundColor: catVis.bg, borderColor: catVis.border },
                  ]}
                >
                  <Text style={[styles.completedCatText, { color: catVis.color }]}>
                    {catVis.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.completedTitle}>{sess.title}</Text>

              <View style={styles.completedMetaRow}>
                <View style={styles.completedMetaItem}>
                  <Clock size={12} color={COLORS.textSecondary} />
                  <Text style={styles.completedMetaText}>
                    {sess.start_time} - {sess.end_time}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.completedMetaItem}
                  onPress={() => onOpenTrainerDetail(sess.trainer_id)}
                  activeOpacity={0.8}
                >
                  <User size={12} color={COLORS.secondary} />
                  <Text style={[styles.completedMetaText, { color: COLORS.secondary }]}>
                    {sess.trainer_name}
                  </Text>
                </TouchableOpacity>

                <View style={styles.completedMetaItem}>
                  <MapPin size={12} color={COLORS.textSecondary} />
                  <Text style={styles.completedMetaText}>
                    {sess.room || 'Ana Stüdyo'}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
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
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loaderText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  inbodyTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  inbodyTagText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  screenTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  screenSub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  completedCountBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
    ...CARD_SHADOW,
  },
  completedCountNum: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  completedCountLabel: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
  },
  bigStatCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  bigStatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statLabelCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconWrapIndigo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconWrapAmber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigStatCategory: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  bigStatSubHint: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 1,
  },
  bigStatMainValue: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  diffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  diffBannerPositive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  diffBannerAmber: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  diffBannerIndigo: {
    backgroundColor: COLORS.secondaryLight,
    borderColor: '#E5C5C9',
  },
  diffBannerText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  dualBigRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dualMainValue: {
    color: COLORS.textPrimary,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  compactDiffPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  compactDiffText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  coachAdviceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    gap: 12,
    ...CARD_SHADOW,
  },
  coachAdviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  coachAdviceIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAdviceTag: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  coachAdviceTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    marginTop: 1,
  },
  coachAdviceBody: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    backgroundColor: COLORS.surfaceElevated,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  planNewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  planNewLinkText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  metricHistoryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...CARD_SHADOW,
  },
  metricHistoryCardLatest: {
    borderColor: '#E5CB90',
  },
  metricHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricHistoryDate: {
    color: COLORS.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  latestChip: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  latestChipText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  olderIndexText: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
  },
  metricValuesStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 15,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'space-between',
  },
  metricValueCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  metricMiniLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  metricMiniVal: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  metricDeltaText: {
    fontSize: 11,
    fontWeight: '800',
  },
  metricCommentBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricCommentText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  completedSessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...CARD_SHADOW,
  },
  completedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  completedDateText: {
    color: COLORS.textPrimary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  completedCatBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  completedCatText: {
    fontSize: 11,
    fontWeight: '800',
  },
  completedTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  completedMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  completedMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  completedMetaText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    marginBottom: 16,
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
});
