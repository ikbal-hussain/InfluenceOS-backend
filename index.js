require('dotenv').config();

const express = require('express');
const cors = require('cors');
const discoveryRouter = require('./routes/discovery');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/** Comma-separated extra origins in CLIENT_ORIGIN are merged with these defaults */
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://influenceos-app.netlify.app',
];

function allowedOriginsList() {
  const raw = process.env.CLIENT_ORIGIN;
  const fromEnv =
    raw && raw.trim()
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
}

const allowedOrigins = allowedOriginsList();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'influenceos-backend',
    health: '/health',
    endpoints: [
      'POST /api/v1/discovery/instagram',
      'GET /api/v1/enrichment/instagram/:username',
    ],
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/v1/discovery', discoveryRouter);
const enrichmentRouter = require('./routes/enrichment');
app.use('/api/v1/enrichment', enrichmentRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
