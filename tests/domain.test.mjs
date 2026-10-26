import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSet,
  volume,
  summarize,
  decodeLogbook,
  newSession,
  weekStart,
  localDate,
  parseSessionMetadata,
  setCompletion,
  copyWeek,
} from "../src/domain.ts";
const input = {
  lift: "스쿼트",
  weight: "100",
  reps: "5",
  actualRpe: "7.5",
  kind: "work",
};
const set = (overrides = {}) => ({
  ...parseSet({ ...input, ...overrides }, "test"),
  completed: true,
});
test("volume is actual kg × reps and excludes warmups by default", () => {
  assert.equal(
    volume([set(), set({ weight: "60", reps: "10", kind: "warmup" })]),
    500,
  );
  assert.equal(
    volume([set(), set({ weight: "60", reps: "10", kind: "warmup" })], true),
    1100,
  );
  assert.equal(volume([]), 0);
  assert.equal(volume([set({ weight: "102.5", reps: "3" })]), 307.5);
});
test("target RPE and actual RPE remain independent; absent is not zero", () => {
  assert.equal(parseSessionMetadata("6", 3).targetRpe, 6);
  assert.equal(set().actualRpe, 7.5);
  assert.equal(set({ actualRpe: "" }).actualRpe, undefined);
  const summary = summarize([
    { ...newSession(), sets: [set({ actualRpe: "" }), set()] },
  ]);
  assert.equal(summary.averageActualRpe, 7.5);
  assert.equal(summary.sets, 2);
  assert.equal(summarize([]).averageActualRpe, undefined);
});
test("invalid and blank numbers never become performed volume", () => {
  for (const weight of [
    "",
    " ",
    "-1",
    "NaN",
    "Infinity",
    "0",
    "1e2",
    "1501",
    "0x10",
  ])
    assert.throws(() => set({ weight }));
  for (const reps of ["0", "-2", "1.5", "1001", ""])
    assert.throws(() => set({ reps }));
  for (const actualRpe of ["0", "10.5", "7.2", "-1", "NaN"])
    assert.throws(() => set({ actualRpe }));
  assert.equal(set({ actualRpe: "1" }).actualRpe, 1);
  assert.throws(() => set({ kind: "invalid" }));
  assert.throws(() => set({ lift: " " }));
});
test("summary excludes warmup RPE and counts only work sessions", () => {
  const result = summarize([
    { ...newSession("2026-10-26"), sets: [set()] },
    {
      ...newSession("2026-10-27"),
      sets: [set({ kind: "warmup", actualRpe: "10" })],
    },
  ]);
  assert.deepEqual(result, {
    volumeKg: 500,
    sets: 1,
    sessions: 1,
    averageActualRpe: 7.5,
  });
});
test("storage round trip preserves fields; invalid schema cannot overwrite silently", () => {
  const book = { version: 1, sessions: [{ ...newSession(), sets: [set()] }] };
  assert.deepEqual(decodeLogbook(JSON.stringify(book)), book);
  for (const bad of ["null", "{}", '{"version":2,"sessions":[]}', "not json"])
    assert.throws(() => decodeLogbook(bad));
  assert.throws(() =>
    decodeLogbook(
      JSON.stringify({
        ...book,
        sessions: [book.sessions[0], book.sessions[0]],
      }),
    ),
  );
  assert.throws(() =>
    decodeLogbook(
      JSON.stringify({
        version: 1,
        sessions: [{ ...newSession(), sets: [{ ...set(), weightKg: -5 }] }],
      }),
    ),
  );
});
test("calendar weeks begin Monday and date uses device-local calendar", () => {
  assert.equal(weekStart(new Date(2026, 9, 25, 12)), "2026-10-19");
  assert.equal(weekStart(new Date(2026, 9, 26, 12)), "2026-10-26");
  assert.equal(localDate(new Date(2026, 0, 2, 12)), "2026-01-02");
});

test("uncompleted planned sets contribute no volume or RPE; completion is idempotent", () => {
  const original = { ...newSession(), sets: [{ ...set(), completed: false }] };
  assert.equal(summarize([original]).volumeKg, 0);
  assert.equal(summarize([original]).averageActualRpe, undefined);
  const completed = setCompletion(original, "test", true);
  assert.equal(volume(completed.sets), 500);
  assert.deepEqual(setCompletion(completed, "test", true), completed);
  assert.equal(volume(setCompletion(completed, "test", false).sets), 0);
  assert.equal(original.sets[0].completed, false);
});
test("session target and single condition score validation", () => {
  assert.deepEqual(parseSessionMetadata("", undefined), {
    targetRpe: undefined,
    conditionScore: undefined,
  });
  for (const target of ["0", "10.5", "7.2", "NaN", "-1", "1e0"])
    assert.throws(() => parseSessionMetadata(target));
  for (const score of [0, 6, 2.5, NaN])
    assert.throws(() => parseSessionMetadata("6", score));
});
test("copy week resets performance, preserves planned loads, and never overwrites", () => {
  const source = {
    ...newSession("2026-10-19"),
    targetRpe: 6,
    conditionScore: 4,
    plan: { block: "A", week: "1", day: "D1" },
    sets: [set()],
  };
  const book = { version: 1, sessions: [source] };
  const next = copyWeek(book, "2026-10-19", "2026-10-26");
  assert.equal(next.sessions.length, 2);
  const copied = next.sessions[1];
  assert.equal(copied.date, "2026-10-26");
  assert.equal(copied.targetRpe, 6);
  assert.equal(copied.conditionScore, undefined);
  assert.equal(copied.plan.week, undefined);
  assert.equal(copied.sets[0].weightKg, 100);
  assert.equal(copied.sets[0].actualRpe, undefined);
  assert.equal(copied.sets[0].completed, false);
  assert.equal(source.sets[0].completed, true);
  assert.equal(book.sessions.length, 1);
  assert.throws(() => copyWeek(next, "2026-10-19", "2026-10-26"));
  assert.throws(() => copyWeek(book, "2026-10-12", "2026-10-26"));
  assert.throws(() => copyWeek(book, "2026-10-20", "2026-10-26"));
});

test("copy uses original plan rather than modified performance loads", () => {
  const source = {
    ...newSession("2026-10-19"),
    sets: [{ ...set(), weightKg: 110, reps: 4 }],
  };
  const next = copyWeek(
    { version: 1, sessions: [source] },
    "2026-10-19",
    "2026-10-26",
  );
  assert.equal(next.sessions[1].sets[0].weightKg, 100);
  assert.equal(next.sessions[1].sets[0].reps, 5);
});
test("storage rejects impossible dates and invalid planned numeric types", () => {
  assert.throws(() =>
    decodeLogbook(
      JSON.stringify({ version: 1, sessions: [newSession("2026-02-30")] }),
    ),
  );
  assert.throws(() =>
    decodeLogbook(
      JSON.stringify({
        version: 1,
        sessions: [{ ...newSession(), sets: [{ ...set(), plannedReps: "5" }] }],
      }),
    ),
  );
});

test("custom accessory exercise names are accepted", () => {
  assert.equal(set({ lift: "로우" }).lift, "로우");
  assert.throws(() => set({ lift: "x".repeat(81) }));
});
