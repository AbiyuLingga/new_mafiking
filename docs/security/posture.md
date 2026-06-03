# Mafiking — Monthly Security Posture Snapshot

> **Cadence:** last working day of each month.
> **Owner:** Mafiking engineering.
> **Aligned to:** OWASP ASVS L2 + Anthropic-Cybersecurity-Skills posture module.

## Header

| Field | Value |
|---|---|
| Snapshot date | YYYY-MM-DD |
| Reviewer | (your name) |
| Production domain | https://mafiking.com |
| VPS IP | 202.155.94.210 |
| OS / kernel | Ubuntu 22.04.5 LTS / 5.15.0-176-generic |
| App version | git rev-parse HEAD |
| Branch deployed | security/p0-baseline → main |
| Last incident | (date or "—") |

## 1. Vulnerability management

| Check | Tool | Result | Action |
|---|---|---|---|
| npm audit (high+) | `.github/workflows/security.yml` (npm-audit job) | 0 |  |
| TruffleHog (secrets in tree) | same workflow | 0 hits |  |
| Semgrep (project + security-audit) | same workflow | 0 |  |
| CycloneDX SBOM diff | SBOM artifact | (no new deps) |  |
| DAST (OWASP ZAP baseline) | `.github/workflows/dast.yml` | 0 High/Medium |  |
| ModSecurity review | `/var/log/modsecurity/audit.log` | (findings) |  |

## 2. Edge / WAF

| Check | Command | Expected | Actual |
|---|---|---|---|
| TLS 1.0/1.1 disabled | `nmap --script ssl-enum-ciphers -p 443 mafiking.com` | only TLS 1.2, 1.3 |  |
| HSTS preload present | `curl -I https://mafiking.com \| grep -i strict-transport` | `max-age=63072000; includeSubDomains; preload` |  |
| ModSecurity engine | `grep SecRuleEngine /etc/modsecurity/modsecurity.conf` | `On` |  |
| fail2ban active | `fail2ban-client status` | 4 jails running |  |
| UFW default policy | `ufw status verbose` | `deny (incoming)` |  |
| Port 3000 closed externally | `nmap -p 3000 mafiking.com` | `closed` |  |

## 3. SSH

| Check | Command | Expected | Actual |
|---|---|---|---|
| PermitRootLogin | `sshd -T \| grep permitrootlogin` | `no` |  |
| PasswordAuthentication | `sshd -T \| grep passwordauthentication` | `no` |  |
| X11Forwarding | `sshd -T \| grep x11forwarding` | `no` |  |
| Only one root-equivalent account | `awk -F: '$3 == 0 {print $1}' /etc/passwd` | `root` |  |
| App runs as service user | `ps -o user= -p $(pgrep -f "node /opt/mafiking")` | `mafiking` |  |

## 4. App

| Check | Command | Expected | Actual |
|---|---|---|---|
| `npm run check` | local | 22 contract tests + 8 scanners green |  |
| Shadow routes reconciled | `node scripts/discover-shadow-routes.js` | 93/93 |  |
| XSS patterns clean | `node scripts/scan-xss-patterns.js` | 0 new |  |
| Typosquats clean | `node scripts/scan-npm-typosquats.js` | 0 |  |
| CSRF coverage | `node scripts/test-csrf-coverage.js` | 25/25 |  |
| CORS regression | `node scripts/test-cors-regression.js` | 0 echo |  |
| Audit log rotates | `ls -lh /opt/mafiking/logs/audit.log*` |  |  |
| Audit analyzer runs | `tail /var/log/mafiking-audit-summary.log` |  |  |

## 5. LLM / third-party

| Check | Where | Status |
|---|---|---|
| Gemini text sanitization | `routes/correction.js:920,954` + `lib/text-sanitize.js` |  |
| Gemma / DeepSeek scope (server-side only) | `lib/ai-profile-provider.js`, `lib/admin-import.js` |  |
| Clerk webhook signature | `routes/webhooks.js` (svix) |  |
| Duitku HMAC + idempotency | `routes/payment.js` |  |
| F-10 (id coercion) | `/api/correction/evaluate` |  |
| F-11 (EXIF strip) | `/api/correction/transcribe` upload |  |
| F-12 (per-user adaptive throttle) | `/api/correction/*` |  |

## 6. Backups

| Check | Command | Expected | Actual |
|---|---|---|---|
| Last local archive | `ls -lh /var/backups/mafiking/latest.tar.zst` | `< 24h` |  |
| Last B2 upload | `rclone ls b2crypt:` | count >= 30 (rolling) |  |
| Decryption test | `rclone cat b2crypt:latest.tar.zst \| tar -tzf - > /dev/null` | exit 0 |  |
| Restore drill (quarterly) | manual restore to staging |  |  |

## 7. Supply chain

| Check | Where | Status |
|---|---|---|
| `package-lock.json` committed | `git log -1 --name-only -- package-lock.json` |  |
| Dependabot enabled | `.github/dependabot.yml` | (TBD) |
| SBOM artifact stored | GitHub Actions artifact |  |
| No untrusted postinstall scripts | `npm ls --json` |  |

## 8. Findings register (cumulative)

| ID | Title | Severity | Status | Owner |
|---|---|---|---|---|
| F-1  | XSS via `renderRecommendationQuestionHTML` | High | Closed (2026-06-03, commit 1d85fea) | — |
| F-2  | XSS via `att.questionText` heading | High | Closed (2026-06-03, commit c260ffb) | — |
| F-3  | Stripe-style webhook double-mount | Info | Closed (allowlisted) | — |
| F-4  | Dead `webhooks.js` router | Info | Closed (allowlisted) | — |
| F-5  | `env_override` public exposure | Info | Closed (audit-only env) | — |
| F-6  | LLM input size | Low | Mitigated (sanitize + 4000 cap) | — |
| F-7  | CSP report-uri unmonitored | Low | Open — weekly scan needed |  |
| F-8  | Payment create had no rate limit | Medium | Closed (commit 7e4829d) | — |
| F-9  | `webhooks.js` dead code | Low | Documented (F-3) | — |
| F-10 | Id coercion in `/evaluate` | Low | Open — tracked in llm.md |  |
| F-11 | EXIF strip on upload | Low | Open — sharp install pending |  |
| F-12 | Per-user adaptive throttle | Low | Open — tracked in llm.md |  |

## 9. Sign-off

- [ ] All High/Critical findings closed.
- [ ] All Medium findings have a target date.
- [ ] Backup restore drill performed (quarterly only).
- [ ] No unaudited public-facing changes in the last 30 days.

Reviewer signature: ____________  Date: ____________

## 10. References

- `docs/security/baseline.md`
- `docs/security/threat-model.json`
- `docs/security/audit-2026-06.md`
- `docs/security/llm.md`
- `docs/security/incident-response.md`
- `docs/security/secrets.md`
- `ops/apply-all.sh`
