# 🔍 Takealot Search Arbitrage Dashboard

**Zero-cost, zero-backend dashboard that monitors Takealot search quality to identify pricing arbitrage opportunities.**

Runs forever free on GitHub Pages + GitHub Actions. No database. No server. No credit card.

---

## What It Does

1. **Scrapes** the unauthenticated Takealot search API daily
2. **Scores** search result relevance using drift detection + keyword analysis
3. **Surfaces** queries where search is broken → these are your arbitrage opportunities
4. **Tracks** prices and trends over time

### The Logic

When Takealot search is broken, buyers can't find alternatives. That means **pricing power** for whoever shows up first with the right keywords. This dashboard tells you *which* queries are broken *today*.

---

## 🚀 Deploy in 2 Minutes

### 1. Create a GitHub Repository

Go to [github.com/new](https://github.com/new) and create a public repo called `takealot-dashboard`.

### 2. Push This Code

```bash
cd takealot-dashboard
git init
git add .
git commit -m "Initial dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/takealot-dashboard.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to **Settings → Pages** in your repo
2. Source: **Deploy from a branch**
3. Branch: `main` / `root`
4. Click **Save**
5. Wait 1 minute. Your dashboard lives at:
   ```
   https://YOUR_USERNAME.github.io/takealot-dashboard/
   ```

### 4. Enable GitHub Actions

1. Go to **Actions** tab in your repo
2. Click "I understand my workflows, go ahead and enable them"
3. The scraper runs automatically every day at 06:00 UTC
4. To run immediately: Go to **Actions → Scrape Takealot Daily → Run workflow**

---

## 🖥️ Run Locally

```bash
cd takealot-dashboard
python3 scripts/scrape.py
# Open index.html in your browser
```

---

## 📊 Dashboard Sections

| Section | Purpose |
|---------|---------|
| **Top Opportunities** | Queries with <55% relevance or 2+ category drift items. Sort by `HIGH` vs `MEDIUM`. |
| **Quality Scores** | Bar chart showing which queries have broken search. Red = broken, green = working. |
| **Query Breakdown** | Full drill-down per query. See exact products returned, drift flags, and prices. |
| **Quality Trend** | Line chart showing search quality over time (updates after 2+ days of data). |
| **Price Intelligence** | Live pricing from the top opportunity. See what buyers currently pay. |

---

## 🎮 Customize Your Queries

Edit `scripts/scrape.py` → `QUERIES` list:

```python
{"query": "your search term here", "expects": ["keyword1", "keyword2"], "niche": "category"}
```

- `query`: What a buyer would type
- `expects`: Keywords that *should* appear in relevant results
- `niche`: Category for drift detection (toys, pc, audio, etc.)

Push to GitHub and re-run the workflow.

---

## 🧠 How Scoring Works

The quality algorithm is designed for **arbitrage detection**, not academic accuracy:

| Factor | Weight | Why |
|--------|--------|-----|
| Category drift | -18% per item | Socks in a toy search = broken |
| Top-5 relevance | Up to +30% | Must match 2+ expected keywords |
| Zero-review junk | -5% per item | Bad ranking algo surfaces unproven listings |

A score below 55% means buyers are frustrated and settling — **your entry point**.

---

## 💰 Using the Data

**The playbook:**

1. Check dashboard for `HIGH` opportunities
2. Search that query on Takealot manually — confirm it's still broken
3. Source the product off-platform (Amazon US, AliExpress, local distributor)
4. List on Takealot with keyword-loaded title capturing the broken query
5. Price 40–100% above cost because buyers can't find alternatives

**Example from live data:**
- Query: `"boys toys for 3 year old"` → Quality: **29.8%**
- Takealot returns: socks, tracksuits, girl toys
- Your move: Source actual boys' toys, title them `"Toys for 3 Year Old Boys — Educational Construction Vehicles Gift Set"`
- Result: You own the search results. No competition. Premium pricing.

---

## ⚠️ Limits & Ethics

- **API Rate Limits:** The scraper is gentle (1 request per query, 17 queries, once daily). Don't increase frequency.
- **Terms of Service:** This is public data from an unauthenticated API. But respect robots.txt and don't hammer their servers.
- **Arbitrage Risk:** Don't buy from Takealot and relist on Takealot. Source from elsewhere. Avoid trademark infringement. Don't claim "official" unless it is.

---

## 🛠️ Architecture

```
GitHub Actions (free cron)
    ↓
Python scraper hits api.takealot.com
    ↓
Saves JSON to /data/YYYY-MM-DD.json
    ↓
Overwrites /data/latest.json
    ↓
GitHub Pages (free host) serves static HTML
    ↓
Browser loads latest.json + renders charts
```

**Total cost: $0.00/month. Forever.**

---

## Files

| File | Purpose |
|------|---------|
| `scripts/scrape.py` | Search API scraper + quality scorer |
| `.github/workflows/scrape.yml` | Daily cron job |
| `index.html` | Dashboard UI |
| `style.css` | Dark gaming theme |
| `app.js` | Chart rendering + data loading |
| `data/latest.json` | Current snapshot (auto-generated) |

---

Built to exploit information asymmetry. Use wisely.
