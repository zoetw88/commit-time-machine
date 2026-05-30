#!/usr/bin/env node
// Commit Time Machine — analyze your GitHub commit patterns for fun stats.
// Uses `gh` CLI (already authenticated) to fetch repos + commits.
import { execSync } from 'node:child_process';

const USER = process.argv[2] || 'zoetw88';
const MAX_COMMITS_PER_REPO = 500;

function gh(path) {
  try {
    return JSON.parse(execSync(`gh api "${path}" --paginate`, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 }));
  } catch (e) {
    // --paginate may fail on concatenated arrays; fallback to single page
    console.warn(`  ⚠ paginate failed for ${path.split('?')[0]}, falling back to first page only`);
    return JSON.parse(execSync(`gh api "${path}"`, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 }));
  }
}

console.log(`\n🕰️  Commit Time Machine — analyzing @${USER}\n`);

// 1. Get all repos (including private since gh is authenticated)
const repos = JSON.parse(
  execSync(`gh repo list ${USER} --limit 100 --json name,isPrivate,createdAt,pushedAt,primaryLanguage`, {
    encoding: 'utf-8',
  })
);

console.log(`Found ${repos.length} repos. Scanning commits...`);

const allCommits = [];

for (const repo of repos) {
  try {
    const commits = gh(`/repos/${USER}/${repo.name}/commits?author=${USER}&per_page=100`);
    if (!Array.isArray(commits)) continue;
    const slice = commits.slice(0, MAX_COMMITS_PER_REPO);
    for (const c of slice) {
      if (!c.commit?.author?.date) continue;
      allCommits.push({
        repo: repo.name,
        isPrivate: repo.isPrivate,
        date: new Date(c.commit.author.date),
        message: c.commit.message,
        sha: c.sha?.slice(0, 7) || '',
      });
    }
    process.stdout.write('.');
  } catch (e) {
    process.stdout.write('x');
  }
}
console.log(`\nTotal: ${allCommits.length} commits\n`);

if (allCommits.length === 0) {
  console.log('No commits found. Maybe set $GH_TOKEN or run `gh auth login`.');
  process.exit(1);
}

// ---- ANALYSIS ----

// Hour distribution
const hourCount = Array(24).fill(0);
for (const c of allCommits) hourCount[c.date.getUTCHours()]++;

const lateNight = hourCount.slice(0, 6).reduce((a, b) => a + b, 0);
const morning = hourCount.slice(6, 12).reduce((a, b) => a + b, 0);
const afternoon = hourCount.slice(12, 18).reduce((a, b) => a + b, 0);
const evening = hourCount.slice(18, 24).reduce((a, b) => a + b, 0);
const totalH = lateNight + morning + afternoon + evening;
const peakHour = hourCount.indexOf(Math.max(...hourCount));

// Day of week
const dayCount = Array(7).fill(0);
for (const c of allCommits) dayCount[c.date.getUTCDay()]++;
const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
const peakDay = dayCount.indexOf(Math.max(...dayCount));
const minDay = dayCount.indexOf(Math.min(...dayCount));

// Commit message prefix
const prefixes = {};
const prefixRegex = /^(feat|fix|chore|refactor|docs|test|style|perf|build|ci|revert|wip):/i;
for (const c of allCommits) {
  const m = c.message.match(prefixRegex);
  if (m) {
    const p = m[1].toLowerCase();
    prefixes[p] = (prefixes[p] || 0) + 1;
  }
}
const topPrefixes = Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 5);

// First and last commit
const sorted = [...allCommits].sort((a, b) => a.date - b.date);
const first = sorted[0];
const last = sorted[sorted.length - 1];
const daysCoded = Math.round((last.date - first.date) / (1000 * 60 * 60 * 24));

// Repos by commit count
const repoCount = {};
for (const c of allCommits) repoCount[c.repo] = (repoCount[c.repo] || 0) + 1;
const topRepos = Object.entries(repoCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

// Longest commit streak (consecutive days)
const uniqueDays = new Set();
for (const c of allCommits) uniqueDays.add(c.date.toISOString().slice(0, 10));
const sortedDays = [...uniqueDays].sort();
let longestStreak = 1, currentStreak = 1;
let streakEnd = sortedDays[0];
for (let i = 1; i < sortedDays.length; i++) {
  const prev = new Date(sortedDays[i - 1]);
  const curr = new Date(sortedDays[i]);
  const diff = (curr - prev) / (1000 * 60 * 60 * 24);
  if (Math.round(diff) === 1) {
    currentStreak++;
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
      streakEnd = sortedDays[i];
    }
  } else {
    currentStreak = 1;
  }
}

// Latest 3 a.m. commits
const lateNightCommits = allCommits
  .filter(c => c.date.getUTCHours() >= 0 && c.date.getUTCHours() < 6)
  .sort((a, b) => b.date - a.date)
  .slice(0, 3);

// Most common message words (sanity: long words only)
const wordCount = {};
const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'into', 'when', 'where', 'what', 'will', 'been', 'were', 'and', 'for', 'the']);
for (const c of allCommits) {
  const words = c.message.toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const w of words) {
    if (stopWords.has(w)) continue;
    wordCount[w] = (wordCount[w] || 0) + 1;
  }
}
const topWords = Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

// ---- REPORT ----

const bar = (n, max, width = 30) => '█'.repeat(Math.round((n / max) * width)).padEnd(width, '░');
const pct = (n, total) => total ? `${((n / total) * 100).toFixed(1)}%` : '0%';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  @${USER}'s Coding Pattern Analysis`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`📊 OVERALL`);
console.log(`   Total commits:     ${allCommits.length}`);
console.log(`   Repos touched:     ${Object.keys(repoCount).length}`);
console.log(`   Coding span:       ${daysCoded} days (${(daysCoded / 365).toFixed(1)} years)`);
console.log(`   First commit:      ${first.date.toISOString().slice(0, 10)} · ${first.repo}`);
console.log(`   Latest commit:     ${last.date.toISOString().slice(0, 10)} · ${last.repo}\n`);

console.log(`🕰️  WHEN DO YOU CODE? (UTC)`);
console.log(`   🌙 Late night  (00-06):  ${bar(lateNight, Math.max(...hourCount, 1) * 6)} ${lateNight} (${pct(lateNight, totalH)})`);
console.log(`   🌅 Morning     (06-12):  ${bar(morning,   Math.max(...hourCount, 1) * 6)} ${morning} (${pct(morning, totalH)})`);
console.log(`   ☀️  Afternoon   (12-18):  ${bar(afternoon, Math.max(...hourCount, 1) * 6)} ${afternoon} (${pct(afternoon, totalH)})`);
console.log(`   🌃 Evening     (18-24):  ${bar(evening,   Math.max(...hourCount, 1) * 6)} ${evening} (${pct(evening, totalH)})`);
console.log(`   ⏰ Peak hour:  ${String(peakHour).padStart(2, '0')}:00\n`);

console.log(`📅 WHICH DAY?`);
const maxDay = Math.max(...dayCount);
for (let i = 0; i < 7; i++) {
  console.log(`   ${dayNames[i]}  ${bar(dayCount[i], maxDay, 25)} ${dayCount[i]}`);
}
console.log(`   📈 Peak day:   星期${dayNames[peakDay]}`);
console.log(`   📉 Slowest:    星期${dayNames[minDay]}\n`);

console.log(`🔥 LONGEST STREAK`);
console.log(`   ${longestStreak} consecutive days (ended ${streakEnd})\n`);

console.log(`🏆 TOP REPOS`);
const maxRepo = topRepos[0]?.[1] || 1;
for (const [name, n] of topRepos) {
  console.log(`   ${bar(n, maxRepo, 20)} ${n}  ${name}`);
}
console.log('');

console.log(`🎯 COMMIT MESSAGE PREFIXES`);
if (topPrefixes.length === 0) {
  console.log(`   (none detected — you might not use conventional commits)`);
} else {
  const totalPrefixed = topPrefixes.reduce((a, [, n]) => a + n, 0);
  for (const [prefix, n] of topPrefixes) {
    console.log(`   ${prefix.padEnd(10)} ${bar(n, topPrefixes[0][1], 20)} ${n} (${pct(n, totalPrefixed)})`);
  }
}
console.log('');

if (lateNightCommits.length > 0) {
  console.log(`🌙 MOST RECENT 3 A.M. ENERGY`);
  for (const c of lateNightCommits) {
    const t = c.date.toISOString().slice(0, 16).replace('T', ' ');
    const msg = c.message.split('\n')[0].slice(0, 50);
    console.log(`   ${t}  "${msg}"`);
  }
  console.log('');
}

console.log(`💬 YOUR FAVORITE COMMIT MESSAGE WORDS`);
console.log(`   ${topWords.map(([w, n]) => `${w}(${n})`).join('  ')}\n`);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  GAME OVER? No, just one more commit...`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
