const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const D = "/data";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const R = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return d; } };
const W = (f, d) => { fs.mkdirSync(D, { recursive: true }); fs.writeFileSync(path.join(D, f), JSON.stringify(d, null, 2)); };

// --- Core API ---
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

// --- Game Scores (separate from results/winners) ---
// Format: { "east": { "0": { "0": {"t1":"Duke","t1score":78,"t2":"Siena","t2score":65} } } }
app.get("/api/scores", (q, r) => r.json(R("game_scores.json", {})));
app.post("/api/scores", (q, r) => { W("game_scores.json", q.body); r.json({ ok: true }); });

// --- Tiebreaker (combined final score guess per player) ---
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

// --- ESPN Name Map ---
const ESPN_NAME_MAP = {
  "Duke Blue Devils":"Duke","Duke":"Duke","Siena Saints":"Siena","Siena":"Siena",
  "Ohio State Buckeyes":"Ohio State","Ohio St":"Ohio State","Ohio State":"Ohio State",
  "TCU Horned Frogs":"TCU","TCU":"TCU",
  "St. John's Red Storm":"St. John's","St. John's (NY)":"St. John's","St. John's":"St. John's",
  "Northern Iowa Panthers":"Northern Iowa","N Iowa":"Northern Iowa","Northern Iowa":"Northern Iowa","UNI":"Northern Iowa",
  "Kansas Jayhawks":"Kansas","Kansas":"Kansas",
  "Cal Baptist Lancers":"Cal Baptist","Cal Baptist":"Cal Baptist","California Baptist":"Cal Baptist",
  "Louisville Cardinals":"Louisville","Louisville":"Louisville",
  "South Florida Bulls":"South Florida","USF":"South Florida","South Florida":"South Florida",
  "Michigan State Spartans":"Michigan State","Michigan St":"Michigan State","Michigan State":"Michigan State",
  "North Dakota State Bison":"North Dakota St.","N Dakota St":"North Dakota St.","NDSU":"North Dakota St.","North Dakota St.":"North Dakota St.",
  "UCLA Bruins":"UCLA","UCLA":"UCLA","UCF Knights":"UCF","UCF":"UCF",
  "UConn Huskies":"UConn","Connecticut":"UConn","UConn":"UConn",
  "Furman Paladins":"Furman","Furman":"Furman",
  "Florida Gators":"Florida","Florida":"Florida",
  "Prairie View A&M Panthers":"PV A&M/Lehigh","Prairie View":"PV A&M/Lehigh","Lehigh":"PV A&M/Lehigh","Lehigh Mountain Hawks":"PV A&M/Lehigh",
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
  "Texas Longhorns":"Texas/NC State","NC State Wolfpack":"Texas/NC State","NC State":"Texas/NC State","Texas":"Texas/NC State",
  "Gonzaga Bulldogs":"Gonzaga","Gonzaga":"Gonzaga",
  "Kennesaw State Owls":"Kennesaw State","Kennesaw St":"Kennesaw State","Kennesaw State":"Kennesaw State",
  "Miami Hurricanes":"Miami FL","Miami (FL)":"Miami FL","Miami FL":"Miami FL",
  "Missouri Tigers":"Missouri","Missouri":"Missouri","Purdue Boilermakers":"Purdue","Purdue":"Purdue",
  "Queens Royals":"Queens","Queens (NC)":"Queens","Queens":"Queens",
  "Michigan Wolverines":"Michigan","Michigan":"Michigan",
  "UMBC Retrievers":"UMBC/Howard","Howard Bison":"UMBC/Howard","UMBC":"UMBC/Howard","Howard":"UMBC/Howard",
  "Georgia Bulldogs":"Georgia","Georgia":"Georgia",
  "Saint Louis Billikens":"Saint Louis","St. Louis":"Saint Louis","Saint Louis":"Saint Louis",
  "Texas Tech Red Raiders":"Texas Tech","Texas Tech":"Texas Tech","Akron Zips":"Akron","Akron":"Akron",
  "Alabama Crimson Tide":"Alabama","Alabama":"Alabama","Hofstra Pride":"Hofstra","Hofstra":"Hofstra",
  "Tennessee Volunteers":"Tennessee","Tennessee":"Tennessee",
  "Miami (OH) RedHawks":"Miami OH/SMU","Miami (OH)":"Miami OH/SMU","SMU Mustangs":"Miami OH/SMU","SMU":"Miami OH/SMU",
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

// Seed map: team name -> seed number
const SEEDS = {};
for (const [rk, reg] of Object.entries(BRACKET)) {
  for (const [t1, t2] of reg) {
    // Seeds are embedded in REGIONS data; we need to derive from the bracket
  }
}
// Actually build seed map from the full region data
const REGION_DATA = {
  east:[[1,"Duke",16,"Siena"],[8,"Ohio State",9,"TCU"],[5,"St. John's",12,"Northern Iowa"],[4,"Kansas",13,"Cal Baptist"],[6,"Louisville",11,"South Florida"],[3,"Michigan State",14,"North Dakota St."],[7,"UCLA",10,"UCF"],[2,"UConn",15,"Furman"]],
  south:[[1,"Florida",16,"PV A&M/Lehigh"],[8,"Clemson",9,"Iowa"],[5,"Vanderbilt",12,"McNeese"],[4,"Nebraska",13,"Troy"],[6,"North Carolina",11,"VCU"],[3,"Illinois",14,"Penn"],[7,"Saint Mary's",10,"Texas A&M"],[2,"Houston",15,"Idaho"]],
  west:[[1,"Arizona",16,"LIU"],[8,"Villanova",9,"Utah State"],[5,"Wisconsin",12,"High Point"],[4,"Arkansas",13,"Hawaii"],[6,"BYU",11,"Texas/NC State"],[3,"Gonzaga",14,"Kennesaw State"],[7,"Miami FL",10,"Missouri"],[2,"Purdue",15,"Queens"]],
  midwest:[[1,"Michigan",16,"UMBC/Howard"],[8,"Georgia",9,"Saint Louis"],[5,"Texas Tech",12,"Akron"],[4,"Alabama",13,"Hofstra"],[6,"Tennessee",11,"Miami OH/SMU"],[3,"Virginia",14,"Wright State"],[7,"Kentucky",10,"Santa Clara"],[2,"Iowa State",15,"Tennessee State"]]
};
for (const games of Object.values(REGION_DATA)) {
  for (const [s1, t1, s2, t2] of games) {
    SEEDS[t1] = s1;
    SEEDS[t2] = s2;
  }
}

// Serve seed map to frontend
app.get("/api/seeds", (q, r) => r.json(SEEDS));

function resolveTeamName(espnName) {
  if (ESPN_NAME_MAP[espnName]) return ESPN_NAME_MAP[espnName];
  const lower = espnName.toLowerCase();
  for (const [key, val] of Object.entries(ESPN_NAME_MAP)) {
    if (key.toLowerCase() === lower) return val;
  }
  const firstWord = espnName.split(" ")[0];
  if (ESPN_NAME_MAP[firstWord]) return ESPN_NAME_MAP[firstWord];
  return null;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "BracketApp/2.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

async function syncFromESPN() {
  const results = R("results.json", {});
  const gameScores = R("game_scores.json", {});
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

        // Place result in bracket
        for (const [region, games] of Object.entries(BRACKET)) {
          if (!results[region]) results[region] = {};
          if (!gameScores[region]) gameScores[region] = {};

          // R64
          for (let i = 0; i < games.length; i++) {
            const [t1, t2] = games[i];
            if ((winnerName === t1 || winnerName === t2) && (loserName === t1 || loserName === t2)) {
              if (!results[region][0]) results[region][0] = {};
              if (!gameScores[region][0]) gameScores[region][0] = {};
              if (!results[region][0][i]) {
                results[region][0][i] = winnerName;
                gameScores[region][0][i] = {
                  t1: t1, t1score: t1 === winnerName ? winnerScore : loserScore,
                  t2: t2, t2score: t2 === winnerName ? winnerScore : loserScore
                };
                updated = true;
                console.log(`[ESPN] R64 ${region}: ${winnerName} ${winnerScore}-${loserScore} ${loserName}`);
              }
            }
          }

          // Later rounds
          for (let rd = 1; rd < 4; rd++) {
            const prevRd = results[region]?.[rd - 1] || {};
            const gamesInRound = 8 / Math.pow(2, rd);
            for (let g = 0; g < gamesInRound; g++) {
              const t1 = prevRd[g * 2], t2 = prevRd[g * 2 + 1];
              if (t1 && t2 && ((winnerName === t1 && loserName === t2) || (winnerName === t2 && loserName === t1))) {
                if (!results[region][rd]) results[region][rd] = {};
                if (!gameScores[region][rd]) gameScores[region][rd] = {};
                if (!results[region][rd][g]) {
                  results[region][rd][g] = winnerName;
                  gameScores[region][rd][g] = {
                    t1: t1, t1score: t1 === winnerName ? winnerScore : loserScore,
                    t2: t2, t2score: t2 === winnerName ? winnerScore : loserScore
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

        // Semi 1: East vs South
        if (regionChamps[0] && regionChamps[1]) {
          if ((winnerName === regionChamps[0] && loserName === regionChamps[1]) || (winnerName === regionChamps[1] && loserName === regionChamps[0])) {
            if (!results.finalFour[0]) results.finalFour[0] = {};
            if (!gameScores.finalFour[0]) gameScores.finalFour[0] = {};
            if (!results.finalFour[0][0]) {
              results.finalFour[0][0] = winnerName;
              gameScores.finalFour[0][0] = { t1: regionChamps[0], t1score: regionChamps[0]===winnerName?winnerScore:loserScore, t2: regionChamps[1], t2score: regionChamps[1]===winnerName?winnerScore:loserScore };
              updated = true;
            }
          }
        }
        // Semi 2: West vs Midwest
        if (regionChamps[2] && regionChamps[3]) {
          if ((winnerName === regionChamps[2] && loserName === regionChamps[3]) || (winnerName === regionChamps[3] && loserName === regionChamps[2])) {
            if (!results.finalFour[0]) results.finalFour[0] = {};
            if (!gameScores.finalFour[0]) gameScores.finalFour[0] = {};
            if (!results.finalFour[0][1]) {
              results.finalFour[0][1] = winnerName;
              gameScores.finalFour[0][1] = { t1: regionChamps[2], t1score: regionChamps[2]===winnerName?winnerScore:loserScore, t2: regionChamps[3], t2score: regionChamps[3]===winnerName?winnerScore:loserScore };
              updated = true;
            }
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
      console.error(`[ESPN] Error fetching ${date}:`, e.message);
    }
  }

  if (updated) {
    W("results.json", results);
    W("game_scores.json", gameScores);
    console.log("[ESPN] Results and scores updated.");
  }
  return { updated, results };
}

app.get("/api/sync", async (q, r) => {
  try { const result = await syncFromESPN(); r.json({ ok: true, updated: result.updated }); }
  catch (e) { r.status(500).json({ error: e.message }); }
});

// Auto-sync every 5 min during tournament
setInterval(async () => {
  const now = new Date();
  if (now >= new Date("2026-03-17") && now <= new Date("2026-04-08")) {
    try { await syncFromESPN(); } catch (e) { console.error("[Auto-sync]", e.message); }
  }
}, 5 * 60 * 1000);

// Initial sync
setTimeout(async () => {
  try { await syncFromESPN(); } catch (e) { console.error("[Init sync]", e.message); }
}, 5000);

app.listen(3000, "0.0.0.0", () => console.log("Bracket app v2 on port 3000"));
