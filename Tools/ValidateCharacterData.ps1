[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string] $CharacterBaseDataPath = "$PSScriptRoot\..\Data\characterBaseData.json",
    [Parameter(Mandatory = $false)]
    [string] $SchemaPath = "$PSScriptRoot\..\Data\characterBaseData.schema.json",
    [Parameter(Mandatory = $false)]
    [switch] $UseExternalValidator
)

$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot "VisualEditorFunctions.psm1") -Force

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Character Base Data Validation Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$validationErrors = @()
$validationWarnings = @()

# Check if file exists
if (!(Test-Path $CharacterBaseDataPath)) {
    Write-Host "ERROR: characterBaseData.json doesn't exist at: $CharacterBaseDataPath" -ForegroundColor Red
    exit 1
}

Write-Host "Validating: $CharacterBaseDataPath" -ForegroundColor White
Write-Host ""

# ====================
# 1. JSON Parsing
# ====================
Write-Host "[1/5] Testing JSON parsing..." -ForegroundColor Yellow
try {
    $jsonData = Get-Content $CharacterBaseDataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host "  ✓ Valid JSON structure" -ForegroundColor Green
}
catch {
    Write-Host "  ✗ FAILED: Invalid JSON syntax" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ====================
# 2. Data Validation (via shared module)
# ====================
Write-Host "[2/5] Running data validation..." -ForegroundColor Yellow

$characterArrayRaw = ConvertTo-CharacterArray -JsonData $jsonData

if ($null -eq $characterArrayRaw) {
    Write-Host "  ✗ FAILED: Invalid data structure (missing or invalid 'characterBaseData' array)" -ForegroundColor Red
    $validationErrors += "Invalid data structure"
}
else {
    $characterArray = @($characterArrayRaw)
    Write-Host "  ℹ Total characters: $($characterArray.Count)" -ForegroundColor Cyan

    $dataErrors = @(Test-CharacterData -CharacterArray $characterArray)

    if ($dataErrors.Count -eq 0) {
        Write-Host "  ✓ All data validation checks passed" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ FAILED: Found $($dataErrors.Count) validation error(s)" -ForegroundColor Red
        $validationErrors += $dataErrors
        $displayCount = [Math]::Min($dataErrors.Count, 10)
        for ($i = 0; $i -lt $displayCount; $i++) {
            Write-Host "    $($dataErrors[$i])" -ForegroundColor Red
        }
        if ($dataErrors.Count -gt 10) {
            Write-Host "    ... and $($dataErrors.Count - 10) more error(s)" -ForegroundColor Red
        }
    }
}

# ====================
# 3. JSON Formatting Check
# ====================
Write-Host "[3/5] Validating JSON formatting..." -ForegroundColor Yellow
$formattingIssues = @()

# Check for proper indentation (2 spaces)
$lines = Get-Content $CharacterBaseDataPath
$lineNumber = 0
foreach ($line in $lines) {
    $lineNumber++
    if ($line -match '^( +)') {
        $spaces = $matches[1].Length
        if ($spaces % 2 -ne 0) {
            $formattingIssues += "Line $lineNumber has odd number of spaces ($spaces) - should be multiples of 2"
            if ($formattingIssues.Count -ge 5) { break }
        }
    }
}

# Check encoding (should be UTF-8 without BOM)
try {
    $bytes = [System.IO.File]::ReadAllBytes($CharacterBaseDataPath)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $validationWarnings += "File has UTF-8 BOM (Byte Order Mark) - consider using UTF-8 without BOM"
    }
}
catch {
    $validationWarnings += "Could not verify file encoding"
}

if ($formattingIssues.Count -eq 0) {
    Write-Host "  ✓ JSON formatting looks good (2-space indentation)" -ForegroundColor Green
}
else {
    Write-Host "  ⚠ WARNING: Found formatting issues" -ForegroundColor Yellow
    $validationWarnings += $formattingIssues
    foreach ($issue in $formattingIssues) {
        Write-Host "    $issue" -ForegroundColor Yellow
    }
}

# ====================
# 4. Statistics Summary
# ====================
Write-Host "[4/5] Generating statistics..." -ForegroundColor Yellow

if ($null -ne $characterArray) {
    $tierDistribution = @{}
    for ($i = 1; $i -le 19; $i++) { $tierDistribution[$i] = 0 }

    $charactersWithSynergies = 0
    $totalSynergySets = 0
    $maxSynergyEnhancement = 0

    foreach ($character in $characterArray) {
        if ($character.baseTier -ge 1 -and $character.baseTier -le 19) {
            $tierDistribution[$character.baseTier]++
        }

        if ($character.synergySets) {
            $charactersWithSynergies++
            $totalSynergySets += $character.synergySets.Count

            foreach ($synergySet in $character.synergySets) {
                if ($synergySet.synergyEnhancement -gt $maxSynergyEnhancement) {
                    $maxSynergyEnhancement = $synergySet.synergyEnhancement
                }
            }
        }
    }

    Write-Host "  ℹ Characters with synergies: $charactersWithSynergies / $($characterArray.Count)" -ForegroundColor Cyan
    Write-Host "  ℹ Total synergy sets: $totalSynergySets" -ForegroundColor Cyan
    Write-Host "  ℹ Max synergy enhancement: $maxSynergyEnhancement" -ForegroundColor Cyan
    Write-Host "  ℹ Tier distribution:" -ForegroundColor Cyan
    $sortedTiers = $tierDistribution.Keys | Sort-Object
    foreach ($tier in $sortedTiers) {
        if ($tierDistribution[$tier] -gt 0) {
            $bar = "#" * [Math]::Min($tierDistribution[$tier], 50)
            Write-Host "      Tier $($tier.ToString().PadLeft(2)): $($tierDistribution[$tier].ToString().PadLeft(3)) $bar" -ForegroundColor Cyan
        }
    }
}

# ====================
# 5. JSON Schema Validation (External)
# ====================
Write-Host "[5/5] JSON Schema validation..." -ForegroundColor Yellow

if ($UseExternalValidator) {
    $ajvAvailable = $null -ne (Get-Command "ajv" -ErrorAction SilentlyContinue)

    if ($ajvAvailable -and (Test-Path $SchemaPath)) {
        Write-Host "  ℹ Running ajv schema validator..." -ForegroundColor Cyan

        $absoluteSchemaPath = Resolve-Path $SchemaPath
        $absoluteDataPath = Resolve-Path $CharacterBaseDataPath

        try {
            $ajvResult = & ajv validate -s $absoluteSchemaPath -d $absoluteDataPath 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Schema validation passed (ajv)" -ForegroundColor Green
            }
            else {
                Write-Host "  ✗ FAILED: Schema validation failed (ajv)" -ForegroundColor Red
                Write-Host "    $ajvResult" -ForegroundColor Red
                $validationErrors += "Schema validation failed - see ajv output above"
            }
        }
        catch {
            Write-Host "  ⚠ WARNING: Could not run ajv validator" -ForegroundColor Yellow
            Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "  ⚠ Skipping external schema validation" -ForegroundColor Yellow
        if (-not $ajvAvailable) {
            Write-Host "    ajv-cli not found. Install with: npm install -g ajv-cli" -ForegroundColor Yellow
        }
        if (-not (Test-Path $SchemaPath)) {
            Write-Host "    Schema file not found: $SchemaPath" -ForegroundColor Yellow
        }
    }
}
else {
    Write-Host "  ℹ External validator not requested (use -UseExternalValidator to enable)" -ForegroundColor Cyan
    Write-Host "  ℹ Install ajv-cli with: npm install -g ajv-cli" -ForegroundColor Cyan
}

# ====================
# Final Results
# ====================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Validation Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($validationErrors.Count -eq 0) {
    Write-Host "✓ VALIDATION PASSED" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    if ($validationWarnings.Count -gt 0) {
        Write-Host "Warnings: $($validationWarnings.Count)" -ForegroundColor Yellow
        foreach ($warning in $validationWarnings) {
            Write-Host "  ⚠ $warning" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "No errors or warnings found." -ForegroundColor Green
    }
    Write-Host ""
    exit 0
}
else {
    Write-Host "✗ VALIDATION FAILED" -ForegroundColor Red -BackgroundColor Black
    Write-Host ""
    Write-Host "Errors: $($validationErrors.Count)" -ForegroundColor Red
    Write-Host "Warnings: $($validationWarnings.Count)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please fix the errors above before committing changes." -ForegroundColor Red
    Write-Host ""
    exit 1
}
