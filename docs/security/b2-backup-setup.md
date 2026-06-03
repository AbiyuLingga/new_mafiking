# B2 backup setup (Backblaze B2 + rclone crypt)

Walks through the one-time setup that lets `ops/backup.sh` upload encrypted
daily snapshots to Backblaze B2. Run once on the VPS as `root`, then verify
with a manual `backup.sh` run before relying on the cron.

## 1. Backblaze B2 console (5 minutes)

1. Sign in to https://secure.backblaze.com/b2_buckets.htm.
2. **Create a bucket**:
   - Bucket name: `mafiking-backups`
   - Privacy: Private
   - Lifecycle: Keep only the last 30 versions of each file (matches
     `KEEP_B2_DAYS` in `ops/backup.sh`).
3. **Create an application key** (Account → App Keys → Add a New Application Key):
   - Name: `mafiking-vps-backup`
   - Bucket access: `mafiking-backups` only (recommended; deny access to
     all other buckets).
   - Permissions: `listFiles`, `readFiles`, `writeFiles`, `deleteFiles`.
   - **Copy the `keyID` and `applicationKey`** now — Backblaze only shows
     the secret once.
4. Note your **B2 account ID** (Account → Account Settings → Account ID).

## 2. rclone config (run as root on the VPS)

SSH in as the user that runs the backup cron (currently `root`):

```bash
mkdir -p /root/.config/rclone
chmod 700 /root/.config/rclone
$EDITOR /root/.config/rclone/rclone.conf
chmod 600 /root/.config/rclone/rclone.conf
```

Paste this template, filling in the bracketed values:

```ini
[b2]
type = b2
account = [your_B2_account_ID]
key = [your_B2_keyID]
hard_delete = false

[b2crypt]
type = crypt
remote = b2:mafiking-backups
filename_encryption = standard
directory_name_encryption = true
password = [generate with: rclone obscure YOUR_PASSWORD]
password2 = [generate with: rclone obscure YOUR_SALT]
```

Generate the crypt secrets with rclone (do not use your B2 password as the
crypt password — pick a fresh 32+ char value and store it in your password
manager):

```bash
# On the VPS, two separate values (crypt password + salt):
rclone obscure 'GENERATED_CRYPT_PASSWORD_32_chars_min'
rclone obscure 'GENERATED_CRYPT_SALT_16_chars_min'
```

The `password2` (salt) is a Backblaze-specific concern: it makes the
encrypted file names unrecoverable without the salt even if someone
gets the bucket contents. Store both in a password manager
(1Password / Bitwarden / KeePassXC) — losing them means you cannot
decrypt old backups.

## 3. Verify the config

```bash
rclone listremotes
# Expected: b2:, b2crypt:

rclone lsd b2:
# Expected: lists mafiking-backups

rclone lsd b2crypt:
# Expected: empty (or one directory per day if backups have run)
```

If `rclone lsd b2:` asks for a password interactively, the `account` or
`key` in `[b2]` is wrong. If `rclone lsd b2crypt:` errors with
"Failed to decrypt", the crypt `password`/`password2` are wrong.

## 4. Test the backup

Run the script manually the first time to make sure the whole path works
(uses local copy if the upload fails, but exits non-zero):

```bash
/opt/mafiking-ops/backup.sh
echo "exit=$?"
tail -50 /var/log/mafiking-backup.log
```

Expected output (last few lines):

```text
[ok] sqlite3 .backup -> /var/backups/mafiking/snap-.../data/mafiking.sqlite (NNNNN bytes)
[ok] archive: /var/backups/mafiking/YYYYMMDDTHHMMSSZ.tar.zst (N MiB)
[ok] integrity check passed
[ok] uploaded to b2crypt:
[prune-local] /var/backups/mafiking/OLD-STAMP.tar.zst
=== done YYYY-MM-DDTHH:MM:SS+00:00 ===
```

Then confirm the upload landed:

```bash
rclone ls b2crypt:
# One archive per backup run, total bytes ≈ local archive size
```

## 5. Verify decryption end-to-end

```bash
rclone cat b2crypt:latest.tar.zst | tar -tzf - > /dev/null
echo "decrypt+list exit=$?"
# Expected: 0
```

`rclone cat` reads through the crypt layer, so a non-zero exit here
means the crypt password is wrong, or the file is corrupt in B2.
Either way: stop and re-derive the issue before relying on the cron.

## 6. Cron is already installed

`/etc/cron.d/mafiking-backup` runs the script daily at 03:00 UTC. After
the first successful manual run, the cron will take over. If the cron
fails, the user will see log lines in `/var/log/mafiking-backup.log`
and (eventually) a daily NDJSON entry in the audit summary.

## 7. Recovery runbook (one-time per quarter)

See `docs/security/incident-response.md` § "Data recovery" for the full
playbook. Quick version:

1. Pick a date from `rclone lsf b2crypt: --format ts`.
2. `rclone copy b2crypt:YYYYMMDDTHHMMSSZ.tar.zst /tmp/restore.tar.zst`.
3. `tar -C /tmp/restore -xf /tmp/restore.tar.zst --zstd`.
4. Compare the SQLite snapshot's hash against
   `sqlite3 /tmp/restore/data/mafiking.sqlite "PRAGMA integrity_check;"`.

## Common mistakes

- Using a B2 master key in `[b2]` instead of a bucket-restricted app key.
  If the VPS is compromised, the attacker only gets the bucket.
- Picking a crypt password shorter than 32 characters. rclone accepts
  short values but the encryption is materially weaker.
- Reusing the crypt password elsewhere. Treat it like a TLS private key.
- Forgetting `hard_delete = false` on the b2 remote; Backblaze's hard
  delete skips the 30-day retention window, defeating the backup.

## Rotation

The crypt `password` and `password2` should be rotated annually. After
rotation, all OLD encrypted archives become unreadable. Plan rotation
during the same window you migrate to a new bucket.
