import React, { useMemo, useState } from 'react';
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
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Dumbbell,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import {
  AppUser,
  TrainerSession,
  TrainerSessionCreateRequest,
} from '@/types/fitness';
import { getCategoryVisuals } from '@/screens/member/MemberAvatar';
import {
  addMinutesToHhMm,
  formatTurkishDateLabel,
  getTodayIso,
  getUpcomingIsoDates,
} from '@/utils/dateHelpers';

interface CategoryPreset {
  category: 'Grup Reformer' | 'Bireysel Reformer' | 'Cadillac & Tower' | 'Düet & Trio';
  defaultTitle: string;
  defaultRoom: string;
  defaultCapacity: number;
  subtitle: string;
}

const CATEGORY_PRESETS: CategoryPreset[] = [
  {
    category: 'Grup Reformer',
    defaultTitle: 'Grup Reformer: Dik Duruş & Core',
    defaultRoom: 'Kemerli Ayna Reformer Salonu',
    defaultCapacity: 6,
    subtitle: '6-7 Kişilik Grup',
  },
  {
    category: 'Bireysel Reformer',
    defaultTitle: 'Bireysel Klinik Reformer & Postür',
    defaultRoom: 'VIP Özel Reformer Odası',
    defaultCapacity: 1,
    subtitle: '1-1 Özel İlgi',
  },
  {
    category: 'Cadillac & Tower',
    defaultTitle: 'Cadillac Trapeze & Omurga Esneme',
    defaultRoom: 'Cadillac & Trapeze Alanı',
    defaultCapacity: 2,
    subtitle: 'Skolyoz & Uzama',
  },
  {
    category: 'Düet & Trio',
    defaultTitle: 'Düet Reformer Pilates',
    defaultRoom: 'Kemerli Ayna Reformer Salonu',
    defaultCapacity: 2,
    subtitle: '2-3 Kişilik Akış',
  },
];

const QUICK_TIME_SLOTS = [
  '09:00',
  '10:30',
  '12:00',
  '14:00',
  '16:30',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

const ROOM_SUGGESTIONS = [
  'Kemerli Ayna Reformer Salonu',
  'Cadillac & Trapeze Alanı',
  'VIP Özel Reformer Odası',
];

const CAPACITY_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Props {
  trainer: AppUser;
  existingSessions: TrainerSession[];
  onSessionCreated: (created: TrainerSession) => Promise<void>;
  onViewInSchedule: (dateIso: string) => void;
  onShowBanner?: (type: 'success' | 'error', text: string) => void;
}

export function TrainerCreateSessionTab({
  trainer,
  existingSessions,
  onSessionCreated,
  onViewInSchedule,
  onShowBanner,
}: Props) {
  const { triggerGlobalRefresh } = useAuthDemo();
  const upcomingDates = useMemo(() => getUpcomingIsoDates(8), []);

  const initialPreset = useMemo(() => {
    const spec = (trainer.specialty || '').toLocaleLowerCase('tr-TR');
    if (spec.includes('cadillac') || spec.includes('tower')) {
      return CATEGORY_PRESETS[2];
    }
    if (spec.includes('düet') || spec.includes('duet')) {
      return CATEGORY_PRESETS[3];
    }
    return CATEGORY_PRESETS[0];
  }, [trainer.specialty]);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialPreset.category
  );
  const [title, setTitle] = useState<string>(initialPreset.defaultTitle);
  const [room, setRoom] = useState<string>(initialPreset.defaultRoom);
  const [selectedDate, setSelectedDate] = useState<string>(
    upcomingDates[1] || getTodayIso()
  );
  const [startTime, setStartTime] = useState<string>('18:00');
  const [endTime, setEndTime] = useState<string>('19:00');
  const [capacity, setCapacity] = useState<number>(initialPreset.defaultCapacity);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastCreatedSession, setLastCreatedSession] = useState<TrainerSession | null>(
    null
  );

  const occupiedStartTimesForDate = useMemo(() => {
    const set = new Set<string>();
    existingSessions.forEach((s) => {
      if (s.date === selectedDate) {
        set.add(s.start_time);
      }
    });
    return set;
  }, [existingSessions, selectedDate]);

  const handleSelectCategory = (preset: CategoryPreset) => {
    setSelectedCategory(preset.category);
    setTitle(preset.defaultTitle);
    setRoom(preset.defaultRoom);
    setCapacity(preset.defaultCapacity);
  };

  const handleSelectQuickTime = (slot: string) => {
    setStartTime(slot);
    const computedEnd = addMinutesToHhMm(slot, 60);
    if (computedEnd) {
      setEndTime(computedEnd);
    }
  };

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    const computedEnd = addMinutesToHhMm(val, 60);
    if (computedEnd) {
      setEndTime(computedEnd);
    }
  };

  const adjustCapacity = (delta: number) => {
    setCapacity((prev) => Math.min(10, Math.max(1, prev + delta)));
  };

  const handleCreateSession = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      onShowBanner?.('error', 'Lütfen ders başlığını girin.');
      return;
    }

    const normalizedStart = startTime.trim().replace('.', ':');
    const normalizedEnd = endTime.trim().replace('.', ':');

    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(normalizedStart)) {
      onShowBanner?.(
        'error',
        'Başlangıç saati SS:DD (örn. 18:00) formatında olmalıdır.'
      );
      return;
    }
    if (normalizedEnd && !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(normalizedEnd)) {
      onShowBanner?.('error', 'Bitiş saati SS:DD (örn. 19:00) formatında olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: TrainerSessionCreateRequest = {
        trainer_id: trainer.id,
        title: cleanTitle,
        category: selectedCategory,
        date: selectedDate,
        start_time: normalizedStart,
        end_time: normalizedEnd || addMinutesToHhMm(normalizedStart, 60),
        capacity,
        room: room.trim() || 'Ana Stüdyo',
      };

      const created = await apiRequest<TrainerSession>('/trainer/sessions/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setLastCreatedSession(created);
      await onSessionCreated(created);
      triggerGlobalRefresh();

      onShowBanner?.(
        'success',
        `"${created.title}" dersi (${created.date} • ${created.start_time}) takvime eklendi!`
      );
    } catch (err: any) {
      onShowBanner?.('error', err?.message || 'Ders oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewCatVisual = getCategoryVisuals(selectedCategory);
  const hasConflictWarning = occupiedStartTimesForDate.has(
    startTime.trim().replace('.', ':')
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Son Oluşturulan Ders Başarı Kartı & Hızlı Geçiş */}
        {lastCreatedSession && (
          <View style={styles.createdSuccessCard}>
            <View style={styles.createdSuccessTop}>
              <View style={styles.createdCheckWrap}>
                <CheckCircle2 size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.createdSuccessTitle}>
                  Yeni Ders Takvime Açıldı!
                </Text>
                <Text style={styles.createdSuccessSub}>
                  {lastCreatedSession.title} •{' '}
                  {formatTurkishDateLabel(lastCreatedSession.date).primary}{' '}
                  {lastCreatedSession.start_time}-{lastCreatedSession.end_time} (
                  {lastCreatedSession.capacity} Kişi)
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.viewInScheduleBtn}
              onPress={() => onViewInSchedule(lastCreatedSession.date)}
              activeOpacity={0.85}
            >
              <Text style={styles.viewInScheduleBtnText}>Günlük Derslerimde Gör</Text>
              <ArrowRight size={15} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* 1. Ders Tipi (Kategori) Seçimi */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: COLORS.secondaryLight }]}>
              <Sparkles size={15} color={COLORS.secondary} />
            </View>
            <Text style={styles.sectionTitle}>1. Ders Tipi (Kategori) Seçimi</Text>
          </View>

          <View style={styles.categoryGrid}>
            {CATEGORY_PRESETS.map((preset) => {
              const active = selectedCategory === preset.category;
              const vis = getCategoryVisuals(preset.category);
              return (
                <TouchableOpacity
                  key={preset.category}
                  style={[
                    styles.categoryCard,
                    active && {
                      borderColor: vis.color,
                      backgroundColor: vis.bg,
                    },
                  ]}
                  onPress={() => handleSelectCategory(preset)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.categoryCardTitle,
                      active && { color: vis.color },
                    ]}
                  >
                    {preset.category}
                  </Text>
                  <Text style={styles.categoryCardSub}>
                    {preset.subtitle} • Öneri: {preset.defaultCapacity} Kişi
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Ders Başlığı & Stüdyo Oda Düzenleme */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Ders Başlığı</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Örn: Fonksiyonel Kuvvet & Kondisyon"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Stüdyo / Oda</Text>
            <TextInput
              style={styles.textInput}
              value={room}
              onChangeText={setRoom}
              placeholder="Örn: Ana Stüdyo"
              placeholderTextColor={COLORS.textMuted}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roomChipsRow}
            >
              {ROOM_SUGGESTIONS.map((r) => {
                const active = room.trim() === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roomChip, active && styles.roomChipActive]}
                    onPress={() => setRoom(r)}
                    activeOpacity={0.82}
                  >
                    <MapPin
                      size={11}
                      color={active ? COLORS.white : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.roomChipText,
                        active && styles.roomChipTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* 2. Tarih Seçimi */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: COLORS.primaryLight }]}>
              <Calendar size={15} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>2. Tarih Seçimi</Text>
            <View style={styles.isoDateBadge}>
              <Text style={styles.isoDateBadgeText}>{selectedDate}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateCardsRow}
          >
            {upcomingDates.map((dt) => {
              const active = selectedDate === dt;
              const fmt = formatTurkishDateLabel(dt);
              const existingCount = existingSessions.filter(
                (s) => s.date === dt
              ).length;

              return (
                <TouchableOpacity
                  key={dt}
                  style={[styles.dateSelectCard, active && styles.dateSelectCardActive]}
                  onPress={() => setSelectedDate(dt)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.dateCardPrimary,
                      active && styles.dateCardPrimaryActive,
                    ]}
                  >
                    {fmt.primary}
                  </Text>
                  <Text
                    style={[
                      styles.dateCardSecondary,
                      active && styles.dateCardSecondaryActive,
                    ]}
                  >
                    {fmt.secondary}
                  </Text>
                  <View
                    style={[
                      styles.dateCountDotBadge,
                      active && styles.dateCountDotBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateCountDotText,
                        active && styles.dateCountDotTextActive,
                      ]}
                    >
                      {existingCount} Ders
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 3. Başlangıç - Bitiş Saati Seçimi */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: COLORS.warningBg }]}>
              <Clock size={15} color={COLORS.warningText} />
            </View>
            <Text style={styles.sectionTitle}>3. Başlangıç & Bitiş Saati</Text>
          </View>

          <View style={styles.timeSlotsGrid}>
            {QUICK_TIME_SLOTS.map((slot) => {
              const active = startTime.trim() === slot;
              const occupied = occupiedStartTimesForDate.has(slot);
              return (
                <TouchableOpacity
                  key={slot}
                  style={[
                    styles.timeSlotChip,
                    occupied && styles.timeSlotChipOccupied,
                    active && styles.timeSlotChipActive,
                  ]}
                  onPress={() => handleSelectQuickTime(slot)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.timeSlotText,
                      occupied && styles.timeSlotTextOccupied,
                      active && styles.timeSlotTextActive,
                    ]}
                  >
                    {slot}
                  </Text>
                  {occupied && (
                    <Text
                      style={[
                        styles.occupiedMiniLabel,
                        active && { color: COLORS.secondaryLight },
                      ]}
                    >
                      Dolu
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.dualTimeInputsRow}>
            <View style={styles.dualTimeCol}>
              <Text style={styles.fieldLabel}>Başlangıç Saati (SS:DD)</Text>
              <TextInput
                style={styles.timeInput}
                value={startTime}
                onChangeText={handleStartTimeChange}
                placeholder="18:00"
                placeholderTextColor={COLORS.textMuted}
                maxLength={5}
              />
            </View>

            <View style={styles.dualTimeCol}>
              <Text style={styles.fieldLabel}>Bitiş Saati (SS:DD)</Text>
              <TextInput
                style={styles.timeInput}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="19:00"
                placeholderTextColor={COLORS.textMuted}
                maxLength={5}
              />
            </View>
          </View>

          {hasConflictWarning && (
            <View style={styles.conflictHintBox}>
              <AlertTriangle size={15} color={COLORS.warningText} />
              <Text style={styles.conflictHintText}>
                Seçili tarihte saat {startTime} için zaten bir dersiniz bulunuyor. Farklı
                bir başlangıç saati seçmeniz önerilir.
              </Text>
            </View>
          )}
        </View>

        {/* 4. Maksimum Kontenjan Seçici (1..10) */}
        <View style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: COLORS.primaryLight }]}>
              <Users size={15} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>4. Maksimum Kontenjan (1 - 10 Kişi)</Text>
          </View>

          <View style={styles.stepperControlRow}>
            <TouchableOpacity
              style={[styles.stepperBtn, capacity <= 1 && styles.stepperBtnDisabled]}
              onPress={() => adjustCapacity(-1)}
              disabled={capacity <= 1}
              activeOpacity={0.82}
            >
              <Minus size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>

            <View style={styles.stepperValueCenter}>
              <Text style={styles.stepperBigNumber}>{capacity}</Text>
              <Text style={styles.stepperUnitLabel}>Kişilik Kontenjan</Text>
            </View>

            <TouchableOpacity
              style={[styles.stepperBtn, capacity >= 10 && styles.stepperBtnDisabled]}
              onPress={() => adjustCapacity(1)}
              disabled={capacity >= 10}
              activeOpacity={0.82}
            >
              <Plus size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.capacityNumbersRow}
          >
            {CAPACITY_NUMBERS.map((num) => {
              const active = capacity === num;
              return (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.capacityNumberPill,
                    active && styles.capacityNumberPillActive,
                  ]}
                  onPress={() => setCapacity(num)}
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      styles.capacityNumberText,
                      active && styles.capacityNumberTextActive,
                    ]}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Canlı Önizleme Kartı */}
        <View style={styles.previewBentoCard}>
          <View style={styles.previewTopLabelRow}>
            <Dumbbell size={14} color={COLORS.primary} />
            <Text style={styles.previewHeadingLabel}>CANLI TAKVİM ÖNİZLEMESİ</Text>
          </View>

          <View style={styles.previewInnerBox}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.previewBadgesRow}>
                <View
                  style={[
                    styles.previewCatBadge,
                    {
                      backgroundColor: previewCatVisual.bg,
                      borderColor: previewCatVisual.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.previewCatBadgeText,
                      { color: previewCatVisual.color },
                    ]}
                  >
                    {previewCatVisual.label}
                  </Text>
                </View>

                <Text style={styles.previewDateText}>
                  {formatTurkishDateLabel(selectedDate).full}
                </Text>
              </View>

              <Text style={styles.previewSessionTitle}>
                {title.trim() || 'Ders Başlığı'}
              </Text>

              <Text style={styles.previewMetaLine}>
                🕒 {startTime || '--:--'} - {endTime || '--:--'} • 📍{' '}
                {room.trim() || 'Ana Stüdyo'} • 👤 {trainer.full_name}
              </Text>
            </View>

            <View style={styles.previewCapacityBox}>
              <Text style={styles.previewCapacityVal}>0/{capacity}</Text>
              <Text style={styles.previewCapacitySub}>Açık Slot</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.submitSessionBtn,
              (submitting || hasConflictWarning) && styles.submitSessionBtnDim,
            ]}
            onPress={handleCreateSession}
            disabled={submitting}
            activeOpacity={0.86}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <CalendarPlus size={18} color={COLORS.white} />
                <Text style={styles.submitSessionBtnText}>Yeni Ders Vaktini Aç</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  createdSuccessCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5CB90',
    gap: 14,
    ...CARD_SHADOW,
  },
  createdSuccessTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createdCheckWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createdSuccessTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  createdSuccessSub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 2,
  },
  viewInScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  viewInScheduleBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  formSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  isoDateBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5CB90',
  },
  isoDateBadgeText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 4,
  },
  categoryCardTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  categoryCardSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  roomChipsRow: {
    gap: 8,
    paddingTop: 4,
  },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roomChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  roomChipText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  roomChipTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  dateCardsRow: {
    gap: 9,
    paddingVertical: 2,
  },
  dateSelectCard: {
    minWidth: 96,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: 3,
  },
  dateSelectCardActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  dateCardPrimary: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  dateCardPrimaryActive: {
    color: COLORS.white,
  },
  dateCardSecondary: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  dateCardSecondaryActive: {
    color: COLORS.secondaryLight,
  },
  dateCountDotBadge: {
    marginTop: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateCountDotBadgeActive: {
    backgroundColor: COLORS.secondaryLight,
    borderColor: '#E5C5C9',
  },
  dateCountDotText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  dateCountDotTextActive: {
    color: COLORS.secondary,
  },
  timeSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlotChip: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotChipOccupied: {
    borderColor: '#EDD092',
    backgroundColor: COLORS.warningBg,
  },
  timeSlotChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  timeSlotText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  timeSlotTextOccupied: {
    color: COLORS.warningText,
  },
  timeSlotTextActive: {
    color: COLORS.white,
  },
  occupiedMiniLabel: {
    color: COLORS.warningText,
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 1,
  },
  dualTimeInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dualTimeCol: {
    flex: 1,
    gap: 5,
  },
  timeInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 11,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  conflictHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDD092',
    padding: 12,
  },
  conflictHintText: {
    flex: 1,
    color: COLORS.warningText,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  stepperControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValueCenter: {
    alignItems: 'center',
  },
  stepperBigNumber: {
    color: COLORS.secondary,
    fontSize: 25,
    fontWeight: '900',
  },
  stepperUnitLabel: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  capacityNumbersRow: {
    gap: 8,
    paddingTop: 2,
  },
  capacityNumberPill: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capacityNumberPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  capacityNumberText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    fontWeight: '800',
  },
  capacityNumberTextActive: {
    color: COLORS.white,
  },
  previewBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5CB90',
    gap: 15,
    ...CARD_SHADOW,
  },
  previewTopLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewHeadingLabel: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  previewInnerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewCatBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  previewCatBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  previewDateText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  previewSessionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  previewMetaLine: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  previewCapacityBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewCapacityVal: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  previewCapacitySub: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  submitSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    paddingVertical: 14,
  },
  submitSessionBtnDim: {
    opacity: 0.8,
  },
  submitSessionBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
  },
});
