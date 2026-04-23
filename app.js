const DATA_URL = 'data/latest.json';
const HISTORY_URLS = [];

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
    document.getElementById('opportunities-table').innerHTML =
      `<div class="loading">Error loading data: ${err.message}<br>Run <code>python scripts/scrape.py</code> to generate data.</div>`;
  }
}

function renderDashboard(data) {
  // Status bar
  const scraped = new Date(data.scraped_at);
  document.getElementById('last-scraped').textContent =
    'Last scraped: ' + scraped.toLocaleString();
  document.getElementById('avg-quality').textContent =
    `Avg Quality: ${data.summary.avg_quality}%`;
  document.getElementById('opp-count').textContent =
    `Opportunities: ${data.opportunities.length} (${data.summary.high_opportunity_count} HIGH)`;

  // Opportunities table
  const oppContainer = document.getElementById('opportunities-table');
  if (!data.opportunities || data.opportunities.length === 0) {
    oppContainer.innerHTML = '<div class="loading">No opportunities found. Search might be working too well today.</div>';
  } else {
    const sorted = data.opportunities.sort((a,b) =>
      (b.potential === 'HIGH' ? 2 : 1) - (a.potential === 'HIGH' ? 2 : 1)
      || a.quality_score - b.quality_score
    );

    let html = `<div class="opp-row header">
      <div>Query</div>
      <div>Niche</div>
      <div>Quality</div>
      <div>Potential</div>
      <div>Price Range</div>
    </div>`;

    sorted.forEach(o => {
      const badgeClass = o.potential === 'HIGH' ? 'badge-high' : 'badge-medium';
      const scoreClass = o.quality_score < 30 ? 'score-low' : o.quality_score < 60 ? 'score-mid' : 'score-high';
      html += `<div class="opp-row">
        <div><strong>${o.query}</strong></div>
        <div>${o.niche}</div>
        <div>
          <div class="score-bar"><div class="${scoreClass}" style="width:${o.quality_score}%"></div></div>
          <small>${o.quality_score}%</small>
        </div>
        <div><span class="badge ${badgeClass}">${o.potential}</span></div>
        <div class="price-highlight">${o.price_range}</div>
      </div>`;
    });
    oppContainer.innerHTML = html;
  }

  // Quality bar chart
  const ctx = document.getElementById('quality-chart').getContext('2d');
  const labels = data.queries.map(q => q.query.length > 25 ? q.query.slice(0,25)+'...' : q.query);
  const scores = data.queries.map(q => q.quality_score);
  const colors = scores.map(s => s < 30 ? '#ff6b6b' : s < 60 ? '#feca57' : '#1dd1a1');

  if (qualityChart) qualityChart.destroy();
  qualityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Relevance Score %',
        data: scores,
        backgroundColor: colors,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: '#374151' }, ticks: { color: '#8899a6' } },
        x: { grid: { display: false }, ticks: { color: '#8899a6', font: { size: 10 } } }
      }
    }
  });
  document.getElementById('quality-chart').style.height = '280px';

  // Query breakdown
  const breakdown = document.getElementById('query-breakdown');
  let bhtml = '';
  data.queries.forEach(q => {
    const scoreClass = q.quality_score < 30 ? 'score-low' : q.quality_score < 60 ? 'score-mid' : 'score-high';
    const prods = q.products.slice(0,4).map(p =>
      `<span class="product-mini" title="${p.title}">${p.price_display} ★${p.rating}</span>`
    ).join('');

    const driftTags = q.drift_items && q.drift_items.length
      ? q.drift_items.slice(0,3).map(d => `<span class="drift-tag" title="Wrong category detected">⚠️ ${d.slice(0,30)}</span>`).join('')
      : '';

    bhtml += `<div class="query-item">
      <div class="query-header">
        <span class="query-title">${q.query}</span>
        <span style="color:${q.quality_score < 50 ? '#ff6b6b' : '#1dd1a1'};font-weight:700">${q.quality_score}%</span>
      </div>
      <div class="query-meta">
        <span>Niche: ${q.niche}</span>
        <span>Results: ${q.result_count}</span>
        <span>Drift: ${q.drift_count} items</span>
      </div>
      <div style="margin:0.3rem 0">${driftTags}</div>
      <div>${prods}</div>
    </div>`;
  });
  breakdown.innerHTML = bhtml;

  // Price intel for top opportunity
  const topOpp = data.opportunities[0];
  const priceIntel = document.getElementById('price-intel');
  if (topOpp) {
    const matchQ = data.queries.find(q => q.query === topOpp.query);
    if (matchQ && matchQ.products.length) {
      let phtml = `<p style="margin-bottom:0.5rem;color:#8899a6;font-size:0.85rem">
        Top opportunity: <strong style="color:#e2e8f0">${topOpp.query}</strong> —
        Listings are so bad you can charge premium prices.
      </p><div class="price-grid">`;
      matchQ.products.forEach(p => {
        phtml += `<div class="price-card">
          <div class="title">${p.title}</div>
          <div class="price">${p.price_display}</div>
          <div class="meta">${p.brand} • ★${p.rating} (${p.reviews} reviews)</div>
        </div>`;
      });
      phtml += '</div>';
      priceIntel.innerHTML = phtml;
    } else {
      priceIntel.innerHTML = '<div class="loading">No price data for top opportunity.</div>';
    }
  } else {
    priceIntel.innerHTML = '<div class="loading">No opportunities to analyze.</div>';
  }
}

async function loadHistory() {
  // Attempt to fetch last 7 days of history for trend chart
  const dates = [];
  const now = new Date();
  for (let i=6; i>=0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate()-i);
    dates.push(d.toISOString().slice(0,10));
  }

  const history = [];
  for (const date of dates) {
    try {
      const res = await fetch(`data/${date}.json`);
      if (res.ok) history.push(await res.json());
    } catch (e) { /* ignore missing files */ }
  }

  if (history.length < 2) {
    // Not enough history; show placeholder
    const ctx = document.getElementById('trend-chart').getContext('2d');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Day 1','Day 2','Day 3','Day 4','Day 5','Day 6','Day 7'],
        datasets: [{
          label: 'Avg Quality %',
          data: [null,null,null,null,null,null,null],
          borderColor: '#66fcf1',
          backgroundColor: 'rgba(102,252,241,0.1)',
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Run scraper for 2+ days to see trends', color: '#8899a6' }
        },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: '#374151' }, ticks: { color: '#8899a6' } },
          x: { grid: { display: false }, ticks: { color: '#8899a6' } }
        }
      }
    });
    document.getElementById('trend-chart').style.height = '220px';
    return;
  }

  const labels = history.map(h => h.scraped_at ? new Date(h.scraped_at).toLocaleDateString() : '?');
  const avgScores = history.map(h => h.summary?.avg_quality ?? 0);
  const oppCounts = history.map(h => h.opportunities?.length ?? 0);

  const ctx = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg Quality %',
          data: avgScores,
          borderColor: '#66fcf1',
          backgroundColor: 'rgba(102,252,241,0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Opportunities',
          data: oppCounts,
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255,107,107,0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#8899a6' } } },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          max: 100,
          grid: { color: '#374151' },
          ticks: { color: '#8899a6' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: '#ff6b6b' }
        },
        x: { grid: { display: false }, ticks: { color: '#8899a6' } }
      }
    }
  });
  document.getElementById('trend-chart').style.height = '220px';
}

loadData();
