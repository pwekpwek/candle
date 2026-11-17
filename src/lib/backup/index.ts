import type { BackupModule } from "./contract";
import { canonicalJson, sha256Hex } from "./canonical";
import { backupFileName, exportBackup } from "./export";
import { checkBackupText } from "./check";
import { planRestore } from "./plan";
import { applyRestore, readDeviceData } from "./apply";

export * from "./contract";
export { canonicalJson, sha256Hex } from "./canonical";
export { backupFileName, exportBackup } from "./export";
export { checkBackupText } from "./check";
export { planRestore } from "./plan";
export { applyRestore, deviceIdsOf, readDeviceData } from "./apply";

const _implemented: BackupModule = {
  canonicalJson,
  sha256Hex,
  backupFileName,
  exportBackup,
  checkBackupText,
  planRestore,
  readDeviceData,
  applyRestore,
};
void _implemented;
