# Backups

Nightly encrypted backups of the production database and user uploads, sent to a private Cloudflare R2 bucket. Built on `spatie/laravel-backup`: config in `backend/config/backup.php`, the R2 disk in `backend/config/filesystems.php` (`backups`), and the schedule in `backend/routes/console.php`.

Uploads live on R2 since 2026-10-11 ([uploads-r2.md](uploads-r2.md)). Each night, every object in `pawpawcare-media` and `pawpawcare-documents` is copied into the same archive as the database (`backend/app/Support/UploadsBackup.php`). The local `storage/app/private` and `storage/app/public` are still included, but they're empty now.

## What runs

| When (server time) | Command | What it does |
|---|---|---|
| 03:00 | `backup:clean` | Deletes old backups (retention below). Never deletes the newest one. |
| 03:15 | `backup:run` | Dumps the database. Downloads every object from the two upload buckets into `storage/app/backup-temp`. Zips it all with `storage/app/private` and `storage/app/public`, encrypts the zip (AES-256), checks the zip opens, then uploads it to R2. Two tries, a minute apart. |
| 09:00 | `backup:monitor` | Alerts if the newest backup is more than a day old or the bucket uses more than 8 GB. |
| 12:00 | `backup:sweep-temp` | Deletes the unencrypted leftovers of a killed run, once they are 6 hours old. Runs even while backups are off. |

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
- **R2 uploads in the archive:** they sit under `r2-media/uploads/…` and `r2-documents/documents/…`, with the same names as on R2.
  - They're read with the uploads key and the zip is uploaded with the backups key.
    - Neither key can reach the other's bucket.
    - Backups refuse to run if `BACKUP_R2_BUCKET` is an upload bucket, or if the backups key is the uploads key. `backup:clean` keeps running meanwhile, so old archives still expire.
  - The copy starts only after the encryption check passes.
  - `backup:run --only-db` copies no uploads.
  - **Retries:** spatie's second try downloads the uploads again. That's free (R2 doesn't charge for downloads) and capped by the size limit.
  - **When uploads are left out:** the database is still backed up, and the error `Backup is missing uploads` reaches Sentry. This happens when:
    - a bucket can't be read;
    - a file downloads short;
    - the uploads are over the size limit, or don't fit on disk (see below).

    - A bucket that can't be read, or has a file that downloads short, is left out whole.
    - Uploads over the size limit or the free disk go in **partly**: the files that fit, shared fairly between accounts across both buckets. The smallest accounts go in whole, and the largest share what's left equally. The error says, per bucket, how many files and MB were left out. So one account's flood of documents or photos never pushes everyone else's files out of the backup.
      - Within an account, documents go first, then the newest files. Older files left out are still in the earlier archives (up to 88 days old), so raise the limit before those expire.
      - Photos uploaded before the uploads table existed have no owner row: each one still in use counts as its own small account. Files nothing references (left for `uploads:prune`) only get the room left at the end.
      - Nothing left out gets in on a later night until the limit is raised (or the disk freed); the error repeats every night until then.
    - Documents are copied first, so a problem with the photos never costs the medical records.
    - A file a user deletes while the run is copying is just skipped; it doesn't belong in the backup.
  - Only file names the app itself writes are copied: 40 random characters plus a short extension. That includes older uploads that kept theirs, such as `.bmp`. Anything else is skipped with a warning.
  - The privacy promise holds as before: a deleted file is gone from every new archive, and old archives expire within 88 days.
- **Space and size:** every archive holds a full copy of the uploads.
  - **Size limit:** `BACKUP_UPLOADS_MAX_MB`, 200 MB by default. About 38 archives fit under the 8 GB bucket limit, so above about 200 MB each copy would push old backups out early.
    - This also stops one user uploading gigabytes from wiping out the backup history.
    - Each account's documents are capped too: `DOCUMENTS_MAX_MB_PER_ACCOUNT` (50 MB) and `DOCUMENTS_MAX_PER_ACCOUNT` (300 files) across every pet it owns. A co-owner's uploads count against the pet's owner. Document photos are stored at most 2000 px on their longest side (a few hundred KB each), so 50 MB holds well over 100 photos; PDFs are stored as sent. The cap stops one account growing the bucket without limit; it does not keep the bucket under this limit (a few full accounts still pass it), so keep it well under this limit and watch for the alert.
    - When the alert comes, raise the limit together with `MaximumStorageInMegabytes` and `delete_oldest_backups_when_using_more_megabytes_than` in `config/backup.php` (R2 storage costs about $0.015 per GB-month), or switch the uploads to an incremental copy.
  - **Free disk:** a run needs about twice the upload total, for the copies plus a zip of everything (uploads and SQL dump). Each bucket is checked against that before it's copied, and only what fits goes in.
    - That check sees the filesystem, not the cPanel account's disk quota. The size limit is what keeps a run inside the quota.
    - If the quota fills while copying, that bucket is left out.
    - If it fills while zipping, the whole night's backup fails, database included. The failure alerts like any other.
- **Logs:** spatie's step-by-step log, with stack traces, goes to the host's `single` log file (`BACKUP_LOG_CHANNEL`). Only the short error messages above reach Sentry.
- **During a run:** the plain SQL dump and the plain copies of the uploads sit in `storage/app/backup-temp/temp`, outside the web root.
  - The upload copies are readable only by the hosting account.
  - Everything there is deleted when the run ends, even after a PHP fatal error.
  - **If the process is killed outright:** `backup:sweep-temp` deletes the leftovers at 12:00 once they're 6 hours old. It runs even while backups are switched off.
  - The run's lock expires after 2 hours, so a killed run can't block the next night.

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
   Inside are `db-dumps/mysql-<database>.sql`, `private/`, `public/`, and the R2 uploads under `r2-media/` and `r2-documents/`.
3. **Load the database** into an empty database (create a new one, don't overwrite the live one until you've checked the copy):
   ```sh
   mysql -u <user> -p <database> < db-dumps/mysql-<database>.sql
   ```
4. **Restore the files.**
   - **R2 uploads:** copy `r2-media/` and `r2-documents/` to the server, outside the web root (e.g. `~/restore/`). Then, from `~/pawpawcare/backend`:
     ```sh
     php artisan uploads:restore ~/restore --dry-run
     php artisan uploads:restore ~/restore
     rm -rf ~/restore
     ```
     It runs with the uploads key from `.env`.
     - **What it restores:** only files a record in the **current** database points at. Restore the database first if you're restoring both, so the photos users deleted since the backup don't become public again.
     - **Never overwrites:** a file still on R2 is left as it is, so it's safe against the live buckets.
     - **Symlinks** and file names the app never writes are skipped. With `--include-unreferenced`, so are files a browser would run (`.html`, `.svg`, `.js`, `.xml`), since media is served publicly.
     - **Bad copies:** a copy whose size on R2 doesn't match is deleted again and the command fails. Re-running retries it.
     - `--include-unreferenced` also restores files nothing points at. `uploads:prune` deletes those again within about two days.
   - **After restoring an older database,** re-apply the account deletions and purges made since that backup.
   - **Local files from before the move:** copy `private/` and `public/` into `backend/storage/app/`, then run `php artisan storage:link` if `public/storage` is missing.
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
3. Check that the counts look right and that a few files from `r2-documents/` and `r2-media/` open. The number of files should match the bucket's object count (`cf r2 buckets list` or the dashboard).
4. Run `docker rm -f drill` and delete the downloaded files. They are real medical records. If you tested with `BACKUP_DISK=backups-local`, also empty `storage/app/backups-local` and set `BACKUP_DISK=backups` again.
