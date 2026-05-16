# Polyscribe — Settings Roadmap (parity ideas from Grammarly)

Captured from Grammarly Desktop's Customization screen. Each row maps a
Grammarly setting to a Polyscribe equivalent, what we already have, and a
priority call. Not a commitment — a backlog to pull from. Cross-references
`recommendation.md` where the item already appears there.

## Already in Polyscribe (no work needed)

| Grammarly setting | Polyscribe equivalent | Status |
|---|---|---|
| Generative AI → "Show on text selection" | Auto-check on selection + floating button | ✅ shipped (`autoCheckOnSelection`) |
| Account tab | "Open polyscribe.app" + token in Settings | ✅ partial (account/billing lives in web app) |

## High value — pull next

### 1. Block List (per-site disable)  ·  P1
Grammarly's "Block List" tab = sites where it never runs. Polyscribe needs
this: a list of hostnames where inline underlines / auto-check are suppressed,
plus a one-click "disable on this site" from the in-page UI.
- Maps directly to `recommendation.md` → P1 "Add per-site inline underline
  toggles" + "temporary disable action".
- Store as `string[]` in `chrome.storage.local`; check hostname in
  `maybeInstallInlineUnderlines()` and the selection path.
- This is the single most-requested-style control and the cleanest win.

### 2. Suggestion bundles  ·  P1
Grammarly: "Use bundles for spelling, punctuation, and grammar suggestions in
the same sentence" — collapses multiple overlapping fixes in one sentence into
a single combined suggestion instead of N separate underlines/tooltips.
- Polyscribe already dedupes overlapping AI-tell vs grammar; extend to merge
  same-span / same-sentence grammar+spelling+punctuation into one "apply all
  in this sentence" tooltip action.
- Reduces tooltip whack-a-mole; pairs well with the planned "Apply all" diff.

### 3. Configurable keyboard shortcut  ·  P2
Grammarly: "Open Grammarly  ^G" (editable). Polyscribe: a hotkey to open the
overlay / run a check on the focused field or selection.
- MV3 `manifest.commands` + a user-rebindable entry; surface current binding
  in Settings (Chrome owns the rebind UI at chrome://extensions/shortcuts).

## Medium / longer-term

### 4. "Show for email replies"  ·  P2
Context-specific trigger: auto-offer rewrite/tone when composing a Gmail/Outlook
reply. We already detect Gmail editors — add a reply-context heuristic and a
toggle. Lower urgency than Block List.

### 5. Writing provenance / "Authorship"  ·  P3 (strategic, not soon)
Grammarly "Authorship" records what you typed vs. pasted to prove human
authorship. This is *strategically adjacent to Polyscribe's AI-tell
differentiator* — a privacy-first, opt-in "this was human-written" record
could be a real moat for the multilingual/academic audience. Heavy + privacy
sensitive; default OFF, fully local, explicit consent. Park as a differentiator
concept, not a near-term feature.

### 6. "Launch at startup"  ·  N/A
Desktop-app-only concept. A browser extension has no startup toggle —
intentionally skip. (Noted so it isn't re-raised.)

## Monetization note (not a setting)
Grammarly's "Get Pro" CTA in Settings. When Polyscribe has a paid tier, the
natural placements are: Settings footer + the web app. Out of scope until a
plan exists; recorded so the surface is remembered.

## Suggested order
1. Block List + "disable on this site" (P1, highest ratio of value to effort)
2. Suggestion bundles (P1, pairs with the "Apply all" diff work)
3. Configurable shortcut (P2)
4. Email-reply trigger (P2)
5. Provenance/Authorship (P3, strategic — revisit after core is stable)
