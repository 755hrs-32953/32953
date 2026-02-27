// =============================================================================
// scores.js  —  shared Firebase score library for 32953.com
// Include this on every game page AND the hub page.
//
// Usage in a game, when the game ends:
//   submitScore('homerun-pitch', 4200);
//
// On the hub page it is loaded automatically — no extra calls needed.
// =============================================================================

// ── Firebase config ───────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBvyyPH2ERG9J09Os7Pb24PGrvLUPDUTHM",
  authDomain:        "project-895722977771904400.firebaseapp.com",
  databaseURL:       "https://project-895722977771904400-default-rtdb.firebaseio.com",
  projectId:         "project-895722977771904400",
  storageBucket:     "project-895722977771904400.firebasestorage.app",
  messagingSenderId: "930918116651",
  appId:             "1:930918116651:web:5b556780afa4a743bc296e"
};

// ── Game ID list (must match url filenames without .html) ─────────────────────
const GAME_IDS = [
  'lunar-lander',
  'stone-cold',
  'fairway',
  'downtown',
  'splash',
  'homerun-pitch',
  'asteroid-run',
  'jungle-run',
  'dogfight',
  'gold-rush'
];

// ── Boot Firebase (CDN compat build — no npm needed) ──────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const DB = firebase.database();

// ── Player identity ───────────────────────────────────────────────────────────
// Random ID generated once per browser, persisted in localStorage.
// Same device + browser = same player across sessions.
function getPlayerID() {
  let id = localStorage.getItem('32953_pid');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('32953_pid', id);
  }
  return id;
}

function getInitials() {
  return localStorage.getItem('32953_initials') || null;
}

function saveInitials(ini) {
  localStorage.setItem('32953_initials', ini.toUpperCase().slice(0, 3));
}

// ── Date key (UTC so midnight is consistent worldwide) ────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-02-27"
}

// ── Read today's scores for this player ───────────────────────────────────────
// Returns an object like { 'homerun-pitch': 4200, 'fairway': 1800, ... }
async function loadMyScores() {
  const snap = await DB.ref(`scores/${todayKey()}/players/${getPlayerID()}/games`).once('value');
  return snap.val() || {};
}

// ── Submit a score for one game ───────────────────────────────────────────────
// Only updates if it is a new daily high for that game.
// Returns { updated: bool, newTotal: number, madeLeaderboard: bool }
async function submitScore(gameId, newScore) {
  const pid   = getPlayerID();
  const today = todayKey();
  const playerRef = DB.ref(`scores/${today}/players/${pid}`);

  const snap = await playerRef.once('value');
  const data = snap.val() || { games: {}, total: 0, initials: getInitials() };
  if (!data.games) data.games = {};

  const oldScore = data.games[gameId] || 0;

  // Only update if this is a new daily high for this game
  if (newScore <= oldScore) {
    return { updated: false, newTotal: data.total || 0, madeLeaderboard: false };
  }

  data.games[gameId] = newScore;

  // Recalculate total (only active/submitted games count)
  data.total = Object.values(data.games).reduce((a, b) => a + b, 0);
  data.lastUpdated = Date.now();

  await playerRef.set(data);

  const madeLeaderboard = await checkLeaderboard(today, pid, data.total, data.initials);
  return { updated: true, newTotal: data.total, madeLeaderboard };
}

// ── Check and update leaderboard ──────────────────────────────────────────────
async function checkLeaderboard(today, pid, total, initials) {
  const lbRef  = DB.ref(`scores/${today}/leaderboard`);
  const snap   = await lbRef.once('value');
  let   board  = snap.val() || [];
  if (!Array.isArray(board)) board = Object.values(board);

  // Remove any existing entry for this player
  board = board.filter(e => e.pid !== pid);

  // Add updated entry
  board.push({ pid, initials: initials || '???', total });

  // Sort descending, keep top 10
  board.sort((a, b) => b.total - a.total);
  const top10 = board.slice(0, 10);

  await lbRef.set(top10);

  // Did this player make the top 10?
  return top10.some(e => e.pid === pid);
}

// ── Fetch today's top-10 leaderboard ─────────────────────────────────────────
async function fetchLeaderboard() {
  const snap = await DB.ref(`scores/${todayKey()}/leaderboard`).once('value');
  const val  = snap.val() || [];
  return Array.isArray(val) ? val : Object.values(val);
}

// ── Initials prompt overlay ───────────────────────────────────────────────────
// Shown only when a player cracks the top 10 for the first time.
function promptInitialsOverlay(total) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.88);
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;z-index:9999;
      font-family:'Press Start 2P',monospace;
    `;
    overlay.innerHTML = `
      <div style="color:#ffff54;font-size:clamp(8px,3vw,11px);letter-spacing:3px;
                  margin-bottom:10px;text-align:center;padding:0 16px;">
        YOU MADE THE<br>LEADERBOARD!
      </div>
      <div style="color:#b8a8ff;font-size:clamp(5px,2vw,7px);letter-spacing:2px;
                  margin-bottom:16px;">
        ENTER YOUR 3 INITIALS
      </div>
      <input id="_ini_input" maxlength="3" autocomplete="off"
        autocorrect="off" autocapitalize="characters" spellcheck="false"
        style="background:#111;border:2px solid #ffff54;color:#ffff54;
               font-family:'Press Start 2P',monospace;font-size:clamp(16px,5vw,22px);
               text-align:center;width:90px;letter-spacing:10px;
               padding:8px;text-transform:uppercase;outline:none;"/>
      <button id="_ini_ok"
        style="margin-top:16px;padding:10px 28px;background:#111;
               border:2px solid #ffff54;color:#ffff54;cursor:pointer;
               font-family:'Press Start 2P',monospace;font-size:clamp(7px,2.5vw,9px);
               letter-spacing:3px;">
        CONFIRM
      </button>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#_ini_input');
    const btn   = overlay.querySelector('#_ini_ok');
    input.focus();
    async function confirm() {
      const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);
      if (!v.length) return;
      saveInitials(v);
      // Update leaderboard entry with real initials
      const pid = getPlayerID();
      await checkLeaderboard(todayKey(), pid, total, v);
      overlay.remove();
      resolve(v);
    }
    btn.addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  });
}

// ── Submit score from a game page ─────────────────────────────────────────────
// Silently submits. If the player cracks the top 10 and has no initials yet,
// prompts for them on the spot.
async function showScoreScreen(gameId, score) {
  try {
    const result = await submitScore(gameId, score);
    if (result.madeLeaderboard && !getInitials()) {
      await promptInitialsOverlay(result.newTotal);
    }
  } catch(e) {
    console.warn('Score submit failed:', e);
  }
}
