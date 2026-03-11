import { readdirSync, unlinkSync, statSync } from "fs";
import path from "path";

export const cleanupVolume = (cleanupPath: string) => {
  console.log(`Cleaning up files in ${cleanupPath}...`);

  let deletedCount = 0;
  const entries = readdirSync(cleanupPath);

  for (const entry of entries) {
    const fullPath = path.join(cleanupPath, entry);
    const stat = statSync(fullPath);

    // Only delete files, not subdirectories (safety measure)
    if (stat.isFile()) {
      console.log(`Deleting: ${fullPath}`);
      unlinkSync(fullPath);
      deletedCount++;
    }
  }

  console.log(`Cleanup complete: deleted ${deletedCount} file(s).`);
};
