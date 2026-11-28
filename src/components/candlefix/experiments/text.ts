import { todayLocal } from "@/lib/schedule";
import { MESSAGES } from "@/lib/messages";
import type { HypothesisStatus } from "@/lib/types";

const X = MESSAGES.candleFixExperiments;
const F = MESSAGES.candleFix;

/** The device's local YYYY-MM-DD for an ISO timestamp (the timeline's `localDate`). */
export function localDateOf(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp.slice(0, 10);
  return todayLocal(date);
}

export function statusLabel(status: HypothesisStatus): string {
  return F.hypothesisStatus[status];
}

export const experimentHref = (investigationId: string, experimentId: string) =>
  `/investigations/${investigationId}/experiments/${experimentId}`;

export const newExperimentHref = (investigationId: string, hypothesisId?: string) =>
  `/investigations/${investigationId}/experiments/new${hypothesisId ? `?hypothesis=${encodeURIComponent(hypothesisId)}` : ""}`;

export const compareHref = (investigationId: string) => `/investigations/${investigationId}/compare`;

export const investigationHref = (investigationId: string) => `/investigations/${investigationId}`;

export function eventLabel(
  kind: "batchMade" | "issueObserved" | "hypothesisAdded" | "followUpMade" | "burnTest",
): string {
  switch (kind) {
    case "batchMade":
      return X.eventBatchMade;
    case "issueObserved":
      return X.eventIssueObserved;
    case "hypothesisAdded":
      return X.eventHypothesisAdded;
    case "followUpMade":
      return X.eventFollowUpMade;
    case "burnTest":
      return X.eventBurnTest;
  }
}
