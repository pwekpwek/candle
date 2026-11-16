import type { BackupModule } from "./contract";
import { canonicalJson, sha256Hex } from "./canonical";
import { backupFileName, exportBackup } from "./export";
import { checkBackupText } from "./check";
import { planRestore } from "./plan";

export * from "./contract";
export { canonicalJson, sha256Hex } from "./canonical";
export { backupFileName, exportBackup } from "./export";
export { checkBackupText } from "./check";
export { planRestore } from "./plan";

// T15 adds apply (readDeviceData, applyRestore) and widens this to the whole BackupModule.
const _implemented: Pick<
  BackupModule,
  "canonicalJson" | "sha256Hex" | "backupFileName" | "exportBackup" | "checkBackupText" | "planRestore"
> = { canonicalJson, sha256Hex, backupFileName, exportBackup, checkBackupText, planRestore };
void _implemented;
