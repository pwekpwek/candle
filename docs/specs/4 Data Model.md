# CandleLab Studio — 4 Data Model (v0.1, local)

**Status:** Draft 2026-11-14, awaiting owner review. Nothing here is built yet.

All data lives in the browser's IndexedDB. There is no server in v0.1. This note defines the records, what is immutable, how history stays reproducible, and the backup file with its restore rules.

## Principles

- **DATA-01 — Stable IDs.** Every record has an `id` that is a UUID created on the device (`crypto.randomUUID()`). IDs never change and are never reused. Version numbers are display labels, not identity.
- **DATA-02 — Saved versions are immutable.** Once written, a formula version's inputs and planned weights are never edited. Changes create a new version.
- **DATA-03 — Versions carry their own copy of what they used.** Each version stores a snapshot of every material's details at save time, and the planned weights that were shown. Reopening a version reads these, so later material edits, deletions or calculation changes cannot alter history.
- **DATA-04 — Measurements are separate.** Measured weights live in their own records that point at a version. Entering them does not touch the version.
- **DATA-05 — Integers for quantities.** Weights are whole milligrams. Percentages are whole hundredths of a percent (8% = 800). Parts are whole hundredths (3 parts = 300). This matches CALC-07 and keeps stored data exact.
- **DATA-06 — Timestamps** are ISO 8601 in UTC. Screens show them in the device's local time.

## Records

Field names are indicative. Types use TypeScript notation.

### Material — store `materials`

```ts
type Material = {
  id: string
  type: 'wax' | 'fragranceOil' | 'wick' | 'vessel'
  name: string                       // 1–80 chars
  supplier?: string
  notes?: string
  wax?:    { maxFragranceBp?: number; maxFragranceBasis?: 'wax' | 'total' }
  wick?:   { size?: string }
  vessel?: { capacityMl?: number; defaultFillMg?: number }
  createdAt: string
  updatedAt: string
  archivedAt: string | null          // archived = hidden from pickers
}
```

Materials are mutable. They are archived, not deleted, once any version refers to them.

### Formula — store `formulas`

```ts
type Formula = {
  id: string
  name: string
  notes?: string
  latestVersionNumber: number        // used to allocate the next number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}
```

The formula is the stable container. Name and notes are mutable and do not create versions.

### Formula version — store `formulaVersions`

```ts
type FormulaVersion = {
  id: string
  formulaId: string
  number: number                     // 1, 2, 3… unique within a formula
  originalNumber?: number            // set only if renumbered on restore
  origin: 'initial' | 'revision' | 'scaled'
  parentVersionId: string | null     // version this was revised or scaled from
  scale: null | {
    method: 'vesselCount' | 'amount' | 'multiplier'
    factorX10000: number             // new amount ÷ old amount × 10000, for display
  }
  changeNote?: string
  createdAt: string

  inputs: {
    sizing:
      | { mode: 'total';   amountMg: number }
      | { mode: 'wax';     amountMg: number }
      | { mode: 'vessels'; count: number; fillMg: number }
    fragranceBp: number              // hundredths of a percent
    basis: 'wax' | 'total'
    precisionMg: 1000 | 100 | 10     // 1 g, 0.1 g, 0.01 g
    waxes: Component[]               // 1–5
    oils:  Component[]               // 0–10
    wick:   null | { materialId: string; snapshot: MaterialSnapshot }
    vessel: null | { materialId: string; snapshot: MaterialSnapshot }
    notes?: string
  }

  targets: {                         // planned weights as shown when saved
    totalMg: number
    waxTotalMg: number
    fragranceTotalMg: number
    components: { componentId: string; targetMg: number }[]
  }
  calcVersion: number                // version of the calculation rules used (1)
}

type Component = {
  componentId: string                // stable within this version
  materialId: string
  snapshot: MaterialSnapshot
  partsX100: number
}

type MaterialSnapshot = {            // copy of the material at save time
  type: Material['type']
  name: string
  supplier?: string
  wax?: Material['wax']; wick?: Material['wick']; vessel?: Material['vessel']
}
```

### Measurement — store `measurements`

```ts
type Measurement = {
  id: string
  formulaId: string
  versionId: string
  measuredOn?: string                // date the maker weighed, optional
  entries: { componentId: string; actualMg: number }[]   // only entered ones
  notes?: string
  createdAt: string
  updatedAt: string
}
```

The model allows several measurement records per version. The v0.1 interface shows and edits one per version (D-7). In v0.2 a BatchTrace batch will point at a `versionId` and take over this role, so the link is already in the right place.

### Draft — store `drafts`

```ts
type Draft = {
  key: string                        // 'new' or the formulaId being revised
  baseVersionId: string | null
  fields: Record<string, string>     // raw text exactly as typed, may be invalid
  updatedAt: string
}
```

Drafts hold unsaved editor work so a reload loses nothing. They are deleted when the formula is saved or the draft is discarded. Drafts are not included in backups.

### Meta — store `meta`

Key-value: `schemaVersion`, `lastBackupAt`, `changesSinceBackup`, `lastRestoreAt`, `exampleOffered`. Device-local, never exported.

## IndexedDB layout

Database `candlelab`, schema version 1.

| Store | Key | Indexes |
| --- | --- | --- |
| `materials` | `id` | `type`, `archivedAt` |
| `formulas` | `id` | `updatedAt`, `archivedAt` |
| `formulaVersions` | `id` | `formulaId`, unique `[formulaId+number]` |
| `measurements` | `id` | `versionId`, `formulaId` |
| `drafts` | `key` | — |
| `meta` | `key` | — |

## Write rules

- **DATA-07 — Saving a version is one transaction** across `formulas`, `formulaVersions` and `drafts`: read `latestVersionNumber`, write the version with the next number, update the formula, delete the draft. Two tabs saving at once get consecutive numbers, never the same one. If the transaction fails, nothing is written and the draft remains.
- **DATA-08 — Version records are write-once.** The data layer exposes no update for `inputs`, `targets`, `calcVersion`, `parentVersionId`, `origin` or `createdAt`.
- **DATA-09 — What a revision copies.** Everything in `inputs`, with fresh `componentId`s and fresh material snapshots taken from the library at save time for materials that still exist, or the previous snapshot if the material is gone. It does not copy measurements, `changeNote` or `targets` (targets are recomputed).
- **DATA-10 — What a scaled version copies.** As DATA-09, with only `sizing` changed, `origin: 'scaled'` and `scale` filled in.
- **DATA-11 — Material edits do not cascade.** Versions display their snapshot. If the library name now differs, the version view adds "now called …" as a hint.
- **DATA-12 — Deleting a formula** (D-8) removes the formula, its versions, measurements and draft in one transaction, after confirmation. From v0.2, deletion will be refused while a batch refers to any of its versions.
- **DATA-13 — Change counter.** Every committed write to materials, formulas, versions or measurements increments `changesSinceBackup`. Export resets it.
- **DATA-14 — Persistent storage.** After the first successful save the app requests persistent storage from the browser where supported, and records the outcome. A refusal changes nothing except the wording of the backup reminder.

## Backup file

One JSON file named `candlelab-backup-YYYYMMDD-HHmmss.json`.

```json
{
  "format": "candlelab-backup",
  "formatVersion": 1,
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-11-14T06:05:12.000Z",
  "counts": { "materials": 14, "formulas": 12, "formulaVersions": 31, "measurements": 9 },
  "checksum": { "algorithm": "SHA-256", "value": "<hex of the canonical data section>" },
  "data": {
    "materials": [],
    "formulas": [],
    "formulaVersions": [],
    "measurements": []
  }
}
```

- **DATA-15** Export reads all four stores in one read transaction so the file is a consistent snapshot.
- **DATA-16** The checksum covers the `data` section serialised with sorted keys, so a truncated or altered file is detectable.
- **DATA-17** Archived items are included. Drafts and `meta` are not.
- **DATA-18** The file contains only what the maker typed. No device identifiers.

## Restore rules

Restore never writes until every check has passed.

### Step 1 — Checks (any failure refuses the whole file, nothing is changed)

| Check | Failure message |
| --- | --- |
| File is at most 25 MB and parses as JSON | "This isn't a CandleLab backup file." |
| `format` is `candlelab-backup` | Same. |
| `formatVersion` is one this app understands | "This backup was made by a newer version of CandleLab. Update the app, then try again." |
| Every record matches the schema: required fields, types, ranges, no negative weights, known enum values | "This backup is damaged: 3 records are invalid (first: formula version …, missing targets)." |
| `counts` match the arrays | "This backup is incomplete." |
| Checksum matches | "This backup is damaged or was edited." |
| Every version's `formulaId` and every measurement's `versionId` exist in the file or already on this device | "This backup is incomplete: 2 versions refer to a missing formula." |
| IDs are unique within each array | "This backup is damaged: duplicate records." |

Older `formatVersion`s are migrated in memory to the current shape before the remaining checks.

A missing library material is **not** a failure, because versions carry snapshots. The preview notes it.

### Step 2 — Plan and preview

Each incoming record is classified against this device by `id`:

| Class | Meaning |
| --- | --- |
| New | ID not on this device. Will be added. |
| Identical | Same ID, same content. Will be skipped. |
| Conflict | Same ID, different content. |

The preview shows the counts per class and per record type before the maker confirms.

### Step 3 — Duplicate IDs and conflicts

- **DATA-19 — Default mode "Add to what's here".** New records are added. Identical records are skipped. Running the same restore twice changes nothing the second time.
- **DATA-20 — Conflicts on editable records** (materials, formula name and notes, measurements): the maker chooses once for the whole restore, "Keep this device's copy" (default) or "Use the backup's copy". No silent overwrite.
- **DATA-21 — Conflicts on formula versions** should not happen, because versions are immutable. If one is found, this device's copy is always kept, the conflict is counted in the result, and the backup's copy is not written.
- **DATA-22 — Version number clashes.** If the backup holds a version with a different ID but the same number as one already under that formula (two devices each created "version 3"), the incoming version is added under the next free number, in order of `createdAt`, and keeps `originalNumber`. The result summary lists the renumbering. Identity and parent links use IDs, so they stay correct.
- **DATA-23 — "Replace everything on this device".** The app first exports and downloads a safety backup of current data, then requires the maker to type REPLACE. It then clears the four data stores and writes the backup, inside the same single transaction as DATA-24.
- **DATA-24 — All or nothing.** The whole restore is one IndexedDB read-write transaction over all four stores. Any error aborts it and leaves the device exactly as it was.

### Step 4 — Interrupted imports

- **DATA-25** If the tab closes, the browser crashes or the device loses power before the transaction commits, IndexedDB discards it. On next open the data is as before the restore.
- **DATA-26** After commit the app re-reads the counts and compares them with the plan. A mismatch is reported as an error, never as success.
- **DATA-27** A restore that failed or was interrupted can simply be run again. Because of DATA-19 a repeat after a success is harmless.
- **DATA-28** Restore runs with the button busy and a "Don't close this tab" note. A second restore cannot start while one is running.

### Step 5 — Result

"Restored from candlelab-backup-20261114-140512.json: added 9 formulas, 22 versions, 14 materials, 6 measurements. Skipped 12 identical items. Kept this device's copy of 1 material." Then "Open saved formulas".

## Schema changes later

- **DATA-29** Each change to stored shapes raises `schemaVersion` with an upgrade step that preserves every existing record. Upgrades are tested against a saved copy of the previous schema's data.
- **DATA-30** A change to the arithmetic raises `calcVersion`. Old versions keep their stored `targets` and are never recalculated in place.

## Known risks

- Browsers can clear site storage (private windows, "clear browsing data", and Safari's removal of storage for sites unused for a period). The backup file is the maker's only protection in v0.1. This is why the backup reminder and the plain warning on the backup page exist.
- Two devices are not synced. Restore's merge rules handle the result but do not replace sync, which is a later decision.

## Open

Decisions D-7, D-8 and D-9 in the [[Projects/apps/candle/Specs/Specs Index|Specs Index]].

## Related

[[Projects/apps/candle/Specs/1 PRD|PRD]] · [[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] · [[Projects/apps/candle/Specs/3 App Flow and Wireframes|App Flow and Wireframes]] · [[Projects/apps/candle/Specs/5 TRD and Test Plan|TRD and Test Plan]]
