SAP’te onay tamamlanıyor; ama e‑imza süreci hâlâ PDF indir–yükle–e‑posta gönder–SAP’ye geri ekle döngüsünde kalabiliyor.

Bu problemi ürün gibi ele alıp SignBridge’i güncelledim: SAP onay olaylarını kurumun seçtiği e‑imza sağlayıcısına bağlayan self-hosted bir orkestrasyon gateway’i.

Yeni sürümde:
• Docker + PostgreSQL ile kurum içinde kurulum
• SAP Event Mesh / Integration Suite entegrasyon yolu
• HMAC doğrulama ve event idempotency
• Belge/şirket bazlı imza politikaları
• Kalıcı kuyruk, retry ve audit trail
• SAP callback akışı ve yönetim konsolu

Özel anahtar veya PIN gateway’e girmez; SignBridge yalnızca doğrulanmış süreci taşır.

Article’da mimari kararları anlattım. S/4HANA Cloud ve on‑prem için ayrıntılı kurulum tutorialı, iFlow adımları, örnek payload ve go‑live checklist doğrudan repoda:

https://github.com/sarper1998/sap-esign-bridge

#SAP #S4HANA #ElectronicSignature #IntegrationSuite #EventDrivenArchitecture #OpenSource
