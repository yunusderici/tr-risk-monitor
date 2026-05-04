// api/cds.js - CDS değerini Vercel KV'de saklar
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const data = await kv.get('cds_current') || { value: 239.21, updatedAt: null };
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { value } = req.body;
    if (!value || isNaN(parseFloat(value))) {
      return res.status(400).json({ error: 'Geçersiz değer' });
    }
    const data = { value: parseFloat(value), updatedAt: new Date().toISOString() };
    await kv.set('cds_current', data);
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
