const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.PIN || '4406';
const DATA_DIR = process.env.DATA_DIR || '/data';

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════
//  TEAM COLORS — parsed from CSV at startup
// ══════════════════════════════════════════

let teamColors = {};

function parseColorsCSV() {
  // Look for CSV in app dir first, then data dir
  const candidates = [
    path.join(__dirname, 'team_colors_corrected_v3.csv'),
    path.join(DATA_DIR, 'team_colors_corrected_v3.csv')
  ];
  let csvPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) { csvPath = p; break; }
  }
  if (!csvPath) {
    console.warn('[Colors] team_colors_corrected_v3.csv not found, using empty color map');
    return;
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return;

  // Parse header
  const header = lines[0].split(',').map(h => h.trim());
  const iType = header.indexOf('Type');
  const iTeam = header.indexOf('Team');
  const iHex = header.indexOf('Hex');
  const iPrimary = header.indexOf('Primary');
  const iSecondary = header.indexOf('Secondary');
  const iConference = header.indexOf('Conference');

  if ([iType, iTeam, iHex, iPrimary, iSecondary].includes(-1)) {
    console.warn('[Colors] CSV missing required columns');
    return;
  }

  const teams = {};
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields (some team names have commas)
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    fields.push(current.trim());

    if (fields[iType] !== 'MLB') continue;

    const team = fields[iTeam];
    if (!teams[team]) {
      teams[team] = { primary: null, secondary: null, division: fields[iConference] || '' };
    }
    if (fields[iPrimary] === '1') teams[team].primary = fields[iHex];
    if (fields[iSecondary] === '1') teams[team].secondary = fields[iHex];
  }

  teamColors = teams;
  console.log(`[Colors] Loaded ${Object.keys(teams).length} MLB teams from ${path.basename(csvPath)}`);
}

parseColorsCSV();

// ══════════════════════════════════════════
//  AUTH — PIN gate with rate limiting
// ══════════════════════════════════════════

const sessions = new Map();
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const s = sessions.get(token);
  if (Date.now() - s.created > SESSION_TTL) {
    sessions.delete(token);
    return res.status(401).json({ error: 'expired' });
  }
  next();
}

app.post('/api/auth', (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };

  if (record.count >= MAX_ATTEMPTS && now - record.firstAttempt < LOCKOUT_MS) {
    const remaining = Math.ceil((LOCKOUT_MS - (now - record.firstAttempt)) / 1000);
    return res.status(429).json({ error: 'locked', remaining });
  }

  if (now - record.firstAttempt >= LOCKOUT_MS) {
    record.count = 0;
    record.firstAttempt = now;
  }

  if (req.body.pin !== PIN) {
    record.count++;
    loginAttempts.set(ip, record);
    return res.status(403).json({ error: 'invalid', attemptsLeft: MAX_ATTEMPTS - record.count });
  }

  record.count = 0;
  loginAttempts.set(ip, record);

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { created: now, ip });
  res.json({ token });
});

app.post('/api/auth/check', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions.has(token)) return res.json({ valid: false });
  const s = sessions.get(token);
  if (Date.now() - s.created > SESSION_TTL) {
    sessions.delete(token);
    return res.json({ valid: false });
  }
  res.json({ valid: true });
});

// ══════════════════════════════════════════
//  TEAM COLORS API
// ══════════════════════════════════════════

app.get('/api/colors', authMiddleware, (req, res) => {
  res.json({ teams: teamColors });
});

// POST to reload colors from CSV without restarting
app.post('/api/colors/reload', authMiddleware, (req, res) => {
  parseColorsCSV();
  res.json({ teams: teamColors, count: Object.keys(teamColors).length });
});

// ══════════════════════════════════════════
//  MLB API POLLING & CACHE
// ══════════════════════════════════════════

const MLB_BASE = 'https://statsapi.mlb.com';
const cache = {
  standings: { data: null, updated: 0 },
  schedule: { data: null, updated: 0, date: null },
  games: new Map() // gamePk -> { data, updated }
};

async function mlbFetch(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${MLB_BASE}${url}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`MLB API ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[MLB] fetch error: ${url}`, err.message);
    return null;
  }
}

async function pollStandings() {
  const data = await mlbFetch('/api/v1/standings?leagueId=103,104&standingsTypes=regularSeason&hydrate=division,team');
  if (data) {
    cache.standings = { data, updated: Date.now() };
  }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function pollSchedule() {
  const date = todayStr();
  const data = await mlbFetch(`/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore,probablePitcher,team,broadcasts`);
  if (data) {
    cache.schedule = { data, updated: Date.now(), date };
  }
}

async function pollLiveGame(gamePk) {
  const data = await mlbFetch(`/api/v1.1/game/${gamePk}/feed/live`);
  if (data) {
    cache.games.set(gamePk, { data, updated: Date.now() });
  }
  return data;
}

// Poll live games that are in progress
async function pollLiveGames() {
  if (!cache.schedule.data) return;
  const dates = cache.schedule.data.dates || [];
  if (!dates.length) return;

  const liveGames = dates[0].games.filter(g => {
    const state = g.status?.abstractGameState;
    return state === 'Live';
  });

  for (const g of liveGames) {
    await pollLiveGame(g.gamePk);
  }
}

// Determine if we're in "game hours"
function isGameTime() {
  if (!cache.schedule.data?.dates?.[0]) return false;
  const now = Date.now();
  const games = cache.schedule.data.dates[0].games;
  return games.some(g => {
    const state = g.status?.abstractGameState;
    if (state === 'Live') return true;
    if (state === 'Preview') {
      const start = new Date(g.gameDate).getTime();
      return start - now < 2 * 60 * 60 * 1000;
    }
    return false;
  });
}

// ── Polling intervals ──
setInterval(pollStandings, 5 * 60 * 1000);
setInterval(async () => {
  await pollSchedule();
  if (isGameTime()) await pollLiveGames();
}, 30 * 1000);

// Initial fetch (non-blocking)
(async () => {
  console.log('[MLB] Initial data fetch...');
  await Promise.allSettled([pollStandings(), pollSchedule()]);
  await pollLiveGames();
  console.log('[MLB] Ready.');
})();

// ══════════════════════════════════════════
//  API ENDPOINTS
// ══════════════════════════════════════════

app.get('/api/standings', authMiddleware, (req, res) => {
  if (!cache.standings.data) return res.status(503).json({ error: 'loading' });
  res.json({ standings: cache.standings.data, updated: cache.standings.updated });
});

app.get('/api/scores', authMiddleware, (req, res) => {
  if (!cache.schedule.data) return res.status(503).json({ error: 'loading' });
  const age = Date.now() - cache.schedule.updated;
  if (age > 60000) pollSchedule();
  res.json({ schedule: cache.schedule.data, updated: cache.schedule.updated });
});

app.get('/api/scores/:date', authMiddleware, async (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid date' });
  if (date === todayStr() && cache.schedule.data) {
    return res.json({ schedule: cache.schedule.data, updated: cache.schedule.updated });
  }
  const data = await mlbFetch(`/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore,probablePitcher,team,broadcasts`);
  if (!data) return res.status(503).json({ error: 'fetch failed' });
  res.json({ schedule: data, updated: Date.now() });
});

app.get('/api/game/:id', authMiddleware, async (req, res) => {
  const gamePk = parseInt(req.params.id);
  if (isNaN(gamePk)) return res.status(400).json({ error: 'invalid game id' });
  const cached = cache.games.get(gamePk);
  if (cached && Date.now() - cached.updated < 30000) {
    return res.json({ game: cached.data, updated: cached.updated });
  }
  const data = await pollLiveGame(gamePk);
  if (!data) return res.status(503).json({ error: 'fetch failed' });
  res.json({ game: data, updated: Date.now() });
});

// Catch-all: serve mlb_index.html
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mlb_index.html'));
});

app.listen(PORT, () => {
  console.log(`[MLB Dashboard] Running on port ${PORT}`);
});
