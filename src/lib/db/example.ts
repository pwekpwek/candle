import type { EditorFields } from "@/lib/gramguard/contract";
import type { Material } from "@/lib/types";
import type { CandleDatabase, ExampleRepo, MaterialInput } from "./contract";
import { guard } from "./errors";
import { buildMaterial } from "./materials";
import { META_KEYS, bumpChangeCounter } from "./meta";

const WAX: MaterialInput = { type: "wax", name: "Soy wax (example)" };
const OILS: MaterialInput[] = [
  { type: "fragranceOil", name: "Lavender (example)" },
  { type: "fragranceOil", name: "Vanilla (example)" },
  { type: "fragranceOil", name: "Cedarwood (example)" },
];
const OIL_PARTS = ["3", "2", "1"];

export function createExampleRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): ExampleRepo {
  return {
    prepare: (newRowId) =>
      guard(() =>
        db.transaction("rw", db.materials, db.meta, async () => {
          const library = await db.materials.toArray();
          let created = 0;

          // Reuse an unarchived material with this exact name and type, else create it.
          const ensure = async (input: MaterialInput): Promise<Material> => {
            const found = library.find(
              (m) => m.name === input.name && m.type === input.type && m.archivedAt === null,
            );
            if (found) return found;
            const material = buildMaterial(input, newId(), now());
            await db.materials.add(material);
            created += 1;
            return material;
          };

          const wax = await ensure(WAX);
          const oils: Material[] = [];
          for (const oil of OILS) oils.push(await ensure(oil));

          if (created > 0) await bumpChangeCounter(db);
          await db.meta.put({ key: META_KEYS.exampleOffered, value: true });

          const fields: EditorFields = {
            name: "Lavender Vanilla Cedar (example)",
            sizingMode: "vessels",
            amount: "",
            vesselCount: "6",
            fillWeight: "180",
            fragrancePct: "8",
            basis: "wax",
            precisionMg: 100,
            waxes: [{ rowId: newRowId(), materialId: wax.id, parts: "" }],
            oils: oils.map((oil, i) => ({
              rowId: newRowId(),
              materialId: oil.id,
              parts: OIL_PARTS[i],
            })),
            wickId: null,
            vesselId: null,
            notes: "",
            changeNote: "",
          };
          return fields;
        }),
      ),
  };
}
