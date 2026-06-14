# Mafiking LLM touchpoint inventory

Every code path in `new_mafiking` that calls a third-party language model
or vision model, with the user-trust classification, the input fields that
reach the model, the model + key, and the existing controls. Used by the
Phase 2 LLM security review (`docs/security/llm.md`) and as the source
of truth when the model set changes.

## Gemini / Groq / OpenRouter — image OCR + canvas evaluation

### `/api/correction/transcribe` — image-to-LaTeX transcription
- **File:** `server/routes/correction.js:918`
- **Auth:** `isAuthenticated` + `requireRegisteredUser`
- **CSRF:** mounted behind `app.use('/api/correction', correctionLimiter)`
  (server.js:456) and global `csrfProtection` (server.js:411).
- **Model:** `gemini-3.1-flash-lite` (`TRANSCRIBE_MODELS`).
- **System prompt:** `TRANSCRIBE_SYSTEM_PROMPT` (server/routes/correction.js:36).
  Tells the model to (a) only transcribe, (b) not correct answers, (c)
  return only JSON matching the schema, (d) format text in LaTeX.
- **User inputs that reach the prompt:**
  - `imageBase64` + `mimeType` — sent as `inlineData` to Gemini. Validated
    by `validateImagePayload` (MIME allowlist, 10 MB cap).
  - `questionText` — interpolated into the prompt as `Soal: ${questionText}`.
    **Sanitized** by `sanitizeForPrompt` (server/security/text-sanitize.js) since
    the Phase 2 fix. The sanitizer caps at 4000 chars and strips control,
    bidi-override, and zero-width characters.
- **Risk class:** AML.T0051 (LLM Prompt Injection: Direct). Mitigated
  by: input sanitization, strict system prompt, JSON-schema response,
  server-side schema validation (`safeTranscriptionParse`).
- **Cost control:** `correctionLimiter` (12 req / 60 sec / IP) and the
  per-user `MAX_OUTPUT_TOKENS` cap.
- **Audit:** logged in `ai_token_usage` (server/ai/log-token-usage.js) and
  surfaced to admin via `/api/admin/...` dashboards.

### `/api/correction/evaluate` and `/api/correction/evaluate-stream` — canvas redline evaluation
- **File:** `server/routes/correction.js:952`
- **Auth:** `isAuthenticated` + `requireRegisteredUser`
- **CSRF:** same mount as transcribe.
- **Model/provider:** direct fallback uses `gemini-3.1-flash-lite`
  (`EVALUATE_MODELS`). When `MAFIKING_POOL_ENABLED` is active, the
  request can route through Gemini, Groq
  (`meta-llama/llama-4-scout-17b-16e-instruct`), or optional OpenRouter
  (`OPENROUTER_MODEL`, default `google/gemma-4-31b-it:free`) depending on
  configured keys and pool weights.
- **System prompt:** `EVALUATE_SYSTEM_PROMPT` (server/routes/correction.js:46).
  Tells the model to (a) act as a math teacher, (b) use the confirmed
  LaTeX as the source of truth, (c) return only JSON, (d) cap tags at
  5 each, (e) return LaTeX for `Latex` fields and Indonesian plain
  text for `Plain` fields.
- **User inputs that reach the prompt:**
  - `imageBase64` + `mimeType` — visual evidence, validated.
  - `questionText`, `expectedAnswer`, `text`, `confirmedAnswerLatex`,
    `topicTags` — interpolated into the prompt. **All sanitized** by
    `sanitizeForPrompt` (Phase 2 fix). `topicTags` capped at 64 chars
    per tag.
  - `questionId`, `problemId` — interpolated as a numeric ID. No text
    injection risk because they are joined as a string with `ID soal:`
    prefix; still, in the future these should be coerced to `Number`
    to defend against a malicious JSON string.
- **Risk class:** AML.T0051, AML.T0048 (Erode ML Model Integrity —
  not applicable here, but tracked). Mitigated as above.
- **Cost control:** per-user `correctionLimiter`,
  `EVALUATE_MAX_OUTPUT_TOKENS`, multi-provider queue concurrency, response
  cache, and `correction_latency_metrics` tracking. The fast path can mark
  equivalent correct answers after OCR/evaluation, but wrong answers must keep
  `wrongSteps` and `redlineTargets` so the frontend can redraw the user's
  canvas with incorrect strokes marked red.

## Gemma 4 31B — profile summary narrative

### `/api/correction/profile-summary` — student profile prose
- **File:** `server/routes/correction.js:1043`
- **Auth:** `isAuthenticated` (no `requireRegisteredUser` because the
  summary is allowed for any session-bound user; the data is read
  from `correction_attempts` scoped to `req.session.userId`).
- **CSRF:** behind `csrfProtection`.
- **Model:** `gemma-4-31b-it` (`PROFILE_MODELS`, via the Gemini path in
  `server/routes/correction.js`).
- **System prompt:** `PROFILE_NARRATIVE_SOP` (read from disk). The
  Gemma path constructs a structured evidence object via
  `buildProfileAiEvidence` and calls Gemma.
- **User inputs that reach the prompt:**
  - Persisted `correction_attempts` rows for the user (own data only).
    These are not fresh user input — they are the user's own past
    OCR + evaluation results.
  - `req.body.attempts` — optional, used as a hint to choose between
    cached and fresh data. The body shape is validated by
    `chooseProfileAttemptSource` and re-compacted. The values come
    from the user's own DB rows; no untrusted text reaches the model.
  - `req.body.forceRefresh` — boolean.
- **Risk class:** AML.T0051. Low — the inputs are user-owned data
  already filtered by the route's `WHERE user_id = req.session.userId`.
- **Cost control:** `PROFILE_AI_ATTEMPT_LIMIT` (20) caps the
  per-request context. `PROFILE_AI_REFRESH_COOLDOWN_MS` (1 hour)
  prevents repeat refreshes.

## DeepSeek — admin question-bank import (draft mode)

### `POST /api/admin/import/draft` — DeepSeek draft generation
- **File:** `server/ai/admin-import.js:193` (call), `server/routes/admin-import.js:78`
  (mount).
- **Auth:** `isAdmin` (admin-only).
- **CSRF:** behind `csrfProtection`.
- **Model:** `DEEPSEEK_MODEL` (default `deepseek-v4-pro`).
- **User inputs that reach the prompt:**
  - `adminAnswerKey` — admin-supplied answer key. Admin is trusted;
    no sanitization is applied.
  - File content (`req.file.buffer`) — uploaded as base64 in the
    message. MIME-typed and size-validated (12 MB cap).
  - `subtopicId`, `mode` — admin-supplied structural params, not
    text.
- **Risk class:** Low. Admin-only. The DeepSeek response is stored as
  a **draft** and must be explicitly committed by the admin before
  reaching users (`POST /api/admin/import/commit`).
- **Cost control:** 12 MB upload cap, DeepSeek timeout 90s
  (`DEEPSEEK_TIMEOUT_MS`).

## Out of scope

- DeepSeek *retry* loops. The `callDeepSeekDraft` function makes a
  single request and returns; no retry-with-jitter that could be
  exploited for cost amplification.
- Browser-side `window.Clerk` or any client-side LLM. Mafiking is
  server-rendered LLM only.

## Cross-cutting controls

- All LLM responses are validated against a Zod schema
  (`TRANSCRIPTION_SCHEMA`, evaluation schema, profile schema) before
  being returned to the client.
- `logTokenUsage` writes every Gemini / Gemma call to `ai_token_usage`
  with `user_id`, `key_index`, `model`, and `token_count`. Failures
  here are caught so they do not break the request.
- `correctionLimiter` is global to the `/api/correction` mount; the
  profile summary is rate-limited as a side effect.
- All three Gemini / Gemma paths are mounted under
  `app.use('/api/correction', correctionLimiter)`.

## Open items (Phase 2 follow-ups)

- `questionId` and `problemId` interpolation in the evaluate prompt
  should be coerced to `Number` to defend against a malicious JSON
  string. Tracked as **F-10** in `docs/security/llm.md`.
- EXIF / metadata strip on the uploaded image before it reaches
  Gemini. Tracked as **F-11** in `docs/security/llm.md`. Adding
  `sharp` is a ~30 MB install and a significant dependency; Phase 4
  (Nevacloud) is a better place to evaluate the trade-off.
- Per-user adaptive rate limit on the correction endpoints (cost
  amplification defense). Tracked as **F-12** in `docs/security/llm.md`.
