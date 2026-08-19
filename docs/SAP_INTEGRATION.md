# SAP entegrasyon notları

## Önerilen sınır

SignBridge’i SAP ile e‑imza sağlayıcısı arasındaki bağımsız bir integration service olarak konumlandırın. SAP’nin içine özel anahtar, sertifika PIN’i veya sağlayıcı SDK’sı gömmeyin.

```text
SAP Business Workflow / Flexible Workflow
                │ APPROVED event
                ▼
      SAP Integration Suite / Event Mesh
                │ HTTPS + HMAC/mTLS
                ▼
             SignBridge
                │ provider adapter
                ▼
   ESHS / remote signing / Documenso
                │ signed callback
                ▼
       SAP attachment + status API
```

## SAP tarafında tetikleme

S/4HANA sürümünüze göre şu desenlerden biri kullanılabilir:

- S/4HANA Cloud: Business Event → SAP Event Mesh → Integration Suite iFlow → SignBridge webhook.
- S/4HANA on‑premise: Workflow completion exit/BAdI veya OData/REST çıkışı → Integration Suite/PI‑PO → SignBridge.
- Basit PoC: Onay sonrası ABAP HTTP client ile doğrudan webhook. Üretimde retry, secret yönetimi ve gözlemlenebilirlik için araya Integration Suite koymak daha sağlıklıdır.

## Güvenlik başlıkları

Her SAP isteği ham JSON gövdesi üzerinden HMAC ile imzalanır:

```text
X-SAP-Signature = "sha256=" + HEX(HMAC_SHA256(raw_body, shared_secret))
```

SignBridge:

1. HMAC’i sabit zamanlı karşılaştırmayla doğrular.
2. `status === APPROVED` kontrolünü uygular.
3. Zorunlu belge ve imzacı alanlarını doğrular.
4. `eventId` daha önce işlendiyse yeni imza talebi oluşturmaz.
5. Belge URL’sini sadece HTTPS ve `DOCUMENT_HOST_ALLOWLIST` içindeki sunuculardan indirir.

Üretimde HMAC’e ek olarak mTLS, IP allowlist veya SAP BTP Destination/OAuth2 client credentials uygulanabilir.

## SAP’ye dönüş sözleşmesi

`.env` içindeki `SAP_UPDATE_URL` tanımlıysa tamamlanan süreç için şu gövde gönderilir:

```json
{
  "approvalId": "APR-700191",
  "documentId": "PO-45000931",
  "signatureRequestId": "envelope_abc123",
  "signedDocumentUrl": "https://signing.example.com/completed/abc123.pdf",
  "status": "SIGNED",
  "signedAt": "2026-08-20T08:41:13Z"
}
```

Üretimde yalnızca URL göndermek yerine imzalı belgeyi güvenli şekilde indirip virüs taraması ve imza doğrulamasından sonra SAP DMS/ArchiveLink/Content Server’a yükleyin. SAP kaydına en az şu alanları yazın:

- imza sağlayıcısı ve işlem kimliği;
- imza zamanı ve varsa güvenilir zaman damgası;
- imzalı belgenin SHA‑256 özeti;
- sertifika konusu/seri numarası (kişisel veri minimizasyonuna dikkat);
- PAdES/XAdES doğrulama sonucu;
- denetim izi referansı.

## Hata yönetimi

- `401`: HMAC/secret hatası; tekrar denemeden önce yapılandırmayı düzeltin.
- `422`: Şema/politika hatası; dead-letter queue’ya taşıyın.
- Sağlayıcı `5xx`: exponential backoff + idempotency key ile tekrar deneyin.
- SAP geri dönüşü başarısız: süreç `SAP_UPDATE_FAILED` olur; imzayı tekrar oluşturmayın, yalnızca SAP güncellemesini tekrar deneyin.

Demo bellek içindedir. Üretimde `eventId`, durum ve outbox kaydını aynı veritabanı transaction’ında saklayın.
