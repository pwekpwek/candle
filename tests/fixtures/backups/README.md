# Backup fixtures

`good.json` is a real export made by the app's `exportBackup`. It holds 7 materials, 2 formulas, 3 formula versions and 1 measurement.

`make-bad.mjs` regenerates the eleven `bad-*.json` files from `good.json`. Each bad file breaks exactly one thing. Run it with `node tests/fixtures/backups/make-bad.mjs`.

| File | What was changed | Expected refusal |
| --- | --- | --- |
| `bad-01-not-json.json` | Not JSON at all: the text `this is not a backup file {` | 01 not-backup |
| `bad-02-wrong-format.json` | `format` is `candlelab-export` | 02 not-backup |
| `bad-03-newer-version.json` | `formatVersion` is `2` | 03 newer |
| `bad-04-missing-field.json` | `targets` removed from `data.formulaVersions[0]` (checksum recomputed) | 04 invalid |
| `bad-05-wrong-type.json` | `data.formulas[0].name` is the number `42` (checksum recomputed) | 05 invalid |
| `bad-06-negative-weight.json` | `data.measurements[0].entries[0].actualMg` is `-5000` (checksum recomputed) | 06 invalid |
| `bad-07-count-mismatch.json` | `counts.formulas` is 3 instead of 2 | 07 incomplete |
| `bad-08-checksum-mismatch.json` | `data.materials[0].name` has ` (edited)` appended, checksum not recomputed | 08 checksum |
| `bad-09-truncated.json` | First 60% of the characters of the good file | 09 not-backup |
| `bad-10-duplicate-ids.json` | `data.materials[0]` copied to the end (same id twice), counts and checksum updated | 10 duplicates |
| `bad-11-orphaned-version.json` | The `scaled` formula version points at a formula that is not in the file (checksum recomputed) | 11 orphans (1 version, 0 measurements) |
