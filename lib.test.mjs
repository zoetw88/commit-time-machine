import { describe, it, expect } from 'vitest';
import { analyzeCommits, getNextUrl } from './lib.mjs';

// ── helpers ──────────────────────────────────────
function makeCommit(repo, isoDate, message = 'chore: update') {
  return { repo, date: new Date(isoDate), message };
}

function makeCommits(dates) {
  return dates.map((d, i) => makeCommit('repo-a', d, `feat: thing ${i}`));
}

// ── getNextUrl ───────────────────────────────────
describe('getNextUrl', () => {
  it('returns null for null/empty header', () => {
    expect(getNextUrl(null)).toBeNull();
    expect(getNextUrl('')).toBeNull();
  });

  it('extracts next URL from Link header', () => {
    const header =
      '<https://api.github.com/repos/u/r/commits?page=2>; rel="next", ' +
      '<https://api.github.com/repos/u/r/commits?page=5>; rel="last"';
    expect(getNextUrl(header)).toBe('https://api.github.com/repos/u/r/commits?page=2');
  });

  it('returns null when no rel="next"', () => {
    const header = '<https://api.github.com/repos/u/r/commits?page=1>; rel="prev"';
    expect(getNextUrl(header)).toBeNull();
  });
});

// ── analyzeCommits: basic stats ──────────────────
describe('analyzeCommits', () => {
  const commits = [
    makeCommit('alpha', '2026-01-05T08:00:00Z', 'feat: add login'),
    makeCommit('alpha', '2026-01-06T09:30:00Z', 'fix: typo'),
    makeCommit('alpha', '2026-01-07T10:00:00Z', 'feat: dashboard'),
    makeCommit('beta',  '2026-01-08T14:00:00Z', 'chore: deps'),
    makeCommit('beta',  '2026-01-10T03:00:00Z', 'refactor: cleanup'),
  ];

  const result = analyzeCommits(commits, 2);

  it('counts total commits', () => {
    expect(result.totalCommits).toBe(5);
  });

  it('counts repos with commits', () => {
    expect(result.reposWithCommits).toBe(2);
  });

  it('identifies peak hour in UTC', () => {
    // hours: 8, 9, 10, 14, 3 → all unique, but let's check peakHour is one of them
    // hourCount[8]=1, [9]=1, [10]=1, [14]=1, [3]=1 → all tied, indexOf picks first max = 3
    expect(result.peakHour).toBe(3);
  });

  it('identifies peak day in UTC', () => {
    // 2026-01-05=Mon, 06=Tue, 07=Wed, 08=Thu, 10=Sat → dayCount: Mon=1,Tue=1,Wed=1,Thu=1,Sat=1
    // indexOf picks first max = Mon (index 1)
    expect(result.peakDay).toBe(1); // Monday
  });

  it('counts late night commits (00-06 UTC)', () => {
    // Only the 03:00 commit
    expect(result.lateNight).toBe(1);
    expect(result.lateNightPct).toBe('20.0');
  });

  it('tracks top repos sorted by count', () => {
    expect(result.topRepos[0][0]).toBe('alpha');
    expect(result.topRepos[0][1]).toBe(3);
    expect(result.topRepos[1][0]).toBe('beta');
    expect(result.topRepos[1][1]).toBe(2);
  });

  it('detects conventional commit prefixes', () => {
    const prefixMap = Object.fromEntries(result.topPrefixes);
    expect(prefixMap.feat).toBe(2);
    expect(prefixMap.fix).toBe(1);
    expect(prefixMap.chore).toBe(1);
    expect(prefixMap.refactor).toBe(1);
  });
});

// ── analyzeCommits: streak calculation ───────────
describe('streak calculation', () => {
  it('computes consecutive day streak', () => {
    const commits = makeCommits([
      '2026-03-01T12:00:00Z',
      '2026-03-02T12:00:00Z',
      '2026-03-03T12:00:00Z',
      // gap
      '2026-03-05T12:00:00Z',
    ]);
    const result = analyzeCommits(commits, 1);
    expect(result.longestStreak).toBe(3);
  });

  it('handles single commit (streak = 1)', () => {
    const commits = makeCommits(['2026-06-15T10:00:00Z']);
    const result = analyzeCommits(commits, 1);
    expect(result.longestStreak).toBe(1);
  });

  it('survives DST-like 23-hour day gap', () => {
    // Simulate two dates exactly 23 hours apart that still span consecutive calendar days (UTC)
    const commits = makeCommits([
      '2026-03-08T23:30:00Z',  // March 8
      '2026-03-09T22:30:00Z',  // March 9  (23h gap)
    ]);
    const result = analyzeCommits(commits, 1);
    expect(result.longestStreak).toBe(2); // should NOT break streak
  });

  it('does not merge a 2-day gap', () => {
    const commits = makeCommits([
      '2026-04-01T12:00:00Z',
      '2026-04-03T12:00:00Z',
    ]);
    const result = analyzeCommits(commits, 1);
    expect(result.longestStreak).toBe(1);
  });
});

// ── analyzeCommits: UTC consistency ──────────────
describe('UTC consistency', () => {
  it('assigns hour bucket based on UTC, not local time', () => {
    // A commit at 2026-01-15T23:30:00Z should land in hour 23
    const commits = makeCommits(['2026-01-15T23:30:00Z']);
    const result = analyzeCommits(commits, 1);
    expect(result.hourCount[23]).toBe(1);
    expect(result.peakHour).toBe(23);
  });

  it('assigns day bucket based on UTC', () => {
    // 2026-01-15 is a Thursday (day index 4)
    const commits = makeCommits(['2026-01-15T12:00:00Z']);
    const result = analyzeCommits(commits, 1);
    expect(result.dayCount[4]).toBe(1); // Thursday
    expect(result.peakDay).toBe(4);
  });
});

// ── analyzeCommits: yearsCoded ───────────────────
describe('yearsCoded', () => {
  it('computes fractional years between first and last commit', () => {
    const commits = makeCommits([
      '2025-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
    ]);
    const result = analyzeCommits(commits, 1);
    expect(result.yearsCoded).toBeCloseTo(1.0, 1);
  });

  it('floors to 0.1 for same-day commits', () => {
    const commits = makeCommits([
      '2026-06-01T08:00:00Z',
      '2026-06-01T09:00:00Z',
    ]);
    const result = analyzeCommits(commits, 1);
    expect(result.yearsCoded).toBe(0.1);
  });
});
