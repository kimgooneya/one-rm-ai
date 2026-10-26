# Verification — 2026-10-26

## Passed in the cloud workspace

- Dependency installation; exact dependencies + npm lockfile retained.
- `npm run check`: **12/12 domain tests** and TypeScript `tsc --noEmit` passed.
- `npx expo install --check`: previously passed for pinned Expo SDK 58. Publication recheck: online dependency validation was blocked by an HTTP proxy timeout; `EXPO_OFFLINE=1 npx expo install --check` reported dependencies up to date, with the CLI warning that offline validation is unreliable.
- `npx expo export --platform all`: **iOS and Android Metro/Hermes bundles generated successfully**. This is JavaScript compilation/export, NOT a native application build or on-device test.
- Independent static review completed. Findings addressed: explicitly selected record date instead of silently stale “today”; consistent plan metadata writes; disabled inputs during saves to prevent typing loss.
- Source ZIP checked for readable CRC and expected files; dependencies/build outputs/secrets excluded.

## Tests covered

Actual volume, fractional kg, warmup exclusion, target vs actual RPE, absent RPE, numeric validation, session counts, schema validation, week boundaries, idempotent completion, incomplete-set exclusion, 1–5 condition, week-copy reset/no-overwrite, original-plan preservation, impossible dates, accessory exercise names.

## Not run / limitations

- No iOS/Android simulator, device launch, native compilation, store installation, screenshot or visual QA.
- SQLite persistence across native process restarts and OS-specific keyboard/layout/accessibility behavior require device testing.
- Save error and corrupted storage UI behavior reviewed in code but not fault-injected on a device.
- No ESLint configuration, E2E test runner, backend, account or deployment configuration.
- Node emits a non-fatal module-type warning when running TypeScript domain tests. npm environment proxy and Metro color-variable warnings are environment-level; checks exited successfully.

## Before using as the primary log

1. On both platforms: add a custom exercise with 3 planned sets; verify volume stays zero before completion.
2. Complete one set; edit its actual kg/reps/RPE; confirm volume and optional-RPE average update correctly.
3. Repeat completion, undo, edit/cancel and delete/cancel; ensure no duplicate sets.
4. Save score/common target; force-close/reopen and confirm values persist.
5. Change dates, cancel switching, open prior dates and add future plans. Verify the selected date remains explicit after midnight.
6. Create a previous-week plan; copy to current week; ensure actual RPE/completion/condition reset and collision blocks overwrite.
7. Test narrow screens, large fonts, keyboard coverage and screen readers.
8. Add export/backup before relying on the app for irreplaceable records.
