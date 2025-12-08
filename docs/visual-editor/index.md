# Visual Editor Guide

Use this guide whenever you open the SWGOH StackRank Visual Editor to update tiers or synergy data. Each page is written for contributors who are actively using the tool, so the instructions focus on what you need to click, enter, and double-check—not how the editor is implemented.

## How to Use These Pages

Each topic is split into its own markdown file so you can deep-link directly from the editor UI or PR discussions:

- [Character Details](character-details.md) – Setting base tier, Omicron boost, requirement overrides, and Zeta and Omicron requirements.
- [Synergy Sets](synergy-sets.md) – Synergy enhancement, Omicron boost, Characters, and Category Definitions.
- [Draft & Validation Workflow](draft-validation.md) – Unsaved-change warnings, Update Character behavior, validation modal flow, and CLI parity.
- [Screenshot Catalog](screenshots.md) – Source of every referenced PNG plus instructions for replacing placeholders.

## Launching the Visual Editor

1. Open PowerShell in the repository root.
2. Run `cd Tools` and then `pwsh StartVisualEditor.ps1` (or `./StartVisualEditor.ps1`).
3. Approve the firewall prompt the first time the local server starts.
4. Point your browser to the URL shown in the console (defaults to `http://localhost:8080`).

Codespaces users can run the same script inside the devcontainer—the forwarded port opens the editor right in the browser tab.

## Screenshot Placeholders & Accessibility

- Every figure currently references a PNG placeholder stored under `docs/assets/visual-editor/`. They include the “Placeholder – replace with actual screenshot …” overlay so you can spot the images that still need attention.
- The [assets README](../assets/visual-editor/README.md) explains how to capture accessible replacements (PNG only, 1280×720+, contrasting overlay text, captions immediately below each figure).
- When you take a real screenshot, save it with the same filename so the markdown links stay valid.

## Contributing Updates

- Update the matching markdown page whenever you change how a panel works so users always have current instructions.
- Keep captions short and make sure the surrounding text explains why the screenshot matters (better accessibility, easier scanning).
- If you add new UI areas, include them in the [Screenshot Catalog](screenshots.md) so future replacements are tracked.

Use the navigation section below to jump straight into the details you need.

---

### Navigation

- [Character Details](character-details.md)
- [Synergy Sets](synergy-sets.md)
- [Draft & Validation Workflow](draft-validation.md)
- [Screenshot Catalog](screenshots.md)
