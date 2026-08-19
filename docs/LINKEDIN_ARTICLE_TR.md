# SAP Onaylarını E‑İmzaya Bağlayan Self‑Hosted Gateway: SignBridge

Bir satın alma sözleşmesi SAP’te onaylandı.

Peki sonra ne oluyor?

Birçok kurumda cevap hâlâ şu: PDF indirilir, e‑posta atılır, imza portalına tekrar yüklenir, sonuç beklenir ve imzalı dosya SAP’ye elle eklenir. Onay dijitaldir; ama onay ile imza arasındaki son kilometre değildir.

SignBridge’i bu boşluk için ürünleştirdim: kurumun kendi ortamında çalışan, SAP onay olaylarını seçilen e‑imza sağlayıcısına bağlayan self-hosted bir orkestrasyon gateway’i.

## İmza uygulaması değil, kontrol düzlemi

SignBridge sertifika üretmez, kullanıcının özel anahtarını saklamaz ve PIN istemez. Görevi süreç taşımaktır:

1. SAP’ten gelen APPROVED olayını HMAC ile doğrular.
2. Aynı eventId’nin ikinci kez imza talebi oluşturmasını engeller.
3. Belge türü ve şirket koduna göre imza politikasını seçer.
4. Belgeyi sağlayıcı adaptörü üzerinden imzaya gönderir.
5. Tamamlanma webhook’unu alır.
6. İmzalı belgeyi ve denetim izini SAP’ye geri işler.

Böylece SAP iş akışının sahibi olmaya devam eder; e‑imza sağlayıcısı güvenli imza oturumunu yürütür; SignBridge ise ikisi arasındaki doğrulanabilir ve izlenebilir bağlantıyı kurar.

## Neden self-hosted?

Kurumsal entegrasyonda mesele yalnızca “bir API çağrısı yapmak” değil. Ağ sınırı, belge erişimi, secret yönetimi, log saklama, veri yerleşimi ve operasyonel sorumluluk en az kod kadar önemli.

Yeni sürüm bu nedenle Docker Compose ve PostgreSQL ile kurum içinde çalışacak şekilde tasarlandı. Yönetim konsolunda bağlantılar, politikalar, işlem kuyruğu ve audit trail tek görünümde izlenebiliyor. Health/readiness endpoint’leri, kalıcı retry bilgisi ve container healthcheck’i de deployment’ın parçası.

## SAP tarafındaki önerilen akış

Referans mimari şu:

SAP S/4HANA → Event Mesh → Integration Suite iFlow → SignBridge → E‑İmza Sağlayıcısı

İmza tamamlandığında dönüş yolu:

E‑İmza Sağlayıcısı → SignBridge → Integration Suite → SAP iş nesnesi / DMS

Event Mesh olay üreticisiyle tüketiciyi ayrıştırıyor. Integration Suite iFlow ise SAP’nin business event payload’ını SignBridge’in canonical formatına çeviriyor, HMAC header’ını üretiyor ve HTTPS çağrısını yapıyor. On-prem kurulumlarda Cloud Connector ve senaryoya göre HTTP/OData veya RFC adapter devreye girebilir.

Communication Arrangement adı ve iş nesnesinin event/API seçimi S/4HANA release’ine göre değişebileceği için bunları kodun içine sabitlemedim. Repo içindeki tutorial hem S/4HANA Cloud hem on-prem yolunu, iFlow adımlarını, örnek payload’ı, callback tasarımını ve go-live kontrol listesini içeriyor.

Detaylı SAP kurulum tutorialı:
https://github.com/sarper1998/sap-esign-bridge/blob/main/docs/SAP_INSTALLATION_TUTORIAL_TR.md

## Güvenlikte bilinçli sınırlar

SignBridge’in güvenlik modeli dört temel karara dayanıyor:

- HMAC: SAP/iFlow’dan gelen body’nin değişmediğini doğrulamak.
- Idempotency: Event Mesh veya iFlow retry yapsa bile tek imza talebi oluşturmak.
- SHA‑256: SAP’nin bildirdiği belge özetiyle indirilen PDF’nin bütünlüğünü karşılaştırmak.
- Outbound allowlist: Gateway’in yalnızca izin verilen SAP/DMS hostlarından belge indirmesi.

İmza sahibi özel anahtarını ve PIN’ini gateway’e vermez. Gerçek imza işlemi seçilen sağlayıcının güvenli oturumunda kalır. İmza seviyesi, sağlayıcı ve saklama süresi ise belge türüne göre policy engine’de belirlenir.

## Açık kaynak, ama “tak‑çalıştır uygunluk” iddiası yok

Repo çalışan bir reference implementation sunuyor: Node.js servis, PostgreSQL migration, Docker Compose, Documenso adaptörü, yönetim konsolu, testler ve OpenAPI sözleşmesi.

Ancak her kurumun SAP iş nesnesi, onay modeli ve hukuki imza gereksinimi farklıdır. Satın alma sözleşmesiyle insan kaynakları belgesinin imza politikası aynı olmayabilir. Nitelikli e‑imza gerekip gerekmediği ülkeye ve belge türüne göre hukuk/bilgi güvenliği ekipleriyle değerlendirilmelidir.

## Neler var?

- Self-hosted Docker/PostgreSQL deployment
- SAP webhook doğrulama
- Event idempotency
- Policy-driven provider routing temeli
- Documenso ve demo provider adaptörleri
- Kalıcı processing queue ve audit trail
- SAP callback ve retry akışı
- Yönetim konsolu
- CI, OpenAPI ve production checklist

Kod ve kurulum dosyaları:
https://github.com/sarper1998/sap-esign-bridge

Benim için bu çalışmanın en değerli tarafı “SAP’ye bir imza butonu eklemek” değil. Onay, imza ve arşivleme arasındaki güven sınırını görünür, test edilebilir ve işletilebilir bir ürüne dönüştürmek.

SAP veya e‑imza entegrasyonlarıyla çalışanların görüşlerini merak ediyorum: Sizce production’a geçmeden önce en kritik kontrol noktası hangisi—event tasarımı, kimlik doğrulama, belge bütünlüğü, provider bağımsızlığı yoksa audit/uyumluluk mı?
