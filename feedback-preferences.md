---
name: feedback-preferences
description: How the user wants Claude to communicate and work
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

**No trailing summaries.** Do not recap what was just done at the end of a response.
**Why:** User can read the diff; summaries are noise.
**How to apply:** End responses after the last substantive sentence. One-line "hard-refresh browser" style closing is fine.

**Terse.** One sentence per update while working; don't narrate reasoning.
**Why:** User moves fast, doesn't need explanation of obvious steps.

**No emojis** unless explicitly requested.

**Indonesian UI copy** — all user-facing strings in the app are Indonesian (Bahasa Indonesia). Code comments may be English.

**Prefer editing existing files** over creating new ones. Only create new files when genuinely needed (new route, new page component).

**No unnecessary abstraction.** Fix the specific thing asked; don't refactor surrounding code.

**Don't add dark mode, extra feature flags, or hypothetical future requirements** unless asked.

**Hard-refresh reminder** — after frontend file changes, always tell user to hard-refresh (`Ctrl+Shift+R`).
