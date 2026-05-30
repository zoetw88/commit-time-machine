# 🕰️ Commit Time Machine

**Live: [zoetw88.github.io/commit-time-machine](https://zoetw88.github.io/commit-time-machine)**

A tiny tool that analyzes your GitHub commit patterns.

- When do you actually code?
- What's your peak day?
- Longest streak?
- Builder, fixer, or maintainer?

Pure frontend — your username and (optional) token never leave your browser.

## Why a token (optional)

GitHub's API gives you **60 requests/hour unauthenticated**, **5000 with a token**.

For users with many repos, you'll probably want a token. Create a read-only
one at <https://github.com/settings/tokens?type=beta> — no scopes needed
for public repos.

## CLI version

If you want to analyze your own private repos too, there's a CLI in
[`cli/`](./cli/) that uses `gh` CLI auth.

```bash
cd cli
node analyze.mjs YOUR_USERNAME
```

## Local dev

```bash
# Any static file server works
python -m http.server 8000
# or
npx serve
```

## License

MIT.
