import { CronJob } from "cron";
import { readdirSync, unlinkSync, statSync, existsSync } from "fs";
import path from "path";
import { backup } from "./backup.js";
import { env, parseBackends, BACKUP_SCHEDULES, BackupFrequency, BackendConfig, getExportsPath } from "./env.js";
import { sendFailureNotification } from "./notify.js";

console.log("NodeJS Version: " + process.version);

const backends = parseBackends();

console.log(`Configured ${backends.length} backend(s): ${backends.map(b => b.name).join(", ")}`);
console.log(`Backup frequencies: ${BACKUP_SCHEDULES.map(f => `${f.frequency} (${f.schedule})`).join(", ")}`);

const runBackupCycle = async (frequency: BackupFrequency) => {
  for (const backend of backends) {
    try {
      await backup(backend, frequency);
    } catch (error) {
      const msg = `Backup failed for "${backend.name}" (${frequency}): ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg, error);
      await sendFailureNotification(msg);
      process.exit(1);
    }

    cleanExports(backend);
  }
};

const cleanExports = (backend: BackendConfig) => {
  const exportsPath = getExportsPath(backend);
  if (!exportsPath) {
    console.log(`No dockerAppId configured for "${backend.name}", skipping export cleanup.`);
    return;
  }
  if (!existsSync(exportsPath)) {
    console.log(`Export path does not exist: ${exportsPath}`);
    return;
  }

  try {
    const entries = readdirSync(exportsPath);
    let deleted = 0;
    for (const entry of entries) {
      const fullPath = path.join(exportsPath, entry);
      if (statSync(fullPath).isFile()) {
        unlinkSync(fullPath);
        deleted++;
      }
    }
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} export file(s) from ${exportsPath} for "${backend.name}"`);
    }
  } catch (error) {
    console.error(`Error cleaning exports for "${backend.name}":`, error);
  }
};

if (env.RUN_ON_STARTUP || env.SINGLE_SHOT_MODE) {
  console.log("Running on start backup...");

  // On startup / single-shot, run all frequencies
  for (const { frequency } of BACKUP_SCHEDULES) {
    await runBackupCycle(frequency);
  }

  if (env.SINGLE_SHOT_MODE) {
    console.log("Database backup complete, exiting...");
    process.exit(0);
  }
}

for (const { frequency, schedule } of BACKUP_SCHEDULES) {
  const job = new CronJob(schedule, async () => {
    await runBackupCycle(frequency);
  });

  job.start();
  console.log(`Scheduled ${frequency} backup: ${schedule}`);
}

console.log("All backup crons scheduled.");
