// Commit Time Machine — pure frontend GitHub commit analyzer.
// Runs entirely in your browser. No server. No build step.

import { analyzeCommits, getNextUrl, DAY_NAMES } from './lib.mjs';

const API = 'https://api.github.com';
const MAX_REPOS = 30;

const $ = (id) => document.getElementById(id);

// ═══════════════════════════════════════════════
// SOUND ENGINE (Web Audio API — no external files)
// ═══════════════════════════════════════════════
let audioCtx = null;
let soundEnabled = loadSoundPref();

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function loadSoundPref() {
  try { return localStorage.getItem('ctm_sound') !== 'off'; } catch { return true; }
}
function saveSoundPref(val) {
  try { localStorage.setItem('ctm_sound', val ? 'on' : 'off'); } catch {}
}

function playTone(freq, type, duration, volume, delay) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + (delay || 0));
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime + (delay || 0));
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (delay || 0) + duration);
    osc.start(ctx.currentTime + (delay || 0));
    osc.stop(ctx.currentTime + (delay || 0) + duration + 0.01);
  } catch (e) { /* audio not available */ }
}

// 8-bit beep on button click
function sfxClick() {
  playTone(880, 'square', 0.05, 0.18);
}

// Coin sound: two-tone arpeggio
function sfxCoin() {
  playTone(523, 'square', 0.07, 0.18, 0);
  playTone(1047, 'square', 0.12, 0.18, 0.08);
}

// Input focus boop
function sfxFocus() {
  playTone(440, 'square', 0.04, 0.1);
}

// Error bwonk
function sfxError() {
  playTone(220, 'square', 0.15, 0.2, 0);
  playTone(180, 'square', 0.2, 0.2, 0.12);
}

// Stage clear fanfare
function sfxStageClear() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => playTone(f, 'square', 0.1, 0.18, i * 0.1));
}

// ═══════════════════════════════════════════════
// SOUND TOGGLE UI
// ═══════════════════════════════════════════════
function updateSoundUI() {
  $('soundLabel').textContent = soundEnabled ? 'ON' : 'OFF';
  $('soundPtr').textContent = soundEnabled ? '▶' : ' ';
  $('soundToggle').setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
}
updateSoundUI();

$('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  saveSoundPref(soundEnabled);
  updateSoundUI();
  if (soundEnabled) sfxClick();
});
$('soundToggle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('soundToggle').click(); }
});

// ═══════════════════════════════════════════════
// OPTION MENU — token panel toggle
// ═══════════════════════════════════════════════
const tokenToggle = $('tokenToggle');
const tokenPanel = $('tokenPanel');
const tokenPtr = $('tokenPtr');

tokenToggle.addEventListener('click', () => {
  sfxClick();
  const open = !tokenPanel.classList.contains('hidden');
  tokenPanel.classList.toggle('hidden', open);
  tokenPtr.textContent = open ? ' ' : '▶';
  tokenToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
});
tokenToggle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tokenToggle.click(); }
});

// ═══════════════════════════════════════════════
// INPUT FOCUS SOUNDS
// ═══════════════════════════════════════════════
$('username').addEventListener('focus', sfxFocus);
$('token').addEventListener('focus', sfxFocus);

// ═══════════════════════════════════════════════
// HUD SCORE DISPLAY
// ═══════════════════════════════════════════════
function padScore(n, len) {
  return String(Math.round(n)).padStart(len || 7, '0');
}

function setHudScore(n) {
  $('hudScore').textContent = padScore(n, 7);
}

// Load hiscore from localStorage
function loadHiscore() {
  try {
    const board = JSON.parse(localStorage.getItem('ctm_hiscores') || '[]');
    if (board.length > 0) {
      $('hudHiscore').textContent = padScore(board[0].pts, 7);
    }
  } catch {}
}
loadHiscore();

// ═══════════════════════════════════════════════
// LOADING SPINNER animation
// ═══════════════════════════════════════════════
const spinFrames = ['◐', '◓', '◑', '◒'];
let spinIdx = 0;
let spinInterval = null;

function startSpinner() {
  spinIdx = 0;
  $('loadingSpinner').textContent = spinFrames[0];
  spinInterval = setInterval(() => {
    spinIdx = (spinIdx + 1) % spinFrames.length;
    $('loadingSpinner').textContent = spinFrames[spinIdx];
  }, 200);
}
function stopSpinner() {
  if (spinInterval) clearInterval(spinInterval);
  spinInterval = null;
}

// ═══════════════════════════════════════════════
// LOADING STAGE LABELS
// ═══════════════════════════════════════════════
const stages = ['WORLD 1-1', 'WORLD 1-2', 'WORLD 2-1', 'WORLD 2-2', 'WORLD 3-1', 'WORLD 3-2', 'FINAL STAGE'];
let stageIdx = 0;
let stageInterval = null;

function startStageRotation() {
  stageIdx = 0;
  $('loadingStage').textContent = stages[0];
  stageInterval = setInterval(() => {
    stageIdx = (stageIdx + 1) % stages.length;
    $('loadingStage').textContent = stages[stageIdx];
  }, 1800);
}
function stopStageRotation() {
  if (stageInterval) clearInterval(stageInterval);
  stageInterval = null;
  $('loadingStage').textContent = '';
}

// ═══════════════════════════════════════════════
// PROGRESS
// ═══════════════════════════════════════════════
function updateProgress(pct, text) {
  $('progressFill').style.width = pct + '%';
  $('progressFill').parentElement.setAttribute('aria-valuenow', pct);
  $('progressText').textContent = text.toUpperCase();
}

// ═══════════════════════════════════════════════
// FORM SUBMIT
// ═══════════════════════════════════════════════
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  sfxClick();

  const username = $('username').value.trim();
  const token = $('token').value.trim();
  if (!username) return;

  $('error').textContent = '';
  $('analyzeBtn').disabled = true;
  $('analyzeBtn').textContent = '⏳ LOADING...';
  $('progressCard').classList.remove('hidden');
  $('results').classList.add('hidden');

  startSpinner();
  startStageRotation();

  try {
    const data = await analyze(username, token, updateProgress);
    stopSpinner();
    stopStageRotation();
    $('progressCard').classList.add('hidden');
    renderResults(username, data);
    $('results').classList.remove('hidden');
    $('formCard').classList.add('hidden');

    // Stage clear
    sfxStageClear();
    const banner = $('stageClear');
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 2500);

    // HUD score
    setHudScore(data.totalCommits);
  } catch (err) {
    stopSpinner();
    stopStageRotation();
    sfxError();
    $('error').textContent = err.message;
    $('progressCard').classList.add('hidden');
  } finally {
    $('analyzeBtn').disabled = false;
    $('analyzeBtn').textContent = '▶ START GAME';
  }
});

// ═══════════════════════════════════════════════
// RESET
// ═══════════════════════════════════════════════
$('resetBtn')?.addEventListener('click', () => {
  sfxClick();
  $('results').classList.add('hidden');
  $('formCard').classList.remove('hidden');
  $('username').value = '';
  $('username').focus();
  setHudScore(0);
});

// ═══════════════════════════════════════════════
// COPY
// ═══════════════════════════════════════════════
$('copyBtn')?.addEventListener('click', () => {
  sfxCoin();
  const text = $('storyLine').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = $('copyBtn');
    const orig = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
});

// ═══════════════════════════════════════════════
// HI-SCORE BOARD
// ═══════════════════════════════════════════════
$('saveHiscore')?.addEventListener('click', () => {
  sfxCoin();
  const name = ($('hiscoreName').value || 'PLAYER').toUpperCase().replace(/[^A-Z0-9 _]/g, '').slice(0, 8) || 'PLAYER';
  const pts = parseInt($('hudScore').textContent) || 0;
  if (!pts) return;
  try {
    const board = JSON.parse(localStorage.getItem('ctm_hiscores') || '[]');
    board.push({ name, pts });
    board.sort((a, b) => b.pts - a.pts);
    const top5 = board.slice(0, 5);
    localStorage.setItem('ctm_hiscores', JSON.stringify(top5));
    renderHiscoreBoard(top5);
    $('hudHiscore').textContent = padScore(top5[0].pts, 7);
  } catch {}
});

function renderHiscoreBoard(board) {
  if (!board || !board.length) {
    $('hiscoreBoard').innerHTML = '';
    return;
  }
  $('hiscoreBoard').innerHTML = board.map((entry, i) => `
    <div class="hiscore-row">
      <span class="hiscore-rank">${i + 1}.</span>
      <span class="hiscore-name">${escapeHTML(entry.name.padEnd(8, '_'))}</span>
      <span class="hiscore-pts">${padScore(entry.pts, 7)}</span>
    </div>
  `).join('');
}

// Load board on start
try {
  const saved = JSON.parse(localStorage.getItem('ctm_hiscores') || '[]');
  if (saved.length) renderHiscoreBoard(saved);
} catch {}

// ═══════════════════════════════════════════════
// KONAMI CODE EASTER EGG
// ═══════════════════════════════════════════════
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === KONAMI[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI.length) {
      konamiIdx = 0;
      triggerKonami();
    }
  } else {
    konamiIdx = e.key === KONAMI[0] ? 1 : 0;
  }
});

function triggerKonami() {
  sfxStageClear();
  playTone(784, 'square', 0.08, 0.18, 0.5);
  playTone(988, 'square', 0.12, 0.18, 0.65);

  // Rain of coins/mushrooms
  const overlay = document.createElement('div');
  overlay.className = 'konami-overlay';
  document.body.appendChild(overlay);

  const symbols = ['🍄', '⭐', '🪙', '❤️', '🌟', '🎮', '👾', '🕹️'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('span');
    el.className = 'konami-coin';
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.top = '-2rem';
    el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    el.style.animationDelay = (Math.random() * 1.2) + 's';
    el.style.fontSize = (1 + Math.random() * 1.5) + 'rem';
    overlay.appendChild(el);
  }

  // Banner
  const banner = document.createElement('div');
  banner.className = 'konami-banner';
  banner.innerHTML = '<p>CHEAT CODE ACTIVATED!</p><p style="font-size:0.7em;margin-top:0.8rem;color:#58F8D8">+30 LIVES</p>';
  document.body.appendChild(banner);

  setTimeout(() => {
    overlay.remove();
    banner.remove();
  }, 4000);
}

// ═══════════════════════════════════════════════
// API FETCH
// ═══════════════════════════════════════════════
async function fetchJSON(path, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { headers });
  if (res.status === 404) throw new Error(`NOT FOUND: ${path}`);
  if (res.status === 403) {
    const remaining = res.headers.get('X-RateLimit-Remaining');
    const reset = res.headers.get('X-RateLimit-Reset');
    if (remaining === '0') {
      const resetDate = new Date(Number(reset) * 1000);
      throw new Error(`RATE LIMIT HIT. RESETS AT ${resetDate.toLocaleTimeString()}. ADD A TOKEN TO RAISE LIMIT.`);
    }
    throw new Error('FORBIDDEN — TOKEN MAY LACK PERMISSIONS.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} FOR ${path}`);
  return { data: await res.json(), linkHeader: res.headers.get('Link') };
}

// Paginated fetch — follows Link headers up to maxPages
async function fetchAllPages(path, token, maxPages = 5) {
  const all = [];
  let url = API + path;
  for (let page = 0; page < maxPages; page++) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    const next = getNextUrl(res.headers.get('Link'));
    if (!next) break;
    url = next;
  }
  return all;
}

// ═══════════════════════════════════════════════
// ANALYZE
// ═══════════════════════════════════════════════
async function analyze(username, token, onProgress) {
  onProgress(5, 'FETCHING PLAYER DATA...');
  await fetchJSON(`/users/${username}`, token);

  onProgress(10, 'SCANNING MAP...');
  const reposResult = await fetchJSON(`/users/${username}/repos?per_page=100&sort=pushed`, token);

  const interesting = reposResult.data
    .filter(r => !r.fork)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, MAX_REPOS);

  if (interesting.length === 0) throw new Error(`@${username} HAS NO PUBLIC REPOS.`);

  const commits = [];
  for (let i = 0; i < interesting.length; i++) {
    const repo = interesting[i];
    const pct = 10 + Math.round((i / interesting.length) * 85);
    onProgress(pct, `SCANNING STAGE ${i + 1}/${interesting.length}: ${repo.name.toUpperCase()}`);
    try {
      const list = await fetchAllPages(
        `/repos/${username}/${repo.name}/commits?author=${username}&per_page=100`,
        token,
        5  // up to 500 commits per repo
      );
      for (const c of list) {
        if (!c.commit?.author?.date) continue;
        commits.push({
          repo: repo.name,
          date: new Date(c.commit.author.date),
          message: c.commit.message,
        });
      }
    } catch (err) {
      // empty repo / no commits as author — skip
    }
  }

  if (commits.length === 0) throw new Error(`NO COMMITS FOUND FOR @${username} IN PUBLIC REPOS.`);

  return analyzeCommits(commits, interesting.length);
}

// ═══════════════════════════════════════════════
// PIXEL BLOCK CHART
// ═══════════════════════════════════════════════
function renderPixelChart(containerId, labelsId, values, peakIdx, labelStrings) {
  const container = $(containerId);
  container.innerHTML = '';
  $(labelsId).innerHTML = '';

  const maxVal = Math.max(...values, 1);
  // 18 rows max — each block = ~5.5% of max
  const MAX_ROWS = 18;

  // Build columns — only create filled blocks (no empty placeholders)
  const cols = values.map((v, i) => {
    const blocks = Math.round((v / maxVal) * MAX_ROWS);
    const col = document.createElement('div');
    col.className = 'pixel-col' + (i === peakIdx ? ' peak' : '');
    col.setAttribute('aria-label', `${labelStrings[i]}: ${v} commits`);
    for (let b = 0; b < blocks; b++) {
      const block = document.createElement('div');
      block.className = 'pixel-block';
      block.dataset.visible = 'true';
      col.appendChild(block);
    }
    container.appendChild(col);
    return col;
  });

  // Labels
  labelStrings.forEach(lbl => {
    const span = document.createElement('span');
    span.textContent = lbl;
    $(labelsId).appendChild(span);
  });

  // Animate blocks appearing in sequence
  const allBlocks = container.querySelectorAll('.pixel-block[data-visible]');
  allBlocks.forEach((block, idx) => {
    setTimeout(() => block.classList.add('visible'), idx * (280 / Math.max(allBlocks.length, 1)));
  });
}

// ═══════════════════════════════════════════════
// RENDER RESULTS
// ═══════════════════════════════════════════════
function renderResults(username, d) {
  // Heading
  $('userTitle').textContent = `PLAYER: @${username}`;

  // Stat counters with leading zeros
  $('totalCommits').textContent = padScore(d.totalCommits, 7);
  $('totalRepos').textContent   = String(d.reposWithCommits).padStart(3, '0');
  $('codingSpan').textContent   = d.yearsCoded.toFixed(1);
  $('longestStreak').textContent = String(d.longestStreak).padStart(3, '0');

  // Hour chart
  const hourLabels = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));
  renderPixelChart('hourChart', 'hourLabels', d.hourCount, d.peakHour, hourLabels);
  $('peakHourCaption').textContent =
    `PEAK HOUR: ${String(d.peakHour).padStart(2, '0')}:00 (UTC). ${d.lateNightPct}% OF COMMITS BETWEEN 00:00–06:00.`;

  // Day chart
  renderPixelChart('dayChart', 'dayLabels', d.dayCount, d.peakDay, DAY_NAMES);
  $('peakDayCaption').textContent =
    `PEAK DAY: ${DAY_NAMES[d.peakDay]}. SLOWEST: ${DAY_NAMES[d.minDay]}.`;

  // Top repos
  const maxRepo = d.topRepos[0]?.[1] || 1;
  $('topRepos').innerHTML = d.topRepos.map(([name, n]) => `
    <li>
      <span class="label">${escapeHTML(name)}</span>
      <span class="bar"><span class="bar-fill" style="width:${(n / maxRepo) * 100}%"></span></span>
      <span class="count">${String(n).padStart(4, '0')}</span>
    </li>
  `).join('');

  // Prefixes
  const maxPrefix = d.topPrefixes[0]?.[1] || 1;
  $('prefixes').innerHTML = d.topPrefixes.length
    ? d.topPrefixes.map(([p, n]) => `
        <li>
          <span class="label">${p}</span>
          <span class="bar"><span class="bar-fill" style="width:${(n / maxPrefix) * 100}%"></span></span>
          <span class="count">${String(n).padStart(4,'0')} (${Math.round((n / d.totalPrefixed) * 100)}%)</span>
        </li>
      `).join('')
    : '<li>NO CONVENTIONAL COMMIT PREFIXES DETECTED — FREEFORM STYLE.</li>';

  // Story
  const style = d.topPrefixes[0]?.[0];
  const styleNarrative = style
    ? (style === 'feat'     ? 'You\'re a <strong>BUILDER</strong> — most commits add new things.'
      : style === 'fix'     ? 'You\'re a <strong>FIXER</strong> — bugs find you, and you find them back.'
      : style === 'chore'   ? 'You\'re a <strong>MAINTAINER</strong> — handling the boring infra nobody else wants.'
      : style === 'refactor'? 'You\'re a <strong>CLEANER</strong> — you can\'t leave bad code alone.'
      : `You favor <strong>${style.toUpperCase()}</strong> commits.`)
    : '';

  const nightOwl = d.lateNight / d.totalCommits;
  const owlNarrative = nightOwl > 0.2 ? 'You\'re a <strong>NIGHT OWL</strong> — over a fifth of your commits land between 00–06.'
    : nightOwl > 0.1 ? 'You sometimes burn the midnight oil, but mostly daytime.'
    : 'You almost never code late at night — future you thanks you.';

  $('storyLine').innerHTML = `
    @${username} has ${d.totalCommits.toLocaleString()} commits across ${d.reposWithCommits} repos
    over <strong>${d.yearsCoded.toFixed(1)} years</strong>.
    Peak coding hour: <strong>${String(d.peakHour).padStart(2,'0')}:00</strong>,
    favorite day: <strong>${DAY_NAMES[d.peakDay]}</strong>.
    Longest streak: <strong>${d.longestStreak} consecutive days</strong>.
    ${styleNarrative} ${owlNarrative}
  `;

  // Pre-fill hiscore name input
  $('hiscoreName').value = username.toUpperCase().slice(0, 8);
  // Show existing board
  try {
    const board = JSON.parse(localStorage.getItem('ctm_hiscores') || '[]');
    renderHiscoreBoard(board);
  } catch {}
}

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
