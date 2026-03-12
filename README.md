
# Convex Backups

Backup script for self-hosted Convex instances. Exports your database (and optionally file storage) via `npx convex export`, uploads to S3-compatible storage, and manages retention policies. Backups are importable to any Convex instance via `npx convex import`.

## Features

- **Multi-backend support** — back up multiple Convex instances in a single deployment
- **Multiple backup frequencies** — automatic hourly, daily, weekly, and monthly schedules with configurable retention
- **S3-compatible storage** — works with AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.
- **File storage backups** — optionally include Convex file storage in exports
- **Automatic retention** — old backups are pruned per frequency
- **Failure notifications** — get notified via Telegram (or any shoutrrr-supported service) when backups fail
- **Single-shot mode** — run once and exit, for use with external schedulers (e.g. Kubernetes CronJobs)

## Environment Variables

### Convex Backend Configuration

You can configure a single backend using legacy env vars, or multiple backends using `CONVEX_BACKENDS`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONVEX_BACKENDS` | No | | Comma-separated backend configs (see format below). Takes priority over legacy vars. |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | No* | | Admin key for your self-hosted instance. *Required if `CONVEX_BACKENDS` is not set. |
| `CONVEX_SELF_HOSTED_URL` | No* | | API URL for your self-hosted instance. *Required if `CONVEX_BACKENDS` is not set. |
| `CONVEX_URL` | No | | Alternative Convex URL. |

**`CONVEX_BACKENDS` format:** `name|url|adminKey` per backend, comma-separated for multiple. The `name` is used as the S3 folder for that backend's backups.

```
CONVEX_BACKENDS=my-app|https://my-app.convex.cloud|adminKey1,my-blog|https://my-blog.convex.cloud|adminKey2
```

For single-backend setups using legacy env vars, the folder name defaults to `BACKUP_FILE_PREFIX` (which defaults to `backup`).

### S3 Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | Yes | | AWS access key ID. |
| `AWS_SECRET_ACCESS_KEY` | Yes | | AWS secret access key. |
| `AWS_S3_BUCKET` | Yes | | S3 bucket name. |
| `AWS_S3_REGION` | Yes | | Bucket region (set to `auto` if unknown). |
| `AWS_S3_ENDPOINT` | No | | Custom S3 endpoint for third-party services (Cloudflare R2, Backblaze B2, MinIO, etc.). |
| `AWS_S3_FORCE_PATH_STYLE` | No | `false` | Use path-style URLs instead of subdomain-style. Useful for MinIO. |

### Backup Schedules

Backups run automatically on fixed schedules:

| Frequency | Schedule |
|---|---|
| Hourly | Every hour at :00 |
| Daily | Every day at midnight |
| Weekly | Every Sunday at midnight |
| Monthly | 1st of every month at midnight |

### Retention Limits

Maximum number of backups to keep per frequency. Oldest backups are deleted first.

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAX_HOURLY_BACKUPS` | No | `24` | Max hourly backups to retain. |
| `MAX_DAILY_BACKUPS` | No | `7` | Max daily backups to retain. |
| `MAX_WEEKLY_BACKUPS` | No | `4` | Max weekly backups to retain. |
| `MAX_MONTHLY_BACKUPS` | No | `12` | Max monthly backups to retain. |

### Backup Options

| Variable | Required | Default | Description |
|---|---|---|---|
| `BACKUP_FILE_PREFIX` | No | `backup` | Prefix for backup filenames. |
| `BUCKET_SUBFOLDER` | No | | Subfolder within the bucket to store backups. |
| `INCLUDE_FILE_STORAGE` | No | `false` | Include file storage in the backup export. |
| `SUPPORT_OBJECT_LOCK` | No | `false` | Enable MD5 hashing for buckets with object lock. |
| `RUN_ON_STARTUP` | No | `false` | Run a backup immediately on startup, then continue on schedule. |
| `SINGLE_SHOT_MODE` | No | `false` | Run a single backup and exit. Useful with external cron schedulers. |


### Notifications

Failure notifications are sent via [shoutrrr](https://github.com/containrrr/shoutrrr). When `SHOUTRRR_URL` is set, you'll be notified whenever a backup fails.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHOUTRRR_URL` | No | | Shoutrrr notification URL. Empty = notifications disabled. |

**Telegram example:**

```
SHOUTRRR_URL=telegram://bottoken@telegram?chats=chatid
```

To set up Telegram notifications:
1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the bot token
2. Send a message to your bot, then get your chat ID from `https://api.telegram.org/bot<token>/getUpdates`
3. Set `SHOUTRRR_URL=telegram://<token>@telegram?chats=<chatid>`

Shoutrrr supports many other services (Discord, Slack, email, etc.) — see the [shoutrrr docs](https://containrrr.dev/shoutrrr/v0.8/services/overview/) for all supported URLs.

## Multi-Backend Example

Back up two Convex instances with custom retention:

```env
CONVEX_BACKENDS=my-app|https://my-app.convex.cloud|appAdminKey,my-blog|https://my-blog.convex.cloud|blogAdminKey

MAX_HOURLY_BACKUPS=48
MAX_DAILY_BACKUPS=14
MAX_WEEKLY_BACKUPS=8
MAX_MONTHLY_BACKUPS=24

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=my-backups
AWS_S3_REGION=us-east-1

SHOUTRRR_URL=telegram://bottoken@telegram?chats=chatid
```

This creates the following S3 structure (one folder per backend name):
```
my-backups/
  my-app/
    hourly/
      backup-2024-01-01T05-00-00-000Z.zip
    daily/
      backup-2024-01-01T00-00-00-000Z.zip
    weekly/
      backup-2024-01-07T00-00-00-000Z.zip
    monthly/
      backup-2024-02-01T00-00-00-000Z.zip
  my-blog/
    hourly/
      backup-2024-01-01T05-00-00-000Z.zip
    daily/
      backup-2024-01-01T00-00-00-000Z.zip
    weekly/
      backup-2024-01-07T00-00-00-000Z.zip
    monthly/
      backup-2024-02-01T00-00-00-000Z.zip
```
