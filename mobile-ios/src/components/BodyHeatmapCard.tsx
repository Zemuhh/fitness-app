import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { CARD_SHADOW, COLORS } from '@/theme/colors';

export type BodyZoneKey =
  | 'Omuz/Boyun'
  | 'Göğüs'
  | 'Sırt/Bel'
  | 'Kollar'
  | 'Karın/Core'
  | 'Kalça/Bacak'
  | 'Diz/Eklem';

export type BodyZoneStatus = 'healthy' | 'warning' | 'injured';

export type BodyZonesRecord = Record<BodyZoneKey, BodyZoneStatus>;

export type EnergyStatus = 'high' | 'normal' | 'low';

export interface BodyZonesApiResponse {
  user_id: number;
  zones: Record<string, string>;
  message?: string;
}

export interface MemberDailyWellness {
  member_id: number;
  date: string;
  water_ml: number;
  water_goal_ml: number;
  sleep_hours: number;
  energy_status: EnergyStatus;
  calories_intake: number;
  calories_goal: number;
  protein_g: number;
  protein_goal_g: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface EnrichedTrainerMemberFields {
  body_zones?: Record<string, string> | null;
  today_energy_status?: EnergyStatus | string | null;
  today_water_ml?: number | null;
  water_goal_ml?: number | null;
  today_protein_g?: number | null;
  protein_goal_g?: number | null;
  water_pct?: number | null;
  protein_pct?: number | null;
}

export interface BodyZoneAlertItem {
  zone: BodyZoneKey;
  status: 'warning' | 'injured';
  badgeText: string;
  shortText: string;
}

export const STANDARD_BODY_ZONES: readonly {
  key: BodyZoneKey;
  index: number;
  shortHint: string;
}[] = [
  { key: 'Omuz/Boyun', index: 1, shortHint: 'Trapez, deltoid & servikal' },
  { key: 'Göğüs', index: 2, shortHint: 'Pektoral & ön gövde' },
  { key: 'Sırt/Bel', index: 3, shortHint: 'Kanat & lomber bel kuşağı' },
  { key: 'Kollar', index: 4, shortHint: 'Biceps, triceps & bilek' },
  { key: 'Karın/Core', index: 5, shortHint: 'Abdominal & merkez stabilizasyon' },
  { key: 'Kalça/Bacak', index: 6, shortHint: 'Glute, kuadriseps & baldır' },
  { key: 'Diz/Eklem', index: 7, shortHint: 'Menisküs, patella & bağlar' },
] as const;

export const DEFAULT_BODY_ZONES: BodyZonesRecord = {
  'Omuz/Boyun': 'healthy',
  Göğüs: 'healthy',
  'Sırt/Bel': 'healthy',
  Kollar: 'healthy',
  'Karın/Core': 'healthy',
  'Kalça/Bacak': 'healthy',
  'Diz/Eklem': 'healthy',
};

export const ZONE_STATUS_META: Record<
  BodyZoneStatus,
  {
    color: string;
    svgFill: string;
    svgStroke: string;
    chipBg: string;
    chipBorder: string;
    textColor: string;
    dotEmoji: string;
    shortLabel: string;
    legendLabel: string;
  }
> = {
  healthy: {
    color: '#10B981',
    svgFill: 'rgba(16, 185, 129, 0.24)',
    svgStroke: '#10B981',
    chipBg: '#ECFDF5',
    chipBorder: '#A7F3D0',
    textColor: '#047857',
    dotEmoji: '🟢',
    shortLabel: 'Sağlam',
    legendLabel: 'Sağlam / Son Antrenmanda Çalıştırıldı',
  },
  warning: {
    color: '#F59E0B',
    svgFill: 'rgba(245, 158, 11, 0.34)',
    svgStroke: '#F59E0B',
    chipBg: '#FFFBEB',
    chipBorder: '#FDE68A',
    textColor: '#B45309',
    dotEmoji: '🟡',
    shortLabel: 'Hassasiyet',
    legendLabel: 'Hassasiyet / Dikkat Edilmeli',
  },
  injured: {
    color: '#EF4444',
    svgFill: 'rgba(239, 68, 68, 0.38)',
    svgStroke: '#EF4444',
    chipBg: '#FEF2F2',
    chipBorder: '#FECACA',
    textColor: '#B91C1C',
    dotEmoji: '🔴',
    shortLabel: 'Sakatlık',
    legendLabel: 'Sakatlık / Zorlama Yasak',
  },
};

export function normalizeZoneStatus(raw?: string | null): BodyZoneStatus {
  if (raw === 'injured' || raw === 'warning' || raw === 'healthy') {
    return raw;
  }
  return 'healthy';
}

export function normalizeBodyZones(
  raw?: Record<string, string> | null
): BodyZonesRecord {
  const next: BodyZonesRecord = { ...DEFAULT_BODY_ZONES };
  if (!raw || typeof raw !== 'object') {
    return next;
  }
  for (const item of STANDARD_BODY_ZONES) {
    if (raw[item.key]) {
      next[item.key] = normalizeZoneStatus(raw[item.key]);
    }
  }
  return next;
}

export function getNextZoneStatus(current: BodyZoneStatus): BodyZoneStatus {
  if (current === 'healthy') return 'warning';
  if (current === 'warning') return 'injured';
  return 'healthy';
}

export function extractBodyZoneAlerts(
  raw?: Record<string, string> | null
): BodyZoneAlertItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const normalized = normalizeBodyZones(raw);
  const injuredList: BodyZoneAlertItem[] = [];
  const warningList: BodyZoneAlertItem[] = [];

  for (const item of STANDARD_BODY_ZONES) {
    const st = normalized[item.key];
    if (st === 'injured') {
      injuredList.push({
        zone: item.key,
        status: 'injured',
        badgeText: `🔴 ${item.key} Sakatlığı - Zorlama Yasak`,
        shortText: `🔴 ${item.key} Sakatlığı`,
      });
    } else if (st === 'warning') {
      warningList.push({
        zone: item.key,
        status: 'warning',
        badgeText: `⚠️ ${item.key} Hassasiyeti`,
        shortText: `⚠️ ${item.key} Hassasiyeti`,
      });
    }
  }

  return [...injuredList, ...warningList];
}

export function getEnergyStatusDisplay(status?: string | null): {
  key: EnergyStatus;
  label: string;
  bg: string;
  border: string;
  color: string;
} {
  if (status === 'high') {
    return {
      key: 'high',
      label: '🔋 Enerjik',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      color: '#047857',
    };
  }
  if (status === 'low') {
    return {
      key: 'low',
      label: '🪫 Uykusuz / Yorgun',
      bg: '#FEF2F2',
      border: '#FECACA',
      color: '#B91C1C',
    };
  }
  return {
    key: 'normal',
    label: '⚡ Normal',
    bg: '#FFFBEB',
    border: '#FDE68A',
    color: '#B45309',
  };
}

interface BodyHeatmapCardProps {
  userId: number;
  userName?: string;
  initialZones?: Record<string, string> | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  readOnly?: boolean;
  refreshKey?: number;
  onZonesSaved?: (zones: BodyZonesRecord) => void;
}

export function BodyHeatmapCard({
  userId,
  userName,
  initialZones,
  title = 'İnteraktif Kas & Sakatlık Haritası',
  subtitle = 'Silüet üzerindeki bölgeye veya yandaki bölge kartına dokunarak durumu değiştirin',
  compact = false,
  readOnly = false,
  refreshKey = 0,
  onZonesSaved,
}: BodyHeatmapCardProps) {
  const [zones, setZones] = useState<BodyZonesRecord>(() =>
    normalizeBodyZones(initialZones)
  );
  const [loadingInitial, setLoadingInitial] = useState<boolean>(!initialZones);
  const [savingZone, setSavingZone] = useState<BodyZoneKey | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'saved' | 'error';
    text: string;
  } | null>(null);

  const zonesRef = useRef<BodyZonesRecord>(zones);
  zonesRef.current = zones;

  const lastTapGuardRef = useRef<{ zone: BodyZoneKey | null; ts: number }>({
    zone: null,
    ts: 0,
  });

  useEffect(() => {
    if (initialZones && typeof initialZones === 'object') {
      setZones(normalizeBodyZones(initialZones));
    }
  }, [initialZones]);

  const fetchZones = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest<BodyZonesApiResponse>(
        `/users/${userId}/body-zones`
      );
      if (res?.zones) {
        setZones(normalizeBodyZones(res.zones));
      }
    } catch {
      // Bağlantı hatasında mevcut veya varsayılan bölge haritasını koru
    } finally {
      setLoadingInitial(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones, refreshKey]);

  const handleCycleZone = useCallback(
    async (zoneKey: BodyZoneKey) => {
      if (readOnly || !userId) return;

      const now = Date.now();
      if (
        lastTapGuardRef.current.zone === zoneKey &&
        now - lastTapGuardRef.current.ts < 200
      ) {
        return;
      }
      lastTapGuardRef.current = { zone: zoneKey, ts: now };

      const prevZones = zonesRef.current;
      const nextStatus = getNextZoneStatus(prevZones[zoneKey]);
      const nextZones: BodyZonesRecord = {
        ...prevZones,
        [zoneKey]: nextStatus,
      };

      // Optimistic UI güncellemesi
      setZones(nextZones);
      zonesRef.current = nextZones;
      setSavingZone(zoneKey);
      setSaveFeedback(null);

      try {
        const res = await apiRequest<BodyZonesApiResponse>(
          `/users/${userId}/body-zones`,
          {
            method: 'PUT',
            body: JSON.stringify({ zones: nextZones }),
          }
        );
        const confirmed = res?.zones ? normalizeBodyZones(res.zones) : nextZones;
        setZones(confirmed);
        zonesRef.current = confirmed;
        onZonesSaved?.(confirmed);

        const meta = ZONE_STATUS_META[confirmed[zoneKey]];
        setSaveFeedback({
          type: 'saved',
          text: `${zoneKey}: ${meta.dotEmoji} ${meta.shortLabel} olarak kaydedildi`,
        });
      } catch (err: any) {
        setZones(prevZones);
        zonesRef.current = prevZones;
        setSaveFeedback({
          type: 'error',
          text: err?.message || 'Bölge durumu kaydedilemedi.',
        });
      } finally {
        setSavingZone(null);
      }
    },
    [onZonesSaved, readOnly, userId]
  );

  const svgZoneInteractiveProps = useCallback(
    (zoneKey: BodyZoneKey) => {
      if (readOnly) return {};
      return {
        onPress: () => handleCycleZone(zoneKey),
        ...(Platform.OS === 'web'
          ? ({
              onClick: () => handleCycleZone(zoneKey),
              style: { cursor: 'pointer' },
            } as any)
          : {}),
      };
    },
    [handleCycleZone, readOnly]
  );

  const activeAlerts = useMemo(() => extractBodyZoneAlerts(zones), [zones]);

  const omz = ZONE_STATUS_META[zones['Omuz/Boyun']];
  const ggs = ZONE_STATUS_META[zones['Göğüs']];
  const srt = ZONE_STATUS_META[zones['Sırt/Bel']];
  const kol = ZONE_STATUS_META[zones['Kollar']];
  const krn = ZONE_STATUS_META[zones['Karın/Core']];
  const klc = ZONE_STATUS_META[zones['Kalça/Bacak']];
  const diz = ZONE_STATUS_META[zones['Diz/Eklem']];

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      {/* ÜST BAŞLIK & ANLIK KAYIT GÖSTERGESİ */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleCluster}>
          <View style={styles.headerIconBox}>
            <Activity size={17} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.tagRow}>
              <Text style={styles.eyebrowTag}>BİYOMEKANİK BÖLGE HARİTASI</Text>
              {userName ? (
                <Text style={styles.memberNamePill} numberOfLines={1}>
                  • {userName}
                </Text>
              ) : null}
            </View>
            <Text style={styles.titleText}>{title}</Text>
            {!readOnly && <Text style={styles.subtitleText}>{subtitle}</Text>}
          </View>
        </View>

        {savingZone ? (
          <View style={styles.savingBadge}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.savingBadgeText}>Kaydediliyor</Text>
          </View>
        ) : loadingInitial ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : null}
      </View>

      {saveFeedback ? (
        <View
          style={[
            styles.saveToastRow,
            saveFeedback.type === 'saved'
              ? styles.saveToastSuccess
              : styles.saveToastError,
          ]}
        >
          {saveFeedback.type === 'saved' ? (
            <CheckCircle2 size={13} color="#047857" />
          ) : (
            <AlertTriangle size={13} color="#B91C1C" />
          )}
          <Text
            style={[
              styles.saveToastText,
              { color: saveFeedback.type === 'saved' ? '#047857' : '#B91C1C' },
            ]}
          >
            {saveFeedback.text}
          </Text>
        </View>
      ) : null}

      {/* ANA GÖVDE: SOLDA İNTERAKTİF SVG SİLÜET, SAĞDA/ALTTA 7 BÖLGE KARTI */}
      <View style={[styles.interactiveBodyRow, compact && styles.interactiveBodyRowCompact]}>
        {/* İNTERAKTİF İNSAN VÜCUDU SİLÜETİ (SVG) */}
        <View style={styles.silhouetteContainer}>
          <Svg width={178} height={292} viewBox="0 0 220 336">
            {/* Arka Plan Anatomik Platform */}
            <Rect
              x={8}
              y={6}
              width={204}
              height={324}
              rx={22}
              fill="#FAF6EE"
              stroke="#E6DCCB"
              strokeWidth={1.2}
            />
            {/* Postür Merkez Eksen Çizgisi */}
            <Path
              d="M110 14 L110 320"
              stroke="#E2D6C1"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <Circle
              cx={110}
              cy={314}
              r={42}
              fill="rgba(201, 164, 82, 0.08)"
            />

            {/* Baş Silüeti (Nötr Referans) */}
            <G>
              <Circle
                cx={110}
                cy={28}
                r={15}
                fill="#EFE7DA"
                stroke="#C5B398"
                strokeWidth={1.6}
              />
              <Path
                d="M104 27 Q110 32 116 27"
                stroke="#B5A184"
                strokeWidth={1.2}
                fill="none"
              />
            </G>

            {/* 1. OMUZ / BOYUN */}
            <G {...svgZoneInteractiveProps('Omuz/Boyun')}>
              <Rect
                x={102}
                y={44}
                width={16}
                height={13}
                rx={5}
                fill={omz.svgFill}
                stroke={omz.svgStroke}
                strokeWidth={1.8}
              />
              <Path
                d="M64 68 C64 56, 84 53, 102 53 L118 53 C136 53, 156 56, 156 68 C156 75, 146 78, 136 76 L84 76 C74 78, 64 75, 64 68 Z"
                fill={omz.svgFill}
                stroke={omz.svgStroke}
                strokeWidth={2}
              />
              <Circle cx={110} cy={65} r={4} fill={omz.color} />
            </G>

            {/* 4. KOLLAR (Sol & Sağ Kol + Önkol) */}
            <G {...svgZoneInteractiveProps('Kollar')}>
              <Path
                d="M61 74 L74 78 L69 126 L62 174 C61 180, 52 180, 49 174 L54 125 Z"
                fill={kol.svgFill}
                stroke={kol.svgStroke}
                strokeWidth={2}
              />
              <Path
                d="M159 74 L166 125 L171 174 C168 180, 159 180, 158 174 L151 126 L146 78 Z"
                fill={kol.svgFill}
                stroke={kol.svgStroke}
                strokeWidth={2}
              />
              <Circle cx={61} cy={120} r={3.6} fill={kol.color} />
              <Circle cx={159} cy={120} r={3.6} fill={kol.color} />
            </G>

            {/* 2. GÖĞÜS (Sol & Sağ Pektoral) */}
            <G {...svgZoneInteractiveProps('Göğüs')}>
              <Path
                d="M80 79 L108 79 L108 108 C98 110, 84 107, 79 99 Z"
                fill={ggs.svgFill}
                stroke={ggs.svgStroke}
                strokeWidth={2}
              />
              <Path
                d="M112 79 L140 79 L141 99 C136 107, 122 110, 112 108 Z"
                fill={ggs.svgFill}
                stroke={ggs.svgStroke}
                strokeWidth={2}
              />
              <Circle cx={95} cy={93} r={3.2} fill={ggs.color} />
              <Circle cx={125} cy={93} r={3.2} fill={ggs.color} />
            </G>

            {/* 5. KARIN / CORE */}
            <G {...svgZoneInteractiveProps('Karın/Core')}>
              <Rect
                x={88}
                y={112}
                width={44}
                height={35}
                rx={9}
                fill={krn.svgFill}
                stroke={krn.svgStroke}
                strokeWidth={2}
              />
              <Path
                d="M110 116 L110 143 M93 124 L127 124 M93 134 L127 134"
                stroke={krn.svgStroke}
                strokeWidth={1.1}
                opacity={0.7}
              />
              <Circle cx={110} cy={129} r={3.5} fill={krn.color} />
            </G>

            {/* 3. SIRT / BEL (Kanat Konturu + Lomber Bel Kuşağı) */}
            <G {...svgZoneInteractiveProps('Sırt/Bel')}>
              <Path
                d="M76 104 L85 111 L85 145 L78 143 C74 131, 74 116, 76 104 Z"
                fill={srt.svgFill}
                stroke={srt.svgStroke}
                strokeWidth={1.8}
              />
              <Path
                d="M144 104 C146 116, 146 131, 142 143 L135 145 L135 111 Z"
                fill={srt.svgFill}
                stroke={srt.svgStroke}
                strokeWidth={1.8}
              />
              <Path
                d="M78 150 L142 150 C145 157, 144 166, 139 171 L81 171 C76 166, 75 157, 78 150 Z"
                fill={srt.svgFill}
                stroke={srt.svgStroke}
                strokeWidth={2}
              />
              <Circle cx={110} cy={156} r={2.6} fill={srt.color} />
              <Circle cx={110} cy={164} r={2.6} fill={srt.color} />
            </G>

            {/* 6. KALÇA / BACAK (Üst Bacak + Alt Baldır) */}
            <G {...svgZoneInteractiveProps('Kalça/Bacak')}>
              <Path
                d="M79 175 L108 175 L105 233 L83 233 C78 212, 77 191, 79 175 Z"
                fill={klc.svgFill}
                stroke={klc.svgStroke}
                strokeWidth={2}
              />
              <Path
                d="M112 175 L141 175 C143 191, 142 212, 137 233 L115 233 Z"
                fill={klc.svgFill}
                stroke={klc.svgStroke}
                strokeWidth={2}
              />
              <Path
                d="M84 266 L104 266 L101 312 C98 317, 88 317, 86 312 Z"
                fill={klc.svgFill}
                stroke={klc.svgStroke}
                strokeWidth={1.9}
              />
              <Path
                d="M116 266 L136 266 L134 312 C132 317, 122 317, 119 312 Z"
                fill={klc.svgFill}
                stroke={klc.svgStroke}
                strokeWidth={1.9}
              />
              <Circle cx={94} cy={202} r={3.6} fill={klc.color} />
              <Circle cx={126} cy={202} r={3.6} fill={klc.color} />
            </G>

            {/* 7. DİZ / EKLEM */}
            <G {...svgZoneInteractiveProps('Diz/Eklem')}>
              <Rect
                x={82}
                y={237}
                width={24}
                height={25}
                rx={11}
                fill={diz.svgFill}
                stroke={diz.svgStroke}
                strokeWidth={2.2}
              />
              <Rect
                x={114}
                y={237}
                width={24}
                height={25}
                rx={11}
                fill={diz.svgFill}
                stroke={diz.svgStroke}
                strokeWidth={2.2}
              />
              <Circle cx={94} cy={249.5} r={4.5} fill={diz.color} />
              <Circle cx={126} cy={249.5} r={4.5} fill={diz.color} />
            </G>
          </Svg>
          <Text style={styles.svgCaptionText}>
            Silüet Üzerinden Bölge Seçimi
          </Text>
        </View>

        {/* 7 BÖLGE İNTERAKTİF KART / ÇİP LİSTESİ */}
        <View style={styles.zonesListColumn}>
          {STANDARD_BODY_ZONES.map((item) => {
            const st = zones[item.key];
            const meta = ZONE_STATUS_META[st];
            const isSavingThis = savingZone === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.zoneChipCard,
                  {
                    backgroundColor: meta.chipBg,
                    borderColor: meta.chipBorder,
                  },
                ]}
                onPress={() => handleCycleZone(item.key)}
                disabled={readOnly}
                activeOpacity={0.82}
              >
                <View
                  style={[
                    styles.zoneStatusDot,
                    { backgroundColor: meta.color },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.zoneChipName} numberOfLines={1}>
                    {item.key}
                  </Text>
                  {!compact && (
                    <Text style={styles.zoneChipSub} numberOfLines={1}>
                      {item.shortHint}
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.zoneStatePill,
                    { borderColor: meta.chipBorder },
                  ]}
                >
                  {isSavingThis ? (
                    <ActivityIndicator size="small" color={meta.color} />
                  ) : (
                    <Text
                      style={[
                        styles.zoneStatePillText,
                        { color: meta.textColor },
                      ]}
                    >
                      {meta.dotEmoji} {meta.shortLabel}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* AKTİF BÖLGE UYARI ÖZETİ */}
      {activeAlerts.length > 0 ? (
        <View style={styles.activeAlertsBox}>
          <View style={styles.activeAlertsHeader}>
            <ShieldAlert size={15} color="#B91C1C" />
            <Text style={styles.activeAlertsTitle}>
              Aktif Bölge Uyarıları ({activeAlerts.length})
            </Text>
          </View>
          <View style={styles.activeAlertPillsWrap}>
            {activeAlerts.map((al) => (
              <View
                key={al.zone}
                style={[
                  styles.alertSummaryBadge,
                  al.status === 'injured'
                    ? styles.alertSummaryBadgeInjured
                    : styles.alertSummaryBadgeWarning,
                ]}
              >
                <Text
                  style={[
                    styles.alertSummaryBadgeText,
                    {
                      color: al.status === 'injured' ? '#B91C1C' : '#B45309',
                    },
                  ]}
                >
                  {al.badgeText}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.allHealthyBanner}>
          <CheckCircle2 size={15} color="#047857" />
          <Text style={styles.allHealthyText}>
            🟢 Tüm kas ve eklem bölgeleri sağlam — aktif sakatlık veya hassasiyet kaydı yok.
          </Text>
        </View>
      )}

      {/* RENK LEJANTI */}
      <View style={styles.legendContainer}>
        {(['healthy', 'warning', 'injured'] as const).map((statusKey) => {
          const meta = ZONE_STATUS_META[statusKey];
          return (
            <View key={statusKey} style={styles.legendItemRow}>
              <View
                style={[styles.legendColorDot, { backgroundColor: meta.color }]}
              />
              <Text style={styles.legendLabelText}>
                <Text style={{ fontWeight: '800', color: meta.textColor }}>
                  {meta.dotEmoji}{' '}
                </Text>
                {meta.legendLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  cardCompact: {
    padding: 15,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleCluster: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  eyebrowTag: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberNamePill: {
    color: COLORS.secondary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  titleText: {
    color: COLORS.textPrimary,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  subtitleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 2,
  },
  savingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  savingBadgeText: {
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  saveToastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  saveToastSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  saveToastError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  saveToastText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  interactiveBodyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: 12,
  },
  interactiveBodyRowCompact: {
    gap: 10,
  },
  silhouetteContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minWidth: 178,
    gap: 6,
  },
  svgCaptionText: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  zonesListColumn: {
    flex: 1,
    minWidth: 175,
    justifyContent: 'space-between',
    gap: 7,
  },
  zoneChipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 13,
    borderWidth: 1.2,
  },
  zoneStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  zoneChipName: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  zoneChipSub: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  zoneStatePill: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneStatePillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  activeAlertsBox: {
    backgroundColor: '#FFFDF9',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 8,
  },
  activeAlertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeAlertsTitle: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  activeAlertPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  alertSummaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  alertSummaryBadgeInjured: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  alertSummaryBadgeWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  alertSummaryBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  allHealthyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  allHealthyText: {
    flex: 1,
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  legendContainer: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  legendItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColorDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendLabelText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 11.5,
    fontWeight: '700',
  },
});
