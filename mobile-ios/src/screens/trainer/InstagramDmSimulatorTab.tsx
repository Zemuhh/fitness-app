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
  CheckCircle2,
  Dumbbell,
  Send,
  Sparkles,
  User,
} from 'lucide-react-native';
import { apiRequest } from '@/config/api';
import { useAuthDemo } from '@/context/AuthDemoContext';
import { COLORS } from '@/theme/colors';
import { InstagramWebhookResponse } from '@/types/fitness';

interface ChatMessage {
  id: string;
  sender: 'member' | 'bot';
  handle?: string;
  text: string;
  timestamp: string;
  actionTag?: string;
}

interface Props {
  onBookingMutated: () => Promise<void>;
}

const PRESET_MESSAGES = [
  'Bugün 19:00 dersine kayıt olmak istiyorum',
  "Yarın saat 19:00'daki grup dersine yer var mı, beni yazar mısın?",
  'Kaç ders hakkım kaldı?',
  'Bugün 19:00 dersimi iptal eder misin?',
];

function nowHhMm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function InstagramDmSimulatorTab({ onBookingMutated }: Props) {
  const { users, triggerGlobalRefresh } = useAuthDemo();
  const memberUsers = useMemo(
    () => users.filter((u) => u.role === 'member' && u.instagram_handle),
    [users]
  );

  const [selectedHandle, setSelectedHandle] = useState<string>('@ahmetyilmaz');
  const [inputText, setInputText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'bot',
      text: 'Merhaba! 👋 Apex Studio Instagram DM AI Asistanı aktif. Üstten üye hesabını seçip doğal dille ders kaydı, bakiye sorgusu veya iptal mesajı gönderebilirsiniz.',
      timestamp: nowHhMm(),
    },
  ]);

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
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        timestamp: nowHhMm(),
        actionTag:
          res.action === 'booked'
            ? 'Takvime Otomatik İşlendi (-1 Kredi)'
            : res.action === 'cancelled'
            ? 'Kayıt İptal Edildi (+1 Kredi İade)'
            : undefined,
      };
      setMessages((prev) => [...prev, botMsg]);

      if (res.action === 'booked' || res.action === 'cancelled') {
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Gerçek Instagram Dark Mode DM Üst Başlığı */}
      <View style={styles.igTopContainer}>
        <View style={styles.igHeaderRow}>
          {/* Instagram Story Gradient Halkalı Profil Avatarı */}
          <View style={styles.avatarWrapper}>
            <Svg width={46} height={46}>
              <Defs>
                <LinearGradient id="igStoryGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#F59E0B" />
                  <Stop offset="50%" stopColor="#EC4899" />
                  <Stop offset="100%" stopColor="#6366F1" />
                </LinearGradient>
              </Defs>
              <Circle
                cx={23}
                cy={23}
                r={21}
                stroke="url(#igStoryGrad)"
                strokeWidth={2.5}
                fill="none"
              />
            </Svg>
            <View style={styles.avatarInnerCircle}>
              <Dumbbell size={17} color={COLORS.accentVolt} />
            </View>
            <View style={styles.onlineGreenDot} />
          </View>

          <View style={styles.headerInfoCol}>
            <View style={styles.titleWithBadge}>
              <Text style={styles.igUsername}>apexstudio.ai</Text>
              <View style={styles.aiBadge}>
                <Sparkles size={11} color={COLORS.accentVolt} />
                <Text style={styles.aiBadgeText}>AI DM</Text>
              </View>
            </View>
            <Text style={styles.activeStatusText}>
              Şu anda aktif • Canlı Takvim Senkronize
            </Text>
          </View>
        </View>

        {/* Hesap (@handle) Seçici Hapları */}
        <View style={styles.accountSelectorBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountPillsRow}
          >
            {memberUsers.map((m) => {
              const handle = m.instagram_handle || '@uye';
              const active = selectedHandle === handle;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.accountPill, active && styles.accountPillActive]}
                  onPress={() => setSelectedHandle(handle)}
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
                    {handle} • {m.full_name.split(' ')[0]}
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
                  <Sparkles size={13} color={COLORS.accentVolt} />
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

                <Text style={styles.bubbleMessageText}>{m.text}</Text>

                {m.actionTag && (
                  <View style={styles.syncedActionBadge}>
                    <CheckCircle2 size={13} color={COLORS.primary} />
                    <Text style={styles.syncedActionText}>{m.actionTag}</Text>
                  </View>
                )}

                <Text
                  style={[
                    styles.timestampText,
                    isMember && { color: 'rgba(255, 255, 255, 0.72)' },
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
              <Sparkles size={13} color={COLORS.accentVolt} />
            </View>
            <View style={[styles.bubbleBase, styles.botBubble, styles.typingRow]}>
              <ActivityIndicator size="small" color={COLORS.trainerAccent} />
              <Text style={styles.typingLabel}>Yazıyor...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Hızlı Mesaj Öneri Hapları */}
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
              <Sparkles size={11} color={COLORS.trainerAccent} />
              <Text style={styles.quickPromptText} numberOfLines={1}>
                {preset}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Instagram Direct Mesaj Giriş Çubuğu */}
      <View style={styles.dmComposerWrap}>
        <View style={styles.dmInputCapsule}>
          <TextInput
            style={styles.dmTextInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={`${selectedHandle} olarak mesaj gönder...`}
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
  igTopContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingTop: 10,
    paddingBottom: 10,
  },
  igHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
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
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineGreenDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
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
    gap: 8,
  },
  igUsername: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(163, 230, 53, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(163, 230, 53, 0.30)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  aiBadgeText: {
    color: COLORS.accentVolt,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activeStatusText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  accountSelectorBar: {
    paddingTop: 2,
  },
  accountPillsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  accountPillActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#A855F7',
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
    padding: 16,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubbleBase: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  memberBubble: {
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 6,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  botBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 6,
  },
  memberHandleLabel: {
    color: '#E0E7FF',
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  bubbleMessageText: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  syncedActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  syncedActionText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  timestampText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    alignSelf: 'flex-end',
    marginTop: 5,
    letterSpacing: -0.3,
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
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  quickPromptsContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  quickPromptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: 280,
  },
  quickPromptText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  dmComposerWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dmInputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 5,
  },
  dmTextInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13.5,
    paddingVertical: 7,
  },
  dmSendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.trainerAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmSendCircleDisabled: {
    opacity: 0.4,
  },
});
