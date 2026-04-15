---
description: SWGOH StackRank repository guidelines for AI-assisted development
applyTo: "**"
---

# SWGOH StackRank - GitHub Copilot Instructions

## Project Overview

### Purpose

This repository manages character tier ranking data for the **StackRank algorithm** used in Star Wars: Galaxy of Heroes (SWGOH). The primary data file ([`Data/characterBaseData.json`](Data/characterBaseData.json)) contains tier rankings and synergy configurations for 200+ characters.

### Technology Stack

- **Languages**: PowerShell, JSON
- **Tools**: Microsoft Excel (data editing), PowerShell 5.1+
- **CI/CD**: GitHub Actions → Azure DevOps → Azure App Service
- **Hosting**: Azure App Service
- **Deployment**: Dev environment at `https://dev-swgoh-stackrank-westus.azurewebsites.net`

### Key Workflows

1. Contributors edit character data (via Excel or JSON directly)
2. Changes pushed to feature branches
3. PR validation runs automatically (JSON schema, sorting, ranges)
4. After merge to `main`, data syncs to Azure DevOps `dev` branch
5. Azure builds/deploys to DEV environment automatically
6. Manual promotion to production after validation

---

## Data Schema Requirements

### Character Base Data Structure

All changes to [`Data/characterBaseData.json`](Data/characterBaseData.json) **MUST** follow the schema defined in [`Data/characterBaseData.schema.json`](Data/characterBaseData.schema.json).

#### Required Fields

- **`id`**: String, uppercase letters/numbers/underscores only (e.g., `ANAKINKNIGHT`, `R2D2_LEGENDARY`)
- **`baseTier`**: Integer, range 1-19 (where 1 = highest/best tier)

#### Optional Fields

- **`synergySets`**: Array of synergy configurations (see below)
- **`requiresAllZetas`**: Boolean flag for zeta requirements
- **`requiredZetas`**: Array of zeta ability IDs

#### Synergy Set Structure

Each synergy set reduces the effective tier when conditions are met:

```json
{
    "synergyEnhancement": 3, // 0-10 (tier improvement) - at least one of synergyEnhancement or synergyEnhancementOmicron required
    "synergyEnhancementOmicron": 2, // Optional: 0-10 (additional omicron boost)
    "characters": ["VADER", "EMPEROR"], // Optional: specific character IDs
    "skipIfPresentCharacters": ["BADBATCHOMEGA"], // Optional: character IDs that prevent synergy activation if present
    "categoryDefinitions": [
        // Optional: category matching
        {
            "include": ["Sith", "Empire"], // Required: tags to match
            "exclude": ["Jedi"], // Optional: tags to exclude
            "numberMatchesRequired": 2 // Required: 1-4 (other team members)
        }
    ],
    "requiresAllZetas": false, // Optional: zeta requirement
    "requiredZetas": ["ABILITY_ID"] // Optional: specific zetas
}
```

#### Critical Constraints

1. **Tier Range**: `baseTier` must be 1-19
2. **Synergy Range**: `synergyEnhancement` and `synergyEnhancementOmicron` must be 0-10
3. **Synergy Requirement**: Each synergy set MUST have at least one of `synergyEnhancement` or `synergyEnhancementOmicron`
4. **Synergy Slot Limit**: Each synergy set can reference a maximum of 4 total teammates: `characters.length + sum(categoryDefinitions[].numberMatchesRequired) ≤ 4` (enforced by PowerShell validation, not JSON schema)
5. **Alphabetical Order**: All characters MUST be sorted by `id` (case-sensitive)
6. **No Duplicates**: Each character `id` must be unique
7. **Character References**: All character IDs in `synergySets[].characters` and `synergySets[].skipIfPresentCharacters` arrays MUST reference existing characters in the data file
8. **Property Names**: Only known property names are allowed (enforced by schema `additionalProperties: false`)
9. **Formatting**: Use 2-space indentation, UTF-8 encoding without BOM
10. **JSON Validity**: Must parse as valid JSON

> **Note**: The synergy slot limit (constraint #4) cannot be expressed in JSON Schema Draft 7, so it is enforced by the PowerShell validation script (`Tools/ValidateCharacterData.ps1`) which runs both locally and in CI/CD pipelines.

---

## Security Requirements

### Input Validation

**ALWAYS validate inputs in PowerShell scripts:**

```powershell
# Validate file paths exist
if (!(Test-Path $FilePath)) {
    throw "File not found: $FilePath"
}

# Validate tier ranges
if ($tier -lt 1 -or $tier -gt 19) {
    throw "Tier must be between 1 and 19"
}

# Validate character ID format
if ($characterId -notmatch '^[A-Z0-9_]+$') {
    throw "Invalid character ID format"
}
```

### Secrets Management

**NEVER hardcode sensitive values:**

- ❌ **NO**: Hardcoded tokens, passwords, API keys
- ✅ **YES**: Use GitHub Secrets (`${{ secrets.SECRET_NAME }}`)
- ✅ **YES**: Use environment variables in workflows
- ⚠️ **CAUTION**: Mask sensitive output in logs

**Current secrets in use:**

- `AZDO_PAT`: Azure DevOps Personal Access Token
- `AZDO_ORG`: Azure DevOps organization name
- `AZDO_PROJECT`: Azure DevOps project name
- `AZDO_REPO`: Azure DevOps repository name
- `GITHUB_TOKEN`: Automatic token for GitHub API

### File Management

**Prevent accidental commits of local files:**

- Output files should go to `c:\output\` (excluded via `.gitignore`)
- Excel temp files (`~$*.xlsx`) must never be committed
- Only [`Data/characterBaseData.json`](Data/characterBaseData.json) should be tracked in Data folder

---

## PowerShell Development Standards

### Error Handling

**Always use strict error handling:**

```powershell
[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string] $FilePath = "default/path"
)

$ErrorActionPreference = 'Stop'

try {
    # Main logic here
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup (e.g., Excel COM objects)
    if ($excelObject) {
        $excelObject.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excelObject) | Out-Null
    }
}
```

### Path Safety

**Avoid hardcoded absolute paths:**

- ❌ **NO**: `c:\specific\hardcoded\path.json`
- ✅ **YES**: `$PSScriptRoot\..\Data\file.json` (relative to script)
- ✅ **YES**: Accept paths as parameters with sensible defaults

### Excel COM Automation

**Always clean up COM objects:**

```powershell
try {
    $excelObject = New-Object -Com Excel.Application
    $excelObject.Visible = $false
    $workbook = $excelObject.Workbooks.Add()

    # Work with Excel...
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excelObject) {
        $excelObject.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excelObject) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
```

### Parameter Documentation

**Use comment-based help:**

```powershell
<#
.SYNOPSIS
    Brief description of what the script does

.DESCRIPTION
    Detailed explanation of functionality

.PARAMETER ParameterName
    Description of the parameter

.EXAMPLE
    PS> .\Script.ps1 -ParameterName "value"
    Description of what this example does
#>
```

## ✅ Testing & Quality

### TDD Workflow

All new features and bug fixes **must** follow Test-Driven Development. Never write implementation code without a failing test that demands it.

#### Red → Green → Refactor

1. **🔴 Red** — Write a test for the desired behavior. Run it. It **must fail** (proving the behavior doesn't exist yet).
2. **🟢 Green** — Write the **simplest code that makes the test pass**. No more, no less.
3. **🔵 Refactor** — Clean up implementation and test code while keeping all tests green. Remove duplication, improve naming, extract methods.
4. **Repeat** for the next behavior.

#### Step-by-Step Workflow

When implementing a feature or fixing a bug, follow these steps in order:

1. Write a test that describes the expected behavior.
2. Run the test suite — confirm the new test **fails** (Red).
3. Write the **minimum implementation** to make the test pass.
4. Run the test suite — confirm **all tests pass** (Green).
5. Refactor both test and implementation code; re-run tests after each change (Refactor).
6. Repeat for the next behavior.

> **Never skip verification.** Always run tests after writing the test (to confirm failure) and after writing the implementation (to confirm success). If a new test passes immediately, either the test is wrong or the behavior already exists — investigate before proceeding.

#### Bug Fix Protocol

1. Write a test that **reproduces the bug** (it must fail before the fix).
2. Verify the test fails for the expected reason.
3. Fix the bug with the minimal change.
4. Verify the test passes.
5. Refactor if needed; re-run tests.

This prevents regression — the bug can never silently return.

#### Minimal Implementation Principle

During the Green phase:

- Write the **simplest code that works** — do not gold-plate or pre-optimize.
- Do not add behavior that isn't demanded by a test.
- Add new tests to drive new behavior.

#### What to TDD

- Validation logic (tier ranges, synergy constraints, cross-references)
- JSON parsing and data transformation logic
- File path resolution and existence checks
- Synergy calculation logic
- Error handling paths in scripts
- HTTP endpoint handlers (`StartVisualEditor.ps1`)

#### Exclusions (What Not to TDD)

- Excel COM automation (requires Windows + Excel, can't run in CI)
- Simple parameter declarations with defaults
- Static configuration/constant definitions
- `Write-Host` output formatting (cosmetic-only logic)

### Testing Standards (Pester 5.x)

- Use Pester's **`Describe`/`Context`/`It`** block structure to organize tests:
    - `Describe` — groups tests for a script or major function
    - `Context` — groups tests for a specific scenario or condition within the `Describe`
    - `It` — defines a single test case

- Follow **AAA pattern** with explicit comments: `# Arrange`, `# Act`, `# Assert` (clearly separated sections).

- Use descriptive `It` names that state the expected behavior:

```powershell
Describe 'ValidateCharacterData' {
    Context 'When baseTier is out of range' {
        It 'Should return error when baseTier exceeds 19' { }
        It 'Should return error when baseTier is less than 1' { }
    }

    Context 'When synergy cross-references are invalid' {
        It 'Should return error when referenced character does not exist' { }
    }
}
```

- Test **one logical concept** per `It` block; avoid multi-assertion tests.

- Name test files: **`{ScriptName}.Tests.ps1`** (e.g., `ValidateCharacterData.Tests.ps1`).

- Place all test files in the **`Tests\`** directory at repository root.

- Use **`-TestCases @(...)`** for parameterized tests:

```powershell
It "Should reject baseTier value <Tier> as out of range" -TestCases @(
    @{ Tier = 0 }
    @{ Tier = 20 }
    @{ Tier = -1 }
) {
    param($Tier)
    # Arrange
    $testData = @{ characterBaseData = @(@{ id = "TEST_CHAR"; baseTier = $Tier }) }
    $testData | ConvertTo-Json -Depth 5 | Set-Content "TestDrive:\test.json"

    # Act & Assert
    { .\Tools\ValidateCharacterData.ps1 -CharacterBaseDataPath "TestDrive:\test.json" } | Should -Throw
}
```

- Mock **only external dependencies** (file system, external tools, network), not internal logic:

```powershell
Mock Get-Command { $null } -ParameterFilter { $Name -eq 'ajv' }
Mock Test-Path { $true } -ParameterFilter { $Path -like '*characterBaseData.json' }
```

- Use **`Should`** assertions for readable, expressive checks:

```powershell
$result | Should -Be 0
$output | Should -Contain "VALIDATION PASSED"
$errors | Should -BeNullOrEmpty
$characters | Should -HaveCount 200
{ Invoke-Expression $badCommand } | Should -Throw -ExpectedMessage "*Invalid*"
```

- Use **`TestDrive:\`** for file system isolation — Pester auto-creates and cleans up a temporary directory per test run.

- Use **`BeforeAll`/`BeforeEach`** for setup and **`AfterAll`/`AfterEach`** for teardown.

- Keep tests **deterministic and isolated**; avoid:
    - Shared mutable state between tests
    - Dependency on execution order
    - Network calls (mock `Invoke-RestMethod`/`Invoke-WebRequest`)
    - Real file system dependencies outside `TestDrive:\`

- Aim for **80%+ code coverage** on validation and business logic; 100% on critical paths.
- Test **edge cases and boundaries**: empty arrays, missing fields, boundary values (`baseTier` 1, `baseTier` 19, `synergyEnhancement` 0, `synergyEnhancement` 10).

### Testing Tools

- **Pester 5.x** — PowerShell testing framework for unit and integration tests
- **`TestDrive:\`** — Pester's built-in isolated temp file system for test data
- **`Mock`** — Pester's built-in mocking for cmdlets and functions
- **`Invoke-Pester`** — Test runner with configuration support
- **`New-PesterConfiguration`** — Programmatic test configuration

### Running Tests

```powershell
# Run all tests
Invoke-Pester -Path .\Tests\

# Run specific test file
Invoke-Pester -Path .\Tests\ValidateCharacterData.Tests.ps1

# Run with detailed output
Invoke-Pester -Path .\Tests\ -Output Detailed

# Run with code coverage
$config = New-PesterConfiguration
$config.Run.Path = '.\Tests\'
$config.CodeCoverage.Enabled = $true
$config.CodeCoverage.Path = @('.\Tools\ValidateCharacterData.ps1')
Invoke-Pester -Configuration $config
```

---

## CI/CD Best Practices

### Workflow Permissions

**Use minimal required permissions:**

```yaml
permissions:
    contents: read # Only if reading repo
    pull-requests: write # Only if commenting on PRs
    # Never use 'write-all' or overly broad permissions
```

### Validation Gates

**Before ANY merge to `main`:**

1. ✅ JSON schema validation must pass
2. ✅ Alphabetical sorting verified
3. ✅ No duplicate character IDs
4. ✅ All tier values in range (1-19)
5. ✅ All synergy enhancements in range (0-10)
6. ✅ Each synergy set has at least one enhancement type
7. ✅ **Synergy slot limit enforced** (characters + required matches ≤ 4 per set)
8. ✅ All character cross-references are valid (no orphaned references)
9. ✅ No unknown property names (schema enforces known properties only)
10. ✅ Proper JSON formatting (2-space indent)

**PR validation workflow automatically runs these checks** - see [`.github/workflows/validate-pr.yml`](.github/workflows/validate-pr.yml)

> **Important**: The synergy slot limit (#7) is enforced by the PowerShell validation script, which now runs automatically in CI/CD pipelines. This ensures that no synergy set can reference more than 4 total teammates.

### Local Validation Required

**Contributors MUST run local validation before pushing:**

```powershell
# From repository root
.\Tools\ValidateCharacterData.ps1

# Optional: Use external ajv validator for full schema check
.\Tools\ValidateCharacterData.ps1 -UseExternalValidator
```

**Installation of ajv-cli (optional but recommended):**

```bash
npm install -g ajv-cli ajv-formats
```

### Deployment Safety

**Understand the deployment pipeline:**

1. Merge to `main` → triggers [`sync-to-azdo.yml`](.github/workflows/sync-to-azdo.yml)
2. Data copied to Azure DevOps `dev` branch
3. Azure pipeline builds/deploys DEV environment
4. GitHub comment notifies author with DEV URL
5. **VALIDATE changes in DEV before production promotion**

---

## Common Validation Issues

### Character Cross-Reference Errors

**Problem**: "Invalid character reference found in synergy sets"

**Cause**: A synergy set references a character ID that doesn't exist in the data file.

**Solution**:

1. Check the error message for the invalid character ID
2. Verify the correct character ID exists in `characterBaseData.json`
3. Common issues:
    - **Typo in character reference**: `"VADAR"` should be `"VADER"`
    - **Character not yet added**: Add the character before referencing it
    - **Wrong ID format**: Ensure uppercase with underscores: `"R2D2_LEGENDARY"`

**Example Fix**:

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

### Property Name Errors

**Problem**: "must NOT have additional properties"

**Cause**: A property name is misspelled or doesn't exist in the schema.

**Solution**:

1. Check the error message for the invalid property name
2. Verify correct spelling against schema documentation
3. Common typos:
    - `"characetrs"` → `"characters"`
    - `"synergyEnhancment"` → `"synergyEnhancement"`
    - `"baseTear"` → `"baseTier"`

**Example Fix**:

```json
// ❌ WRONG - Property name typo
{
  "id": "HERASYNDULLAS3",
  "synergySets": [
    {
      "synergyEnhancement": 3,
      "characetrs": ["EZRABRIDGERS3"]
    }
  ]
}

// ✅ CORRECT - Fixed property name
{
  "id": "HERASYNDULLAS3",
  "synergySets": [
    {
      "synergyEnhancement": 3,
      "characters": ["EZRABRIDGERS3"]
    }
  ]
}
```

**Prevention**: The JSON schema enforces `additionalProperties: false` at all levels, catching typos during validation.

---

## Documentation Requirements

### Code Comments

**When to comment:**

- Complex synergy logic or calculations
- Non-obvious tier assignment reasoning
- Workarounds for Excel COM limitations
- Data migration or schema changes

**What NOT to comment:**

- Self-explanatory code (`$tier = 1` doesn't need explanation)
- Redundant descriptions of what code literally does

### Commit Messages

**Follow established format:**

```
Brief description (<50 characters)

Longer explanation of what changed and why. Include:
- Specific characters added/modified
- Tier changes with justification
- Synergy adjustments and reasoning
- Any known caveats or incomplete work
```

**Examples:**

```
Add ASAJJDARKDISCIPLE character at tier 14

Added new character with synergy sets for Nightsister teams.
Base tier 14 with +3 enhancement when paired with Talzin/Ventress.

Update VADER base tier from 3 to 2

Adjusted based on current meta dominance. Synergy sets
unchanged. Tested with Palpatine/Thrawn teams.
```

### Pull Request Documentation

**Use the PR template** - see [`.github/pull_request_template.md`](.github/pull_request_template.md)

**Required information:**

- Character(s) affected
- Tier changes with justification
- Synergy changes with reasoning
- Validation checklist completion
- Testing performed (if applicable)

---

## Clarification Triggers

**GitHub Copilot MUST prompt for clarification when:**

### 1. Ambiguous Tier Assignments

**Ask for clarification when:**

- No justification provided for tier value
- Tier seems inconsistent with similar characters
- Large tier change (±3 or more) without explanation

**Example prompt:**

> "I see you're assigning tier X to CHARACTER_ID. Can you provide context on why this tier is appropriate? Consider factors like: meta relevance, synergy potential, role in current teams, or comparison to similar characters."

### 2. Unclear Synergy Definitions

**Ask for clarification when:**

- `synergyEnhancement` value seems high (>4) without explanation
- Category definitions are very broad or very narrow
- Specific character list doesn't align with category tags
- `numberMatchesRequired` seems unusual for the categories

**Example prompt:**

> "This synergy set has a +5 enhancement, which is quite high. Can you explain the team composition and why this synergy bonus is justified? Also, should this require specific zetas?"

### 3. Character ID Naming

**Ask for clarification when:**

- Character ID doesn't match obvious naming patterns
- Multiple possible IDs for same character (e.g., `DARTHVADER` vs `VADER`)
- Ambiguous character reference (multiple versions exist)

**Example prompt:**

> "I see you're adding 'CHARACTERNAME'. Is this the correct ID format? The existing data uses IDs like 'JEDIMASTERKENOBI' and 'ANAKINKNIGHT'. Should we verify the exact ID from the game data?"

### 4. Modification Scope Unclear

**Ask for clarification when:**

- Multiple characters might need similar changes
- Change affects synergy calculations for other characters
- Unclear if change is temporary/experimental or permanent

**Example prompt:**

> "You're updating CHARACTER_ID's tier. Should similar characters (with same faction/role) receive similar adjustments? For example: [list similar characters]"

### 5. Security Implications

**ALWAYS ask when:**

- Adding new external dependencies
- Modifying workflow permissions
- Handling sensitive data or credentials
- Changing file access patterns

**Example prompt:**

> "This change modifies workflow permissions. Can you confirm this increased permission level is necessary? What specific operation requires this access?"

### 6. Breaking Changes

**Ask for confirmation when:**

- Changing schema structure
- Modifying validation rules
- Altering PowerShell script interfaces
- Updating CI/CD behavior

**Example prompt:**

> "This change modifies the JSON schema structure. This could break existing tools and workflows. Are you intentionally making a breaking change? Should we version this or provide migration guidance?"

---

## Best Practices Summary

### ✅ DO

- Run `ValidateCharacterData.ps1` before every commit
- Run `Invoke-Pester` before every commit to verify tests pass
- Write Pester tests for new validation logic and bug fixes (TDD)
- Test changes in DEV environment before production
- Use descriptive commit messages with justification
- Keep character IDs sorted alphabetically
- Follow 2-space JSON indentation
- Validate all user inputs in PowerShell scripts
- Clean up Excel COM objects properly
- Use relative paths in scripts
- Document complex synergy logic
- Ask for clarification when requirements are ambiguous

### ❌ DON'T

- Commit without running validation
- Commit without running Pester tests
- Skip writing tests for new validation rules
- Hardcode absolute file paths
- Skip error handling in PowerShell
- Forget to clean up COM objects
- Use inconsistent formatting
- Commit Excel temp files or output folders
- Expose secrets in code or logs
- Make breaking changes without discussion
- Assume tier/synergy values without justification
- Merge PRs that fail validation or Pester tests

---

## Quick Reference

### File Structure

```
Data/
  characterBaseData.json       # Main data file (ONLY tracked file in Data/)
  characterBaseData.schema.json # JSON Schema validation rules

Tools/
  ReadBaseDataToXLS.ps1        # Export base data to Excel
  ReadBaseDataSynergyToXLS.ps1 # Export with synergy calculations
  ReadXLStoBaseDataJson.ps1    # Import Excel changes to JSON
  ValidateCharacterData.ps1    # Local validation script

Tests/
  ValidateCharacterData.Tests.ps1  # Pester tests for validation script
  .pester.ps1                      # Pester configuration file

.github/
  workflows/
    sync-to-azdo.yml           # Deploy to Azure DevOps on main merge
    validate-pr.yml            # PR validation checks + Pester tests
  pull_request_template.md     # PR template with checklist
  copilot-instructions.md      # This file
```

### Common Commands

```powershell
# Validate character data locally
.\Tools\ValidateCharacterData.ps1

# Validate with external schema validator
.\Tools\ValidateCharacterData.ps1 -UseExternalValidator

# Run all Pester tests
Invoke-Pester -Path .\Tests\

# Run Pester tests with detailed output
Invoke-Pester -Path .\Tests\ -Output Detailed

# Run Pester tests with configuration file
Invoke-Pester -Configuration (& .\Tests\.pester.ps1)

# Export to Excel (base tiers only)
.\Tools\ReadBaseDataToXLS.ps1

# Export to Excel (with synergy calculations)
.\Tools\ReadBaseDataSynergyToXLS.ps1

# Import changes from Excel
.\Tools\ReadXLStoBaseDataJson.ps1
```

### Schema Validation (External)

```bash
# Install ajv-cli globally
npm install -g ajv-cli ajv-formats

# Validate manually
ajv validate -s Data/characterBaseData.schema.json -d Data/characterBaseData.json
```

---

## Additional Resources

- **Contributing Guidelines**: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Code of Conduct**: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- **Tools Documentation**: [`Tools/index.md`](Tools/index.md)
- **Pester Tests**: [`Tests/`](Tests/) — Test files and Pester configuration
- **JSON Schema Spec**: [JSON Schema Draft 7](https://json-schema.org/draft-07/schema)
- **Pester Documentation**: [Pester Docs](https://pester.dev/docs/quick-start)
- **Azure DevOps Pipeline**: (Internal Azure DevOps project)

---

**Last Updated**: 2026-04-14  
**Schema Version**: 1.0  
**Maintained By**: @NducTiOnomBi
