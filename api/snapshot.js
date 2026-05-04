// api/snapshot.js - Haftalık risk snapshot'larını Vercel KV'de saklar
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const snapshots = await kv.get('snapshots') || [];
    return res.status(200).json(snapshots);
  }

  if (req.method === 'POST') {
    const snap = req.body;
    if (!snap || !snap.tarih) return res.status(400).json({ error: 'tarih gerekli' });

    const snapshots = await kv.get('snapshots') || [];
    const exists = snapshots.find(s => s.tarih === snap.tarih);
    if (exists) return res.status(409).json({ error: `${snap.tarih} zaten kayıtlı` });

    snapshots.push({ ...snap, savedAt: new Date().toISOString() });
    await kv.set('snapshots', snapshots);
    return res.status(200).json({ ok: true, total: snapshots.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
