import { CronJob } from "cron";
import { exec } from "child_process";
import { backup } from "./backup.js";
import { env, parseBackends, BACKUP_SCHEDULES, BackupFrequency, BackendConfig } from "./env.js";
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

    await cleanExports(backend);
  }
};

const cleanExports = async (backend: BackendConfig) => {
  if (!backend.dockerContainer) {
    console.log(`No dockerContainer configured for "${backend.name}", skipping export cleanup.`);
    return;
  }

  const containerId = backend.dockerContainer;
  const exportsPath = "/data/storage/exports";
  const cmd = `docker exec ${containerId} sh -c 'rm -f ${exportsPath}/*'`;

  console.log(`Cleaning exports for "${backend.name}" via docker exec...`);

  await new Promise<void>((resolve) => {
    exec(cmd, (error, _stdout, stderr) => {
      if (error) {
        console.error(`Error cleaning exports for "${backend.name}":`, stderr || error.message);
      } else {
        console.log(`Export cleanup complete for "${backend.name}".`);
      }
      resolve();
    });
  });
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
