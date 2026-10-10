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
- **Alerts:** there is no email. Each of these problems logs an error, which the `sentry` log channel turns into a Sentry issue:
  - a failed run, failed cleanup, or unhealthy backups;
  - backups not being configured (logged every night at 03:15 until they are).

  `backup:run` also has a Sentry cron monitor, so a night with no run at all raises an alert.
- **Never half-configured:** `App\Support\Backups::ready()` blocks the scheduled jobs until the bucket, the keys and an archive password are all set. Nothing ever goes out unencrypted.

## One-time setup

1. **Turn on R2** (owner, in the dashboard). Go to dash.cloudflare.com → R2 Object Storage → turn it on. The free tier is 10 GB, but Cloudflare still asks for a payment method. This is the only step the `cf` CLI can't do; until it's done, the API answers `10042 Please enable R2 through the Cloudflare Dashboard`.
2. **Create the bucket** with the `cf` CLI. Use an Eastern North America hint so the backups sit in a different region from the Phoenix server:
   ```sh
   cf r2 buckets create --name pawpawcare-backups --location-hint enam
   ```
   Buckets are private unless you turn on public access. Leave it off.
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
6. **Run a first backup by hand** in the cPanel terminal:
   ```sh
   php artisan backup:run && php artisan backup:list
   ```
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
4. Run `docker rm -f drill` and delete the downloaded files. They are real medical records.
