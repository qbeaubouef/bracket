const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");
const app = express();
const D = "/data";

app.use(express.json({limit:"10mb"}));
app.use(express.static(path.join(__dirname, "public")));

const R = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return d; } };
const W = (f, d) => { fs.mkdirSync(D, { recursive: true }); fs.writeFileSync(path.join(D, f), JSON.stringify(d, null, 2)); };

// === FIRST FOUR ===
const FIRST_FOUR = [
  { slot: "UMBC/Howard", teams: ["UMBC","Howard"], region: "midwest", gameIdx: 0, seed: 16 },
  { slot: "Miami OH/SMU", teams: ["Miami OH","SMU"], region: "midwest", gameIdx: 4, seed: 11 },
  { slot: "Texas/NC State", teams: ["Texas","NC State"], region: "west", gameIdx: 4, seed: 11 },
  { slot: "PV A&M/Lehigh", teams: ["PV A&M","Lehigh"], region: "south", gameIdx: 0, seed: 16 }
];

// All First Four team names (for filtering)
const FF_TEAM_NAMES = new Set();
FIRST_FOUR.forEach(ff => { ff.teams.forEach(t => FF_TEAM_NAMES.add(t)); });

// === CORE API ===
app.get("/api/players", (q, r) => r.json(R("players.json", [])));
app.post("/api/players", (q, r) => {
  const { name } = q.body;
  if (!name?.trim()) return r.status(400).json({ error: "Name required" });
  const p = R("players.json", []);
  if (!p.includes(name.trim())) { p.push(name.trim()); W("players.json", p); }
  r.json(p);
});
app.get("/api/picks/:n", (q, r) => r.json(R("picks_" + q.params.n + ".json", {})));
app.post("/api/picks/:n", (q, r) => {
  if (R("state.json", { locked: false }).locked) return r.status(403).json({ error: "Locked" });
  W("picks_" + q.params.n + ".json", q.body); r.json({ ok: true });
});
app.get("/api/results", (q, r) => r.json(R("results.json", {})));
app.post("/api/results", (q, r) => { W("results.json", q.body); r.json({ ok: true }); });
app.get("/api/state", (q, r) => r.json(R("state.json", { locked: false })));
app.post("/api/state", (q, r) => { W("state.json", q.body); r.json({ ok: true }); });
app.get("/api/all-picks", (q, r) => {
  const p = R("players.json", []), a = {};
  for (const n of p) a[n] = R("picks_" + n + ".json", {});
  r.json(a);
});
app.get("/api/scores", (q, r) => r.json(R("game_scores.json", {})));
app.post("/api/scores", (q, r) => { W("game_scores.json", q.body); r.json({ ok: true }); });

// === TIEBREAKER ===
app.get("/api/tiebreaker/:n", (q, r) => r.json(R("tb_" + q.params.n + ".json", { score: null })));
app.post("/api/tiebreaker/:n", (q, r) => {
  if (R("state.json", { locked: false }).locked) return r.status(403).json({ error: "Locked" });
  W("tb_" + q.params.n + ".json", q.body); r.json({ ok: true });
});
app.get("/api/all-tiebreakers", (q, r) => {
  const p = R("players.json", []), a = {};
  for (const n of p) a[n] = R("tb_" + n + ".json", { score: null });
  r.json(a);
});

// === FIRST FOUR API ===
app.get("/api/first-four", (q, r) => r.json(R("first_four.json", {})));
app.post("/api/first-four", (q, r) => { W("first_four.json", q.body); r.json({ ok: true }); });

// === SEEDS ===
const SEEDS = {};
const REGION_DATA = {
  east:[[1,"Duke",16,"Siena"],[8,"Ohio State",9,"TCU"],[5,"St. John's",12,"Northern Iowa"],[4,"Kansas",13,"Cal Baptist"],[6,"Louisville",11,"South Florida"],[3,"Michigan State",14,"North Dakota St."],[7,"UCLA",10,"UCF"],[2,"UConn",15,"Furman"]],
  south:[[1,"Florida",16,"PV A&M/Lehigh"],[8,"Clemson",9,"Iowa"],[5,"Vanderbilt",12,"McNeese"],[4,"Nebraska",13,"Troy"],[6,"North Carolina",11,"VCU"],[3,"Illinois",14,"Penn"],[7,"Saint Mary's",10,"Texas A&M"],[2,"Houston",15,"Idaho"]],
  west:[[1,"Arizona",16,"LIU"],[8,"Villanova",9,"Utah State"],[5,"Wisconsin",12,"High Point"],[4,"Arkansas",13,"Hawaii"],[6,"BYU",11,"Texas/NC State"],[3,"Gonzaga",14,"Kennesaw State"],[7,"Miami FL",10,"Missouri"],[2,"Purdue",15,"Queens"]],
  midwest:[[1,"Michigan",16,"UMBC/Howard"],[8,"Georgia",9,"Saint Louis"],[5,"Texas Tech",12,"Akron"],[4,"Alabama",13,"Hofstra"],[6,"Tennessee",11,"Miami OH/SMU"],[3,"Virginia",14,"Wright State"],[7,"Kentucky",10,"Santa Clara"],[2,"Iowa State",15,"Tennessee State"]]
};
for (const games of Object.values(REGION_DATA)) {
  for (const [s1, t1, s2, t2] of games) { SEEDS[t1] = s1; SEEDS[t2] = s2; }
}
app.get("/api/seeds", (q, r) => r.json(SEEDS));

// === EXPORT/IMPORT ===
app.get("/api/export/:n", (q, r) => {
  const n = q.params.n;
  r.json({ name: n, picks: R("picks_" + n + ".json", {}), tiebreaker: R("tb_" + n + ".json", { score: null }), exportedAt: new Date().toISOString() });
});
app.post("/api/import/:n", (q, r) => {
  const n = q.params.n;
  if (q.body.picks) W("picks_" + n + ".json", q.body.picks);
  if (q.body.tiebreaker) W("tb_" + n + ".json", q.body.tiebreaker);
  const p = R("players.json", []);
  if (!p.includes(n)) { p.push(n); W("players.json", p); }
  r.json({ ok: true });
});
app.get("/api/export-all", (q, r) => {
  const players = R("players.json", []);
  const allPicks = {}, allTB = {};
  for (const n of players) { allPicks[n] = R("picks_" + n + ".json", {}); allTB[n] = R("tb_" + n + ".json", { score: null }); }
  r.json({ year: 2026, exportedAt: new Date().toISOString(), players, picks: allPicks, tiebreakers: allTB, results: R("results.json", {}), scores: R("game_scores.json", {}), firstFour: R("first_four.json", {}), state: R("state.json", { locked: false }) });
});
app.post("/api/import-all", (q, r) => {
  const d = q.body;
  if (d.players) W("players.json", d.players);
  if (d.results) W("results.json", d.results);
  if (d.scores) W("game_scores.json", d.scores);
  if (d.firstFour) W("first_four.json", d.firstFour);
  if (d.state) W("state.json", d.state);
  if (d.picks) { for (const [n, p] of Object.entries(d.picks)) W("picks_" + n + ".json", p); }
  if (d.tiebreakers) { for (const [n, t] of Object.entries(d.tiebreakers)) W("tb_" + n + ".json", t); }
  r.json({ ok: true });
});

// === ARCHIVE ===
app.post("/api/archive", (q, r) => {
  const year = q.body.year || new Date().getFullYear();
  const archiveDir = path.join(D, "archives");
  fs.mkdirSync(archiveDir, { recursive: true });
  const players = R("players.json", []);
  const allPicks = {}, allTB = {};
  for (const n of players) { allPicks[n] = R("picks_" + n + ".json", {}); allTB[n] = R("tb_" + n + ".json", { score: null }); }
  const archive = { year, archivedAt: new Date().toISOString(), players, picks: allPicks, tiebreakers: allTB, results: R("results.json", {}), scores: R("game_scores.json", {}), firstFour: R("first_four.json", {}), state: R("state.json", { locked: false }) };
  fs.writeFileSync(path.join(archiveDir, year + ".json"), JSON.stringify(archive, null, 2));
  r.json({ ok: true, year });
});
app.get("/api/archives", (q, r) => {
  try { const files = fs.readdirSync(path.join(D, "archives")).filter(f => f.endsWith(".json")); r.json(files.map(f => parseInt(f)).filter(n => !isNaN(n)).sort((a, b) => b - a)); }
  catch { r.json([]); }
});
app.get("/api/archive/:year", (q, r) => {
  try { r.json(JSON.parse(fs.readFileSync(path.join(D, "archives", q.params.year + ".json"), "utf8"))); }
  catch { r.status(404).json({ error: "Not found" }); }
});
app.post("/api/new-year", (q, r) => {
  const players = R("players.json", []);
  for (const n of players) {
    try { fs.unlinkSync(path.join(D, "picks_" + n + ".json")); } catch {}
    try { fs.unlinkSync(path.join(D, "tb_" + n + ".json")); } catch {}
  }
  W("players.json", []); W("results.json", {}); W("game_scores.json", {}); W("first_four.json", {}); W("state.json", { locked: false });
  r.json({ ok: true });
});

// === ESPN NAME MAP ===
const ESPN_NAME_MAP = {
  "Duke Blue Devils":"Duke","Duke":"Duke","Siena Saints":"Siena","Siena":"Siena",
  "Ohio State Buckeyes":"Ohio State","Ohio St":"Ohio State","Ohio State":"Ohio State",
  "TCU Horned Frogs":"TCU","TCU":"TCU",
  "St. John's Red Storm":"St. John's","St. John's (NY)":"St. John's","St. John's":"St. John's",
  "Northern Iowa Panthers":"Northern Iowa","N Iowa":"Northern Iowa","Northern Iowa":"Northern Iowa","UNI":"Northern Iowa",
  "Kansas Jayhawks":"Kansas","Kansas":"Kansas",
  "Cal Baptist Lancers":"Cal Baptist","Cal Baptist":"Cal Baptist","California Baptist":"Cal Baptist","CBU":"Cal Baptist",
  "Louisville Cardinals":"Louisville","Louisville":"Louisville",
  "South Florida Bulls":"South Florida","USF":"South Florida","South Florida":"South Florida",
  "Michigan State Spartans":"Michigan State","Michigan St":"Michigan State","Michigan State":"Michigan State",
  "North Dakota State Bison":"North Dakota St.","N Dakota St":"North Dakota St.","NDSU":"North Dakota St.","North Dakota St.":"North Dakota St.",
  "UCLA Bruins":"UCLA","UCLA":"UCLA","UCF Knights":"UCF","UCF":"UCF",
  "UConn Huskies":"UConn","Connecticut":"UConn","UConn":"UConn",
  "Furman Paladins":"Furman","Furman":"Furman",
  "Florida Gators":"Florida","Florida":"Florida",
  "Prairie View A&M Panthers":"PV A&M","Prairie View":"PV A&M","Prairie View A&M":"PV A&M",
  "Lehigh Mountain Hawks":"Lehigh","Lehigh":"Lehigh",
  "Clemson Tigers":"Clemson","Clemson":"Clemson","Iowa Hawkeyes":"Iowa","Iowa":"Iowa",
  "Vanderbilt Commodores":"Vanderbilt","Vanderbilt":"Vanderbilt",
  "McNeese Cowboys":"McNeese","McNeese":"McNeese","McNeese State":"McNeese","McNeese St":"McNeese",
  "Nebraska Cornhuskers":"Nebraska","Nebraska":"Nebraska","Troy Trojans":"Troy","Troy":"Troy",
  "North Carolina Tar Heels":"North Carolina","UNC":"North Carolina","North Carolina":"North Carolina",
  "VCU Rams":"VCU","VCU":"VCU","Illinois Fighting Illini":"Illinois","Illinois":"Illinois",
  "Penn Quakers":"Penn","Pennsylvania":"Penn","Penn":"Penn",
  "Saint Mary's Gaels":"Saint Mary's","Saint Mary's (CA)":"Saint Mary's","St. Mary's":"Saint Mary's","Saint Mary's":"Saint Mary's",
  "Texas A&M Aggies":"Texas A&M","Texas A&M":"Texas A&M",
  "Houston Cougars":"Houston","Houston":"Houston","Idaho Vandals":"Idaho","Idaho":"Idaho",
  "Arizona Wildcats":"Arizona","Arizona":"Arizona","LIU Sharks":"LIU","Long Island":"LIU","LIU":"LIU",
  "Villanova Wildcats":"Villanova","Villanova":"Villanova",
  "Utah State Aggies":"Utah State","Utah St":"Utah State","Utah State":"Utah State",
  "Wisconsin Badgers":"Wisconsin","Wisconsin":"Wisconsin",
  "High Point Panthers":"High Point","High Point":"High Point",
  "Arkansas Razorbacks":"Arkansas","Arkansas":"Arkansas",
  "Hawaii Rainbow Warriors":"Hawaii","Hawai'i":"Hawaii","Hawaii":"Hawaii",
  "BYU Cougars":"BYU","BYU":"BYU",
  "Texas Longhorns":"Texas","NC State Wolfpack":"NC State","NC State":"NC State","Texas":"Texas",
  "Gonzaga Bulldogs":"Gonzaga","Gonzaga":"Gonzaga",
  "Kennesaw State Owls":"Kennesaw State","Kennesaw St":"Kennesaw State","Kennesaw State":"Kennesaw State",
  "Miami Hurricanes":"Miami FL","Miami (FL)":"Miami FL","Miami FL":"Miami FL",
  "Missouri Tigers":"Missouri","Missouri":"Missouri","Purdue Boilermakers":"Purdue","Purdue":"Purdue",
  "Queens Royals":"Queens","Queens (NC)":"Queens","Queens":"Queens",
  "Michigan Wolverines":"Michigan","Michigan":"Michigan",
  "UMBC Retrievers":"UMBC","UMBC":"UMBC","Howard Bison":"Howard","Howard":"Howard",
  "Georgia Bulldogs":"Georgia","Georgia":"Georgia",
  "Saint Louis Billikens":"Saint Louis","St. Louis":"Saint Louis","Saint Louis":"Saint Louis",
  "Texas Tech Red Raiders":"Texas Tech","Texas Tech":"Texas Tech","Akron Zips":"Akron","Akron":"Akron",
  "Alabama Crimson Tide":"Alabama","Alabama":"Alabama","Hofstra Pride":"Hofstra","Hofstra":"Hofstra",
  "Tennessee Volunteers":"Tennessee","Tennessee":"Tennessee",
  "Miami (OH) RedHawks":"Miami OH","Miami (OH)":"Miami OH","Miami RedHawks":"Miami OH",
  "SMU Mustangs":"SMU","SMU":"SMU",
  "Virginia Cavaliers":"Virginia","Virginia":"Virginia",
  "Wright State Raiders":"Wright State","Wright St":"Wright State","Wright State":"Wright State",
  "Kentucky Wildcats":"Kentucky","Kentucky":"Kentucky",
  "Santa Clara Broncos":"Santa Clara","Santa Clara":"Santa Clara",
  "Iowa State Cyclones":"Iowa State","Iowa State":"Iowa State",
  "Tennessee State Tigers":"Tennessee State","Tennessee St":"Tennessee State","Tennessee State":"Tennessee State"
};

const BRACKET = {
  east:[["Duke","Siena"],["Ohio State","TCU"],["St. John's","Northern Iowa"],["Kansas","Cal Baptist"],["Louisville","South Florida"],["Michigan State","North Dakota St."],["UCLA","UCF"],["UConn","Furman"]],
  south:[["Florida","PV A&M/Lehigh"],["Clemson","Iowa"],["Vanderbilt","McNeese"],["Nebraska","Troy"],["North Carolina","VCU"],["Illinois","Penn"],["Saint Mary's","Texas A&M"],["Houston","Idaho"]],
  west:[["Arizona","LIU"],["Villanova","Utah State"],["Wisconsin","High Point"],["Arkansas","Hawaii"],["BYU","Texas/NC State"],["Gonzaga","Kennesaw State"],["Miami FL","Missouri"],["Purdue","Queens"]],
  midwest:[["Michigan","UMBC/Howard"],["Georgia","Saint Louis"],["Texas Tech","Akron"],["Alabama","Hofstra"],["Tennessee","Miami OH/SMU"],["Virginia","Wright State"],["Kentucky","Santa Clara"],["Iowa State","Tennessee State"]]
};

function resolveTeamName(espnName) {
  if (!espnName) return null;
  if (ESPN_NAME_MAP[espnName]) return ESPN_NAME_MAP[espnName];
  for (const [key, val] of Object.entries(ESPN_NAME_MAP)) {
    if (key.toLowerCase() === espnName.toLowerCase()) return val;
  }
  return null;
}

// Get resolved bracket with First Four winners substituted
function getResolvedBracket(firstFour) {
  const resolved = JSON.parse(JSON.stringify(BRACKET));
  for (const ffGame of FIRST_FOUR) {
    if (firstFour[ffGame.slot]?.winner) {
      const winner = firstFour[ffGame.slot].winner;
      const games = resolved[ffGame.region];
      for (let t = 0; t < 2; t++) {
        if (games[ffGame.gameIdx][t] === ffGame.slot) {
          games[ffGame.gameIdx][t] = winner;
        }
      }
      SEEDS[winner] = ffGame.seed;
    }
  }
  return resolved;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "BracketApp/3.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

// === LIVE SCORES ===
app.get("/api/live", async (q, r) => {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&dates=${dateStr}&limit=200`;
    const data = await fetchJSON(url);
    if (!data.events) return r.json([]);

    // All known team names (from our name map values - these ARE the tournament teams)
    const knownTeams = new Set(Object.values(ESPN_NAME_MAP));

    const live = [];
    for (const event of data.events) {
      const comp = event.competitions?.[0];
      if (!comp || !comp.competitors || comp.competitors.length !== 2) continue;

      const c1 = comp.competitors[0];
      const c2 = comp.competitors[1];
      // Try multiple name fields
      const t1raw = c1.team?.displayName || c1.team?.shortDisplayName || c1.team?.name || "";
      const t2raw = c2.team?.displayName || c2.team?.shortDisplayName || c2.team?.name || "";
      const t1name = resolveTeamName(t1raw);
      const t2name = resolveTeamName(t2raw);

      // Include if at least one team is in our tournament
      if (!t1name && !t2name) continue;
      if (!(knownTeams.has(t1name) || knownTeams.has(t2name))) continue;

      const status = event.status?.type?.name || "UNKNOWN";
      const statusDetail = event.status?.type?.shortDetail || event.status?.type?.detail || "";
      const clock = event.status?.displayClock || "";
      const period = event.status?.period || 0;
      const startTime = event.date || "";

      let periodLabel = "";
      if (status === "STATUS_IN_PROGRESS") {
        if (period === 1) periodLabel = "1st Half";
        else if (period === 2) periodLabel = "2nd Half";
        else periodLabel = "OT" + (period > 2 ? (period - 2) : "");
      } else if (status === "STATUS_HALFTIME") {
        periodLabel = "Halftime";
      } else if (status === "STATUS_FINAL" || status === "STATUS_FINAL_OT") {
        periodLabel = period > 2 ? "Final/OT" : "Final";
      } else if (status === "STATUS_SCHEDULED" || status === "STATUS_PREGAME") {
        // Show scheduled start time
        try {
          const st = new Date(startTime);
          periodLabel = st.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
        } catch { periodLabel = "Scheduled"; }
      } else {
        periodLabel = statusDetail || status;
      }

      const home = c1.homeAway === "home" ? c1 : c2;
      const away = c1.homeAway === "home" ? c2 : c1;
      const homeName = resolveTeamName(home.team?.displayName || home.team?.shortDisplayName || "") || home.team?.abbreviation || "???";
      const awayName = resolveTeamName(away.team?.displayName || away.team?.shortDisplayName || "") || away.team?.abbreviation || "???";

      live.push({
        id: event.id,
        status,
        statusDetail,
        clock,
        period,
        periodLabel,
        startTime,
        broadcast: comp.broadcasts?.[0]?.names?.[0] || "",
        away: { name: awayName, score: parseInt(away.score) || 0, seed: SEEDS[awayName] || "" },
        home: { name: homeName, score: parseInt(home.score) || 0, seed: SEEDS[homeName] || "" },
        winner: (status === "STATUS_FINAL" || status === "STATUS_FINAL_OT") ? (c1.winner ? (resolveTeamName(c1.team?.displayName||"")||c1.team?.abbreviation||"") : (resolveTeamName(c2.team?.displayName||"")||c2.team?.abbreviation||"")) : null
      });
    }

    const order = { STATUS_IN_PROGRESS: 0, STATUS_HALFTIME: 1, STATUS_PREGAME: 2, STATUS_SCHEDULED: 3, STATUS_FINAL: 4, STATUS_FINAL_OT: 4 };
    live.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

    r.json(live);
  } catch (e) {
    console.error("[Live]", e.message);
    r.json([]);
  }
});

async function syncFromESPN() {
  const results = R("results.json", {});
  const gameScores = R("game_scores.json", {});
  const firstFour = R("first_four.json", {});
  let updated = false;

  const dates = [];
  const start = new Date("2026-03-17");
  const end = new Date("2026-04-07");
  const today = new Date();
  for (let d = new Date(start); d <= end && d <= today; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`);
  }

  for (const date of dates) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&dates=${date}&limit=100`;
      const data = await fetchJSON(url);
      if (!data.events) continue;

      for (const event of data.events) {
        if (event.status?.type?.name !== "STATUS_FINAL") continue;
        const competitors = event.competitions?.[0]?.competitors;
        if (!competitors || competitors.length !== 2) continue;
        const winner = competitors.find(c => c.winner === true);
        const loser = competitors.find(c => !c.winner);
        if (!winner || !loser) continue;

        const winnerName = resolveTeamName(winner.team?.displayName || winner.team?.shortDisplayName || "");
        const loserName = resolveTeamName(loser?.team?.displayName || loser?.team?.shortDisplayName || "");
        if (!winnerName) continue;

        const winnerScore = parseInt(winner.score) || 0;
        const loserScore = parseInt(loser.score) || 0;

        // ============================
        // STEP 1: Check First Four FIRST
        // ============================
        let isFirstFourGame = false;
        for (const ffGame of FIRST_FOUR) {
          const t1 = ffGame.teams[0], t2 = ffGame.teams[1];
          if ((winnerName === t1 && loserName === t2) || (winnerName === t2 && loserName === t1)) {
            isFirstFourGame = true;
            if (!firstFour[ffGame.slot]) {
              firstFour[ffGame.slot] = {
                winner: winnerName, loser: loserName,
                winnerScore, loserScore,
                t1, t2,
                t1score: t1 === winnerName ? winnerScore : loserScore,
                t2score: t2 === winnerName ? winnerScore : loserScore
              };
              SEEDS[winnerName] = ffGame.seed;
              updated = true;
              console.log(`[ESPN] First Four: ${winnerName} ${winnerScore}-${loserScore} ${loserName}`);
            }
            break;
          }
        }

        // ============================
        // STEP 2: If First Four game, SKIP main bracket
        // ============================
        if (isFirstFourGame) continue;

        // ============================
        // STEP 3: Check main bracket using RESOLVED names
        // ============================
        const resolvedBracket = getResolvedBracket(firstFour);

        for (const [region, games] of Object.entries(resolvedBracket)) {
          if (!results[region]) results[region] = {};
          if (!gameScores[region]) gameScores[region] = {};

          // R64 — only match if BOTH resolved team names match winner+loser
          for (let i = 0; i < games.length; i++) {
            const [t1, t2] = games[i];
            // Skip unresolved combo slots
            if (t1.includes("/") || t2.includes("/")) continue;

            if ((winnerName === t1 && loserName === t2) || (winnerName === t2 && loserName === t1)) {
              if (!results[region][0]) results[region][0] = {};
              if (!gameScores[region][0]) gameScores[region][0] = {};
              if (!results[region][0][i]) {
                results[region][0][i] = winnerName;
                gameScores[region][0][i] = {
                  t1, t1score: t1 === winnerName ? winnerScore : loserScore,
                  t2, t2score: t2 === winnerName ? winnerScore : loserScore
                };
                updated = true;
                console.log(`[ESPN] R64 ${region}: ${winnerName} ${winnerScore}-${loserScore} ${loserName}`);
              }
            }
          }

          // Later rounds
          for (let rd = 1; rd < 4; rd++) {
            const prevRd = results[region]?.[rd - 1] || {};
            const cnt = 8 / Math.pow(2, rd);
            for (let g = 0; g < cnt; g++) {
              const t1 = prevRd[g * 2], t2 = prevRd[g * 2 + 1];
              if (t1 && t2 && ((winnerName === t1 && loserName === t2) || (winnerName === t2 && loserName === t1))) {
                if (!results[region][rd]) results[region][rd] = {};
                if (!gameScores[region][rd]) gameScores[region][rd] = {};
                if (!results[region][rd][g]) {
                  results[region][rd][g] = winnerName;
                  gameScores[region][rd][g] = {
                    t1, t1score: t1 === winnerName ? winnerScore : loserScore,
                    t2, t2score: t2 === winnerName ? winnerScore : loserScore
                  };
                  updated = true;
                  console.log(`[ESPN] R${rd+1} ${region}: ${winnerName} ${winnerScore}-${loserScore} ${loserName}`);
                }
              }
            }
          }
        }

        // Final Four
        const regionChamps = ["east","south","west","midwest"].map(r => results[r]?.[3]?.[0]);
        if (!results.finalFour) results.finalFour = {};
        if (!gameScores.finalFour) gameScores.finalFour = {};
        // Semi 1
        if (regionChamps[0] && regionChamps[1] && ((winnerName === regionChamps[0] && loserName === regionChamps[1]) || (winnerName === regionChamps[1] && loserName === regionChamps[0]))) {
          if (!results.finalFour[0]) results.finalFour[0] = {};
          if (!gameScores.finalFour[0]) gameScores.finalFour[0] = {};
          if (!results.finalFour[0][0]) {
            results.finalFour[0][0] = winnerName;
            gameScores.finalFour[0][0] = { t1: regionChamps[0], t1score: regionChamps[0]===winnerName?winnerScore:loserScore, t2: regionChamps[1], t2score: regionChamps[1]===winnerName?winnerScore:loserScore };
            updated = true;
          }
        }
        // Semi 2
        if (regionChamps[2] && regionChamps[3] && ((winnerName === regionChamps[2] && loserName === regionChamps[3]) || (winnerName === regionChamps[3] && loserName === regionChamps[2]))) {
          if (!results.finalFour[0]) results.finalFour[0] = {};
          if (!gameScores.finalFour[0]) gameScores.finalFour[0] = {};
          if (!results.finalFour[0][1]) {
            results.finalFour[0][1] = winnerName;
            gameScores.finalFour[0][1] = { t1: regionChamps[2], t1score: regionChamps[2]===winnerName?winnerScore:loserScore, t2: regionChamps[3], t2score: regionChamps[3]===winnerName?winnerScore:loserScore };
            updated = true;
          }
        }
        // Championship
        const semi1 = results.finalFour?.[0]?.[0], semi2 = results.finalFour?.[0]?.[1];
        if (semi1 && semi2 && ((winnerName === semi1 && loserName === semi2) || (winnerName === semi2 && loserName === semi1))) {
          if (!results.finalFour[1]) results.finalFour[1] = {};
          if (!gameScores.finalFour[1]) gameScores.finalFour[1] = {};
          if (!results.finalFour[1][0]) {
            results.finalFour[1][0] = winnerName;
            gameScores.finalFour[1][0] = { t1: semi1, t1score: semi1===winnerName?winnerScore:loserScore, t2: semi2, t2score: semi2===winnerName?winnerScore:loserScore };
            updated = true;
          }
        }
      }
    } catch (e) {
      console.error(`[ESPN] Error ${date}:`, e.message);
    }
  }

  if (updated) {
    W("results.json", results);
    W("game_scores.json", gameScores);
    W("first_four.json", firstFour);
  }
  return { updated };
}

app.get("/api/sync", async (q, r) => {
  try { r.json({ ok: true, updated: (await syncFromESPN()).updated }); }
  catch (e) { r.status(500).json({ error: e.message }); }
});

setInterval(async () => {
  const now = new Date();
  if (now >= new Date("2026-03-17") && now <= new Date("2026-04-08")) {
    try { await syncFromESPN(); } catch (e) { console.error("[Auto-sync]", e.message); }
  }
}, 5 * 60 * 1000);

setTimeout(async () => {
  try { await syncFromESPN(); } catch (e) { console.error("[Init sync]", e.message); }
}, 5000);

app.listen(3000, "0.0.0.0", () => console.log("Bracket v3 on :3000"));
