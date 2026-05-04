export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await r.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!price) throw new Error('Fiyat alinamadi');
    return res.status(200).json({ value: price });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
