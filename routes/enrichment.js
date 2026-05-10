const express = require('express');
const {
  fetchInstagramProfileRaw,
  normalizeProfile,
  getToken,
  ACTOR_ID,
} = require('../services/apifyInstagramProfile');

const router = express.Router();

router.get('/instagram/:username', async (req, res) => {
  const rawUsername = req.params.username;

  try {
    if (!getToken()) {
      return res.status(503).json({
        error: 'Live profile enrichment is not configured on the server',
        code: 'APIFY_NOT_CONFIGURED',
        hint: 'Add APIFY_API_TOKEN to the backend .env — see InfluenceOS-backend README.',
      });
    }

    const raw = await fetchInstagramProfileRaw(rawUsername);
    if (!raw) {
      return res.status(404).json({
        error: 'No profile data returned for this username',
        code: 'NO_DATA',
      });
    }

    const profile = normalizeProfile(raw);
    return res.json({
      source: 'apify',
      actorId: ACTOR_ID,
      profile,
      raw: process.env.APIFY_RETURN_RAW === 'true' ? raw : undefined,
    });
  } catch (err) {
    if (err.code === 'INVALID_USERNAME') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'APIFY_NOT_CONFIGURED') {
      return res.status(503).json({
        error: err.message,
        code: err.code,
      });
    }

    console.error('[enrichment/instagram]', err.message);
    return res.status(502).json({
      error: 'Could not load live profile. Try again later.',
      code: 'APIFY_ERROR',
    });
  }
});

module.exports = router;
