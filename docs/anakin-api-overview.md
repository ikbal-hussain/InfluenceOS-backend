# Anakin API — capabilities and what fits InfluenceOS

A working note for the team. Verified live against Anakin's APIs on 2026-05-10.

> **2026-05-10 update — earlier "wrong product" finding was stale.** A previous round of probes returned `401` from `api.anakin.io`. Re-running those probes after clearing the shell env vars (so `dotenv` could actually load the current `.env`) gave **200 from `/v1/holocron/catalog`** (114 catalogs) and **202 from `/v1/url-scraper`** with the same `ask_…` key. So the key **does** work against AnakinScraper (`api.anakin.io`) — the prior `401`s were a stale `ANAKIN_API_KEY` cached in the shell that overrode `dotenv`. Most of this doc still reads as if we were on **Anakin AI** (`api.anakin.ai`); treat that as historical context. The runtime pipeline (`services/anakinSearch.js`, `anakinUrlScraper.js`, `anakinSerpSearch.js`) actually targets **AnakinScraper** at `api.anakin.io`.
>
> **Current `/v1/search` status:** broken on Anakin's side. Every prompt returns `500 {"error":"search_error","message":"Failed to perform search"}`, while `/holocron/catalog`, `/holocron/search`, and `/url-scraper` keep working with the same key. Headers show `x-ratelimit-remaining: 116/120`, so it's not a quota issue — it's a backend regression. Anakin correlation IDs are returned in `x-request-id` if support needs to investigate.
>
> **Workaround in production:** `services/anakinSerpSearch.js` submits a DuckDuckGo HTML SERP URL (e.g. `https://html.duckduckgo.com/html/?q=top+instagram+fitness+creators+india`) to `POST /v1/url-scraper`, parses the returned markdown with a `[title](https://duckduckgo.com/l/?uddg=…)` regex, decodes the `uddg=` redirect, and returns rows in the same `{ rawResults: [{title, url, snippet}] }` shape that `searchInstagramCreators` returns. Wired into `discoveryPipeline.js` behind `DISCOVERY_SEARCH_MODE` (`auto` / `api` / `serp`, default `auto`). Pipeline stays 100 % Anakin-powered for HTTP fetching.

---

## 1. What Anakin AI actually is

Anakin AI is a hosted **LLM app builder**. You design "apps" in their web dashboard — Quick Apps (one-shot prompts with templated inputs) or Chatbots (multi-turn) — and call them by ID over a REST API. The platform itself does **not** scrape Instagram, hit social-network APIs, or maintain a creator database. It runs prompts against LLMs with whatever inputs you pass in.

| | |
|---|---|
| API base URL | `https://api.anakin.ai/v1` |
| Auth header | `Authorization: Bearer ask_…` |
| Required header | `X-Anakin-Api-Version: 2024-05-06` |
| Public docs | <https://anakin.ai/docs/app-integration/api-integration> · <https://apidocs.anakin.ai/> |
| Plan requirement | API access requires a paid plan (subscriber feature) |

There is **no list/search endpoint for apps** over the API. You build apps in the dashboard and reference them by `appId`.

---

## 2. The endpoints that exist (entire surface)

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /v1/versions` | List supported API versions | None |
| `POST /v1/quickapps/{appId}/runs` | Run a Quick App with `inputs` | Bearer |
| `POST /v1/chatbots/{appId}/messages` | Send a message to a Chatbot, optionally streaming | Bearer |

That's it. There is no `/search`, no `/scrape`, no `/instagram`, no `/profiles` — those belong to the *other* Anakin (AnakinScraper). The only way to get any Anakin AI behavior is to build an **app** in the dashboard and POST to its run endpoint.

### 2.1 Quick App run

```bash
curl -X POST https://api.anakin.ai/v1/quickapps/{{appId}}/runs \
  -H "Authorization: Bearer ask_…" \
  -H "X-Anakin-Api-Version: 2024-05-06" \
  -H "Content-Type: application/json" \
  --data '{
    "inputs": { "Niche": "Fitness", "Location": "Bangalore", "Audience": "Gen Z snack brand" },
    "stream": false
  }'
```

`inputs` keys must match the input labels you defined in the Quick App's design panel. The response body is the LLM's text completion (or SSE chunks if `stream: true`).

### 2.2 Chatbot message

```bash
curl -X POST https://api.anakin.ai/v1/chatbots/{{appId}}/messages \
  -H "Authorization: Bearer ask_…" \
  -H "X-Anakin-Api-Version: 2024-05-06" \
  -H "Content-Type: application/json" \
  --data '{ "content": "Find Indian fitness creators on Instagram", "stream": false }'
```

The response includes the assistant message and a `threadId` to continue the conversation.

---

## 3. So how do we get "real influencers" with this?

Anakin AI is a prompt runner. To produce a list like

```
- Influencer Name
- Username (@handle)
- Follower count
- Bio
```

we have three realistic shapes for the hackathon. None of them scrape Instagram for us — that part is on the LLM behind whichever app we build.

### Path A — "Creator Lookup" Quick App (simplest, hackathon-friendly)

In the Anakin dashboard, create a Quick App:

- **Inputs:** `Niche`, `Location`, `AudienceType`, `Count` (default 10).
- **Model:** any reasoning model they offer (GPT-4o-class is ideal for less hallucination).
- **Prompt template (essence):**

  > You are a creator-research assistant. Given the brand brief below, return up to {{Count}} **real, currently active** Instagram creators that fit. Output **only** valid JSON, no prose, in this exact schema:
  >
  > ```json
  > { "creators": [{ "name": "", "handle": "", "followerCount": 0, "bio": "", "country": "", "alignmentNotes": "" }] }
  > ```
  >
  > Brand brief — Niche: {{Niche}}, Location: {{Location}}, Audience: {{AudienceType}}.
  > If you are not confident a creator is real, omit them. Do **not** invent handle names. Prefer micro/mid-tier (10k–500k).

- Backend: call `POST /v1/quickapps/{appId}/runs`, `JSON.parse` the LLM response, map into our existing DTO ([`services/influencerMapper.js`](../services/influencerMapper.js)).
- Frontend dashboard contract is unchanged.

**Pros:** one API call, fits hackathon "must use Anakin" requirement, response is already structured.  
**Cons:** follower counts come from the model's training data → can be **stale or hallucinated**. Show a "verified at: model knowledge cutoff" badge to be honest.

### Path B — Quick App + browsing/tools (best if Anakin's app builder supports it)

Anakin's dashboard lets some app templates use tools like web browsing, file uploads, or external API calls (varies by plan). If the Quick App can call a web tool, it can fetch live profiles and produce *less* hallucinated data.

- Same Quick App as Path A, but enable **Web Search / Browsing** in the app's tool config (check `App → Manage → Tools` in the dashboard).
- Same backend integration.

**Pros:** real-ish counts.  
**Cons:** depends on Anakin's plan exposing tools; harder to keep responses strictly JSON when the LLM is also browsing.

### Path C — Hybrid (Anakin AI for ranking, separate provider for raw data)

If we still want hard numbers, pair Anakin AI with another data source:

1. Get raw creators from a third party (Apify, RapidAPI Instagram Profile, manual seed list, etc.).
2. Send the list **into** an Anakin AI Quick App with a prompt like *"Score each of these creators 0–100 for fit with the brief; return JSON."*
3. Sort/display the scored list.

**Pros:** real metrics + Anakin AI used for the unique value (alignment scoring) — strong story for judges.  
**Cons:** two integrations, need to pick a creator-data source. Anakin's role becomes the *brain*, not the *crawler*.

---

## 4. What today's backend does and why it's fully broken

[`services/anakinSearch.js`](../services/anakinSearch.js) currently calls `https://api.anakin.io/v1/search` with header `X-API-Key`. With our key this returns:

```
401 {"error":"unauthorized","message":"Invalid or inactive API key"}
```

It will never work. The discovery endpoint (`POST /api/v1/discovery/instagram`) responds with `502/503` for every request because of this. Two ways to unblock:

1. **Repoint to Anakin AI** (Path A or B above) once we have a Quick App `appId` and updated prompt.
2. **Sign up at <https://anakin.io/dashboard>** for an *AnakinScraper* key (different account) if we genuinely want the scraping pipeline. That key would start with `ak-`. This is a separate product purchase.

---

## 5. Recommended next move for the hackathon

**Path A** end-to-end, in this order:

1. In the Anakin AI dashboard, create a Quick App named "InfluenceOS Creator Lookup" with the inputs/prompt above. Copy the `appId` and a fresh **API access token** (token is shown once).
2. Add to backend `.env`:
   ```
   ANAKIN_API_KEY=ask_…           # already there; used as Bearer
   ANAKIN_QUICKAPP_ID=…           # new
   ANAKIN_API_VERSION=2024-05-06  # optional; default ok
   ```
3. Replace the `services/anakinSearch.js` body with a `POST /v1/quickapps/{appId}/runs` call, parse JSON out of the LLM completion (with a defensive fallback if the model wraps it in markdown fences), map into the existing influencer DTO. Keep the route URL and DTO **identical** so the frontend doesn't change.
4. Add a small UI banner: *"Results sourced via Anakin AI; counts may be approximate."*
5. (Stretch) Try Path B by enabling browsing inside the same Quick App — no backend changes needed.

If we instead want the scraping product, we need a fresh signup with AnakinScraper — happy to refactor toward that path on request, but it's a different vendor account.

---

## 6. Open questions before changing code

1. Are we OK using **Anakin AI** as the primary integration, accepting that follower counts come from the model (Path A)?
2. Does our Anakin AI subscription tier expose **tools/browsing** to Quick Apps (Path B)?
3. If neither feels honest enough for "real influencer dashboard", do we want to add a second provider (Path C)?

Once we pick, I can wire it up — the existing `/api/v1/discovery/instagram` route and DTO are designed to absorb either swap without touching the frontend.

---

## 7. References

- Anakin AI API integration guide — <https://anakin.ai/docs/app-integration/api-integration>
- Anakin AI API reference index — <https://apidocs.anakin.ai/>
- Anakin AI versions endpoint (verified live) — <https://api.anakin.ai/v1/versions>
- AnakinScraper docs (different product, for context only) — <https://anakin.io/docs/documentation>
