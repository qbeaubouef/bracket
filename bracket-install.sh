#!/usr/bin/env bash

# Copyright (c) 2026 qbeaubouef
# Author: Quinton Beaubouef
# License: MIT | https://github.com/qbeaubouef/bracket

# ── App Defaults ──────────────────────────────────────────────────────────────
APP="Beaubouef Bracket"
var_tags="bracket;march-madness"
var_cpu="1"
var_ram="512"
var_disk="2"
var_os="debian"
var_version="12"
var_unprivileged="1"

# ── Colors & Formatting ──────────────────────────────────────────────────────
YW=$(echo "\033[33m")
BL=$(echo "\033[36m")
RD=$(echo "\033[01;31m")
BGN=$(echo "\033[4;92m")
GN=$(echo "\033[1;92m")
DGN=$(echo "\033[32m")
CL=$(echo "\033[m")
BOLD=$(echo "\033[1m")
BFR="\\r\\033[K"
HOLD=" "
TAB="  "
CM="${GN}✓${CL}"
CROSS="${RD}✗${CL}"
INFO="${YW}ℹ${CL}"
SPINNER_PID=""
NSAPP=$(echo "${APP,,}" | tr -d ' ')

# ── Spinner ───────────────────────────────────────────────────────────────────
spinner() {
  local chars="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
  local i=0
  while true; do
    printf "\r${TAB}${YW}%s${CL} %s" "${chars:i++%${#chars}:1}" "$1"
    sleep 0.1
  done
}

msg_info() {
  local msg="$1"
  spinner "$msg" &
  SPINNER_PID=$!
}

msg_ok() {
  if [[ -n "$SPINNER_PID" ]]; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null
    SPINNER_PID=""
  fi
  printf "\r${BFR}${TAB}${CM} ${GN}%s${CL}\n" "$1"
}

msg_error() {
  if [[ -n "$SPINNER_PID" ]]; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null
    SPINNER_PID=""
  fi
  printf "\r${BFR}${TAB}${CROSS} ${RD}%s${CL}\n" "$1"
  exit 1
}

# ── Header ────────────────────────────────────────────────────────────────────
header_info() {
  clear
  cat <<"EOF"
    ____                        __                __
   / __ )___  ____ ___  __     / /_  ____  __  __/ /__  _____
  / __  / _ \/ __ `/ / / /   / __ \/ __ \/ / / / / _ \/ ___/
 / /_/ /  __/ /_/ / /_/ /   / /_/ / /_/ / /_/ / /  __(__  )
/_____/\___/\__,_/\__,_/   /_.___/\____/\__,_/_/\___/____/
    ____                  __        __
   / __ )_________ ______/ /_____  / /_
  / __  / ___/ __ `/ ___/ //_/ _ \/ __/
 / /_/ / /  / /_/ / /__/ ,< /  __/ /_
/_____/_/   \__,_/\___/_/|_|\___/\__/

EOF
  echo -e "          ${BL}🏀  2026 NCAA Tournament Family Bracket  🏀${CL}\n"
}

# ── Pre-flight Checks ────────────────────────────────────────────────────────
if [[ "$(id -u)" -ne 0 ]]; then
  echo -e "\n${CROSS} ${RD}Run this script as root${CL}\n"
  exit 1
fi

if ! command -v pveversion &>/dev/null; then
  echo -e "\n${CROSS} ${RD}This script must be run on a Proxmox VE host${CL}\n"
  exit 1
fi

if ! command -v whiptail &>/dev/null; then
  echo -e "\n${CROSS} ${RD}whiptail is required but not installed${CL}\n"
  exit 1
fi

NEXTID=$(pvesh get /cluster/nextid)
PVEHOST=$(hostname)
timezone=$(cat /etc/timezone 2>/dev/null || echo "UTC")

# ── Exit Handler ──────────────────────────────────────────────────────────────
exit_script() {
  clear
  echo -e "\n${INFO} ${YW}Cancelled. No changes made.${CL}\n"
  exit 0
}

# ── Default Settings ──────────────────────────────────────────────────────────
default_settings() {
  CT_TYPE="$var_unprivileged"
  CT_ID="$NEXTID"
  HN="$NSAPP"
  DISK_SIZE="$var_disk"
  CORE_COUNT="$var_cpu"
  RAM_SIZE="$var_ram"
  BRG="vmbr0"
  NET="dhcp"
  GATE=""
  MAC=""
  VLAN=""
  MTU=""

  # Auto-detect storage
  CONTAINER_STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1; exit}')
  TEMPLATE_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 {print $1; exit}')
  if [[ -z "$CONTAINER_STORAGE" ]]; then
    msg_error "No storage found with 'rootdir' content type"
  fi
  if [[ -z "$TEMPLATE_STORAGE" ]]; then
    TEMPLATE_STORAGE="local"
  fi

  echo -e "${DGN}Using Default Settings on node ${BOLD}${PVEHOST}${CL}\n"
  echo -e "${TAB}${DGN}Container Type: ${BGN}Unprivileged${CL}"
  echo -e "${TAB}${DGN}Container ID:   ${BGN}${CT_ID}${CL}"
  echo -e "${TAB}${DGN}Hostname:       ${BGN}${HN}${CL}"
  echo -e "${TAB}${DGN}Disk Size:      ${BGN}${DISK_SIZE}GB${CL}"
  echo -e "${TAB}${DGN}CPU Cores:      ${BGN}${CORE_COUNT}${CL}"
  echo -e "${TAB}${DGN}RAM Size:       ${BGN}${RAM_SIZE}MiB${CL}"
  echo -e "${TAB}${DGN}Bridge:         ${BGN}${BRG}${CL}"
  echo -e "${TAB}${DGN}IP Address:     ${BGN}DHCP${CL}"
  echo -e "${TAB}${DGN}Storage:        ${BGN}${CONTAINER_STORAGE}${CL}"
  echo ""
}

# ── Advanced Settings ─────────────────────────────────────────────────────────
advanced_settings() {
  CT_TYPE="$var_unprivileged"
  CT_ID="$NEXTID"
  HN="$NSAPP"
  DISK_SIZE="$var_disk"
  CORE_COUNT="$var_cpu"
  RAM_SIZE="$var_ram"
  BRG="vmbr0"
  NET="dhcp"
  GATE=""
  MAC=""
  VLAN=""
  MTU=""

  # Container Type
  local ct_default_on="ON" ct_default_off="OFF"
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "CONTAINER TYPE" \
    --radiolist "\nChoose container type:\n" 12 58 2 \
    "1" "Unprivileged (recommended)" "$ct_default_on" \
    "0" "Privileged" "$ct_default_off" \
    3>&1 1>&2 2>&3); then
    CT_TYPE="${result:-1}"
  else
    exit_script
  fi

  # Container ID
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "CONTAINER ID" \
    --inputbox "\nSet Container ID" 10 58 "$CT_ID" \
    3>&1 1>&2 2>&3); then
    CT_ID="${result:-$NEXTID}"
  else
    exit_script
  fi

  # Hostname
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "HOSTNAME" \
    --inputbox "\nSet Hostname" 10 58 "$HN" \
    3>&1 1>&2 2>&3); then
    HN="${result:-$NSAPP}"
  else
    exit_script
  fi

  # Disk Size
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "DISK SIZE" \
    --inputbox "\nSet Disk Size in GB" 10 58 "$DISK_SIZE" \
    3>&1 1>&2 2>&3); then
    DISK_SIZE="${result:-$var_disk}"
  else
    exit_script
  fi

  # CPU Cores
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "CPU CORES" \
    --inputbox "\nAllocate CPU Cores" 10 58 "$CORE_COUNT" \
    3>&1 1>&2 2>&3); then
    CORE_COUNT="${result:-$var_cpu}"
  else
    exit_script
  fi

  # RAM
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "RAM SIZE" \
    --inputbox "\nAllocate RAM in MiB" 10 58 "$RAM_SIZE" \
    3>&1 1>&2 2>&3); then
    RAM_SIZE="${result:-$var_ram}"
  else
    exit_script
  fi

  # Bridge
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "NETWORK BRIDGE" \
    --inputbox "\nSet Network Bridge" 10 58 "$BRG" \
    3>&1 1>&2 2>&3); then
    BRG="${result:-vmbr0}"
  else
    exit_script
  fi

  # IP Address
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "IP ADDRESS" \
    --inputbox "\nSet IPv4 Address (dhcp or x.x.x.x/xx)" 10 58 "$NET" \
    3>&1 1>&2 2>&3); then
    NET="${result:-dhcp}"
  else
    exit_script
  fi

  # Gateway (only if static)
  if [[ "$NET" != "dhcp" ]]; then
    if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
      --title "GATEWAY" \
      --inputbox "\nSet Gateway IP (leave blank for none)" 10 58 "" \
      3>&1 1>&2 2>&3); then
      GATE="$result"
    else
      exit_script
    fi
  fi

  # MAC Address
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "MAC ADDRESS" \
    --inputbox "\nSet MAC Address (leave blank for auto)" 10 58 "" \
    3>&1 1>&2 2>&3); then
    MAC="$result"
  else
    exit_script
  fi

  # VLAN
  if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
    --title "VLAN TAG" \
    --inputbox "\nSet VLAN Tag (leave blank for none)" 10 58 "" \
    3>&1 1>&2 2>&3); then
    VLAN="$result"
  else
    exit_script
  fi

  # Storage selection
  local storages
  storages=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1}')
  if [[ -z "$storages" ]]; then
    msg_error "No storage found with 'rootdir' content type"
  fi
  local storage_menu=()
  while IFS= read -r s; do
    [[ -n "$s" ]] && storage_menu+=("$s" "$s")
  done <<< "$storages"
  if [[ ${#storage_menu[@]} -gt 2 ]]; then
    if result=$(whiptail --backtitle "Proxmox VE Helper Scripts" \
      --title "CONTAINER STORAGE" \
      --menu "\nSelect storage for the container:" 14 40 6 \
      "${storage_menu[@]}" \
      3>&1 1>&2 2>&3); then
      CONTAINER_STORAGE="$result"
    else
      exit_script
    fi
  else
    CONTAINER_STORAGE=$(echo "$storages" | head -1)
  fi

  # Template storage
  TEMPLATE_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 {print $1; exit}')
  [[ -z "$TEMPLATE_STORAGE" ]] && TEMPLATE_STORAGE="local"

  echo -e "\n${DGN}Using Advanced Settings on node ${BOLD}${PVEHOST}${CL}\n"
  echo -e "${TAB}${DGN}Container Type: ${BGN}$([[ $CT_TYPE -eq 1 ]] && echo "Unprivileged" || echo "Privileged")${CL}"
  echo -e "${TAB}${DGN}Container ID:   ${BGN}${CT_ID}${CL}"
  echo -e "${TAB}${DGN}Hostname:       ${BGN}${HN}${CL}"
  echo -e "${TAB}${DGN}Disk Size:      ${BGN}${DISK_SIZE}GB${CL}"
  echo -e "${TAB}${DGN}CPU Cores:      ${BGN}${CORE_COUNT}${CL}"
  echo -e "${TAB}${DGN}RAM Size:       ${BGN}${RAM_SIZE}MiB${CL}"
  echo -e "${TAB}${DGN}Bridge:         ${BGN}${BRG}${CL}"
  echo -e "${TAB}${DGN}IP Address:     ${BGN}${NET}${CL}"
  [[ -n "$GATE" ]] && echo -e "${TAB}${DGN}Gateway:        ${BGN}${GATE}${CL}"
  [[ -n "$MAC" ]]  && echo -e "${TAB}${DGN}MAC Address:    ${BGN}${MAC}${CL}"
  [[ -n "$VLAN" ]] && echo -e "${TAB}${DGN}VLAN Tag:       ${BGN}${VLAN}${CL}"
  echo -e "${TAB}${DGN}Storage:        ${BGN}${CONTAINER_STORAGE}${CL}"
  echo ""
}

# ── Main Flow ─────────────────────────────────────────────────────────────────
header_info

if (whiptail --backtitle "Proxmox VE Helper Scripts" \
  --title "SETTINGS" \
  --yesno "Use default settings for ${APP}?" 10 58); then
  header_info
  default_settings
else
  header_info
  advanced_settings
fi

# Confirm
if ! (whiptail --backtitle "Proxmox VE Helper Scripts" \
  --title "CREATE LXC" \
  --yesno "Create ${APP} LXC ${CT_ID}?" 10 58); then
  exit_script
fi

# ── Download Template ─────────────────────────────────────────────────────────
TEMPLATE="${var_os}-${var_version}-standard_12.7-1_amd64.tar.zst"
msg_info "Checking ${var_os} ${var_version} template"
if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  msg_ok "Template not cached"
  msg_info "Downloading ${var_os} ${var_version} template"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" &>/dev/null || {
    msg_error "Failed to download template"
  }
fi
msg_ok "Template ready"

# ── Build Network String ──────────────────────────────────────────────────────
NET_STR="name=eth0,bridge=${BRG}"
[[ "$NET" == "dhcp" ]] && NET_STR="${NET_STR},ip=dhcp" || NET_STR="${NET_STR},ip=${NET}"
[[ -n "$GATE" ]] && NET_STR="${NET_STR},gw=${GATE}"
[[ -n "$MAC" ]]  && NET_STR="${NET_STR},hwaddr=${MAC}"
[[ -n "$VLAN" ]] && NET_STR="${NET_STR},tag=${VLAN}"
[[ -n "$MTU" ]]  && NET_STR="${NET_STR},mtu=${MTU}"

# ── Create Container ──────────────────────────────────────────────────────────
msg_info "Creating LXC container ${CT_ID}"
pct create "$CT_ID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HN" \
  --cores "$CORE_COUNT" \
  --memory "$RAM_SIZE" \
  --net0 "$NET_STR" \
  --rootfs "${CONTAINER_STORAGE}:${DISK_SIZE}" \
  --unprivileged "$CT_TYPE" \
  --features nesting=1 \
  --onboot 1 \
  --start 0 \
  --tags "${var_tags}" &>/dev/null || {
  msg_error "Failed to create container"
}
msg_ok "Created LXC container ${CT_ID}"

# ── Start Container ───────────────────────────────────────────────────────────
msg_info "Starting LXC container"
pct start "$CT_ID"
sleep 3
msg_ok "Started LXC container"

# ── Setup Container OS ────────────────────────────────────────────────────────
msg_info "Setting up container OS"
pct exec "$CT_ID" -- bash -c "
  apt-get update &>/dev/null
  apt-get install -y curl ca-certificates gnupg sudo &>/dev/null
" &>/dev/null
msg_ok "Set up container OS"

# ── Get Container IP ──────────────────────────────────────────────────────────
LXC_IP=$(pct exec "$CT_ID" -- bash -c "hostname -I" 2>/dev/null | awk '{print $1}')
if [[ -n "$LXC_IP" ]]; then
  msg_ok "Network connected: ${GN}${LXC_IP}${CL}"
else
  msg_ok "Network connected (waiting for DHCP)"
fi

# ── Install Node.js ───────────────────────────────────────────────────────────
msg_info "Installing Node.js 20"
pct exec "$CT_ID" -- bash -c "
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
  echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
  apt-get update &>/dev/null
  apt-get install -y nodejs &>/dev/null
" &>/dev/null
msg_ok "Installed Node.js 20"

# ── Install Beaubouef Bracket ─────────────────────────────────────────────────
msg_info "Installing ${APP}"
pct exec "$CT_ID" -- bash -c "mkdir -p /opt/bracket/public /data" &>/dev/null

# Server
pct exec "$CT_ID" -- bash -c 'cat > /opt/bracket/server.js' << 'SERVEREOF'
const express=require("express"),fs=require("fs"),path=require("path"),app=express(),D="/data";
app.use(express.json());app.use(express.static(path.join(__dirname,"public")));
const R=(f,d)=>{try{return JSON.parse(fs.readFileSync(path.join(D,f),"utf8"))}catch{return d}};
const W=(f,d)=>{fs.mkdirSync(D,{recursive:true});fs.writeFileSync(path.join(D,f),JSON.stringify(d,null,2))};
app.get("/api/players",(q,r)=>r.json(R("players.json",[])));
app.post("/api/players",(q,r)=>{const{name}=q.body;if(!name?.trim())return r.status(400).json({error:"Name required"});const p=R("players.json",[]);if(!p.includes(name.trim())){p.push(name.trim());W("players.json",p)}r.json(p)});
app.get("/api/picks/:n",(q,r)=>r.json(R("picks_"+q.params.n+".json",{})));
app.post("/api/picks/:n",(q,r)=>{if(R("state.json",{locked:false}).locked)return r.status(403).json({error:"Locked"});W("picks_"+q.params.n+".json",q.body);r.json({ok:true})});
app.get("/api/results",(q,r)=>r.json(R("results.json",{})));
app.post("/api/results",(q,r)=>{W("results.json",q.body);r.json({ok:true})});
app.get("/api/state",(q,r)=>r.json(R("state.json",{locked:false})));
app.post("/api/state",(q,r)=>{W("state.json",q.body);r.json({ok:true})});
app.get("/api/all-picks",(q,r)=>{const p=R("players.json",[]),a={};for(const n of p)a[n]=R("picks_"+n+".json",{});r.json(a)});
app.listen(3000,"0.0.0.0",()=>console.log("Bracket app on port 3000"));
SERVEREOF

# Package.json
pct exec "$CT_ID" -- bash -c 'cat > /opt/bracket/package.json << PKEOF
{"name":"beaubouef-bracket","version":"1.0.0","main":"server.js","dependencies":{"express":"^4.18.2"}}
PKEOF'

# Frontend from GitHub
pct exec "$CT_ID" -- bash -c "
  curl -fsSL https://raw.githubusercontent.com/qbeaubouef/bracket/main/index.html -o /opt/bracket/public/index.html 2>/dev/null
  if [ ! -s /opt/bracket/public/index.html ]; then
    echo '<html><body style=\"background:#0d1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh\"><div style=\"text-align:center\"><h1>🏀 Beaubouef Bracket</h1><p>Upload index.html to /opt/bracket/public/</p></div></body></html>' > /opt/bracket/public/index.html
  fi
" &>/dev/null

# npm install
pct exec "$CT_ID" -- bash -c "cd /opt/bracket && npm install --production &>/dev/null" &>/dev/null
msg_ok "Installed ${APP}"

# ── Create Service ────────────────────────────────────────────────────────────
msg_info "Creating service"
pct exec "$CT_ID" -- bash -c 'cat > /etc/systemd/system/bracket.service << SVCEOF
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
systemctl enable -q bracket.service
systemctl start bracket.service'
msg_ok "Created service"

# ── Cleanup ───────────────────────────────────────────────────────────────────
msg_info "Cleaning up"
pct exec "$CT_ID" -- bash -c "apt-get -y autoremove &>/dev/null; apt-get -y autoclean &>/dev/null" &>/dev/null
msg_ok "Cleaned up"

# ── Get final IP ──────────────────────────────────────────────────────────────
sleep 2
LXC_IP=$(pct exec "$CT_ID" -- bash -c "hostname -I" 2>/dev/null | awk '{print $1}')

# ── Completion ────────────────────────────────────────────────────────────────
header_info
echo -e "${GN}${APP} setup has been successfully completed!${CL}\n"
echo -e "${TAB}${GN}CT ID:       ${YW}${CT_ID}${CL}"
echo -e "${TAB}${GN}Hostname:    ${YW}${HN}${CL}"
echo -e "${TAB}${GN}IP Address:  ${YW}${LXC_IP}${CL}"
echo -e "${TAB}${GN}URL:         ${YW}http://${LXC_IP}:3000${CL}"
echo ""
echo -e "${TAB}Point your reverse proxy / tunnel at ${GN}${LXC_IP}:3000${CL}"
echo -e "${TAB}Lock brackets before Thursday's tip-off (⚙️ tab)"
echo ""
