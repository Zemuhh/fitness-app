export type MemberDrawerRoute =
  | 'home'
  | 'schedule'
  | 'nutrition'
  | 'referral'
  | 'trainers'
  | 'packages'
  | 'news'
  | 'metrics'
  | 'profile';

export type TrainerDrawerRoute =
  | 'schedule'
  | 'crm'
  | 'create_session'
  | 'instagram_ai'
  | 'announcements_profile';

export type AppDrawerRoute = MemberDrawerRoute | TrainerDrawerRoute;

export const MEMBER_ROUTE_TITLES: Record<MemberDrawerRoute, string> = {
  home: 'Ana Sayfa & Stüdyo Özeti',
  schedule: 'Seans Takvimi & Rezervasyon',
  nutrition: '🥗 AI Beslenme & Toparlanma',
  referral: '🎁 Arkadaşını Getir (+1 Ders)',
  trainers: 'Eğitmen Kadromuz',
  packages: 'Paket Yenileme & Üyelik',
  news: 'Stüdyo Rehberi & Duyurular',
  metrics: 'Postür & Vücut Gelişimim',
  profile: 'Profilim & Bildirimler',
};

export const TRAINER_ROUTE_TITLES: Record<TrainerDrawerRoute, string> = {
  schedule: 'Günlük Seanslarım & Yoklama',
  crm: 'Üye Postür & Ölçüm Takibi',
  create_session: 'Yeni Seans Vakti Aç',
  instagram_ai: '@eryapilatesreformer DM Asistanı',
  announcements_profile: 'Stüdyo Duyuruları & Profilim',
};
