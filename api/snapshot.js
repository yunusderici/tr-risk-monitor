import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const snapshots = await redis.get('snapshots') || [];
    return res.status(200).json(snapshots);
  }

  if (req.method === 'POST') {
    const snap = req.body;
    if (!snap || !snap.tarih) return res.status(400).json({ error: 'tarih gerekli' });

    const snapshots = await redis.get('snapshots') || [];
    const exists = snapshots.find(s => s.tarih === snap.tarih);
    if (exists) return res.status(409).json({ error: snap.tarih + ' zaten kayitli' });

    snapshots.push({ ...snap, savedAt: new Date().toISOString() });
    await redis.set('snapshots', snapshots);
    return res.status(200).json({ ok: true, total: snapshots.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
