# TR Risk Monitor — Türkiye Devalüasyon Riski PWA

## Kurulum (Vercel)

### 1. Repo oluştur
```bash
cd tr-risk-monitor
git init
git add .
git commit -m "Initial commit"
```

### 2. Vercel'e deploy et
```bash
npm i -g vercel
vercel
```

### 3. Vercel KV oluştur
Vercel Dashboard → Storage → KV Database oluştur → Projeye bağla.

### 4. Environment Variables
Vercel Dashboard → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `EVDS_API_KEY` | `WJeWYeHh4f` |
| `KV_URL` | (Vercel KV'den otomatik gelir) |
| `KV_REST_API_URL` | (Vercel KV'den otomatik gelir) |
| `KV_REST_API_TOKEN` | (Vercel KV'den otomatik gelir) |

### 5. Redeploy
```bash
vercel --prod
```

---

## PWA — Ana Ekrana Ekleme

### iPhone (Safari)
1. Siteyi Safari'de aç
2. Paylaş → Ana Ekrana Ekle
3. Uygulama gibi çalışır

### Android (Chrome)
1. Siteyi Chrome'da aç
2. Menü → Ana ekrana ekle
3. Uygulama gibi çalışır

---

## Haftalık İş Akışı

1. Uygulamayı aç → **↻ Yenile** (EVDS verisi otomatik çekilir)
2. **Piyasa** sekmesi → CDS değerini gir → Kaydet
3. **Dashboard** → **Bu haftayı kaydet** (snapshot)

---

## Veri Kaynakları

| Veri | Kaynak | Frekans |
|------|--------|---------|
| DİBS Net | EVDS `TP.MKNETHAR.M8` | Haftalık |
| Hisse Net | EVDS `TP.MKNETHAR.M7` | Haftalık |
| Brüt Rezerv | EVDS `TP.AB.C2` | Haftalık |
| Politika Faizi | EVDS `TP.BISPOLFAIZ.TUR` | Aylık |
| 2Y (TLREF) | EVDS `TP.BISTTLREF.ORAN` | İş günü |
| USDTRY | Yahoo Finance | Günlük |
| 5Y CDS | Manuel giriş | Haftalık |
