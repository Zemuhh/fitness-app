import React, { ComponentRef, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  ArrowUpRight,
  CheckCircle2,
  Dumbbell,
  Hourglass,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { CARD_SHADOW, COLORS } from '@/theme/colors';
import { InstagramWebhookResponse } from '@/types/fitness';
import { TrainerDrawerRoute } from '@/types/navigation';

interface ChatMessage {
  id: string;
  sender: 'member' | 'bot';
  handle?: string;
  text: string;
  timestamp: string;
  actionTag?: string;
  actionTone?: 'emerald' | 'amber' | 'indigo';
}

interface MemberHandleChip {
  handle: string;
  shortName: string;
}

const FALLBACK_MEMBER_HANDLES: MemberHandleChip[] = [
  { handle: '@zeynepkaya', shortName: 'Zeynep' },
  { handle: '@elifsahin', shortName: 'Elif' },
  { handle: '@defneyildiz', shortName: 'Defne' },
  { handle: '@mervearslan', shortName: 'Merve' },
  { handle: '@iremkorkmaz', shortName: 'İrem' },
];

const PRESET_MESSAGES = [
  'Bugün 19:00 Grup Reformer seansına kayıt olmak istiyorum',
  "Yarın saat 18:00'deki Düet Reformer seansına yer var mı?",
  'Kaç seans hakkım kaldı?',
  'Bugün 19:00 seansımı iptal eder misin?',
  'Yarın hangi Reformer ve Cadillac dersleri açık?',
];

function nowHhMm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  onBookingMutated: () => Promise<void>;
  onNavigateRoute?: (route: TrainerDrawerRoute) => void;
}

export function InstagramDmSimulatorTab({
  onBookingMutated,
  onNavigateRoute,
}: Props) {
  const { users, triggerGlobalRefresh } = useAuthDemo();

  const handleChips = useMemo<MemberHandleChip[]>(() => {
    const dynamic = users
      .filter((u) => u.role === 'member' && u.instagram_handle)
      .map((u) => ({
        handle: u.instagram_handle!.startsWith('@')
          ? u.instagram_handle!
          : `@${u.instagram_handle!}`,
        shortName: u.full_name.split(' ')[0] || 'Üye',
      }));

    const map = new Map<string, MemberHandleChip>();
    dynamic.forEach((item) => map.set(item.handle.toLowerCase(), item));
    FALLBACK_MEMBER_HANDLES.forEach((item) => {
      if (!map.has(item.handle.toLowerCase())) {
        map.set(item.handle.toLowerCase(), item);
      }
    });
    return Array.from(map.values());
  }, [users]);

  const [selectedHandle, setSelectedHandle] = useState<string>('@zeynepkaya');
  const [inputText, setInputText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);

  const createWelcomeMessage = (): ChatMessage => ({
    id: `welcome-${Date.now()}`,
    sender: 'bot',
    text: 'Merhaba! ERYA Pilates & Reformer (@eryapilatesreformer) Instagram DM Randevu Asistanı aktif. Üstteki üye hesaplarından birini seçip doğal dille seans kaydı, yedek liste, kalan seans sorgusu veya iptal mesajı gönderebilirsiniz.',
    timestamp: nowHhMm(),
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);

  const handleResetChat = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages([createWelcomeMessage()]);
  };

  const resolveActionMeta = (
    res: InstagramWebhookResponse
  ): { tag?: string; tone?: 'emerald' | 'amber' | 'indigo' } => {
    if (res.action === 'booked') {
      return {
        tag:
          res.remaining_credits !== undefined && res.remaining_credits !== null
            ? `Takvime İşlendi (-1 Kredi • Kalan: ${res.remaining_credits})`
            : 'Takvime Otomatik İşlendi (-1 Kredi)',
        tone: 'emerald',
      };
    }
    if (res.action === 'cancelled') {
      return {
        tag:
          res.remaining_credits !== undefined && res.remaining_credits !== null
            ? `Randevu İptal Edildi (+1 Kredi • Kalan: ${res.remaining_credits})`
            : 'Randevu İptal Edildi (+1 Kredi İade)',
        tone: 'emerald',
      };
    }
    if (res.action === 'waitlisted' || res.action === 'waitlist') {
      return {
        tag: 'Yedek Listeye Kaydedildi',
        tone: 'amber',
      };
    }
    if (res.remaining_credits !== undefined && res.remaining_credits !== null) {
      return {
        tag: `Canlı Paket Sorgulandı (Kalan: ${res.remaining_credits} Ders)`,
        tone: 'indigo',
      };
    }
    return {};
  };

  const sendMessage = async (customText?: string) => {
    const textToSend = (customText ?? inputText).trim();
    if (!textToSend || sending) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'member',
      handle: selectedHandle,
      text: textToSend,
      timestamp: nowHhMm(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setSending(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const res = await apiRequest<InstagramWebhookResponse>('/instagram/webhook', {
        method: 'POST',
        body: JSON.stringify({
          instagram_handle: selectedHandle,
          message: textToSend,
        }),
      });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const actionMeta = resolveActionMeta(res);

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        timestamp: nowHhMm(),
        actionTag: actionMeta.tag,
        actionTone: actionMeta.tone,
      };
      setMessages((prev) => [...prev, botMsg]);

      if (
        res.action === 'booked' ||
        res.action === 'cancelled' ||
        res.action === 'waitlisted' ||
        res.action === 'waitlist'
      ) {
        await onBookingMutated();
        triggerGlobalRefresh();
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text: `Bağlantı hatası: ${err?.message || 'Webhook yanıt vermedi.'}`,
          timestamp: nowHhMm(),
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  if (!__DEV__) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      {/* Daylight Wellness Instagram DM Üst Kartı */}
      <View style={styles.topCardWrap}>
        <View style={styles.igTopCard}>
          <View style={styles.igHeaderRow}>
            <View style={styles.avatarWrapper}>
              <Svg width={46} height={46}>
                <Defs>
                  <LinearGradient id="igStoryGradLight" x1="0%" y1="100%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor={COLORS.warning} />
                    <Stop offset="55%" stopColor={COLORS.secondary} />
                    <Stop offset="100%" stopColor={COLORS.primary} />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx={23}
                  cy={23}
                  r={21}
                  stroke="url(#igStoryGradLight)"
                  strokeWidth={2.5}
                  fill="none"
                />
              </Svg>
              <View style={styles.avatarInnerCircle}>
                <Dumbbell size={16} color={COLORS.primary} />
              </View>
              <View style={styles.onlineGreenDot} />
            </View>

            <View style={styles.headerInfoCol}>
              <View style={styles.titleWithBadge}>
                <Text style={styles.igUsername}>eryapilatesreformer</Text>
                <View style={styles.aiBadge}>
                  <Sparkles size={11} color={COLORS.primary} />
                  <Text style={styles.aiBadgeText}>CANLI WEBHOOK</Text>
                </View>
              </View>
              <Text style={styles.activeStatusText}>
                7/24 Otomatik Instagram DM Randevu & Kredi Asistanı
              </Text>
            </View>

            <TouchableOpacity
              style={styles.resetChatBtn}
              onPress={handleResetChat}
              activeOpacity={0.8}
              accessibilityLabel="Sohbeti sıfırla"
            >
              <RotateCcw size={15} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* 5 Üye Hesabı (@handle) Seçici Çipleri */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountPillsRow}
          >
            {handleChips.map((item) => {
              const active =
                selectedHandle.toLowerCase() === item.handle.toLowerCase();
              return (
                <TouchableOpacity
                  key={item.handle}
                  style={[styles.accountPill, active && styles.accountPillActive]}
                  onPress={() => setSelectedHandle(item.handle)}
                  activeOpacity={0.82}
                >
                  <User
                    size={12}
                    color={active ? COLORS.white : COLORS.textSecondary}
                  />
                  <Text
                    style={[
                      styles.accountPillText,
                      active && styles.accountPillTextActive,
                    ]}
                  >
                    {item.handle} • {item.shortName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* DM Mesaj Akışı */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => {
          const isMember = m.sender === 'member';
          return (
            <View
              key={m.id}
              style={[
                styles.messageRow,
                isMember ? styles.messageRowRight : styles.messageRowLeft,
              ]}
            >
              {!isMember && (
                <View style={styles.botMiniAvatar}>
                  <Sparkles size={14} color={COLORS.primary} />
                </View>
              )}

              <View
                style={[
                  styles.bubbleBase,
                  isMember ? styles.memberBubble : styles.botBubble,
                ]}
              >
                {isMember && m.handle && (
                  <Text style={styles.memberHandleLabel}>{m.handle}</Text>
                )}

                <Text
                  style={[
                    styles.bubbleMessageText,
                    isMember && styles.bubbleMessageTextMember,
                  ]}
                >
                  {m.text}
                </Text>

                {m.actionTag && (
                  <View style={styles.actionFooterCol}>
                    <View
                      style={[
                        styles.syncedActionBadge,
                        m.actionTone === 'amber'
                          ? styles.syncedActionAmber
                          : m.actionTone === 'indigo'
                          ? styles.syncedActionIndigo
                          : styles.syncedActionEmerald,
                      ]}
                    >
                      {m.actionTone === 'amber' ? (
                        <Hourglass size={12} color={COLORS.warningText} />
                      ) : (
                        <CheckCircle2
                          size={12}
                          color={
                            m.actionTone === 'indigo'
                              ? COLORS.secondary
                              : COLORS.primary
                          }
                        />
                      )}
                      <Text
                        style={[
                          styles.syncedActionText,
                          {
                            color:
                              m.actionTone === 'amber'
                                ? COLORS.warningText
                                : m.actionTone === 'indigo'
                                ? COLORS.secondary
                                : COLORS.primary,
                          },
                        ]}
                      >
                        {m.actionTag}
                      </Text>
                    </View>

                    {onNavigateRoute &&
                      (m.actionTone === 'emerald' || m.actionTone === 'amber') && (
                        <TouchableOpacity
                          style={styles.jumpScheduleBtn}
                          onPress={() => onNavigateRoute('schedule')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.jumpScheduleText}>
                            Günlük Derslerimde Gör
                          </Text>
                          <ArrowUpRight size={13} color={COLORS.secondary} />
                        </TouchableOpacity>
                      )}
                  </View>
                )}

                <Text
                  style={[
                    styles.timestampText,
                    isMember && styles.timestampTextMember,
                  ]}
                >
                  {m.timestamp}
                </Text>
              </View>
            </View>
          );
        })}

        {sending && (
          <View style={[styles.messageRow, styles.messageRowLeft]}>
            <View style={styles.botMiniAvatar}>
              <Sparkles size={14} color={COLORS.primary} />
            </View>
            <View style={[styles.bubbleBase, styles.botBubble, styles.typingRow]}>
              <ActivityIndicator size="small" color={COLORS.secondary} />
              <Text style={styles.typingLabel}>AI Asistan yanıtlıyor...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Hızlı Test Senaryosu Hapları (Yalnızca Geliştirme Ortamı) */}
      {__DEV__ && (
        <View style={styles.quickPromptsStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptsContent}
          >
            {PRESET_MESSAGES.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={styles.quickPromptPill}
                disabled={sending}
                onPress={() => sendMessage(preset)}
                activeOpacity={0.82}
              >
                <Sparkles size={11} color={COLORS.secondary} />
                <Text style={styles.quickPromptText} numberOfLines={1}>
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Mesaj Giriş Çubuğu */}
      <View style={styles.dmComposerWrap}>
        <View style={styles.dmInputCapsule}>
          <TextInput
            style={styles.dmTextInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={`${selectedHandle} olarak DM gönder...`}
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[
              styles.dmSendCircle,
              (!inputText.trim() || sending) && styles.dmSendCircleDisabled,
            ]}
            disabled={!inputText.trim() || sending}
            onPress={() => sendMessage()}
            activeOpacity={0.85}
          >
            <Send size={15} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topCardWrap: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  igTopCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...CARD_SHADOW,
  },
  igHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatarWrapper: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInnerCircle: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineGreenDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  headerInfoCol: {
    flex: 1,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  igUsername: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  aiBadge: {
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
  aiBadgeText: {
    color: COLORS.primary,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  activeStatusText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  resetChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountPillsRow: {
    gap: 8,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  accountPillActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  accountPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  accountPillTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  botMiniAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    ...CARD_SHADOW,
  },
  bubbleBase: {
    maxWidth: '83%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
  },
  memberBubble: {
    backgroundColor: COLORS.secondary,
    borderBottomRightRadius: 6,
    ...CARD_SHADOW,
  },
  botBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 6,
    ...CARD_SHADOW,
  },
  memberHandleLabel: {
    color: COLORS.secondaryLight,
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  bubbleMessageText: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  bubbleMessageTextMember: {
    color: COLORS.white,
  },
  actionFooterCol: {
    marginTop: 9,
    gap: 6,
    alignItems: 'flex-start',
  },
  syncedActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 11,
  },
  syncedActionEmerald: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#E5CB90',
  },
  syncedActionAmber: {
    backgroundColor: COLORS.warningBg,
    borderColor: '#EDD092',
  },
  syncedActionIndigo: {
    backgroundColor: COLORS.secondaryLight,
    borderColor: '#E5C5C9',
  },
  syncedActionText: {
    fontSize: 11,
    fontWeight: '800',
  },
  jumpScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  jumpScheduleText: {
    color: COLORS.secondary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  timestampText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  timestampTextMember: {
    color: COLORS.secondaryLight,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingLabel: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  quickPromptsStrip: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  quickPromptsContent: {
    paddingHorizontal: 18,
    gap: 8,
  },
  quickPromptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: 290,
    ...CARD_SHADOW,
  },
  quickPromptText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  dmComposerWrap: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dmInputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 4,
  },
  dmTextInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '600',
    paddingVertical: 7,
  },
  dmSendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmSendCircleDisabled: {
    opacity: 0.4,
  },
});
