# SWGOH StackRank

The purpose of this repository is to enable contributions to the character tier data file that supports the **StackRank** ranking algorithm used in Star Wars: Galaxy of Heroes (SWGOH).

## Quick Start

### Web-Based Visual Editor (Recommended)

Use the modern browser-based editor for managing character tiers and synergies:

**GitHub Codespaces (Easiest):**

1. Fork this repository
2. Open in Codespaces (Code → Codespaces → Create codespace)
3. Run: `cd Tools && pwsh StartVisualEditor.ps1`
4. Edit characters using drag-and-drop interface
5. Validate, save, and commit changes

**Local Development:**

```powershell
cd Tools
.\StartVisualEditor.ps1
```

Browser opens to `http://localhost:8080` with a visual tier grid.

**Features:**
- 19-column drag-and-drop tier grid
- Multi-tier display with synergy calculations
- Real-time validation (9 validation rules)
- Cross-platform (Windows, macOS, Linux)
- No Excel required

See [Visual Editor README](./Tools/VisualEditor/README.md) for complete documentation.

### Excel-Based Workflow (Legacy)

The traditional Excel workflow is still supported. See [Tools documentation](./Tools/index.md) for details.

## Documentation

- **[Tools Documentation](./Tools/index.md)** - Complete tool reference and troubleshooting
- **[Visual Editor Guide](./Tools/VisualEditor/README.md)** - Browser-based editor documentation
- **[Contributing Guidelines](./CONTRIBUTING.md)** - How to contribute changes
- **[Copilot Instructions](./.github/copilot-instructions.md)** - AI-assisted development guidelines

## Platform Compatibility

| Tool | Windows | macOS | Linux | Browser | Min Viewport |
|------|---------|-------|-------|---------|--------------|
| **Visual Editor** | ✅ | ✅ | ✅ | Chrome, Edge, Firefox, Safari | 768px |
| Excel Tools | ✅ | ❌ | ❌ | N/A | N/A |
| Validation | ✅ | ✅ | ✅ | N/A | N/A |

## Data File

The main data file is [`Data/characterBaseData.json`](./Data/characterBaseData.json), which contains:

- **200+ SWGOH characters** with tier rankings (1-19, where 1 = best)
- **Synergy configurations** for team-based tier improvements
- **Omicron boosts** for characters with omicron abilities
- **Zeta requirements** for unlocking certain synergies

## Deployment Pipeline

1. **Merge to `main`** → Triggers Azure DevOps sync
2. **Azure builds DEV environment** → Automatic deployment
3. **Validate in DEV** → Manual testing at DEV URL
4. **Promote to production** → Manual promotion after validation

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for complete contribution guidelines.

**Before every commit:**

```powershell
.\Tools\ValidateCharacterData.ps1
```

Ensures all validation checks pass before pushing changes.

## License

See [LICENSE](./LICENSE) file for details
