export type Lift = string;
export type SetRecord = {
  id: string;
  lift: Lift;
  weightKg: number;
  reps: number;
  plannedWeightKg: number;
  plannedReps: number;
  completed: boolean;
  actualRpe?: number;
  kind: "work" | "warmup";
};
// A reference, not a generated prescription. All labels are optional and user-entered.
export type PlanReference = { block?: string; week?: string; day?: string };
export type Session = {
  id: string;
  date: string;
  plan: PlanReference;
  conditionScore?: number;
  targetRpe?: number;
  sets: SetRecord[];
};
export type Logbook = { version: 1; sessions: Session[] };
export type SetInput = {
  lift: Lift;
  weight: string;
  reps: string;
  actualRpe: string;
  kind: SetRecord["kind"];
};
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function newSession(date = localDate()): Session {
  return { id: date, date, plan: {}, sets: [] };
}
export function parseSet(input: SetInput, id: string): SetRecord {
  const numeric = (value: string, label: string) => {
    if (!/^\d+(\.\d+)?$/.test(value.trim()))
      throw new Error(`${label}: 숫자를 입력해 주세요.`);
    return Number(value);
  };
  const weightKg = numeric(input.weight, "중량");
  const reps = numeric(input.reps, "횟수");
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 1500)
    throw new Error("중량은 0 초과 1,500kg 이하로 입력해 주세요.");
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000)
    throw new Error("횟수는 1~1,000의 정수로 입력해 주세요.");
  const rpe = (value: string, label: string) => {
    if (!value.trim()) return undefined;
    const n = numeric(value, label);
    if (n < 1 || n > 10 || !Number.isInteger(n * 2))
      throw new Error(`${label}: 1~10 사이, 0.5 단위로 입력해 주세요.`);
    return n;
  };
  if (
    typeof input.lift !== "string" ||
    !input.lift.trim() ||
    input.lift.trim().length > 80
  )
    throw new Error("지원하지 않는 종목입니다.");
  if (input.kind !== "warmup" && input.kind !== "work")
    throw new Error("세트 종류를 선택해 주세요.");
  return {
    id,
    lift: input.lift.trim(),
    weightKg,
    reps,
    plannedWeightKg: weightKg,
    plannedReps: reps,
    completed: false,
    actualRpe: rpe(input.actualRpe, "실제 RPE"),
    kind: input.kind,
  };
}
export function volume(sets: SetRecord[], includeWarmups = false): number {
  return sets
    .filter((s) => s.completed && (includeWarmups || s.kind === "work"))
    .reduce((total, s) => total + s.weightKg * s.reps, 0);
}
export function summarize(sessions: Session[]) {
  const sets = sessions
    .flatMap((s) => s.sets)
    .filter((s) => s.completed && s.kind === "work");
  const actual = sets.flatMap((s) =>
    s.actualRpe === undefined ? [] : [s.actualRpe],
  );
  return {
    volumeKg: volume(sets),
    sets: sets.length,
    sessions: sessions.filter((s) =>
      s.sets.some((x) => x.completed && x.kind === "work"),
    ).length,
    averageActualRpe: actual.length
      ? actual.reduce((a, b) => a + b, 0) / actual.length
      : undefined,
  };
}
export function weekStart(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}
export function decodeLogbook(raw: string): Logbook {
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.sessions))
    throw new Error("지원하지 않는 저장 형식입니다.");
  const ids = new Set<string>();
  for (const s of data.sessions) {
    if (
      !s ||
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      typeof s.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      !s.plan ||
      typeof s.plan !== "object" ||
      !Array.isArray(s.sets)
    )
      throw new Error("저장된 세션을 읽을 수 없습니다.");
    if (
      s.id !== s.date ||
      !Number.isFinite(new Date(`${s.date}T12:00:00`).getTime()) ||
      localDate(new Date(`${s.date}T12:00:00`)) !== s.date
    )
      throw new Error("기록 날짜가 올바르지 않습니다.");
    ids.add(s.id);
    parseSessionMetadata(
      s.targetRpe === undefined ? "" : String(s.targetRpe),
      s.conditionScore,
    );
    if (
      (s.targetRpe !== undefined && typeof s.targetRpe !== "number") ||
      (s.conditionScore !== undefined && typeof s.conditionScore !== "number")
    )
      throw new Error("세션 점수를 읽을 수 없습니다.");
    for (const key of ["block", "week", "day"])
      if (s.plan[key] !== undefined && typeof s.plan[key] !== "string")
        throw new Error("주기화 메모를 읽을 수 없습니다.");
    const setIds = new Set<string>();
    for (const set of s.sets) {
      if (
        !set ||
        typeof set.id !== "string" ||
        setIds.has(set.id) ||
        typeof set.plannedWeightKg !== "number" ||
        typeof set.plannedReps !== "number" ||
        typeof set.weightKg !== "number" ||
        typeof set.reps !== "number" ||
        typeof set.completed !== "boolean" ||
        (set.actualRpe !== undefined && typeof set.actualRpe !== "number")
      )
        throw new Error("저장된 세트를 읽을 수 없습니다.");
      setIds.add(set.id);
      parseSet(
        {
          lift: set.lift,
          weight: String(set.plannedWeightKg),
          reps: String(set.plannedReps),
          actualRpe: "",
          kind: set.kind,
        },
        set.id,
      );
      parseSet(
        {
          lift: set.lift,
          weight: String(set.weightKg),
          reps: String(set.reps),
          actualRpe: set.actualRpe === undefined ? "" : String(set.actualRpe),
          kind: set.kind,
        },
        set.id,
      );
    }
  }
  return data as Logbook;
}

export function parseSessionMetadata(target: string, conditionScore?: number) {
  const targetRpe = target.trim() === "" ? undefined : Number(target);
  if (
    targetRpe !== undefined &&
    (!/^\d+(\.\d+)?$/.test(target.trim()) ||
      targetRpe < 1 ||
      targetRpe > 10 ||
      !Number.isInteger(targetRpe * 2))
  )
    throw new Error("공통 목표 RPE는 1~10, 0.5 단위로 입력해 주세요.");
  if (
    conditionScore !== undefined &&
    (!Number.isInteger(conditionScore) ||
      conditionScore < 1 ||
      conditionScore > 5)
  )
    throw new Error("컨디션은 1~5 중 선택해 주세요.");
  return { targetRpe, conditionScore };
}
export function setCompletion(
  session: Session,
  id: string,
  completed: boolean,
): Session {
  return {
    ...session,
    sets: session.sets.map((s) => (s.id === id ? { ...s, completed } : s)),
  };
}
export function copyWeek(
  book: Logbook,
  fromMonday: string,
  toMonday: string,
): Logbook {
  const date = (s: string) => new Date(`${s}T12:00:00`);
  const from = date(fromMonday),
    to = date(toMonday);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from.getDay() !== 1 ||
    to.getDay() !== 1
  )
    throw new Error("월요일을 기준으로 복사해 주세요.");
  const sourceDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return localDate(d);
  });
  const copies = book.sessions
    .filter((s) => sourceDates.includes(s.date))
    .map((s) => {
      const d = new Date(to);
      d.setDate(d.getDate() + sourceDates.indexOf(s.date));
      const newDate = localDate(d);
      return {
        ...s,
        id: newDate,
        date: newDate,
        conditionScore: undefined,
        plan: { ...s.plan, week: undefined },
        sets: s.sets.map((set, i) => ({
          ...set,
          id: `${newDate}-${i}`,
          weightKg: set.plannedWeightKg,
          reps: set.plannedReps,
          completed: false,
          actualRpe: undefined,
        })),
      };
    });
  if (!copies.length) throw new Error("지난주에 복사할 계획이 없어요.");
  if (
    copies.some((s) =>
      book.sessions.some((existing) => existing.date === s.date),
    )
  )
    throw new Error(
      "이번 주에 겹치는 날짜가 있어요. 기존 기록 보호를 위해 복사하지 않았어요.",
    );
  return { ...book, sessions: [...book.sessions, ...copies] };
}
