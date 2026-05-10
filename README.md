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

   Variables: `PORT` (default `3000`). **`CLIENT_ORIGIN`** — optional comma-separated **extra** origins; merged with built-ins (Vite dev URLs and `https://influenceos-app.netlify.app`).

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

## Endpoints

| Method | Path      | Description   |
|--------|-----------|---------------|
| GET    | `/`       | API info      |
| GET    | `/health` | Health check  |
