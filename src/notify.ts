import { exec } from "child_process";
import { env } from "./env.js";

export const sendFailureNotification = async (message: string): Promise<void> => {
  if (!env.SHOUTRRR_URL) {
    return;
  }

  console.log("Sending failure notification via shoutrrr...");

  try {
    await new Promise<void>((resolve, reject) => {
      exec(
        `shoutrrr send -u "${env.SHOUTRRR_URL}" -m "${message.replace(/"/g, '\\"')}"`,
        (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`shoutrrr failed: ${stderr.trimEnd()}`));
            return;
          }
          resolve();
        }
      );
    });
    console.log("Failure notification sent.");
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
};
