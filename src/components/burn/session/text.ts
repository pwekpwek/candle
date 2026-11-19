import { formatProducedOn } from "@/components/batches/text";
import { MESSAGES } from "@/lib/messages";
import type { BurnSession } from "@/lib/types";

/** The session's label, or "Burn test, Nov 18, 2026". */
export function sessionTitle(session: Pick<BurnSession, "label" | "testedOn">): string {
  const label = session.label?.trim();
  return label ? label : MESSAGES.burn.defaultTitle(formatProducedOn(session.testedOn));
}
