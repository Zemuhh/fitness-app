import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import {
  Calendar,
  Clock,
  Dumbbell,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import { COLORS } from '@/theme/colors';
import { MemberDashboardData } from '@/types/fitness';
import { formatTurkishDateLabel } from '@/utils/dateHelpers';

interface Props {
  data: MemberDashboardData;
  accessCode?: string;
}

function buildDynamicQrMatrix(seedStr: string, size = 25): boolean[][] {
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const placeFinder = (rowStart: number, colStart: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowStart + r;
        const cc = colStart + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        reserved[rr][cc] = true;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[rr][cc] = inOuter && (onBorder || inCore);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  const alignCenter = size - 7;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = alignCenter + r;
      const cc = alignCenter + c;
      reserved[rr][cc] = true;
      matrix[rr][cc] = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
    }
  }

  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if (r === 6 || c === 6) {
        matrix[r][c] = (r + c) % 2 === 0;
        continue;
      }
      hash ^= (r * 31 + c * 17 + 97) & 0xff;
      hash = Math.imul(hash, 16777619);
      matrix[r][c] = ((hash >>> 3) & 1) === 1;
    }
  }

  return matrix;
}

export function MemberQrTab({ data, accessCode }: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [nonce, setNonce] = useState<number>(() => Math.floor(Date.now() / 30000));

  const blinkOpacity = useRef(new Animated.Value(1)).current;
  const blinkScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(blinkOpacity, {
            toValue: 0.25,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(blinkOpacity, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(blinkScale, {
            toValue: 1.35,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(blinkScale, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [blinkOpacity, blinkScale]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setNonce(Math.floor(Date.now() / 1000));
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const memberAccessId = accessCode ?? `FIT-${1000 + data.member.id}`;
  const pkg = data.active_package;
  const isActive = Boolean(pkg && pkg.is_active && pkg.remaining_credits > 0);

  const tokenPayload = useMemo(() => {
    return `${memberAccessId}-${pkg?.id ?? 0}-${nonce}`;
  }, [memberAccessId, pkg?.id, nonce]);

  const qrSize = 204;
  const gridCount = 25;
  const cellSize = qrSize / gridCount;
  const matrix = useMemo(
    () => buildDynamicQrMatrix(tokenPayload, gridCount),
    [tokenPayload]
  );

  const nextBooking = data.my_bookings.find((b) => b.status === 'booked');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Apple Wallet Biniş Kartı (Boarding Pass) */}
      <View style={styles.walletPassCard}>
        {/* Kart Üst Başlığı: Salon Adı, Üye Rozeti ve Üye ID Kodu */}
        <View style={styles.passTopSection}>
          <View style={styles.studioBrandRow}>
            <View style={styles.studioLogoWrap}>
              <Dumbbell size={16} color="#090D16" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.studioName}>APEX ATHLETIC STUDIO</Text>
              <Text style={styles.studioSub}>DIGITAL CLUB ACCESS PASS</Text>
            </View>
            <View style={styles.tierBadge}>
              <Sparkles size={12} color={COLORS.accentVolt} />
              <Text style={styles.tierBadgeText}>PRO ÜYE</Text>
            </View>
          </View>

          <View style={styles.passIdentityRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldMicroLabel}>ÜYE ADI SOYADI</Text>
              <Text style={styles.passMemberName} numberOfLines={1}>
                {data.member.full_name}
              </Text>
            </View>

            <View style={styles.idCodeBox}>
              <Text style={styles.fieldMicroLabel}>ÜYE ID KODU</Text>
              <Text style={styles.passIdValue}>{memberAccessId}</Text>
            </View>
          </View>
        </View>

        {/* Biniş Kartı Çentikli Perforasyon Çizgisi */}
        <View style={styles.perforationRow}>
          <View style={[styles.punchNotch, styles.punchLeft]} />
          <View style={styles.dashedLine} />
          <View style={[styles.punchNotch, styles.punchRight]} />
        </View>

        {/* Orta Bölüm: Parlak Beyaz Zeminli Yüksek Kontrastlı QR Matrisi */}
        <View style={styles.passQrSection}>
          <View style={styles.whiteQrBoard}>
            <Svg width={qrSize} height={qrSize}>
              <Rect x={0} y={0} width={qrSize} height={qrSize} fill="#FFFFFF" rx={10} />
              {matrix.map((row, rIdx) =>
                row.map((filled, cIdx) =>
                  filled ? (
                    <Rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx * cellSize}
                      y={rIdx * cellSize}
                      width={cellSize + 0.4}
                      height={cellSize + 0.4}
                      fill="#090D16"
                      rx={1.4}
                    />
                  ) : null
                )
              )}
            </Svg>
          </View>

          {/* Yenileme Sayacı & İlerleme Çubuğu */}
          <View style={styles.refreshStrip}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(secondsLeft / 30) * 100}%` },
                ]}
              />
            </View>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => {
                setNonce(Date.now());
                setSecondsLeft(30);
              }}
              activeOpacity={0.8}
            >
              <RefreshCw size={12} color={COLORS.primary} />
              <Text style={styles.refreshText}>{secondsLeft}s</Text>
            </TouchableOpacity>
          </View>

          {/* Alt Durum: Canlı Yanıp Sönen Yeşil Nokta */}
          <View
            style={[
              styles.liveStatusPill,
              !isActive && styles.liveStatusPillWarn,
            ]}
          >
            <View style={styles.dotContainer}>
              <Animated.View
                style={[
                  styles.liveDotHalo,
                  {
                    backgroundColor: isActive ? COLORS.primary : COLORS.warning,
                    opacity: blinkOpacity,
                    transform: [{ scale: blinkScale }],
                  },
                ]}
              />
              <View
                style={[
                  styles.liveDotCore,
                  { backgroundColor: isActive ? COLORS.primary : COLORS.warning },
                ]}
              />
            </View>
            <Text
              style={[
                styles.liveStatusText,
                !isActive && { color: COLORS.warning },
              ]}
            >
              {isActive
                ? 'Salona Giriş İçin Hazır'
                : 'Salona Giriş İçin Hazır • Paket Kontrolü'}
            </Text>
          </View>
        </View>
      </View>

      {/* Üyelik & Sıradaki Ders Bento Özeti */}
      <View style={styles.summaryBentoCard}>
        <View style={styles.summaryHeader}>
          <QrCode size={17} color={COLORS.primary} />
          <Text style={styles.summaryTitle}>Turnike & Paket Detayları</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryMiniBox}>
            <Text style={styles.miniBoxLabel}>Kalan Kredi</Text>
            <Text style={styles.miniBoxNumeric}>
              {pkg ? `${pkg.remaining_credits}/${pkg.total_credits}` : '0/0'}
            </Text>
          </View>

          <View style={styles.summaryMiniBox}>
            <Text style={styles.miniBoxLabel}>Geçerlilik</Text>
            <Text style={styles.miniBoxDate} numberOfLines={1}>
              {pkg ? formatTurkishDateLabel(pkg.expiry_date).primary : '-'}
            </Text>
          </View>

          <View style={styles.summaryMiniBox}>
            <Text style={styles.miniBoxLabel}>Durum</Text>
            <View style={styles.miniStatusInline}>
              <ShieldCheck
                size={13}
                color={isActive ? COLORS.primary : COLORS.warning}
              />
              <Text
                style={[
                  styles.miniStatusText,
                  { color: isActive ? COLORS.primary : COLORS.warning },
                ]}
              >
                {isActive ? 'Aktif' : 'Kredisiz'}
              </Text>
            </View>
          </View>
        </View>

        {nextBooking && (
          <View style={styles.nextClassBanner}>
            <View style={styles.nextClassTop}>
              <Calendar size={13} color={COLORS.accentVolt} />
              <Text style={styles.nextClassTag}>SIRADAKİ ANTRENMANINIZ</Text>
            </View>
            <Text style={styles.nextClassName}>{nextBooking.title}</Text>
            <View style={styles.nextClassMetaRow}>
              <Clock size={13} color={COLORS.textSecondary} />
              <Text style={styles.nextClassTime}>
                {nextBooking.start_time} - {nextBooking.end_time}
              </Text>
              <Text style={styles.nextClassSub}>
                • {formatTurkishDateLabel(nextBooking.date).primary} • {nextBooking.trainer_name}
              </Text>
            </View>
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
    padding: 16,
    paddingBottom: 36,
  },
  walletPassCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 8,
    marginBottom: 16,
  },
  passTopSection: {
    padding: 18,
    backgroundColor: COLORS.surfaceElevated,
    gap: 16,
  },
  studioBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studioLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.accentVolt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studioName: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  studioSub: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(163, 230, 53, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(163, 230, 53, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tierBadgeText: {
    color: COLORS.accentVolt,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  passIdentityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldMicroLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  passMemberName: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  idCodeBox: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passIdValue: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  perforationRow: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
  },
  punchNotch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  punchLeft: {
    marginLeft: -11,
  },
  punchRight: {
    marginRight: -11,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    marginHorizontal: 8,
  },
  passQrSection: {
    padding: 18,
    paddingTop: 10,
    alignItems: 'center',
  },
  whiteQrBoard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  refreshStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 16,
    paddingHorizontal: 6,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  refreshText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  liveStatusPill: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.32)',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  liveStatusPillWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  dotContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  liveDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveStatusText: {
    color: COLORS.primary,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  summaryBentoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryMiniBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  miniBoxLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  miniBoxNumeric: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  miniBoxDate: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  miniStatusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  nextClassBanner: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  nextClassTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextClassTag: {
    color: COLORS.accentVolt,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  nextClassName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  nextClassMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  nextClassTime: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  nextClassSub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
});
