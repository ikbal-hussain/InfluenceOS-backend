# InfluenceOS-backend

InfluenceOS is an AI-powered influencer discovery platform that helps brands find the right micro-influencers for their campaigns. By analyzing creator profiles, engagement, niche, audience relevance, and web data, it generates smart match scores, campaign insights, and personalized outreach messages, making influencer marketing faster and more data-driven.

This repository contains the Node.js + Express API that powers the InfluenceOS frontend.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Environment: copy `.env.example` to `.env` and edit if needed.

   - **PowerShell:** `Copy-Item .env.example .env`
   - **macOS / Linux:** `cp .env.example .env`

   Variables:

   - `PORT` — default `3000`.
   - `CLIENT_ORIGIN` — optional comma-separated **extra** origins; merged with built-ins (Vite dev URLs `http://localhost:5173`, `http://127.0.0.1:5173`, and `https://influenceos-app.netlify.app`).
   - `ANAKIN_API_KEY` — required for `/api/v1/discovery/*` endpoints. Get one from the [Anakin dashboard](https://anakin.io/dashboard); keys start with `ak-`.
   - `ANAKIN_API_BASE_URL` — optional, defaults to `https://api.anakin.io/v1`.
   - `GROQ_API_KEY` — required for the discovery pipeline's JSON extraction stage. Get one from the [Groq console](https://console.groq.com/).
   - `GROQ_MODEL` — optional, defaults to `llama-3.1-8b-instant` (smaller / cheaper TPM vs 70B). Override with e.g. `llama-3.3-70b-versatile` if extraction quality drops. Any Groq chat model that supports `response_format=json_object`.
   - `DISCOVERY_SEARCH_MODE` — optional, default `auto`. Selects the search backend:
     - `auto` — try Anakin `/v1/search` first, fall back to scraping a DuckDuckGo HTML SERP via Anakin URL Scraper if Anakin's search returns 0 results or errors.
     - `api` — only use Anakin `/v1/search`.
     - `serp` — skip `/v1/search` entirely and always scrape DuckDuckGo via Anakin URL Scraper. Useful when `/v1/search` is degraded; pipeline stays 100% Anakin-powered.
   - `DISCOVERY_SEARCH_LIMIT` — optional, default `5`. Anakin Search results fetched per query (~3 credits each).
   - `DISCOVERY_ARTICLE_SCRAPE_MAX` — optional, default `3`. Article URLs scraped with Anakin URL Scraper (~1 credit each). Set to `0` to skip and feed Groq only snippets.
   - `DISCOVERY_ANAKIN_GENERATE_JSON` — optional, default `true`. When `true`, article scrapes pass `generateJson: true` to Anakin URL Scraper so each job can return `generatedJson` (structured extraction on Anakin). Groq prompts prefer compact `STRUCTURED_JSON` over full markdown to reduce tokens per minute (TPM). Set `false` for markdown-only scrapes (previous behavior, lower Anakin extraction cost/latency).
   - `DISCOVERY_PROFILE_SCRAPE_MAX` — optional, default `0`. Top-N Instagram profiles to enrich via URL Scraper. Off by default because Instagram blocks anonymous scrapers.
   - `DISCOVERY_GROQ_REQUIRED` — optional, default `true`. When `false`, the endpoint falls back to the legacy snippet-only mapper if Groq is missing or fails.

## Run

- **Development** (auto-restart with nodemon):

  ```bash
  npm run dev
  ```

- **Production**:

  ```bash
  npm start
  ```

Default URL: `http://localhost:3000` (or `PORT` from `.env`).

## Check Anakin.io Wire (Holocron) for Instagram actions

After setting `ANAKIN_API_KEY` from [anakin.io](https://anakin.io/dashboard), run:

```bash
npm run check:holocron
```

This calls `GET /v1/holocron/catalog` and a few `GET /v1/holocron/search` queries (no secrets printed). If you see **HTTP 200** and action rows, Option C (Wire) is plausible; if **401**, the key is not accepted by `api.anakin.io` (regenerate on the scraper dashboard or fix the env value).

## Endpoints

| Method | Path                              | Description                                         |
|--------|-----------------------------------|-----------------------------------------------------|
| GET    | `/`                               | API info                                            |
| GET    | `/health`                         | Health check                                        |
| POST   | `/api/v1/discovery/instagram`     | Discover Instagram creators via Anakin Search API   |

### `POST /api/v1/discovery/instagram`

Request body:

```json
{
  "niche": "Fitness",
  "location": "Bangalore",
  "audienceType": "Gen Z snack brand",
  "limit": 10
}
```

- `niche` is required; `location`, `audienceType`, and `limit` (1–25, default 10) are optional.
- `platform` is accepted only as `"instagram"` or empty in this version.

Response:

```json
{
  "query": { "niche": "Fitness", "location": "Bangalore", "audienceType": "Gen Z snack brand", "limit": 10, "platform": "instagram" },
  "requestId": "anakin-request-id",
  "count": 2,
  "influencers": [
    {
      "id": "abc123",
      "name": "Display name",
      "handle": "creator_handle",
      "profileUrl": "https://instagram.com/creator_handle",
      "platform": "instagram",
      "snippet": "Short text from the source page",
      "sourceUrl": "https://example.com/article",
      "followerCount": 250000,
      "publishedAt": null
    }
  ]
}
```

`followerCount` is best-effort: when Groq extraction succeeds it comes from the `followerText` the model lifted out of the article; otherwise the legacy regex parses the search snippet/title (e.g. `250k followers`, `1.2M followers`). Rows with no parsed count are sorted last. Reliable per-profile metrics arrive only when `DISCOVERY_PROFILE_SCRAPE_MAX > 0` and Anakin URL Scraper successfully reads the live profile.

## Discovery pipeline

The endpoint runs three stages internally:

1. **Search** — finds article URLs about creators in the niche. Two backends, both Anakin:
   - **Primary:** Anakin Search ([`services/anakinSearch.js`](services/anakinSearch.js)) — `POST /v1/search`.
   - **Fallback:** Anakin URL Scraper used as a SERP scraper ([`services/anakinSerpSearch.js`](services/anakinSerpSearch.js)) — submits a DuckDuckGo HTML SERP URL to `POST /v1/url-scraper`, then parses the returned markdown into `{title, url, snippet}` rows. Triggered automatically when `/v1/search` errors or returns 0 results (or always, when `DISCOVERY_SEARCH_MODE=serp`).
2. **Anakin URL Scraper** ([`services/anakinUrlScraper.js`](services/anakinUrlScraper.js)) — optional. Fetches markdown for the top `DISCOVERY_ARTICLE_SCRAPE_MAX` non-Instagram URLs. When **`DISCOVERY_ANAKIN_GENERATE_JSON=true`** (default), scrapes also request **`generateJson`** so Anakin returns **`generatedJson`** (hosted structured extraction). [`groqExtractCreators.js`](services/groqExtractCreators.js) then prefers **`JSON.stringify(generatedJson.data)`** under `STRUCTURED_JSON` in the Groq prompt instead of dumping full markdown — fewer input tokens and fewer Groq TPM spikes. If JSON is missing or failed, content falls back to truncated markdown as before.
3. **Groq JSON extraction** ([`services/groqExtractCreators.js`](services/groqExtractCreators.js)) — bundles snippets + per-source content into one prompt and asks Groq (default **`llama-3.1-8b-instant`**) for a strict JSON list of creators (`handle`, `displayName`, `followerText`, `evidenceSnippet`, `sourceUrl`).

The response includes `stages.searchProvider` (`anakin-search`, `serp-fallback`, or `serp`) and `stages.anakinGenerateJson` (whether article scrapes requested Anakin structured JSON). If Groq fails or is disabled, the pipeline falls back to the legacy snippet-only mapper so the dashboard never shows zero rows when search returned data. See [`docs/anakin-api-overview.md`](docs/anakin-api-overview.md) for the full Anakin product comparison.

### Manual smoke test

With both keys set in `.env`:

```bash
npm run dev
# in another terminal
curl -X POST http://localhost:3000/api/v1/discovery/instagram \
  -H "Content-Type: application/json" \
  -d "{\"niche\":\"Fitness\",\"location\":\"Bangalore\",\"audienceType\":\"Gen Z snack brand\"}"
```

Expect a `200` with an `influencers[]` array. Pure helpers (`parseFollowerCount`, Groq response parsing) are covered by `npm test`.
