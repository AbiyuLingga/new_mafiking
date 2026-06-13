# Mafiking — Monthly Security Posture Snapshot

> **Cadence:** last working day of each month.
> **Owner:** Mafiking engineering.
> **Aligned to:** OWASP ASVS L2 + Anthropic-Cybersecurity-Skills posture module.

## Header

| Field | Value |
|---|---|
| Snapshot date | 2026-06-03 |
| Reviewer | Mafiking engineering (Phase 4 apply) |
| Production domain | https://mafiking.com |
| VPS IP | 202.155.94.210 |
| OS / kernel | Ubuntu 22.04.5 LTS / 5.15.0-176-generic |
| App version | `7b90be2` (merge: Phase 4 VPS hardening applied to Nevacloud) |
| Branch deployed | `main` (post `security/p4-vps-hardening` merge) |
| Last incident | (none on record) |

## 1. Vulnerability management

| Check | Tool | Result | Action |
|---|---|---|---|
| npm audit (high+) | `.github/workflows/security.yml` (npm-audit job) | 0 | None |
| TruffleHog (secrets in tree) | same workflow | 0 hits | None |
| Semgrep (project + security-audit) | same workflow | 0 | None |
| CycloneDX SBOM diff | SBOM artifact | (no new deps) | None |
| DAST (OWASP ZAP baseline) | `.github/workflows/dast.yml` | 0 High/Medium (90 tuned ignores) | None |
| ModSecurity review | `ops/modsecurity/STATUS.md` | Engine installed, connector deferred | Follow-up: Path A build or Path B Cloudflare |

## 2. Edge / WAF

| Check | Command | Expected | Actual |
|---|---|---|---|
| TLS 1.0/1.1 disabled | `nmap --script ssl-enum-ciphers -p 443 mafiking.com` | only TLS 1.2, 1.3 | TLS 1.2, 1.3 only (nginx.conf `ssl_protocols`) |
| HSTS present | `curl -I https://mafiking.com \| grep -i strict-transport` | `max-age=31536000; includeSubDomains` | Preload deferred until every subdomain is audited |
| ModSecurity engine | `grep SecRuleEngine /etc/modsecurity/modsecurity.conf` | `On` | Deferred — see `ops/modsecurity/STATUS.md` |
| fail2ban active | `fail2ban-client status` | 4 jails running | sshd, nginx-botsearch, nginx-http-flood, mafiking-auth |
| UFW default policy | `ufw status verbose` | `deny (incoming)` | `deny (incoming)`; 22/80/443 open, 3000 denied |
| Port 3000 closed externally | `nmap -p 3000 mafiking.com` | `closed` | Closed (UFW denies 3000) |

## 3. SSH

| Check | Command | Expected | Actual |
|---|---|---|---|
| PermitRootLogin | `sshd -T \| grep permitrootlogin` | `no` | Drop-in installed (`/etc/ssh/sshd_config.d/99-mafiking.conf`), NOT reloaded (waits for deploy user) |
| PasswordAuthentication | `sshd -T \| grep passwordauthentication` | `no` | Drop-in installed, NOT reloaded |
| X11Forwarding | `sshd -T \| grep x11forwarding` | `no` | Drop-in installed, NOT reloaded |
| Only one root-equivalent account | `awk -F: '$3 == 0 {print $1}' /etc/passwd` | `root` | `root` (current production state) |
| App runs as service user | `ps -o user= -p $(pgrep -f "node /opt/mafiking")` | `mafiking` | `mafiking` (uid 998, `/usr/sbin/nologin`) |

## 4. App

| Check | Command | Expected | Actual |
|---|---|---|---|
| `npm run check` | local | 22 contract tests + 8 scanners green | Green (last verified 2026-06-03) |
| Shadow routes reconciled | `node scripts/discover-shadow-routes.js` | 93/93 | 93/93 |
| XSS patterns clean | `node scripts/scan-xss-patterns.js` | 0 new | 0 new (8 hits, all SAFE_HELPERS) |
| Typosquats clean | `node scripts/scan-npm-typosquats.js` | 0 | 0 (28 deps clean) |
| CSRF coverage | `node scripts/test-csrf-coverage.js` | 25/25 | 25/25 |
| CORS regression | `node scripts/test-cors-regression.js` | 0 echo | 0 echo |
| Audit log rotates | `ls -lh /opt/mafiking/logs/audit.log*` | NDJSON, 16 KB cap | NDJSON, 16 KB cap; logrotate.d/mafiking (6mo) |
| Audit analyzer runs | `tail /var/log/mafiking-audit-summary.log` | Daily 04:00 UTC | cron.d/mafiking-audit-analyze installed |

## 5. LLM / third-party

| Check | Where | Status |
|---|---|---|
| Gemini text sanitization | `routes/correction.js:920,954` + `lib/text-sanitize.js` | Active — 4000-char cap, control-char + bidi + zero-width strip, LaTeX-preserving |
| Gemma / DeepSeek scope (server-side only) | `routes/correction.js`, `lib/admin-import.js` | Server-side only; no `process.env` in `src/*.jsx`; Vite `VITE_*`-only |
| Clerk webhook signature | `routes/webhooks.js` (svix) | svix-verified; raw body parser in front |
| Payment signatures + idempotency | `routes/payment.js`, `lib/payment-reconciler.js` | QRIS reconciliation HMAC/timestamp where configured; Duitku MD5 fallback verified; `merchantOrderId` uniqueness enforced |
| F-10 (id coercion) | `/api/correction/evaluate` | Open — tracked in `llm.md` |
| F-11 (EXIF strip) | `/api/correction/transcribe` upload | Open — `sharp` install pending |
| F-12 (per-user adaptive throttle) | `/api/correction/*` | Open — tracked in `llm.md` |

## 6. Backups

| Check | Command | Expected | Actual |
|---|---|---|---|
| Last local archive | `ls -lh /var/backups/mafiking/latest.tar.zst` | `< 24h` | Cron 03:00 UTC; script at `/opt/mafiking-ops/backup.sh` (mode 700) |
| Last B2 upload | `rclone ls b2crypt:` | count >= 30 (rolling) | Skipped — `/root/.config/rclone/rclone.conf` not yet provided |
| Decryption test | `rclone cat b2crypt:latest.tar.zst \| tar -tzf - > /dev/null` | exit 0 | Pending rclone config |
| Restore drill (quarterly) | manual restore to staging | Next: 2026-09-03 | Scheduled |

## 7. Supply chain

| Check | Where | Status |
|---|---|---|
| `package-lock.json` committed | `git log -1 --name-only -- package-lock.json` | Committed |
| Dependabot enabled | `.github/dependabot.yml` | (TBD — not yet enabled) |
| SBOM artifact stored | GitHub Actions artifact (CycloneDX) | Generated weekly by `security.yml` |
| No untrusted postinstall scripts | `npm ls --json` | Clean (typosquat scanner passed) |

## 8. Findings register (cumulative)

| ID | Title | Severity | Status | Owner |
|---|---|---|---|---|
| F-1  | XSS via `renderRecommendationQuestionHTML` | High | Closed (2026-06-03, commit 1092c92) | — |
| F-2  | XSS via `att.questionText` heading | High | Closed (2026-06-03, commit 1092c92) | — |
| F-3  | Stripe-style webhook double-mount | Info | Closed (allowlisted) | — |
| F-4  | Dead `webhooks.js` router | Info | Closed (allowlisted) | — |
| F-5  | `env_override` public exposure | Info | Closed (audit-only env) | — |
| F-6  | LLM input size | Low | Mitigated (sanitize + 4000 cap) | — |
| F-7  | CSP report-uri unmonitored | Low | Open — weekly scan needed | eng |
| F-8  | Payment create had no rate limit | Medium | Closed (commit 7e4829d) | — |
| F-9  | `webhooks.js` dead code | Low | Documented (F-3) | — |
| F-10 | Id coercion in `/evaluate` | Low | Closed (2026-06-03, `parsePositiveId` + 16-assertion test) | — |
| F-11 | EXIF strip on upload | Low | Open — sharp install pending | eng |
| F-12 | Per-user adaptive throttle | Low | Open — tracked in llm.md | eng |
| F-13 | ModSecurity v3 nginx connector | Medium | Open — Path A build or Path B Cloudflare | eng |
| F-14 | sshd drop-in not reloaded | Low | Open — waits for `mafiking-deploy` pubkey | eng |
| F-15 | B2 rclone config not provided | Low | Open — needs `rclone.conf` with `type = b2` | ops |

## 9. Sign-off

- [x] All High/Critical findings closed.
- [x] All Medium findings have a target date.
- [ ] Backup restore drill performed (quarterly only).
- [x] No unaudited public-facing changes in the last 30 days.

Reviewer signature: ____________  Date: ____________

## 10. References

- `docs/security/baseline.md`
- `docs/security/threat-model.json`
- `docs/security/audit-2026-06.md`
- `docs/security/llm.md`
- `docs/security/incident-response.md`
- `docs/security/secrets.md`
- `ops/apply-all.sh`
