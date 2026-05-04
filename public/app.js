// app.js - Ana uygulama mantığı

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CONFIG = {
  evdsStart: '01-01-2025',
  series: {
    dibs: 'TP.MKNETHAR.M8',
    hisse: 'TP.MKNETHAR.M7',
    rezerv: 'TP.AB.C2',
    polFaiz: 'TP.BISPOLFAIZ.TUR',
    tlref: 'TP.BISTTLREF.ORAN',
  },
  thresholds: {
    cdsHigh: 350, cdsCaution: 250,
    flowSevere: -1000, flowCaution: -500,
    rezervWeak: 160, rezervCaution: 175,
    y2Severe: 40, y2Caution: 35,
  }
};

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  weekly: [],
  market: { usdtry: null, polFaiz: null, tlref: null, cds: null, cdsUpdatedAt: null },
  riskModel: null,
  snapshots: [],
  loading: { weekly: false, market: false, snapshots: false },
  initialized: {}
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmt(v, dec = 1) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toFixed(dec);
}
function fmtSign(v, dec = 1) {
  if (v === null || v === undefined || v === '') return '—';
  return (v >= 0 ? '+' : '') + fmt(v, dec);
}
function fmtDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}
function today() {
  return new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '-');
}
function scoreColor(v) {
  if (v >= 80) return '#ff6b6b';
  if (v >= 60) return '#ffaa4a';
  if (v >= 30) return '#4ab8ff';
  return '#4aff9a';
}
function badgeClass(d) {
  if (d === 'Yüksek') return 'badge-yuksel';
  if (d === 'Artıyor') return 'badge-artiyor';
  if (d === 'İzle') return 'badge-izle';
  return 'badge-dusuk';
}
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 2500);
}

// ─── API CALLS ───────────────────────────────────────────────────────────────
async function evdsFetch(series) {
  const r = await fetch(`/api/evds?series=${series}&startDate=${CONFIG.evdsStart}&endDate=${today()}`);
  if (!r.ok) throw new Error(`EVDS ${series} hata: ${r.status}`);
  const data = await r.json();
  return (data.items || []).map(item => {
    const fieldName = series.replace(/\./g, '_');
    const tarih = item.Tarih || item.DATE || '';
    let value = item[fieldName];
    if (value === undefined || value === null || value === '') {
      const skip = { Tarih: 1, DATE: 1, UNIXTIME: 1, YEARWEEK: 1 };
      for (const k of Object.keys(item)) {
        if (!skip[k] && typeof item[k] !== 'object') {
          const n = parseFloat(String(item[k]).replace(',', '.'));
          if (!isNaN(n)) { value = item[k]; break; }
        }
      }
    }
    const parts = tarih.split('-');
    const isoDate = parts.length === 3
      ? (parts[0].length === 4 ? tarih : `${parts[2]}-${parts[1]}-${parts[0]}`)
      : tarih;
    const numVal = parseFloat(String(value).replace(',', '.'));
    return { date: isoDate, value: isNaN(numVal) ? null : numVal };
  }).filter(r => r.date);
}

async function getCds() {
  const r = await fetch('/api/cds');
  if (!r.ok) return { value: 239.21, updatedAt: null };
  return r.json();
}

async function saveCdsApi(value) {
  const r = await fetch('/api/cds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
  return r.json();
}

async function getSnapshots() {
  const r = await fetch('/api/snapshot');
  if (!r.ok) return [];
  return r.json();
}

async function saveSnapshot(snap) {
  const r = await fetch('/api/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap)
  });
  if (r.status === 409) throw new Error('Bu tarih zaten kayıtlı');
  if (!r.ok) throw new Error('Snapshot kaydedilemedi');
  return r.json();
}

// ─── RISK MODEL ──────────────────────────────────────────────────────────────
function calcRiskModel(weekly, market) {
  if (!weekly.length || !market.cds) return null;
  const last = weekly[weekly.length - 1];
  const t = CONFIG.thresholds;

  const flow = last.flow;
  let flowScore = 10;
  if (flow <= t.flowSevere) flowScore = 100;
  else if (flow <= t.flowCaution) flowScore = 80;
  else if (flow < 0) flowScore = 60;
  else if (flow < 500) flowScore = 35;

  const cds = market.cds;
  let cdsScore = 20;
  if (cds >= t.cdsHigh) cdsScore = 100;
  else if (cds >= t.cdsCaution) cdsScore = 70;

  const rezerv = last.rezerv;
  let resvScore = 20;
  if (rezerv <= t.rezervWeak) resvScore = 100;
  else if (rezerv <= t.rezervCaution) resvScore = 70;
  else if (last.rezervWow < 0) resvScore = 60;

  const y2 = market.tlref;
  let y2Score = 25;
  if (y2 >= t.y2Severe) y2Score = 100;
  else if (y2 >= t.y2Caution) y2Score = 70;

  const riskSkoru = Math.round((flowScore + cdsScore + resvScore + y2Score) / 4);
  const kurBaskisi = Math.round(flowScore * 0.35 + cdsScore * 0.25 + resvScore * 0.25 + y2Score * 0.15);

  let durum = 'Düşük';
  if (kurBaskisi >= 80) durum = 'Yüksek';
  else if (kurBaskisi >= 60) durum = 'Artıyor';
  else if (kurBaskisi >= 30) durum = 'İzle';

  return { flowScore, cdsScore, resvScore, y2Score, riskSkoru, kurBaskisi, durum, last };
}

// ─── EVDS VERİ ÇEKME ─────────────────────────────────────────────────────────
async function loadEVDSData() {
  if (state.loading.weekly) return;
  state.loading.weekly = true;
  showToast('EVDS verisi çekiliyor...');

  try {
    const [dibsData, hisseData, rezervData] = await Promise.all([
      evdsFetch(CONFIG.series.dibs),
      evdsFetch(CONFIG.series.hisse),
      evdsFetch(CONFIG.series.rezerv),
    ]);

    const map = {};
    dibsData.forEach(r => {
      map[r.date] = map[r.date] || { date: r.date };
      map[r.date].dibs = r.value;
    });
    hisseData.forEach(r => {
      map[r.date] = map[r.date] || { date: r.date };
      map[r.date].hisse = r.value;
    });
    rezervData.forEach(r => {
      map[r.date] = map[r.date] || { date: r.date };
      map[r.date].rezerv = r.value > 1000 ? r.value / 1000 : r.value;
    });

    const sorted = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach((w, i) => {
      w.flow = ((w.dibs || 0) + (w.hisse || 0));
      w.rezervWow = i > 0 && sorted[i - 1].rezerv != null && w.rezerv != null
        ? parseFloat((w.rezerv - sorted[i - 1].rezerv).toFixed(3))
        : null;
    });

    state.weekly = sorted;
    showToast('EVDS verisi güncellendi', 'success');
    renderAll();
  } catch (e) {
    showToast('EVDS hatası: ' + e.message, 'error');
  }
  state.loading.weekly = false;
}

async function loadMarketData() {
  if (state.loading.market) return;
  state.loading.market = true;

  try {
    const [polFaizData, tlrefData, cdsData] = await Promise.all([
      evdsFetch(CONFIG.series.polFaiz),
      evdsFetch(CONFIG.series.tlref),
      getCds(),
    ]);

    // USDTRY - Google Finance proxy (basit)
    let usdtry = null;
    try {
      const gfRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?interval=1d&range=1d');
      const gfData = await gfRes.json();
      usdtry = gfData?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
    } catch (_) {}

    state.market = {
      usdtry,
      polFaiz: polFaizData.length ? polFaizData[polFaizData.length - 1].value : null,
      tlref: tlrefData.length ? tlrefData[tlrefData.length - 1].value : null,
      cds: cdsData.value,
      cdsUpdatedAt: cdsData.updatedAt,
    };
    renderAll();
  } catch (e) {
    showToast('Piyasa verisi hatası: ' + e.message, 'error');
  }
  state.loading.market = false;
}

async function loadSnapshots() {
  try {
    state.snapshots = await getSnapshots();
    renderGecmis();
  } catch (e) {}
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderAll() {
  state.riskModel = calcRiskModel(state.weekly, state.market);
  document.getElementById('ts').textContent = new Date().toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  if (state.initialized.dashboard) renderDashboard();
  if (state.initialized.weekly) renderWeekly();
  if (state.initialized.market) renderMarket();
}

function renderDashboard() {
  const rm = state.riskModel;
  const pct = rm ? rm.kurBaskisi : 0;

  const total = 345;
  document.getElementById('gaugeArc').setAttribute('stroke-dasharray',
    `${(pct / 100 * total)} ${total - (pct / 100 * total)}`);
  const angle = -90 + (pct / 100 * 180);
  document.getElementById('gaugeNeedle').setAttribute('transform', `rotate(${angle},130,130)`);
  document.getElementById('gaugeNum').textContent = rm ? pct : '—';

  if (!rm) return;

  document.getElementById('riskSkoru').textContent = rm.riskSkoru;
  const badge = document.getElementById('durumBadge');
  badge.textContent = rm.durum;
  badge.className = 'badge ' + badgeClass(rm.durum);

  document.getElementById('flowScore').textContent = rm.flowScore;
  document.getElementById('cdsScore').textContent = rm.cdsScore;
  document.getElementById('resvScore').textContent = rm.resvScore;
  document.getElementById('y2Score').textContent = rm.y2Score;

  document.getElementById('sonTarih').textContent = fmtDate(rm.last.date);
  const flowEl = document.getElementById('toplamFlow');
  flowEl.textContent = fmtSign(rm.last.flow, 0) + ' $m';
  flowEl.className = 's-val ' + (rm.last.flow >= 0 ? 'pos' : 'neg');

  document.getElementById('brutRezv').textContent = fmt(rm.last.rezerv, 2) + ' $bn';
  const wowEl = document.getElementById('rezervWow');
  wowEl.textContent = (rm.last.rezervWow !== null ? fmtSign(rm.last.rezervWow, 2) : '—') + ' $bn';
  wowEl.className = 's-val ' + (rm.last.rezervWow >= 0 ? 'pos' : 'neg');

  renderRiskChart();
}

function renderWeekly() {
  const el = document.getElementById('weeklyList');
  if (!state.weekly.length) {
    el.innerHTML = '<div class="loading"><div class="spinner"></div>Veri yükleniyor...</div>';
    return;
  }
  const items = [...state.weekly].reverse().slice(0, 20);
  el.innerHTML = items.map(w => `
    <div class="weekly-item">
      <div class="weekly-date">${fmtDate(w.date)}</div>
      <div class="weekly-row"><span class="weekly-label">DİBS Net</span><span class="weekly-value ${w.dibs >= 0 ? 'pos' : 'neg'}">${fmtSign(w.dibs, 1)} $m</span></div>
      <div class="weekly-row"><span class="weekly-label">Hisse Net</span><span class="weekly-value ${w.hisse >= 0 ? 'pos' : 'neg'}">${fmtSign(w.hisse, 1)} $m</span></div>
      <div class="weekly-row"><span class="weekly-label">Toplam Flow</span><span class="weekly-value ${w.flow >= 0 ? 'pos' : 'neg'}">${fmtSign(w.flow, 1)} $m</span></div>
      <div class="weekly-row"><span class="weekly-label">Brüt Rezerv</span><span class="weekly-value">${fmt(w.rezerv, 2)} $bn</span></div>
      <div class="weekly-row"><span class="weekly-label">Rezerv WoW Δ</span><span class="weekly-value ${w.rezervWow === null ? '' : w.rezervWow >= 0 ? 'pos' : 'neg'}">${w.rezervWow !== null ? fmtSign(w.rezervWow, 2) + ' $bn' : '—'}</span></div>
    </div>`).join('');
}

function renderMarket() {
  const m = state.market;
  document.getElementById('usdtry').textContent = m.usdtry ? fmt(m.usdtry, 2) : '—';
  document.getElementById('polFaiz').textContent = m.polFaiz ? fmt(m.polFaiz, 1) : '—';
  document.getElementById('tahvil2y').textContent = m.tlref ? fmt(m.tlref, 1) : '—';
  document.getElementById('cds5y').textContent = m.cds ? fmt(m.cds, 2) : '—';
  document.getElementById('cdsUpdatedAt').textContent = m.cdsUpdatedAt
    ? 'Son güncelleme: ' + new Date(m.cdsUpdatedAt).toLocaleDateString('tr-TR')
    : 'Henüz güncellenmedi';
  document.getElementById('cdsInput').placeholder = m.cds ? fmt(m.cds, 2) : '239.21';

  if (!state.riskModel) return;
  const rm = state.riskModel;
  const scores = [
    { name: 'Flow Score', val: rm.flowScore, desc: 'Sermaye çıkışı baskısı' },
    { name: 'CDS Score', val: rm.cdsScore, desc: 'Kredi temerrüt swap riski' },
    { name: 'Reserve Score', val: rm.resvScore, desc: 'Rezerv erime baskısı' },
    { name: '2Y Stress Score', val: rm.y2Score, desc: 'Faiz eğrisi stresi' },
  ];
  document.getElementById('subScores').innerHTML = scores.map(s => `
    <div class="sub-score-item">
      <div class="sub-score-header">
        <span class="sub-score-name">${s.name} <span style="font-size:11px;color:var(--muted)">— ${s.desc}</span></span>
        <span class="sub-score-val" style="color:${scoreColor(s.val)}">${s.val}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${s.val}%;background:${scoreColor(s.val)}"></div></div>
    </div>`).join('');
}

function renderGecmis() {
  const el = document.getElementById('gecmisList');
  if (!state.snapshots.length) {
    el.innerHTML = '<div class="empty">Henüz snapshot yok. Dashboard\'dan kaydet.</div>';
    renderTrendChart();
    return;
  }
  const items = [...state.snapshots].reverse();
  el.innerHTML = items.map(g => `
    <div class="history-item">
      <div>
        <div class="h-date">${fmtDate(g.tarih)}</div>
        <div class="h-score">${g.riskSkoru}</div>
      </div>
      <div>
        <div class="h-pct" style="color:${scoreColor(g.kurBaskisi)}">%${g.kurBaskisi}</div>
        <div class="h-status"><span class="badge ${badgeClass(g.durum)}" style="font-size:10px;padding:3px 8px">${g.durum}</span></div>
      </div>
    </div>`).join('');
  renderTrendChart();
}

// ─── CHARTS ──────────────────────────────────────────────────────────────────
let riskChartInstance = null;
function renderRiskChart() {
  const ctx = document.getElementById('riskChart');
  if (!ctx) return;
  const data = state.snapshots.length >= 2 ? state.snapshots : [];
  if (!data.length) return;

  if (riskChartInstance) riskChartInstance.destroy();
  riskChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: data.map(d => fmtDate(d.tarih)),
      datasets: [
        { label: 'Risk', data: data.map(d => d.riskSkoru), borderColor: '#c8b8ff', backgroundColor: 'rgba(200,184,255,.08)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: '#c8b8ff' },
        { label: 'Kur Baskısı', data: data.map(d => d.kurBaskisi), borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,.06)', tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: '#ff6b6b', borderDash: [4, 4] }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b6b8a', font: { size: 10 } }, grid: { color: '#1c1c26' } },
        y: { ticks: { color: '#6b6b8a', font: { size: 10 } }, grid: { color: '#1c1c26' }, min: 0, max: 100 }
      }
    }
  });
}

let trendChartInstance = null;
function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  const data = state.snapshots;

  if (trendChartInstance) trendChartInstance.destroy();
  if (!data.length) return;

  trendChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => fmtDate(d.tarih)),
      datasets: [{
        label: 'Kur Baskısı %',
        data: data.map(d => d.kurBaskisi),
        backgroundColor: data.map(d => scoreColor(d.kurBaskisi) + '55'),
        borderColor: data.map(d => scoreColor(d.kurBaskisi)),
        borderWidth: 1.5, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b6b8a', font: { size: 10 }, autoSkip: false, maxRotation: 45 }, grid: { color: '#1c1c26' } },
        y: { ticks: { color: '#6b6b8a', font: { size: 10 } }, grid: { color: '#1c1c26' }, min: 0, max: 100 }
      }
    }
  });
}

// ─── ACTIONS ─────────────────────────────────────────────────────────────────
window.saveCds = async function () {
  const v = parseFloat(document.getElementById('cdsInput').value);
  if (isNaN(v)) return showToast('Geçersiz değer', 'error');
  const btn = document.querySelector('.save-btn');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';
  try {
    const res = await saveCdsApi(v);
    state.market.cds = res.value;
    state.market.cdsUpdatedAt = res.updatedAt;
    renderAll();
    showToast('CDS kaydedildi: ' + fmt(v, 2) + ' bp', 'success');
  } catch (e) {
    showToast('Kayıt hatası: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Kaydet';
};

window.saveSnapshotAction = async function () {
  if (!state.riskModel) return showToast('Risk modeli hesaplanmadı', 'error');
  const rm = state.riskModel;
  const snap = {
    tarih: fmtDate(rm.last.date),
    riskSkoru: rm.riskSkoru,
    kurBaskisi: rm.kurBaskisi,
    durum: rm.durum,
  };
  const btn = document.getElementById('snapBtn');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';
  try {
    await saveSnapshot(snap);
    await loadSnapshots();
    showToast('Snapshot kaydedildi: ' + snap.tarih, 'success');
    if (state.initialized.gecmis) renderGecmis();
  } catch (e) {
    showToast(e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Bu haftayı kaydet';
};

window.refreshData = async function () {
  await Promise.all([loadEVDSData(), loadMarketData()]);
};

// ─── TAB NAVIGATION ──────────────────────────────────────────────────────────
window.showSection = function (id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  btn.classList.add('active');

  if (!state.initialized[id]) {
    state.initialized[id] = true;
    if (id === 'weekly') renderWeekly();
    if (id === 'market') renderMarket();
    if (id === 'gecmis') { renderGecmis(); }
  }
};

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  state.initialized.dashboard = true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // İlk yükleme
  await Promise.all([loadEVDSData(), loadMarketData(), loadSnapshots()]);
}

document.addEventListener('DOMContentLoaded', init);
