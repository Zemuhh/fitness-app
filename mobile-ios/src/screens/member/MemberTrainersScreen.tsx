import React, { useCallback, useEffect, useState } from 'react';
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
  ArrowRight,
  Award,
  Calendar,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { AppUser, TrainerCard } from '@/types/fitness';
import { MemberAvatar } from '@/screens/member/MemberAvatar';

export interface MemberTrainersScreenProps {
  member: AppUser;
  onOpenTrainerDetail: (trainerId: number) => void;
}

export function MemberTrainersScreen({
  member,
  onOpenTrainerDetail,
}: MemberTrainersScreenProps) {
  const { refreshSignal } = useAuthDemo();
  const [trainers, setTrainers] = useState<TrainerCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchTrainers = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiRequest<TrainerCard[]>(
          `/trainers?member_id=${member.id}`
        );
        setTrainers(res);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Eğitmen kadrosu yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [member.id]
  );

  useEffect(() => {
    fetchTrainers(trainers.length > 0);
  }, [fetchTrainers, refreshSignal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTrainers(true);
  }, [fetchTrainers]);

  if (loading && trainers.length === 0) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>Uzman eğitmen kadromuz yükleniyor...</Text>
      </View>
    );
  }

  if (errorMsg && trainers.length === 0) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => fetchTrainers(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.retryBtnText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
      {/* Üst Başlık */}
      <View style={styles.pageHeader}>
        <View style={styles.headerBadge}>
          <Sparkles size={13} color={COLORS.secondary} />
          <Text style={styles.headerBadgeText}>PROFESYONEL KOÇ KADROSU</Text>
        </View>
        <Text style={styles.pageTitle}>Hocalarımız</Text>
        <Text style={styles.pageSubtitle}>
          Alanında sertifikalı baş eğitmenlerimizi inceleyin ve açık seanslarına doğrudan kayıt olun.
        </Text>
      </View>

      {/* Geniş ve Ferah Beyaz Eğitmen Kartları */}
      {trainers.map((tr) => (
        <View key={tr.id} style={styles.trainerCard}>
          {/* Üst Kimlik Satırı */}
          <View style={styles.cardTopRow}>
            <MemberAvatar
              uri={tr.avatar_url}
              name={tr.full_name}
              size={78}
              borderRadius={22}
              accentColor={COLORS.secondary}
            />

            <View style={styles.identityCol}>
              <View style={styles.metaBadgesRow}>
                <View style={styles.ratingBadge}>
                  <Star size={12} color={COLORS.warningText} fill={COLORS.warning} />
                  <Text style={styles.ratingText}>{tr.rating.toFixed(1)}</Text>
                </View>

                <View style={styles.expBadge}>
                  <Text style={styles.expText}>{tr.experience_years} Yıl Deneyim</Text>
                </View>
              </View>

              <Text style={styles.trainerName}>{tr.full_name}</Text>

              <View style={styles.specialtyPill}>
                <Text style={styles.specialtyPillText} numberOfLines={1}>
                  {tr.specialty || 'Atletik Performans & PT'}
                </Text>
              </View>
            </View>
          </View>

          {/* Kısa Özgeçmiş Özeti */}
          {tr.bio ? (
            <Text style={styles.bioText} numberOfLines={3}>
              {tr.bio}
            </Text>
          ) : null}

          {/* Sertifika Etiketleri */}
          {tr.certificates && tr.certificates.length > 0 && (
            <View style={styles.certsWrap}>
              {tr.certificates.slice(0, 3).map((cert, idx) => (
                <View key={`${tr.id}-cert-${idx}`} style={styles.certTag}>
                  <Award size={12} color={COLORS.primary} />
                  <Text style={styles.certTagText} numberOfLines={1}>
                    {cert}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Alt Aksiyon Satırı */}
          <View style={styles.cardFooter}>
            <View style={styles.openCountBox}>
              <Calendar size={14} color={COLORS.primary} />
              <Text style={styles.openCountText}>
                {tr.active_sessions_count} Açık Ders Vakti
              </Text>
            </View>

            <TouchableOpacity
              style={styles.openModalBtn}
              onPress={() => onOpenTrainerDetail(tr.id)}
              activeOpacity={0.86}
            >
              <Text style={styles.openModalBtnText}>
                Açık Dersleri Gör & Kayıt Ol
              </Text>
              <ArrowRight size={15} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
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
    paddingBottom: 36,
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
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  pageHeader: {
    marginBottom: 18,
    gap: 5,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerBadgeText: {
    color: COLORS.secondary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pageTitle: {
    color: COLORS.textPrimary,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  trainerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityCol: {
    flex: 1,
    gap: 6,
  },
  metaBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: '#EDD092',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ratingText: {
    color: COLORS.warningText,
    fontSize: 11.5,
    fontWeight: '800',
  },
  expBadge: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  expText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  trainerName: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  specialtyPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.secondaryLight,
    borderWidth: 1,
    borderColor: '#E5C5C9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  specialtyPillText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  bioText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  certsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  certTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  certTagText: {
    color: COLORS.textPrimary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  openCountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openCountText: {
    color: COLORS.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  openModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  openModalBtnText: {
    color: COLORS.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
});
