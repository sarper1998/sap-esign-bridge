# SignBridge Gateway'i SAP'ye Kurma Tutorialı

Bu rehber, SignBridge'in kurum içinde host edilip SAP S/4HANA onay olaylarını e‑imzaya yönlendirmesi için referans kurulumdur. Ekran ve communication scenario adları S/4HANA sürümüne göre değişebilir; kendi release’inizde SAP Help ve Fiori “Communication Scenarios” uygulaması üzerinden doğrulayın.

## 1. Hedef topoloji ve ön koşullar

Önerilen production yolu:

```text
S/4HANA → Event Mesh → Integration Suite iFlow → HTTPS → SignBridge → İmza Sağlayıcısı
                                                         │
                                                         └→ SAP callback / DMS
```

Gereksinimler:

- Docker Engine 26+ ve Docker Compose v2
- Kalıcı volume üzerinde PostgreSQL 15+
- Kurum DNS'inde ör. `signbridge.example.com`
- Geçerli TLS sertifikası ve reverse proxy/WAF
- SAP BTP subaccount; Integration Suite ve Event Mesh entitlement
- SAP Communication Management yetkisi
- Seçilen e‑imza sağlayıcısının API ve webhook bilgileri
- SAP/DMS belge URL'lerinin SignBridge hostundan erişilebilir olması

SAP Event Mesh, olay üreticisiyle tüketiciyi ayrıştıran asenkron iletişim katmanıdır. Integration Suite Event Mesh hem olay yayınlama hem tüketme senaryolarını destekler: [SAP Event Mesh overview](https://help.sap.com/docs/SAP_EM/bf82e6b26456494cbdd197057c09979f/df532e8735eb4322b00bfc7e42f84e8d.html).

## 2. Gateway'i kurum ortamında çalıştırın

```bash
git clone https://github.com/sarper1998/sap-esign-bridge.git
cd sap-esign-bridge
cp .env.example .env
```

`.env` içinde en az şunları değiştirin:

```dotenv
BASE_URL=https://signbridge.example.com
GATEWAY_NAME=ACME SignBridge Production
DEPLOYMENT_ENV=production
SEED_DEMO=false
ADMIN_TOKEN=<secret-manager-tarafindan-uretilen-deger>
SAP_SYSTEM_NAME=S4P
SAP_WEBHOOK_SECRET=<en-az-32-byte-rastgele-secret>
SAP_UPDATE_URL=https://<integration-suite-host>/http/signbridge/signed
SAP_UPDATE_TOKEN=<oauth-veya-api-token>
SIGNATURE_PROVIDER=documenso
DOCUMENSO_API_URL=https://<kurum-documenso-host>/api/v2
DOCUMENSO_API_KEY=<secret>
DOCUMENSO_WEBHOOK_SECRET=<secret>
DOCUMENT_HOST_ALLOWLIST=s4p.example.com,dms.example.com
```

PostgreSQL parolasını shell/secret store üzerinden verip başlatın:

```bash
export POSTGRES_PASSWORD='<uzun-rastgele-parola>'
docker compose up -d --build
docker compose ps
curl --fail https://signbridge.example.com/api/health
curl --fail https://signbridge.example.com/api/ready
```

`/api/health` process durumunu, `/api/ready` veritabanı erişimini doğrular. İlk açılışta migration otomatik ve idempotent çalışır.

## 3. TLS ve ağ sınırını kurun

1. Reverse proxy'de yalnızca `443/TCP` yayınlayın.
2. Container portu `127.0.0.1:8787` üzerinde kalsın.
3. Inbound allowlist'e yalnızca Integration Suite ve provider webhook kaynaklarını ekleyin.
4. Outbound allowlist'e SAP/DMS, imza sağlayıcısı ve gerekli kimlik uçlarını ekleyin.
5. `.env` dosyasını repoya koymayın; Vault, Kubernetes Secret veya kurum secret manager'ı kullanın.
6. PostgreSQL volume için şifreli disk, günlük yedek ve restore testi tanımlayın.

## 4. SAP Event Mesh bağlantısını hazırlayın

1. BTP subaccount'ta Event Mesh service instance oluşturun.
2. Service key oluşturun; endpoint ve kimlik bilgilerini Integration Suite bağlantısında kullanın.
3. SAP S/4HANA Cloud'da **Communication Management → Communication Arrangements** uygulamasını açın.
4. Release'inizde sunulan Event Mesh communication scenario'sunu seçin. Bazı sürüm/senaryolarda `SAP_COM_0092 — Event Mesh Integration` kullanılır; bunu sabit bir evrensel değer gibi kabul etmeyin.
5. Communication system ve inbound/outbound user bilgilerini girin; gerekiyorsa service key içeriğini yükleyin.
6. Topic space ve QoS değerini belirleyin, ardından **Check Connection** ile doğrulayın.

SAP'ın resmi akışı communication arrangement ve service key temellidir: [SAP S/4HANA Cloud – Event Mesh communication arrangements](https://help.sap.com/docs/SAP_S4HANA_CLOUD/0f69f8fb28ac4bf48d2b57b9637e81fa/214442004da34f738a97f7e924db7fed.html) ve [Maintaining Communication Arrangements](https://help.sap.com/docs/SAP_S4HANA_CLOUD/0f69f8fb28ac4bf48d2b57b9637e81fa/8fb8dab9d67e4b52975cc2a4cd44e881.html).

## 5. Onay olayını yayınlayın

SignBridge şu canonical payload'ı bekler:

```json
{
  "eventId": "sap-event-9fd2",
  "approvalId": "APR-700184",
  "system": "S4P",
  "companyCode": "1000",
  "status": "APPROVED",
  "approvedAt": "2026-08-20T09:45:00Z",
  "document": {
    "id": "SA-45000918",
    "title": "Tedarikçi Sözleşmesi",
    "type": "CONTRACT",
    "hash": "sha256:<64-hex-karakter>",
    "url": "https://dms.example.com/documents/SA-45000918.pdf"
  },
  "signer": {
    "name": "Deniz Kaya",
    "email": "deniz.kaya@example.com",
    "department": "Satın Alma"
  }
}
```

Standart bir business event varsa onu kullanın. Yoksa ilgili iş nesnesinin approved/completed noktasında released BAdI, workflow extension veya side-by-side extension ile olay üretin. Core modifikasyon yapmayın. `eventId` her SAP olayı için benzersiz ve retry'larda sabit olmalıdır.

## 6. Integration Suite iFlow oluşturun

1. Event Mesh sender adapter ile onay topic/queue'sunu dinleyin.
2. JSON Schema Validation adımında zorunlu alanları kontrol edin.
3. Message Mapping ile SAP olayını yukarıdaki canonical formata çevirin.
4. `status != APPROVED` mesajlarını filtreleyin.
5. Groovy Script adımında **tam HTTP body byte dizisi** için HMAC-SHA256 üretin.
6. `X-SAP-Signature: sha256=<hex>` header'ını ekleyin.
7. HTTP receiver address'i `https://signbridge.example.com/api/webhooks/sap/approval` yapın.
8. Retry'i exponential backoff ve dead-letter queue ile yapılandırın.

HTTP receiver adapter target sistemlere HTTP/HTTPS ile bağlanır; internet/on-prem proxy ve client certificate seçenekleri SAP dokümantasyonunda açıklanır: [HTTP Receiver Adapter](https://help.sap.com/docs/cloud-integration/sap-cloud-integration/http-receiver-adapter?locale=enUS).

HMAC için örnek Groovy mantığı:

```groovy
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

def body = message.getBody(String)
def secret = message.getProperty('SAP_WEBHOOK_SECRET')
def mac = Mac.getInstance('HmacSHA256')
mac.init(new SecretKeySpec(secret.getBytes('UTF-8'), 'HmacSHA256'))
def hex = mac.doFinal(body.getBytes('UTF-8')).encodeHex().toString()
message.setHeader('X-SAP-Signature', 'sha256=' + hex)
return message
```

Secret'i script içine gömmeyin; Integration Suite security material/externalized parameter kullanın. Mapping sonrası body'nin HMAC üretildikten sonra değişmediğini test edin.

## 7. İmzalı sonucu SAP'ye döndürün

`SAP_UPDATE_URL`, imza tamamlandığında SignBridge'in çağırdığı endpoint'tir. Bu endpoint'i ikinci bir iFlow olarak tasarlayın:

1. SignBridge'ten gelen bearer token veya mTLS kimliğini doğrulayın.
2. `approvalId`, `documentId`, `signatureRequestId`, `signedDocumentUrl`, `signedAt` ve `status=SIGNED` alanlarını doğrulayın.
3. İmzalı PDF'yi provider'dan güvenli servis hesabıyla çekin veya kısa ömürlü URL'yi çözün.
4. Belgeyi DMS/Content Server'a arşivleyin.
5. İlgili iş nesnesini released OData API/BAPI ile güncelleyin.
6. SAP application log'a SignBridge job ID ve belge hash'ini yazın.
7. 2xx yalnızca arşivleme ve SAP güncelleme tamamlandıktan sonra dönsün.

Kullanılacak OData API, DMS veya ArchiveLink nesnesi satın alma sözleşmesi, fatura, kalite belgesi gibi iş senaryosuna göre değişir; bunu SAP API Business Hub ve sistem release'inize göre seçin.

## 8. On-prem S/4HANA farkı

- SAP Cloud Connector ile Integration Suite'ten S/4HANA'ya sanal host açın.
- HTTP/OData mümkün değilse Integration Suite RFC receiver adapter'ını değerlendirin.
- Onay çıkışında released BAdI/workflow extension kullanın.
- SignBridge'i ABAP sistemiyle aynı ağa koymak zorunda değilsiniz; kontrollü DMZ/application segment tercih edin.
- Doğrudan internete açık SAP ICM endpoint'i oluşturmayın.

Integration Suite'in HTTP, OData ve RFC dahil desteklediği connectivity adapter'ları: [Connectivity Adapters](https://help.sap.com/docs/cloud-integration/sap-cloud-integration/connectivity-adapters).

## 9. Uçtan uca kabul testi

1. Test ortamında bir belgeyi onaylayın.
2. Event Mesh queue'da mesajı ve iFlow trace ID'yi doğrulayın.
3. SignBridge konsolunda `SAP_APPROVAL_RECEIVED` ve `POLICY_MATCHED` olaylarını görün.
4. Aynı `eventId` ile mesajı tekrar gönderin; yeni imza talebi oluşmamalı.
5. İmzayı test sağlayıcısında tamamlayın.
6. `SIGNATURE_COMPLETED`, `DOCUMENT_ARCHIVED`, `SAP_UPDATED` sırasını doğrulayın.
7. SAP nesnesinde durum, ekli PDF ve application log kaydını kontrol edin.
8. SAP callback'i geçici olarak 500 döndürsün; `SAP_UPDATE_FAILED` ve retry davranışını test edin.
9. Gateway'i yeniden başlatın; PostgreSQL'deki işler kaybolmamalı.

## 10. Go-live kontrol listesi

- [ ] `SEED_DEMO=false`; demo uçları kapalı
- [ ] Tüm secret'lar secret manager'da
- [ ] TLS 1.2+, mTLS/WAF/allowlist kararı uygulanmış
- [ ] SAP ve provider webhook secret rotasyonu belgelenmiş
- [ ] PostgreSQL backup/restore testi başarılı
- [ ] Dead-letter queue için alarm tanımlı
- [ ] `/api/ready`, container ve DB metrikleri izleniyor
- [ ] Audit log SIEM'e aktarılıyor
- [ ] İmza seviyesi ve saklama politikası hukuk/bilgi güvenliği tarafından onaylı
- [ ] SAP transport zinciri DEV → QAS → PRD tamamlanmış
- [ ] Rollback: eski iFlow endpoint/route pasif ama geri alınabilir halde

## Sorun giderme

| Belirti | Kontrol |
|---|---|
| `401 Webhook doğrulanamadı` | iFlow body byte'ları ve `SAP_WEBHOOK_SECRET` birebir aynı mı? |
| Aynı belge iki kez oluşuyor | Retry boyunca `eventId` değişiyor mu? |
| PDF indirilemiyor | `DOCUMENT_HOST_ALLOWLIST`, DNS, TLS chain ve outbound firewall |
| `SAP_UPDATE_FAILED` | Callback iFlow logu, token/mTLS ve hedef OData yetkisi |
| `/api/ready` başarısız | PostgreSQL health, `DATABASE_URL`, volume ve migration yetkisi |

Bu tutorial bir reference architecture'dır; gerçek iş nesnesinin event/API seçimi ve nitelikli e‑imza hukuki gereksinimleri kurumunuzun SAP, güvenlik ve hukuk ekipleriyle netleştirilmelidir.
