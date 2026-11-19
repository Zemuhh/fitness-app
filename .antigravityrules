# Sistem Mimarisi ve Kurallar
- İşletim Sistemi: Windows 10/11. Asla macOS özel komutları (`pod install`, `xcodebuild`) çalıştırma. Mobil paketler için her zaman `npx expo install` kullan.
- Proje Yapısı: `/backend` klasöründe Python FastAPI + SQLAlchemy + SQLite (`fitness.db`), `/mobile-ios` klasöründe React Native (Expo Router, TypeScript) yer alır.
- Tasarım Dili: Modern, koyu tema (Dark Mode - `#0F172A` arka plan, `#10B981` zümrüt yeşili ve `#6366F1` indigo vurgu renkleri), iOS Human Interface Guidelines uyumlu, yuvarlatılmış kartlar.
- Temel İş Kuralları:
  1. Tek uygulamada 2 rol vardır: `member` (Müşteri) ve `trainer` (Eğitmen).
  2. Müşteri derse kayıt olduğunda (`booked`) paketindeki `remaining_credits` anında 1 düşer, dersin `current_enrolled` sayısı 1 artar.
  3. İptal durumunda (`cancelled`) kredi müşteriye iade edilir ve kontenjan boşalır.
  4. Eğitmen yoklama ekranında müşterinin sakatlık/özel notlarını (`notes`) ve kalan ders sayısını görür, tek tuşla "Geldi" (`attended`) veya "Gelmedi" (`no_show`) işaretler.
