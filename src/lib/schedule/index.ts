import type { ScheduleModule } from "./contract";
import { addDays, daysBetween, isLocalDate, todayLocal } from "./dates";
import {
  attentionCount,
  buildSchedule,
  cureEndOf,
  groupSchedule,
  milestoneDueOn,
  stateFor,
  viewMilestones,
} from "./schedule";

export * from "./contract";
export { addDays, daysBetween, isLocalDate, todayLocal } from "./dates";
export {
  attentionCount,
  buildSchedule,
  cureEndOf,
  groupSchedule,
  milestoneDueOn,
  stateFor,
  viewMilestones,
} from "./schedule";

const _implemented: ScheduleModule = {
  todayLocal,
  isLocalDate,
  addDays,
  daysBetween,
  stateFor,
  milestoneDueOn,
  viewMilestones,
  cureEndOf,
  buildSchedule,
  groupSchedule,
  attentionCount,
};
void _implemented;
