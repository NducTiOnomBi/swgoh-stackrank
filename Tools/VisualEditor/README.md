# SWGOH StackRank Visual Editor

A browser-based editor for managing character tier rankings and synergy configurations.

## Features

- **Visual Tier Grid**: Drag-and-drop interface with 19 tier columns
- **Multi-Tier Display**: Shows base tier, best standard synergy tier, and best omicron synergy tier
- **Synergy Management**: Add, edit, and remove synergy sets
- **Real-Time Validation**: Inline validation with detailed error messages
- **Cross-Platform**: Works in any modern browser (no Excel required)
- **GitHub Codespaces**: Optimized for cloud development

## Quick Start

### Local Development (Windows)

**Prerequisites:**

- PowerShell Core 7+ (cross-platform)
- Modern web browser

**Run the Editor:**

```powershell
cd Tools
.\StartVisualEditor.ps1
```

**Note:** On Windows, you may need to run PowerShell as Administrator for the first time to allow HTTP listener binding.

### GitHub Codespaces

1. Open this repository in GitHub Codespaces
2. Wait for the devcontainer to initialize
3. Run the editor:

   ```bash
   cd Tools
   pwsh StartVisualEditor.ps1
   ```

4. The browser will open automatically to the editor

## User Interface

### Tier Grid (Center)

- **19 Columns**: One column per tier (1 = highest/best)
- **Visual Spacing**: Extra spacing every 3 tiers for easier reading
- **Drag-and-Drop**: Click and drag character cards between tiers
- **Multi-Tier Display**: Each card shows:
  - **Base**: Character's base tier
  - **Final**: The characters Final tier calculated based on the selected `Include Synergy` and `Include Omicron`
- **Tooltips**: Hover over Final tiers to see calculation breakdown. Tooltip will only show for Final tier values that include synergy or Omicron calculations.

### Character Details (Left Sidebar)

- View/edit base tier (1-19)
- View/edit omicron boost (0-10)
- See calculated synergy tiers
- View synergy set count and zeta requirements

### Synergy Editor (Right Sidebar)

- Add/remove synergy sets
- View synergy sources (character IDs + category notation)
- View enhancement values (standard and omicron)

### Header Actions

- **Validate**: Check data against schema (9 validation rules)
- **Export JSON**: Download current data as JSON file
- **Save Changes**: Save to server (persists to Data/characterBaseData.json)

### Status Bar

- Current operation status
- Character count
- Validation status

## Tier Calculation Logic

### Base Tier

The character's assigned tier without any synergies. This defines the usefulness of a character without being on a specific team.

Some characters have more intrisic usefulness than others, and the base tier should represent this value.

### Final Tier

```text
Base Tier - Best Synergy Enhancement - Best Omicron Boost = Final Tier
```

**NOTE:** Final tier values in the Visual Editor are based on every character being maxed out. The StackRank service has additional roster specific sorting within a tier to serve as a "tie-breaker" to further prioritize characters within a tier.

**Example:**

- Base Tier: 6
- Best Synergy Enhancement: 3 (from specific team)
- Best Omicron Boost: 2
- **Final Tier: 6 - 2 - 3 = 1** (Tier 1 = best of the best)

### Best Synergy Enhancement

This is the best synergy enhancement across a characters synergy sets.

### Best Omicron Boost

This is the best character based or synergy based Omicron boost.

### Tooltip Breakdown

Hover over any calculated final tier to see:

```text
Base Tier (8)
- Omicron Boost (1 from character)
- Best Synergy (4 from VADER, PALPATINE, 3× Empire)
= Final Tier (3)
```

```text
Base Tier (8)
- Omicron Boost (1 from CHARACTERID)
- Best Synergy (4 from VADER, PALPATINE, 3× Empire)
= Final Tier (3)
```

## Synergy Source Notation

The editor uses two formats for synergy sources:

1. **Character IDs**: `VADER, PALPATINE, THRAWN`
2. **Category Definitions**: `4× Clone Trooper` (means 4 other team members with "Clone Trooper" tag)

Combined example: `GENERALKENOBI, 3× Galactic Republic`

## Omicron Boost Notation

The editor uses two formats for synergy sources:

1. **from character**: This indicates that the character provides the best Omicron boost
2. **from CHARACTERID**: This indicates that the best Omicron boost comes from another character via a `synergyEnhacementOmicron`

Example: `Omicron Boost (1 from character)`
Synergy example: `Omicron Boost (4 from CAPTAINREX)`

## Validation Rules

The editor enforces these validation rules before saving:

1. ✅ Valid JSON syntax
2. ✅ Alphabetical sorting by character ID
3. ✅ No duplicate character IDs
4. ✅ Base tier range: 1-19
5. ✅ Synergy enhancement range: 0-10 (both standard and omicron)
6. ✅ Omicron boost range: 0-10
7. ✅ NumberMatchesRequired range: 1-4
8. ✅ Character cross-references (no orphaned references)
9. ✅ Schema compliance (no unknown properties)

## Keyboard and Mouse

- **Click**: Select character to view details
- **Drag**: Move character to different tier
- **Hover**: Show synergy tier calculation tooltip
- **Ctrl+S**: (Future) Quick save

## Browser Compatibility

**Minimum Requirements:**

- Modern browser (Chrome, Edge, Firefox, Safari)
- Viewport width: 768px or greater (desktop/laptop/tablet)
- JavaScript enabled

**Tested On:**

- Chrome 120+
- Edge 120+
- Firefox 121+

## Architecture

### Frontend

- **HTML/CSS/JavaScript**: Pure vanilla JavaScript (no frameworks)
- **Drag and Drop**: Native HTML5 drag-and-drop API, with touch support
- **Responsive**: CSS Grid for tier columns, Flexbox for layout

### Backend

- **PowerShell Core 7+**: HTTP server with System.Net.HttpListener
- **REST API Endpoints**:
  - `GET /api/data`: Load character data
  - `POST /api/data`: Save character data (with validation)
  - `POST /api/validate`: Validate without saving
  - `GET /*`: Serve static files (HTML, CSS, JS)

### Data Flow

```text
Browser <---> PowerShell HTTP Server <---> Data/characterBaseData.json
         JSON                          JSON
```

## Troubleshooting

### "Access is denied" Error (Windows)

**Solution:** Run PowerShell as Administrator:

```powershell
Start-Process pwsh -Verb RunAs
cd C:\path\to\swgoh-stackrank\Tools
.\StartVisualEditor.ps1
```

### Port Already in Use

**Solution:** Use a different port:

```powershell
.\StartVisualEditor.ps1 -Port 3000
```

### Browser Doesn't Open Automatically

**Solution:** Manually navigate to `http://localhost:8080`

### Changes Not Saving

**Verify:**

1. Click "Validate" to check for errors
2. Fix any validation errors shown in the modal
3. Click "Save Changes" after validation passes

### Character Not Appearing

**Check:**

1. Verify character has `id` and `baseTier` fields
2. Run validation to check for errors
3. Refresh browser (Ctrl+R or F5)

## Development Notes

### Adding New Validation Rules

Edit `StartVisualEditor.ps1` in the `/api/validate` endpoint section. Add validation logic and append errors to `$validationErrors` array.

### Customizing UI

- **Colors**: Edit CSS variables in `styles.css` `:root` section
- **Layout**: Modify CSS Grid in `.tier-grid` class
- **Tier Spacing**: Change `--tier-spacing` variable in CSS

### Data Schema

All data must conform to `Data/characterBaseData.schema.json`. See schema file for complete specification.

## Known Limitations

- **No Undo/Redo**: Planned for Phase 2
- **No Multi-Select**: Can only drag one character at a time
- **No Search/Filter**: Planned for future enhancement
- **No Mobile Support**: Requires 768px+ viewport (desktop/laptop/tablet only)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](../LICENSE) file.
