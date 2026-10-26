import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  copyWeek,
  parseSessionMetadata,
  setCompletion,
  localDate,
  newSession,
  parseSet,
  summarize,
  volume,
  weekStart,
  type Lift,
  type Logbook,
  type PlanReference,
  type Session,
  type SetInput,
} from "./src/domain";
import { loadLogbook, saveLogbook } from "./src/storage";
const C = {
  bg: "#101311",
  card: "#1B201C",
  border: "#343D35",
  muted: "#A7B1A6",
  text: "#F0F4E9",
  lime: "#D4EF8C",
};
const emptySet = (): SetInput => ({
  lift: "스쿼트",
  weight: "",
  reps: "",
  actualRpe: "",
  kind: "work",
});
const number = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: C.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChangeText,
  numeric = false,
  placeholder = "선택 입력",
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  numeric?: boolean;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={{ flex: 1, minWidth: 110 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        editable={!disabled}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7E8A7D"
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        maxLength={multiline ? 2000 : 100}
        style={[
          styles.input,
          multiline && { minHeight: 80, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Notebook />
    </SafeAreaProvider>
  );
}
function Notebook() {
  const [date, setDate] = useState(localDate),
    [dateInput, setDateInput] = useState(localDate);
  const [book, setBook] = useState<Logbook>({ version: 1, sessions: [] });
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<"today" | "history">("today");
  const [form, setForm] = useState<SetInput>(emptySet),
    [editId, setEditId] = useState<string>();
  const [plan, setPlan] = useState<PlanReference>({}),
    [condition, setCondition] = useState<number>(),
    [target, setTarget] = useState(""),
    [count, setCount] = useState("1");
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const session =
    book.sessions.find((s) => s.date === date) ?? newSession(date);
  const summary = summarize(
    book.sessions.filter((s) => s.date >= weekStart() && s.date <= localDate()),
  );
  async function load() {
    setLoadError("");
    try {
      const data = await loadLogbook();
      setBook(data);
      const today = data.sessions.find((s) => s.date === date);
      setPlan(today?.plan ?? {});
      setCondition(today?.conditionScore);
      setTarget(today?.targetRpe === undefined ? "" : String(today.targetRpe));
      setReady(true);
    } catch {
      setLoadError(
        "기록을 불러오지 못했어요. 기존 데이터는 덮어쓰지 않습니다. 앱을 다시 열거나 아래에서 재시도해 주세요.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function commit(next: Session): Promise<boolean> {
    if (lock.current || !ready) return false;
    lock.current = true;
    setSaving(true);
    setMessage("");
    let metadata;
    try {
      metadata = parseSessionMetadata(target, condition);
    } catch (e) {
      lock.current = false;
      setSaving(false);
      setMessage((e as Error).message);
      return false;
    }
    next = { ...next, ...metadata, plan };
    const nextBook: Logbook = {
      version: 1,
      sessions: [...book.sessions.filter((s) => s.id !== next.id), next],
    };
    try {
      await saveLogbook(nextBook);
      setBook(nextBook);
      setMessage("이 기기에 저장했어요.");
      return true;
    } catch {
      setMessage("저장하지 못했어요. 입력은 유지됩니다. 다시 시도해 주세요.");
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function addSet() {
    if (lock.current) return;
    try {
      const set = parseSet(
        form,
        editId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      const n = Number(count);
      if (
        !editId &&
        (!/^\d+$/.test(count) || !Number.isInteger(n) || n < 1 || n > 30)
      )
        throw new Error("목표 세트 수는 1~30의 정수로 입력해 주세요.");
      const sets = editId
        ? session.sets.map((s) =>
            s.id === editId
              ? {
                  ...set,
                  completed: s.completed,
                  plannedWeightKg: s.completed
                    ? s.plannedWeightKg
                    : set.weightKg,
                  plannedReps: s.completed ? s.plannedReps : set.reps,
                }
              : s,
          )
        : [
            ...session.sets,
            ...Array.from({ length: n }, (_, i) => ({
              ...set,
              id: `${set.id}-${i}`,
            })),
          ];
      if (await commit({ ...session, plan, sets })) {
        setForm(emptySet());
        setEditId(undefined);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  async function copyPreviousWeek() {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      const to = weekStart();
      const d = new Date(`${to}T12:00:00`);
      d.setDate(d.getDate() - 7);
      const next = copyWeek(book, localDate(d), to);
      await saveLogbook(next);
      setBook(next);
      setForm(emptySet());
      setEditId(undefined);
      const current = next.sessions.find((s) => s.date === date);
      if (current) {
        setPlan(current.plan);
        setTarget(
          current.targetRpe === undefined ? "" : String(current.targetRpe),
        );
        setCondition(current.conditionScore);
      }
      setMessage(
        "지난주 계획을 복사했어요. 수행 여부·실제 RPE·컨디션은 초기화했어요. 주차 이름은 직접 입력해 주세요.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "복사하지 못했어요.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function openDate(nextDate: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(nextDate) ||
      !Number.isFinite(new Date(`${nextDate}T12:00:00`).getTime()) ||
      localDate(new Date(`${nextDate}T12:00:00`)) !== nextDate
    ) {
      setMessage("기록일은 YYYY-MM-DD 형식의 실제 날짜를 입력해 주세요.");
      return;
    }
    Alert.alert("기록일을 변경할까요?", "저장하지 않은 입력은 사라져요.", [
      { text: "취소", style: "cancel" },
      {
        text: "열기",
        onPress: () => {
          if (lock.current) return;
          const next =
            book.sessions.find((s) => s.date === nextDate) ??
            newSession(nextDate);
          setDate(nextDate);
          setDateInput(nextDate);
          setPlan(next.plan);
          setTarget(next.targetRpe === undefined ? "" : String(next.targetRpe));
          setCondition(next.conditionScore);
          setForm(emptySet());
          setEditId(undefined);
          setMessage("");
          setTab("today");
        },
      },
    ]);
  }
  const patch = (key: keyof SetInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  function edit(set: Session["sets"][number]) {
    setEditId(set.id);
    setForm({
      lift: set.lift,
      weight: String(set.weightKg),
      reps: String(set.reps),
      actualRpe: set.actualRpe === undefined ? "" : String(set.actualRpe),
      kind: set.kind,
    });
    setMessage("아래 세트 입력란에서 수정해 주세요.");
  }
  function remove(id: string) {
    Alert.alert("세트를 삭제할까요?", "이 기기의 기록에서 삭제됩니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          void commit({
            ...session,
            plan,
            sets: session.sets.filter((s) => s.id !== id),
          }).then((ok) => {
            if (ok && editId === id) {
              setEditId(undefined);
              setForm(emptySet());
            }
          });
        },
      },
    ]);
  }
  if (!ready)
    return (
      <SafeAreaView style={styles.root}>
        <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>
          <Text style={styles.title}>리프트 노트</Text>
          {loadError ? (
            <>
              <Text style={styles.body}>{loadError}</Text>
              <Button title="다시 불러오기" onPress={() => void load()} />
            </>
          ) : (
            <ActivityIndicator color={C.lime} />
          )}
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          pointerEvents={saving ? "none" : "auto"}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.row}>
            <Text style={styles.brand}>LIFT / NOTE</Text>
            <Text style={styles.badge}>LOCAL FIRST</Text>
          </View>
          <Text style={styles.title}>
            {tab === "today" ? "나의 리프팅" : "쌓이는 기록"}
          </Text>
          <Text style={styles.body}>
            {tab === "today"
              ? `${date} · 나의 강도, 나의 기록`
              : "완료한 세트만 모아보세요."}
          </Text>
          <View style={styles.tabs}>
            {(["today", "history"] as const).map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                onPress={() => setTab(t)}
                style={[styles.tab, tab === t && { backgroundColor: C.lime }]}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: tab === t ? C.bg : C.muted,
                  }}
                >
                  {t === "today" ? "운동일" : "기록 · 주간"}
                </Text>
              </Pressable>
            ))}
          </View>
          {tab === "today" ? (
            <>
              <View style={styles.card}>
                <Field
                  disabled={saving}
                  label="기록일 (YYYY-MM-DD) · 자동으로 날짜가 바뀌지 않아요"
                  value={dateInput}
                  onChangeText={setDateInput}
                />
                <Button
                  secondary
                  title="이 날짜 열기"
                  disabled={saving}
                  onPress={() => openDate(dateInput)}
                />
                <Button
                  secondary
                  title="오늘 날짜로 이동"
                  disabled={saving}
                  onPress={() => openDate(localDate())}
                />
              </View>
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>
                  선택한 운동일의 작업 세트 볼륨
                </Text>
                <Text style={styles.heroNumber}>
                  {number(volume(session.sets))}
                  <Text style={{ fontSize: 18 }}> kg</Text>
                </Text>
                <Text style={{ color: "#344226" }}>
                  {
                    session.sets.filter((s) => s.completed && s.kind === "work")
                      .length
                  }{" "}
                  세트 · 중량 × 실제 수행 횟수
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.section}>01 / 주기화 & 컨디션</Text>
                <Text style={styles.body}>
                  선택 메모예요. 계획을 자동으로 만들지 않아요.
                </Text>
                <View style={styles.wrap}>
                  {(["block", "week", "day"] as const).map((key, i) => (
                    <Field
                      disabled={saving}
                      key={key}
                      label={["블록", "주차", "운동일"][i]}
                      value={plan[key] ?? ""}
                      onChangeText={(v) => setPlan((p) => ({ ...p, [key]: v }))}
                    />
                  ))}
                </View>
                <Field
                  disabled={saving}
                  label="세션 공통 목표 RPE (@)"
                  value={target}
                  onChangeText={setTarget}
                  numeric
                />
                <Text style={styles.label}>
                  컨디션 한 점수 · 1 매우 나쁨 → 5 매우 좋음
                </Text>
                <View style={styles.wrap}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable
                      key={n}
                      accessibilityRole="button"
                      accessibilityState={{ selected: condition === n }}
                      style={[styles.chip, condition === n && styles.selected]}
                      onPress={() =>
                        setCondition(condition === n ? undefined : n)
                      }
                    >
                      <Text style={{ color: C.lime }}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  secondary
                  title="메모 저장"
                  disabled={saving}
                  onPress={() => void commit({ ...session, plan })}
                />
              </View>
              <View style={styles.card}>
                <Text style={styles.section}>02 / 계획과 수행</Text>
                <Text style={styles.small}>
                  수행 {session.sets.filter((s) => s.completed).length} / 목표{" "}
                  {session.sets.length} 세트
                </Text>
                {([...new Set(session.sets.map(s => s.lift))])
                  .filter((l) => session.sets.some((s) => s.lift === l))
                  .map((l) => (
                    <Text key={l} style={styles.small}>
                      {l} · 수행{" "}
                      {
                        session.sets.filter((s) => s.lift === l && s.completed)
                          .length
                      }{" "}
                      / 목표 {session.sets.filter((s) => s.lift === l).length}
                    </Text>
                  ))}
                {session.sets.length === 0 ? (
                  <Text style={styles.empty}>
                    아직 계획이 없어요.\n종목 · 중량 · 세트 · 횟수를 입력해
                    주세요.
                  </Text>
                ) : (
                  session.sets.map((s, i) => (
                    <View key={s.id} style={styles.setRow}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: s.completed }}
                        accessibilityLabel={`${i + 1}번 세트 수행 완료`}
                        disabled={saving}
                        onPress={() =>
                          void commit(
                            setCompletion(session, s.id, !s.completed),
                          )
                        }
                        style={styles.smallButton}
                      >
                        <Text style={{ color: C.lime, fontSize: 22 }}>
                          {s.completed ? "☑" : "□"}
                        </Text>
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.setTitle}>
                          {String(i + 1).padStart(2, "0")} {s.lift}{" "}
                          {s.kind === "warmup" ? "· 워밍업" : ""}
                        </Text>
                        <Text style={styles.body}>
                          {s.weightKg} kg × {s.reps}회
                        </Text>
                        <Text style={styles.small}>
                          실제 @{s.actualRpe ?? "—"} ·{" "}
                          {s.completed ? "수행 완료" : "미수행"}
                        </Text>
                      </View>
                      <Pressable
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`${i + 1}번 세트 수정`}
                        onPress={() => edit(s)}
                        style={styles.smallButton}
                      >
                        <Text style={{ color: C.lime }}>수정</Text>
                      </Pressable>
                      <Pressable
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`${i + 1}번 세트 삭제`}
                        onPress={() => remove(s.id)}
                        style={styles.smallButton}
                      >
                        <Text style={{ color: C.muted }}>삭제</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
              <View style={styles.card}>
                <Text style={styles.section}>
                  {editId ? "세트 수정" : "03 / 계획 세트 추가"}
                </Text>
                <View style={styles.wrap}>
                  {(["스쿼트", "벤치프레스", "데드리프트"] as Lift[]).map(
                    (lift) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: form.lift === lift }}
                        key={lift}
                        onPress={() => patch("lift", lift)}
                        style={[
                          styles.chip,
                          form.lift === lift && styles.selected,
                        ]}
                      >
                        <Text
                          style={{
                            color: form.lift === lift ? C.lime : C.muted,
                          }}
                        >
                          {lift}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
                <Field
                  disabled={saving}
                  label="종목 이름 · 보조 운동 직접 입력 가능"
                  value={form.lift}
                  onChangeText={(v) => patch("lift", v)}
                  placeholder="종목 이름"
                />
                <View style={styles.wrap}>
                  <Field
                    disabled={saving}
                    label="중량 (kg)"
                    numeric
                    value={form.weight}
                    onChangeText={(v) => patch("weight", v)}
                    placeholder="필수"
                  />
                  <Field
                    disabled={saving}
                    label="횟수 (수정 가능)"
                    numeric
                    value={form.reps}
                    onChangeText={(v) => patch("reps", v)}
                    placeholder="필수"
                  />
                </View>
                <View style={styles.wrap}>
                  {!editId && (
                    <Field
                      disabled={saving}
                      label="목표 세트 수"
                      numeric
                      value={count}
                      onChangeText={setCount}
                      placeholder="필수"
                    />
                  )}
                  {editId && (
                    <Field
                      disabled={saving}
                      label="실제 RPE"
                      numeric
                      value={form.actualRpe}
                      onChangeText={(v) => patch("actualRpe", v)}
                    />
                  )}
                </View>
                <Text style={styles.small}>
                  공통 목표 @{target || "—"} · 완료 체크 후에만 볼륨 반영 ·
                  완료한 세트를 수정하면 실제 수행값만 변경
                </Text>
                <View style={styles.wrap}>
                  {(["work", "warmup"] as const).map((k) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: form.kind === k }}
                      key={k}
                      style={[styles.chip, form.kind === k && styles.selected]}
                      onPress={() => patch("kind", k)}
                    >
                      <Text
                        style={{ color: form.kind === k ? C.lime : C.muted }}
                      >
                        {k === "work" ? "작업 세트" : "워밍업"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  title={
                    saving
                      ? "저장 중…"
                      : editId
                        ? "수정 저장"
                        : "계획 세트 추가 +"
                  }
                  disabled={saving}
                  onPress={() => void addSet()}
                />
                {editId && (
                  <Button
                    title="수정 취소"
                    secondary
                    disabled={saving}
                    onPress={() => {
                      setEditId(undefined);
                      setForm(emptySet());
                      setMessage("수정을 취소했어요.");
                    }}
                  />
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>
                  이번 주 · {weekStart()} ~ 오늘
                </Text>
                <Text style={styles.heroNumber}>
                  {number(summary.volumeKg)}
                  <Text style={{ fontSize: 18 }}> kg</Text>
                </Text>
                <Text style={{ color: "#344226" }}>
                  {summary.sessions}일 · {summary.sets} 작업 세트 · 실제 RPE
                  평균{" "}
                  {summary.averageActualRpe === undefined
                    ? "—"
                    : number(summary.averageActualRpe)}
                </Text>
              </View>
              <Text style={styles.small}>
                미수행·워밍업 제외 · 미입력 RPE는 평균에서 제외
              </Text>
              <Button
                secondary
                title="지난주 계획 → 이번 주 복사"
                disabled={saving}
                onPress={() =>
                  Alert.alert(
                    "지난주 계획을 복사할까요?",
                    "수행 기록은 복사하지 않아요. 이번 주와 겹치면 전체 복사를 취소해요. 저장하지 않은 세션 메모는 사라질 수 있어요.",
                    [
                      { text: "취소", style: "cancel" },
                      { text: "복사", onPress: () => void copyPreviousWeek() },
                    ],
                  )
                }
              />
              {book.sessions.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.empty}>
                    기록은 빈 공책에서 시작해요.\n오늘의 첫 기록을 남겨보세요.
                  </Text>
                </View>
              ) : (
                [...book.sessions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((s) => (
                    <View key={s.id} style={styles.card}>
                      <Text style={styles.section}>{s.date}</Text>
                      <Button
                        secondary
                        title="이 운동일 열기"
                        disabled={saving}
                        onPress={() => openDate(s.date)}
                      />
                      <Text style={styles.setTitle}>
                        {number(volume(s.sets))} kg ·{" "}
                        {
                          s.sets.filter((x) => x.completed && x.kind === "work")
                            .length
                        }{" "}
                        작업 세트
                      </Text>
                      {Object.values(s.plan).filter(Boolean).length > 0 && (
                        <Text style={styles.body}>
                          {[s.plan.block, s.plan.week, s.plan.day]
                            .filter(Boolean)
                            .join(" / ")}
                        </Text>
                      )}
                      <Text style={styles.body}>
                        공통 목표 @{s.targetRpe ?? "—"} · 컨디션{" "}
                        {s.conditionScore ?? "—"}/5
                      </Text>
                      {s.sets.map((x, i) => (
                        <Text key={x.id} style={styles.small}>
                          {i + 1}. {x.lift} · {x.weightKg} kg × {x.reps} ·{" "}
                          {x.completed ? "완료" : "예정"} / 실제 @
                          {x.actualRpe ?? "—"}
                          {x.kind === "warmup" ? " · 워밍업" : ""}
                        </Text>
                      ))}
                    </View>
                  ))
              )}
            </>
          )}
          {message !== "" && (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {message}
            </Text>
          )}
          <Text style={styles.footer}>
            내 기기 안에 보관 · 클라우드 동기화 없음{`\n`}초기 프로토타입 · 앱
            삭제 시 기록이 사라질 수 있어요.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 22, gap: 18, paddingBottom: 44 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  brand: { fontSize: 12, fontWeight: "800", letterSpacing: 3, color: C.lime },
  badge: {
    color: C.muted,
    fontSize: 10,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 7,
  },
  title: { fontSize: 32, fontWeight: "800", color: C.text, letterSpacing: -1 },
  body: { color: C.muted, fontSize: 14, lineHeight: 22 },
  tabs: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 5,
    gap: 5,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 10,
  },
  hero: { backgroundColor: C.lime, padding: 24, borderRadius: 24, gap: 12 },
  heroLabel: { fontSize: 13, fontWeight: "600", color: "#344226" },
  heroNumber: {
    fontSize: 45,
    fontWeight: "800",
    color: C.bg,
    letterSpacing: -2,
  },
  card: {
    backgroundColor: C.card,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  section: {
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
    letterSpacing: 0.5,
  },
  wrap: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  label: { fontSize: 12, color: C.muted, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 13,
    minHeight: 48,
    color: C.text,
    fontSize: 16,
  },
  button: {
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.lime,
    borderRadius: 13,
    padding: 12,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: C.bg },
  secondary: {
    backgroundColor: "#2B342B",
    borderWidth: 1,
    borderColor: C.border,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  selected: { backgroundColor: "#2B3823", borderColor: C.lime },
  small: { fontSize: 12, lineHeight: 20, color: C.muted },
  empty: { color: C.muted, lineHeight: 26, paddingVertical: 16 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingTop: 14,
  },
  setTitle: { fontSize: 15, fontWeight: "600", color: C.text },
  smallButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  notice: {
    color: C.lime,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    lineHeight: 22,
  },
  footer: { color: C.muted, fontSize: 11, lineHeight: 19, textAlign: "center" },
});
