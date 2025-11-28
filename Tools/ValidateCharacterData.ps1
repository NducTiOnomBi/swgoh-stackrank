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
# 1. JSON Parsing Test
# ====================
Write-Host "[1/8] Testing JSON parsing..." -ForegroundColor Yellow
try {
    $characterBaseData = Get-Content $CharacterBaseDataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host "  ✓ Valid JSON structure" -ForegroundColor Green
}
catch {
    Write-Host "  ✗ FAILED: Invalid JSON syntax" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ====================
# 2. Structure Validation
# ====================
Write-Host "[2/8] Validating data structure..." -ForegroundColor Yellow
if (-not $characterBaseData.characterBaseData) {
    $validationErrors += "Missing root 'characterBaseData' property"
    Write-Host "  ✗ FAILED: Missing root 'characterBaseData' property" -ForegroundColor Red
}
elseif ($characterBaseData.characterBaseData -isnot [System.Array]) {
    $validationErrors += "'characterBaseData' must be an array"
    Write-Host "  ✗ FAILED: 'characterBaseData' must be an array" -ForegroundColor Red
}
else {
    Write-Host "  ✓ Valid root structure" -ForegroundColor Green
}

$characterBaseDataItems = $characterBaseData.characterBaseData
$totalCharacters = $characterBaseDataItems.Count
Write-Host "  ℹ Total characters: $totalCharacters" -ForegroundColor Cyan

# ====================
# 3. Duplicate ID Check
# ====================
Write-Host "[3/8] Checking for duplicate character IDs..." -ForegroundColor Yellow
$characterIds = @{}
$duplicates = @()

foreach ($character in $characterBaseDataItems) {
    if (-not $character.id) {
        $validationErrors += "Character found without 'id' property"
        continue
    }
    
    if ($characterIds.ContainsKey($character.id)) {
        $duplicates += $character.id
        $validationErrors += "Duplicate character ID: $($character.id)"
    }
    else {
        $characterIds[$character.id] = $true
    }
}

if ($duplicates.Count -eq 0) {
    Write-Host "  ✓ No duplicate IDs found" -ForegroundColor Green
}
else {
    Write-Host "  ✗ FAILED: Found $($duplicates.Count) duplicate ID(s)" -ForegroundColor Red
    foreach ($dup in $duplicates) {
        Write-Host "    - $dup" -ForegroundColor Red
    }
}

# ====================
# 4. Alphabetical Sorting Check
# ====================
Write-Host "[4/8] Validating alphabetical sorting..." -ForegroundColor Yellow
$sortedIds = $characterBaseDataItems.id | Sort-Object
$actualIds = $characterBaseDataItems.id
$sortingErrors = @()

for ($i = 0; $i -lt $actualIds.Count; $i++) {
    if ($actualIds[$i] -ne $sortedIds[$i]) {
        $sortingErrors += "Position $($i + 1): Expected '$($sortedIds[$i])', found '$($actualIds[$i])'"
    }
}

if ($sortingErrors.Count -eq 0) {
    Write-Host "  ✓ Characters are sorted alphabetically" -ForegroundColor Green
}
else {
    Write-Host "  ✗ FAILED: Characters are not sorted alphabetically" -ForegroundColor Red
    $validationErrors += "Characters must be sorted alphabetically by ID"
    if ($sortingErrors.Count -le 5) {
        foreach ($error in $sortingErrors) {
            Write-Host "    $error" -ForegroundColor Red
        }
    }
    else {
        Write-Host "    Showing first 5 of $($sortingErrors.Count) sorting errors:" -ForegroundColor Red
        for ($i = 0; $i -lt 5; $i++) {
            Write-Host "    $($sortingErrors[$i])" -ForegroundColor Red
        }
    }
}

# ====================
# 5. Field Validation
# ====================
Write-Host "[5/8] Validating required fields and data types..." -ForegroundColor Yellow
$fieldErrors = @()
$characterIndex = 0

foreach ($character in $characterBaseDataItems) {
    $characterIndex++
    $charId = if ($character.id) { $character.id } else { "<missing-id at index $characterIndex>" }
    
    # Validate 'id' field
    if (-not $character.id) {
        $fieldErrors += "[$charId] Missing required field: 'id'"
    }
    elseif ($character.id -notmatch '^[A-Z0-9_]+$') {
        $fieldErrors += "[$charId] Invalid ID format: must contain only uppercase letters, numbers, and underscores"
    }
    
    # Validate 'baseTier' field
    if ($null -eq $character.baseTier) {
        $fieldErrors += "[$charId] Missing required field: 'baseTier'"
    }
    elseif ($character.baseTier -isnot [System.ValueType] -or $character.baseTier -isnot [System.IConvertible]) {
        $fieldErrors += "[$charId] 'baseTier' must be an integer"
    }
    elseif ($character.baseTier -lt 1 -or $character.baseTier -gt 19) {
        $fieldErrors += "[$charId] 'baseTier' must be between 1 and 19 (found: $($character.baseTier))"
    }
    
    # Validate 'synergySets' if present
    if ($character.synergySets) {
        if ($character.synergySets -isnot [System.Array]) {
            $fieldErrors += "[$charId] 'synergySets' must be an array"
        }
        else {
            $synergyIndex = 0
            foreach ($synergySet in $character.synergySets) {
                $synergyIndex++
                
                # Check that at least one enhancement type is present
                if ($null -eq $synergySet.synergyEnhancement -and $null -eq $synergySet.synergyEnhancementOmicron) {
                    $fieldErrors += "[$charId] Synergy set #$synergyIndex must have at least one of 'synergyEnhancement' or 'synergyEnhancementOmicron'"
                }
                
                # Validate synergyEnhancement if present
                if ($null -ne $synergySet.synergyEnhancement) {
                    if ($synergySet.synergyEnhancement -isnot [System.ValueType] -or $synergySet.synergyEnhancement -isnot [System.IConvertible]) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'synergyEnhancement' must be an integer"
                    }
                    elseif ($synergySet.synergyEnhancement -lt 0 -or $synergySet.synergyEnhancement -gt 10) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'synergyEnhancement' must be between 0 and 10 (found: $($synergySet.synergyEnhancement))"
                    }
                }
                
                # Validate synergyEnhancementOmicron if present
                if ($null -ne $synergySet.synergyEnhancementOmicron) {
                    if ($synergySet.synergyEnhancementOmicron -isnot [System.ValueType] -or $synergySet.synergyEnhancementOmicron -isnot [System.IConvertible]) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'synergyEnhancementOmicron' must be an integer"
                    }
                    elseif ($synergySet.synergyEnhancementOmicron -lt 0 -or $synergySet.synergyEnhancementOmicron -gt 10) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'synergyEnhancementOmicron' must be between 0 and 10 (found: $($synergySet.synergyEnhancementOmicron))"
                    }
                }
                
                # Validate characters array if present
                if ($synergySet.characters) {
                    if ($synergySet.characters -isnot [System.Array]) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'characters' must be an array"
                    }
                    elseif ($synergySet.characters.Count -lt 1 -or $synergySet.characters.Count -gt 4) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'characters' array must contain between 1 and 4 elements (found: $($synergySet.characters.Count))"
                    }
                }
                
                # Validate categoryDefinitions if present
                if ($synergySet.categoryDefinitions) {
                    if ($synergySet.categoryDefinitions -isnot [System.Array]) {
                        $fieldErrors += "[$charId] Synergy set #$synergyIndex 'categoryDefinitions' must be an array"
                    }
                    else {
                        $catIndex = 0
                        foreach ($catDef in $synergySet.categoryDefinitions) {
                            $catIndex++
                            
                            if (-not $catDef.include) {
                                $fieldErrors += "[$charId] Synergy set #$synergyIndex, category #$catIndex missing required field: 'include'"
                            }
                            elseif ($catDef.include -isnot [System.Array]) {
                                $fieldErrors += "[$charId] Synergy set #$synergyIndex, category #$catIndex 'include' must be an array"
                            }
                            
                            if ($null -eq $catDef.numberMatchesRequired) {
                                $fieldErrors += "[$charId] Synergy set #$synergyIndex, category #$catIndex missing required field: 'numberMatchesRequired'"
                            }
                            elseif ($catDef.numberMatchesRequired -isnot [System.ValueType] -or $catDef.numberMatchesRequired -isnot [System.IConvertible]) {
                                $fieldErrors += "[$charId] Synergy set #$synergyIndex, category #$catIndex 'numberMatchesRequired' must be an integer"
                            }
                            elseif ($catDef.numberMatchesRequired -lt 1 -or $catDef.numberMatchesRequired -gt 4) {
                                $fieldErrors += "[$charId] Synergy set #$synergyIndex, category #$catIndex 'numberMatchesRequired' must be between 1 and 4"
                            }
                        }
                    }
                }

                # Validate total characters referenced in synergy set does not exceed 4
                $totalCharactersInSet = 0
                if ($synergySet.characters) {
                    $totalCharactersInSet += $synergySet.characters.Count
                }

                if ($synergySet.categoryDefinitions) {
                    foreach ($catDef in $synergySet.categoryDefinitions) {
                        if ($catDef.include) {
                            $totalCharactersInSet += $catDef.numberMatchesRequired
                        }
                    }
                }

                if ($totalCharactersInSet -lt 1 -or $totalCharactersInSet -gt 4) {
                    $fieldErrors += "[$charId] Synergy set #$synergyIndex must reference between 1 and 4 total characters (found: $totalCharactersInSet)"
                }
            }
        }
    }
}

if ($fieldErrors.Count -eq 0) {
    Write-Host "  ✓ All required fields valid" -ForegroundColor Green
}
else {
    Write-Host "  ✗ FAILED: Found $($fieldErrors.Count) field validation error(s)" -ForegroundColor Red
    $validationErrors += $fieldErrors
    if ($fieldErrors.Count -le 10) {
        foreach ($error in $fieldErrors) {
            Write-Host "    $error" -ForegroundColor Red
        }
    }
    else {
        Write-Host "    Showing first 10 of $($fieldErrors.Count) field errors:" -ForegroundColor Red
        for ($i = 0; $i -lt 10; $i++) {
            Write-Host "    $($fieldErrors[$i])" -ForegroundColor Red
        }
    }
}

# ====================
# 6. Character Cross-Reference Validation
# ====================
Write-Host "[6/9] Validating character cross-references..." -ForegroundColor Yellow

# Build set of all valid character IDs
$validCharacterIds = @{}
foreach ($character in $characterBaseDataItems) {
    if ($character.id) {
        $validCharacterIds[$character.id] = $true
    }
}

$crossRefErrors = @()

# Check all character references in synergy sets
foreach ($character in $characterBaseDataItems) {
    $charId = if ($character.id) { $character.id } else { "<missing-id>" }
    
    if ($character.synergySets) {
        $synergyIndex = 0
        foreach ($synergySet in $character.synergySets) {
            $synergyIndex++
            
            if ($synergySet.characters) {
                foreach ($referencedCharId in $synergySet.characters) {
                    if (-not $validCharacterIds.ContainsKey($referencedCharId)) {
                        $crossRefErrors += "[$charId] Synergy set #$synergyIndex references non-existent character: '$referencedCharId'"
                    }
                }
            }
        }
    }
}

if ($crossRefErrors.Count -eq 0) {
    Write-Host "  ✓ All character references are valid" -ForegroundColor Green
}
else {
    Write-Host "  ✗ FAILED: Found $($crossRefErrors.Count) invalid character reference(s)" -ForegroundColor Red
    $validationErrors += $crossRefErrors
    if ($crossRefErrors.Count -le 10) {
        foreach ($error in $crossRefErrors) {
            Write-Host "    $error" -ForegroundColor Red
        }
    }
    else {
        Write-Host "    Showing first 10 of $($crossRefErrors.Count) reference errors:" -ForegroundColor Red
        for ($i = 0; $i -lt 10; $i++) {
            Write-Host "    $($crossRefErrors[$i])" -ForegroundColor Red
        }
    }
}

# ====================
# 7. JSON Formatting Check
# ====================
Write-Host "[7/9] Validating JSON formatting..." -ForegroundColor Yellow
$rawContent = Get-Content $CharacterBaseDataPath -Raw
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

# Check encoding (should be UTF-8)
$encoding = [System.Text.Encoding]::Default
try {
    $bytes = [System.IO.File]::ReadAllBytes($CharacterBaseDataPath)
    # Check for UTF-8 BOM
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
# 8. Statistics Summary
# ====================
Write-Host "[8/9] Generating statistics..." -ForegroundColor Yellow
$tierDistribution = @{}
for ($i = 1; $i -le 19; $i++) { $tierDistribution[$i] = 0 }

$charactersWithSynergies = 0
$totalSynergySets = 0
$maxSynergyEnhancement = 0

foreach ($character in $characterBaseDataItems) {
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

Write-Host "  ℹ Characters with synergies: $charactersWithSynergies / $totalCharacters" -ForegroundColor Cyan
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

# ====================
# 9. JSON Schema Validation (External)
# ====================
Write-Host "[9/9] JSON Schema validation..." -ForegroundColor Yellow

if ($UseExternalValidator) {
    # Try to use ajv-cli if available
    $ajvAvailable = $null -ne (Get-Command "ajv" -ErrorAction SilentlyContinue)
    
    if ($ajvAvailable -and (Test-Path $SchemaPath)) {
        Write-Host "  ℹ Running ajv schema validator..." -ForegroundColor Cyan
        try {
            $ajvResult = & ajv validate -s $SchemaPath -d $CharacterBaseDataPath 2>&1
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
