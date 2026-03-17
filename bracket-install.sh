#!/usr/bin/env bash

# ==========================================================
#  Beaubouef Bracket 2026 - Proxmox VE Helper Script
#  Run this on your Proxmox host shell.
#  Creates an LXC container with the bracket app ready to go.
# ==========================================================

set -euo pipefail
shopt -s inherit_errexit nullglob

# ---- Colors ----
RD='\033[01;31m'
GN='\033[1;92m'
CL='\033[m'
BL='\033[36m'
YW='\033[33m'
BFR="\\r\\033[K"
HOLD=" "
CM="${GN}✓${CL}"
CROSS="${RD}✗${CL}"

function header_info {
  clear
  cat <<"EOF"
    ____                  __                  ____   ____                __        __ 
   / __ )___  ____ ___  _/ /_  ____  __  __  / __/  / __ )_________ ___/ /_____  / /_
  / __  / _ \/ __ `/ / / / __ \/ __ \/ / / / / /_   / __  / ___/ __ `/ ___/ //_/ _ \/ __/
 / /_/ /  __/ /_/ / /_/ / /_/ / /_/ / /_/ / / __/  / /_/ / /  / /_/ / /__/ ,< /  __/ /_  
/_____/\___/\__,_/\__,_/_.___/\____/\__,_/ /_/    /_____/_/   \__,_/\___/_/|_|\___/\__/  
                                                                                         
          🏀  2026 NCAA Tournament Family Bracket  🏀
EOF
}

function msg_info() { local msg="$1"; echo -ne " ${HOLD} ${YW}${msg}...${CL}"; }
function msg_ok() { local msg="$1"; echo -e "${BFR} ${CM} ${GN}${msg}${CL}"; }
function msg_error() { local msg="$1"; echo -e "${BFR} ${CROSS} ${RD}${msg}${CL}"; }

header_info

# ---- Defaults ----
CT_ID=$(pvesh get /cluster/nextid)
HN="bracket"
DISK_SIZE="2"
RAM="512"
CORES="1"
BRIDGE="vmbr0"
STORAGE=""

# ---- Detect storage ----
function select_storage() {
  local storages
  storages=$(pvesm status -content rootdir | awk 'NR>1 {print $1}')
  if [[ -z "$storages" ]]; then
    msg_error "No storage found with 'rootdir' content type."
    exit 1
  fi
  local count
  count=$(echo "$storages" | wc -l)
  if [[ "$count" -eq 1 ]]; then
    STORAGE=$(echo "$storages" | head -1)
  else
    echo -e "\n${BL}Available storage pools:${CL}"
    echo "$storages" | nl -ba
    echo ""
    read -rp "Select storage pool number: " selection
    STORAGE=$(echo "$storages" | sed -n "${selection}p")
  fi
}

# ---- Confirm settings ----
echo -e "\n${BL}This will create an LXC container with the Beaubouef Bracket app.${CL}\n"
read -rp "Container ID [$CT_ID]: " input; CT_ID=${input:-$CT_ID}
read -rp "Hostname [$HN]: " input; HN=${input:-$HN}
read -rp "Disk Size in GB [$DISK_SIZE]: " input; DISK_SIZE=${input:-$DISK_SIZE}
read -rp "RAM in MB [$RAM]: " input; RAM=${input:-$RAM}
read -rp "CPU Cores [$CORES]: " input; CORES=${input:-$CORES}
read -rp "Bridge [$BRIDGE]: " input; BRIDGE=${input:-$BRIDGE}

select_storage

echo ""
echo -e "${BL}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo -e "${YW}  CT ID:     ${GN}$CT_ID${CL}"
echo -e "${YW}  Hostname:  ${GN}$HN${CL}"
echo -e "${YW}  Disk:      ${GN}${DISK_SIZE}GB${CL}"
echo -e "${YW}  RAM:       ${GN}${RAM}MB${CL}"
echo -e "${YW}  Cores:     ${GN}$CORES${CL}"
echo -e "${YW}  Bridge:    ${GN}$BRIDGE${CL}"
echo -e "${YW}  Storage:   ${GN}$STORAGE${CL}"
echo -e "${BL}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo ""
read -rp "Create this container? (y/n): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Cancelled."; exit 0
fi

# ---- Download template ----
msg_info "Checking for Debian template"
TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"
TEMPLATE_STORAGE="local"
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  msg_info "Downloading Debian 12 template"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null 2>&1
fi
msg_ok "Debian 12 template ready"

# ---- Create container ----
msg_info "Creating LXC container $CT_ID"
pct create "$CT_ID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HN" \
  --cores "$CORES" \
  --memory "$RAM" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --rootfs "${STORAGE}:${DISK_SIZE}" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1 \
  --start 0 >/dev/null 2>&1
msg_ok "Created LXC container $CT_ID"

# ---- Start container ----
msg_info "Starting container"
pct start "$CT_ID"
sleep 3
msg_ok "Container started"

# ---- Setup inside container ----
msg_info "Installing Node.js 20"
pct exec "$CT_ID" -- bash -c "
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq curl ca-certificates gnupg >/dev/null 2>&1
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
" 2>/dev/null
msg_ok "Node.js 20 installed"

msg_info "Setting up Beaubouef Bracket app"
pct exec "$CT_ID" -- bash -c "
  mkdir -p /opt/bracket/public /data

  # ---- server.js ----
  cat > /opt/bracket/server.js << 'SERVEREOF'
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DATA_DIR = '/data';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const readJSON = (file, fallback) => {
  const p = path.join(DATA_DIR, file);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
};
const writeJSON = (file, data) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
};

app.get('/api/players', (req, res) => res.json(readJSON('players.json', [])));
app.post('/api/players', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const players = readJSON('players.json', []);
  if (!players.includes(name.trim())) { players.push(name.trim()); writeJSON('players.json', players); }
  res.json(players);
});
app.get('/api/picks/:name', (req, res) => res.json(readJSON('picks_' + req.params.name + '.json', {})));
app.post('/api/picks/:name', (req, res) => {
  const state = readJSON('state.json', { locked: false });
  if (state.locked) return res.status(403).json({ error: 'Brackets locked' });
  writeJSON('picks_' + req.params.name + '.json', req.body);
  res.json({ ok: true });
});
app.get('/api/results', (req, res) => res.json(readJSON('results.json', {})));
app.post('/api/results', (req, res) => { writeJSON('results.json', req.body); res.json({ ok: true }); });
app.get('/api/state', (req, res) => res.json(readJSON('state.json', { locked: false })));
app.post('/api/state', (req, res) => { writeJSON('state.json', req.body); res.json({ ok: true }); });
app.get('/api/all-picks', (req, res) => {
  const players = readJSON('players.json', []);
  const all = {};
  for (const p of players) all[p] = readJSON('picks_' + p + '.json', {});
  res.json(all);
});
app.listen(PORT, '0.0.0.0', () => console.log('Bracket app on port ' + PORT));
SERVEREOF

  # ---- package.json ----
  cat > /opt/bracket/package.json << 'PKGEOF'
{\"name\":\"beaubouef-bracket\",\"version\":\"1.0.0\",\"main\":\"server.js\",\"dependencies\":{\"express\":\"^4.18.2\"}}
PKGEOF

  cd /opt/bracket && npm install --production >/dev/null 2>&1
" 2>/dev/null
msg_ok "App files created and dependencies installed"

msg_info "Writing frontend"
# Write the HTML file separately to avoid heredoc escaping nightmares
pct push "$CT_ID" /dev/stdin /opt/bracket/public/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Beaubouef Bracket 2026</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏀</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d1117;--card:rgba(255,255,255,0.04);--gold:#e8a838;--green:#4ade80;--red:#ef4444;--text:#fff;--muted:rgba(255,255,255,0.4);--border:rgba(255,255,255,0.08)}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;min-height:100vh;max-width:480px;margin:0 auto;-webkit-font-smoothing:antialiased}
button{font-family:inherit;cursor:pointer}input{font-family:inherit}
.login{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center}
.login input{width:100%;max-width:280px;padding:14px 16px;border-radius:12px;border:1px solid rgba(232,168,56,0.3);background:rgba(255,255,255,0.05);color:#fff;font-size:16px;text-align:center;outline:none}
.login-btn{margin-top:12px;padding:12px 40px;border-radius:10px;border:none;background:linear-gradient(135deg,#e8a838,#d4791c);color:#000;font-size:15px;font-weight:800}
.header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(180deg,rgba(232,168,56,0.1) 0%,transparent 100%)}
.tabs{display:flex;position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--border)}
.tab{flex:1;padding:9px 2px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:0.5px;transition:all 0.15s}
.tab.active{background:rgba(232,168,56,0.15);border-bottom-color:var(--gold);color:var(--gold)}
.tab.icon{font-size:16px}
.content{padding:8px 12px 80px}
.section-head{text-align:center;padding:10px 0;margin-bottom:12px}
.pick-btn{flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:rgba(255,255,255,0.7);font-size:13px;font-weight:400;text-align:left;display:flex;align-items:center;gap:5px;transition:all 0.15s}
.pick-btn.selected{background:rgba(232,168,56,0.2);border-color:rgba(232,168,56,0.4);color:var(--gold);font-weight:700}
.pick-btn.correct{background:rgba(74,222,128,0.15);border-color:rgba(74,222,128,0.4);color:var(--green);font-weight:700}
.pick-btn.incorrect{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:var(--red);font-weight:700}
.pick-btn .check{margin-left:auto;font-size:11px}
.pick-btn:disabled{opacity:0.5;cursor:default}
.game{display:flex;gap:4px;margin-bottom:6px}
.round-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;padding-left:4px}
.round-group{margin-bottom:14px}
.champ-box{text-align:center;padding:12px;background:linear-gradient(135deg,rgba(232,168,56,0.15),rgba(232,168,56,0.05));border-radius:10px;border:1px solid rgba(232,168,56,0.3);margin-top:8px}
.lb-item{display:flex;align-items:center;padding:10px 12px;margin-bottom:4px;background:var(--card);border-radius:10px;border-left:3px solid transparent}
.lb-item.first{background:rgba(232,168,56,0.12);border-left-color:var(--gold)}
.admin-btn{width:100%;padding:14px;border-radius:10px;border:none;color:#fff;font-size:14px;font-weight:700;margin-bottom:10px}
.msg{padding:8px 14px;background:rgba(232,168,56,0.15);color:var(--gold);font-size:12px;text-align:center}
.hidden{display:none}
.footer{text-align:center;padding:16px;font-size:10px;color:rgba(255,255,255,0.15)}
</style>
</head>
<body>
<div id="app"></div>
<script>
const REGIONS={east:{name:"East",emoji:"🏛️",color:"#4a90d9",games:[[1,"Duke",16,"Siena"],[8,"Ohio State",9,"TCU"],[5,"St. John's",12,"Northern Iowa"],[4,"Kansas",13,"Cal Baptist"],[6,"Louisville",11,"South Florida"],[3,"Michigan State",14,"North Dakota St."],[7,"UCLA",10,"UCF"],[2,"UConn",15,"Furman"]]},south:{name:"South",emoji:"🌴",color:"#c0392b",games:[[1,"Florida",16,"PV A&M/Lehigh"],[8,"Clemson",9,"Iowa"],[5,"Vanderbilt",12,"McNeese"],[4,"Nebraska",13,"Troy"],[6,"North Carolina",11,"VCU"],[3,"Illinois",14,"Penn"],[7,"Saint Mary's",10,"Texas A&M"],[2,"Houston",15,"Idaho"]]},west:{name:"West",emoji:"🌵",color:"#cc0033",games:[[1,"Arizona",16,"LIU"],[8,"Villanova",9,"Utah State"],[5,"Wisconsin",12,"High Point"],[4,"Arkansas",13,"Hawaii"],[6,"BYU",11,"Texas/NC State"],[3,"Gonzaga",14,"Kennesaw State"],[7,"Miami FL",10,"Missouri"],[2,"Purdue",15,"Queens"]]},midwest:{name:"Midwest",emoji:"🏭",color:"#f0c040",games:[[1,"Michigan",16,"UMBC/Howard"],[8,"Georgia",9,"Saint Louis"],[5,"Texas Tech",12,"Akron"],[4,"Alabama",13,"Hofstra"],[6,"Tennessee",11,"Miami OH/SMU"],[3,"Virginia",14,"Wright State"],[7,"Kentucky",10,"Santa Clara"],[2,"Iowa State",15,"Tennessee State"]]}};
const ROUND_NAMES=["Round of 64","Round of 32","Sweet 16","Elite 8"];
const REGION_KEYS=["east","south","west","midwest"];
const REGION_NAMES={east:"East",south:"South",west:"West",midwest:"Midwest"};
const POINTS=[10,20,40,80,160,320];
let state={user:null,picks:{},results:{},players:[],locked:false,tab:"east",saving:false,msg:""};
const api=async(m,u,b)=>{const o={method:m,headers:{"Content-Type":"application/json"}};if(b)o.body=JSON.stringify(b);return(await fetch(u,o)).json()};
async function init(){state.players=await api("GET","/api/players");state.results=await api("GET","/api/results");const s=await api("GET","/api/state");state.locked=s.locked||false;render()}
async function login(n){if(!n.trim())return;state.user=n.trim();state.players=await api("POST","/api/players",{name:state.user});state.picks=await api("GET","/api/picks/"+encodeURIComponent(state.user));render()}
async function savePicks(){state.saving=true;render();await api("POST","/api/picks/"+encodeURIComponent(state.user),state.picks);state.saving=false;render()}
function setPick(region,round,idx,team){if(state.locked)return;if(!state.picks[region])state.picks[region]={};if(!state.picks[region][round])state.picks[region][round]={};state.picks[region][round][idx]=team;if(region!=="finalFour"){for(let r=round+1;r<4;r++){if(state.picks[region][r]){const cl={};const prev=state.picks[region][r-1]||{};const cnt=8/Math.pow(2,r);for(let g=0;g<cnt;g++){const t1=prev[g*2],t2=prev[g*2+1];const ex=state.picks[region][r][g];if(ex&&(ex===t1||ex===t2))cl[g]=ex}state.picks[region][r]=cl}}}render();clearTimeout(window._st);window._st=setTimeout(savePicks,500)}
function countPicks(p){let c=0;for(const rk of REGION_KEYS){const rp=p[rk]||{};for(let rd=0;rd<4;rd++)c+=Object.keys(rp[rd]||{}).length}const ff=p.finalFour||{};for(let rd=0;rd<2;rd++)c+=Object.keys(ff[rd]||{}).length;return c}
function calcScore(p,res){let s=0;for(const rk of REGION_KEYS){const rp=p[rk]||{};const rr=res[rk]||{};for(let rd=0;rd<4;rd++){const rdp=rp[rd]||{};const rdr=rr[rd]||{};for(const i in rdr)if(rdp[i]&&rdp[i]===rdr[i])s+=POINTS[rd]}}const ffp=p.finalFour||{};const ffr=res.finalFour||{};for(let rd=0;rd<2;rd++){const rdp=ffp[rd]||{};const rdr=ffr[rd]||{};for(const i in rdr)if(rdp[i]&&rdp[i]===rdr[i])s+=POINTS[rd+4]}return s}
function btnCls(team,pick,result){if(!team)return"pick-btn";if(result&&pick===result&&pick===team)return"pick-btn correct";if(result&&pick&&pick!==result&&pick===team)return"pick-btn incorrect";if(pick===team)return"pick-btn selected";return"pick-btn"}
function btnHTML(team,seed,pick,result,region,round,idx){if(!team)return'<button class="pick-btn" disabled><span style="color:var(--muted)">TBD</span></button>';const c=btnCls(team,pick,result);const cor=result&&pick===result&&pick===team;const inc=result&&pick&&pick!==result&&pick===team;const s=seed?'<span style="font-size:10px;opacity:0.5;min-width:16px">('+seed+')</span>':"";const ch=cor?'<span class="check">✓</span>':inc?'<span class="check">✗</span>':"";const d=state.locked?"disabled":"";return'<button class="'+c+'" '+d+' onclick="setPick(\''+region+'\','+round+','+idx+',\''+team.replace(/'/g,"\\'")+'\')">'+s+team+ch+'</button>'}
function renderRegion(rk){const r=REGIONS[rk];const rP=state.picks[rk]||{};const rR=state.results[rk]||{};let h='<div class="section-head" style="border-bottom:2px solid '+r.color+'"><div style="font-size:24px">'+r.emoji+'</div><div style="font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase">'+r.name+'</div>';const ch=rP[3]?.[0];if(ch)h+='<div style="font-size:12px;color:'+r.color+';font-weight:600;margin-top:2px">Your pick: '+ch+'</div>';h+='</div>';let cur=r.games.map(g=>({s1:g[0],t1:g[1],s2:g[2],t2:g[3]}));for(let rd=0;rd<4;rd++){const rdP=rP[rd]||{};const rdR=rR[rd]||{};h+='<div class="round-group"><div class="round-label" style="color:'+r.color+'">'+ROUND_NAMES[rd]+'</div>';for(let i=0;i<cur.length;i++){const g=cur[i];h+='<div class="game">'+btnHTML(g.t1,rd===0?g.s1:null,rdP[i],rdR[i],rk,rd,i)+btnHTML(g.t2,rd===0?g.s2:null,rdP[i],rdR[i],rk,rd,i)+'</div>'}h+='</div>';let nx=[];for(let i=0;i<cur.length;i+=2)nx.push({t1:rdP[i]||null,t2:rdP[i+1]||null});cur=nx}return h}
function renderFF(){const ch=REGION_KEYS.map(r=>(state.picks[r]||{})[3]?.[0]||null);const ffP=state.picks.finalFour||{};const ffR=state.results.finalFour||{};const s1P=(ffP[0]||{})[0];const s2P=(ffP[0]||{})[1];const cP=(ffP[1]||{})[0];const s1R=(ffR[0]||{})[0];const s2R=(ffR[0]||{})[1];const cR=(ffR[1]||{})[0];let h='<div class="section-head" style="border-bottom:2px solid var(--gold)"><div style="font-size:28px">🏆</div><div style="font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Final Four</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Lucas Oil Stadium, Indianapolis</div></div>';h+='<div class="round-group"><div class="round-label" style="color:var(--gold)">Semifinals</div><div style="font-size:10px;color:var(--muted);margin-bottom:3px">East vs South</div><div class="game">'+btnHTML(ch[0],null,s1P,s1R,"finalFour",0,0)+btnHTML(ch[1],null,s1P,s1R,"finalFour",0,0)+'</div><div style="font-size:10px;color:var(--muted);margin-bottom:3px">West vs Midwest</div><div class="game">'+btnHTML(ch[2],null,s2P,s2R,"finalFour",0,1)+btnHTML(ch[3],null,s2P,s2R,"finalFour",0,1)+'</div></div>';h+='<div class="round-group"><div class="round-label" style="color:var(--gold)">Championship</div><div class="game">'+btnHTML(s1P,null,cP,cR,"finalFour",1,0)+btnHTML(s2P,null,cP,cR,"finalFour",1,0)+'</div></div>';if(cP)h+='<div class="champ-box"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Your Champion</div><div style="font-size:22px;font-weight:900;color:var(--gold);margin-top:4px">🏆 '+cP+' 🏆</div></div>';return h}
async function renderLB(){const all=await api("GET","/api/all-picks");let sorted=state.players.map(p=>({name:p,score:calcScore(all[p]||{},state.results),picks:countPicks(all[p]||{}),champion:(all[p]?.finalFour||{})[1]?.[0]||"—"})).sort((a,b)=>b.score-a.score||b.picks-a.picks);let h='<div class="section-head" style="border-bottom:2px solid var(--gold)"><div style="font-size:24px">📊</div><div style="font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Leaderboard</div><div style="font-size:11px;color:var(--muted);margin-top:2px">R64=10 / R32=20 / S16=40 / E8=80 / F4=160 / Champ=320</div></div>';if(!sorted.length)h+='<div style="text-align:center;color:var(--muted);padding:20px">No players yet</div>';sorted.forEach((p,i)=>{h+='<div class="lb-item'+(i===0?" first":"")+'"><div style="font-size:18px;font-weight:800;width:32px;text-align:center;color:'+(i===0?"var(--gold)":"var(--muted)")+'">'+(i+1)+'</div><div style="flex:1"><div style="font-size:15px;font-weight:700">'+p.name+'</div><div style="font-size:11px;color:var(--muted)">'+p.picks+'/63 picks · Champ: '+p.champion+'</div></div><div style="font-size:20px;font-weight:900;color:'+(i===0?"var(--gold)":"#fff")+'">'+p.score+'</div></div>'});document.getElementById("tab-content").innerHTML=h}
async function toggleLock(){state.locked=!state.locked;await api("POST","/api/state",{locked:state.locked});render()}
async function manualResult(region,round,idx,team){if(!state.results[region])state.results[region]={};if(!state.results[region][round])state.results[region][round]={};state.results[region][round][idx]=team;await api("POST","/api/results",state.results);render()}
function renderAdmin(){let h='<div class="section-head" style="border-bottom:2px solid var(--gold)"><div style="font-size:24px">⚙️</div><div style="font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Admin</div></div>';h+='<button class="admin-btn" style="background:'+(state.locked?"linear-gradient(135deg,#4ade80,#22c55e)":"linear-gradient(135deg,#ef4444,#dc2626)")+'" onclick="toggleLock()">'+(state.locked?"🔓 Unlock Brackets":"🔒 Lock All Brackets")+'</button>';h+='<div style="margin-top:12px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">Enter Results (tap winner)</div>';for(const rk of REGION_KEYS){const region=REGIONS[rk];const rR=state.results[rk]||{};let cur=region.games.map(g=>({t1:g[1],t2:g[3]}));for(let rd=0;rd<4;rd++){const rdR=rR[rd]||{};for(let i=0;i<cur.length;i++){const g=cur[i];if(!g.t1||!g.t2)continue;if(!rdR[i]){h+='<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center"><span style="font-size:10px;color:var(--muted);width:55px">'+region.name+' R'+(rd+1)+'</span><button class="pick-btn" style="flex:1;font-size:11px;padding:6px" onclick="manualResult(\''+rk+'\','+rd+','+i+',\''+g.t1.replace(/'/g,"\\'")+'\')">'+g.t1+'</button><button class="pick-btn" style="flex:1;font-size:11px;padding:6px" onclick="manualResult(\''+rk+'\','+rd+','+i+',\''+g.t2.replace(/'/g,"\\'")+'\')">'+g.t2+'</button></div>';break}}let nx=[];for(let i=0;i<cur.length;i+=2)nx.push({t1:rdR[i]||null,t2:rdR[i+1]||null});cur=nx}}h+='</div>';h+='<div style="margin-top:16px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">Players ('+state.players.length+')</div>';state.players.forEach(p=>{h+='<div style="padding:6px 10px;background:var(--card);border-radius:6px;margin-bottom:3px;font-size:13px;color:rgba(255,255,255,0.7)">'+p+'</div>'});h+='</div><div style="margin-top:16px;font-size:11px;color:var(--muted);line-height:1.5">Share this URL with family. Lock brackets before Thursday tip-off.</div>';return h}
function render(){if(!state.user){document.getElementById("app").innerHTML='<div class="login"><div style="font-size:48px;margin-bottom:8px">🏀</div><div style="font-size:11px;font-weight:700;letter-spacing:3px;color:var(--gold);text-transform:uppercase">2026 NCAA Tournament</div><div style="font-size:24px;font-weight:900;margin:4px 0 24px">BEAUBOUEF BRACKET</div><input id="ni" placeholder="Enter your name" onkeydown="if(event.key===\'Enter\')login(this.value)"><button class="login-btn" onclick="login(document.getElementById(\'ni\').value)">LET\'S GO</button>'+(state.players.length?'<div style="margin-top:24px;color:var(--muted);font-size:12px">Players: '+state.players.join(", ")+'</div>':"")+'</div>';return}const tabs=["east","south","west","midwest","f4","board","admin"];const labels={east:"E",south:"S",west:"W",midwest:"MW",f4:"🏆",board:"📊",admin:"⚙️"};let th=tabs.map(t=>'<button class="tab'+(t===state.tab?" active":"")+(/f4|board|admin/.test(t)?" icon":"")+'" onclick="state.tab=\''+t+'\';render()">'+labels[t]+'</button>').join("");let c="";if(REGION_KEYS.includes(state.tab))c=renderRegion(state.tab);else if(state.tab==="f4")c=renderFF();else if(state.tab==="admin")c=renderAdmin();else if(state.tab==="board")c="";document.getElementById("app").innerHTML='<div class="header"><div><div style="font-size:10px;font-weight:700;letter-spacing:2px;color:var(--gold);text-transform:uppercase">Beaubouef Bracket</div><div style="font-size:14px;font-weight:600">'+state.user+(state.saving?' <span style="font-size:10px;color:var(--green)">saving...</span>':"")+'</div></div><div style="display:flex;align-items:center;gap:8px">'+(state.locked?'<span style="font-size:10px;color:var(--red);font-weight:700;text-transform:uppercase">Locked</span>':"")+'<button style="background:rgba(255,255,255,0.08);border:none;color:var(--muted);padding:5px 10px;border-radius:6px;font-size:11px" onclick="state.user=null;state.picks={};render()">Switch</button></div></div><div class="tabs">'+th+'</div><div id="msg-bar" class="msg hidden"></div><div class="content" id="tab-content">'+c+'</div><div class="footer">'+countPicks(state.picks)+'/63 picks</div>';if(state.tab==="board")renderLB()}
init();
</script>
</body>
</html>
HTMLEOF
msg_ok "Frontend written"

msg_info "Creating systemd service"
pct exec "$CT_ID" -- bash -c "
  cat > /etc/systemd/system/bracket.service << 'SVCEOF'
[Unit]
Description=Beaubouef Bracket 2026
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/bracket
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

  systemctl daemon-reload
  systemctl enable bracket.service >/dev/null 2>&1
  systemctl start bracket.service
" 2>/dev/null
msg_ok "Service created and started"

# ---- Get IP ----
sleep 2
IP=$(pct exec "$CT_ID" -- bash -c "hostname -I" | awk '{print $1}')

# ---- Done ----
echo ""
echo -e "${BL}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo -e "${GN}  Beaubouef Bracket is ready! 🏀${CL}"
echo -e "${BL}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo ""
echo -e "  ${YW}LXC ID:${CL}      $CT_ID"
echo -e "  ${YW}IP Address:${CL}  ${GN}$IP${CL}"
echo -e "  ${YW}URL:${CL}         ${GN}http://$IP:3000${CL}"
echo ""
echo -e "  Point your reverse proxy / tunnel at ${GN}$IP:3000${CL}"
echo -e "  Lock brackets before Thursday's tip-off (⚙️ tab)"
echo ""
echo -e "${BL}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
