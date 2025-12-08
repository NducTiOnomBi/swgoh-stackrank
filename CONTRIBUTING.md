# Contributing to StackRank Character Base Data

## Scope of changes
No change is too small to be considered a worthwhile contribution! Even if you're only
changing one line of code, it can save time and bring value to the tool faster than if
you don't contribute. Go for it!

If you want to change a very large section of the code, then expect some
back-and-forth before your pull request is accepted. It means that I'm interested in
what you're doing and want to make it as good as possible - not that I'm trying to
prevent you from contributing. 

## Getting started

### Option 1: Web-Based Visual Editor (Recommended)

The **Visual Editor** provides a modern, browser-based interface for managing character data without requiring Excel or Windows.

#### Using GitHub Codespaces (Easiest)

1. Fork this repository to your GitHub account
2. Open your fork in GitHub Codespaces (click "Code" → "Codespaces" → "Create codespace on main")
3. Wait for the devcontainer to initialize (automatically installs PowerShell Core and Node.js)
4. Start the Visual Editor:
   ```bash
   cd Tools
   pwsh StartVisualEditor.ps1
   ```
5. The editor opens automatically in your browser
6. Make changes using the drag-and-drop interface:
   - Drag characters between tier columns to change base tiers
   - Select a character to edit omicron boosts and synergy sets
   - Use tooltips to understand synergy tier calculations
7. Click "Validate" to check your changes (9 validation rules)
8. Click "Save Changes" to persist changes to `Data/characterBaseData.json`
9. Commit and push your changes to a new branch
10. Open a pull request back to the original repository

#### Using Local Development

1. Fork and clone the repository
2. Install PowerShell Core 7+ (https://github.com/PowerShell/PowerShell)
3. Navigate to the Tools directory
4. Start the Visual Editor:
   ```powershell
   .\StartVisualEditor.ps1
   ```
   
   **Note:** On Windows, you may need to run PowerShell as Administrator the first time.
5. Browser opens to `http://localhost:8080`
6. Make changes, validate, and save
7. Commit and push to a new branch
8. Open a pull request

**Visual Editor Features:**
- 19-column tier grid with drag-and-drop
- Multi-tier display (base, best standard, best omicron)
- Interactive tooltips showing calculation breakdowns
- Real-time validation with detailed error messages
- No Excel required - works on Windows, macOS, Linux
- Minimum viewport: 768px (desktop/laptop/tablet)

### Option 2: Excel-Based Workflow (Legacy)

The traditional Excel-based workflow is still supported for contributors who prefer it.

1. Fork the repository
2. Clone your fork to your local machine
3. Export current data to Excel:
   ```powershell
   .\Tools\ReadBaseDataToXLS.ps1
   ```
4. Edit `c:\output\characterBaseData.xlsx` in Microsoft Excel
5. Import changes back to JSON:
   ```powershell
   .\Tools\ReadXLStoBaseDataJson.ps1
   ```
6. Validate your changes:
   ```powershell
   .\Tools\ValidateCharacterData.ps1
   ```
7. Copy validated JSON to the Data folder:
   ```powershell
   Copy-Item c:\output\characterBaseData.json Data\characterBaseData.json
   ```
8. Commit and push to a new branch
9. Open a pull request

**Note:** The Excel workflow only supports base tier changes, not synergy editing. For synergy modifications, use the Visual Editor or edit JSON directly.

## Commit messages
Commit messages should follow the format of:
```
Simple description of change (<50 characters)

Longer description (if necessary) of what changed, and why. Also include any caveats
for the new code or known issues / incomplete sections.
```

This makes changes easy to parse from just reading the commit log.

## Pull requests
Once you think that your changes are ready to be merged, open a pull request back to
the `main` branch on `NducTiOnomBi/swgoh-stackrank`. This will notify the repo admin that the
changes are ready, and will start the review process.

Once a change has been committed, any changes to the characterBaseData.json will be migrated to the main repo, and a new dev build/deployment will be initiated.

After the successful dev build/deployment, the change will be promoted and a new pubic build/deployment will be initiated, at which point all users will have access to the changes.

