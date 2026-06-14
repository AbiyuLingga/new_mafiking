# Lighthouse CI setup (S2 safeguard)

This project enforces the mobile perf plan's quality budgets via Lighthouse.
The local `scripts/performance/perf-audit.js` is a thin wrapper around the `lighthouse`
core package; CI uses the same thresholds via a GitHub Actions workflow.

## Local usage

1. Start the server in one terminal:
   ```bash
   PORT=3001 node server.js
   ```
2. Run the audit in another:
   ```bash
   npm run perf:audit              # mobile emulation (default)
   PERF_AUDIT_MOBILE=0 npm run perf:audit   # desktop
   ```
3. JSON report: `logs/lighthouse-report.json`.

### Sandbox quirks

Some headless Chrome environments (CI sandboxes without a GPU, dev
containers with restricted module loading) may report `NO_FCP` and score
every category 0. The script detects this and prints guidance instead of
crashing. To audit properly in such environments, run:

```bash
npx lighthouse http://127.0.0.1:3001/landing --view
```

## Thresholds

| Category | Score | Plan source |
|---|---:|---|
| Performance | >= 90 | §10.2 |
| Accessibility | >= 95 | §10.2 |
| Best Practices | >= 95 | §10.2 |
| SEO | >= 95 | §10.2 |

## CI

`.github/workflows/perf-audit.yml` runs both desktop and mobile audits on
every PR. Reports are uploaded as artifacts. Adjust thresholds in
`scripts/performance/perf-audit.js` if the plan is amended.
