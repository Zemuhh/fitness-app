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
import {
  Activity,
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  CreditCard,
  Droplets,
  Flame,
  MessageSquareQuote,
  Phone,
  PlusCircle,
  Save,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import {
  BodyHeatmapCard,
  BodyZonesRecord,
  EnrichedTrainerMemberFields,
  MemberDailyWellness,
  getEnergyStatusDisplay,
} from '@/components/BodyHeatmapCard';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  BodyMetric,
  BodyMetricCreateRequest,
  MemberMetricsSummary,
  TrainerMemberCrm,
  UserOut,
} from '@/types/fitness';
import { MemberAvatar } from '@/screens/member/MemberAvatar';
import { formatTurkishDateLabel, getTodayIso } from '@/utils/dateHelpers';

interface Props {
  visible: boolean;
  member: TrainerMemberCrm | null;
  onClose: () => void;
  onMemberMutated: () => Promise<void>;
  onZonesMutated?: (memberId: number, zones: BodyZonesRecord) => void;
  onShowBanner?: (type: 'success' | 'error', text: string) => void;
}

function parseSafeDecimal(raw: string): number {
  const normalized = (raw || '').trim().replace(/,/g, '.');
  if (!normalized) return NaN;
  return Number(normalized);
}

export function TrainerMemberCrmModal({
  visible,
  member,
  onClose,
  onMemberMutated,
  onZonesMutated,
  onShowBanner,
}: Props) {
  const { triggerGlobalRefresh, reloadUsers } = useAuthDemo();

  const [notesDraft, setNotesDraft] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState<boolean>(false);

  const [weightInput, setWeightInput] = useState<string>('');
  const [fatInput, setFatInput] = useState<string>('');
  const [muscleInput, setMuscleInput] = useState<string>('');
  const [metricDateInput, setMetricDateInput] = useState<string>(getTodayIso());
  const [commentInput, setCommentInput] = useState<string>('');
  const [savingMetric, setSavingMetric] = useState<boolean>(false);

  const [metricsSummary, setMetricsSummary] = useState<MemberMetricsSummary | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);

  const [wellness, setWellness] = useState<MemberDailyWellness | null>(null);
  const [loadingWellness, setLoadingWellness] = useState<boolean>(false);

  const [localFeedback, setLocalFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const pushFeedback = useCallback(
    (type: 'success' | 'error', text: string) => {
      setLocalFeedback({ type, text });
      onShowBanner?.(type, text);
      setTimeout(() => {
        setLocalFeedback((prev) => (prev?.text === text ? null : prev));
      }, 3600);
    },
    [onShowBanner]
  );

  const fetchMetrics = useCallback(async (memberId: number) => {
    setLoadingMetrics(true);
    try {
      const res = await apiRequest<MemberMetricsSummary>(`/member/${memberId}/metrics`);
      setMetricsSummary(res);
    } catch {
      // Hata durumunda sessizce boş özet bırak
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  const fetchWellness = useCallback(async (memberId: number) => {
    setLoadingWellness(true);
    try {
      const res = await apiRequest<MemberDailyWellness>(`/wellness/${memberId}/today`);
      setWellness(res);
    } catch {
      // Yedek olarak üye nesnesindeki alanları kullan
    } finally {
      setLoadingWellness(false);
    }
  }, []);

  useEffect(() => {
    if (visible && member) {
      setNotesDraft(member.notes || '');
      setWeightInput('');
      setFatInput('');
      setMuscleInput('');
      setMetricDateInput(getTodayIso());
      setCommentInput('');
      setLocalFeedback(null);
      setWellness(null);
      fetchMetrics(member.id);
      fetchWellness(member.id);
    } else if (!visible) {
      setMetricsSummary(null);
      setWellness(null);
      setLocalFeedback(null);
    }
  }, [visible, member?.id, fetchMetrics, fetchWellness]);

  if (!member) return null;

  const enrichedMember = member as TrainerMemberCrm & EnrichedTrainerMemberFields;
  const isLowCredit = member.low_credit_warning || member.remaining_credits <= 2;

  const waterMl = wellness?.water_ml ?? enrichedMember.today_water_ml ?? 0;
  const waterGoalMl = wellness?.water_goal_ml ?? enrichedMember.water_goal_ml ?? 3000;
  const waterPct =
    waterGoalMl > 0
      ? Math.min(100, Math.max(0, Math.round((waterMl / waterGoalMl) * 100)))
      : 0;

  const proteinG = wellness?.protein_g ?? enrichedMember.today_protein_g ?? 0;
  const proteinGoalG = wellness?.protein_goal_g ?? enrichedMember.protein_goal_g ?? 140;
  const proteinPct =
    proteinGoalG > 0
      ? Math.min(100, Math.max(0, Math.round((proteinG / proteinGoalG) * 100)))
      : 0;

  const energyRaw =
    wellness?.energy_status ?? enrichedMember.today_energy_status ?? 'normal';
  const energyMeta = getEnergyStatusDisplay(energyRaw);
  const sleepHours = wellness?.sleep_hours ?? null;

  const handlePrefillFromLatest = () => {
    const latest = metricsSummary?.latest || member.latest_metric;
    if (!latest) return;
    setWeightInput(String(latest.weight_kg));
    setFatInput(String(latest.body_fat_pct));
    setMuscleInput(String(latest.muscle_mass_kg));
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiRequest<UserOut>(`/trainer/member/${member.id}/notes`, {
        method: 'PUT',
        body: JSON.stringify({
          member_id: member.id,
          notes: notesDraft.trim(),
        }),
      });
      await onMemberMutated();
      await reloadUsers();
      triggerGlobalRefresh();
      pushFeedback('success', `${member.full_name} için sakatlık / özel not kaydedildi.`);
    } catch (err: any) {
      pushFeedback('error', err?.message || 'Not kaydedilemedi.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddMetric = async () => {
    const wVal = parseSafeDecimal(weightInput);
    const fVal = parseSafeDecimal(fatInput);
    const mVal = parseSafeDecimal(muscleInput);

    if (Number.isNaN(wVal) || wVal <= 20 || wVal >= 300) {
      pushFeedback('error', 'Lütfen geçerli bir Kilo (kg) değeri girin (21 - 299 kg).');
      return;
    }
    if (Number.isNaN(fVal) || fVal <= 2 || fVal >= 65) {
      pushFeedback('error', 'Lütfen geçerli bir Yağ Oranı (%) girin (%3 - %64).');
      return;
    }
    if (Number.isNaN(mVal) || mVal <= 10 || mVal >= 150) {
      pushFeedback('error', 'Lütfen geçerli bir Kas Kütlesi (kg) girin (11 - 149 kg).');
      return;
    }

    const cleanDate = metricDateInput.trim() || getTodayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      pushFeedback('error', 'Ölçüm tarihi YYYY-MM-DD formatında olmalıdır.');
      return;
    }

    setSavingMetric(true);
    try {
      const payload: BodyMetricCreateRequest = {
        member_id: member.id,
        date: cleanDate,
        weight_kg: Math.round(wVal * 100) / 100,
        body_fat_pct: Math.round(fVal * 100) / 100,
        muscle_mass_kg: Math.round(mVal * 100) / 100,
        trainer_comment: commentInput.trim(),
      };

      await apiRequest<BodyMetric>('/trainer/metrics', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setWeightInput('');
      setFatInput('');
      setMuscleInput('');
      setCommentInput('');
      setMetricDateInput(getTodayIso());

      await fetchMetrics(member.id);
      await onMemberMutated();
      await reloadUsers();
      triggerGlobalRefresh();

      pushFeedback(
        'success',
        `${member.full_name} için yeni InBody ölçümü kaydedildi ve üye paneline yansıtıldı!`
      );
    } catch (err: any) {
      pushFeedback('error', err?.message || 'Vücut ölçümü kaydedilemedi.');
    } finally {
      setSavingMetric(false);
    }
  };

  const reversedMetrics = metricsSummary?.metrics
    ? [...metricsSummary.metrics].reverse()
    : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* Üst Sabit Başlık */}
          <View style={styles.topHeader}>
            <View style={styles.topHeaderLeft}>
              <MemberAvatar
                uri={member.avatar_url}
                name={member.full_name}
                size={48}
                borderRadius={16}
                accentColor={isLowCredit ? COLORS.warning : COLORS.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.memberTitle} numberOfLines={1}>
                  {member.full_name}
                </Text>
                <View style={styles.contactRow}>
                  <Phone size={11} color={COLORS.textMuted} />
                  <Text style={styles.memberContactSub} numberOfLines={1}>
                    {member.phone}
                    {member.instagram_handle ? ` • ${member.instagram_handle}` : ''}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {localFeedback && (
            <View
              style={[
                styles.feedbackBanner,
                localFeedback.type === 'success'
                  ? styles.feedbackSuccess
                  : styles.feedbackError,
              ]}
            >
              <Text
                style={[
                  styles.feedbackText,
                  {
                    color:
                      localFeedback.type === 'success'
                        ? COLORS.primary
                        : COLORS.dangerText,
                  },
                ]}
              >
                {localFeedback.text}
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Üye Paket & Seri Özeti Kartı */}
            <View style={styles.sectionCard}>
              <View style={styles.statsStrip}>
                <View
                  style={[
                    styles.statMiniCard,
                    isLowCredit && styles.statMiniCardWarn,
                  ]}
                >
                  <View style={styles.statMiniTop}>
                    <CreditCard
                      size={13}
                      color={isLowCredit ? COLORS.warningText : COLORS.primary}
                    />
                    <Text style={styles.statMiniLabel}>Kalan Kredi</Text>
                  </View>
                  <Text
                    style={[
                      styles.statMiniValue,
                      { color: isLowCredit ? COLORS.warningText : COLORS.primary },
                    ]}
                  >
                    {member.remaining_credits}/{member.total_credits || '-'} Ders
                  </Text>
                  <Text style={styles.statMiniCaption} numberOfLines={1}>
                    {member.package_name || 'Aktif Paket Yok'}
                  </Text>
                </View>

                <View style={styles.statMiniCard}>
                  <View style={styles.statMiniTop}>
                    <Flame size={13} color={COLORS.primary} />
                    <Text style={styles.statMiniLabel}>Seri & Katılım</Text>
                  </View>
                  <Text style={styles.statMiniValue}>{member.streak_days} Haftalık Seri</Text>
                  <Text style={styles.statMiniCaption}>
                    {metricsSummary?.completed_sessions_count ?? member.attended_sessions_count}{' '}
                    Tamamlanan Ders
                  </Text>
                </View>
              </View>
            </View>

            {/* GÜNLÜK SU, PROTEİN & ENERJİ / UYKU DURUMU KARTI */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.iconBadge, { backgroundColor: '#E0F2FE' }]}>
                  <Droplets size={16} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Günlük Su, Protein & Enerji Durumu</Text>
                  <Text style={styles.sectionSub}>
                    Üyenin bugünkü beslenme ve toparlanma verisi
                  </Text>
                </View>
                {loadingWellness ? (
                  <ActivityIndicator size="small" color={COLORS.secondary} />
                ) : (
                  <View
                    style={[
                      styles.energyStatusChip,
                      {
                        backgroundColor: energyMeta.bg,
                        borderColor: energyMeta.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.energyStatusChipText, { color: energyMeta.color }]}
                    >
                      {energyMeta.label}
                    </Text>
                  </View>
                )}
              </View>

              {energyMeta.key === 'low' && (
                <View style={styles.lowEnergyWarningBox}>
                  <Zap size={14} color="#B91C1C" />
                  <Text style={styles.lowEnergyWarningText}>
                    ⚡ Bugün Enerjisi/Uykusu Düşük - Tempolu Yüklenme
                    {sleepHours !== null ? ` (${sleepHours} sa uyku)` : ''}
                  </Text>
                </View>
              )}

              {/* Su Hedefi İlerleme Çubuğu */}
              <View style={styles.wellnessBarGroup}>
                <View style={styles.wellnessBarHeader}>
                  <Text style={styles.wellnessBarLabel}>💧 Su Hedefi Tamamlama</Text>
                  <Text style={[styles.wellnessBarValue, { color: '#0284C7' }]}>
                    %{waterPct} • {waterMl} / {waterGoalMl} ml
                  </Text>
                </View>
                <View style={[styles.wellnessTrack, { backgroundColor: '#E0F2FE' }]}>
                  <View
                    style={[
                      styles.wellnessFill,
                      {
                        width: `${waterPct}%`,
                        backgroundColor: '#0EA5E9',
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Protein Hedefi İlerleme Çubuğu */}
              <View style={styles.wellnessBarGroup}>
                <View style={styles.wellnessBarHeader}>
                  <Text style={styles.wellnessBarLabel}>🥩 Protein Hedefi Tamamlama</Text>
                  <Text style={[styles.wellnessBarValue, { color: '#047857' }]}>
                    %{proteinPct} • {proteinG} / {proteinGoalG} g
                  </Text>
                </View>
                <View style={[styles.wellnessTrack, { backgroundColor: '#D1FAE5' }]}>
                  <View
                    style={[
                      styles.wellnessFill,
                      {
                        width: `${proteinPct}%`,
                        backgroundColor: '#10B981',
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* İNTERAKTİF VÜCUT & SAKATLIK BÖLGE HARİTASI */}
            <BodyHeatmapCard
              userId={member.id}
              userName={member.full_name}
              initialZones={enrichedMember.body_zones}
              title="İnteraktif Vücut & Sakatlık Haritası"
              subtitle="Eğitmen olarak bölgeye dokunup sağlam, hassasiyet veya sakatlık durumunu güncelleyin"
              compact
              onZonesSaved={async (updatedZones) => {
                onZonesMutated?.(member.id, updatedZones);
                await onMemberMutated();
                triggerGlobalRefresh();
              }}
            />

            {/* 1. BÖLÜM: SAKATLIK & ÖZEL ANTRENMAN NOTU */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.iconBadge, { backgroundColor: COLORS.warningBg }]}>
                  <AlertTriangle size={16} color={COLORS.warningText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Sakatlık & Özel Antrenman Notu</Text>
                  <Text style={styles.sectionSub}>
                    Yoklama ekranında kehribar uyarı kutusu olarak gösterilir
                  </Text>
                </View>
              </View>

              <TextInput
                style={styles.notesTextArea}
                value={notesDraft}
                onChangeText={setNotesDraft}
                placeholder="Bel/boyun fıtığı, eklem hassasiyeti, postür bulguları veya özel antrenman programı notu..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={styles.amberSaveBtn}
                onPress={handleSaveNotes}
                disabled={savingNotes}
                activeOpacity={0.85}
              >
                {savingNotes ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Save size={15} color={COLORS.white} />
                    <Text style={styles.amberSaveBtnText}>Sakatlık Notunu Kaydet</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* 2. BÖLÜM: YENİ VÜCUT ÖLÇÜMÜ (INBODY) EKLE */}
            <View style={[styles.sectionCard, styles.metricFormCard]}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.iconBadge, { backgroundColor: COLORS.primaryLight }]}>
                  <PlusCircle size={16} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Yeni InBody Vücut Ölçümü Ekle</Text>
                  <Text style={styles.sectionSub}>
                    Üyenin &quot;Vücut Analizim&quot; ekranına anında canlı yansır
                  </Text>
                </View>

                {(metricsSummary?.latest || member.latest_metric) && (
                  <TouchableOpacity
                    style={styles.prefillChip}
                    onPress={handlePrefillFromLatest}
                    activeOpacity={0.8}
                  >
                    <Sparkles size={11} color={COLORS.primary} />
                    <Text style={styles.prefillChipText}>Son Değerler</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 3'lü Ölçüm Input Satırı */}
              <View style={styles.tripleInputsRow}>
                <View style={styles.metricInputCol}>
                  <Text style={styles.inputLabel}>Kilo (kg)</Text>
                  <TextInput
                    style={styles.metricNumericInput}
                    value={weightInput}
                    onChangeText={setWeightInput}
                    placeholder={
                      member.latest_metric ? String(member.latest_metric.weight_kg) : '76.5'
                    }
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.metricInputCol}>
                  <Text style={styles.inputLabel}>Yağ (%)</Text>
                  <TextInput
                    style={styles.metricNumericInput}
                    value={fatInput}
                    onChangeText={setFatInput}
                    placeholder={
                      member.latest_metric
                        ? String(member.latest_metric.body_fat_pct)
                        : '18.4'
                    }
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.metricInputCol}>
                  <Text style={styles.inputLabel}>Kas (kg)</Text>
                  <TextInput
                    style={styles.metricNumericInput}
                    value={muscleInput}
                    onChangeText={setMuscleInput}
                    placeholder={
                      member.latest_metric
                        ? String(member.latest_metric.muscle_mass_kg)
                        : '34.2'
                    }
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Ölçüm Tarihi */}
              <View style={styles.dateInputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Ölçüm Tarihi (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.singleLineInput}
                    value={metricDateInput}
                    onChangeText={setMetricDateInput}
                    placeholder={getTodayIso()}
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <TouchableOpacity
                  style={styles.todayQuickBtn}
                  onPress={() => setMetricDateInput(getTodayIso())}
                  activeOpacity={0.82}
                >
                  <Calendar size={13} color={COLORS.secondary} />
                  <Text style={styles.todayQuickBtnText}>Bugün</Text>
                </TouchableOpacity>
              </View>

              {/* Eğitmen Yorumu / Tavsiyesi */}
              <View>
                <Text style={styles.inputLabel}>Eğitmen Yorumu & Tavsiyesi</Text>
                <TextInput
                  style={styles.commentInput}
                  value={commentInput}
                  onChangeText={setCommentInput}
                  placeholder="Örn: Kas kütlesinde +0.6 kg artış harika! Günlük protein alımını koruyup haftada 3 fonksiyonel derse devam edelim."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={styles.emeraldSubmitBtn}
                onPress={handleAddMetric}
                disabled={savingMetric}
                activeOpacity={0.85}
              >
                {savingMetric ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <CheckCircle2 size={16} color={COLORS.white} />
                    <Text style={styles.emeraldSubmitBtnText}>
                      Ölçümü Kaydet ve Üyeye Yayınla
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* 3. BÖLÜM: ÖLÇÜM GEÇMİŞİ & DEĞİŞİM ANALİZİ */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.iconBadge, { backgroundColor: COLORS.secondaryLight }]}>
                  <Activity size={16} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    InBody Ölçüm Geçmişi ({reversedMetrics.length})
                  </Text>
                  <Text style={styles.sectionSub}>
                    Önceki ölçüme göre net vücut kompozisyonu farkları
                  </Text>
                </View>
              </View>

              {loadingMetrics ? (
                <View style={styles.metricsLoaderWrap}>
                  <ActivityIndicator size="small" color={COLORS.secondary} />
                  <Text style={styles.metricsLoaderText}>Ölçüm geçmişi yükleniyor...</Text>
                </View>
              ) : reversedMetrics.length === 0 ? (
                <Text style={styles.emptyHistoryText}>
                  Bu üye için henüz kayıtlı bir vücut ölçümü bulunmuyor.
                </Text>
              ) : (
                <>
                  {/* Son İki Ölçüm Arası Fark Rozetleri */}
                  {metricsSummary && metricsSummary.previous && (
                    <View style={styles.diffStripRow}>
                      <View style={styles.diffChip}>
                        <Scale size={12} color={COLORS.textSecondary} />
                        <Text style={styles.diffChipLabel}>Kilo:</Text>
                        <Text
                          style={[
                            styles.diffChipVal,
                            {
                              color:
                                metricsSummary.weight_diff_kg <= 0
                                  ? COLORS.primary
                                  : COLORS.warningText,
                            },
                          ]}
                        >
                          {metricsSummary.weight_diff_kg > 0 ? '+' : ''}
                          {metricsSummary.weight_diff_kg} kg
                        </Text>
                      </View>

                      <View style={styles.diffChip}>
                        {metricsSummary.body_fat_diff_pct <= 0 ? (
                          <TrendingDown size={12} color={COLORS.primary} />
                        ) : (
                          <TrendingUp size={12} color={COLORS.warningText} />
                        )}
                        <Text style={styles.diffChipLabel}>Yağ:</Text>
                        <Text
                          style={[
                            styles.diffChipVal,
                            {
                              color:
                                metricsSummary.body_fat_diff_pct <= 0
                                  ? COLORS.primary
                                  : COLORS.warningText,
                            },
                          ]}
                        >
                          {metricsSummary.body_fat_diff_pct > 0 ? '+' : ''}
                          %{metricsSummary.body_fat_diff_pct}
                        </Text>
                      </View>

                      <View style={styles.diffChip}>
                        <Award size={12} color={COLORS.primary} />
                        <Text style={styles.diffChipLabel}>Kas:</Text>
                        <Text
                          style={[
                            styles.diffChipVal,
                            {
                              color:
                                metricsSummary.muscle_mass_diff_kg >= 0
                                  ? COLORS.primary
                                  : COLORS.dangerText,
                            },
                          ]}
                        >
                          {metricsSummary.muscle_mass_diff_kg > 0 ? '+' : ''}
                          {metricsSummary.muscle_mass_diff_kg} kg
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Kronolojik Ölçüm Kartları */}
                  <View style={styles.historyListWrap}>
                    {reversedMetrics.map((m, idx) => {
                      const isLatest = idx === 0;
                      return (
                        <View
                          key={m.id}
                          style={[
                            styles.historyItemCard,
                            isLatest && styles.historyItemCardLatest,
                          ]}
                        >
                          <View style={styles.historyTopRow}>
                            <Text style={styles.historyDateText}>
                              {formatTurkishDateLabel(m.date).full} ({m.date})
                            </Text>
                            {isLatest && (
                              <View style={styles.latestBadge}>
                                <Text style={styles.latestBadgeText}>GÜNCEL</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.historyValuesRow}>
                            <View style={styles.historyValPill}>
                              <Text style={styles.historyValLabel}>Kilo</Text>
                              <Text style={styles.historyValNum}>{m.weight_kg} kg</Text>
                            </View>
                            <View style={styles.historyValPill}>
                              <Text style={styles.historyValLabel}>Yağ Oranı</Text>
                              <Text
                                style={[
                                  styles.historyValNum,
                                  { color: COLORS.warningText },
                                ]}
                              >
                                %{m.body_fat_pct}
                              </Text>
                            </View>
                            <View style={styles.historyValPill}>
                              <Text style={styles.historyValLabel}>Kas Kütlesi</Text>
                              <Text
                                style={[styles.historyValNum, { color: COLORS.primary }]}
                              >
                                {m.muscle_mass_kg} kg
                              </Text>
                            </View>
                          </View>

                          {Boolean(m.trainer_comment && m.trainer_comment.trim()) && (
                            <View style={styles.historyCommentBox}>
                              <MessageSquareQuote size={14} color={COLORS.secondary} />
                              <Text style={styles.historyCommentText}>
                                {m.trainer_comment}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(34, 29, 25, 0.36)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    overflow: 'hidden',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  memberTitle: {
    color: COLORS.textPrimary,
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  memberContactSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBanner: {
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  feedbackError: {
    backgroundColor: COLORS.dangerBg,
    borderColor: '#F0BFC3',
  },
  feedbackText: {
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
  },
  statsStrip: {
    flexDirection: 'row',
    gap: 10,
  },
  statMiniCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  statMiniCardWarn: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  statMiniTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statMiniLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  statMiniValue: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  statMiniCaption: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 13,
    ...CARD_SHADOW,
  },
  metricFormCard: {
    borderColor: '#E5CB90',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  prefillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#E5CB90',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  prefillChipText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  notesTextArea: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    padding: 13,
    minHeight: 86,
    lineHeight: 19,
  },
  amberSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.warningText,
    borderRadius: 14,
    paddingVertical: 12,
  },
  amberSaveBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  tripleInputsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  metricInputCol: {
    flex: 1,
    gap: 5,
  },
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricNumericInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
  },
  singleLineInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  todayQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 13,
  },
  todayQuickBtnText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  commentInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: 12,
    minHeight: 68,
    lineHeight: 18,
  },
  emeraldSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
  },
  emeraldSubmitBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  metricsLoaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  metricsLoaderText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  emptyHistoryText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    paddingVertical: 10,
  },
  diffStripRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  diffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  diffChipLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  diffChipVal: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  historyListWrap: {
    gap: 10,
  },
  historyItemCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 9,
  },
  historyItemCardLatest: {
    borderColor: '#E5CB90',
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyDateText: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  latestBadge: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#E5CB90',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  latestBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  historyValuesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  historyValPill: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyValLabel: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
  },
  historyValNum: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  historyCommentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    borderRadius: 12,
    padding: 10,
  },
  historyCommentText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  energyStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  energyStatusChipText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  lowEnergyWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  lowEnergyWarningText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  wellnessBarGroup: {
    gap: 6,
  },
  wellnessBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  wellnessBarLabel: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  wellnessBarValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  wellnessTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  wellnessFill: {
    height: '100%',
    borderRadius: 999,
  },
});
