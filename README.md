# Baseball ⚾

Self-hosted MLB scoreboard, standings, and playoff picture. Real-time game data from MLB Stats API. PIN-protected. Runs on Proxmox LXC.

## Architecture

```
baseball.beaubouef.com (or http://IP:3000)
        │
  Cloudflare Tunnel (optional)
        │
  LXC Container
  ├── /opt/baseball/
  │   ├── server.js                       Express API + MLB Stats API poller
  │   ├── team_colors_corrected_v3.csv    Team colors (editable, hot-reloadable)
  │   └── public/
  │       └── mlb_index.html              Single-file frontend
  └── /data/                              (reserved for future persistent storage)
```

## Features

**Scoreboard**
- Today's games with live scores, auto-refreshing every 30 seconds
- Click any game to expand: linescore, current pitcher/batter, pitch count, ball-strike-out display, base runners, scoring plays
- Navigate to past or future dates
- Game times shown in your local timezone
- Probable pitchers for upcoming games
- TV broadcast info

**Standings**
- All 6 divisions grouped by league
- W/L, PCT, GB, streak, last 10
- Auto-refreshes every 5 minutes

**Playoff Picture**
- Division leaders ranked by record (seeds 1-3)
- Wild card race with games back
- Clear cutline between in/out of playoff

**Design**
- Light/dark mode follows your system preference
- Team colors loaded from CSV at server startup (not hardcoded)
- Mobile-first responsive layout

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express API server. Polls MLB Stats API (standings every 5 min, scores every 30s during games, live game feed on-demand). Parses team colors from CSV. PIN auth with rate limiting. |
| `public/mlb_index.html` | Entire frontend in one file. PIN gate, tab navigation, scoreboard with inline game expansion, standings tables, playoff picture. Fetches team colors from `/api/colors`. |
| `team_colors_corrected_v3.csv` | Team color definitions. CSV with columns: Type, Conference, Team, Color Name, Hex, Primary (1/0), Secondary (1/0). Edit this file to change any team's colors. |
| `mlb-install.sh` | Proxmox VE helper script (tteck-style). Whiptail dialogs, spinner, full networking options. Creates LXC, installs Node 20, deploys app + CSV, creates systemd service. |

## Install

### Proxmox (recommended)

From the Proxmox web UI shell:

```bash
bash -c "$(wget -qO- https://raw.githubusercontent.com/qbeaubouef/baseball/main/mlb-install.sh)"
```

Follow the prompts (Default or Advanced settings). Done in ~2 minutes.

### Manual / Any Linux

```bash
git clone https://github.com/qbeaubouef/baseball.git
cd baseball
npm install express
node server.js
```

Open `http://localhost:3000`. PIN is `4406`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `PIN` | `4406` | Access PIN |
| `DATA_DIR` | `/data` | Data directory (also checked for CSV) |

## Changing Team Colors

The CSV is the single source of truth for team colors. To update:

1. Edit `team_colors_corrected_v3.csv` (in the app directory or `/data/`)
2. Either restart the service, or hot-reload without restart:

```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"pin":"4406"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

# Reload colors
curl -X POST http://localhost:3000/api/colors/reload \
  -H "x-auth-token: $TOKEN"
```

The server looks for the CSV in two locations (first match wins):
1. `/opt/baseball/team_colors_corrected_v3.csv` (app directory)
2. `/data/team_colors_corrected_v3.csv` (data directory)

CSV format: `Type,Conference,Team,Color Name,Hex,Primary,Secondary`
- Only rows with `Type=MLB` are used
- `Primary=1` sets the team's dot/accent color
- `Secondary=1` sets the team's text/contrast color
- Multiple color rows per team are fine (only Primary=1 and Secondary=1 matter)

## Update

### On Proxmox

```bash
pct enter <CT_ID>
cd /opt/baseball
REPO='https://raw.githubusercontent.com/qbeaubouef/baseball/main'
curl -fsSL "${REPO}/server.js" -o server.js
curl -fsSL "${REPO}/public/mlb_index.html" -o public/mlb_index.html
curl -fsSL "${REPO}/team_colors_corrected_v3.csv" -o team_colors_corrected_v3.csv
systemctl restart baseball
```

### Check logs

```bash
journalctl -u baseball -f
```

## API Endpoints

All endpoints except `/api/auth` require `x-auth-token` header.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth` | POST | Submit PIN, get session token |
| `/api/auth/check` | POST | Validate existing token |
| `/api/colors` | GET | Team colors (from CSV) |
| `/api/colors/reload` | POST | Hot-reload colors from CSV |
| `/api/scores` | GET | Today's schedule + scores |
| `/api/scores/:date` | GET | Schedule for specific date (YYYY-MM-DD) |
| `/api/game/:id` | GET | Live game feed (pitch-by-pitch, boxscore, plays) |
| `/api/standings` | GET | Full division standings |

## MLB Stats API

No API key required. Endpoints used:

- `statsapi.mlb.com/api/v1/schedule` — games, scores, linescore, probable pitchers
- `statsapi.mlb.com/api/v1/standings` — division standings with splits
- `statsapi.mlb.com/api/v1.1/game/{id}/feed/live` — live play-by-play, boxscore, matchups

## Tech Stack

- **Server**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS, single file, no build step
- **Fonts**: Barlow Condensed (display) + DM Sans (body) via Google Fonts
- **Data**: MLB Stats API (free, no key)
- **Auth**: 4-digit PIN with rate limiting (5 attempts / 5 min lockout)
- **Deployment**: Proxmox LXC via tteck-style helper script

Go Stros.
