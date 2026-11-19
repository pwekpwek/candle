import type { CureScheduleItem, ProductionPlanListItem, ScheduleData } from "@/lib/db/contract";
import type { CureMilestone, CureMilestoneKind, CurePlan } from "@/lib/types";
import { addDays, daysBetween } from "./dates";
import type {
  LocalDate,
  MilestoneView,
  ScheduleGroups,
  ScheduleItem,
  ScheduleState,
} from "./contract";

const KIND_ORDER: Record<CureMilestoneKind, number> = { cureEnd: 0, burnTest: 1, check: 2 };

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function stateFor(dueOn: LocalDate, done: boolean, today: LocalDate): ScheduleState {
  if (done) return "done";
  const diff = daysBetween(today, dueOn);
  return diff < 0 ? "overdue" : diff === 0 ? "due" : "upcoming";
}

export function milestoneDueOn(producedOn: LocalDate, offsetDays: number): LocalDate {
  return addDays(producedOn, offsetDays);
}

export function viewMilestones(
  plan: CurePlan,
  producedOn: LocalDate,
  today: LocalDate,
): MilestoneView[] {
  return plan.milestones
    .map((milestone): MilestoneView => {
      const dueOn = milestoneDueOn(producedOn, milestone.offsetDays);
      return {
        milestone,
        dueOn,
        state: stateFor(dueOn, milestone.doneOn !== null, today),
        daysFromToday: daysBetween(today, dueOn),
      };
    })
    .sort(
      (a, b) =>
        a.milestone.offsetDays - b.milestone.offsetDays ||
        KIND_ORDER[a.milestone.kind] - KIND_ORDER[b.milestone.kind] ||
        cmp(a.milestone.id, b.milestone.id),
    );
}

export function cureEndOf(plan: CurePlan): CureMilestone | undefined {
  return plan.milestones.find((m) => m.kind === "cureEnd");
}

function milestoneItem(source: CureScheduleItem, milestone: CureMilestone, today: LocalDate): ScheduleItem {
  const dueOn = milestoneDueOn(source.batch.producedOn, milestone.offsetDays);
  return {
    kind: "milestone",
    key: `m:${source.batch.id}:${milestone.id}`,
    dueOn,
    state: stateFor(dueOn, milestone.doneOn !== null, today),
    daysFromToday: daysBetween(today, dueOn),
    doneOn: milestone.doneOn,
    milestone,
    source,
  };
}

function productionItem(source: ProductionPlanListItem, today: LocalDate): ScheduleItem {
  const { plan, batch } = source;
  const done = plan.batchId !== null;
  const dueOn = plan.plannedOn;
  return {
    kind: "production",
    key: `p:${plan.id}`,
    dueOn,
    state: stateFor(dueOn, done, today),
    daysFromToday: daysBetween(today, dueOn),
    doneOn: done ? (batch ? batch.producedOn : plan.plannedOn) : null,
    source,
  };
}

function compareDue(a: ScheduleItem, b: ScheduleItem): number {
  return (
    cmp(a.dueOn, b.dueOn) ||
    (a.kind === b.kind ? 0 : a.kind === "milestone" ? -1 : 1) ||
    cmp(a.key, b.key)
  );
}

export function buildSchedule(data: ScheduleData, today: LocalDate): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const source of data.cure) {
    for (const milestone of source.plan.milestones) {
      items.push(milestoneItem(source, milestone, today));
    }
  }
  for (const source of data.production) items.push(productionItem(source, today));
  return items.sort(compareDue);
}

export function groupSchedule(items: readonly ScheduleItem[]): ScheduleGroups {
  const groups: ScheduleGroups = { overdue: [], due: [], upcoming: [], done: [] };
  for (const item of items) groups[item.state].push(item);
  groups.overdue.sort(compareDue);
  groups.due.sort(compareDue);
  groups.upcoming.sort(compareDue);
  groups.done.sort((a, b) => cmp(b.doneOn ?? "", a.doneOn ?? "") || compareDue(a, b));
  return groups;
}

export function attentionCount(items: readonly ScheduleItem[]): number {
  return items.filter((i) => i.state === "overdue" || i.state === "due").length;
}
