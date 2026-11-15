import type { BackupModule } from "./contract";
import { canonicalJson, sha256Hex } from "./canonical";
import { backupFileName, exportBackup } from "./export";

export * from "./contract";
export { canonicalJson, sha256Hex } from "./canonical";
export { backupFileName, exportBackup } from "./export";

// T14 and T15 add check, plan and apply, and widen this to the whole BackupModule.
const _implemented: Pick<
  BackupModule,
  "canonicalJson" | "sha256Hex" | "backupFileName" | "exportBackup"
> = { canonicalJson, sha256Hex, backupFileName, exportBackup };
void _implemented;
