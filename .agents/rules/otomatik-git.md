---
trigger: always_on
---

# Otomatik Git Senkronizasyonu

Her görev veya kod değişikliği isteği aldığımda, işe başlamadan önce otomatik olarak `git pull --rebase` çalıştırarak GitHub'daki son değişiklikleri çek. Kod düzenlemesini tamamladığımda ise bana sormadan otomatik olarak `git add .`, anlamlı bir mesajla `git commit` ve `git push` komutlarını çalıştırarak değişiklikleri GitHub'a kaydet. (Not: PATH üzerinde `git` bulunamazsa `"C:\Program Files\Git\cmd\git.exe"` yolunu kullan.)
