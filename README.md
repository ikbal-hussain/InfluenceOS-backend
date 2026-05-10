# InfluenceOS-backend

Node.js + Express API for InfluenceOS.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Environment: copy `.env.example` to `.env` and edit if needed.

   - **PowerShell:** `Copy-Item .env.example .env`
   - **macOS / Linux:** `cp .env.example .env`

   Variables: `PORT` (default `3000`), `CLIENT_ORIGIN` (CORS; default Vite dev server `http://localhost:5173`).

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
