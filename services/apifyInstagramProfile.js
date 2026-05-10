const { ApifyClient } = require('apify-client');

const ACTOR_ID = 'apify/instagram-profile-scraper';
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

function getToken() {
  return process.env.APIFY_API_TOKEN || '';
}

/**
 * Run Instagram Profile Scraper actor for one username.
 * @returns {Promise<object|null>} First dataset item or null
 */
async function fetchInstagramProfileRaw(username) {
  const token = getToken();
  if (!token) {
    const err = new Error('Apify API token is not configured');
    err.code = 'APIFY_NOT_CONFIGURED';
    throw err;
  }

  const clean = String(username || '')
    .replace(/^@/, '')
    .trim();

  if (!USERNAME_RE.test(clean)) {
    const err = new Error('Invalid Instagram username');
    err.code = 'INVALID_USERNAME';
    throw err;
  }

  const client = new ApifyClient({ token });
  const input = { usernames: [clean] };

  const run = await client.actor(ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return items?.[0] ?? null;
}

/**
 * Stable DTO for the frontend (field names vary slightly in raw Apify output).
 */
function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const profilePicUrlHd =
    raw.profilePicUrlHD ||
    raw.profile_pic_url_hd ||
    null;
  const pic =
    profilePicUrlHd ||
    raw.profilePicUrl ||
    raw.profilePictureUrl ||
    raw.profile_pic_url ||
    null;
  const profilePicUrls = [
    profilePicUrlHd,
    raw.profilePicUrl,
    raw.profilePictureUrl,
    raw.profile_pic_url,
  ].filter(Boolean);

  const detailKeys = [
    'id',
    'url',
    'inputUrl',
    'accountType',
    'businessCategoryName',
    'categoryName',
    'businessEmail',
    'businessPhoneNumber',
    'connectedFbPage',
    'hasChannel',
    'highlightReelCount',
    'igtvVideoCount',
    'joinedRecently',
    'blockedByViewer',
    'restrictedByViewer',
    'countryBlock',
    'externalUrlShimmed',
  ];

  const details = {};
  for (const key of detailKeys) {
    if (raw[key] != null && raw[key] !== '') details[key] = raw[key];
  }

  if (Array.isArray(raw.latestPosts)) {
    details.latestPosts = raw.latestPosts.slice(0, 6).map((post) => ({
      id: post.id ?? post.shortCode ?? null,
      url: post.url ?? post.displayUrl ?? null,
      caption: post.caption ?? null,
      likesCount: post.likesCount ?? null,
      commentsCount: post.commentsCount ?? null,
      timestamp: post.timestamp ?? post.takenAtTimestamp ?? null,
      type: post.type ?? post.productType ?? null,
    }));
  }

  return {
    username: raw.username ?? null,
    fullName: raw.fullName ?? raw.full_name ?? null,
    biography: raw.biography ?? raw.biographyWithEntities ?? null,
    followersCount:
      typeof raw.followersCount === 'number'
        ? raw.followersCount
        : typeof raw.followers === 'number'
          ? raw.followers
          : null,
    followsCount:
      typeof raw.followsCount === 'number'
        ? raw.followsCount
        : typeof raw.following === 'number'
          ? raw.following
          : null,
    postsCount:
      typeof raw.postsCount === 'number'
        ? raw.postsCount
        : typeof raw.posts === 'number'
          ? raw.posts
          : null,
    isVerified: Boolean(raw.verified ?? raw.isVerified),
    isPrivate: Boolean(raw.private ?? raw.isPrivate),
    isBusiness: Boolean(raw.isBusinessAccount ?? raw.is_business),
    externalUrl: raw.externalUrl ?? raw.external_url ?? null,
    profilePicUrl: pic,
    profilePicUrlHd,
    profilePicUrls: [...new Set(profilePicUrls)],
    url: raw.url ?? (raw.username ? `https://www.instagram.com/${raw.username}/` : null),
    accountType: raw.accountType ?? null,
    businessCategoryName: raw.businessCategoryName ?? null,
    categoryName: raw.categoryName ?? null,
    businessEmail: raw.businessEmail ?? null,
    businessPhoneNumber: raw.businessPhoneNumber ?? null,
    highlightReelCount:
      typeof raw.highlightReelCount === 'number' ? raw.highlightReelCount : null,
    igtvVideoCount:
      typeof raw.igtvVideoCount === 'number' ? raw.igtvVideoCount : null,
    joinedRecently: raw.joinedRecently ?? null,
    details,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchInstagramProfileRaw,
  normalizeProfile,
  getToken,
  ACTOR_ID,
};
