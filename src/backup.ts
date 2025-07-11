import { exec, execSync } from "child_process";
import { S3Client, S3ClientConfig, PutObjectCommandInput } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, unlink, statSync } from "fs";
import { filesize } from "filesize";
import path from "path";
import os from "os";

import { env } from "./env.js";
import { createMD5 } from "./util.js";

const uploadToS3 = async ({ name, path }: { name: string, path: string }) => {
  console.log("Uploading backup to S3...");

  const bucket = env.AWS_S3_BUCKET;

  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE
  }

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);

    clientOptions.endpoint = env.AWS_S3_ENDPOINT;
  }

  if (env.BUCKET_SUBFOLDER) {
    name = env.BUCKET_SUBFOLDER + "/" + name;
  }

  let params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: name,
    Body: createReadStream(path),
  }

  if (env.SUPPORT_OBJECT_LOCK) {
    console.log("MD5 hashing file...");

    const md5Hash = await createMD5(path);

    console.log("Done hashing file");

    params.ContentMD5 = Buffer.from(md5Hash, 'hex').toString('base64');
  }

  const client = new S3Client(clientOptions);

  await new Upload({
    client,
    params: params
  }).done();

  console.log("Backup uploaded to S3...");
}

const dumpToFile = async (filePath: string, filename: string) => {
  console.log("Dumping convex backup to file...");

  await new Promise((resolve, reject) => {
    exec(`npx convex export --path ${filePath} --include-file-storage`, (error, stdout, stderr) => {
      if (error) {
        reject({ error: error, stderr: stderr.trimEnd() });
        return;
      }
      
      // not all text in stderr will be a critical error, print the error / warning
      if (stderr != "") {
        console.log({ stderr: stderr.trimEnd() });
      }

      // console.log("Backup archive file is valid");
      console.log("Backup filesize:", filesize(statSync(filePath).size));
      
      resolve(undefined);
    });
  });

  console.log("DB dumped to file...");
}

const deleteFile = async (path: string) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      reject({ error: err });
      return;
    });
    resolve(undefined);
  });
}

export const backup = async () => {
  console.log("Initiating DB backup...");

  const date = new Date().toISOString();
  const timestamp = date.replace(/[:.]+/g, '-');
  const filename = `${env.BACKUP_FILE_PREFIX}-${timestamp}.zip`;
  const filepath = path.join(os.tmpdir(), filename);

  await dumpToFile(filepath, filename);
  await uploadToS3({ name: filename, path: filepath });
  await deleteFile(filepath);

  console.log("DB backup complete...");
}
