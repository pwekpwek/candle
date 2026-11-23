import { describe, expect, it } from "vitest";
import { BackupEnvelopeSchema } from "@/lib/schemas";
import { backupData, backupEnvelope, omit } from "./sample";

const envelope = backupEnvelope;

/** A valid envelope with some top-level fields replaced. */
function envelopeWith(patch: Record<string, unknown>): unknown {
  return { ...envelope, ...patch };
}

describe("BackupEnvelopeSchema", () => {
  it("accepts a valid backup file", () => {
    expect(BackupEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("accepts an empty backup with zero counts", () => {
    const empty = {
      ...envelope,
      counts: { materials: 0, formulas: 0, formulaVersions: 0, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 },
      data: { materials: [], formulas: [], formulaVersions: [], measurements: [], batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [] },
    };
    expect(BackupEnvelopeSchema.safeParse(empty).success).toBe(true);
  });

  it("accepts a file from a newer format or schema number (the restore step decides whether it is understood)", () => {
    expect(BackupEnvelopeSchema.safeParse(envelopeWith({ formatVersion: 2, schemaVersion: 7 })).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a different format name", envelopeWith({ format: "other-backup" })],
    ["formatVersion 0", envelopeWith({ formatVersion: 0 })],
    ["a fractional formatVersion", envelopeWith({ formatVersion: 1.5 })],
    ["schemaVersion 0", envelopeWith({ schemaVersion: 0 })],
    ["an empty appVersion", envelopeWith({ appVersion: "" })],
    ["a non-ISO exportedAt", envelopeWith({ exportedAt: "14/11/2026 06:05" })],
    ["an exportedAt with an offset", envelopeWith({ exportedAt: "2026-11-14T06:05:12+01:00" })],
    ["a negative materials count", envelopeWith({ counts: { ...envelope.counts, materials: -1 } })],
    ["a fractional formulas count", envelopeWith({ counts: { ...envelope.counts, formulas: 1.5 } })],
    [
      "a counts object with an extra store",
      envelopeWith({ counts: { ...envelope.counts, drafts: 0 } }),
    ],
    ["a counts object missing a store", envelopeWith({ counts: omit(envelope.counts, "measurements") })],
    ["a checksum algorithm other than SHA-256", envelopeWith({ checksum: { algorithm: "MD5", value: "a".repeat(64) } })],
    ["a checksum that is too short", envelopeWith({ checksum: { algorithm: "SHA-256", value: "a".repeat(63) } })],
    ["a checksum that is too long", envelopeWith({ checksum: { algorithm: "SHA-256", value: "a".repeat(65) } })],
    ["a checksum with non-hex characters", envelopeWith({ checksum: { algorithm: "SHA-256", value: "g".repeat(64) } })],
    ["a checksum in upper case", envelopeWith({ checksum: { algorithm: "SHA-256", value: "A".repeat(64) } })],
    ["a checksum with an extra key", envelopeWith({ checksum: { algorithm: "SHA-256", value: "a".repeat(64), salt: "x" } })],
    ["an unknown top-level key", envelopeWith({ device: "phone-1" })],
    ["a data section with an extra store", envelopeWith({ data: { ...backupData, drafts: [] } })],
    ["a data section missing a store", envelopeWith({ data: omit(backupData, "measurements") })],
    [
      "a data section with an invalid material",
      envelopeWith({ data: { ...backupData, materials: [{ ...backupData.materials[0], name: "" }] } }),
    ],
    [
      "a data section with an invalid formula version",
      envelopeWith({ data: { ...backupData, formulaVersions: [{ ...backupData.formulaVersions[0], number: 0 }] } }),
    ],
    ["a missing checksum", omit(envelope, "checksum")],
    ["a missing counts", omit(envelope, "counts")],
    ["a missing data", omit(envelope, "data")],
    ["a missing format", omit(envelope, "format")],
  ])("rejects %s", (_label, input) => {
    expect(BackupEnvelopeSchema.safeParse(input).success).toBe(false);
  });
});
