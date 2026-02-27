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

// ── Prompt for initials then re-submit to leaderboard ────────────────────────
// Call this after submitScore() returns madeLeaderboard: true.
async function promptInitials(total) {
  // If we already have initials saved, just use them silently
  if (getInitials()) {
    const pid   = getPlayerID();
    const today = todayKey();
    await checkLeaderboard(today, pid, total, getInitials());
    return getInitials();
  }

  // Otherwise show a simple overlay prompt
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.85);
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; z-index:9999;
      font-family:'Press Start 2P',monospace; color:#f5c842;
    `;
    overlay.innerHTML = `
      <div style="font-size:11px; letter-spacing:4px; margin-bottom:16px;">
        YOU MADE THE LEADERBOARD!
      </div>
      <div style="font-size:9px; color:#aaa; letter-spacing:2px; margin-bottom:20px;">
        ENTER YOUR 3 INITIALS
      </div>
      <input id="ini-input" maxlength="3"
        style="background:#111; border:2px solid #f5c842; color:#f5c842;
               font-family:'Press Start 2P',monospace; font-size:18px;
               text-align:center; width:80px; letter-spacing:8px;
               padding:8px; text-transform:uppercase; outline:none;"
        autocomplete="off" autocorrect="off" autocapitalize="characters"
      />
      <button id="ini-ok"
        style="margin-top:20px; padding:10px 28px;
               background:#111; border:2px solid #f5c842; color:#f5c842;
               font-family:'Press Start 2P',monospace; font-size:9px;
               letter-spacing:3px; cursor:pointer;">
        CONFIRM
      </button>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#ini-input');
    const btn   = overlay.querySelector('#ini-ok');
    input.focus();

    async function confirm() {
      const ini = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, 3);
      if (ini.length < 1) return;
      saveInitials(ini);
      // Update leaderboard entry with real initials
      const pid   = getPlayerID();
      const today = todayKey();
      await checkLeaderboard(today, pid, total, ini);
      overlay.remove();
      resolve(ini);
    }

    btn.addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  });
}

// ── Show end-of-game score screen with leaderboard ───────────────────────────
// Call this at the end of any game.
// gameId:   e.g. 'homerun-pitch'
// score:    the player's score this session
// onClose:  optional callback when they dismiss
async function showScoreScreen(gameId, score, onClose) {
  const result = await submitScore(gameId, score);

  if (result.madeLeaderboard) {
    await promptInitials(result.newTotal);
  }

  const board = await fetchLeaderboard();
  const pid   = getPlayerID();

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.92);
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; z-index:9998; padding:20px;
    font-family:'Press Start 2P',monospace;
  `;

  const isNewHigh = result.updated;
  const rows = board.map((e, i) => {
    const isMe = e.pid === pid;
    const col  = isMe ? '#f5c842' : '#aaa';
    const marker = isMe ? '>' : ' ';
    const ini = (e.initials || '???').padEnd(3,' ');
    const pts = String(e.total).padStart(6,'0');
    return `<div style="color:${col}; font-size:9px; letter-spacing:2px;
                         margin:4px 0; font-family:'Press Start 2P',monospace;">
              ${marker} ${String(i+1).padStart(2,'0')}. ${ini}  ${pts}
            </div>`;
  }).join('');

  overlay.innerHTML = `
    <div style="color:#f5c842; font-size:10px; letter-spacing:4px; margin-bottom:4px;">
      ${isNewHigh ? 'NEW DAILY HIGH!' : 'GAME OVER'}
    </div>
    <div style="color:#888; font-size:8px; letter-spacing:2px; margin-bottom:20px;">
      SCORE: ${String(score).padStart(6,'0')}
    </div>
    <div style="color:#f5c842; font-size:9px; letter-spacing:3px; margin-bottom:12px;">
      TODAY'S TOP 10
    </div>
    <div style="min-width:220px; margin-bottom:20px;">
      ${rows || '<div style="color:#555;font-size:8px;letter-spacing:2px;">NO SCORES YET</div>'}
    </div>
    <button id="score-close"
      style="padding:10px 28px; background:#111; border:2px solid #f5c842;
             color:#f5c842; font-family:\'Press Start 2P\',monospace;
             font-size:9px; letter-spacing:3px; cursor:pointer;">
      BACK TO HUB
    </button>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#score-close').addEventListener('click', () => {
    overlay.remove();
    if (onClose) onClose();
    else window.location.href = '/';
  });
}
