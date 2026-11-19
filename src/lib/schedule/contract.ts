/**
 * Schedule logic — contract (v0.2 CurePilot). Pure functions only: nothing
 * here reads the clock or IndexedDB. The caller passes `today`.
 * Design: docs/v0.2-curepilot.md ("Schedule states and reminders").
 *
 * `@/lib/schedule` must export every function in `ScheduleModule` below, by
 * these names, plus the types in this file.
 *
 * Dates:
 *   - A `LocalDate` is a calendar date "YYYY-MM-DD" in the maker's local
 *     calendar (the same convention as Batch.producedOn).
 *   - Day arithmetic is done on calendar dates with Date.UTC, never with local
 *     Date objects, so daylight-saving changes and time zones never move a
 *     date by one day.
 *   - "Today" comes from the device's local clock (`todayLocal`), i.e. the
 *     local year, month and day of `now`, not the UTC date.
 */
import type { CureScheduleItem, ProductionPlanListItem, ScheduleData } from "@/lib/db/contract";
import type { CureMilestone, CurePlan } from "@/lib/types";

export type LocalDate = string;

/**
 * done      milestone with doneOn set, or production entry with a batch
 * overdue   open, due before today
 * due       open, due today
 * upcoming  open, due after today
 */
export type ScheduleState = "done" | "overdue" | "due" | "upcoming";

/** One milestone of a plan, with its computed due date and state. */
export type MilestoneView = {
  milestone: CureMilestone;
  /** producedOn + offsetDays. Shown only while open; a done milestone shows doneOn. */
  dueOn: LocalDate;
  state: ScheduleState;
  /** dueOn − today in days: negative when overdue, 0 when due today. */
  daysFromToday: number;
};

export type ScheduleItem =
  | {
      kind: "milestone";
      /** Stable React key: `m:<batchId>:<milestoneId>`. */
      key: string;
      dueOn: LocalDate;
      state: ScheduleState;
      daysFromToday: number;
      /** The milestone's doneOn (done items only), else null. */
      doneOn: LocalDate | null;
      milestone: CureMilestone;
      source: CureScheduleItem;
    }
  | {
      kind: "production";
      /** Stable React key: `p:<entryId>`. */
      key: string;
      /** The entry's plannedOn. */
      dueOn: LocalDate;
      state: ScheduleState;
      daysFromToday: number;
      /** For a done entry: its batch's producedOn (or plannedOn if the batch is missing). Else null. */
      doneOn: LocalDate | null;
      source: ProductionPlanListItem;
    };

export type ScheduleGroups = {
  /** Oldest due date first. */
  overdue: ScheduleItem[];
  due: ScheduleItem[];
  /** Soonest first. */
  upcoming: ScheduleItem[];
  /** Most recent doneOn first. */
  done: ScheduleItem[];
};

export type ScheduleModule = {
  /** Local calendar date of `now` (default: new Date()). */
  todayLocal(now?: Date): LocalDate;
  /** True for a real calendar date in YYYY-MM-DD form ("2026-02-30" is false). */
  isLocalDate(value: string): boolean;
  /** `date` plus `days` (may be negative). Throws RangeError for a date that is not a LocalDate. */
  addDays(date: LocalDate, days: number): LocalDate;
  /** `to` − `from` in whole days. */
  daysBetween(from: LocalDate, to: LocalDate): number;
  /** The state of an item due on `dueOn`. */
  stateFor(dueOn: LocalDate, done: boolean, today: LocalDate): ScheduleState;
  /** producedOn + offsetDays. */
  milestoneDueOn(producedOn: LocalDate, offsetDays: number): LocalDate;
  /**
   * Every milestone of the plan with due date and state, ordered by
   * offsetDays, then kind (cureEnd, burnTest, check), then id.
   */
  viewMilestones(plan: CurePlan, producedOn: LocalDate, today: LocalDate): MilestoneView[];
  /** The plan's cureEnd milestone, if any. */
  cureEndOf(plan: CurePlan): CureMilestone | undefined;
  /**
   * Flattens ScheduleData into items: one per milestone, one per production
   * entry. Ordered by dueOn, then milestones before production entries, then key.
   */
  buildSchedule(data: ScheduleData, today: LocalDate): ScheduleItem[];
  /** Splits items by state, each group in the order documented on ScheduleGroups. */
  groupSchedule(items: readonly ScheduleItem[]): ScheduleGroups;
  /** The nav badge: items that are overdue or due. */
  attentionCount(items: readonly ScheduleItem[]): number;
};
