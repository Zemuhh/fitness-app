import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react-native';
import { CARD_SHADOW, COLORS, FONTS } from '@/theme/colors';
import {
  FoodVisionAnalyzeResponse,
  FoodVisionItem,
  NutritionLogMealRequest,
} from '@/types/fitness';

export type PortionMultiplier = 0.5 | 1 | 1.5;

const PORTION_OPTIONS: Array<{
  value: PortionMultiplier;
  label: string;
  shortLabel: string;
}> = [
  { value: 0.5, label: '0.5x Yarım', shortLabel: 'Yarım' },
  { value: 1, label: '1x Normal', shortLabel: 'Normal' },
  { value: 1.5, label: '1.5x Büyük', shortLabel: 'Büyük' },
];

const MEAL_TYPES = ['Kahvaltı', 'Öğle', 'Akşam', 'Ara Öğün'] as const;

export interface FoodVisionResultModalProps {
  visible: boolean;
  memberId: number;
  photoUri: string | null;
  photoThumbnail?: string | null;
  defaultMealType?: string;
  analysis: FoodVisionAnalyzeResponse | null;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onConfirm: (payload: NutritionLogMealRequest) => Promise<void> | void;
}

interface EditableVisionItem extends FoodVisionItem {
  _uid: string;
}

function roundOneDecimal(val: number): number {
  const safe = Number.isFinite(val) ? Math.max(0, val) : 0;
  return Math.round(safe * 10) / 10;
}

function formatCalorieNumber(val: number): string {
  const n = Math.round(Number.isFinite(val) ? Math.max(0, val) : 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatGram(val: number): string {
  const rounded = roundOneDecimal(val);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function FoodVisionResultModal({
  visible,
  memberId,
  photoUri,
  photoThumbnail,
  defaultMealType = 'Öğle',
  analysis,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: FoodVisionResultModalProps) {
  const [portionMultiplier, setPortionMultiplier] =
    useState<PortionMultiplier>(1);
  const [selectedMealType, setSelectedMealType] =
    useState<string>(defaultMealType);
  const [editableItems, setEditableItems] = useState<EditableVisionItem[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible || !analysis) return;
    setPortionMultiplier(1);
    setSelectedMealType(defaultMealType || 'Öğle');
    const sourceItems = Array.isArray(analysis.items) ? analysis.items : [];
    setEditableItems(
      sourceItems.map((item, idx) => ({
        name: item.name || `Yiyecek ${idx + 1}`,
        estimated_grams: Number(item.estimated_grams || 0),
        calories: Number(item.calories || 0),
        protein_g: Number(item.protein_g || 0),
        carbs_g: Number(item.carbs_g || 0),
        fat_g: Number(item.fat_g || 0),
        _uid: `${idx}-${item.name || 'item'}`,
      }))
    );
    setRemovedIds([]);
  }, [analysis, defaultMealType, visible]);

  const activeItems = useMemo(
    () => editableItems.filter((item) => !removedIds.includes(item._uid)),
    [editableItems, removedIds]
  );

  const scaledItems: Array<EditableVisionItem & { scaled: FoodVisionItem }> =
    useMemo(() => {
      return activeItems.map((item) => ({
        ...item,
        scaled: {
          name: item.name,
          estimated_grams: Math.round(item.estimated_grams * portionMultiplier),
          calories: Math.round(item.calories * portionMultiplier),
          protein_g: roundOneDecimal(item.protein_g * portionMultiplier),
          carbs_g: roundOneDecimal(item.carbs_g * portionMultiplier),
          fat_g: roundOneDecimal(item.fat_g * portionMultiplier),
        },
      }));
    }, [activeItems, portionMultiplier]);

  const totals = useMemo(() => {
    // Eğer backend boş items döndürdüyse (uç durum) toplamları çarpanla ölçekle
    if (editableItems.length === 0 && analysis) {
      return {
        calories: Math.round(
          Number(analysis.total_calories || 0) * portionMultiplier
        ),
        protein_g: roundOneDecimal(
          Number(analysis.total_protein_g || 0) * portionMultiplier
        ),
        carbs_g: roundOneDecimal(
          Number(analysis.total_carbs_g || 0) * portionMultiplier
        ),
        fat_g: roundOneDecimal(
          Number(analysis.total_fat_g || 0) * portionMultiplier
        ),
      };
    }

    return scaledItems.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.scaled.calories,
        protein_g: roundOneDecimal(acc.protein_g + entry.scaled.protein_g),
        carbs_g: roundOneDecimal(acc.carbs_g + entry.scaled.carbs_g),
        fat_g: roundOneDecimal(acc.fat_g + entry.scaled.fat_g),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [analysis, editableItems.length, portionMultiplier, scaledItems]);

  const hasRemovedAny = removedIds.length > 0;
  const canConfirm =
    Boolean(analysis) &&
    (editableItems.length === 0 || activeItems.length > 0) &&
    !submitting;

  const confidencePct = Math.max(
    0,
    Math.min(100, Math.round(Number(analysis?.confidence || 0)))
  );

  const handleRemoveItem = (uid: string) => {
    setRemovedIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
  };

  const handleRestoreAll = () => {
    setRemovedIds([]);
  };

  const handleConfirmPress = () => {
    if (!analysis || !canConfirm) return;
    const payload: NutritionLogMealRequest = {
      member_id: memberId,
      meal_name: analysis.meal_name || 'Fotoğraflı öğün',
      meal_type: selectedMealType,
      portion_multiplier: portionMultiplier,
      total_calories: totals.calories,
      total_protein_g: totals.protein_g,
      total_carbs_g: totals.carbs_g,
      total_fat_g: totals.fat_g,
      coach_tip: analysis.coach_tip || '',
      items: scaledItems.map((entry) => entry.scaled),
      photo_thumbnail: photoThumbnail ?? null,
      source: 'photo',
    };
    onConfirm(payload);
  };

  if (!analysis) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!submitting) onClose();
      }}
    >
      <SafeAreaView style={styles.safeRoot} edges={['top', 'bottom']}>
        {/* Üst Başlık Çubuğu */}
        <View style={styles.headerBar}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.headerEyebrow}>AI BESİN ANALİZİ</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Öğünü İncele ve Onayla
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            disabled={submitting}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Analiz penceresini kapat"
          >
            <X size={18} color={COLORS.textPrimary} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Seçilen Fotoğraf + Yemek Adı + Güven Skoru */}
          <View style={styles.heroCard}>
            {photoUri ? (
              <View style={styles.photoWrap}>
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoImage}
                  resizeMode="cover"
                />
                {confidencePct > 0 && (
                  <View style={styles.confidencePill}>
                    <CheckCircle2
                      size={13}
                      color={COLORS.success}
                      strokeWidth={2}
                    />
                    <Text style={styles.confidencePillText}>
                      %{confidencePct} Eşleşme
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.heroInfo}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.mealName}>{analysis.meal_name}</Text>
                {!photoUri && confidencePct > 0 ? (
                  <View style={styles.confidenceInlinePill}>
                    <Text style={styles.confidencePillText}>
                      %{confidencePct} Eşleşme
                    </Text>
                  </View>
                ) : null}
              </View>

              {__DEV__ && analysis.is_mock === true ? (
                <View style={styles.devPreviewBadge}>
                  <Text style={styles.devPreviewText}>
                    Geliştirici önizleme yanıtı
                  </Text>
                </View>
              ) : null}

              {/* Canlı Toplam Kalori & Makrolar */}
              <View style={styles.totalsBox}>
                <View style={styles.totalCalorieBlock}>
                  <Text style={styles.totalCalorieNumber}>
                    {formatCalorieNumber(totals.calories)}
                  </Text>
                  <Text style={styles.totalCalorieLabel}>kcal toplam</Text>
                </View>

                <View style={styles.macroStatsRow}>
                  <View style={styles.macroStatTile}>
                    <View
                      style={[
                        styles.macroDot,
                        { backgroundColor: COLORS.success },
                      ]}
                    />
                    <Text style={styles.macroStatLabel}>Protein</Text>
                    <Text style={styles.macroStatVal}>
                      {formatGram(totals.protein_g)} g
                    </Text>
                  </View>

                  <View style={styles.macroStatTile}>
                    <View
                      style={[
                        styles.macroDot,
                        { backgroundColor: COLORS.walnut },
                      ]}
                    />
                    <Text style={styles.macroStatLabel}>Karb</Text>
                    <Text style={styles.macroStatVal}>
                      {formatGram(totals.carbs_g)} g
                    </Text>
                  </View>

                  <View style={styles.macroStatTile}>
                    <View
                      style={[
                        styles.macroDot,
                        { backgroundColor: COLORS.secondary },
                      ]}
                    />
                    <Text style={styles.macroStatLabel}>Yağ</Text>
                    <Text style={styles.macroStatVal}>
                      {formatGram(totals.fat_g)} g
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Porsiyon Çarpanı Seçici */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Porsiyon boyutu</Text>
              <Text style={styles.sectionMeta}>Canlı hesaplama</Text>
            </View>

            <View style={styles.portionRow}>
              {PORTION_OPTIONS.map((opt) => {
                const isSelected = portionMultiplier === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.portionBtn,
                      isSelected && styles.portionBtnActive,
                    ]}
                    onPress={() => setPortionMultiplier(opt.value)}
                    disabled={submitting}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.portionBtnText,
                        isSelected && styles.portionBtnTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Öğün Tipi */}
            <View style={styles.mealTypeBlock}>
              <Text style={styles.subLabel}>Öğün zamanı</Text>
              <View style={styles.mealTypeRow}>
                {MEAL_TYPES.map((mt) => {
                  const active = selectedMealType === mt;
                  return (
                    <TouchableOpacity
                      key={mt}
                      style={[
                        styles.mealTypeChip,
                        active && styles.mealTypeChipActive,
                      ]}
                      onPress={() => setSelectedMealType(mt)}
                      disabled={submitting}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.mealTypeChipText,
                          active && styles.mealTypeChipTextActive,
                        ]}
                      >
                        {mt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Tespit Edilen Yiyecekler (Düzenlenebilir) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <Utensils
                  size={15}
                  color={COLORS.primary}
                  strokeWidth={1.8}
                />
                <Text style={styles.sectionTitle}>
                  Tespit edilen yiyecekler ({activeItems.length})
                </Text>
              </View>

              {hasRemovedAny && (
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={handleRestoreAll}
                  disabled={submitting}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                >
                  <RotateCcw
                    size={13}
                    color={COLORS.primary}
                    strokeWidth={1.8}
                  />
                  <Text style={styles.restoreBtnText}>Geri Al</Text>
                </TouchableOpacity>
              )}
            </View>

            {scaledItems.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <AlertCircle
                  size={18}
                  color={COLORS.warningText}
                  strokeWidth={1.7}
                />
                <Text style={styles.emptyItemsText}>
                  En az bir yiyecek seçili olmalıdır.
                </Text>
                {hasRemovedAny && (
                  <TouchableOpacity
                    style={styles.restoreCtaBtn}
                    onPress={handleRestoreAll}
                    activeOpacity={0.82}
                  >
                    <RotateCcw
                      size={14}
                      color={COLORS.primary}
                      strokeWidth={1.8}
                    />
                    <Text style={styles.restoreCtaText}>
                      Çıkarılan yiyecekleri geri getir
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.itemsList}>
                {scaledItems.map((entry, idx) => (
                  <View
                    key={entry._uid}
                    style={[
                      styles.itemRow,
                      idx > 0 && styles.itemRowDivider,
                    ]}
                  >
                    <View style={styles.itemLeft}>
                      <Text style={styles.itemName}>{entry.scaled.name}</Text>
                      <Text style={styles.itemSubMeta}>
                        ~{entry.scaled.estimated_grams}g · P{' '}
                        {formatGram(entry.scaled.protein_g)}g · K{' '}
                        {formatGram(entry.scaled.carbs_g)}g · Y{' '}
                        {formatGram(entry.scaled.fat_g)}g
                      </Text>
                    </View>

                    <View style={styles.itemRight}>
                      <Text style={styles.itemCalories}>
                        {formatCalorieNumber(entry.scaled.calories)} kcal
                      </Text>
                      <TouchableOpacity
                        style={styles.removeItemBtn}
                        onPress={() => handleRemoveItem(entry._uid)}
                        disabled={submitting}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`${entry.scaled.name} öğesini listeden çıkar`}
                      >
                        <X
                          size={14}
                          color={COLORS.dangerText}
                          strokeWidth={2}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* AI Koç Notu */}
          {Boolean(analysis.coach_tip?.trim()) && (
            <View style={styles.coachCard}>
              <View style={styles.coachHeader}>
                <Sparkles
                  size={15}
                  color={COLORS.success}
                  strokeWidth={1.8}
                />
                <Text style={styles.coachHeading}>AI Beslenme Koçu Notu</Text>
              </View>
              <Text style={styles.coachBody}>{analysis.coach_tip.trim()}</Text>
            </View>
          )}

          {/* Kayıt Hatası (varsa) */}
          {submitError ? (
            <View style={styles.errorBox}>
              <AlertCircle
                size={16}
                color={COLORS.dangerText}
                strokeWidth={1.8}
              />
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}

          {/* Zorunlu App Store Sağlık Uyarısı (Guideline 1.4.1) */}
          <Text style={styles.disclaimerText}>
            Bilgilendirme: Bu alandaki yapay zeka analizleri ve tahminler
            yalnızca spor/fitness takibi amaçlıdır; tıbbi tanı, tedavi veya
            doktor tavsiyesi yerine geçmez. Değerler porsiyon ve pişirme
            yöntemine göre farklılık gösterebilir.
          </Text>
        </ScrollView>

        {/* Sabit Alt Onay Çubuğu */}
        <View style={styles.footerBar}>
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              !canConfirm && styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirmPress}
            disabled={!canConfirm}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {submitting ? (
              <View style={styles.confirmBtnInner}>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.confirmBtnText}>
                  Günlüğüne ekleniyor...
                </Text>
              </View>
            ) : (
              <View style={styles.confirmBtnInner}>
                <Text style={styles.confirmBtnText}>
                  ✅ Günlüğüme Ekle (+{formatCalorieNumber(totals.calories)}{' '}
                  kcal)
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitleCol: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: COLORS.primary,
  },
  headerTitle: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 28,
    gap: 16,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  photoWrap: {
    width: '100%',
    height: 200,
    backgroundColor: COLORS.surfaceElevated,
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  confidencePill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  confidenceInlinePill: {
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confidencePillText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
    fontVariant: ['tabular-nums'],
  },
  heroInfo: {
    padding: 16,
    gap: 12,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mealName: {
    flex: 1,
    fontFamily: FONTS.serif,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 28,
    color: COLORS.textPrimary,
  },
  devPreviewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  devPreviewText: {
    fontFamily: FONTS.sans,
    fontSize: 10.5,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  totalsBox: {
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  totalCalorieBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  totalCalorieNumber: {
    fontFamily: FONTS.serif,
    fontSize: 34,
    fontWeight: '600',
    lineHeight: 38,
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  totalCalorieLabel: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  macroStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroStatTile: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  macroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  macroStatLabel: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  macroStatVal: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
    ...CARD_SHADOW,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14.5,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  sectionMeta: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  portionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  portionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  portionBtnActive: {
    backgroundColor: COLORS.primarySurface,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  portionBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  portionBtnTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  mealTypeBlock: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  subLabel: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  mealTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealTypeChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mealTypeChipActive: {
    backgroundColor: COLORS.primarySurface,
    borderColor: COLORS.primaryBorder,
  },
  mealTypeChipText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  mealTypeChipTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.primarySurface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  restoreBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  itemsList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundAlt,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  itemRowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  itemLeft: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  itemSubMeta: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemCalories: {
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  removeItemBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyItemsBox: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyItemsText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.warningText,
    textAlign: 'center',
  },
  restoreCtaBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  restoreCtaText: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.primary,
  },
  coachCard: {
    backgroundColor: COLORS.successBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    padding: 14,
    gap: 6,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coachHeading: {
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.success,
  },
  coachBody: {
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.dangerText,
    lineHeight: 18,
  },
  disclaimerText: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    fontWeight: '400',
    lineHeight: 17,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  footerBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  confirmBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    fontVariant: ['tabular-nums'],
  },
});
