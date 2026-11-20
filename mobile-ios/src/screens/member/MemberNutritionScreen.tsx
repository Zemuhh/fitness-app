import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  CheckCircle2,
  Droplets,
  Flame,
  Info,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import {
  AppUser,
  DailyWellness,
  EnergyStatus,
  MemberDrawerRoute,
  NutritionAnalyzeResponse,
} from '@/types/fitness';

export interface MemberNutritionScreenProps {
  member: AppUser;
  onNavigate?: (route: MemberDrawerRoute) => void;
  onShowBanner?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

const QUICK_MEAL_PRESETS: Array<{ label: string; text: string }> = [
  {
    label: '🍳 Menemen & Peynir Kahvaltı',
    text: '2 yumurtalı menemen, 100gr beyaz peynir ve 1 dilim tam buğday ekmeği',
  },
  {
    label: '🍗 Izgara Tavuk & Pilav',
    text: '200gr ızgara tavuk göğsü ve 1 tabak pirinç pilavı',
  },
  {
    label: '🥣 Yulaf, Muz & Whey Protein',
    text: 'Yulaf ezmesi, muz ve 1 ölçek protein',
  },
  {
    label: '🐟 Izgara Somon & Salata',
    text: 'Izgara somon ve bol yeşillikli salata',
  },
];

const ENERGY_OPTIONS: Array<{
  key: EnergyStatus;
  label: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
}> = [
  {
    key: 'high',
    label: '🔋 Enerjik',
    activeBg: '#ECFDF5',
    activeBorder: '#34D399',
    activeText: '#047857',
  },
  {
    key: 'normal',
    label: '⚡ Normal',
    activeBg: '#EFF6FF',
    activeBorder: '#60A5FA',
    activeText: '#1D4ED8',
  },
  {
    key: 'low',
    label: '🪫 Uykusuz / Yorgunum',
    activeBg: '#FFFBEB',
    activeBorder: '#F59E0B',
    activeText: '#B45309',
  },
];

function formatLitersValue(ml: number): string {
  const liters = Math.max(0, ml) / 1000;
  const rounded = Math.round(liters * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toFixed(1);
  const twoDec = rounded.toFixed(2);
  return twoDec.endsWith('0') ? rounded.toFixed(1) : twoDec;
}

function buildFallbackWellness(memberId: number): DailyWellness {
  return {
    member_id: memberId,
    date: new Date().toISOString().slice(0, 10),
    water_ml: 1500,
    water_goal_ml: 3000,
    sleep_hours: 7.5,
    energy_status: 'normal',
    calories_intake: 0,
    calories_goal: 2100,
    protein_g: 0,
    protein_goal_g: 140,
    carbs_g: 0,
    carbs_goal_g: 220,
    fat_g: 0,
    fat_goal_g: 65,
  };
}

function normalizeCoachNote(rawNote: string): string {
  const trimmed = (rawNote || '').trim();
  if (!trimmed) {
    return '💡 AI Koç Notu: Öğün makrolarınız günlük hedefinize başarıyla eklendi. Su tüketiminizi gün içine yaymayı unutmayın!';
  }
  if (trimmed.includes('AI Koç Notu')) {
    return trimmed.startsWith('💡') ? trimmed : `💡 ${trimmed}`;
  }
  return `💡 AI Koç Notu: ${trimmed}`;
}

export function MemberNutritionScreen({
  member,
  onShowBanner,
}: MemberNutritionScreenProps) {
  const { refreshSignal, triggerGlobalRefresh } = useAuthDemo();

  const [wellness, setWellness] = useState<DailyWellness>(() =>
    buildFallbackWellness(member.id)
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [addingWater, setAddingWater] = useState<boolean>(false);
  const [updatingEnergy, setUpdatingEnergy] = useState<boolean>(false);

  const [mealText, setMealText] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [lastAnalysis, setLastAnalysis] = useState<NutritionAnalyzeResponse | null>(
    null
  );
  const [recentMeals, setRecentMeals] = useState<NutritionAnalyzeResponse[]>([]);

  const fetchTodayWellness = useCallback(async () => {
    try {
      const res = await apiRequest<DailyWellness>(`/wellness/${member.id}/today`);
      if (res && typeof res.water_ml === 'number') {
        setWellness(res);
      }
    } catch {
      // İlk açılışta çevrimdışı olsa bile varsayılan veriyle kesintisiz çalışır
    } finally {
      setRefreshing(false);
    }
  }, [member.id]);

  useEffect(() => {
    fetchTodayWellness();
  }, [fetchTodayWellness, refreshSignal]);

  const handlePullRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTodayWellness();
  }, [fetchTodayWellness]);

  const handleAddWater = useCallback(async () => {
    if (addingWater) return;
    setAddingWater(true);

    // Anlık iyimser güncelleme (Optimistic UI)
    setWellness((prev) => ({
      ...prev,
      water_ml: prev.water_ml + 250,
    }));

    try {
      const updated = await apiRequest<DailyWellness>(
        `/wellness/${member.id}/water`,
        {
          method: 'POST',
          body: JSON.stringify({ amount_ml: 250 }),
        }
      );
      if (updated && typeof updated.water_ml === 'number') {
        setWellness(updated);
      }
      triggerGlobalRefresh();
    } catch (err: any) {
      onShowBanner?.(
        'error',
        err?.message || 'Su tüketimi kaydedilirken bağlantı hatası oluştu.'
      );
    } finally {
      setAddingWater(false);
    }
  }, [addingWater, member.id, onShowBanner, triggerGlobalRefresh]);

  const handleSelectEnergy = useCallback(
    async (nextStatus: EnergyStatus) => {
      if (updatingEnergy) return;
      setUpdatingEnergy(true);

      setWellness((prev) => ({
        ...prev,
        energy_status: nextStatus,
      }));

      try {
        const updated = await apiRequest<DailyWellness>(
          `/wellness/${member.id}/energy`,
          {
            method: 'POST',
            body: JSON.stringify({ energy_status: nextStatus }),
          }
        );
        if (updated && updated.energy_status) {
          setWellness(updated);
        }
        triggerGlobalRefresh();
      } catch (err: any) {
        onShowBanner?.(
          'error',
          err?.message || 'Enerji durumu güncellenemedi.'
        );
      } finally {
        setUpdatingEnergy(false);
      }
    },
    [member.id, onShowBanner, triggerGlobalRefresh, updatingEnergy]
  );

  const handleAnalyzeMeal = useCallback(async () => {
    const cleaned = mealText.trim();
    if (!cleaned) {
      onShowBanner?.('warning', 'Lütfen analiz edilecek öğünü yazın veya hızlı çiplerden birini seçin.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await apiRequest<NutritionAnalyzeResponse>('/nutrition/analyze', {
        method: 'POST',
        body: JSON.stringify({
          member_id: member.id,
          meal_text: cleaned,
        }),
      });

      if (res?.wellness) {
        setWellness(res.wellness);
      }
      setLastAnalysis(res);
      setRecentMeals((prev) => [res, ...prev.slice(0, 4)]);
      setMealText('');
      triggerGlobalRefresh();
      onShowBanner?.(
        'success',
        `+${res.added_calories} kcal ve +${res.added_protein_g}g protein günlük hedeflerinize eklendi!`
      );
    } catch (err: any) {
      onShowBanner?.(
        'error',
        err?.message || 'Öğün analizi sırasında sunucuya ulaşılamadı.'
      );
    } finally {
      setAnalyzing(false);
    }
  }, [mealText, member.id, onShowBanner, triggerGlobalRefresh]);

  // Su Halkası SVG Hesaplamaları
  const ringSize = 144;
  const strokeWidth = 12;
  const center = ringSize / 2;
  const radius = (ringSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const waterGoal = wellness.water_goal_ml > 0 ? wellness.water_goal_ml : 3000;
  const waterRatio = Math.max(0, Math.min(1, wellness.water_ml / waterGoal));
  const waterDashOffset = circumference * (1 - waterRatio);
  const waterPct = Math.min(100, Math.round((wellness.water_ml / waterGoal) * 100));
  const glassesCount = Math.round(wellness.water_ml / 250);
  const glassesGoal = Math.round(waterGoal / 250);

  const macroRows = useMemo(() => {
    const calGoal = wellness.calories_goal > 0 ? wellness.calories_goal : 2100;
    const proGoal = wellness.protein_goal_g > 0 ? wellness.protein_goal_g : 140;
    const carbGoal = wellness.carbs_goal_g > 0 ? wellness.carbs_goal_g : 220;
    const fatGoal = wellness.fat_goal_g > 0 ? wellness.fat_goal_g : 65;

    return [
      {
        key: 'calories',
        label: 'Günlük Kalori',
        current: wellness.calories_intake,
        goal: calGoal,
        unit: 'kcal',
        color: '#F59E0B',
        trackBg: '#FEF3C7',
        badgeBg: '#FFFBEB',
      },
      {
        key: 'protein',
        label: 'Protein (Kas Onarımı)',
        current: wellness.protein_g,
        goal: proGoal,
        unit: 'g',
        color: '#0D9488',
        trackBg: '#CCFBF1',
        badgeBg: '#F0FDFA',
      },
      {
        key: 'carbs',
        label: 'Karbonhidrat (Enerji)',
        current: wellness.carbs_g,
        goal: carbGoal,
        unit: 'g',
        color: '#4F46E5',
        trackBg: '#E0E7FF',
        badgeBg: '#EEF2FF',
      },
      {
        key: 'fat',
        label: 'Sağlıklı Yağ',
        current: wellness.fat_g,
        goal: fatGoal,
        unit: 'g',
        color: '#E11D48',
        trackBg: '#FFE4E6',
        badgeBg: '#FFF1F2',
      },
    ];
  }, [wellness]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* ÜST BAŞLIK KARTI */}
      <View style={styles.heroBanner}>
        <View style={styles.heroIconWrap}>
          <Sparkles size={20} color="#0D9488" />
        </View>
        <View style={styles.heroTextCol}>
          <Text style={styles.heroEyebrow}>AKILLI PERFORMANS ASİSTANI</Text>
          <Text style={styles.heroTitle}>🥗 AI Beslenme & Toparlanma Koçu</Text>
          <Text style={styles.heroSubtitle}>
            Su hedefinizi takip edin, enerji durumunuzu eğitmeninize bildirin ve
            tabağınızı yazarak saniyeler içinde makro analizi alın.
          </Text>
        </View>
      </View>

      {/* 1. İNTERAKTİF SU TÜKETİM HALKASI BENTO KARTI */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleGroup}>
            <View style={[styles.iconBadge, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }]}>
              <Droplets size={17} color="#0284C7" />
            </View>
            <View>
              <Text style={styles.sectionTitle}>Günlük Su Tüketim Halkası</Text>
              <Text style={styles.sectionSub}>
                {glassesCount} / {glassesGoal} bardak tamamlandı (%{waterPct})
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.waterBodyRow}>
          <TouchableOpacity
            style={styles.waterRingTouch}
            onPress={handleAddWater}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="+250 ml su ekle"
          >
            <Svg width={ringSize} height={ringSize}>
              <Defs>
                <LinearGradient id="waterAquaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#38BDF8" />
                  <Stop offset="100%" stopColor="#0D9488" />
                </LinearGradient>
              </Defs>

              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="#E0F2FE"
                strokeWidth={strokeWidth}
                fill="none"
              />

              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="url(#waterAquaGrad)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={waterDashOffset}
                transform={`rotate(-90 ${center} ${center})`}
                fill="none"
              />
            </Svg>

            <View style={styles.waterCenterText} pointerEvents="none">
              <Text style={styles.waterLitersMain}>
                {formatLitersValue(wellness.water_ml)}
              </Text>
              <Text style={styles.waterLitersGoal}>
                / {formatLitersValue(waterGoal)} L
              </Text>
              <Text style={styles.waterTapHint}>HİDRASYON</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.waterActionCol}>
            <Text style={styles.waterInfoTitle}>
              {formatLitersValue(wellness.water_ml)} / {formatLitersValue(waterGoal)} L
            </Text>
            <Text style={styles.waterInfoDesc}>
              Kas esnekliği ve seans sonrası hızlı toparlanma için tek dokunuşla 1
              bardak (+250 ml) su ekleyin.
            </Text>

            <TouchableOpacity
              style={[styles.addWaterBtn, addingWater && { opacity: 0.75 }]}
              onPress={handleAddWater}
              disabled={addingWater}
              activeOpacity={0.84}
              accessibilityRole="button"
            >
              <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={styles.addWaterBtnText}>💧 +250 ml Su Ekle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 2. BUGÜN NASIL HİSSEDİYORSUN? ENERJİ & UYKU SEÇİCİSİ */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Bugün Nasıl Hissediyorsun?</Text>
        <Text style={styles.sectionSub}>
          Seçiminiz bugünkü ders öncesinde eğitmeninizin ekranına canlı yansır.
        </Text>

        <View style={styles.energyChoicesCol}>
          {ENERGY_OPTIONS.map((opt) => {
            const isSelected = wellness.energy_status === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.energyOptionBtn,
                  isSelected && {
                    backgroundColor: opt.activeBg,
                    borderColor: opt.activeBorder,
                  },
                ]}
                onPress={() => handleSelectEnergy(opt.key)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.energyOptionLabel,
                    isSelected && { color: opt.activeText, fontWeight: '800' },
                  ]}
                >
                  {opt.label}
                </Text>
                {isSelected && (
                  <CheckCircle2 size={17} color={opt.activeText} strokeWidth={2.2} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {wellness.energy_status === 'low' && (
          <View style={styles.lowEnergyTrainerNote}>
            <Info size={16} color="#B45309" style={{ marginTop: 1 }} />
            <Text style={styles.lowEnergyTrainerNoteText}>
              Eğitmen ekranına otomatik bilgi iletildi: Bugün uykusuz / yorgun
              hissettiğiniz yoklama listenizde eğitmeninize görünür ve antrenman
              temponuz kontrollü tutulur.
            </Text>
          </View>
        )}
      </View>

      {/* 3. GÜNLÜK KALORİ & MAKRO İLERLEME ÇUBUKLARI */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleGroup}>
            <View style={[styles.iconBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Flame size={17} color="#D97706" />
            </View>
            <View>
              <Text style={styles.sectionTitle}>Günlük Kalori & Makro Dengesi</Text>
              <Text style={styles.sectionSub}>
                AI ile eklediğiniz öğünler anında hedeflerinize işlenir
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.macroList}>
          {macroRows.map((m) => {
            const pct = Math.min(100, Math.round((m.current / m.goal) * 100));
            return (
              <View key={m.key} style={styles.macroItem}>
                <View style={styles.macroHeaderRow}>
                  <Text style={styles.macroLabel}>{m.label}</Text>
                  <View style={[styles.macroValuePill, { backgroundColor: m.badgeBg }]}>
                    <Text style={[styles.macroValueText, { color: m.color }]}>
                      {m.current} / {m.goal} {m.unit} (%{pct})
                    </Text>
                  </View>
                </View>

                <View style={[styles.macroTrack, { backgroundColor: m.trackBg }]}>
                  <View
                    style={[
                      styles.macroFill,
                      {
                        width: `${Math.max(m.current > 0 ? 5 : 0, pct)}%`,
                        backgroundColor: m.color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* 4. TABAĞINI YAZ VEYA HIZLI SEÇ (AI KALORİ HESAPLAYICI) */}
      <View style={styles.aiCalculatorCard}>
        <View style={styles.aiHeaderRow}>
          <Sparkles size={18} color="#4F46E5" />
          <Text style={styles.aiCardTitle}>
            Tabağını Yaz veya Hızlı Seç (AI Kalori Hesaplayıcı)
          </Text>
        </View>

        <Text style={styles.aiHelperText}>
          Yediğiniz öğünü doğal dille yazın veya aşağıdaki hazır öğün çiplerinden
          birine dokunun:
        </Text>

        {/* Hızlı Seçim Çipleri */}
        <View style={styles.chipsWrap}>
          {QUICK_MEAL_PRESETS.map((preset) => {
            const isPicked = mealText.trim() === preset.text;
            return (
              <TouchableOpacity
                key={preset.text}
                style={[styles.presetChip, isPicked && styles.presetChipActive]}
                onPress={() => setMealText(preset.text)}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.presetChipText,
                    isPicked && styles.presetChipTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Doğal Dil Metin Kutusu */}
        <TextInput
          style={styles.mealInput}
          value={mealText}
          onChangeText={setMealText}
          placeholder="Örn: 200gr ızgara tavuk göğsü ve 1 tabak pirinç pilavı..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* AI Analiz Butonu */}
        <TouchableOpacity
          style={[
            styles.analyzeBtn,
            (analyzing || !mealText.trim()) && styles.analyzeBtnDisabled,
          ]}
          onPress={handleAnalyzeMeal}
          disabled={analyzing}
          activeOpacity={0.86}
          accessibilityRole="button"
        >
          {analyzing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.analyzeBtnText}>
              🤖 AI ile Analiz Et & Günlüğüme Ekle
            </Text>
          )}
        </TouchableOpacity>

        {/* Analiz Sonucu & 💡 AI Koç Notu Kartı */}
        {lastAnalysis && (
          <View style={styles.analysisResultWrap}>
            <View style={styles.addedMacrosHeader}>
              <Text style={styles.addedMealTitle} numberOfLines={2}>
                ✅ Eklenen Öğün: “{lastAnalysis.meal_text}”
              </Text>

              <View style={styles.addedBadgesRow}>
                <View style={[styles.addedMacroPill, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.addedMacroPillText, { color: '#B45309' }]}>
                    +{lastAnalysis.added_calories} kcal
                  </Text>
                </View>
                <View style={[styles.addedMacroPill, { backgroundColor: '#CCFBF1' }]}>
                  <Text style={[styles.addedMacroPillText, { color: '#0F766E' }]}>
                    +{lastAnalysis.added_protein_g}g Protein
                  </Text>
                </View>
                <View style={[styles.addedMacroPill, { backgroundColor: '#E0E7FF' }]}>
                  <Text style={[styles.addedMacroPillText, { color: '#4338CA' }]}>
                    +{lastAnalysis.added_carbs_g}g Karb
                  </Text>
                </View>
                <View style={[styles.addedMacroPill, { backgroundColor: '#FFE4E6' }]}>
                  <Text style={[styles.addedMacroPillText, { color: '#BE123C' }]}>
                    +{lastAnalysis.added_fat_g}g Yağ
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.coachNoteBox}>
              <Text style={styles.coachNoteText}>
                {normalizeCoachNote(lastAnalysis.coach_note)}
              </Text>
            </View>
          </View>
        )}

        {/* Oturum İçi Son Eklenen Öğün Geçmişi */}
        {recentMeals.length > 1 && (
          <View style={styles.recentMealsBox}>
            <Text style={styles.recentMealsTitle}>Bugün Eklenen Son Öğünler</Text>
            {recentMeals.slice(1).map((item, idx) => (
              <View key={`${item.meal_text}-${idx}`} style={styles.recentMealRow}>
                <Text style={styles.recentMealName} numberOfLines={1}>
                  • {item.meal_text}
                </Text>
                <Text style={styles.recentMealMeta}>
                  +{item.added_calories} kcal · +{item.added_protein_g}g P
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
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
    gap: 16,
  },
  heroBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    ...CARD_SHADOW,
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontFamily: FONTS.sans,
    color: '#0D9488',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  heroTitle: {
    fontFamily: FONTS.serif,
    color: '#064E3B',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 25,
  },
  heroSubtitle: {
    fontFamily: FONTS.sans,
    color: '#0F766E',
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '700',
  },
  sectionSub: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  waterBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  waterRingTouch: {
    width: 144,
    height: 144,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterCenterText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterLitersMain: {
    fontFamily: FONTS.serif,
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 31,
  },
  waterLitersGoal: {
    fontFamily: FONTS.sans,
    color: '#0284C7',
    fontSize: 12.5,
    fontWeight: '800',
  },
  waterTapHint: {
    fontFamily: FONTS.sans,
    color: '#0D9488',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 3,
  },
  waterActionCol: {
    flex: 1,
    gap: 8,
  },
  waterInfoTitle: {
    fontFamily: FONTS.sans,
    color: '#0284C7',
    fontSize: 16,
    fontWeight: '800',
  },
  waterInfoDesc: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17.5,
    fontWeight: '500',
  },
  addWaterBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addWaterBtnText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  energyChoicesCol: {
    gap: 9,
  },
  energyOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  energyOptionLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  lowEnergyTrainerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
  },
  lowEnergyTrainerNoteText: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17.5,
  },
  macroList: {
    gap: 13,
  },
  macroItem: {
    gap: 6,
  },
  macroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  macroLabel: {
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  macroValuePill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  macroValueText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '800',
  },
  macroTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 999,
  },
  aiCalculatorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    gap: 13,
    ...CARD_SHADOW,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiCardTitle: {
    flex: 1,
    fontFamily: FONTS.serif,
    color: '#1E1B4B',
    fontSize: 18.5,
    fontWeight: '700',
    lineHeight: 23,
  },
  aiHelperText: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
  },
  presetChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4338CA',
  },
  presetChipText: {
    fontFamily: FONTS.sans,
    color: '#3730A3',
    fontSize: 12,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  mealInput: {
    minHeight: 84,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  analyzeBtn: {
    minHeight: 50,
    backgroundColor: '#4F46E5',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  analyzeBtnDisabled: {
    opacity: 0.72,
  },
  analyzeBtnText: {
    fontFamily: FONTS.sans,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  analysisResultWrap: {
    marginTop: 4,
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  addedMacrosHeader: {
    gap: 9,
  },
  addedMealTitle: {
    fontFamily: FONTS.sans,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  addedBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  addedMacroPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  addedMacroPillText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '800',
  },
  coachNoteBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 14,
    padding: 13,
  },
  coachNoteText: {
    fontFamily: FONTS.sans,
    color: '#065F46',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  recentMealsBox: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    gap: 6,
  },
  recentMealsTitle: {
    fontFamily: FONTS.sans,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  recentMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recentMealName: {
    flex: 1,
    fontFamily: FONTS.sans,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  recentMealMeta: {
    fontFamily: FONTS.sans,
    color: '#4F46E5',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
