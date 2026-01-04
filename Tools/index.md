# SWGOH Stack Rank Tools Documentation

## About

The purpose of these tools are to manage the [characterBaseData.json](../Data/characterBaseData.json) file values.

When the characterBaseData is converted into an Excel file, the data will be formatted to validate character tiering. specifically how the characters will be sorted into tiers. This sorting does not take into account any player specifics, so all sorting is done based on best case scenario.

There are two types of tiered Excel output, the default which ignores all synergy bonuses, and the synergy based output. The synergy based will sort all characters like the defalt, but will take into account the best synergy optimizations for every character. The synergy based output is intended to validate synergy optimization balance.

Both of these outputs work together, specifcially when optimizing for a specific ranking position.

## Requirements

### For Visual Editor (Recommended)

- PowerShell Core 7+ (cross-platform)
- Modern web browser (Chrome, Edge, Firefox, Safari)
- Minimum viewport: 768px (desktop/laptop/tablet)
- GitHub Codespaces (optional, but recommended for cloud-based editing)

### For Excel-Based Tools (Legacy)

- PowerShell 5.1 or higher
- Microsoft Excel (for data editing workflows)
- Windows operating system

### For Validation

- Node.js and npm (optional, for external schema validation with ajv-cli)

## The Tools

### StartVisualEditor.ps1 (NEW - Recommended)

**Web-Based Visual Editor** - A browser-based editor that eliminates the need for Excel and provides a modern, cross-platform interface for managing character data.

#### Key Features

- **Visual Tier Grid**: Drag-and-drop interface with 19 tier columns
- **Multi-Tier Display**: Shows base tier, best standard synergy tier, and best omicron synergy tier for each character
- **Interactive Tooltips**: Hover over synergy tiers to see detailed calculation breakdowns
- **Synergy Management**: Add, edit, and remove synergy sets directly in the browser
- **Real-Time Validation**: Comprehensive validation with detailed error messages (9 validation rules)
- **Cross-Platform**: Works on Windows, macOS, Linux (no Excel required)
- **GitHub Codespaces Ready**: Optimized for cloud-based development

#### Usage

**Local Development:**

```powershell
cd Tools
.\StartVisualEditor.ps1
```

**GitHub Codespaces:**

```bash
cd Tools
pwsh StartVisualEditor.ps1
```

The browser will open automatically to `http://localhost:8080` (or Codespaces URL).

**Note:** On Windows, you may need to run PowerShell as Administrator for the first time to allow HTTP listener binding.

#### UI Overview

- **Center Panel**: 19-column tier grid with drag-and-drop character cards
- **Left Sidebar**: Character details (base tier, omicron boost, calculated tiers)
- **Right Sidebar**: Synergy set editor (add/remove/view synergy configurations)
- **Header Actions**: Add Character, Validate, Export JSON, Save Changes
- **Status Bar**: Operation status, character count, validation status

#### Tier Calculation Display

Each character card shows:

- **Base**: Character's assigned base tier (1-19)
- **Best Std**: Best standard synergy tier (Base - Omicron - Best Synergy Enhancement)
- **Best Omi**: Best omicron synergy tier (Base - Omicron - Best Omicron Boost)

**Example Tooltip (hover over synergy tier):**

```text
Base Tier (8)
- Omicron Boost (1)
- Best Synergy (4 from VADER, PALPATINE, 3× Empire)
= Final Tier (3)
```

#### API Endpoints

The PowerShell HTTP server provides these REST API endpoints:

- `GET /api/data` - Load character data from characterBaseData.json
- `POST /api/data` - Save character data (with validation)
- `POST /api/validate` - Validate data without saving
- `GET /*` - Serve static files (HTML, CSS, JavaScript)

#### Documentation

See [VisualEditor/README.md](VisualEditor/README.md) for complete documentation, troubleshooting, and architecture details.

### ValidateCharacterData.ps1

The ValidateCharacterData.ps1 PowerShell script performs comprehensive validation of the characterBaseData.json file to ensure data integrity before committing changes. This script runs the same validation logic as the automated PR checks in GitHub Actions.

**IMPORTANT**: Contributors should run this script before every commit to catch issues early.

#### Validation Checks Performed

1. **JSON Parsing**: Verifies file contains valid JSON
2. **Data Structure**: Confirms root `characterBaseData` array exists
3. **Duplicate IDs**: Checks for duplicate character identifiers
4. **Alphabetical Sorting**: Ensures characters are sorted by ID (case-sensitive)
5. **Field Validation**: Validates all required/optional fields and data types
   - `id`: Required, uppercase letters/numbers/underscores only
   - `baseTier`: Required, integer 1-19
   - `synergySets`: Optional array with valid structure
   - Each synergy set must have at least one of `synergyEnhancement` or `synergyEnhancementOmicron`
   - `synergyEnhancement`: 0-10 range (if present)
   - `synergyEnhancementOmicron`: 0-10 range (if present)
   - `categoryDefinitions`: Valid include/exclude/numberMatchesRequired (1-4)
6. **Character Cross-References**: Validates all character IDs referenced in `synergySets[].characters` arrays exist in the data file
7. **JSON Formatting**: Checks for 2-space indentation
8. **Statistics**: Generates tier distribution and synergy metrics
9. **Schema Validation**: Uses ajv-cli if available (optional but recommended)

#### Parameters

- **CharacterBaseDataPath**
    > optional  
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- **SchemaPath**
    > optional  
    > default value="$PSScriptRoot\..\Data\characterBaseData.schema.json"

- **UseExternalValidator**
    > optional switch  
    > Enables external ajv-cli schema validation (requires `npm install -g ajv-cli ajv-formats`)

#### Usage

**Basic validation (recommended for all contributors):**

```powershell
PS C:\<path to repo>\swgoh-stackrank\Tools> .\ValidateCharacterData.ps1
```

**With external schema validation (recommended if ajv-cli is installed):**

```powershell
PS C:\<path to repo>\swgoh-stackrank\Tools> .\ValidateCharacterData.ps1 -UseExternalValidator
```

#### Output Examples

**Success:**
```
========================================
Character Base Data Validation Script
========================================

Validating: C:\...\Data\characterBaseData.json

[1/8] Testing JSON parsing...
  ✓ Valid JSON structure
[2/8] Validating data structure...
  ✓ Valid root structure
  ℹ Total characters: 200
[3/8] Checking for duplicate character IDs...
  ✓ No duplicate IDs found
[4/8] Validating alphabetical sorting...
  ✓ Characters are sorted alphabetically
[5/8] Validating required fields and data types...
  ✓ All required fields valid
[6/8] Validating JSON formatting...
  ✓ JSON formatting looks good (2-space indentation)
[7/8] Generating statistics...
  ℹ Characters with synergies: 195 / 200
  ℹ Total synergy sets: 387
  ℹ Max synergy enhancement: 7
  ℹ Tier distribution:
      Tier  1:   5 #####
      Tier  2:  12 ############
      ...
[8/8] JSON Schema validation...
  ✓ Schema validation passed (ajv)

========================================
Validation Results
========================================
✓ VALIDATION PASSED

No errors or warnings found.
```

**Failure (with errors):**
```
========================================
Validation Results
========================================
✗ VALIDATION FAILED

Errors: 3
Warnings: 0

Please fix the errors above before committing changes.
```

#### Installing External Validator (Optional)

For full JSON Schema validation support:

```bash
npm install -g ajv-cli ajv-formats
```

Then run validation with the `-UseExternalValidator` flag.

---

## The Excel Tools

### ReadBaseDataToXLS.ps1

The ReadBaseDataToXLS.ps1 PowerShell script will read the characterBaseData.json file into an Excel (XLS) format for visual validation of the default tier sorting.

#### ReadBaseDataToXLS Parameters

- CharacterBaseDataPath
    > optional
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- OutputFolderPath
    > optional    
    > default value="c:\output"

#### ReadBaseDataToXLS Usage

`PS C:\<path to repo>\swgoh-stackrank\Tools> .\ReadBaseDataToXLS.ps1`

##### Output

`Output saved successfully to c:\output\characterBaseData.xlsx!`

### ReadBaseDataSynergyToXLS.ps1

The ReadBaseDataSynergyToXLS.ps1 PowerShell script will read the characterBaseData.json file into an Excel (XLS) format for visual validation of the default tier sorting.

#### ReadBaseDataSynergyToXLS Parameters

- CharacterBaseDataPath
    > optional
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- OutputFolderPath
    > optional
    > default value="c:\output"

#### ReadBaseDataSynergyToXLS Usage

`PS C:\<path to repo>\swgoh-stackrank\Tools> .\ReadBaseDataSynergyToXLS.ps1`

##### ReadBaseDataSynergyToXLS Output

`Output saved successfully to c:\output\characterBaseDataMaxSynergy.xlsx!`

### ReadXLSBaseDataJson.ps1

The ReadBaseDataToXLS.ps1 PowerShell script will read the characterBaseData.xlsx file and update the baseTier values in the characterBaseData.json based upon any tier changes made within this file.

This is useful for adding new characters or updating existing characters.

#### ReadXLSBaseDataJson Parameters

- XlsSourcePath
    > optional
    > default value="c:\output\characterBaseData.xlsx"

- CharacterBaseDataPath
    > optional
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- OutputFolderPath
    > optional
    > default value="c:\output"

#### ReadXLSBaseDataJson Usage

`PS C:\<path to repo>\swgoh-stackrank\Tools> .\ReadXLStoBaseDataJson.ps1`

##### ReadXLSBaseDataJson Output

`Output saved successfully to c:\output\characterBaseData.json!`

---

## Contribution Workflow

### Recommended Process for Contributors

1. **Export Current Data to Excel**

   ```powershell
   .\Tools\ReadBaseDataToXLS.ps1
   ```

   Opens `c:\output\characterBaseData.xlsx` for editing

2. **Make Changes in Excel**
   - Add new characters in appropriate tier columns
   - Move existing characters between tiers
   - Save the Excel file

3. **Import Changes Back to JSON**

   ```powershell
   .\Tools\ReadXLStoBaseDataJson.ps1
   ```

   Generates `c:\output\characterBaseData.json`

4. **Validate the Changes**

   ```powershell
   .\Tools\ValidateCharacterData.ps1 -UseExternalValidator
   ```

   Ensures all validation checks pass

5. **Copy Validated JSON to Data Folder**

   ```powershell
   Copy-Item c:\output\characterBaseData.json Data\characterBaseData.json
   ```

6. **Commit and Push**
   - Create feature branch
   - Commit changes with descriptive message
   - Push to GitHub
   - Open Pull Request

### Pull Request Process

When you open a PR that modifies `Data/characterBaseData.json`:

1. **Automated Validation** runs via GitHub Actions (`.github/workflows/validate-pr.yml`)
   - JSON syntax check
   - Schema validation using ajv
   - Alphabetical sorting verification
   - Duplicate ID detection
   - Tier range validation (1-19)
   - Synergy enhancement range validation (0-10)
   - Formatting checks

2. **PR Comment** is automatically posted with:
   - Validation status (pass/fail)
   - Statistics (total characters, tier distribution)
   - Any errors or warnings found

3. **Review and Merge**
   - Address any validation failures
   - Reviewers check tier justifications and synergy logic
   - Once approved and merged to `main`...

4. **Automatic Deployment**
   - Changes sync to Azure DevOps `dev` branch
   - DEV environment rebuilds automatically
   - GitHub comment posted with DEV URL
   - **Validate changes at DEV site before production promotion**

---

## Troubleshooting Common Validation Errors

### Characters Not Sorted Alphabetically

**Error:**

```console
✗ FAILED: Characters are not sorted alphabetically by ID
Position 42: Expected 'ANAKINKNIGHT', found 'ADMIRALACKBAR'
```

**Solution:**

- The JSON file must have characters sorted by `id` in case-sensitive alphabetical order
- `ReadXLStoBaseDataJson.ps1` automatically sorts characters when importing from Excel
- If editing JSON directly, use a JSON formatter or re-import through Excel workflow

### Invalid Tier Range

**Error:**

```console
[CHARACTERID] 'baseTier' must be between 1 and 19 (found: 20)
```

**Solution:**

- Tier values must be integers from 1 (best) to 19 (worst)
- Check Excel export - characters should be in columns 1-19 only
- If editing JSON directly, verify `baseTier` values

### Missing Synergy Enhancement

**Error:**

```console
[CHARACTERID] Synergy set #1 must have at least one of 'synergyEnhancement' or 'synergyEnhancementOmicron'
```

**Solution:**
- Each synergy set must define at least one enhancement type
- Use `synergyEnhancement` for standard tier improvement (0-10)
- Use `synergyEnhancementOmicron` for additional omicron-based improvement (0-10)
- You can include both if the synergy has different values with/without omicron

### Invalid Synergy Enhancement

**Error:**

```console
[CHARACTERID] Synergy set #1 'synergyEnhancement' must be between 0 and 10 (found: 12)
```

**Solution:**
- Synergy enhancements represent tier improvements (0-10)
- Value of 10 is maximum (e.g., tier 15 with +10 synergy = effective tier 5)
- Review whether the synergy bonus is appropriate for the team composition and game balance

### Duplicate Character IDs

**Error:**

```console
✗ FAILED: Found 1 duplicate ID(s)
  - DARTHVADER
```

**Solution:**

- Each character must have a unique `id`
- Check for accidental duplicates in Excel or JSON
- Ensure character variants have different IDs (e.g., `VADER`, `DARTHVADER`, `VADER_LEGACY`)

### Invalid Character Cross-References

**Error:**

```console
[PALPATINE] Synergy set #1 references non-existent character: 'VADAR'
```

**Solution:**

- All character IDs in `synergySets[].characters` arrays must reference existing characters in the data file
- Common issues:
  - **Typo in character reference**: `"VADAR"` should be `"VADER"`
  - **Character not yet added**: Add the character before referencing it in synergy sets
  - **Wrong ID format**: Ensure uppercase with underscores: `"R2D2_LEGENDARY"` not `"R2-D2"`
- Search the JSON file for the correct character ID before adding synergy references
- The validation script checks all references against the list of valid character IDs

**Example Fix:**

```json
// ❌ WRONG - VADAR doesn't exist
{
    "id": "PALPATINE",
    "synergySets": [
        {
            "synergyEnhancement": 3,
            "characters": ["VADAR", "THRAWN"]
        }
    ]
}

// ✅ CORRECT - Fixed typo
{
    "id": "PALPATINE",
    "synergySets": [
        {
            "synergyEnhancement": 3,
            "characters": ["VADER", "THRAWN"]
        }
    ]
}
```

### JSON Formatting Issues

**Warning:**

```console
⚠ WARNING: Found formatting issues
Line 42 has odd number of spaces (3) - should be multiples of 2
```

**Solution:**

- JSON file should use 2-space indentation
- Use PowerShell to reformat:

  ```powershell
  $data = Get-Content Data\characterBaseData.json -Raw | ConvertFrom-Json
  $data | ConvertTo-Json -Depth 10 | Out-File Data\characterBaseData.json -Encoding UTF8
  ```

- Or use `jq` command-line tool:

  ```bash
  jq --indent 2 '.' Data/characterBaseData.json > temp.json && mv temp.json Data/characterBaseData.json
  ```

### Missing Required Fields

**Error:**

```
[NEWCHARACTER] Missing required field: 'baseTier'
```

**Solution:**

- Every character must have `id` and `baseTier` fields
- When adding new characters, ensure both fields are present
- Check JSON structure against schema: `Data/characterBaseData.schema.json`

### Schema Validation Failures

**Error:**

```console
✗ FAILED: Schema validation failed (ajv)
data/characterBaseData/42/id must match pattern "^[A-Z0-9_]+$"
```

**Solution:**

- Character IDs must contain only uppercase letters, numbers, and underscores
- No lowercase, spaces, or special characters allowed
- Example valid IDs: `VADER`, `R2D2_LEGENDARY`, `50RT`
- Example invalid IDs: `Vader`, `R2-D2`, `Darth Vader`

---

## Additional Resources

- **JSON Schema**: See `Data/characterBaseData.schema.json` for complete validation rules
- **PR Validation Workflow**: See `.github/workflows/validate-pr.yml` for CI validation logic
- **Copilot Instructions**: See `.github/copilot-instructions.md` for AI-assisted development guidelines
- **Contributing Guidelines**: See `CONTRIBUTING.md` for general contribution process
