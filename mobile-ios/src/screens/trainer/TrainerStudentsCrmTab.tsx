import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CreditCard,
  Droplets,
  Flame,
  Phone,
  PlusCircle,
  Search,
  Users,
  X,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import {
  BodyZonesApiResponse,
  BodyZonesRecord,
  EnrichedTrainerMemberFields,
  MemberDailyWellness,
  extractBodyZoneAlerts,
  getEnergyStatusDisplay,
  normalizeBodyZones,
} from '@/components/BodyHeatmapCard';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { TrainerMemberCrm } from '@/types/fitness';
import { MemberAvatar } from '@/screens/member/MemberAvatar';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';

const TrainerMemberCrmModal = React.lazy(() =>
  import('@/screens/trainer/TrainerMemberCrmModal').then((m) => ({
    default: m.TrainerMemberCrmModal,
  }))
);

type FilterChipKey = 'all' | 'low_credit' | 'has_notes';

interface MemberSnapshot {
  zones?: BodyZonesRecord;
  wellness?: MemberDailyWellness;
}

interface CrmMemberCardProps {
  member: TrainerMemberCrm;
  snapshot?: MemberSnapshot;
  onSelect: (memberId: number) => void;
}

const CrmMemberCard = React.memo(function CrmMemberCard({
  member: m,
  snapshot: snap,
  onSelect,
}: CrmMemberCardProps) {
  const enriched = m as TrainerMemberCrm & EnrichedTrainerMemberFields;
  const effectiveZones = snap?.zones ?? enriched.body_zones;
  const zoneAlerts = extractBodyZoneAlerts(effectiveZones);

  const waterMl = snap?.wellness?.water_ml ?? enriched.today_water_ml ?? 0;
  const waterGoalMl =
    snap?.wellness?.water_goal_ml ?? enriched.water_goal_ml ?? 3000;
  const waterPct =
    enriched.water_pct !== undefined &&
    enriched.water_pct !== null &&
    !snap?.wellness
      ? Math.min(100, Math.max(0, Math.round(enriched.water_pct)))
      : waterGoalMl > 0
      ? Math.min(100, Math.max(0, Math.round((waterMl / waterGoalMl) * 100)))
      : 0;

  const proteinG = snap?.wellness?.protein_g ?? enriched.today_protein_g ?? 0;
  const proteinGoalG =
    snap?.wellness?.protein_goal_g ?? enriched.protein_goal_g ?? 140;
  const proteinPct =
    enriched.protein_pct !== undefined &&
    enriched.protein_pct !== null &&
    !snap?.wellness
      ? Math.min(100, Math.max(0, Math.round(enriched.protein_pct)))
      : proteinGoalG > 0
      ? Math.min(100, Math.max(0, Math.round((proteinG / proteinGoalG) * 100)))
      : 0;

  const energyRaw =
    snap?.wellness?.energy_status ?? enriched.today_energy_status ?? 'normal';
  const energyMeta = getEnergyStatusDisplay(energyRaw);

  const isLow = m.low_credit_warning || m.remaining_credits <= 2;
  const hasNote = Boolean(m.notes && m.notes.trim().length > 0);
  const creditRatio =
    m.total_credits > 0 ? Math.min(1, m.remaining_credits / m.total_credits) : 0;
  const metric = m.latest_metric;

  return (
    <TouchableOpacity
      style={[styles.memberCard, isLow && styles.memberCardLowBorder]}
      onPress={() => onSelect(m.id)}
      activeOpacity={0.86}
    >
      {/* Üst Satır: Avatar + İsim & İletişim + Seri Rozeti */}
      <View style={styles.cardTopRow}>
        <MemberAvatar
          uri={m.avatar_url}
          name={m.full_name}
          size={52}
          borderRadius={16}
          accentColor={isLow ? COLORS.warning : COLORS.primary}
        />

        <View style={styles.cardIdentityCol}>
          <View style={styles.nameAndStreakRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {m.full_name}
            </Text>
            <View style={styles.streakBadge}>
              <Flame size={11} color={COLORS.primary} />
              <Text style={styles.streakBadgeText}>
                {m.streak_days} Haftalık Seri
              </Text>
            </View>
          </View>

          <View style={styles.phoneHandleRow}>
            <Phone size={11} color={COLORS.textMuted} />
            <Text style={styles.phoneHandleText} numberOfLines={1}>
              {m.phone}
              {m.instagram_handle ? ` • ${m.instagram_handle}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.chevronBadge}>
          <ChevronRight size={17} color={COLORS.textSecondary} />
        </View>
      </View>

      {/* Aktif Paket & Kalan Kredi Barı */}
      <View
        style={[
          styles.packageStrip,
          isLow ? styles.packageStripWarn : styles.packageStripNormal,
        ]}
      >
        <View style={styles.packageTopLine}>
          <View style={styles.packageTitleCluster}>
            <CreditCard
              size={13}
              color={isLow ? COLORS.warningText : COLORS.primary}
            />
            <Text style={styles.packageNameText} numberOfLines={1}>
              {m.package_name || 'Aktif Üyelik Paketi Yok'}
            </Text>
          </View>
          <Text
            style={[
              styles.creditFractionText,
              { color: isLow ? COLORS.warningText : COLORS.primary },
            ]}
          >
            {m.remaining_credits}/{m.total_credits || '-'} Ders
          </Text>
        </View>

        <View style={styles.creditProgressTrack}>
          <View
            style={[
              styles.creditProgressFill,
              {
                width: `${Math.round(creditRatio * 100)}%`,
                backgroundColor: isLow ? COLORS.warning : COLORS.primary,
              },
            ]}
          />
        </View>

        {isLow && (
          <Text style={styles.lowCreditHintText}>
            ⚠️ Paket bitmek üzere • Yenileme hatırlatması önerilir
          </Text>
        )}
      </View>

      {/* Aktif Bölge Uyarı Rozetleri (Vücut Haritası) */}
      {zoneAlerts.length > 0 && (
        <View style={styles.zoneAlertsWrap}>
          {zoneAlerts.map((za) => (
            <View
              key={za.zone}
              style={[
                styles.zoneAlertChip,
                za.status === 'injured'
                  ? styles.zoneAlertChipInjured
                  : styles.zoneAlertChipWarning,
              ]}
            >
              <Text
                style={[
                  styles.zoneAlertChipText,
                  {
                    color: za.status === 'injured' ? '#B91C1C' : '#B45309',
                  },
                ]}
              >
                {za.badgeText}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Günlük Su, Protein & Enerji Tamamlama Çubukları */}
      <View style={styles.dailyWellnessStrip}>
        <View style={styles.dailyWellnessTopRow}>
          <View style={styles.dailyWellnessTitleCluster}>
            <Droplets size={13} color="#0284C7" />
            <Text style={styles.dailyWellnessTitle}>
              Bugünkü Su, Protein & Enerji
            </Text>
          </View>
          <View
            style={[
              styles.crmEnergyBadge,
              {
                backgroundColor: energyMeta.bg,
                borderColor: energyMeta.border,
              },
            ]}
          >
            <Text
              style={[
                styles.crmEnergyBadgeText,
                { color: energyMeta.color },
              ]}
            >
              {energyMeta.label}
            </Text>
          </View>
        </View>

        <View style={styles.dualWellnessBarsRow}>
          <View style={styles.miniWellnessCol}>
            <View style={styles.miniWellnessHeader}>
              <Text style={styles.miniWellnessLabel}>💧 Su</Text>
              <Text style={[styles.miniWellnessVal, { color: '#0284C7' }]}>
                %{waterPct} • {waterMl}/{waterGoalMl}ml
              </Text>
            </View>
            <View
              style={[
                styles.miniWellnessTrack,
                { backgroundColor: '#E0F2FE' },
              ]}
            >
              <View
                style={[
                  styles.miniWellnessFill,
                  { width: `${waterPct}%`, backgroundColor: '#0EA5E9' },
                ]}
              />
            </View>
          </View>

          <View style={styles.miniWellnessCol}>
            <View style={styles.miniWellnessHeader}>
              <Text style={styles.miniWellnessLabel}>🥩 Protein</Text>
              <Text style={[styles.miniWellnessVal, { color: '#047857' }]}>
                %{proteinPct} • {proteinG}/{proteinGoalG}g
              </Text>
            </View>
            <View
              style={[
                styles.miniWellnessTrack,
                { backgroundColor: '#D1FAE5' },
              ]}
            >
              <View
                style={[
                  styles.miniWellnessFill,
                  { width: `${proteinPct}%`, backgroundColor: '#10B981' },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Varsa Sakatlık / Özel Not Özeti */}
      {hasNote && (
        <View style={styles.notePreviewBox}>
          <AlertTriangle size={15} color={COLORS.warningText} />
          <Text style={styles.notePreviewText} numberOfLines={2}>
            {m.notes}
          </Text>
        </View>
      )}

      {/* Son InBody Ölçüm Özeti */}
      {metric ? (
        <View style={styles.inbodyRow}>
          <View style={styles.inbodyHeaderCol}>
            <View style={styles.inbodyBadgeTitle}>
              <Activity size={13} color={COLORS.secondary} />
              <Text style={styles.inbodyTitleText}>Son InBody</Text>
            </View>
            <Text style={styles.inbodyDateText}>
              {formatTurkishDateLabel(metric.date).primary}
            </Text>
          </View>

          <View style={styles.inbodyMetricsGroup}>
            <View style={styles.inbodyStatPill}>
              <Text style={styles.inbodyStatLabel}>Kilo</Text>
              <Text style={styles.inbodyStatVal}>{metric.weight_kg} kg</Text>
            </View>
            <View style={styles.inbodyStatPill}>
              <Text style={styles.inbodyStatLabel}>Yağ</Text>
              <Text
                style={[styles.inbodyStatVal, { color: COLORS.warningText }]}
              >
                %{metric.body_fat_pct}
              </Text>
            </View>
            <View style={styles.inbodyStatPill}>
              <Text style={styles.inbodyStatLabel}>Kas</Text>
              <Text style={[styles.inbodyStatVal, { color: COLORS.primary }]}>
                {metric.muscle_mass_kg} kg
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.noMetricBar}>
          <PlusCircle size={14} color={COLORS.primary} />
          <Text style={styles.noMetricBarText}>
            Henüz InBody ölçümü girilmedi • Yeni ölçüm eklemek için dokunun
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

interface Props {
  onShowBanner?: (type: 'success' | 'error', text: string) => void;
  onScheduleSyncNeeded?: () => Promise<void>;
}

export function TrainerStudentsCrmTab({
  onShowBanner,
  onScheduleSyncNeeded,
}: Props) {
  const { refreshSignal } = useAuthDemo();
  const [members, setMembers] = useState<TrainerMemberCrm[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterChipKey>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberSnapshots, setMemberSnapshots] = useState<
    Record<
      number,
      {
        zones?: BodyZonesRecord;
        wellness?: MemberDailyWellness;
      }
    >
  >({});

  const hydrateMissingSnapshots = useCallback(async (list: TrainerMemberCrm[]) => {
    const missing = list.filter((item) => {
      const enriched = item as TrainerMemberCrm & EnrichedTrainerMemberFields;
      return !enriched.body_zones || enriched.today_water_ml === undefined;
    });
    if (missing.length === 0) return;

    await Promise.all(
      missing.map(async (m) => {
        const enriched = m as TrainerMemberCrm & EnrichedTrainerMemberFields;
        let fetchedZones: BodyZonesRecord | undefined;
        let fetchedWellness: MemberDailyWellness | undefined;

        if (!enriched.body_zones) {
          try {
            const zRes = await apiRequest<BodyZonesApiResponse>(
              `/users/${m.id}/body-zones`
            );
            if (zRes?.zones) {
              fetchedZones = normalizeBodyZones(zRes.zones);
            }
          } catch {
            // sessiz yedek
          }
        }

        if (enriched.today_water_ml === undefined) {
          try {
            fetchedWellness = await apiRequest<MemberDailyWellness>(
              `/wellness/${m.id}/today`
            );
          } catch {
            // sessiz yedek
          }
        }

        if (fetchedZones || fetchedWellness) {
          setMemberSnapshots((prev) => ({
            ...prev,
            [m.id]: {
              zones: fetchedZones ?? prev[m.id]?.zones,
              wellness: fetchedWellness ?? prev[m.id]?.wellness,
            },
          }));
        }
      })
    );
  }, []);

  const fetchMembers = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const res = await apiRequest<TrainerMemberCrm[]>('/trainer/members');
        const safeList = Array.isArray(res) ? res : [];
        setMembers(safeList);
        hydrateMissingSnapshots(safeList);
      } catch (err: any) {
        const msg =
          err?.message ||
          'Öğrenci listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
        setLoadError(msg);
        onShowBanner?.('error', msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hydrateMissingSnapshots, onShowBanner]
  );

  useEffect(() => {
    fetchMembers(members.length > 0);
  }, [fetchMembers, refreshSignal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMembers(true);
  }, [fetchMembers]);

  const handleMemberMutated = useCallback(async () => {
    await fetchMembers(true);
    if (onScheduleSyncNeeded) {
      await onScheduleSyncNeeded();
    }
  }, [fetchMembers, onScheduleSyncNeeded]);

  const counts = useMemo(() => {
    const lowCredit = members.filter(
      (m) => m.low_credit_warning || m.remaining_credits <= 2
    ).length;
    const withNotes = members.filter((m) => {
      const enriched = m as TrainerMemberCrm & EnrichedTrainerMemberFields;
      const zMap = memberSnapshots[m.id]?.zones ?? enriched.body_zones;
      const alerts = extractBodyZoneAlerts(zMap);
      return Boolean((m.notes && m.notes.trim().length > 0) || alerts.length > 0);
    }).length;
    return {
      all: members.length,
      lowCredit,
      withNotes,
    };
  }, [members, memberSnapshots]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const qDigits = q.replace(/\s+/g, '');

    return members.filter((m) => {
      if (activeFilter === 'low_credit') {
        if (!(m.low_credit_warning || m.remaining_credits <= 2)) return false;
      } else if (activeFilter === 'has_notes') {
        const enriched = m as TrainerMemberCrm & EnrichedTrainerMemberFields;
        const zMap = memberSnapshots[m.id]?.zones ?? enriched.body_zones;
        const alerts = extractBodyZoneAlerts(zMap);
        const hasTextNote = Boolean(m.notes && m.notes.trim().length > 0);
        if (!hasTextNote && alerts.length === 0) return false;
      }

      if (!q) return true;

      const nameMatch = m.full_name.toLocaleLowerCase('tr-TR').includes(q);
      const handleMatch = (m.instagram_handle || '')
        .toLocaleLowerCase('tr-TR')
        .includes(q);
      const phoneMatch =
        m.phone.toLocaleLowerCase('tr-TR').includes(q) ||
        m.phone.replace(/\s+/g, '').includes(qDigits);

      return nameMatch || handleMatch || phoneMatch;
    });
  }, [members, activeFilter, searchQuery, memberSnapshots]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const handleSelectMember = useCallback((id: number) => {
    setSelectedMemberId(id);
  }, []);

  const renderMemberItem = useCallback(
    ({ item }: { item: TrainerMemberCrm }) => (
      <CrmMemberCard
        member={item}
        snapshot={memberSnapshots[item.id]}
        onSelect={handleSelectMember}
      />
    ),
    [handleSelectMember, memberSnapshots]
  );

  const keyExtractor = useCallback((item: TrainerMemberCrm) => String(item.id), []);

  if (loading && members.length === 0) {
    return (
      <View style={styles.centerLoader}>
        <ActivityIndicator size="large" color={COLORS.secondary} />
        <Text style={styles.loaderText}>Öğrenci CRM veritabanı yükleniyor...</Text>
      </View>
    );
  }

  if (loadError && members.length === 0) {
    return (
      <View style={styles.centerLoader}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => fetchMembers(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.retryBtnText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listHeaderElement = (
    <View>
      {/* Üst CRM Özet & Arama Kartı */}
      <View style={styles.topControlCard}>
        <View style={styles.crmSummaryRow}>
          <View style={styles.crmSummaryBox}>
            <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.secondaryLight }]}>
              <Users size={15} color={COLORS.secondary} />
            </View>
            <Text style={styles.crmSummaryValue}>{counts.all}</Text>
            <Text style={styles.crmSummaryLabel}>Aktif Öğrenci</Text>
          </View>

          <View style={styles.crmSummaryBox}>
            <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.warningBg }]}>
              <Flame size={15} color={COLORS.warningText} />
            </View>
            <Text style={[styles.crmSummaryValue, { color: COLORS.warningText }]}>
              {counts.lowCredit}
            </Text>
            <Text style={styles.crmSummaryLabel}>Paketi Azalan</Text>
          </View>

          <View style={styles.crmSummaryBox}>
            <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.primaryLight }]}>
              <AlertTriangle size={15} color={COLORS.primary} />
            </View>
            <Text style={[styles.crmSummaryValue, { color: COLORS.primary }]}>
              {counts.withNotes}
            </Text>
            <Text style={styles.crmSummaryLabel}>Sakatlık Notlu</Text>
          </View>
        </View>

        {/* Arama Çubuğu */}
        <View style={styles.searchBarCapsule}>
          <Search size={17} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Öğrenci adı, @instagram veya telefon ara..."
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => setSearchQuery('')}
            >
              <X size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filtre Çipleri */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRow}
      >
        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'all' && styles.filterChipActiveIndigo,
          ]}
          onPress={() => setActiveFilter('all')}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'all' && styles.filterChipTextActive,
            ]}
          >
            Tüm Üyeler ({counts.all})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'low_credit' && styles.filterChipActiveAmber,
          ]}
          onPress={() => setActiveFilter('low_credit')}
          activeOpacity={0.85}
        >
          <Flame
            size={13}
            color={
              activeFilter === 'low_credit' ? COLORS.white : COLORS.warningText
            }
          />
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'low_credit' && styles.filterChipTextActive,
            ]}
          >
            Paketi Bitmek Üzere Olanlar ({counts.lowCredit})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'has_notes' && styles.filterChipActiveEmerald,
          ]}
          onPress={() => setActiveFilter('has_notes')}
          activeOpacity={0.85}
        >
          <AlertTriangle
            size={13}
            color={activeFilter === 'has_notes' ? COLORS.white : COLORS.primary}
          />
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'has_notes' && styles.filterChipTextActive,
            ]}
          >
            Sakatlık Notu Olanlar ({counts.withNotes})
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <FlatList
        data={filteredMembers}
        keyExtractor={keyExtractor}
        renderItem={renderMemberItem}
        ListHeaderComponent={listHeaderElement}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <Users size={26} color={COLORS.secondary} />
            </View>
            <Text style={styles.emptyTitle}>Eşleşen üye bulunamadı</Text>
            <Text style={styles.emptySub}>
              Arama terimini temizleyerek veya filtre çipini değiştirerek tüm öğrencilerinizi
              görüntüleyebilirsiniz.
            </Text>
          </View>
        }
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.secondary}
          />
        }
      />

      {/* Üye Detay, Sakatlık Notu & Yeni Vücut Ölçümü Modalı (Lazy) */}
      {selectedMember ? (
        <Suspense fallback={null}>
          <TrainerMemberCrmModal
            visible={Boolean(selectedMember)}
            member={selectedMember}
            onClose={() => setSelectedMemberId(null)}
            onMemberMutated={handleMemberMutated}
            onZonesMutated={(mid, updatedZones) => {
              setMemberSnapshots((prev) => ({
                ...prev,
                [mid]: {
                  ...prev[mid],
                  zones: updatedZones,
                },
              }));
            }}
            onShowBanner={onShowBanner}
          />
        </Suspense>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerLoader: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loaderText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.dangerText,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  topControlCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  crmSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  crmSummaryBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 5,
  },
  kpiIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crmSummaryValue: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  crmSummaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  searchBarCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
    paddingVertical: 2,
  },
  clearSearchBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipsRow: {
    gap: 8,
    paddingBottom: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...CARD_SHADOW,
  },
  filterChipActiveIndigo: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  filterChipActiveAmber: {
    backgroundColor: COLORS.warningText,
    borderColor: COLORS.warningText,
  },
  filterChipActiveEmerald: {
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
  emptyBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    marginTop: 12,
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  memberCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 13,
    ...CARD_SHADOW,
  },
  memberCardLowBorder: {
    borderColor: '#EDD092',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIdentityCol: {
    flex: 1,
    gap: 4,
  },
  nameAndStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  memberName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  streakBadgeText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  phoneHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phoneHandleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  chevronBadge: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageStrip: {
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    gap: 8,
  },
  packageStripNormal: {
    backgroundColor: COLORS.surfaceElevated,
    borderColor: COLORS.border,
  },
  packageStripWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  packageTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  packageTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  packageNameText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  creditFractionText: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  creditProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  creditProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  lowCreditHintText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '700',
  },
  notePreviewBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notePreviewText: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  inbodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inbodyHeaderCol: {
    gap: 2,
  },
  inbodyBadgeTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inbodyTitleText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  inbodyDateText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  inbodyMetricsGroup: {
    flexDirection: 'row',
    gap: 7,
  },
  inbodyStatPill: {
    backgroundColor: COLORS.surface,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inbodyStatLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  inbodyStatVal: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 1,
  },
  noMetricBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5CB90',
  },
  noMetricBarText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  zoneAlertsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  zoneAlertChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  zoneAlertChipInjured: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  zoneAlertChipWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  zoneAlertChipText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  dailyWellnessStrip: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  dailyWellnessTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dailyWellnessTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dailyWellnessTitle: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  crmEnergyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  crmEnergyBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  dualWellnessBarsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  miniWellnessCol: {
    flex: 1,
    gap: 5,
  },
  miniWellnessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  miniWellnessLabel: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
  },
  miniWellnessVal: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  miniWellnessTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  miniWellnessFill: {
    height: '100%',
    borderRadius: 999,
  },
});
