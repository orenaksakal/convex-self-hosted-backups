import { exec } from "child_process";
import {
  S3Client,
  S3ClientConfig,
  PutObjectCommandInput,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, unlink, statSync } from "fs";
import { filesize } from "filesize";
import path from "path";
import os from "os";

import { env, BackendConfig, BackupFrequency, getMaxBackups } from "./env.js";
import { createMD5 } from "./util.js";

function getS3Client(): S3Client {
  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
  };

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);
    clientOptions.endpoint = env.AWS_S3_ENDPOINT;
  }

  return new S3Client(clientOptions);
}

function buildS3Key(filename: string, backendName: string, frequency: BackupFrequency): string {
  const parts: string[] = [];

  if (env.BUCKET_SUBFOLDER) {
    parts.push(env.BUCKET_SUBFOLDER);
  }

  parts.push(backendName);
  parts.push(frequency);
  parts.push(filename);

  return parts.join("/");
}

function buildS3Prefix(backendName: string, frequency: BackupFrequency): string {
  const parts: string[] = [];

  if (env.BUCKET_SUBFOLDER) {
    parts.push(env.BUCKET_SUBFOLDER);
  }

  parts.push(backendName);
  parts.push(frequency);

  return parts.join("/") + "/";
}

const uploadToS3 = async (client: S3Client, key: string, filePath: string) => {
  console.log(`Uploading backup to S3: ${key}`);

  let params: PutObjectCommandInput = {
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    Body: createReadStream(filePath),
  };

  if (env.SUPPORT_OBJECT_LOCK) {
    console.log("MD5 hashing file...");
    const md5Hash = await createMD5(filePath);
    console.log("Done hashing file");
    params.ContentMD5 = Buffer.from(md5Hash, "hex").toString("base64");
  }

  await new Upload({
    client,
    params,
  }).done();

  console.log("Backup uploaded to S3.");
};

const enforceRetention = async (
  client: S3Client,
  backendName: string,
  frequency: BackupFrequency
) => {
  const maxBackups = getMaxBackups(frequency);
  const prefix = buildS3Prefix(backendName, frequency);

  console.log(`Checking retention for ${prefix} (max: ${maxBackups})...`);

  const listResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: env.AWS_S3_BUCKET,
      Prefix: prefix,
    })
  );

  const objects = listResponse.Contents ?? [];

  if (objects.length <= maxBackups) {
    console.log(`Retention OK: ${objects.length}/${maxBackups} backups.`);
    return;
  }

  // Sort by key (timestamp-based, lexicographic = chronological)
  objects.sort((a, b) => (a.Key ?? "").localeCompare(b.Key ?? ""));

  const toDelete = objects.slice(0, objects.length - maxBackups);
  console.log(`Deleting ${toDelete.length} old backup(s)...`);

  await client.send(
    new DeleteObjectsCommand({
      Bucket: env.AWS_S3_BUCKET,
      Delete: {
        Objects: toDelete.map((obj) => ({ Key: obj.Key })),
      },
    })
  );

  console.log(`Deleted ${toDelete.length} old backup(s).`);
};

const dumpToFile = async (
  filePath: string,
  backend: BackendConfig
) => {
  console.log(`Dumping convex backup for "${backend.name}" to file...`);

  await new Promise<void>((resolve, reject) => {
    const cmd = `npx convex export --path ${filePath}${env.INCLUDE_FILE_STORAGE ? " --include-file-storage" : ""}`;
    exec(
      cmd,
      {
        env: {
          ...process.env,
          CONVEX_URL: backend.url,
          CONVEX_SELF_HOSTED_URL: backend.url,
          CONVEX_SELF_HOSTED_ADMIN_KEY: backend.adminKey,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trimEnd() || error.message));
          return;
        }

        if (stderr != "") {
          console.log({ stderr: stderr.trimEnd() });
        }

        console.log("Backup filesize:", filesize(statSync(filePath).size));
        resolve();
      }
    );
  });

  console.log("DB dumped to file.");
};

const deleteFile = async (filePath: string) => {
  console.log("Deleting temp file...");
  await new Promise<void>((resolve, reject) => {
    unlink(filePath, (err) => {
      if (err) {
        reject({ error: err });
        return;
      }
      resolve();
    });
  });
};

export const backup = async (
  backend: BackendConfig,
  frequency: BackupFrequency
) => {
  console.log(`\nStarting ${frequency} backup for backend "${backend.name}"...`);

  const date = new Date().toISOString();
  const timestamp = date.replace(/[:.]+/g, "-");
  const filename = `${backend.name}-${env.BACKUP_FILE_PREFIX}-${timestamp}.zip`;
  const filepath = path.join(os.tmpdir(), filename);

  const s3Key = buildS3Key(filename, backend.name, frequency);
  const client = getS3Client();

  await dumpToFile(filepath, backend);
  await uploadToS3(client, s3Key, filepath);
  await deleteFile(filepath);
  await enforceRetention(client, backend.name, frequency);

  console.log(`${frequency} backup for "${backend.name}" complete.`);
};
