const crypto = require('crypto');
const { searchInstagramCreators } = require('./anakinSearch');
const { searchInstagramCreatorsViaScraper } = require('./anakinSerpSearch');
const { scrapeArticles, isInstagramProfileUrl } = require('./anakinUrlScraper');
const { extractCreators } = require('./groqExtractCreators');
const { mapAnakinResults, parseFollowerCount, sortByFollowersDesc } = require('./influencerMapper');

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

function makeId(seed) {
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

function toInfluencerRow(creator, fallbackSourceUrl) {
  const profileUrl = `https://instagram.com/${creator.handle}`;
  const sourceUrl = creator.sourceUrl || fallbackSourceUrl || null;
  const followerFromText =
    parseFollowerCount(creator.followerText) ?? parseFollowerCount(creator.evidenceSnippet);

  return {
    id: makeId(profileUrl),
    name: creator.displayName || `@${creator.handle}`,
    handle: creator.handle,
    profileUrl,
    platform: 'instagram',
    snippet: creator.evidenceSnippet || '',
    sourceUrl,
    followerCount: followerFromText,
    publishedAt: null,
  };
}

function tagStage(err, stage) {
  if (err && typeof err === 'object') err.stage = stage;
  return err;
}

function searchModeFromEnv() {
  const raw = (process.env.DISCOVERY_SEARCH_MODE || 'auto').toLowerCase().trim();
  if (raw === 'api' || raw === 'serp' || raw === 'auto') return raw;
  return 'auto';
}

async function performSearch({ query, searchLimit }) {
  const mode = searchModeFromEnv();
  const limit = Math.min(query.limit ?? 10, searchLimit);

  if (mode === 'serp') {
    const r = await searchInstagramCreatorsViaScraper({ ...query, limit });
    return { ...r, searchProvider: 'serp' };
  }

  if (mode === 'api') {
    const r = await searchInstagramCreators({ ...query, limit });
    return { ...r, searchProvider: 'anakin-search' };
  }

  try {
    const r = await searchInstagramCreators({ ...query, limit });
    if ((r.rawResults?.length ?? 0) > 0) {
      return { ...r, searchProvider: 'anakin-search' };
    }
    console.warn('[discoveryPipeline] anakin /v1/search returned 0 results, falling back to SERP scrape');
  } catch (err) {
    if (err.code === 'ANAKIN_KEY_MISSING') throw tagStage(err, 'anakin-search');
    console.warn(
      '[discoveryPipeline] anakin /v1/search failed, falling back to SERP scrape:',
      err.response?.status ?? '',
      err.message,
    );
  }

  const r = await searchInstagramCreatorsViaScraper({ ...query, limit });
  return { ...r, searchProvider: 'serp-fallback' };
}

async function runDiscoveryPipeline(query) {
  const searchLimit = envInt('DISCOVERY_SEARCH_LIMIT', 5);
  const articleScrapeMax = envInt('DISCOVERY_ARTICLE_SCRAPE_MAX', 3);
  const groqRequired = envBool('DISCOVERY_GROQ_REQUIRED', true);
  const anakinGenerateJson = envBool('DISCOVERY_ANAKIN_GENERATE_JSON', true);

  let search;
  try {
    search = await performSearch({ query, searchLimit });
  } catch (err) {
    throw tagStage(err, err.stage || 'search');
  }

  const candidateUrls = (search.rawResults || [])
    .map((r) => r?.url)
    .filter((url) => url && !isInstagramProfileUrl(url))
    .slice(0, articleScrapeMax);

  let scrapedArticles = [];
  if (articleScrapeMax > 0 && candidateUrls.length > 0) {
    try {
      scrapedArticles = await scrapeArticles(candidateUrls, {
        concurrency: 2,
        generateJson: anakinGenerateJson,
      });
    } catch (err) {
      console.warn('[discoveryPipeline] article scrape failed:', err.message);
    }
  }

  let groqCreators = [];
  let groqError = null;
  try {
    groqCreators = await extractCreators({
      query,
      searchResults: search.rawResults,
      scrapedArticles,
      limit: query.limit ?? 10,
    });
  } catch (err) {
    groqError = tagStage(err, 'groq');
    if (err.code === 'GROQ_KEY_MISSING' && groqRequired) {
      throw err;
    }
    console.warn(
      '[discoveryPipeline] groq extraction failed:',
      err.message,
      err.response?.status ?? '',
    );
  }

  if (groqCreators.length > 0) {
    const fallbackUrl = search.rawResults?.[0]?.url || null;
    const influencers = sortByFollowersDesc(
      groqCreators.map((c) => toInfluencerRow(c, fallbackUrl)),
    );
    return {
      influencers,
      requestId: search.requestId,
      prompt: search.prompt,
      stages: {
        searchProvider: search.searchProvider,
        search: search.rawResults?.length ?? 0,
        scrapedArticles: scrapedArticles.length,
        anakinGenerateJson,
        groqCreators: groqCreators.length,
        usedFallback: false,
      },
    };
  }

  if (groqRequired && groqError && groqError.code !== 'GROQ_KEY_MISSING') {
    throw groqError;
  }

  const fallbackInfluencers = mapAnakinResults(search.rawResults || []);
  return {
    influencers: fallbackInfluencers,
    requestId: search.requestId,
    prompt: search.prompt,
    stages: {
      searchProvider: search.searchProvider,
      search: search.rawResults?.length ?? 0,
      scrapedArticles: scrapedArticles.length,
      anakinGenerateJson,
      groqCreators: 0,
      usedFallback: true,
    },
  };
}

module.exports = {
  runDiscoveryPipeline,
  toInfluencerRow,
};
