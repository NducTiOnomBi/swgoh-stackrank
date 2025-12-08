# Screenshot Catalog

This page tracks every image referenced throughout the Visual Editor documentation so contributors know what to capture or replace. All screenshots live under `docs/assets/visual-editor/` and follow the guidelines in `docs/assets/visual-editor/README.md` (PNG format, 1280×720 minimum, descriptive overlay text until a real capture exists).

| File | Used In | Alt Text | Caption | Notes |
| --- | --- | --- | --- | --- |
| `tier-grid-overview.png` | `docs/visual-editor/index.md`, `docs/visual-editor/draft-validation.md` | `Tier grid landing page placeholder` | *Figure 1. Placeholder tier grid overview – replace with the actual UI once captured.* | Showcase the main table plus status filter chips. Ensure both light/dark modes remain legible or state which theme is shown. |
| `character-details-panel.png` | `docs/visual-editor/character-details.md` | `Character details sidebar placeholder` | *Figure 1. Character Details sidebar placeholder – replace with a real capture when available.* | Focus on the Base Tier, Omicron Boost toggle, and Update Character button. Capture hover states for tooltips if possible. |
| `character-required-abilities.png` | `docs/visual-editor/character-details.md` | `Required zetas and omicrons placeholder` | *Figure 2. Required Zeta & Omicron placeholder – replace with an annotated screenshot showing the toggles and list controls.* | Crop tightly around the required ability lists so text is readable at 100% zoom. |
| `synergy-sets-panel.png` | `docs/visual-editor/synergy-sets.md` | `Synergy set editor placeholder` | *Figure 1. Synergy Set editor placeholder – swap in a real capture once available.* | Expand at least two synergy rows (one character list heavy, one category heavy) to demonstrate layout scaling. |
| `skip-if-present-flow.png` | `docs/visual-editor/synergy-sets.md` | `Skip if present logic placeholder` | *Figure 2. Placeholder for category + skip logic diagram – replace when a real screenshot exists.* | When replacing, capture the skip-if-present list plus the slot counter to illustrate validation messaging. |
| `validation-modal.png` | `docs/visual-editor/draft-validation.md` | `Validation modal placeholder` | *Figure 2. Placeholder for the validation modal – capture the real dialog when available.* | Trigger at least two different errors so the modal shows the bullet list and per-field callouts in a single capture. |

## Replacement Process

1. Open the Visual Editor via `Tools/StartVisualEditor.ps1` in a Chromium-based browser.
2. Configure the UI to highlight the area of interest (e.g., expand panels, enter sample data, trigger validation errors).
3. Capture at 1280×720 or higher. If using Windows Snipping Tool, disable drop shadows to avoid varying backgrounds.
4. Save directly into `docs/assets/visual-editor/` using the same filename to avoid rewriting markdown references.
5. Remove the text overlay layer (currently added by the placeholder script) so the image reflects the actual UI.
6. Confirm alt text remains accurate. Update this catalog if wording needs to change.

## Accessibility Checklist

- Provide meaningful alt text that explains the purpose of the screenshot (not just “image” or “screenshot”).
- Keep captions immediately below each figure in markdown so screen readers announce them together.
- Maintain at least 4.5:1 contrast when annotating images. Prefer native UI elements over hand-drawn highlights to avoid extra contrast requirements.

Refer back to this catalog whenever new screenshots are added so the documentation stays synchronized.
