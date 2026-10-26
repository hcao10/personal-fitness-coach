import type { MessageKey } from "../../../packages/i18n/src";

/** Labels only: the equipment identifiers sent to the planner stay unchanged. */
export const EQUIPMENT_LABELS: Readonly<Record<string, MessageKey>> = {
  gym: "onboarding.equipmentGym", "body weight": "exercises.equipmentBodyweight", "leverage machine": "exercises.equipmentMachine", "smith machine": "exercises.equipmentMachine", "resistance band": "exercises.equipmentBand", bodyweight: "exercises.equipmentBodyweight", dumbbell: "exercises.equipmentDumbbell",
  barbell: "exercises.equipmentBarbell", cable: "exercises.equipmentCable", band: "exercises.equipmentBand", machine: "exercises.equipmentMachine",
};
