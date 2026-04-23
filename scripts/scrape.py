#!/usr/bin/env python3
"""
Takealot Search Quality Scraper
Runs free on GitHub Actions. No API keys. No database.
"""

import json
import urllib.request
import urllib.parse
import ssl
import os
import sys
from datetime import datetime

# Takealot has SSL cert chain issues in some environments
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

ENDPOINT = "https://api.takealot.com/rest/v-1-11-0/searches/products,filters,facets"

# Gaming-focused queries with expected keywords for quality scoring
QUERIES = [
    {"query": "boys toys for 3 year old", "expects": ["toy", "boy", "game"], "niche": "toys"},
    {"query": "gaming headset for kids", "expects": ["headset", "headphone", "gaming"], "niche": "audio"},
    {"query": "red toy car", "expects": ["red", "car"], "niche": "toys"},
    {"query": "laptop for gaming", "expects": ["gaming", "rtx", "msi", "asus", "omen", "nitro"], "niche": "pc"},
    {"query": "non toxic crayons for 2 year old", "expects": ["crayon", "non-toxic", "wax"], "niche": "art"},
    {"query": "ps5 controller charging dock", "expects": ["charg", "dock", "station", "ps5", "controller"], "niche": "accessories"},
    {"query": "quiet gaming keyboard for office", "expects": ["keyboard", "gaming", "quiet", "silent"], "niche": "pc"},
    {"query": "gaming chair for kids", "expects": ["chair", "gaming", "kids", "racing"], "niche": "furniture"},
    {"query": "mechanical keyboard for fortnite", "expects": ["keyboard", "mechanical", "gaming"], "niche": "pc"},
    {"query": "hdmi 2.1 cable for ps5", "expects": ["hdmi", "2.1", "ps5", "cable"], "niche": "accessories"},
    {"query": "gaming mouse for small hands", "expects": ["mouse", "gaming", "small", "mini"], "niche": "pc"},
    {"query": "twitch streaming setup microphone", "expects": ["mic", "stream", "usb", "condenser"], "niche": "streaming"},
    {"query": "nintendo switch sd card 512gb", "expects": ["sd", "switch", "512", "memory"], "niche": "accessories"},
    {"query": "gaming earbuds with mic", "expects": ["earbud", "earphone", "gaming", "mic"], "niche": "audio"},
    {"query": "racing wheel for xbox and ps5", "expects": ["wheel", "racing", "xbox", "ps5"], "niche": "sim"},
    {"query": "toys to help with fine motor skills", "expects": ["toy", "motor", "skill", "fine"], "niche": "toys"},
    {"query": "beginner gaming pc setup under 10000", "expects": ["pc", "gaming", "computer", "desktop"], "niche": "pc"},
]


def search_takealot(q, rows=24):
    params = urllib.parse.urlencode({"qsearch": q, "rows": rows, "detail": "listmini"})
    url = f"{ENDPOINT}?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, context=CTX, timeout=20) as resp:
        return json.load(resp)


def score_quality(results, expects, query_niche, drift_items):
    """
    Realistic relevance score for arbitrage detection.
    - Heavy penalty for category drift (socks in toy search = broken)
    - Penalty for 0-review items ranking high (keyword-stuffed junk)
    - Rewards exact keyword matches in top 5 results
    """
    if not results:
        return 0.0

    score = 100.0

    # Heavy penalty for drift (category mismatch)
    # Each drift item costs 18 points, max -54
    score -= min(len(drift_items) * 18, 54)

    # Check top 5 results for semantic relevance
    top5 = results[:5]
    hits = 0
    zero_review_junk = 0
    for r in top5:
        title = r["product_views"]["core"]["title"].lower()
        # Must match at least 2 expected keywords OR 1 strong keyword
        match_count = sum(1 for k in expects if k in title)
        if match_count >= 2 or (match_count >= 1 and len(expects) == 1):
            hits += 1
        # Penalize 0-review items in top 5 (indicates bad ranking algo)
        if r["product_views"]["core"].get("reviews", 0) == 0 and r["product_views"]["core"].get("star_rating", 0) == 0:
            zero_review_junk += 1

    top5_score = (hits / len(top5)) * 30 if top5 else 0
    score = score * 0.7 + top5_score  # Top 5 quality matters most

    # Penalty for unreviewed items dominating results
    score -= min(zero_review_junk * 5, 20)

    return max(round(score, 1), 0)


def detect_drift(results, query_niche):
    """Detect category drift (e.g., toy query returning books/clothing)."""
    drift_flags = []
    category_keywords = {
        "toys": ["book", "sock", "clothing", "tracksuit", "shirt", "pants"],
        "pc": ["mouse pad", "cable", "adapter", "battery"],
        "audio": ["stand", "case", "cover", "cable"],
    }
    bad_keywords = category_keywords.get(query_niche, [])
    for r in results[:10]:
        title = r["product_views"]["core"]["title"].lower()
        for bk in bad_keywords:
            if bk in title:
                drift_flags.append(r["product_views"]["core"]["title"][:50])
                break
    return drift_flags


def extract_products(results):
    """Extract pricing and metadata from top results."""
    products = []
    for r in results[:8]:
        core = r["product_views"]["core"]
        bb = r["product_views"]["buybox_summary"]
        # Clean price string for sorting
        raw_price = bb.get("listing_price") or bb.get("prices", [0])[0]
        products.append({
            "title": core["title"][:70],
            "slug": core["slug"],
            "price_display": bb["pretty_price"],
            "price_raw": raw_price,
            "rating": core.get("star_rating", 0),
            "reviews": core.get("reviews", 0),
            "brand": core.get("brand") or "No Brand",
            "tsin": bb.get("tsin"),
        })
    return products


def load_history():
    """Load previous snapshots for trend analysis."""
    history = []
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    if not os.path.isdir(data_dir):
        return history
    for fname in sorted(os.listdir(data_dir)):
        if fname.endswith(".json") and fname != "latest.json":
            fpath = os.path.join(data_dir, fname)
            try:
                with open(fpath, "r") as f:
                    history.append(json.load(f))
            except Exception:
                continue
    return history[-30:]  # Keep last 30 days max


def main():
    now = datetime.utcnow()
    snapshot = {
        "scraped_at": now.isoformat() + "Z",
        "queries": [],
        "opportunities": [],
        "summary": {"total_queries": len(QUERIES), "avg_quality": 0, "high_opportunity_count": 0},
    }

    total_quality = 0

    for q in QUERIES:
        try:
            data = search_takealot(q["query"])
            results = data["sections"]["products"]["results"]
        except Exception as e:
            print(f"ERROR fetching '{q['query']}': {e}", file=sys.stderr)
            continue

        drift = detect_drift(results, q["niche"])
        quality = score_quality(results, q["expects"], q["niche"], drift)
        products = extract_products(results)

        total_quality += quality

        entry = {
            "query": q["query"],
            "niche": q["niche"],
            "quality_score": quality,
            "result_count": len(results),
            "drift_items": drift,
            "drift_count": len(drift),
            "products": products,
        }
        snapshot["queries"].append(entry)

        if quality < 55 or len(drift) >= 2:
            snapshot["opportunities"].append({
                "query": q["query"],
                "niche": q["niche"],
                "quality_score": quality,
                "drift_count": len(drift),
                "potential": "HIGH" if quality < 30 else "MEDIUM",
                "price_range": f"{products[0]['price_display']} - {products[-1]['price_display']}" if products else "N/A",
            })

    snapshot["summary"]["avg_quality"] = round(total_quality / len(QUERIES), 1) if QUERIES else 0
    snapshot["summary"]["high_opportunity_count"] = len([o for o in snapshot["opportunities"] if o["potential"] == "HIGH"])

    # Save dated snapshot
    os.makedirs("data", exist_ok=True)
    dated_file = f"data/{now.strftime('%Y-%m-%d')}.json"
    with open(dated_file, "w") as f:
        json.dump(snapshot, f, indent=2)

    # Overwrite latest.json for dashboard
    with open("data/latest.json", "w") as f:
        json.dump(snapshot, f, indent=2)

    print(f"Saved {dated_file} — Avg quality: {snapshot['summary']['avg_quality']}% — Opportunities: {len(snapshot['opportunities'])}")


if __name__ == "__main__":
    main()
