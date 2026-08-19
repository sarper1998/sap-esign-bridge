# GitHub’daki e‑imza altyapıları

## Kısa karar

SignBridge için tek bir depoyu kopyalayıp SAP’nin içine gömmek yerine rol bazlı ayrım daha güvenlidir:

| Proje | En iyi kullanım | Lisans | SignBridge’deki rol |
|---|---|---|---|
| [Documenso](https://github.com/documenso/documenso) | Self-hosted imzalama UX’i, alıcılar, alanlar, API ve webhook | AGPL‑3.0 | Hazır `DocumensoProvider` adaptörü |
| [LibreSign](https://github.com/LibreSign/libresign) | Nextcloud kullanan kurumlarda kontrollü imza iş akışı ve izlenebilirlik | AGPL‑3.0 | Alternatif sağlayıcı adaptörü |
| [EU DSS](https://github.com/esig/dss) | PAdES/XAdES/CAdES/JAdES imza üretimi, genişletme ve doğrulama | LGPL‑2.1 | Kriptografik doğrulama microservice’i |

## Öneri

- Hızlı PoC ve güçlü kullanıcı deneyimi: Documenso adaptörü.
- Kurum zaten Nextcloud kullanıyorsa: LibreSign değerlendirmesi.
- Türkiye’de nitelikli e‑imza/PAdES validasyonu gereken üretim: yetkili ESHS’nin uzaktan imza API’si + EU DSS tabanlı bağımsız validasyon katmanı.

Documenso “belge imzalama platformu”, EU DSS ise “kriptografik imza kütüphanesi”dir; aynı probleme birebir alternatif değillerdir. Türkiye’de güvenli elektronik imzanın hukuki niteliği, kullandığınız sertifika ve imza oluşturma aracına bağlıdır. Sadece PDF’ye görsel imza eklemek güvenli elektronik imza sayılmaz.

## Üretim incelemesi

Her açık kaynak proje için canlıya çıkmadan önce:

1. Sabit bir sürüm/SHA pinleyin.
2. Açık güvenlik bildirimlerini ve bağımlılık taramasını kontrol edin.
3. AGPL/LGPL yükümlülüklerini hukuk ekibinizle değerlendirin.
4. Penetrasyon testi ve tenant izolasyonu testi yapın.
5. ESHS, zaman damgası, OCSP/CRL ve sertifika politika uyumunu doğrulayın.

SignBridge’in kendi MIT lisansı, bağlı projelerin lisansını değiştirmez.
