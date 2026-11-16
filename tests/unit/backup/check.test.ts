import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, checkBackupText, MAX_BACKUP_BYTES, sha256Hex } from "@/lib/backup";
import type { CheckFailure, DeviceIds } from "@/lib/backup";
import type { BackupEnvelope } from "@/lib/types";

const dir = join(process.cwd(), "tests", "fixtures", "backups");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const none: DeviceIds = { formulaIds: new Set(), versionIds: new Set() };
const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

async function run(text: string, device: DeviceIds = none) {
  return checkBackupText(text, Buffer.byteLength(text), device);
}

async function failure(text: string, device: DeviceIds = none): Promise<CheckFailure> {
  const result = await run(text, device);
  if (result.ok) throw new Error("expected a failure");
  return result.failure;
}

function good(): BackupEnvelope {
  return JSON.parse(read("good.json")) as BackupEnvelope;
}

/** Edit a copy of good.json; recompute counts and checksum unless told not to. */
async function build(
  edit: (env: BackupEnvelope) => void,
  options: { counts?: boolean; checksum?: boolean } = {},
): Promise<string> {
  const env = good();
  edit(env);
  if (options.counts !== false) {
    env.counts = {
      materials: env.data.materials.length,
      formulas: env.data.formulas.length,
      formulaVersions: env.data.formulaVersions.length,
      measurements: env.data.measurements.length,
    };
  }
  if (options.checksum !== false) {
    env.checksum = { algorithm: "SHA-256", value: await sha256Hex(canonicalJson(env.data)) };
  }
  return JSON.stringify(env);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe("TEST-23 fixtures", () => {
  it("accepts good.json and returns the parsed file", async () => {
    const result = await run(read("good.json"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope).toEqual(JSON.parse(read("good.json")));
  });

  it.each([
    ["bad-01-not-json.json", { code: "not-backup" }],
    ["bad-02-wrong-format.json", { code: "not-backup" }],
    ["bad-03-newer-version.json", { code: "newer" }],
    ["bad-04-missing-field.json", { code: "invalid", count: 1, firstProblem: "missing targets" }],
    ["bad-05-wrong-type.json", { code: "invalid", count: 1, firstProblem: "name has the wrong type" }],
    ["bad-06-negative-weight.json", { code: "invalid", count: 1, firstProblem: "negative weight" }],
    ["bad-07-count-mismatch.json", { code: "incomplete" }],
    ["bad-08-checksum-mismatch.json", { code: "checksum" }],
    ["bad-09-truncated.json", { code: "not-backup" }],
    ["bad-10-duplicate-ids.json", { code: "duplicates" }],
    ["bad-11-orphaned-version.json", { code: "orphans", versions: 1, measurements: 0 }],
  ])("%s is refused", async (name, expected) => {
    const f = await failure(read(name));
    expect(f).toMatchObject(expected);
    if (f.code === "invalid") {
      expect(Object.keys(f).sort()).toEqual(["code", "count", "firstLabel", "firstProblem"]);
    } else {
      expect(f).toEqual(expected);
    }
  });

  it("labels the damaged records", async () => {
    const four = await failure(read("bad-04-missing-field.json"));
    expect(four).toMatchObject({ firstLabel: expect.stringMatching(/^formula version [0-9a-f]{8}…$/) });
    const five = await failure(read("bad-05-wrong-type.json"));
    expect(five).toMatchObject({ firstLabel: expect.stringMatching(/^formula [0-9a-f]{8}…$/) });
    const six = await failure(read("bad-06-negative-weight.json"));
    expect(six).toMatchObject({ firstLabel: expect.stringMatching(/^measurement [0-9a-f]{8}…$/) });
  });
});

describe("check 1: not a backup", () => {
  it("refuses an oversized file", async () => {
    expect(await checkBackupText(read("good.json"), MAX_BACKUP_BYTES + 1, none)).toEqual({
      ok: false,
      failure: { code: "not-backup" },
    });
  });

  it.each(["[]", '"text"', "null", "42", ""])("refuses %j", async (text) => {
    expect(await failure(text)).toEqual({ code: "not-backup" });
  });

  it.each([0, "1", 1.5, -1, null])("refuses formatVersion %j", async (formatVersion) => {
    const env = { ...good(), formatVersion };
    expect(await failure(JSON.stringify(env))).toEqual({ code: "not-backup" });
  });
});

describe("check 3: invalid", () => {
  it("labels a bad envelope as the backup file", async () => {
    const env = asRecord(good());
    delete env.counts;
    expect(await failure(JSON.stringify(env))).toEqual({
      code: "invalid",
      count: 1,
      firstLabel: "backup file",
      firstProblem: "missing counts",
    });
  });

  it("counts every bad record and describes the first in store order", async () => {
    const text = await build((env) => {
      delete asRecord(env.data.formulas[0]).name;
      delete asRecord(env.data.measurements[0]).entries;
    });
    const f = await failure(text);
    expect(f).toMatchObject({ code: "invalid", count: 2, firstProblem: "missing name" });
    expect((f as { firstLabel: string }).firstLabel).toMatch(/^formula [0-9a-f]{8}…$/);
  });

  it("adds one for a bad envelope alongside bad records", async () => {
    const env = asRecord(good());
    delete env.appVersion;
    delete asRecord((asRecord(env.data).formulas as unknown[])[0]).name;
    expect(await failure(JSON.stringify(env))).toEqual({
      code: "invalid",
      count: 2,
      firstLabel: "backup file",
      firstProblem: "missing appVersion",
    });
  });

  it("labels a record without a usable id by position", async () => {
    const text = await build((env) => {
      asRecord(env.data.formulaVersions[0]).id = 7;
    });
    expect(await failure(text)).toMatchObject({ firstLabel: "formula version #1" });
  });

  it("reports an unknown enum value", async () => {
    const text = await build((env) => {
      asRecord(env.data.materials[0]).type = "tallow";
    });
    expect(await failure(text)).toMatchObject({ code: "invalid", count: 1, firstProblem: "unknown type" });
  });

  it("reports an extra key", async () => {
    const text = await build((env) => {
      asRecord(env.data.materials[0]).colour = "red";
    });
    expect(await failure(text)).toMatchObject({ code: "invalid", firstProblem: "unexpected field colour" });
  });

  it("reports a weight over the limit as out of range", async () => {
    const text = await build((env) => {
      env.data.measurements[0]!.entries[0]!.actualMg = 10 ** 12;
    });
    expect(await failure(text)).toMatchObject({ firstProblem: "actualMg is out of range" });
  });

  it("never throws for odd records", async () => {
    const text = await build((env) => {
      (env.data.materials as unknown[])[0] = 5;
    });
    expect(await failure(text)).toMatchObject({ code: "invalid", count: 1, firstLabel: "material #1" });
  });
});

describe("later checks", () => {
  it.each(["materials", "formulas", "formulaVersions", "measurements"] as const)(
    "incomplete when counts.%s is wrong",
    async (key) => {
      const text = await build(
        (env) => {
          env.counts[key] += 1;
        },
        { counts: false },
      );
      expect(await failure(text)).toEqual({ code: "incomplete" });
    },
  );

  it("checksum: algorithm changed", async () => {
    const env = good();
    (env.checksum as { algorithm: string }).algorithm = "SHA-512";
    expect(await failure(JSON.stringify(env))).toEqual({ code: "checksum" });
  });

  it("checksum: value is not hex", async () => {
    const env = good();
    env.checksum.value = "nope";
    expect(await failure(JSON.stringify(env))).toEqual({ code: "checksum" });
  });

  it.each(["materials", "formulas", "formulaVersions", "measurements"] as const)(
    "duplicates in %s",
    async (key) => {
      const text = await build((env) => {
        (env.data[key] as unknown[]).push(structuredClone(env.data[key][0]));
      });
      expect(await failure(text)).toEqual({ code: "duplicates" });
    },
  );

  it("orphans: a measurement whose version is nowhere", async () => {
    const text = await build((env) => {
      env.data.measurements[0]!.versionId = UUID;
    });
    expect(await failure(text)).toEqual({ code: "orphans", versions: 0, measurements: 1 });
  });

  it("orphans: both kinds are counted", async () => {
    const text = await build((env) => {
      env.data.formulaVersions[0]!.formulaId = UUID;
      env.data.measurements[0]!.versionId = UUID;
    });
    expect(await failure(text)).toEqual({ code: "orphans", versions: 1, measurements: 1 });
  });

  it("orphans are satisfied by ids already on the device", async () => {
    const text = await build((env) => {
      env.data.formulaVersions[0]!.formulaId = UUID;
      env.data.measurements[0]!.versionId = UUID2;
    });
    const device: DeviceIds = { formulaIds: new Set([UUID]), versionIds: new Set([UUID2]) };
    expect((await run(text, device)).ok).toBe(true);
    expect((await run(text)).ok).toBe(false);
  });

  it("a missing library material is not a failure", async () => {
    const text = await build((env) => {
      env.data.materials = [];
    });
    expect((await run(text)).ok).toBe(true);
  });
});

describe("order of checks", () => {
  it("wrong counts and a bad checksum report incomplete", async () => {
    const env = good();
    env.counts.formulas += 1;
    env.checksum.value = "0".repeat(64);
    expect(await failure(JSON.stringify(env))).toEqual({ code: "incomplete" });
  });

  it("a bad checksum and duplicate ids report checksum", async () => {
    const env = good();
    env.data.materials.push(structuredClone(env.data.materials[0]!));
    env.counts.materials += 1;
    expect(await failure(JSON.stringify(env))).toEqual({ code: "checksum" });
  });

  it("duplicate ids and orphans report duplicates", async () => {
    const text = await build((env) => {
      env.data.materials.push(structuredClone(env.data.materials[0]!));
      env.data.measurements[0]!.versionId = UUID;
    });
    expect(await failure(text)).toEqual({ code: "duplicates" });
  });

  it("invalid beats incomplete; newer beats invalid", async () => {
    const env = good();
    env.counts.formulas += 1;
    delete asRecord(env.data.formulaVersions[0]).targets;
    expect((await failure(JSON.stringify(env))).code).toBe("invalid");
    expect((await failure(JSON.stringify({ ...env, formatVersion: 2 }))).code).toBe("newer");
  });
});
