import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

const RECORDING_URL_EXPIRY_SECONDS = 3600;

let s3Client: S3Client;

export function initStorage(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const region = process.env.R2_REGION || "auto";

  if (!endpoint) {
    throw new Error("R2_ENDPOINT not set in environment");
  }

  s3Client = new S3Client({
    region: region,
    endpoint: endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY || "",
      secretAccessKey: process.env.R2_SECRET_KEY || "",
    },
  });

  console.log("[Storage] S3/R2 client initialized");
  return s3Client;
}

export function getStorageClient(): S3Client {
  if (!s3Client) {
    throw new Error("Storage not initialized. Call initStorage() first.");
  }
  return s3Client;
}

export async function uploadRecording(
  key: string,
  stream: Readable,
  contentType: string = "audio/mpeg"
): Promise<string> {
  const client = getStorageClient();

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET || "alhabla-recordings",
    Key: key,
    Body: stream,
    ContentType: contentType,
  });

  await client.send(command);

  // Return the storage location used by the app for later retrieval.
  return getStorageUrl(key);
}

export function getStorageUrl(key: string): string {
  const endpoint = process.env.R2_ENDPOINT || "";
  const bucket = process.env.R2_BUCKET || "alhabla-recordings";
  return `${endpoint}/${bucket}/${key}`;
}

/**
 * El bucket es privado (grabaciones = datos personales de clientes reales,
 * RGPD). getStorageUrl() no sirve para reproducir nada — devuelve una URL
 * de la API S3 sin firmar, que R2 rechaza. Esta genera una URL temporal
 * válida solo durante RECORDING_URL_EXPIRY_SECONDS, pensada para pedirse en
 * el momento en que el frontend va a reproducir la grabación, no para
 * guardarse en la base de datos (caducaría).
 */
export async function getSignedRecordingUrl(key: string): Promise<string> {
  const client = getStorageClient();
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET || "alhabla-recordings",
    Key: key,
  });
  return getSignedUrl(client, command, {
    expiresIn: RECORDING_URL_EXPIRY_SECONDS,
  });
}

export async function deleteStorageObject(key: string): Promise<void> {
  const client = getStorageClient();
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET || "alhabla-recordings",
    Key: key,
  });
  await client.send(command);
}
