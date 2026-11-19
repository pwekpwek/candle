// Regenerates the eleven malformed backup files from good.json.
// Run: node tests/fixtures/backups/make-bad.mjs
// Deterministic: same input gives byte-identical output. Safe to re-run.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const goodPath = join(here, "good.json");

// Canonical JSON: sorted object keys at every depth, no whitespace,
// arrays in given order, primitives via JSON.stringify.
function canonical(value) {
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonical(item)).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return (
      "{" +
      keys.map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function checksumOf(data) {
  return createHash("sha256").update(canonical(data), "utf8").digest("hex");
}

const goodText = readFileSync(goodPath, "utf8");
const good = JSON.parse(goodText);

// Proof that our canonical form matches the app's checksum.
if (checksumOf(good.data) !== good.checksum.value) {
  throw new Error(
    "canonical() does not reproduce good.json checksum: expected " +
      good.checksum.value +
      ", got " +
      checksumOf(good.data),
  );
}

function fresh() {
  return structuredClone(good);
}

function recompute(envelope) {
  envelope.checksum.value = checksumOf(envelope.data);
  return envelope;
}

function serialize(envelope) {
  return JSON.stringify(envelope, null, 2) + "\n";
}

const outputs = [];
function add(name, text) {
  outputs.push([name, text]);
}

// 01: not JSON at all. Not built from the envelope.
add("bad-01-not-json.json", "this is not a backup file {\n");

// 02: wrong format tag.
{
  const e = fresh();
  e.format = "candlelab-export";
  add("bad-02-wrong-format.json", serialize(e));
}

// 03: newer formatVersion than this app understands.
{
  const e = fresh();
  e.formatVersion = 5;
  add("bad-03-newer-version.json", serialize(e));
}

// 04: required field removed from a formula version.
{
  const e = fresh();
  delete e.data.formulaVersions[0].targets;
  recompute(e);
  add("bad-04-missing-field.json", serialize(e));
}

// 05: wrong type for a string field.
{
  const e = fresh();
  e.data.formulas[0].name = 42;
  recompute(e);
  add("bad-05-wrong-type.json", serialize(e));
}

// 06: negative weight in a measurement.
{
  const e = fresh();
  e.data.measurements[0].entries[0].actualMg = -5000;
  recompute(e);
  add("bad-06-negative-weight.json", serialize(e));
}

// 07: declared count disagrees with the data. Data and checksum untouched.
{
  const e = fresh();
  e.counts.formulas = e.counts.formulas + 1;
  add("bad-07-count-mismatch.json", serialize(e));
}

// 08: data edited after export. Checksum deliberately NOT recomputed.
{
  const e = fresh();
  e.data.materials[0].name = e.data.materials[0].name + " (edited)";
  add("bad-08-checksum-mismatch.json", serialize(e));
}

// 09: file truncated to the first 60% of its characters. No newline added.
{
  const full = JSON.stringify(good, null, 2) + "\n";
  add("bad-09-truncated.json", full.slice(0, Math.floor(full.length * 0.6)));
}

// 10: same material id twice.
{
  const e = fresh();
  e.data.materials.push(structuredClone(e.data.materials[0]));
  e.counts.materials = e.data.materials.length;
  recompute(e);
  add("bad-10-duplicate-ids.json", serialize(e));
}

// 11: a scaled formula version whose formula is not in the file.
{
  const e = fresh();
  const scaled = e.data.formulaVersions.find((v) => v.origin === "scaled");
  if (!scaled) {
    throw new Error("good.json has no formula version with origin 'scaled'");
  }
  scaled.formulaId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  recompute(e);
  add("bad-11-orphaned-version.json", serialize(e));
}

for (const [name, text] of outputs) {
  writeFileSync(join(here, name), text, "utf8");
  console.log(name);
}
