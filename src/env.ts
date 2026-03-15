import { envsafe, str, bool, num } from "envsafe";

export const env = envsafe({
  // Legacy single-backend env vars (used as fallback when CONVEX_BACKENDS is not set)
  CONVEX_SELF_HOSTED_ADMIN_KEY: str({
    default: '',
    allowEmpty: true,
  }),
  CONVEX_SELF_HOSTED_URL: str({
    default: '',
    allowEmpty: true,
  }),
  CONVEX_URL: str({
    default: '',
    allowEmpty: true,
  }),

  // Multi-backend config: "name1::url1::adminKey1,name2::url2::adminKey2"
  CONVEX_BACKENDS: str({
    desc: 'Comma-separated backend configs: name::url::adminKey',
    default: '',
    allowEmpty: true,
  }),

  AWS_ACCESS_KEY_ID: str(),
  AWS_SECRET_ACCESS_KEY: str(),
  AWS_S3_BUCKET: str(),
  AWS_S3_REGION: str(),

  // Retention limits per frequency
  MAX_HOURLY_BACKUPS: num({
    desc: 'Maximum number of hourly backups to keep.',
    default: 24,
  }),
  MAX_DAILY_BACKUPS: num({
    desc: 'Maximum number of daily backups to keep.',
    default: 7,
  }),
  MAX_WEEKLY_BACKUPS: num({
    desc: 'Maximum number of weekly backups to keep.',
    default: 4,
  }),
  MAX_MONTHLY_BACKUPS: num({
    desc: 'Maximum number of monthly backups to keep.',
    default: 12,
  }),

  AWS_S3_ENDPOINT: str({
    desc: 'The S3 custom endpoint you want to use.',
    default: '',
    allowEmpty: true,
  }),
  AWS_S3_FORCE_PATH_STYLE: bool({
    desc: 'Use path style for the endpoint instead of the default subdomain style, useful for MinIO',
    default: false,
    allowEmpty: true,
  }),
  RUN_ON_STARTUP: bool({
    desc: 'Run a backup on startup of this application',
    default: false,
    allowEmpty: true,
  }),
  BACKUP_FILE_PREFIX: str({
    desc: 'Prefix to the file name',
    default: 'backup',
  }),
  BUCKET_SUBFOLDER: str({
    desc: 'A subfolder to place the backup files in',
    default: '',
    allowEmpty: true,
  }),
  SINGLE_SHOT_MODE: bool({
    desc: 'Run a single backup on start and exit when completed',
    default: false,
    allowEmpty: true,
  }),
  INCLUDE_FILE_STORAGE: bool({
    desc: 'Include file storage in the backup export',
    default: false,
  }),
  SUPPORT_OBJECT_LOCK: bool({
    desc: 'Enables support for buckets with object lock by providing an MD5 hash with the backup file',
    default: false,
  }),
  SHOUTRRR_URL: str({
    desc: 'Shoutrrr notification URL (e.g. telegram://token@telegram?chats=chatId). Empty = disabled.',
    default: '',
    allowEmpty: true,
  }),
});

export type BackendConfig = {
  name: string;
  url: string;
  adminKey: string;
};


export type BackupFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export function parseBackends(): BackendConfig[] {
  if (env.CONVEX_BACKENDS) {
    return env.CONVEX_BACKENDS.split(',').map(entry => {
      const parts = entry.trim().split('::');
      if (parts.length !== 3) {
        throw new Error(`Invalid CONVEX_BACKENDS entry: "${entry}". Expected format: name::url::adminKey`);
      }
      return {
        name: parts[0],
        url: parts[1],
        adminKey: parts[2],
      };
    });
  }

  // Fallback to legacy single-backend env vars
  if (!env.CONVEX_SELF_HOSTED_URL || !env.CONVEX_SELF_HOSTED_ADMIN_KEY) {
    throw new Error('Either CONVEX_BACKENDS or CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY must be set.');
  }

  return [{
    name: env.BACKUP_FILE_PREFIX,
    url: env.CONVEX_SELF_HOSTED_URL,
    adminKey: env.CONVEX_SELF_HOSTED_ADMIN_KEY,
  }];
}

// Generate randomized but non-overlapping cron schedules.
// Each frequency gets a unique random minute (0-59) and hour (0-5) so backups never collide.
function generateBackupSchedules(): { frequency: BackupFrequency; schedule: string }[] {
  const usedSlots = new Set<string>();

  const randomSlot = (): { minute: number; hour: number } => {
    let minute: number, hour: number, key: string;
    do {
      minute = Math.floor(Math.random() * 60);
      hour = Math.floor(Math.random() * 6); // early morning hours 0-5
      key = `${hour}:${minute}`;
    } while (usedSlots.has(key));
    usedSlots.add(key);
    return { minute, hour };
  };

  const hourlySlot = randomSlot();
  const dailySlot = randomSlot();
  const weeklySlot = randomSlot();
  const monthlySlot = randomSlot();

  return [
    { frequency: 'hourly', schedule: `${hourlySlot.minute} * * * *` },
    { frequency: 'daily', schedule: `${dailySlot.minute} ${dailySlot.hour} * * *` },
    { frequency: 'weekly', schedule: `${weeklySlot.minute} ${weeklySlot.hour} * * 0` },
    { frequency: 'monthly', schedule: `${monthlySlot.minute} ${monthlySlot.hour} 1 * *` },
  ];
}

export const BACKUP_SCHEDULES = generateBackupSchedules();

export function getMaxBackups(frequency: BackupFrequency): number {
  const map: Record<BackupFrequency, number> = {
    hourly: env.MAX_HOURLY_BACKUPS,
    daily: env.MAX_DAILY_BACKUPS,
    weekly: env.MAX_WEEKLY_BACKUPS,
    monthly: env.MAX_MONTHLY_BACKUPS,
  };
  return map[frequency];
}
