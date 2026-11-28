import { sha256OfBytes } from "@/lib/db/burn-photos";
import { isJpeg } from "@/lib/schemas";
import type { BurnPhoto, BurnPhotoBackup, InvestigationPhoto, InvestigationPhotoBackup } from "@/lib/types";

/**
 * Photos in backups (v0.2 BurnMatrix, docs/v0.2-burnmatrix.md "Backup format 4").
 * Everything in `src/lib/backup` handles photos in their backup form
 * (`BurnPhotoBackup`, bytes as standard base64 with padding). These
 * conversions are synchronous, so they may run inside a Dexie transaction.
 */

const CHUNK = 0x8000;

/** Standard base64 with padding (RFC 4648 section 4). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes standard base64. Returns null when the text is not canonical padded base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Canonical only: re-encoding must give the same text (no stray padding bits).
  if (bytesToBase64(bytes) !== text) return null;
  return bytes;
}

/** Every stored photo kind with its bytes, and its backup form (v0.3 CandleFix adds investigation photos). */
type StoredPhoto = BurnPhoto | InvestigationPhoto;
type BackupPhoto = BurnPhotoBackup | InvestigationPhotoBackup;
type ToBackup<P> = P extends BurnPhoto ? BurnPhotoBackup : InvestigationPhotoBackup;
type FromBackup<P> = P extends BurnPhotoBackup ? BurnPhoto : InvestigationPhoto;

/** The stored photo as a backup file holds it. */
export function photoToBackup<P extends StoredPhoto>(photo: P): ToBackup<P> {
  const { bytes, ...fields } = photo;
  return { ...fields, dataBase64: bytesToBase64(bytes) } as unknown as ToBackup<P>;
}

/** The backup photo as the device stores it. Only for photos that passed `checkPhotoData`. */
export function photoFromBackup<P extends BackupPhoto>(photo: P): FromBackup<P> {
  const { dataBase64, ...fields } = photo;
  const bytes = base64ToBytes(dataBase64);
  if (!bytes) throw new TypeError(`Photo ${photo.id} has invalid base64.`);
  return { ...fields, bytes } as unknown as FromBackup<P>;
}

/** A photo's fields without its bytes: what restore classification compares (`sha256` stands for the bytes). */
export function photoIdentity(photo: BackupPhoto): Omit<BackupPhoto, "dataBase64"> {
  const { dataBase64: _bytes, ...fields } = photo;
  void _bytes;
  return fields;
}

/**
 * Checks a backup photo's bytes: canonical base64, the decoded length equals
 * `byteLength`, a JPEG marker, and the SHA-256 equals `sha256`. Returns the
 * problem in plain words, or null when the photo is sound.
 */
export async function checkPhotoData(photo: BackupPhoto): Promise<string | null> {
  const bytes = base64ToBytes(photo.dataBase64);
  if (!bytes) return "photo data is not valid base64";
  if (bytes.length !== photo.byteLength) return "photo data does not match its size";
  if (!isJpeg(bytes)) return "photo data is not a JPEG";
  if ((await sha256OfBytes(bytes)) !== photo.sha256) return "photo data does not match its checksum";
  return null;
}
