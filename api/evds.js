// api/evds.js - EVDS proxy, API key'i gizler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.EVDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'EVDS_API_KEY eksik' });

  const { series, startDate, endDate } = req.query;
  if (!series) return res.status(400).json({ error: 'series parametresi gerekli' });

  const today = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).replace(/\./g, '-');

  const url = `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=${series}&startDate=${startDate || '01-01-2025'}&endDate=${endDate || today}&type=json`;

  try {
    const evdsRes = await fetch(url, {
      headers: { 'key': apiKey }
    });

    const text = await evdsRes.text();
    if (!text || text.trim() === '') {
      return res.status(200).json({ items: [] });
    }
    if (text.trim().startsWith('<')) {
      return res.status(502).json({ error: 'EVDS HTML döndü', url });
    }

    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
