// Shared pure-logic functions — importable by both app.js and tests.

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Parse GitHub Link header to get next page URL.
 * @param {string|null} linkHeader
 * @returns {string|null}
 */
export function getNextUrl(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * Analyze an array of commit objects and return stats.
 * @param {{ repo: string, date: Date, message: string }[]} commits
 * @param {number} reposScanned
 */
export function analyzeCommits(commits, reposScanned) {
  const hourCount = Array(24).fill(0);
  const dayCount = Array(7).fill(0);
  const repoCount = {};
  const prefixes = {};
  const days = new Set();

  for (const c of commits) {
    hourCount[c.date.getUTCHours()]++;
    dayCount[c.date.getUTCDay()]++;
    repoCount[c.repo] = (repoCount[c.repo] || 0) + 1;
    days.add(c.date.toISOString().slice(0, 10));
    const m = c.message.match(/^(feat|fix|chore|refactor|docs|test|style|perf|build|ci|revert|wip)\b[\(:]/i);
    if (m) {
      const p = m[1].toLowerCase();
      prefixes[p] = (prefixes[p] || 0) + 1;
    }
  }

  const sorted = [...commits].sort((a, b) => a.date - b.date);
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const yearsCoded = Math.max(0.1, (last - first) / (1000 * 60 * 60 * 24 * 365));

  const sortedDays = [...days].sort();
  let longestStreak = 1, currentStreak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const diff = (new Date(sortedDays[i]) - new Date(sortedDays[i - 1])) / (1000 * 60 * 60 * 24);
    if (Math.round(diff) === 1) {
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  const peakHour = hourCount.indexOf(Math.max(...hourCount));
  const peakDay = dayCount.indexOf(Math.max(...dayCount));
  const minDay = dayCount.indexOf(Math.min(...dayCount));
  const lateNight = hourCount.slice(0, 6).reduce((a, b) => a + b, 0);
  const lateNightPct = ((lateNight / commits.length) * 100).toFixed(1);

  const topRepos = Object.entries(repoCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topPrefixes = Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalPrefixed = topPrefixes.reduce((a, [, n]) => a + n, 0);

  return {
    totalCommits: commits.length,
    reposScanned,
    reposWithCommits: Object.keys(repoCount).length,
    yearsCoded,
    first, last,
    hourCount, dayCount,
    peakHour, peakDay, minDay,
    lateNight, lateNightPct,
    longestStreak,
    topRepos,
    topPrefixes,
    totalPrefixed,
  };
}

export { DAY_NAMES };
