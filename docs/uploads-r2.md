# Uploads on Cloudflare R2

User files move off the cPanel disk to two R2 buckets:

| Bucket | Holds | Reached through |
|---|---|---|
| `pawpawcare-media` | Avatars, post and lost-pet photos (already public today, behind 40-character random names) | `https://media.pawpawcare.app/uploads/<name>`, a custom domain on the bucket |
| `pawpawcare-documents` | Medical documents (vault) | Nothing public. `GET /documents/{id}/raw` checks the signed link as before, then redirects to a **5-minute presigned R2 URL** for that one object. |

The code is in `backend/app/Support/Uploads.php`, with the disks `r2-media` and `r2-documents` in `backend/config/filesystems.php`. Which disks are used is set by `UPLOADS_PUBLIC_DISK` and `UPLOADS_PRIVATE_DISK`. They default to the local `public` / `local` disks, which is also what dev and tests use.

## What changes for the app

Nothing needs an app update:
- **Images:** new image URLs are absolute (`https://media.pawpawcare.app/...`). `resolveAsset()` already passes absolute URLs through.
- **Documents:** the document link is still `/documents/{id}/raw`. It now answers with a redirect, which `Linking.openURL` and browsers follow.
- **Vet share page:** its document links last as long as the share link. They keep working because each visit mints a fresh presigned URL.
- **Old cached image URLs:** an app version holding an old `/storage/uploads/...` value may send it back on an edit. The models store it in the current form (`Uploads::canonicalUrl`), so the image isn't treated as replaced and deleted.

## Setup (once)

Steps marked **owner** need the dashboard or secrets. Everything else uses the `cf` CLI from the repo root and needs the owner's OK, because it changes the live account.

1. **Create the buckets.** Use a Western North America hint so they sit near the Phoenix server; backups deliberately sit in `enam`.
   ```sh
   cf r2 buckets create --name pawpawcare-media --location-hint wnam
   cf r2 buckets create --name pawpawcare-documents --location-hint wnam
   ```
2. **Make media public on its own domain**, and only there:
   ```sh
   # --zone-id is pawpawcare.app's zone ID (dashboard → the zone's Overview, or `cf zones list`).
   cf r2 buckets domains custom create pawpawcare-media --domain media.pawpawcare.app --zone-id <zone-id> --min-tls 1.2
   # Check: no r2.dev URL on either bucket, and no domain at all on documents.
   cf r2 buckets domains managed list --bucket-name pawpawcare-media
   cf r2 buckets domains managed list --bucket-name pawpawcare-documents
   cf r2 buckets domains custom list --bucket-name pawpawcare-documents
   ```
   `curl -I https://media.pawpawcare.app/` should answer 404 and not list anything.
3. **Create the access keys** (owner). Go to R2 → Manage API tokens → Create API token:
   - Permission: **Object Read & Write**.
   - Scope: **only `pawpawcare-media` and `pawpawcare-documents`**. This is a separate token from the backups one, so neither key can touch the other's bucket.
   - TTL: forever.

   Paste the Access Key ID, Secret Access Key and endpoint straight into the server `.env` (step 4), never into a chat or a commit.
4. **Fill in the server `.env`** (owner). Leave the two `UPLOADS_*_DISK` lines out for now:
   ```
   UPLOADS_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   UPLOADS_R2_ACCESS_KEY_ID=...
   UPLOADS_R2_SECRET_ACCESS_KEY=...
   UPLOADS_R2_MEDIA_BUCKET=pawpawcare-media
   UPLOADS_R2_DOCUMENTS_BUCKET=pawpawcare-documents
   MEDIA_URL=https://media.pawpawcare.app
   ```

## Switch over

Run these in the cPanel terminal, one line at a time, from `~/pawpawcare/backend`.

The whole switch runs in **maintenance mode**, which takes about a minute. Without it, a photo or document deleted between steps 2 and 5 would be deleted from R2, where it isn't yet. Its local copy would survive, and step 5 would copy it up again. The API answers 503 meanwhile, and the Sentry uptime alert fires after 3 minutes, so keep it short.

0. `php artisan down --retry=60`
1. Add the two switch lines to `.env`:
   ```
   UPLOADS_PUBLIC_DISK=r2-media
   UPLOADS_PRIVATE_DISK=r2-documents
   ```
2. `php artisan config:cache`
3. `php artisan uploads:check`. It writes, reads, fetches and deletes a test file on each bucket: media through `MEDIA_URL`, documents through a presigned URL. If it fails, remove the two lines, run `php artisan config:cache` again, and nothing has changed.
4. `php artisan uploads:migrate --dry-run` lists what would move.
5. `php artisan uploads:migrate` copies every local file to R2 and checks each size. Only then does it rewrite stored `/storage/uploads/...` URLs to `MEDIA_URL/...` and delete the local copies. It's safe to re-run.
6. `php artisan up`
7. **Check in the app:** existing photos still show, a vault document opens, and a new photo upload works.

After this, every deploy runs `uploads:check`. A failure shows as a warning and a Sentry error, and never fails the deploy.

**`MEDIA_URL` is permanent once set.** Every stored image URL contains it.
- **If it's removed:** `uploads:prune` refuses to run and new uploads fail, so nothing is lost.
- **If it's changed:** existing images keep their old addresses, and those stop loading if the old domain goes away. Prune still keeps them, because it matches on the `uploads/<name>` ending, not the domain.

**Rollback** (still in maintenance mode):
- **Before step 5:** remove the two lines and run `config:cache`.
- **If anything was uploaded while on R2,** even just before step 5, those files exist only on R2. Their records hold `MEDIA_URL/...` addresses, which the local disk doesn't serve and prune doesn't scan.
- **After step 5:** the files live only on R2, so going back means copying them down first. There's no command for that yet.

## Good to know

- **Backups:** the nightly backup copies every object in both buckets into the encrypted archive, next to the database ([backups.md](backups.md)). That covers what R2's own redundancy doesn't: a delete made by the app, or by someone holding the uploads key. `uploads:restore` puts files back.
- **Deleted photos:** they disappear from R2 immediately. Cloudflare's edge may serve a cached copy for up to its default TTL (about 2 hours), since objects are uploaded without a `Cache-Control` header.
  - Don't add a long `immutable` cache header: a deleted avatar would then stay reachable for that long.
- **Costs:** the free tier is 10 GB, 1M writes and 10M reads a month, and egress is free.
  - Image views are served from cache.
  - Each document open is one PHP request plus one R2 read.
