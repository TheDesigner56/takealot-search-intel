const DATA_URL = '/data/latest.json';

let qualityChart = null;
let trendChart = null;

async function loadData() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('Failed to load latest.json');
    const data = await res.json();
    renderDashboard(data);
    await loadHistory();
  } catch (err) {
    showError(err.message);
  }
}

function showError(msg) {
  document.getElementById('kpi-section').innerHTML =
    `<div class="section" style="grid-column:1/-1"><div class="card" style="padding:40px;text-align:center;color:var(--danger)">
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <div style="font-weight:700;margin-bottom:8px">Failed to load dashboard data</div>
      <div style="color:var(--text-muted);font-size:13px">${msg}<br>Run <code>python scripts/scrape.py</code> locally to generate data.</div>
    </div></div>`;
}

function colorClass(score) {
  if (score < 40) return 'low';
  if (score < 60) return 'mid';
  return 'high';
}

function bgClass(score) {
  if (score < 40) return 'bg-low';
  if (score < 60) return 'bg-mid';
  return 'bg-high';
}

function renderDashboard(data) {
  const scraped = data.scraped_at ? new Date(data.scraped_at) : new Date();
  document.getElementById('last-scraped').textContent = scraped.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // KPIs
  const summary = data.summary || {};
  document.getElementById('kpi-quality').textContent = (summary.avg_quality ?? 0) + '%';
  document.getElementById('kpi-quality').className = 'kpi-value ' + colorClass(summary.avg_quality ?? 0);
  document.getElementById('kpi-quality-delta').textContent = 'Average relevance score';

  document.getElementById('kpi-opps').textContent = data.opportunities?.length ?? 0;
  document.getElementById('kpi-opps-delta').textContent = 'queries with broken search';

  document.getElementById('kpi-high').textContent = summary.high_opportunity_count ?? 0;
  document.getElementById('kpi-high-delta').textContent = 'immediate action items';

  document.getElementById('kpi-queries').textContent = summary.total_queries ?? data.queries?.length ?? 0;

  // Remove skeleton classes from KPI cards
  document.querySelectorAll('.kpi-card').forEach(el => el.classList.remove('loading-skeleton'));

  // Opportunities cards
  const oppContainer = document.getElementById('opportunities-grid');
  if (!data.opportunities || data.opportunities.length === 0) {
    oppContainer.innerHTML = `
      <div class="opp-card" style="grid-column:1/-1;text-align:center;padding:40px">
        <div style="font-size:24px;margin-bottom:8px">✅</div>
        <div style="font-weight:700;color:var(--text)">No opportunities found</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Search is working too well today. Check back tomorrow.</div>
      </div>`;
  } else {
    const sorted = data.opportunities.sort((a,b) =>
      (b.potential === 'HIGH' ? 2 : 1) - (a.potential === 'HIGH' ? 2 : 1)
      || (a.quality_score ?? 0) - (b.quality_score ?? 0)
    );

    oppContainer.innerHTML = sorted.map(o => {
      const lvl = o.potential?.toLowerCase() || 'medium';
      const q = data.queries.find(q => q.query === o.query);
      const topPrice = q?.products?.[0]?.price_display || o.price_range || 'N/A';
      return `
        <div class="opp-card ${lvl}">
          <div class="opp-header">
            <div class="opp-query">${escapeHtml(o.query)}</div>
            <span class="opp-badge ${lvl}">${o.potential}</span>
          </div>
          <div class="opp-meta">
            <span style="text-transform:uppercase;font-size:10px;letter-spacing:0.5px;color:var(--text-muted)">${o.niche || 'general'}</span>
            <span>•</span>
            <span>${o.drift_count ?? 0} drift items</span>
          </div>
          <div class="opp-score-wrap">
            <div class="opp-score-bar"><div class="${bgClass(o.quality_score ?? 0)}" style="width:${o.quality_score ?? 0}%"></div></div>
            <span class="opp-score-val ${colorClass(o.quality_score ?? 0)}">${o.quality_score ?? 0}%</span>
          </div>
          <div class="opp-price">Top result: <strong>${topPrice}</strong></div>
          <div class="opp-action">Source this product → keyword-optimize title → price 40-100% above cost</div>
        </div>`;
    }).join('');
  }

  // Quality chart
  renderQualityChart(data.queries || []);

  // Query breakdown table
  const tbody = document.getElementById('query-tbody');
  const sortedQueries = [...(data.queries || [])].sort((a,b) => (a.quality_score ?? 0) - (b.quality_score ?? 0));
  tbody.innerHTML = sortedQueries.map(q => {
    const lvl = colorClass(q.quality_score ?? 0);
    const topPrice = q.products?.[0]?.price_display || '—';
    const driftText = (q.drift_count ?? 0) > 0 ? `${q.drift_count} wrong items` : 'Clean';
    return `
      <tr>
        <td class="query-cell">${escapeHtml(q.query)}</td>
        <td><span class="niche-tag">${q.niche || '—'}</span></td>
        <td class="score-cell">
          <div class="mini-bar"><div class="${bgClass(q.quality_score ?? 0)}" style="width:${q.quality_score ?? 0}%"></div></div>
          <span class="score-num ${lvl}">${q.quality_score ?? 0}%</span>
        </td>
        <td class="drift-cell ${(q.drift_count ?? 0) > 0 ? 'has-drift' : ''}">${driftText}</td>
        <td class="price-cell">${topPrice}</td>
        <td class="action-cell">
          <button class="btn btn-ghost" onclick="alert('Query: ${escapeHtml(q.query)}\\nNiche: ${q.niche}\\nQuality: ${q.quality_score}%')">Details</button>
        </td>
      </tr>`;
  }).join('');

  // Price intel
  const priceContainer = document.getElementById('price-grid');
  const topOpp = sorted[0];
  if (topOpp) {
    const matchQ = data.queries.find(q => q.query === topOpp.query);
    if (matchQ && matchQ.products.length) {
      priceContainer.innerHTML = matchQ.products.slice(0, 8).map(p => `
        <div class="price-card">
          <div class="title">${escapeHtml(p.title)}</div>
          <div class="price">${p.price_display}</div>
          <div class="meta">${p.brand || 'No Brand'} • ★${p.rating || 0} (${p.reviews || 0} reviews)</div>
        </div>
      `).join('');
    } else {
      priceContainer.innerHTML = '<div style="color:var(--text-muted);padding:20px">No price data available.</div>';
    }
  } else {
    priceContainer.innerHTML = '<div style="color:var(--text-muted);padding:20px">No opportunities to analyze.</div>';
  }
}

function renderQualityChart(queries) {
  const ctx = document.getElementById('quality-chart');
  if (!ctx) return;
  const labels = queries.map(q => {
    const txt = q.query;
    return txt.length > 22 ? txt.slice(0, 22) + '…' : txt;
  });
  const scores = queries.map(q => q.quality_score ?? 0);
  const colors = scores.map(s => s < 40 ? '#ef4444' : s < 60 ? '#f59e0b' : '#22c55e');

  if (qualityChart) qualityChart.destroy();
  qualityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Relevance %',
        data: scores,
        backgroundColor: colors,
        borderRadius: 4,
        barThickness: 18,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1d2a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          callbacks: {
            title: (items) => queries[items[0].dataIndex]?.query || ''
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45, minRotation: 45 }
        }
      }
    }
  });
}

async function loadHistory() {
  const dates = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const history = [];
  for (const date of dates) {
    try {
      const res = await fetch(`/data/${date}.json`);
      if (res.ok) history.push(await res.json());
    } catch (e) {}
  }

  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;

  if (history.length < 2) {
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          label: 'Avg Quality',
          data: [null,null,null,null,null,null,null],
          borderColor: '#6366f1',
          borderDash: [5,5],
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Run scraper for 2+ days to see trend data',
            color: '#64748b',
            font: { size: 13 }
          }
        },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } },
          x: { grid: { display: false }, ticks: { color: '#64748b' } }
        }
      }
    });
    return;
  }

  const labels = history.map(h => {
    const d = h.scraped_at ? new Date(h.scraped_at) : new Date();
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const avgScores = history.map(h => h.summary?.avg_quality ?? 0);
  const oppCounts = history.map(h => h.opportunities?.length ?? 0);

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg Quality %',
          data: avgScores,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
          pointRadius: 4,
          pointBackgroundColor: '#6366f1',
        },
        {
          label: 'Opportunities',
          data: oppCounts,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.05)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y1',
          pointRadius: 4,
          pointBackgroundColor: '#ef4444',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 8 }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 11 } }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: '#ef4444', font: { size: 11 } }
        },
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }
      }
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

loadData();
