# Incident Response Runbook — Mafiking

> **Audience:** On-call engineer. Read this fully **before** you need it.
> **Owner:** Mafiking engineering. **Last reviewed:** 2026-06-03.
> **Aligned to:** OWASP ASVS V14.2, NIST SP 800-61r2, Anthropic-Cybersecurity-Skills IR module.

This runbook covers the four phases of incident response (NIST 800-61):
1. **Preparation** — what you need already in place
2. **Detection & Analysis** — signals you should watch
3. **Containment, Eradication, Recovery** — what to actually do
4. **Post-Incident** — what to write down

If you are mid-incident, **skip to section 3**.

---

## 0. Emergency contacts

| Role | Who | How | SLA |
|---|---|---|---|
| Primary on-call | Mafiking engineering lead | ops/INCIDENT channel | 15 min ack |
| Backup on-call | Mafiking ops | ops/INCIDENT channel | 30 min ack |
| Nevacloud support | provider | ticket | 1 h |
| Backblaze B2 | provider | ticket | 1 h |
| Duitku (payments) | provider | WA + email | 1 h |
| Clerk (auth) | provider | dashboard | 1 h |

## 1. Preparation

Done at boot time. Do these once.

- [x] VPS hardened: ops/apply-all.sh applied.
- [x] Offsite backup running daily to B2 (`crontab -l` includes `/opt/mafiking-ops/backup.sh`).
- [x] Audit log at `/opt/mafiking/logs/audit.log` (NDJSON, line-capped 16 KB).
- [x] ModSecurity audit at `/var/log/modsecurity/audit.log`.
- [x] Auditd rules at `/etc/audit/rules.d/99-mafiking.rules`.
- [x] SSH key-only, root login disabled.
- [ ] **You**: a printed copy of the SSH private key in a safe (NOT on this laptop).
- [ ] **You**: B2 crypt password stored in a password manager (NOT in `.env`).
- [ ] **You**: this runbook bookmarked.

## 2. Detection & Analysis

### Signals to watch

| Signal | Where | What it means |
|---|---|---|
| `audit_log: "event":"rate_limit"` | `/opt/mafiking/logs/audit.log` | A route hit its rate limit. Often a real attack. |
| `audit_log: "event":"csrf_blocked"` | same | CSRF token missing/mismatched. Failed attack or a bot. |
| `audit_log: "event":"auth_failed"` | same | Login brute force. |
| `audit_log: "event":"canary_hit"` | same | Someone accessed a canary path. **Treat as critical.** |
| `audit_log: "event":"bola_attempt"` | same | A user tried to access another user's resource. |
| `fail2ban` bans spiking | `fail2ban-client status` | Coordinated attack in progress. |
| ModSecurity 403/444 spikes | `/var/log/modsecurity/audit.log` | WAF is blocking probes. |
| auditd `priv-change` | `/var/log/audit/audit.log` | Someone called setuid/setgid. |
| Unusual outbound | `ss -tnp` (root) | Possible exfiltration. |
| Disk usage > 80% | `df -h` | Logs filling disk; not an attack, but fix. |
| B2 bucket size dropping | rclone lsf | Possible backup tampering. |

### Daily check (5 minutes)

```bash
ssh root@mafiking.com 'tail -100 /opt/mafiking/logs/audit.log | grep -E "canary_hit|bola_attempt|csrf_blocked" | tail -20'
ssh root@mafiking.com 'fail2ban-client status | grep "Jail list"'
ssh root@mafiking.com 'df -h /'
```

### Weekly check (15 minutes)

```bash
bash ops/cis-hardening.sh --audit-only
cd /opt/mafiking && node scripts/security/analyze-audit-log.js
cd /opt/mafiking && node scripts/security/discover-shadow-routes.js
cd /opt/mafiking && node scripts/security/scan-xss-patterns.js
ssh root@mafiking.com 'tail -200 /var/log/modsecurity/audit.log | jq ".transaction.messages"'
ssh root@mafiking.com 'rclone ls b2crypt: | wc -l'
```

## 3. Containment, Eradication, Recovery

If you suspect compromise, follow the steps in order. Do not skip.

### Step 3.1 — Triage (5 min)

```bash
ssh root@mafiking.com
# Is the app still up?
curl -fsSI https://mafiking.com | head -5
# Are the canaries tripped?
grep canary_hit /opt/mafiking/logs/audit.log | tail -20
# Are there processes we don't recognize?
ps auxf | head -50
# What changed on disk in the last hour?
find /etc /opt /var/www -mmin -60 -ls 2>/dev/null | head
# Any new SSH keys?
find / -name 'authorized_keys' -newer /etc/passwd 2>/dev/null
```

**Decision:**

| Symptom | Severity | Action |
|---|---|---|
| Canaries tripped | **Critical** | Go to 3.2 (full lockdown). |
| Rate limit/CORS/CSRF noise only | Low | Go to 3.3 (deny + monitor). |
| ModSecurity false positives | Low | Add exclusion, file ticket. |
| Disk full, no breach | Low | Logrotate, cleanup. |

### Step 3.2 — Critical: full lockdown (15 min)

```bash
# 1) Stop public traffic at the edge.
ufw deny 80/tcp
ufw deny 443/tcp
# Or, if you have a Cloudflare proxy, set security to "I'm under attack".

# 2) Snapshot the current state for forensics.
mkdir -p /root/forensics/$(date -u +%Y%m%dT%H%M%SZ)
cd /root/forensics/$(date -u +%Y%m%dT%H%M%SZ)
cp -a /opt/mafiking/logs/ ./logs
journalctl --since '2 hours ago' > journal.txt
ps auxf > ps.txt
ss -tnp > net.txt
last -50 > last.txt
cp /etc/passwd /etc/shadow /etc/group /etc/sudoers.d/ . 2>/dev/null
# Disk image optional; takes time.
dd if=/dev/sda3 of=disk.raw bs=4M status=progress

# 3) Rotate ALL secrets (assume the attacker had access).
#    See docs/security/secrets.md.
#    - SESSION_SECRET
#    - CSRF_SECRET
#    - CLERK_SECRET_KEY  (rotate via Clerk dashboard)
#    - DUITKU_API_KEY    (rotate via Duitku dashboard)
#    - DUITKU_MERCHANT_CODE
#    - B2_KEY_ID, B2_APP_KEY
#    - rclone crypt password

# 4) Rebuild from clean image.
#    - Provision a new VPS
#    - Apply ops/apply-all.sh
#    - Restore database from the most recent clean B2 backup
#    - Re-issue user passwords (force reset on next login)
#    - Notify users per GDPR / UU PDP if PII was at risk
```

### Step 3.3 — Low/Medium: deny + monitor (10 min)

```bash
# 1) Block the offending IP at the edge.
iptables -I INPUT -s ATTACKER_IP -j DROP
# Or at fail2ban level:
fail2ban-client set sshd banip ATTACKER_IP

# 2) Add a ModSecurity rule to block the exploit pattern.
#    Edit /etc/modsecurity/crs/mafiking-exclusions.conf, add:
SecRule REQUEST_URI|ARGS|REQUEST_BODY "@rx PATTERN" \
  "id:10999,phase:2,deny,status:403,log,msg:'incident X — N'"

# 3) Increase log level for the affected route.
LOG_LEVEL=debug systemctl restart pm2-mafiking

# 4) Watch.
tail -f /opt/mafiking/logs/audit.log | grep -E "evt|attack"
```

### Step 3.4 — Recovery

1. Re-enable firewall rules: `ufw allow 80/tcp && ufw allow 443/tcp`.
2. Restart the app: `systemctl restart pm2-mafiking`.
3. Smoke test: `curl -fsSI https://mafiking.com` → expect 200/301/302.
4. Run `bash ops/cis-hardening.sh --audit-only` and confirm no new findings.
5. Watch the audit log for 24 h.

## 4. Post-Incident

Within 48 hours, write up:

1. **Timeline** — UTC timestamps for: detection → first action → containment → eradication → recovery.
2. **Root cause** — what failed, exactly.
3. **Affected scope** — users, data, time window.
4. **Mitigations** — what you changed to prevent recurrence.
5. **Action items** — owners, deadlines, ticket links.
6. **Lessons** — what worked, what didn't, what to change in the runbook.

Save the writeup at `docs/security/postmortems/YYYY-MM-DD-<slug>.md`.
Commit it. Discuss in the next engineering review.

## 5. Specific Mafiking scenarios

### 5.1 — LLM prompt injection spotted

Symptoms: `audit_log` shows `/api/correction` returning evaluation content
that mentions system instructions or other users.

1. Check `server/security/text-sanitize.js` is loaded (look for "sanitizeForPrompt" in
   the route logs).
2. Verify the input length cap: input should never exceed 4000 chars.
3. Pull the offending input from `audit_log: "event":"llm_call"` and
   reproduce in a sandbox.
4. Add the pattern to `server/security/text-sanitize.js` deny list.
5. Notify the model provider if the exploit is reproducible.

### 5.2 — Payment callback replay

Symptoms: Duitku reports callback sent; Mafiking does not mark the order
paid; or the order is marked paid twice.

1. Check the `Idempotency-Key` header is required.
2. Check the `merchantOrderId` is unique in `data/mafiking.sqlite`.
3. Check `paymentLimiter` is not exhausted.
4. If you see the same `merchantOrderId` accepted twice, restore from
   the last clean B2 backup and call Duitku to reverse the duplicate.

### 5.3 — BOLA suspected

Symptoms: a user reports seeing another user's data.

1. Pull the user's session: `SELECT id, user_id, role FROM sessions WHERE id = ?`.
2. Pull the request log for that user_id.
3. Check `api-inventory.md` for the route; verify the SQL has
   `WHERE user_id = ?`.
4. If missing, patch and add a regression test.

### 5.4 — SSH brute force

Symptoms: `fail2ban` shows hundreds of `sshd` bans.

1. Verify `ops/sshd-hardening.conf` is loaded.
2. Verify `PermitRootLogin no` in `sshd -T | grep root`.
3. If `PasswordAuthentication yes`, **fix it now** — that's a misconfig.
4. Consider adding a Cloudflare L7 proxy.

## 6. References

- OWASP ASVS V14.2 (resilience, IR) — `docs/security/baseline.md`
- Threat model — `docs/security/threat-model.json`
- Secrets rotation — `docs/security/secrets.md`
- ModSecurity exclusions — `ops/modsecurity/mafiking-exclusions.conf`
- Backup script — `ops/backup.sh`
- Anthropic-Cybersecurity-Skills: incident-response module
- NIST SP 800-61r2 — Computer Security Incident Handling Guide
