import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import Svg, { Circle } from 'react-native-svg';
import {
  Activity,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplets,
  FileText,
  Flame,
  Image as ImageIcon,
  Info,
  Moon,
  Plus,
  RefreshCw,
  ScanLine,
  Trash2,
  Upload,
  Utensils,
  Zap,
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

type AnalyzerMode = 'photo' | 'text';
type MealType = 'Kahvaltı' | 'Öğle' | 'Akşam' | 'Ara Öğün';
type PortionSize = 'Küçük' | 'Normal' | 'Büyük';

interface DetectedFoodItem {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence_pct: number;
}

interface PhotoAnalyzeRequest {
  member_id: number;
  image_base64: string;
  filename?: string;
  meal_type: MealType;
  portion_size: PortionSize;
  notes?: string;
  auto_log: boolean;
}

interface PhotoAnalyzeResponse {
  log_id: number;
  meal_type: string;
  portion_size: string;
  meal_title: string;
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  health_score: number;
  glycemic_load: string;
  burn_equivalent: string;
  analysis_engine: string;
  detected_items: DetectedFoodItem[];
  coach_note: string;
  suggestions: string[];
  wellness: DailyWellness;
}

interface NutritionMealLog {
  id: number;
  date: string;
  created_at: string;
  source: string;
  meal_type: string;
  portion_size: string;
  meal_description: string;
  photo_thumbnail?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  health_score: number;
  glycemic_load: string;
  burn_equivalent: string;
  detected_items: DetectedFoodItem[];
  coach_note: string;
}

interface SamplePlatePreset {
  id: string;
  label: string;
  mealType: MealType;
  portionSize: PortionSize;
  filename: string;
  notes: string;
  palette: [string, string, string];
}

const MEAL_TYPE_OPTIONS: MealType[] = ['Kahvaltı', 'Öğle', 'Akşam', 'Ara Öğün'];
const PORTION_SIZE_OPTIONS: PortionSize[] = ['Küçük', 'Normal', 'Büyük'];

const SAMPLE_PLATES: SamplePlatePreset[] = [
  {
    id: 'salmon-quinoa',
    label: 'Izgara somon ve kinoa',
    mealType: 'Öğle',
    portionSize: 'Normal',
    filename: 'izgara-somon-kinoa.jpg',
    notes: 'Izgara somon, haşlanmış kinoa, avokado ve zeytinyağlı roka salatası',
    palette: ['#D97A5B', '#D8B979', '#5A815E'],
  },
  {
    id: 'avocado-eggs',
    label: 'Avokadolu poşe yumurta',
    mealType: 'Kahvaltı',
    portionSize: 'Normal',
    filename: 'avokadolu-pose-yumurta.jpg',
    notes: '2 poşe yumurta, 1 dilim ekşi maya tam buğday ekmek, avokado ve lor peyniri',
    palette: ['#E8B949', '#6B8E5E', '#A87C4F'],
  },
  {
    id: 'chicken-bowl',
    label: 'Tavuklu Akdeniz kasesi',
    mealType: 'Akşam',
    portionSize: 'Normal',
    filename: 'tavuklu-akdeniz-kasesi.jpg',
    notes: 'Izgara tavuk göğsü, bulgur pilavı, süzme yoğurt ve közlenmiş sebze',
    palette: ['#C89862', '#D4C39A', '#7A5536'],
  },
];

const QUICK_MEAL_PRESETS: Array<{ label: string; text: string }> = [
  {
    label: 'Menemen ve beyaz peynir',
    text: '2 yumurtalı menemen, 100g beyaz peynir ve 1 dilim tam buğday ekmeği',
  },
  {
    label: 'Izgara tavuk ve pilav',
    text: '200g ızgara tavuk göğsü ve 1 tabak pirinç pilavı',
  },
  {
    label: 'Yulaf, muz ve protein',
    text: 'Yulaf ezmesi, 1 orta boy muz ve 1 ölçek whey protein',
  },
  {
    label: 'Izgara somon ve salata',
    text: '180g ızgara somon ve zeytinyağlı bol yeşillik salatası',
  },
];

const ENERGY_OPTIONS: Array<{
  key: EnergyStatus;
  label: string;
  detail: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
}> = [
  {
    key: 'high',
    label: 'Enerjik',
    detail: 'Yüksek tempo için hazır',
    activeBg: COLORS.successBg,
    activeBorder: COLORS.successBorder,
    activeText: COLORS.success,
  },
  {
    key: 'normal',
    label: 'Dengeli',
    detail: 'Standart seans ritmi',
    activeBg: COLORS.primarySurface,
    activeBorder: COLORS.primaryBorder,
    activeText: COLORS.primary,
  },
  {
    key: 'low',
    label: 'Uykusuz veya yorgun',
    detail: 'Eğitmen temposu yumuşatılır',
    activeBg: COLORS.warningBg,
    activeBorder: COLORS.warningBorder,
    activeText: COLORS.warningText,
  },
];

const WATER_ACCENT = '#356E8A';
const WATER_TRACK = '#E4ECEF';

const FALLBACK_TINY_JPEG_URI =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function formatLitersValue(ml: number): string {
  const liters = Math.max(0, ml) / 1000;
  const rounded = Math.round(liters * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toFixed(1);
  const twoDec = rounded.toFixed(2);
  return twoDec.endsWith('0') ? rounded.toFixed(1) : twoDec;
}

function formatNumber(val: number): string {
  const n = Math.round(Number.isFinite(val) ? val : 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDecimalGram(val: number): string {
  const safe = Number.isFinite(val) ? Math.max(0, val) : 0;
  const rounded = Math.round(safe * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatTodayTurkishDate(): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatLogTime(raw?: string | null): string {
  if (!raw) return 'Bugün';
  const match = raw.match(/(\d{2}:\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const h = String(parsed.getHours()).padStart(2, '0');
    const m = String(parsed.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return 'Bugün';
}

function normalizeImageUri(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

function normalizeCoachNote(rawNote?: string | null): string {
  const trimmed = (rawNote || '')
    .replace(/^[\s💡✅🤖🥗]+/gu, '')
    .replace(/^AI Koç Notu:\s*/i, '')
    .trim();
  if (!trimmed) {
    return 'Öğün makrolarınız günlük hedefinize eklendi. Su tüketiminizi seans öncesi ve sonrası dengeli biçimde yayın.';
  }
  return trimmed;
}

function getHealthScoreTone(score: number): {
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  if (score >= 75) {
    return {
      bg: COLORS.successBg,
      border: COLORS.successBorder,
      text: COLORS.success,
      label: 'Dengeli öğün',
    };
  }
  if (score >= 50) {
    return {
      bg: COLORS.warningBg,
      border: COLORS.warningBorder,
      text: COLORS.warningText,
      label: 'Orta denge',
    };
  }
  return {
    bg: COLORS.dangerBg,
    border: COLORS.dangerBorder,
    text: COLORS.dangerText,
    label: 'Dikkatli porsiyon',
  };
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

function generateSamplePlateDataUri(sample: SamplePlatePreset): string {
  if (Platform.OS !== 'web') {
    return FALLBACK_TINY_JPEG_URI;
  }
  try {
    const doc = (globalThis as any).document;
    if (!doc) return FALLBACK_TINY_JPEG_URI;
    const canvas = doc.createElement('canvas');
    canvas.width = 480;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return FALLBACK_TINY_JPEG_URI;

    // Warm stone linen backdrop
    ctx.fillStyle = '#EFE8DC';
    ctx.fillRect(0, 0, 480, 300);

    // Subtle ceramic shadow
    ctx.beginPath();
    ctx.arc(244, 156, 114, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 29, 25, 0.08)';
    ctx.fill();

    // Ceramic plate outer rim
    ctx.beginPath();
    ctx.arc(240, 150, 112, 0, Math.PI * 2);
    ctx.fillStyle = '#FCFBF8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#DFD4C3';
    ctx.stroke();

    // Inner plate recess
    ctx.beginPath();
    ctx.arc(240, 150, 88, 0, Math.PI * 2);
    ctx.fillStyle = '#F7F3EC';
    ctx.fill();

    const [primaryFill, secondaryFill, accentFill] = sample.palette;

    // Protein portion shape
    ctx.beginPath();
    ctx.ellipse(205, 138, 44, 28, -0.25, 0, Math.PI * 2);
    ctx.fillStyle = primaryFill;
    ctx.fill();

    // Complex carb portion shape
    ctx.beginPath();
    ctx.arc(276, 126, 30, 0, Math.PI * 2);
    ctx.fillStyle = secondaryFill;
    ctx.fill();

    // Greens / healthy fat garnish
    ctx.beginPath();
    ctx.ellipse(258, 184, 38, 22, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = accentFill;
    ctx.fill();

    // Small highlights for depth
    ctx.beginPath();
    ctx.arc(198, 132, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(274, 120, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill();

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return FALLBACK_TINY_JPEG_URI;
  }
}

function compressWebImageFile(file: any, maxDim = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const FileReaderCtor = (globalThis as any).FileReader;
    if (!FileReaderCtor) {
      reject(new Error('Görsel okuyucu bu ortamda kullanılamıyor'));
      return;
    }

    const reader = new FileReaderCtor();
    reader.onerror = () => reject(new Error('Fotoğraf okunamadı'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        reject(new Error('Fotoğraf verisi boş'));
        return;
      }

      const ImageCtor = (globalThis as any).Image;
      const doc = (globalThis as any).document;
      if (!ImageCtor || !doc) {
        resolve(rawDataUrl);
        return;
      }

      const img = new ImageCtor();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        try {
          const origW = Number(img.naturalWidth || img.width || 0);
          const origH = Number(img.naturalHeight || img.height || 0);
          if (!origW || !origH) {
            resolve(rawDataUrl);
            return;
          }

          const longest = Math.max(origW, origH);
          const scale = longest > maxDim ? maxDim / longest : 1;
          const targetW = Math.max(1, Math.round(origW * scale));
          const targetH = Math.max(1, Math.round(origH * scale));

          const canvas = doc.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve(jpegDataUrl || rawDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  });
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

  // Analyzer Mode ('photo' default)
  const [mode, setMode] = useState<AnalyzerMode>('photo');

  // Photo Analyzer State
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [selectedPhotoName, setSelectedPhotoName] = useState<string>('');
  const [preparingPhoto, setPreparingPhoto] = useState<boolean>(false);
  const [mealType, setMealType] = useState<MealType>('Öğle');
  const [portionSize, setPortionSize] = useState<PortionSize>('Normal');
  const [photoNotes, setPhotoNotes] = useState<string>('');
  const [photoAnalyzing, setPhotoAnalyzing] = useState<boolean>(false);
  const [photoResult, setPhotoResult] = useState<PhotoAnalyzeResponse | null>(null);

  // Text Analyzer State
  const [mealText, setMealText] = useState<string>('');
  const [textAnalyzing, setTextAnalyzing] = useState<boolean>(false);
  const [lastTextAnalysis, setLastTextAnalysis] =
    useState<NutritionAnalyzeResponse | null>(null);

  // Meal History Logs State
  const [mealLogs, setMealLogs] = useState<NutritionMealLog[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const galleryInputRef = useRef<any>(null);
  const cameraInputRef = useRef<any>(null);

  const fetchTodayWellness = useCallback(async () => {
    try {
      const res = await apiRequest<DailyWellness>(`/wellness/${member.id}/today`);
      if (res && typeof res.water_ml === 'number') {
        setWellness(res);
      }
      return true;
    } catch {
      return false;
    }
  }, [member.id]);

  const fetchMealLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await apiRequest<NutritionMealLog[]>(
        `/nutrition/${member.id}/logs`
      );
      if (Array.isArray(res)) {
        setMealLogs(res);
      }
      return true;
    } catch {
      return false;
    } finally {
      setLogsLoading(false);
    }
  }, [member.id]);

  const fetchAllData = useCallback(async () => {
    setLoadError(null);
    const [wellOk, logsOk] = await Promise.all([
      fetchTodayWellness(),
      fetchMealLogs(),
    ]);
    if (!wellOk && !logsOk) {
      setLoadError(
        'Beslenme ve günlük takip verileri sunucudan alınamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.'
      );
    }
    setRefreshing(false);
  }, [fetchMealLogs, fetchTodayWellness]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData, refreshSignal]);

  const handlePullRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllData();
  }, [fetchAllData]);

  const handleAddWater = useCallback(async () => {
    if (addingWater) return;
    setAddingWater(true);

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
        err?.message || 'Su tüketimi kaydedilirken bağlantı hatası oluştu'
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
        onShowBanner?.('error', err?.message || 'Enerji durumu güncellenemedi');
      } finally {
        setUpdatingEnergy(false);
      }
    },
    [member.id, onShowBanner, triggerGlobalRefresh, updatingEnergy]
  );

  const handleWebFileChange = useCallback(
    async (event: any) => {
      const file = event?.target?.files?.[0];
      if (event?.target) {
        event.target.value = '';
      }
      if (!file) return;

      setPreparingPhoto(true);
      try {
        const compressedUri = await compressWebImageFile(file, 720);
        setSelectedPhotoUri(compressedUri);
        setSelectedPhotoName(file.name || 'tabak-fotografi.jpg');
        setPhotoResult(null);
      } catch (err: any) {
        onShowBanner?.(
          'error',
          err?.message || 'Fotoğraf hazırlanırken hata oluştu'
        );
      } finally {
        setPreparingPhoto(false);
      }
    },
    [onShowBanner]
  );

  const handleTriggerGallery = useCallback(() => {
    if (Platform.OS === 'web' && galleryInputRef.current) {
      galleryInputRef.current.click();
      return;
    }
    onShowBanner?.(
      'warning',
      'Fotoğraf seçimi bu görünümde desteklenmiyorsa "Metinle hızlı yaz" sekmesinden veya aşağıdaki hızlı öğün şablonlarından devam edebilirsiniz.'
    );
  }, [onShowBanner]);

  const handleTriggerCamera = useCallback(() => {
    if (Platform.OS === 'web' && cameraInputRef.current) {
      cameraInputRef.current.click();
      return;
    }
    onShowBanner?.(
      'warning',
      'Kamera erişimi bu görünümde desteklenmiyorsa "Metinle hızlı yaz" sekmesinden veya aşağıdaki hızlı öğün şablonlarından devam edebilirsiniz.'
    );
  }, [onShowBanner]);

  const handleClearPhoto = useCallback(() => {
    setSelectedPhotoUri(null);
    setSelectedPhotoName('');
    setPhotoResult(null);
  }, []);

  const executePhotoAnalysis = useCallback(
    async (override?: {
      imageUri: string;
      filename: string;
      mealType: MealType;
      portionSize: PortionSize;
      notes: string;
    }) => {
      const activeImageUri = override?.imageUri ?? selectedPhotoUri;
      const activeFilename = override?.filename ?? selectedPhotoName;
      const activeMealType = override?.mealType ?? mealType;
      const activePortionSize = override?.portionSize ?? portionSize;
      const activeNotes = (override?.notes ?? photoNotes).trim();

      if (!activeImageUri) {
        onShowBanner?.(
          'warning',
          'Analiz için önce bir tabak fotoğrafı seçin veya kamera ile çekin'
        );
        return;
      }

      setPhotoAnalyzing(true);
      try {
        const payload: PhotoAnalyzeRequest = {
          member_id: member.id,
          image_base64: activeImageUri,
          filename: activeFilename || 'tabak.jpg',
          meal_type: activeMealType,
          portion_size: activePortionSize,
          notes: activeNotes || undefined,
          auto_log: true,
        };

        const res = await apiRequest<PhotoAnalyzeResponse>(
          '/nutrition/analyze-photo',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        const safeRes: PhotoAnalyzeResponse = {
          ...res,
          total_calories: Number(res.total_calories || 0),
          protein_g: Number(res.protein_g || 0),
          carbs_g: Number(res.carbs_g || 0),
          fat_g: Number(res.fat_g || 0),
          fiber_g: Number(res.fiber_g || 0),
          sugar_g: Number(res.sugar_g || 0),
          health_score: Number(res.health_score || 0),
          detected_items: Array.isArray(res.detected_items)
            ? res.detected_items
            : [],
          suggestions: Array.isArray(res.suggestions) ? res.suggestions : [],
        };

        setPhotoResult(safeRes);
        if (safeRes.wellness) {
          setWellness(safeRes.wellness);
        }

        // Öğün geçmişini anında güncelle
        const syntheticLog: NutritionMealLog = {
          id: safeRes.log_id || Date.now(),
          date:
            safeRes.wellness?.date || new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
          source: 'photo',
          meal_type: safeRes.meal_type || activeMealType,
          portion_size: safeRes.portion_size || activePortionSize,
          meal_description: safeRes.meal_title || activeFilename || 'Fotoğraflı öğün',
          photo_thumbnail: activeImageUri,
          calories: safeRes.total_calories,
          protein_g: safeRes.protein_g,
          carbs_g: safeRes.carbs_g,
          fat_g: safeRes.fat_g,
          fiber_g: safeRes.fiber_g,
          sugar_g: safeRes.sugar_g,
          health_score: safeRes.health_score,
          glycemic_load: safeRes.glycemic_load,
          burn_equivalent: safeRes.burn_equivalent,
          detected_items: safeRes.detected_items,
          coach_note: safeRes.coach_note,
        };
        setMealLogs((prev) => [
          syntheticLog,
          ...prev.filter((item) => item.id !== syntheticLog.id),
        ]);

        fetchMealLogs();
        triggerGlobalRefresh();
        onShowBanner?.(
          'success',
          `${safeRes.meal_title}: +${formatNumber(safeRes.total_calories)} kcal günlük makrolarınıza eklendi`
        );
      } catch (err: any) {
        onShowBanner?.(
          'error',
          err?.message || 'Fotoğraf analizi sırasında sunucuya ulaşılamadı'
        );
      } finally {
        setPhotoAnalyzing(false);
      }
    },
    [
      fetchMealLogs,
      mealType,
      member.id,
      onShowBanner,
      photoNotes,
      portionSize,
      selectedPhotoName,
      selectedPhotoUri,
      triggerGlobalRefresh,
    ]
  );

  const handleSelectSamplePlate = useCallback(
    (sample: SamplePlatePreset) => {
      if (photoAnalyzing) return;
      const generatedUri = generateSamplePlateDataUri(sample);
      setSelectedPhotoUri(generatedUri);
      setSelectedPhotoName(sample.filename);
      setMealType(sample.mealType);
      setPortionSize(sample.portionSize);
      setPhotoNotes(sample.notes);
      setPhotoResult(null);

      executePhotoAnalysis({
        imageUri: generatedUri,
        filename: sample.filename,
        mealType: sample.mealType,
        portionSize: sample.portionSize,
        notes: sample.notes,
      });
    },
    [executePhotoAnalysis, photoAnalyzing]
  );

  const handleAnalyzeTextMeal = useCallback(async () => {
    const cleaned = mealText.trim();
    if (!cleaned) {
      onShowBanner?.(
        'warning',
        'Analiz edilecek öğünü yazın veya hazır örneklerden birini seçin'
      );
      return;
    }

    setTextAnalyzing(true);
    try {
      const res = await apiRequest<NutritionAnalyzeResponse>(
        '/nutrition/analyze',
        {
          method: 'POST',
          body: JSON.stringify({
            member_id: member.id,
            meal_text: cleaned,
          }),
        }
      );

      if (res?.wellness) {
        setWellness(res.wellness);
      }
      setLastTextAnalysis(res);
      setMealText('');
      fetchMealLogs();
      triggerGlobalRefresh();
      onShowBanner?.(
        'success',
        `+${formatNumber(res.added_calories)} kcal ve +${formatDecimalGram(res.added_protein_g)} g protein günlük hedefinize eklendi`
      );
    } catch (err: any) {
      onShowBanner?.(
        'error',
        err?.message || 'Öğün analizi sırasında sunucuya ulaşılamadı'
      );
    } finally {
      setTextAnalyzing(false);
    }
  }, [fetchMealLogs, mealText, member.id, onShowBanner, triggerGlobalRefresh]);

  // Su halkası SVG ölçüleri
  const ringSize = 128;
  const strokeWidth = 10;
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
        label: 'Kalori',
        current: wellness.calories_intake,
        goal: calGoal,
        unit: 'kcal',
        color: COLORS.primary,
      },
      {
        key: 'protein',
        label: 'Protein',
        current: wellness.protein_g,
        goal: proGoal,
        unit: 'g',
        color: COLORS.success,
      },
      {
        key: 'carbs',
        label: 'Karbonhidrat',
        current: wellness.carbs_g,
        goal: carbGoal,
        unit: 'g',
        color: COLORS.walnut,
      },
      {
        key: 'fat',
        label: 'Sağlıklı yağ',
        current: wellness.fat_g,
        goal: fatGoal,
        unit: 'g',
        color: COLORS.secondary,
      },
    ];
  }, [wellness]);

  const photoHealthTone = photoResult
    ? getHealthScoreTone(photoResult.health_score)
    : null;

  const todayDateLabel = useMemo(() => formatTodayTurkishDate(), []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
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
      {/* Web gizli dosya ve kamera girişleri */}
      {Platform.OS === 'web'
        ? React.createElement('input', {
            ref: galleryInputRef,
            type: 'file',
            accept: 'image/*',
            onChange: handleWebFileChange,
            style: { display: 'none' },
          })
        : null}
      {Platform.OS === 'web'
        ? React.createElement('input', {
            ref: cameraInputRef,
            type: 'file',
            accept: 'image/*',
            capture: 'environment',
            onChange: handleWebFileChange,
            style: { display: 'none' },
          })
        : null}

      {/* SAYFA BAŞLIĞI */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageDate}>{todayDateLabel}</Text>
        <Text style={styles.pageTitle}>Beslenme ve toparlanma</Text>
        <Text style={styles.pageSubtitle}>
          Tabak fotoğrafından kalori ve makro analizi, günlük su hedefi ve seans
          öncesi enerji bildirimi
        </Text>
        <View style={styles.freeMemberBenefitPill}>
          <CheckCircle2 size={13} color={COLORS.success} strokeWidth={1.9} />
          <Text style={styles.freeMemberBenefitText}>
            AI Beslenme & Toparlanma araçları tüm aktif kulüp üyelerine ücretsiz dahil
          </Text>
        </View>
      </View>

      {loadError && (
        <View style={styles.loadErrorBox}>
          <Text style={styles.loadErrorText}>{loadError}</Text>
          <TouchableOpacity
            style={styles.loadErrorRetryBtn}
            onPress={fetchAllData}
            activeOpacity={0.85}
          >
            <Text style={styles.loadErrorRetryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 1. ANA MODÜL: FOTOĞRAFTAN AI KALORİ & BESİN ANALİZİ */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <ScanLine size={18} color={COLORS.textSecondary} strokeWidth={1.6} />
            <Text style={styles.cardTitle}>Fotoğraftan kalori ve besin analizi</Text>
          </View>
        </View>

        {/* Mod Geçişi */}
        <View style={styles.segmentTrack}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              mode === 'photo' && styles.segmentBtnActive,
            ]}
            onPress={() => setMode('photo')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'photo' }}
          >
            <Camera
              size={16}
              color={mode === 'photo' ? COLORS.textPrimary : COLORS.textMuted}
              strokeWidth={1.6}
            />
            <Text
              style={[
                styles.segmentText,
                mode === 'photo' && styles.segmentTextActive,
              ]}
            >
              Fotoğraf ile analiz
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              mode === 'text' && styles.segmentBtnActive,
            ]}
            onPress={() => setMode('text')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'text' }}
          >
            <FileText
              size={16}
              color={mode === 'text' ? COLORS.textPrimary : COLORS.textMuted}
              strokeWidth={1.6}
            />
            <Text
              style={[
                styles.segmentText,
                mode === 'text' && styles.segmentTextActive,
              ]}
            >
              Metinle hızlı yaz
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'photo' ? (
          <View style={styles.moduleBody}>
            {/* Fotoğraf Yükleme / Önizleme Alanı */}
            {selectedPhotoUri ? (
              <View style={styles.previewCard}>
                <View style={styles.previewImageWrap}>
                  <Image
                    source={{ uri: selectedPhotoUri }}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                  {photoAnalyzing && (
                    <View style={styles.scanningOverlay}>
                      <ActivityIndicator size="small" color={COLORS.white} />
                      <Text style={styles.scanningTitle}>
                        Tabak analiz ediliyor
                      </Text>
                      <Text style={styles.scanningSub}>
                        Yiyecek kalemleri, porsiyon ve makrolar hesaplanıyor
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.previewFooter}>
                  <View style={styles.previewFileMeta}>
                    <ImageIcon
                      size={16}
                      color={COLORS.textMuted}
                      strokeWidth={1.5}
                    />
                    <Text style={styles.previewFileName} numberOfLines={1}>
                      {selectedPhotoName || 'Seçili tabak fotoğrafı'}
                    </Text>
                  </View>

                  <View style={styles.previewActions}>
                    <TouchableOpacity
                      style={styles.ghostIconBtn}
                      onPress={handleTriggerGallery}
                      disabled={photoAnalyzing}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                    >
                      <RefreshCw
                        size={14}
                        color={COLORS.textSecondary}
                        strokeWidth={1.6}
                      />
                      <Text style={styles.ghostBtnText}>Değiştir</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.ghostIconBtn}
                      onPress={handleClearPhoto}
                      disabled={photoAnalyzing}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                    >
                      <Trash2
                        size={14}
                        color={COLORS.textSecondary}
                        strokeWidth={1.6}
                      />
                      <Text style={styles.ghostBtnText}>Kaldır</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.uploadDropzone}>
                <View style={styles.uploadIconFrame}>
                  {preparingPhoto ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Camera
                      size={22}
                      color={COLORS.textSecondary}
                      strokeWidth={1.5}
                    />
                  )}
                </View>
                <Text style={styles.uploadTitle}>
                  Öğün fotoğrafınızı yükleyin veya çekin
                </Text>
                <Text style={styles.uploadDesc}>
                  Yüksek boyutlu fotoğraflar otomatik optimize edilerek saniyeler
                  içinde analiz edilir
                </Text>

                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity
                    style={styles.uploadPrimaryBtn}
                    onPress={handleTriggerCamera}
                    disabled={preparingPhoto}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                  >
                    <Camera size={16} color={COLORS.white} strokeWidth={1.6} />
                    <Text style={styles.uploadPrimaryBtnText}>Kamera ile çek</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.uploadSecondaryBtn}
                    onPress={handleTriggerGallery}
                    disabled={preparingPhoto}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                  >
                    <Upload
                      size={16}
                      color={COLORS.textPrimary}
                      strokeWidth={1.6}
                    />
                    <Text style={styles.uploadSecondaryBtnText}>
                      Fotoğraf seç
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Hızlı Öğün Şablonları */}
            <View style={styles.paramBlock}>
              <Text style={styles.fieldLabel}>Hızlı öğün şablonları</Text>
              <View style={styles.chipsWrap}>
                {SAMPLE_PLATES.map((sample) => {
                  const isCurrent = selectedPhotoName === sample.filename;
                  return (
                    <TouchableOpacity
                      key={sample.id}
                      style={[
                        styles.sampleChip,
                        isCurrent && styles.sampleChipActive,
                      ]}
                      onPress={() => handleSelectSamplePlate(sample)}
                      disabled={photoAnalyzing}
                      activeOpacity={0.78}
                      accessibilityRole="button"
                    >
                      <View
                        style={[
                          styles.sampleDot,
                          { backgroundColor: sample.palette[0] },
                        ]}
                      />
                      <Text
                        style={[
                          styles.sampleChipText,
                          isCurrent && styles.sampleChipTextActive,
                        ]}
                      >
                        {sample.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Öğün Tipi Seçici */}
            <View style={styles.paramBlock}>
              <Text style={styles.fieldLabel}>Öğün tipi</Text>
              <View style={styles.optionRow}>
                {MEAL_TYPE_OPTIONS.map((opt) => {
                  const active = mealType === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.optionChip,
                        active && styles.optionChipActive,
                      ]}
                      onPress={() => setMealType(opt)}
                      activeOpacity={0.78}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Porsiyon Ölçeği Seçici */}
            <View style={styles.paramBlock}>
              <Text style={styles.fieldLabel}>Porsiyon ölçeği</Text>
              <View style={styles.optionRow}>
                {PORTION_SIZE_OPTIONS.map((opt) => {
                  const active = portionSize === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.optionChip,
                        styles.optionChipEqual,
                        active && styles.optionChipActive,
                      ]}
                      onPress={() => setPortionSize(opt)}
                      activeOpacity={0.78}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* İçerik İpucu (Opsiyonel) */}
            <View style={styles.paramBlock}>
              <Text style={styles.fieldLabel}>İçerik ipucu (opsiyonel)</Text>
              <TextInput
                style={styles.notesInput}
                value={photoNotes}
                onChangeText={setPhotoNotes}
                placeholder="Örn. Az yağlı, sossuz, yanında ayran var"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>

            {/* Birincil Analiz Butonu */}
            <TouchableOpacity
              style={[
                styles.primaryCta,
                (photoAnalyzing || !selectedPhotoUri) && styles.primaryCtaMuted,
              ]}
              onPress={() => executePhotoAnalysis()}
              disabled={photoAnalyzing}
              activeOpacity={0.84}
              accessibilityRole="button"
            >
              {photoAnalyzing ? (
                <View style={styles.ctaLoadingRow}>
                  <ActivityIndicator size="small" color={COLORS.white} />
                  <Text style={styles.primaryCtaText}>
                    Fotoğraf analiz ediliyor
                  </Text>
                </View>
              ) : (
                <View style={styles.ctaLoadingRow}>
                  <ScanLine size={17} color={COLORS.white} strokeWidth={1.7} />
                  <Text style={styles.primaryCtaText}>
                    Fotoğrafı AI ile analiz et
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* DETAYLI BESİN ANALİZ RAPOR KARTI */}
            {photoResult && photoHealthTone && (
              <View style={styles.reportCard}>
                {/* Rapor Başlık ve Sağlık Skoru */}
                <View style={styles.reportTopRow}>
                  <View style={styles.reportTitleCol}>
                    <Text style={styles.reportMealTitle}>
                      {photoResult.meal_title}
                    </Text>
                    <Text style={styles.reportMetaLine}>
                      {photoResult.meal_type} · {photoResult.portion_size} porsiyon
                      {photoResult.analysis_engine
                        ? ` · ${photoResult.analysis_engine}`
                        : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.healthBadge,
                      {
                        backgroundColor: photoHealthTone.bg,
                        borderColor: photoHealthTone.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.healthBadgeScore,
                        { color: photoHealthTone.text },
                      ]}
                    >
                      {Math.round(photoResult.health_score)}/100
                    </Text>
                    <Text
                      style={[
                        styles.healthBadgeLabel,
                        { color: photoHealthTone.text },
                      ]}
                    >
                      Sağlık skoru
                    </Text>
                  </View>
                </View>

                {/* Büyük Kalori + Glisemik Yük & Egzersiz Yakım Eşdeğeri */}
                <View style={styles.reportHeroStats}>
                  <View style={styles.reportCalorieBlock}>
                    <Text style={styles.reportCalorieValue}>
                      {formatNumber(photoResult.total_calories)}
                    </Text>
                    <Text style={styles.reportCalorieUnit}>kcal toplam</Text>
                  </View>

                  <View style={styles.reportSecondaryStats}>
                    <View style={styles.reportMetaTile}>
                      <Text style={styles.reportMetaTileLabel}>Glisemik yük</Text>
                      <Text style={styles.reportMetaTileValue}>
                        {photoResult.glycemic_load || 'Dengeli'}
                      </Text>
                    </View>
                    <View style={styles.reportMetaTile}>
                      <Text style={styles.reportMetaTileLabel}>
                        Egzersiz eşdeğeri
                      </Text>
                      <Text style={styles.reportMetaTileValue}>
                        {photoResult.burn_equivalent || 'Reformer Pilates'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 5'li Makro Izgarası */}
                <View style={styles.macroGrid5}>
                  {[
                    {
                      label: 'Protein',
                      value: `${formatDecimalGram(photoResult.protein_g)} g`,
                      dot: COLORS.success,
                    },
                    {
                      label: 'Karb',
                      value: `${formatDecimalGram(photoResult.carbs_g)} g`,
                      dot: COLORS.walnut,
                    },
                    {
                      label: 'Yağ',
                      value: `${formatDecimalGram(photoResult.fat_g)} g`,
                      dot: COLORS.secondary,
                    },
                    {
                      label: 'Lif',
                      value: `${formatDecimalGram(photoResult.fiber_g)} g`,
                      dot: COLORS.primary,
                    },
                    {
                      label: 'Şeker',
                      value: `${formatDecimalGram(photoResult.sugar_g)} g`,
                      dot: COLORS.warning,
                    },
                  ].map((item) => (
                    <View key={item.label} style={styles.macroGridCell}>
                      <View style={styles.macroGridLabelRow}>
                        <View
                          style={[
                            styles.macroGridDot,
                            { backgroundColor: item.dot },
                          ]}
                        />
                        <Text style={styles.macroGridLabel}>{item.label}</Text>
                      </View>
                      <Text style={styles.macroGridValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Tespit Edilen Yiyecek Kalemleri */}
                {photoResult.detected_items.length > 0 && (
                  <View style={styles.detectedSection}>
                    <Text style={styles.reportSubHeading}>
                      Tespit edilen yiyecek kalemleri
                    </Text>
                    <View style={styles.detectedTable}>
                      {photoResult.detected_items.map((item, idx) => (
                        <View
                          key={`${item.name}-${idx}`}
                          style={[
                            styles.detectedRow,
                            idx > 0 && styles.detectedRowBorder,
                          ]}
                        >
                          <View style={styles.detectedNameCol}>
                            <Text style={styles.detectedName}>{item.name}</Text>
                            <Text style={styles.detectedPortion}>
                              {item.portion} · K {formatDecimalGram(item.carbs_g)}g
                              {' · '}Y {formatDecimalGram(item.fat_g)}g
                            </Text>
                          </View>

                          <View style={styles.detectedStatsCol}>
                            <Text style={styles.detectedCalories}>
                              {formatNumber(item.calories)} kcal ·{' '}
                              {formatDecimalGram(item.protein_g)}g P
                            </Text>
                            <Text style={styles.detectedConfidence}>
                              Güven %{Math.round(item.confidence_pct)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* AI Beslenme Koçu Değerlendirmesi & Öneriler */}
                <View style={styles.coachBox}>
                  <Text style={styles.coachBoxHeading}>
                    Beslenme koçu değerlendirmesi
                  </Text>
                  <Text style={styles.coachBoxText}>
                    {normalizeCoachNote(photoResult.coach_note)}
                  </Text>

                  {photoResult.suggestions.length > 0 && (
                    <View style={styles.suggestionsList}>
                      {photoResult.suggestions.map((tip, idx) => (
                        <View key={`${tip}-${idx}`} style={styles.suggestionRow}>
                          <View style={styles.suggestionBullet} />
                          <Text style={styles.suggestionText}>{tip}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        ) : (
          /* METİNLE HIZLI YAZ MODU */
          <View style={styles.moduleBody}>
            <Text style={styles.moduleIntro}>
              Yediğiniz öğünü doğal dille yazın veya sık tüketilen öğün
              seçeneklerinden birini seçerek günlük makrolarınıza ekleyin
            </Text>

            <View style={styles.chipsWrap}>
              {QUICK_MEAL_PRESETS.map((preset) => {
                const isPicked = mealText.trim() === preset.text;
                return (
                  <TouchableOpacity
                    key={preset.text}
                    style={[
                      styles.sampleChip,
                      isPicked && styles.sampleChipActive,
                    ]}
                    onPress={() => setMealText(preset.text)}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.sampleChipText,
                        isPicked && styles.sampleChipTextActive,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.textMealInput}
              value={mealText}
              onChangeText={setMealText}
              placeholder="Örn. 200g ızgara tavuk göğsü ve 1 tabak pirinç pilavı"
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[
                styles.primaryCta,
                (textAnalyzing || !mealText.trim()) && styles.primaryCtaMuted,
              ]}
              onPress={handleAnalyzeTextMeal}
              disabled={textAnalyzing}
              activeOpacity={0.84}
              accessibilityRole="button"
            >
              {textAnalyzing ? (
                <View style={styles.ctaLoadingRow}>
                  <ActivityIndicator size="small" color={COLORS.white} />
                  <Text style={styles.primaryCtaText}>Öğün analiz ediliyor</Text>
                </View>
              ) : (
                <Text style={styles.primaryCtaText}>
                  Analiz et ve günlüğüme ekle
                </Text>
              )}
            </TouchableOpacity>

            {lastTextAnalysis && (
              <View style={styles.textResultCard}>
                <Text style={styles.textResultTitle} numberOfLines={2}>
                  Eklenen öğün: {lastTextAnalysis.meal_text}
                </Text>
                <View style={styles.textResultMacros}>
                  <Text style={styles.textResultMacroItem}>
                    +{formatNumber(lastTextAnalysis.added_calories)} kcal
                  </Text>
                  <Text style={styles.textResultDivider}>·</Text>
                  <Text style={styles.textResultMacroItem}>
                    +{formatDecimalGram(lastTextAnalysis.added_protein_g)}g protein
                  </Text>
                  <Text style={styles.textResultDivider}>·</Text>
                  <Text style={styles.textResultMacroItem}>
                    +{formatDecimalGram(lastTextAnalysis.added_carbs_g)}g karb
                  </Text>
                  <Text style={styles.textResultDivider}>·</Text>
                  <Text style={styles.textResultMacroItem}>
                    +{formatDecimalGram(lastTextAnalysis.added_fat_g)}g yağ
                  </Text>
                </View>

                <View style={styles.coachBox}>
                  <Text style={styles.coachBoxHeading}>Koç notu</Text>
                  <Text style={styles.coachBoxText}>
                    {normalizeCoachNote(lastTextAnalysis.coach_note)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 2. GÜNLÜK KALORİ & MAKRO İLERLEME ÇUBUKLARI */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Flame size={18} color={COLORS.textSecondary} strokeWidth={1.6} />
            <Text style={styles.cardTitle}>Günlük kalori ve makro dengesi</Text>
          </View>
          <Text style={styles.cardHeaderMeta}>
            {formatNumber(wellness.calories_intake)} /{' '}
            {formatNumber(wellness.calories_goal || 2100)} kcal
          </Text>
        </View>

        <View style={styles.macroList}>
          {macroRows.map((m) => {
            const pct = Math.min(100, Math.round((m.current / m.goal) * 100));
            return (
              <View key={m.key} style={styles.macroItem}>
                <View style={styles.macroHeaderRow}>
                  <View style={styles.macroLabelGroup}>
                    <View
                      style={[
                        styles.macroStatusDot,
                        { backgroundColor: m.color },
                      ]}
                    />
                    <Text style={styles.macroLabel}>{m.label}</Text>
                  </View>
                  <Text style={styles.macroValueText}>
                    {formatNumber(m.current)} / {formatNumber(m.goal)} {m.unit}
                    {'  '}
                    <Text style={styles.macroPctText}>%{pct}</Text>
                  </Text>
                </View>

                <View style={styles.macroTrack}>
                  <View
                    style={[
                      styles.macroFill,
                      {
                        width: `${Math.max(m.current > 0 ? 4 : 0, pct)}%`,
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

      {/* 3. SU TÜKETİM HALKASI (+250 ML) */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Droplets size={18} color={COLORS.textSecondary} strokeWidth={1.6} />
            <Text style={styles.cardTitle}>Günlük su tüketimi</Text>
          </View>
          <Text style={styles.cardHeaderMeta}>
            {glassesCount} / {glassesGoal} bardak · %{waterPct}
          </Text>
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
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={WATER_TRACK}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={WATER_ACCENT}
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
            </View>
          </TouchableOpacity>

          <View style={styles.waterActionCol}>
            <Text style={styles.waterInfoDesc}>
              Kas esnekliği ve seans sonrası toparlanma için her bardakta tek
              dokunuşla kayıt ekleyin.
            </Text>

            <TouchableOpacity
              style={[styles.addWaterBtn, addingWater && { opacity: 0.72 }]}
              onPress={handleAddWater}
              disabled={addingWater}
              activeOpacity={0.84}
              accessibilityRole="button"
            >
              <Plus size={16} color={COLORS.white} strokeWidth={1.8} />
              <Text style={styles.addWaterBtnText}>+250 ml su ekle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 4. ENERJİ SEÇİCİSİ */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Activity size={18} color={COLORS.textSecondary} strokeWidth={1.6} />
            <Text style={styles.cardTitle}>Bugün nasıl hissediyorsun</Text>
          </View>
        </View>

        <Text style={styles.cardSubtext}>
          Seçiminiz bugünkü ders öncesinde eğitmeninizin yoklama ekranına
          yansır
        </Text>

        <View style={styles.energyChoicesCol}>
          {ENERGY_OPTIONS.map((opt) => {
            const isSelected = wellness.energy_status === opt.key;
            const iconColor = isSelected ? opt.activeText : COLORS.textMuted;
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
                <View style={styles.energyLeftGroup}>
                  <View style={styles.energyIconBox}>
                    {opt.key === 'high' ? (
                      <Zap size={16} color={iconColor} strokeWidth={1.6} />
                    ) : opt.key === 'normal' ? (
                      <Activity size={16} color={iconColor} strokeWidth={1.6} />
                    ) : (
                      <Moon size={16} color={iconColor} strokeWidth={1.6} />
                    )}
                  </View>
                  <View style={styles.energyTextCol}>
                    <Text
                      style={[
                        styles.energyOptionLabel,
                        isSelected && {
                          color: opt.activeText,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.energyOptionDetail}>{opt.detail}</Text>
                  </View>
                </View>

                {isSelected && (
                  <CheckCircle2
                    size={16}
                    color={opt.activeText}
                    strokeWidth={1.8}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {wellness.energy_status === 'low' && (
          <View style={styles.lowEnergyNote}>
            <Info size={16} color={COLORS.warningText} strokeWidth={1.6} />
            <Text style={styles.lowEnergyNoteText}>
              Eğitmen ekranına bildirim iletildi. Bugün yorgun hissettiğiniz
              yoklama listenizde görünür ve antrenman temponuz kontrollü
              tutulur.
            </Text>
          </View>
        )}
      </View>

      {/* 5. BUGÜNKÜ ÖĞÜN GEÇMİŞİ */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Clock size={18} color={COLORS.textSecondary} strokeWidth={1.6} />
            <Text style={styles.cardTitle}>Bugünkü öğün geçmişi</Text>
          </View>
          <Text style={styles.cardHeaderMeta}>
            {logsLoading ? 'Yükleniyor' : `${mealLogs.length} kayıt`}
          </Text>
        </View>

        {(mealLogs ?? []).length === 0 ? (
          <View style={styles.emptyLogsBox}>
            <Utensils size={18} color={COLORS.textMuted} strokeWidth={1.5} />
            <Text style={styles.emptyLogsTitle}>Henüz öğün kaydı yok</Text>
            <Text style={styles.emptyLogsSub}>
              Yukarıdan tabak fotoğrafı analiz ettiğinizde öğünleriniz saat
              sırasıyla burada listelenir
            </Text>
          </View>
        ) : (
          <View style={styles.logsTimeline}>
            {(mealLogs ?? []).map((log, index) => {
              const thumbUri = normalizeImageUri(log.photo_thumbnail);
              const isExpanded = expandedLogId === log.id;
              const scoreTone = getHealthScoreTone(Number(log.health_score || 0));
              const items = Array.isArray(log.detected_items)
                ? log.detected_items
                : [];

              return (
                <View
                  key={`${log.id}-${index}`}
                  style={[
                    styles.logCard,
                    index > 0 && styles.logCardTopBorder,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.logHeaderTouch}
                    onPress={() =>
                      setExpandedLogId((prev) =>
                        prev === log.id ? null : log.id
                      )
                    }
                    activeOpacity={0.78}
                    accessibilityRole="button"
                  >
                    {thumbUri ? (
                      <Image
                        source={{ uri: thumbUri }}
                        style={styles.logThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.logThumbFallback}>
                        {log.source === 'photo' ? (
                          <Camera
                            size={16}
                            color={COLORS.textMuted}
                            strokeWidth={1.5}
                          />
                        ) : (
                          <FileText
                            size={16}
                            color={COLORS.textMuted}
                            strokeWidth={1.5}
                          />
                        )}
                      </View>
                    )}

                    <View style={styles.logMainCol}>
                      <View style={styles.logTopLine}>
                        <Text style={styles.logTitle} numberOfLines={1}>
                          {log.meal_description || 'Kayıtlı öğün'}
                        </Text>
                        <Text style={styles.logCalories}>
                          {formatNumber(log.calories)} kcal
                        </Text>
                      </View>

                      <View style={styles.logMetaRow}>
                        <Text style={styles.logMetaText}>
                          {formatLogTime(log.created_at)} · {log.meal_type || 'Öğün'}
                          {log.portion_size ? ` · ${log.portion_size}` : ''}
                        </Text>
                        {Number(log.health_score) > 0 && (
                          <Text
                            style={[
                              styles.logScoreText,
                              { color: scoreTone.text },
                            ]}
                          >
                            {Math.round(log.health_score)}/100
                          </Text>
                        )}
                      </View>

                      <View style={styles.logMacroRow}>
                        <Text style={styles.logMacroSummary}>
                          P {formatDecimalGram(log.protein_g)}g · K{' '}
                          {formatDecimalGram(log.carbs_g)}g · Y{' '}
                          {formatDecimalGram(log.fat_g)}g
                          {Number(log.fiber_g) > 0
                            ? ` · Lif ${formatDecimalGram(log.fiber_g)}g`
                            : ''}
                        </Text>
                        {isExpanded ? (
                          <ChevronUp
                            size={15}
                            color={COLORS.textMuted}
                            strokeWidth={1.6}
                          />
                        ) : (
                          <ChevronDown
                            size={15}
                            color={COLORS.textMuted}
                            strokeWidth={1.6}
                          />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.logExpandedBody}>
                      {(log.glycemic_load || log.burn_equivalent) && (
                        <View style={styles.logExpandedMetaRow}>
                          {log.glycemic_load ? (
                            <Text style={styles.logExpandedMetaItem}>
                              Glisemik yük: {log.glycemic_load}
                            </Text>
                          ) : null}
                          {log.burn_equivalent ? (
                            <Text style={styles.logExpandedMetaItem}>
                              Yakım: {log.burn_equivalent}
                            </Text>
                          ) : null}
                        </View>
                      )}

                      {items.length > 0 && (
                        <View style={styles.logDetectedList}>
                          {items.map((dItem, dIdx) => (
                            <View
                              key={`${dItem.name}-${dIdx}`}
                              style={styles.logDetectedItemRow}
                            >
                              <Text style={styles.logDetectedName}>
                                {dItem.name} ({dItem.portion})
                              </Text>
                              <Text style={styles.logDetectedCal}>
                                {formatNumber(dItem.calories)} kcal ·{' '}
                                {formatDecimalGram(dItem.protein_g)}g P
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {log.coach_note ? (
                        <Text style={styles.logCoachNote}>
                          {normalizeCoachNote(log.coach_note)}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* SAĞLIK & BESLENME SORUMLULUK REDDİ (APP STORE 1.4.1) */}
      <View style={styles.medicalDisclaimerBox}>
        <Info size={16} color={COLORS.textSecondary} strokeWidth={1.7} />
        <Text style={styles.medicalDisclaimerText}>
          Bilgilendirme: Bu alandaki analizler ve notlar yalnızca spor/fitness
          takibi amaçlıdır; tıbbi tanı, tedavi veya doktor tavsiyesi yerine
          geçmez.
        </Text>
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
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  pageHeader: {
    gap: 4,
    paddingBottom: 4,
  },
  pageDate: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textMuted,
    textTransform: 'capitalize',
  },
  pageTitle: {
    fontFamily: FONTS.serif,
    fontSize: 30,
    fontWeight: '500',
    lineHeight: 36,
    color: COLORS.textPrimary,
  },
  pageSubtitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...CARD_SHADOW,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  cardHeaderMeta: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  cardSubtext: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: -8,
  },

  // Mode Segmented Control
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 10,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  segmentTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  moduleBody: {
    gap: 16,
  },
  moduleIntro: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textSecondary,
  },

  // Upload Dropzone
  uploadDropzone: {
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  uploadIconFrame: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  uploadTitle: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  uploadDesc: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  uploadBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    width: '100%',
  },
  uploadPrimaryBtn: {
    flex: 1,
    minWidth: 132,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: COLORS.espresso,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  uploadPrimaryBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
  },
  uploadSecondaryBtn: {
    flex: 1,
    minWidth: 132,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  uploadSecondaryBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },

  // Photo Preview Card
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundAlt,
    overflow: 'hidden',
  },
  previewImageWrap: {
    width: '100%',
    height: 216,
    backgroundColor: COLORS.surfaceElevated,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(34, 29, 25, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  scanningTitle: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  scanningSub: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    color: '#E6DCCB',
    textAlign: 'center',
  },
  previewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  previewFileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  previewFileName: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    flex: 1,
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceElevated,
  },
  ghostBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },

  // Parameters
  paramBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sampleChipActive: {
    backgroundColor: COLORS.primarySurface,
    borderColor: COLORS.primaryBorder,
  },
  sampleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sampleChipText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    color: COLORS.textPrimary,
  },
  sampleChipTextActive: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipEqual: {
    flex: 1,
  },
  optionChipActive: {
    backgroundColor: COLORS.primarySurface,
    borderColor: COLORS.primary,
  },
  optionChipText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  optionChipTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  notesInput: {
    minHeight: 60,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  textMealInput: {
    minHeight: 84,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textPrimary,
  },

  // Primary CTA
  primaryCta: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryCtaMuted: {
    opacity: 0.6,
  },
  ctaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryCtaText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },

  // Detailed Analysis Report Card
  reportCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.backgroundAlt,
    padding: 16,
    gap: 16,
  },
  reportTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportTitleCol: {
    flex: 1,
    gap: 4,
  },
  reportMealTitle: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
    color: COLORS.textPrimary,
  },
  reportMetaLine: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
  },
  healthBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'flex-end',
  },
  healthBadgeScore: {
    fontFamily: FONTS.sans,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  healthBadgeLabel: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '400',
  },
  reportHeroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  reportCalorieBlock: {
    minWidth: 120,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
  },
  reportCalorieValue: {
    fontFamily: FONTS.serif,
    fontSize: 32,
    fontWeight: '500',
    lineHeight: 34,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  reportCalorieUnit: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
  },
  reportSecondaryStats: {
    flex: 1,
    minWidth: 160,
    gap: 8,
    justifyContent: 'space-between',
  },
  reportMetaTile: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  reportMetaTileLabel: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.textMuted,
  },
  reportMetaTileValue: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },

  // 5-Macro Grid
  macroGrid5: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  macroGridCell: {
    flexGrow: 1,
    minWidth: '18%',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  macroGridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroGridDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  macroGridLabel: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.textMuted,
  },
  macroGridValue: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // Detected Food Items Table
  detectedSection: {
    gap: 8,
  },
  reportSubHeading: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  detectedTable: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detectedRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detectedNameCol: {
    flex: 1,
    gap: 2,
  },
  detectedName: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  detectedPortion: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  detectedStatsCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  detectedCalories: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  detectedConfidence: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },

  // Coach Evaluation Box
  coachBox: {
    backgroundColor: COLORS.primarySurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    padding: 12,
    gap: 8,
  },
  coachBoxHeading: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  coachBoxText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  suggestionsList: {
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.primaryBorder,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  suggestionBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 7,
  },
  suggestionText: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
    color: COLORS.textSecondary,
  },

  // Text Mode Result Card
  textResultCard: {
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  textResultTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  textResultMacros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  textResultMacroItem: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  textResultDivider: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Daily Macro Progress Bars
  macroList: {
    gap: 12,
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
  macroLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroLabel: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  macroValueText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  macroPctText: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  macroTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Water Ring
  waterBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  waterRingTouch: {
    width: 128,
    height: 128,
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
    fontSize: 28,
    fontWeight: '500',
    lineHeight: 30,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  waterLitersGoal: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  waterActionCol: {
    flex: 1,
    gap: 12,
  },
  waterInfoDesc: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  addWaterBtn: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: WATER_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addWaterBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
    fontVariant: ['tabular-nums'],
  },

  // Energy Selector
  energyChoicesCol: {
    gap: 8,
  },
  energyOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.backgroundAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  energyLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  energyIconBox: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  energyTextCol: {
    gap: 2,
    flex: 1,
  },
  energyOptionLabel: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  energyOptionDetail: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
  },
  lowEnergyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: 10,
    padding: 12,
  },
  lowEnergyNoteText: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
    color: COLORS.warningText,
  },

  // Today's Meal History Timeline
  emptyLogsBox: {
    backgroundColor: COLORS.backgroundAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  emptyLogsTitle: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  emptyLogsSub: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  logsTimeline: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundAlt,
    overflow: 'hidden',
  },
  logCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  logCardTopBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  logHeaderTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logThumbFallback: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logMainCol: {
    flex: 1,
    gap: 4,
  },
  logTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logTitle: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  logCalories: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logMetaText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  logScoreText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  logMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logMacroSummary: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  logExpandedBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    gap: 8,
  },
  logExpandedMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  logExpandedMetaItem: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  logDetectedList: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  logDetectedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logDetectedName: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textPrimary,
  },
  logDetectedCal: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  logCoachNote: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  freeMemberBenefitPill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  freeMemberBenefitText: {
    flexShrink: 1,
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
    lineHeight: 16,
  },
  loadErrorBox: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  loadErrorText: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.dangerText,
    lineHeight: 17.5,
  },
  loadErrorRetryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  loadErrorRetryBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  medicalDisclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  medicalDisclaimerText: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
});
