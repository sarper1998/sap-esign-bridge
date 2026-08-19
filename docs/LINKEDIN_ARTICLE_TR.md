# Onay Bittiği Anda İmza Süreci Başlar: SAP ve E‑İmza Arasında SignBridge

Kurumsal onay süreçlerinde ilginç bir paradoks var: Belge SAP içinde dijital olarak hazırlanıyor, kontrol ediliyor ve onaylanıyor; fakat sıra imzaya geldiğinde süreç çoğu zaman e-posta, dosya indirme, manuel yükleme ve durum takibine geri dönüyor.

Bu kopukluk yalnızca zaman kaybettirmiyor. Aynı zamanda yanlış belgenin imzalanması, onayın iki kez işlenmesi, imzalı dosyanın doğru SAP kaydıyla eşleşmemesi ve denetim izinin farklı sistemlere dağılması gibi riskler doğuruyor.

Bu problemden yola çıkarak SignBridge adını verdiğim açık kaynak bir entegrasyon MVP’si geliştirdim.

SignBridge’in amacı basit: SAP’te onay tamamlandığı anda güvenli e‑imza sürecini otomatik başlatmak ve imza sonucunu yeniden SAP’ye işlemek.

## Otomatikleştirilen şey imza değil, güvenli süreç

Bu projedeki en önemli tasarım kararı burada başlıyor.

Kişisel e‑imzayı kullanıcının iradesi veya güvenli doğrulama adımı olmadan “arka planda” atmak doğru bir yaklaşım değil. SignBridge özel anahtar, sertifika PIN’i veya imza oluşturma verisi saklamıyor. Bu bilgiler entegrasyon katmanına hiçbir zaman gelmiyor.

Otomatikleştirilen akış şu şekilde:

1. SAP iş akışındaki onay tamamlanıyor.
2. SAP, imzalı ve doğrulanabilir bir olay gönderiyor.
3. SignBridge olayın gerçekten SAP’den geldiğini kontrol ediyor.
4. Belgenin SHA‑256 özeti ve imzacı bilgileri doğrulanıyor.
5. Yetkili imza sağlayıcısında güvenli imza oturumu açılıyor.
6. Kullanıcı imzayı sağlayıcının ekranında tamamlıyor.
7. İmzalı belge ve denetim izi SAP’ye geri işleniyor.

Böylece kullanıcının imza iradesi korunurken, onay ile imza arasındaki manuel operasyon ortadan kalkıyor.

## Mimari yaklaşım

SignBridge’i SAP’nin içine gömülü bir imza kütüphanesi olarak değil, bağımsız bir integration service olarak tasarladım.

Akışın bileşenleri:

SAP S/4HANA → Event/Webhook → SignBridge → E‑İmza Sağlayıcısı → Callback → SAP

Bu ayrım birkaç önemli avantaj sağlıyor:

• SAP tarafında yalnızca tek bir entegrasyon sözleşmesi kalıyor.
• İmza sağlayıcısı değiştiğinde SAP geliştirmesi yeniden yapılmıyor.
• Güvenlik politikaları merkezi olarak uygulanabiliyor.
• Her onay ve imza adımı tek bir denetim izinde görülebiliyor.
• Hata ve tekrar deneme politikaları SAP iş akışından bağımsız yönetilebiliyor.

MVP, bağımlılıksız bir Node.js servisi olarak çalışıyor. Sağlayıcı katmanı adaptör yapısında. Demo sağlayıcısının yanında Documenso v2 API’si için çalışan bir adaptör de bulunuyor.

## Güvenlikte özellikle ele aldığım noktalar

Bir entegrasyonun çalışması tek başına yeterli değil; yanlış veya tekrarlanan bir olayı güvenli şekilde reddedebilmesi de gerekiyor.

Bu nedenle MVP’de şu kontroller var:

HMAC webhook doğrulaması

SAP’ten gelen ham istek gövdesi SHA‑256 HMAC ile doğrulanıyor. İmzası uyuşmayan olaylar işlenmiyor.

İdempotency

Her SAP onayının benzersiz bir eventId değeri var. Aynı olay tekrar gönderilse bile ikinci bir imza talebi oluşturulmuyor.

Belge bütünlüğü

SAP’in gönderdiği SHA‑256 değeri, imza sağlayıcısına aktarılacak gerçek PDF ile karşılaştırılıyor. Özet eşleşmezse süreç durduruluyor.

SSRF koruması

Uzak belge yalnızca HTTPS üzerinden ve önceden tanımlanmış sunucu izin listesinden indirilebiliyor.

Sabit zamanlı secret karşılaştırması

Webhook secret değerleri timing attack riskini azaltmak için sabit zamanlı karşılaştırmayla kontrol ediliyor.

Denetim izi

SAP onayının alınması, imza talebinin oluşturulması, imzanın tamamlanması, belgenin arşivlenmesi ve SAP güncellemesi ayrı olaylar olarak kaydediliyor.

## Neden sağlayıcıdan bağımsız?

E‑imza projelerinde belge iş akışı, kullanıcı deneyimi ve kriptografik doğrulama çoğu zaman tek bir ürün gibi değerlendiriliyor. Oysa bunlar farklı sorumluluklar.

Araştırma sırasında üç açık kaynak proje özellikle öne çıktı:

• Documenso: self-hosted belge imzalama deneyimi, alıcılar, imza alanları, API ve webhook yönetimi.
• LibreSign: Nextcloud kullanan kurumlar için kontrollü belge imzalama akışları.
• EU DSS: PAdES, XAdES, CAdES ve benzeri gelişmiş elektronik imza formatlarının üretimi ve doğrulanması.

SignBridge bunlardan herhangi birini SAP’nin değişmez bir parçası haline getirmiyor. Sağlayıcı adaptörü değiştirilerek farklı bir uzaktan imza servisine veya Türkiye’de yetkilendirilmiş bir elektronik sertifika hizmet sağlayıcısının API’sine bağlanabilir.

## Demo neleri gösteriyor?

Hazırladığım web panelinde uçtan uca süreç simüle edilebiliyor:

• SAP onayı oluşturuluyor.
• İmza talebi otomatik açılıyor.
• Belge özeti ve imza sahibi görüntüleniyor.
• Güvenli imza adımı kullanıcı onayıyla tamamlanıyor.
• Belge arşivleniyor.
• SAP kaydı SIGNED durumuna getiriliyor.

Panel aynı zamanda her belge için zaman sıralı denetim izini ve sistem metriklerini gösteriyor. Arayüz masaüstü ve mobil boyutlarda test edildi. Servis tarafında onay, idempotency, HMAC ve tamamlanma akışlarını kapsayan otomatik testler bulunuyor.

## Üretime geçmeden önce

Bu çalışma bir entegrasyon MVP’si. Gerçek bir kurumsal pilotta aşağıdaki katmanların eklenmesi gerekir:

• SAP Integration Suite veya Event Mesh üzerinden güvenilir olay aktarımı
• mTLS/OAuth2 ve kurumsal secret yönetimi
• PostgreSQL veya SAP HANA tabanlı dayanıklı süreç deposu
• Retry, exponential backoff ve dead-letter queue
• İmzalı belgenin SAP DMS, ArchiveLink veya Content Server’a aktarılması
• PAdES/XAdES validasyonu, sertifika zinciri, OCSP/CRL ve zaman damgası kontrolleri
• KVKK, 5070 sayılı Elektronik İmza Kanunu ve kurumun imza politikası açısından hukuk/güvenlik değerlendirmesi

Tam otomasyon gereken süreçlerde kişisel e‑imza ile kurumsal elektronik mühür/HSM senaryolarının da birbirinden ayrılması gerekiyor.

## Açık kaynak repo

Projenin kaynak kodunu, mimari notlarını, OpenAPI sözleşmesini, Documenso adaptörünü ve testlerini GitHub’da yayınladım:

https://github.com/sarper1998/sap-esign-bridge

Projeyi inceleyenlerin özellikle şu konulardaki görüşlerini merak ediyorum:

• SAP onayından sonra kurumunuzda en fazla manuel iş hangi adımda oluşuyor?
• Uzaktan e‑imza entegrasyonunda en kritik gereksinim sizce kullanıcı deneyimi mi, denetim izi mi, sağlayıcı bağımsızlığı mı?
• Bu yapıyı SAP Integration Suite üzerinde bir iFlow örneğiyle genişletmek faydalı olur mu?

Onay bittiği anda imza süreci başlayabilir. Önemli olan imzayı değil, imzaya giden yolu doğru şekilde otomatikleştirmek.

#SAP #S4HANA #Eİmza #DigitalSignature #Integration #Automation #EnterpriseArchitecture #OpenSource #NodeJS #SoftwareDevelopment
