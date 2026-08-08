import assert from "node:assert/strict";
import test from "node:test";
import { isoWeekStart, summarizeWeeks, computeStreak, detectMilestones, composeWeeklyLetter, trainingReminderMessage, inQuietHours } from "../services/habit-engine/src/index.ts";

const TODAY = "2026-08-08"; // a Saturday; week starts 2026-08-03
const weekStart = (weeksAgo) => new Date(Date.parse("2026-08-03T00:00:00Z") - weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10);
const sessionsIn = (weeksAgo, count) => Array.from({ length: count }, (_, index) => new Date(Date.parse(`${weekStart(weeksAgo)}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10));

test("isoWeekStart buckets to Monday", () => {
  assert.equal(isoWeekStart("2026-08-08"), "2026-08-03");
  assert.equal(isoWeekStart("2026-08-03"), "2026-08-03");
  assert.equal(isoWeekStart("2026-08-02"), "2026-07-27");
});

test("an unbroken run of active weeks counts fully, in-progress week never breaks it", () => {
  const dates = [...sessionsIn(1, 2), ...sessionsIn(2, 3), ...sessionsIn(3, 2)];
  const streak = computeStreak(summarizeWeeks(dates, TODAY));
  assert.equal(streak.activeThisWeek, false);
  assert.equal(streak.currentWeeks, 3);
  assert.equal(streak.repairedWeeks.length, 0);
});

test("one missed week inside a rolling four is auto-repaired, two are not", () => {
  const oneMiss = [...sessionsIn(0, 2), ...sessionsIn(1, 2), /* week 2 missed */ ...sessionsIn(3, 2), ...sessionsIn(4, 2)];
  const repaired = computeStreak(summarizeWeeks(oneMiss, TODAY));
  assert.equal(repaired.currentWeeks, 4);
  assert.deepEqual(repaired.repairedWeeks, [weekStart(2)]);

  const twoMisses = [...sessionsIn(0, 2), ...sessionsIn(1, 2), /* weeks 2 and 3 missed */ ...sessionsIn(4, 2), ...sessionsIn(5, 2)];
  const broken = computeStreak(summarizeWeeks(twoMisses, TODAY));
  assert.equal(broken.currentWeeks, 2);
});

test("a week below the session minimum does not count as active", () => {
  const dates = [...sessionsIn(0, 1), ...sessionsIn(1, 2)];
  const streak = computeStreak(summarizeWeeks(dates, TODAY));
  assert.equal(streak.activeThisWeek, false);
  assert.equal(streak.sessionsThisWeek, 1);
  assert.equal(streak.currentWeeks, 1);
});

test("milestones are identity-framed and thresholds are respected", () => {
  const none = detectMilestones({ currentWeeks: 0, longestWeeks: 0, repairedWeeks: [], activeThisWeek: false, sessionsThisWeek: 0 }, 0);
  assert.equal(none.length, 0);
  const four = detectMilestones({ currentWeeks: 4, longestWeeks: 4, repairedWeeks: [], activeThisWeek: true, sessionsThisWeek: 2 }, 12);
  assert.deepEqual(four.map((milestone) => milestone.kind), ["first_week", "streak_4_weeks"]);
  assert.match(four[1].message.zh, /你已经是/);
  const hundred = detectMilestones({ currentWeeks: 13, longestWeeks: 13, repairedWeeks: [], activeThisWeek: true, sessionsThisWeek: 3 }, 100);
  assert.ok(hundred.some((milestone) => milestone.kind === "sessions_100"));
});

test("weekly letter narrates streak, milestone and next-week focus", () => {
  const letter = composeWeeklyLetter({
    streak: { currentWeeks: 5, longestWeeks: 5, repairedWeeks: [], activeThisWeek: true, sessionsThisWeek: 3 },
    plannedSessions: 3,
    deloadRecommended: false,
    adjustments: [{ kind: "increase_load", reason: { zh: "卧推下次加重 5%。", en: "Add 5% to bench next time." } }],
    newMilestones: [],
  });
  assert.match(letter.lines.zh[0], /3\/3/);
  assert.match(letter.lines.zh[0], /第 5 周/);
  assert.match(letter.lines.zh.at(-1), /加重 5%/);
});

test("deload weeks reframe recovery as part of the plan", () => {
  const letter = composeWeeklyLetter({
    streak: { currentWeeks: 8, longestWeeks: 8, repairedWeeks: [], activeThisWeek: true, sessionsThisWeek: 3 },
    plannedSessions: 3, deloadRecommended: true, adjustments: [], newMilestones: [],
  });
  assert.match(letter.lines.zh.at(-1), /减量/);
  assert.match(letter.lines.en.at(-1), /not a step back/);
});

test("training reminder anchors to the committed place and offers the short variant", () => {
  const message = trainingReminderMessage({ cuePlace: "小区健身房", streakWeeks: 3, shortVariantMinutes: 20 });
  assert.match(message.title.zh, /小区健身房/);
  assert.match(message.body.zh, /20 分钟/);
  assert.match(message.body.zh, /第 3 周/);
  const noPlace = trainingReminderMessage({ cuePlace: null, streakWeeks: 0 });
  assert.match(noPlace.title.zh, /训练时间/);
  assert.doesNotMatch(noPlace.body.zh, /第 0 周/);
});

test("quiet hours handle overnight wrap-around", () => {
  assert.equal(inQuietHours("23:30", "22:00", "08:00"), true);
  assert.equal(inQuietHours("07:59", "22:00", "08:00"), true);
  assert.equal(inQuietHours("08:00", "22:00", "08:00"), false);
  assert.equal(inQuietHours("12:00", "22:00", "08:00"), false);
  assert.equal(inQuietHours("12:00", "12:00", "12:00"), false);
});
