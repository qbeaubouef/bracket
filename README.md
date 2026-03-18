# Beaubouef Bracket 2026 🏀

Family March Madness bracket pool. Self-hosted on Proxmox LXC. No accounts, no ads — just a PIN and a name.

## Architecture

```
bracket.beaubouef.com
        │
  Cloudflare Tunnel
        │
  LXC Container 129
  ├── /opt/bracket/server.js       Express API (Node.js)
  ├── /opt/bracket/public/index.html   Single-file frontend (64KB)
  └── /data/                        JSON file storage
      ├── players.json
      ├── picks_*.json
      ├── tb_*.json
      ├── results.json
      ├── game_scores.json
      ├── first_four.json
      ├── state.json
      └── archives/
          └── 2026.json
```

## Files

| File | What it does |
|------|-------------|
| `bracket-install.sh` | Proxmox tteck-style install script. Creates an LXC, installs Node 20, deploys the app, creates a systemd service. Run on the Proxmox host shell. |
| `server.js` | Express API. JSON file storage in `/data/`. ESPN integration for live scores, auto-sync, and First Four resolution. Endpoints for picks, results, tiebreakers, export/import, and archival. |
| `index.html` | Entire frontend in one file. PIN gate → user select → bracket app. Mobile tabbed + desktop ESPN-style bracket tree. Team colors, seeds, live scores, leaderboard, admin panel. |

## Quick Deploy

### Fresh install (Proxmox host shell)
```bash
bash -c "$(wget -qLO - https://github.com/qbeaubouef/bracket/raw/main/bracket-install.sh)"
```

### Update existing (inside LXC)
```bash
pct enter 129
curl -fsSL https://raw.githubusercontent.com/qbeaubouef/bracket/main/server.js -o /opt/bracket/server.js
curl -fsSL https://raw.githubusercontent.com/qbeaubouef/bracket/main/index.html -o /opt/bracket/public/index.html
systemctl restart bracket
exit
```

### Verify after update
```bash
head -1 /opt/bracket/public/index.html   # Should show: <!DOCTYPE html>
head -1 /opt/bracket/server.js            # Should show: const express = require("express");
```

## PINs

| PIN | Access |
|-----|--------|
| `4406` | Entry — lets you in to pick brackets |
| `5502` | Admin — lock/unlock, ESPN sync, manual results, export/import, archive |

## How It Works

### User Flow
1. Enter PIN → Enter first/last name (or tap returning player) → Make picks
2. Click through each region: R64 → R32 → S16 → E8
3. Pick Final Four and Championship on the 🏆 tab
4. Enter tiebreaker (combined final score guess)
5. View others' brackets via chips at top, check leaderboard on 📊 tab

### Scoring
| Round | Points |
|-------|--------|
| Round of 64 | 10 |
| Round of 32 | 20 |
| Sweet 16 | 40 |
| Elite 8 | 80 |
| Final Four | 160 |
| Championship | 320 |

### Auto-Lock
Brackets automatically lock at **12:15 PM ET on Thursday, March 19, 2026** (first R64 tip). Hardcoded — no API dependency.

### ESPN Integration

**Sync (finals):** Fetches completed game results from ESPN's scoreboard API. Runs automatically every 5 minutes during the tournament and on startup. Also triggered manually via the 🔄 ESPN button.

**Live scores:** `/api/live` endpoint fetches ESPN's current scoreboard (one API call) and merges with a cached full-tournament schedule (loaded on startup, refreshed nightly at midnight CT). Live scores show inline in bracket game slots with green borders and pulsing dots.

**First Four:** Play-in games are detected first during sync. Once final, the winner's name replaces combo slots (e.g., "UMBC/Howard" → "Howard") throughout the bracket. Existing picks with combo names still match.

**Schedule cache:** On startup, fetches all tournament dates (Mar 17 – Apr 7) from ESPN to cache times and channels. Refreshes at midnight CT daily so newly published round schedules appear automatically. Hardcoded broadcast times in the frontend serve as fallback.

### Broadcast Schedule
All times are Central Time (CT). R64 games have exact times and channels. Later rounds show approximate windows until ESPN publishes specific matchup assignments.

## API Endpoints

### Core
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/players` | List all players |
| POST | `/api/players` | Add player `{name}` |
| GET | `/api/picks/:name` | Get player's picks |
| POST | `/api/picks/:name` | Save picks (blocked when locked) |
| GET | `/api/results` | Get game results |
| POST | `/api/results` | Set results |
| GET | `/api/state` | Get lock state |
| POST | `/api/state` | Set lock state `{locked: true/false}` |
| GET | `/api/all-picks` | All players' picks |

### Scores & Live
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scores` | Stored game scores |
| GET | `/api/live` | Live + scheduled games (merged cache + ESPN current) |
| GET | `/api/sync` | Trigger ESPN sync for finals |
| GET | `/api/first-four` | First Four results |

### Tiebreaker
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tiebreaker/:name` | Get tiebreaker guess |
| POST | `/api/tiebreaker/:name` | Save tiebreaker `{score: 151}` |
| GET | `/api/all-tiebreakers` | All tiebreakers |

### Export / Import
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export/:name` | Export one player's picks + tiebreaker |
| POST | `/api/import/:name` | Import one player's data |
| GET | `/api/export-all` | Export everything (all players, results, scores) |
| POST | `/api/import-all` | Import full backup |

### Archive
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/archive` | Archive current year `{year: 2026}` |
| GET | `/api/archives` | List archived years |
| GET | `/api/archive/:year` | Download specific year's archive |
| POST | `/api/new-year` | Clear all data for next tournament |

## Team Names

Exact strings the app uses. Picks must match these.

**East:** Duke, Siena, Ohio State, TCU, St. John's, Northern Iowa, Kansas, Cal Baptist, Louisville, South Florida, Michigan State, North Dakota St., UCLA, UCF, UConn, Furman

**South:** Florida, PV A&M/Lehigh, Clemson, Iowa, Vanderbilt, McNeese, Nebraska, Troy, North Carolina, VCU, Illinois, Penn, Saint Mary's, Texas A&M, Houston, Idaho

**West:** Arizona, LIU, Villanova, Utah State, Wisconsin, High Point, Arkansas, Hawaii, BYU, Texas/NC State, Gonzaga, Kennesaw State, Miami FL, Missouri, Purdue, Queens

**Midwest:** Michigan, UMBC/Howard, Georgia, Saint Louis, Texas Tech, Akron, Alabama, Hofstra, Tennessee, Miami OH/SMU, Virginia, Wright State, Kentucky, Santa Clara, Iowa State, Tennessee State

Play-in combo names resolve to the winner once the First Four finishes.

## Import Format

Export produces a JSON file that import accepts directly. No manual formatting needed. Structure:

```json
{
  "name": "First Last",
  "picks": {
    "east": {
      "0": {"0": "Duke", "1": "TCU", ...},
      "1": {"0": "Duke", ...},
      "2": {"0": "Duke"},
      "3": {"0": "Duke"}
    },
    "south": {},
    "west": {},
    "midwest": {},
    "finalFour": {
      "0": {"0": "Houston", "1": "Arizona"},
      "1": {"0": "Houston"}
    }
  },
  "tiebreaker": {"score": 151}
}
```

Round keys: `0` = R64, `1` = R32, `2` = S16, `3` = E8. Game indices within each round correspond to bracket position (0 = top matchup).

## End of Tournament

1. Admin panel → **🏆 Archive This Year** (saves to `/data/archives/2026.json`)
2. Admin panel → **🆕 Start New Year** (clears all data)
3. Update `index.html` with new teams/seeds/schedule for next year
4. Share URL again

## Troubleshooting

**Bad score data / score bleed:**
```bash
echo '{}' > /data/game_scores.json
echo '{}' > /data/results.json
echo '{}' > /data/first_four.json
systemctl restart bracket
```

**Check ESPN connectivity:**
```bash
curl -s http://localhost:3000/api/live | python3 -m json.tool | head -30
```

**Check server logs:**
```bash
journalctl -u bracket -f
```

**Server showing as index.html (wrong file uploaded):**
```bash
head -1 /opt/bracket/public/index.html   # Must be: <!DOCTYPE html>
head -1 /opt/bracket/server.js            # Must be: const express = require("express");
```

## GitHub

Repository: `github.com/qbeaubouef/bracket`

Domain: `bracket.beaubouef.com` (Cloudflare Tunnel → LXC :3000)
