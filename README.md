# Beaubouef Bracket 2026 🏀

Family March Madness bracket pool. Self-hosted on Proxmox LXC. No accounts, no ads — just a PIN and a name.

## Architecture

```
bracket.beaubouef.com
        │
  Cloudflare Tunnel
        │
  LXC Container 129
  ├── /opt/bracket/server.js          Express API (Node.js)
  ├── /opt/bracket/public/index.html  Single-file frontend (~72KB)
  └── /data/                          JSON file storage
      ├── players.json
      ├── picks_*.json
      ├── tb_*.json
      ├── results.json
      ├── game_scores.json
      ├── first_four.json
      ├── state.json
      ├── name_overrides.json         Manual ESPN name fixes
      └── archives/
          └── 2026.json
```

## Files

| File | What it does |
|------|-------------|
| `bracket-install.sh` | Proxmox tteck-style install script. Creates an LXC, installs Node 20, deploys the app, creates a systemd service. Run on the Proxmox host shell. |
| `server.js` | Express API. JSON file storage in `/data/`. Dynamic ESPN name map, auto-sync, live scores, First Four resolution, name diagnostics, manual overrides. |
| `index.html` | Entire frontend in one file. PIN gate → user select → bracket app. Mobile tabbed + desktop ESPN-style bracket tree. Team colors from CSV, seeds, live scores, BUST tags, leaderboard, admin panel. |
| `team_colors_corrected_v3.csv` | Source of truth for all team colors. Each row has a team, color name, hex value, and `Primary`/`Secondary` flags (1/0). Primary = fill color, Secondary = text color. |
| `build_v4.py` | Build script. Reads the CSV + JS + CSS source files, generates the final `index.html` with team colors baked in. |

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

### Rebuild from source (if editing CSS, JS, or CSV)
```bash
# Edit v4_fixed.js, v4_fixed.css, or team_colors_corrected_v3.csv
node -c v4_fixed.js              # syntax check
python3 build_v4.py              # builds index.html
# Then upload index.html to GitHub and deploy
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

### BUST Tags
When your pick gets eliminated and a different team advances into that bracket slot, the slot shows the actual advancing team with a red **BUST** tag. The tag persists as long as that team keeps winning — if VCU busted your UNC pick in R64, VCU carries the BUST tag through R32, S16, and beyond until they lose. This works on both mobile and desktop views.

### Team Colors
Colors are driven by `team_colors_corrected_v3.csv`, a curated spreadsheet with `Primary` and `Secondary` flags per color row. The build script reads the CSV and generates the color map:

- `Primary=1` → fill/background color for selected picks
- `Secondary=1` → text color on top of the fill

The champion's colors are applied globally across the UI (tabs, buttons, accents). Each team's identity comes from the CSV — no ESPN color dependency.

To change a team's colors, edit the CSV (set `Primary=1` on the desired fill color, `Secondary=1` on the desired text color) and rebuild.

### ESPN Integration

**Dynamic name map:** On startup, the server pulls every tournament game from ESPN and auto-discovers all name variants (`displayName`, `shortDisplayName`, `abbreviation`). This means names like "Long Island University Sharks" → "LIU" and "Hawai'i Rainbow Warriors" → "Hawaii" are resolved automatically. A base map of ~200 manually confirmed aliases is also included as a foundation.

**Sync (finals):** Fetches completed game results from ESPN's scoreboard API. Runs automatically every 5 minutes during the tournament and on startup. Also triggered manually via the 🔄 ESPN button. When new results are found, the schedule cache is automatically refreshed to pick up newly published times for the next round.

**Live scores:** `/api/live` endpoint fetches ESPN's current scoreboard and merges with a cached full-tournament schedule. Live scores show inline in bracket game slots with green borders and pulsing dots.

**First Four:** Play-in games are detected first during sync. Once final, the winner's name replaces combo slots (e.g., "UMBC/Howard" → "Howard") throughout the bracket.

**Schedule cache:** On startup, fetches all tournament dates (Mar 17 – Apr 7) from ESPN. Refreshes at midnight CT daily and whenever sync finds new results. Hardcoded broadcast times in the frontend serve as fallback until ESPN publishes specific matchup assignments.

**Unmatched name detection:** During sync, any ESPN team name that can't be resolved is logged to `journalctl` and added to `/api/unmatched`. This catches name mismatches before they cause missed results.

### Manual Name Override

If ESPN uses a team name the system can't resolve automatically:

```bash
# Check what's unmatched
curl -s http://localhost:3000/api/unmatched | python3 -m json.tool

# Add a manual override
curl -X POST http://localhost:3000/api/name-map \
  -H "Content-Type: application/json" \
  -d '{"espnName":"Some Weird ESPN Name","bracketName":"LIU"}'

# View all overrides
curl -s http://localhost:3000/api/name-map | python3 -m json.tool

# Re-sync to pick up the fix
curl -s http://localhost:3000/api/sync | python3 -m json.tool
```

Overrides are saved to `/data/name_overrides.json` and persist across restarts. They take highest priority over both the base map and ESPN-discovered aliases.

### Broadcast Schedule
All times are Central Time (CT). R64 games have exact times and channels hardcoded in the frontend. Later rounds show approximate windows until ESPN publishes specific matchup assignments, at which point the nightly/on-sync schedule refresh picks them up.

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
| GET | `/api/sync` | Trigger ESPN sync for finals (also returns unmatched names) |
| GET | `/api/first-four` | First Four results |

### Name Map & Diagnostics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Year, team colors from ESPN, seeds, name map size |
| GET | `/api/unmatched` | ESPN team names that couldn't be resolved |
| GET | `/api/name-map` | View manual overrides + total name map size |
| POST | `/api/name-map` | Add override `{espnName, bracketName}` |
| GET | `/api/rebuild-names` | Re-pull ESPN data to rebuild name map + colors |

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

## Team Color Format

Colors live in `team_colors_corrected_v3.csv`:

```
Type,Conference,Team,Color Name,Hex,Primary,Secondary
NCAA D1,Big Ten,Michigan Wolverines,Maize,#FFCB05,1,0
NCAA D1,Big Ten,Michigan Wolverines,Blue,#00274C,0,1
```

- Each team has multiple color rows
- Set `Primary=1` on exactly one row → that hex becomes the fill color
- Set `Secondary=1` on exactly one row → that hex becomes the text color
- The build script reads the CSV, computes `TC` (team colors), and bakes it into `index.html`

The CSV also covers MLB and other leagues for future use.

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
3. Update CSV with new teams, rebuild `index.html`
4. Update bracket structure + seeds in `build_v4.py` and `server.js`
5. Share URL again

## Troubleshooting

**Bad score data / score bleed:**
```bash
echo '{}' > /data/game_scores.json
echo '{}' > /data/results.json
echo '{}' > /data/first_four.json
systemctl restart bracket
```

**Check for unmatched ESPN names (missing results):**
```bash
curl -s http://localhost:3000/api/unmatched | python3 -m json.tool
# If names appear, add overrides:
curl -X POST http://localhost:3000/api/name-map \
  -H "Content-Type: application/json" \
  -d '{"espnName":"The Weird Name","bracketName":"Our Name"}'
curl -s http://localhost:3000/api/sync | python3 -m json.tool
```

**Check ESPN connectivity:**
```bash
curl -s http://localhost:3000/api/live | python3 -m json.tool | head -30
```

**Check name map + colors loaded:**
```bash
curl -s http://localhost:3000/api/config | python3 -c "import json,sys;c=json.load(sys.stdin);print(f'Names: {c[\"nameMapSize\"]}, Colors: {c[\"colorsLoaded\"]}')"
```

**Rebuild name map from ESPN on demand:**
```bash
curl -s http://localhost:3000/api/rebuild-names | python3 -m json.tool
```

**Check server logs:**
```bash
journalctl -u bracket -f
# Look for: [ESPN] UNMATCHED: "..." warnings
```

**Server showing as index.html (wrong file uploaded):**
```bash
head -1 /opt/bracket/public/index.html   # Must be: <!DOCTYPE html>
head -1 /opt/bracket/server.js            # Must be: const express = require("express");
```

## GitHub

Repository: `github.com/qbeaubouef/bracket`

Domain: `bracket.beaubouef.com` (Cloudflare Tunnel → LXC :3000)
