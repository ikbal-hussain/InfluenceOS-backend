require('dotenv').config();

const express = require('express');
const cors = require('cors');
const discoveryRouter = require('./routes/discovery');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'influenceos-backend',
    health: '/health',
    endpoints: ['POST /api/v1/discovery/instagram'],
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/v1/discovery', discoveryRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
