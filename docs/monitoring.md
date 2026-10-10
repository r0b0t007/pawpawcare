# Monitoring

Everything alerts through Sentry (org `pawpawcare`, project `pawpawcare-api`). The **"Downtime and missed crons"** alert emails active members when any monitor below goes down or misses a check-in, and again when it recovers.

| Monitor | Kind | What fails it |
|---|---|---|
| API health: `GET https://api.pawpawcare.app/health` every 60 s | Uptime | 3 failed checks in a row (timeout 10 s). `/health` is 503 unless the app can sign logins, reach the database, and write to `storage/` (a full disk quota). The reason is logged as "Health check degraded: …", never returned. |
| Website: `GET https://pawpawcare.app/` every 5 min | Uptime | 2 failed checks in a row. |
| `reminders:send`, every minute | Cron (`->sentryMonitor()` in `routes/console.php`) | No check-in within 5 minutes, i.e. the cPanel `schedule:run` cron stopped. |
| `backup:run`, nightly at 03:15 | Cron | Missed or failed run (see `docs/backups.md`). |

Errors and the "high priority issues" alerts are separate and cover crashes in the app and the API.

**When you add a cron monitor**, connect it to the "Downtime and missed crons" alert (Sentry → Alerts → edit → Sources). A monitor with no alert connected sends nothing. The `backup:run` monitor is created by its first scheduled run.
