// One re-export point for the plan feature, so the pages below it import from
// their own feature rather than reaching four directories up for every type.
export { generatePlan, type CoachPlan, type Profile, type WorkoutDay, type PlannedExercise } from "../../lib/coach";
export {
  acceptPlan, dayIndexFor, generatedPlan, localDate, planReasons, planRecord, shiftDate, supersedePlan,
  type PlanReason, type PlanRecord, type PlanSource, type PlanState,
} from "../../../packages/product-state/src";
