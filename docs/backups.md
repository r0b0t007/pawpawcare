# Backups

Nightly encrypted backups of the production database and user uploads, sent to a private Cloudflare R2 bucket. Built on `spatie/laravel-backup`: config in `backend/config/backup.php`, the R2 disk in `backend/config/filesystems.php` (`backups`), and the schedule in `backend/routes/console.php`.

## What runs

| When (server time) | Command | What it does |
|---|---|---|
| 03:00 | `backup:clean` | Deletes old backups (retention below). Never deletes the newest one. |
| 03:15 | `backup:run` | Dumps the database, zips it with `storage/app/private` and `storage/app/public`, encrypts the zip (AES-256), checks the zip opens, then uploads it to R2. Two tries, a minute apart. |
| 09:00 | `backup:monitor` | Alerts if the newest backup is more than a day old or the bucket uses more than 8 GB. |

- **Not in the backup:** the code (it's in git) and `.env`. Keep `.env` in your password manager, because a restore needs it.
- **Retention:** every backup for 7 days, one a day up to day 30, one a week up to about day 86, then nothing. The privacy policy promises that deleted accounts are gone from backups within 90 days, and `BackupsTest` fails if the settings exceed that.
  - `backup:clean` never deletes the newest backup. If backups stopped for months, the last one would stay.
  - So the bucket also has an R2 lifecycle rule that deletes anything over 88 days old, whatever the app does (`docs/r2/backups-lifecycle.json`).
  - Cleanup runs even if the archive password goes missing; it only needs the bucket keys.
- **Alerts:** there is no email. Each of these problems logs an error, which the `sentry` log channel turns into a Sentry issue:
  - a failed run, failed cleanup, or unhealthy backups;
  - backups not being configured (logged every night at 03:15 until they are).

  `backup:run` also has a Sentry cron monitor, so a night with no run at all raises an alert.
- **Never half-configured or unencrypted:** spatie writes a *plain* zip when the password is empty or the server's zip extension has no AES support.
  - `Backups::assertEncryptable()` runs inside every backup, manual `backup:run` included, before anything is zipped. It aborts unless all of these hold:
    - the password is at least 24 characters;
    - AES-256 is available;
    - the destination is `backups` (R2) or `backups-local`.
  - The scheduler also skips the run and logs which settings are missing.
- **Destinations:** only these two disks are allowed.
  - `public` is served on the web, and `local` is itself a backup source.
  - `backups-local` (`storage/app/backups-local`) is for testing and restore drills only. Delete its contents afterwards.
- **Logs:** spatie's step-by-step log, with stack traces, goes to the host's `single` log file (`BACKUP_LOG_CHANNEL`). Only the short error messages above reach Sentry.
- **During a run** the plain SQL dump sits in `storage/app/backup-temp` for a few minutes, outside the web root. It's deleted when the run ends, or at the start of the next run if a crash kills the process.

## One-time setup

1. **Turn on R2** (owner, in the dashboard). Go to dash.cloudflare.com → R2 Object Storage → turn it on. The free tier is 10 GB, but Cloudflare still asks for a payment method. This is the only step the `cf` CLI can't do; until it's done, the API answers `10042 Please enable R2 through the Cloudflare Dashboard`.
2. **Create and lock down the bucket** with the `cf` CLI, run from the repo root. Use an Eastern North America hint so the backups sit in a different region from the Phoenix server:
   ```sh
   cf r2 buckets create --name pawpawcare-backups --location-hint enam
   # Hard 88-day expiry (privacy promise backstop) + clean up stalled multipart uploads:
   cf r2 buckets lifecycle update pawpawcare-backups --rules @docs/r2/backups-lifecycle.json
   # New backups can't be deleted for 6 days, even with the server's key — a hacked
   # host can't wipe the last week. (6 < keep_all_backups_for_days, so cleanup never hits a lock.)
   cf r2 buckets locks update pawpawcare-backups --rules @docs/r2/backups-lock.json
   # Check: no public r2.dev URL and no custom domain.
   cf r2 buckets domains managed list --bucket-name pawpawcare-backups
   cf r2 buckets domains custom list --bucket-name pawpawcare-backups
   cf r2 buckets lifecycle get pawpawcare-backups && cf r2 buckets locks get pawpawcare-backups
   ```
3. **Create the access keys** (owner). R2 → Manage API tokens → Create API token:
   - Permission: **Object Read & Write**.
   - Scope: **only `pawpawcare-backups`**.
   - TTL: forever.

   Cloudflare shows the Access Key ID, the Secret Access Key and the endpoint (`https://<account-id>.r2.cloudflarestorage.com`) once. Paste them straight into the server `.env` (step 5), never into a chat or a commit.
4. **Make the archive password** and keep a copy **outside the server**, in a password manager. Without it the backups can't be opened.
   ```sh
   openssl rand -base64 33
   ```
5. **Fill in the server `.env`**, then run `php artisan config:cache`:
   ```
   BACKUP_DISK=backups
   BACKUP_ARCHIVE_PASSWORD=...
   BACKUP_R2_BUCKET=pawpawcare-backups
   BACKUP_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   BACKUP_R2_ACCESS_KEY_ID=...
   BACKUP_R2_SECRET_ACCESS_KEY=...
   ```
   If `which mysqldump` finds nothing in the cPanel terminal, also set `DB_DUMP_BINARY_PATH` to the folder that contains it.

   Check that the PHP the cron uses can write AES zips. It must print `bool(true)`; otherwise every backup aborts with "AES-256 zip support":
   ```sh
   php -r "var_dump(defined('ZipArchive::EM_AES_256'));"
   ```
   Then make the scratch folder private to your user:
   ```sh
   mkdir -p storage/app/backup-temp && chmod 700 storage/app/backup-temp
   ```
6. **Run a first backup by hand** in the cPanel terminal:
   ```sh
   php artisan backup:run && php artisan backup:list
   ```
   If it says "Refusing to back up: missing or invalid …", the message names the setting to fix.
   The zip is built in `storage/app/backup-temp` before it's uploaded, so the hosting account needs free space roughly equal to the uploads plus the database.

## Restoring

1. **Find and download a backup.** Use the R2 dashboard (bucket → `pawpawcare/` → download), or the `cf` CLI:
   ```sh
   cf r2 objects list --bucket-name pawpawcare-backups
   cf r2 objects get "pawpawcare/<date>.zip" --bucket-name pawpawcare-backups > backup.zip
   ```
2. **Decrypt it** with 7-Zip, using the archive password. The plain `unzip` command can't open AES-encrypted zips.
   ```sh
   7z x backup.zip
   ```
   Inside are `db-dumps/mysql-<database>.sql`, `private/` and `public/`.
3. **Load the database** into an empty database (create a new one, don't overwrite the live one until you've checked the copy):
   ```sh
   mysql -u <user> -p <database> < db-dumps/mysql-<database>.sql
   ```
4. **Restore the files** by copying `private/` and `public/` into `backend/storage/app/`, then run `php artisan storage:link` if `public/storage` is missing.
5. **Point the app at it.** Update the `.env` database settings, then run `php artisan config:cache`.

## Monthly restore drill

A backup nobody has restored is a hope, not a backup. Once a month:

1. Download the newest backup and decrypt it (steps 1–2 above). This proves the password still works.
2. Load it into a throwaway local MariaDB:
   ```sh
   docker run -d --rm --name drill -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=drill -p 3307:3306 mariadb:11
   # once it's up:
   docker exec -i drill mariadb -uroot -proot drill < db-dumps/mysql-<database>.sql
   docker exec drill mariadb -uroot -proot drill -e "select count(*) from users; select count(*) from pets;"
   ```
3. Check that the counts look right and that a few files from `private/` open.
4. Run `docker rm -f drill` and delete the downloaded files. They are real medical records. If you tested with `BACKUP_DISK=backups-local`, also empty `storage/app/backups-local` and set `BACKUP_DISK=backups` again.
