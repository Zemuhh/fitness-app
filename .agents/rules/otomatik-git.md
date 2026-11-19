---
trigger: always_on
---

# Otomatik Git Senkronizasyonu

- Her görev veya kod değişikliği isteği alındığında, işe başlamadan önce otomatik olarak `git -c credential.interactive=never pull --rebase` çalıştırarak GitHub'daki son değişiklikleri çek.
- Kod veya dosya düzenlemesi tamamlandığında (`git status --porcelain` çıktısında değişiklik varsa), kullanıcıya sormadan otomatik olarak `git add .`, anlamlı bir mesajla `git commit` ve `git -c credential.interactive=never push` komutlarını çalıştırarak değişiklikleri GitHub'a kaydet.
- Windows ortamında `git` komutu `PATH` üzerinde bulunamazsa doğrudan `"C:\Program Files\Git\cmd\git.exe"` yolunu kullan.
