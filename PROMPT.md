# Biblozen — Unattended Build Run

You are building **Biblozen**, a portable, reader-first desktop markdown app for macOS and Windows, using Tauri 2. The complete specification is in `SPEC.md` at the repo root. **`SPEC.md` is the source of truth.** Read it in full before writing any code, and re-read the relevant sections at the start of each milestone.

This is an **unattended run**. Nobody is watching and nobody will answer questions. Work through milestones M0 → M9 from `SPEC.md` §17, in order, until all are done or you are genuinely blocked on every remaining path.

---

## 1. Start of every session (resumability)

This run may span several sessions or context resets. Always begin by:

1. Reading `PROGRESS.md` if it exists. It tells you which milestone you're on, what's done, what's stubbed, and what's next. Resume from there; do not redo finished work.
2. Reading `DECISIONS.md` if it exists, so you stay consistent with choices already made.
3. Running `git log --oneline -20` and `git status` to confirm the repo matches `PROGRESS.md`.

If `PROGRESS.md` doesn't exist, you are starting fresh at M0. Create it immediately.

---

## 2. Operating rules for unattended work

**Never stop to ask a question.** When something is ambiguous:
1. Check `SPEC.md` (including §1 Principles; they break most ties).
2. Choose the option that is simplest, reversible, and most consistent with the spec.
3. Record it in `DECISIONS.md` as: date, milestone, question, choice, reason. One short entry each.

**Do not change anything in `SPEC.md` §2 (Decisions log).** If a §2 decision turns out to be technically impossible, implement the closest viable alternative, record it prominently at the top of `DECISIONS.md` under "⚠️ Deviations from spec", and continue.

**When blocked:**
- Try up to three materially different approaches.
- If still blocked, implement the narrowest working stub (behind a clearly named setting or `// TODO(blocked): …` comment), record the blocker in `PROGRESS.md` under "Blocked", and move on to the next item.
- Only stop the run entirely if no remaining milestone work can proceed.

**Stay inside the repo.** Do not read or modify files outside the repository directory, except for installing toolchain dependencies (npm, cargo) and writing to temp directories. Never delete anything outside the repo. Never use `rm -rf` on paths that aren't build artifacts inside the repo.

**No secrets, no signing, no publishing.** Don't configure code signing, notarization, or release publishing. Don't add API keys or tokens anywhere.

---

## 3. Per-milestone loop

For each milestone:

1. **Plan.** Re-read the milestone in `SPEC.md` §17 and every section it references. Write a short checklist for it in `PROGRESS.md`.
2. **Implement** in small, coherent steps. Commit after each meaningful step (see §5).
3. **Test.** Add unit tests for any logic §18 lists, plus anything non-trivial you write. Run the full suite.
4. **Verify acceptance criteria** (see §4). Every criterion must be either:
   - ✅ verified automatically (say how), or
   - 👤 not automatable, in which case add it to `MANUAL_QA.md` with exact steps a human should follow.
5. **Quality gate.** Before marking a milestone done, all of these must pass:
   - `npm run lint`, `npm run typecheck`, `npm test`
   - `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`
   - `npm run tauri build` succeeds on the host OS
6. **Update `PROGRESS.md`**: mark the milestone complete, list what's stubbed or deferred, and name the next milestone.
7. **Commit**, then proceed to the next milestone.

Don't move on with failing tests or lints. If a test is wrong rather than the code, fix the test and note why in the commit message.

---

## 4. Verification strategy (no human eyes available)

You can't look at the running desktop app, so build verification into the project:

- **Mock the Tauri boundary.** Wrap every Tauri API and custom command behind a thin `src/platform/` module. In tests and in browser mode, back it with an in-memory fake filesystem (using `@tauri-apps/api/mocks` `mockIPC` where useful). This makes the whole frontend runnable in a plain browser.
- **Playwright smoke tests** against the Vite dev server in browser mode, using the fake filesystem seeded with the Welcome folder fixture. Cover each milestone's key flows: mode switching, tree ops, rendering, theme switching, keyboard navigation, palette, and so on.
- **Screenshots as evidence.** Playwright saves screenshots to `docs/screenshots/<milestone>/` for key states (each layout, several themes in light and dark, each reading style, empty states). These are how the human reviews visual quality afterwards.
- **Theme contrast check.** Write the contrast script required by M4 and run it in CI and tests.
- **Rust logic as pure functions.** Extract window routing (`open_path` resolution), path comparison, and wikilink resolution into pure, unit-tested functions. Keep side effects at the edges.
- **Performance targets** (§6.5, M7) get benchmark tests with generated fixtures (a 1 MB markdown file, a 2,000-file folder). Record the measured numbers in `PROGRESS.md`.
- **CI.** If a git remote exists and `gh` is authenticated, push the branch after each milestone and check the GitHub Actions run (`gh run watch` / `gh run view`). Fix CI failures before proceeding, especially the Windows build, which you can't run locally. If there's no remote, note in `PROGRESS.md` that Windows build verification is pending.

---

## 5. Git

- Work on a branch named `v1`, created from the current HEAD at the start. Never commit to `main` directly. Never force-push. Never rewrite history.
- Use conventional commits, scoped to the milestone: `feat(m3): render GitHub alerts`, `test(m7): wikilink resolution edge cases`, `fix(m6): preserve CRLF on save`.
- Commit `PROGRESS.md`, `DECISIONS.md` and `MANUAL_QA.md` along with the code they describe.

---

## 6. Quality bar

Biblozen's value is in polish (SPEC §1.2). Specifically:

- **Design tokens first.** Before building UI in M1, define spacing, radius, typography scale, motion durations/easing, and z-index tokens. All components use them; no magic numbers in component CSS.
- **Themes are a headline feature.** In M4, the hand-tuned top 10 themes should look deliberate, not auto-generated. Check every built-in theme's screenshots for legibility issues, beyond what the contrast script catches.
- **Reading styles deserve real typography work**: font pairing, measure, leading, heading rhythm, list and blockquote spacing, and code block treatment. Bundle fonts locally with appropriate licenses (OFL or similar). Record each font's license in `docs/THIRD_PARTY.md`.
- **Every interaction is keyboard-reachable**, and every command is in the palette.
- **Empty, loading and error states** are designed, not left as blank panes or raw error strings.
- **Respect `prefers-reduced-motion`.**

Don't gold-plate beyond the spec. Anything in SPEC §16 (out of scope) stays out, even if it's easy.

---

## 7. Managing context

- This is a long run. Keep durable knowledge in files (`PROGRESS.md`, `DECISIONS.md`, code comments), not in your head.
- Use subagents for broad exploration or research, such as looking up current Tauri 2 plugin APIs or the shape of Shiki's theme objects, so the main context stays focused on implementation.
- When unsure about a library's current API, check its installed source in `node_modules` or the crate docs rather than guessing from memory. Tauri 2's APIs differ significantly from Tauri 1; don't use v1 patterns.

---

## 8. Finishing

When M9 is complete (or no further progress is possible), write a final section at the top of `PROGRESS.md` titled **"Run summary"** containing:

1. Milestones completed, partially completed, and blocked.
2. Every deviation from `SPEC.md` (link to `DECISIONS.md`).
3. Everything stubbed, with file locations.
4. Measured performance numbers vs. targets.
5. Where the screenshots are, and which ones the human should look at first.
6. The `MANUAL_QA.md` checklist, ordered by risk (highest first).
7. Suggested next steps.

Then make a final commit, and push if a remote exists.
