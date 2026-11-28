/** Dated events of an investigation and its follow-ups. */
import type { InvestigationComparisonData } from "@/lib/db/contract";
import type { TimelineEvent, TimelineEventKind } from "./contract";

const KIND_ORDER: readonly TimelineEventKind[] = [
  "batchMade",
  "issueObserved",
  "hypothesisAdded",
  "followUpMade",
  "burnTest",
];

export function buildTimeline(
  data: InvestigationComparisonData,
  localDate: (isoTimestamp: string) => string,
): TimelineEvent[] {
  const events = new Map<string, TimelineEvent>();
  const add = (e: TimelineEvent) => {
    if (!events.has(e.key)) events.set(e.key, e);
  };

  const batches = [
    { cb: data.original, followUp: false },
    ...data.experiments.map((x) => ({ cb: x.followUp, followUp: true })),
  ];
  for (const { cb, followUp } of batches) {
    const batch = cb.item.batch;
    const kind: TimelineEventKind = followUp ? "followUpMade" : "batchMade";
    add({
      key: `${kind}:${batch.id}`,
      kind,
      date: batch.producedOn,
      batchId: batch.id,
      refId: batch.id,
      text: batch.label ?? null,
    });
    for (const inv of cb.investigations) {
      add({
        key: `issueObserved:${inv.id}`,
        kind: "issueObserved",
        date: inv.observedOn,
        batchId: inv.batchId,
        refId: inv.id,
        text: inv.title ?? null,
      });
    }
    for (const { session } of cb.burnSessions) {
      add({
        key: `burnTest:${session.id}`,
        kind: "burnTest",
        date: session.testedOn,
        batchId: session.batchId,
        refId: session.id,
        text: session.label ?? null,
      });
    }
  }
  for (const h of data.investigation.hypotheses) {
    add({
      key: `hypothesisAdded:${h.id}`,
      kind: "hypothesisAdded",
      date: localDate(h.createdAt),
      batchId: data.investigation.batchId,
      refId: h.id,
      text: h.text,
    });
  }

  return [...events.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (k !== 0) return k;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}
