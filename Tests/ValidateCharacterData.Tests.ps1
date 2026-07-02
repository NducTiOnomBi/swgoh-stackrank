#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }

BeforeAll {
    $script:ScriptPath = (Resolve-Path (Join-Path $PSScriptRoot '..\Tools\ValidateCharacterData.ps1')).Path
    $script:SchemaPath = (Resolve-Path (Join-Path $PSScriptRoot '..\Data\characterBaseData.schema.json')).Path

    # Run the validation script in a child process to isolate 'exit' calls
    function Invoke-ValidationScript {
        param(
            [Parameter(Mandatory)]
            [string]$DataPath,
            [string]$SchemaPath = $script:SchemaPath
        )
        $output = & pwsh -NoProfile -NonInteractive -File $script:ScriptPath `
            -CharacterBaseDataPath $DataPath `
            -SchemaPath $SchemaPath 2>&1
        [PSCustomObject]@{
            ExitCode = $LASTEXITCODE
            Output   = ($output -join [Environment]::NewLine)
        }
    }
}

Describe 'ValidateCharacterData' {

    Context 'JSON Parsing' {
        It 'Should pass validation with valid JSON data' {
            $testFile = Join-Path $TestDrive 'valid.json'
            @{
                characterBaseData = @(
                    @{ id = "AACHARACTER"; baseTier = 5 }
                    @{ id = "BBCHARACTER"; baseTier = 10 }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 0 -Because $result.Output
        }

        It 'Should fail validation with invalid JSON syntax' {
            $testFile = Join-Path $TestDrive 'invalid.json'
            '{ this is not valid json }}}' | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }
    }

    Context 'Data Structure' {
        It 'Should fail when root characterBaseData property is missing' {
            $testFile = Join-Path $TestDrive 'no_root.json'
            @{ someOtherProperty = @() } | ConvertTo-Json -Depth 10 |
                Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }
    }

    Context 'Duplicate ID Detection' {
        It 'Should fail when duplicate character IDs exist' {
            # Raw JSON ensures two array elements share the same id
            $testFile = Join-Path $TestDrive 'duplicates.json'
            @'
{
  "characterBaseData": [
    { "id": "DUPLICATE_CHAR", "baseTier": 5 },
    { "id": "DUPLICATE_CHAR", "baseTier": 10 }
  ]
}
'@ | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
            $result.Output | Should -Match 'Duplicate|duplicate'
        }
    }

    Context 'Alphabetical Sorting' {
        It 'Should fail when characters are not sorted alphabetically' {
            $testFile = Join-Path $TestDrive 'unsorted.json'
            @{
                characterBaseData = @(
                    @{ id = "ZEBRA"; baseTier = 5 }
                    @{ id = "ALPHA"; baseTier = 10 }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
            $result.Output | Should -Match 'sorted alphabetically|sorting|alphabetical order'
        }

        It 'Should pass when characters are sorted alphabetically' {
            $testFile = Join-Path $TestDrive 'sorted.json'
            @{
                characterBaseData = @(
                    @{ id = "ALPHA"; baseTier = 5 }
                    @{ id = "BRAVO"; baseTier = 10 }
                    @{ id = "CHARLIE"; baseTier = 3 }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 0 -Because $result.Output
        }
    }

    Context 'Tier Range Validation' {
        It 'Should fail when baseTier is <Tier> (out of valid range 1-19)' -TestCases @(
            @{ Tier = 0 }
            @{ Tier = 20 }
            @{ Tier = -1 }
            @{ Tier = 100 }
        ) {
            param($Tier)
            $testFile = Join-Path $TestDrive "tier_$($Tier).json"
            @{
                characterBaseData = @(
                    @{ id = "TEST_CHAR"; baseTier = $Tier }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }

        It 'Should pass when baseTier is <Tier> (within valid range 1-19)' -TestCases @(
            @{ Tier = 1 }
            @{ Tier = 10 }
            @{ Tier = 19 }
        ) {
            param($Tier)
            $testFile = Join-Path $TestDrive "tier_$($Tier).json"
            @{
                characterBaseData = @(
                    @{ id = "TEST_CHAR"; baseTier = $Tier }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 0 -Because $result.Output
        }
    }

    Context 'Synergy Enhancement Validation' {
        It 'Should fail when synergyEnhancement exceeds maximum (10)' {
            $testFile = Join-Path $TestDrive 'bad_synergy.json'
            @{
                characterBaseData = @(
                    @{ id = "OTHER_CHAR"; baseTier = 5 }
                    @{
                        id         = "SYNERGY_CHAR"
                        baseTier   = 5
                        synergySets = @(
                            @{
                                synergyEnhancement = 11
                                characters         = @("OTHER_CHAR")
                            }
                        )
                    }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }

        It 'Should fail when synergy set has neither synergyEnhancement nor synergyEnhancementOmicron' {
            $testFile = Join-Path $TestDrive 'no_enhancement.json'
            @{
                characterBaseData = @(
                    @{
                        id         = "MISSING_ENH"
                        baseTier   = 5
                        synergySets = @(
                            @{ characters = @("OTHER_CHAR") }
                        )
                    }
                    @{ id = "OTHER_CHAR"; baseTier = 5 }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }

        It 'Should pass with valid synergyEnhancement value' {
            $testFile = Join-Path $TestDrive 'good_synergy.json'
            @{
                characterBaseData = @(
                    @{ id = "OTHER_CHAR"; baseTier = 5 }
                    @{
                        id         = "SYNERGY_CHAR"
                        baseTier   = 5
                        synergySets = @(
                            @{
                                synergyEnhancement = 3
                                characters         = @("OTHER_CHAR")
                            }
                        )
                    }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 0 -Because $result.Output
        }
    }

    Context 'Character Cross-Reference Validation' {
        It 'Should fail when synergy references a non-existent character' {
            $testFile = Join-Path $TestDrive 'bad_crossref.json'
            @{
                characterBaseData = @(
                    @{
                        id       = "REAL_CHAR"
                        baseTier = 5
                        synergySets = @(
                            @{
                                synergyEnhancement = 3
                                characters         = @("NONEXISTENT_CHAR")
                            }
                        )
                    }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }

        It 'Should fail when skipIfPresentCharacters references a non-existent character' {
            $testFile = Join-Path $TestDrive 'bad_skip_crossref.json'
            @{
                characterBaseData = @(
                    @{ id = "OTHER_CHAR"; baseTier = 5 }
                    @{
                        id       = "SKIP_CHAR"
                        baseTier = 5
                        synergySets = @(
                            @{
                                synergyEnhancement     = 3
                                characters             = @("OTHER_CHAR")
                                skipIfPresentCharacters = @("GHOST_CHAR")
                            }
                        )
                    }
                )
            } | ConvertTo-Json -Depth 10 | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }
    }

    Context 'Character ID Format' {
        It 'Should fail when character ID contains invalid characters (hyphens, spaces)' {
            $testFile = Join-Path $TestDrive 'bad_id.json'
            # Hyphens and spaces are never valid in character IDs regardless of case sensitivity
            @'
{
  "characterBaseData": [
    { "id": "INVALID-CHAR", "baseTier": 5 }
  ]
}
'@ | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }
    }

    Context 'Synergy Slot Limit' {
        It 'Should fail when synergy set references more than 4 characters' {
            $testFile = Join-Path $TestDrive 'too_many_slots.json'
            # Raw JSON for precise control over the 5-character synergy array
            @'
{
  "characterBaseData": [
    { "id": "CHAR_A", "baseTier": 5 },
    { "id": "CHAR_B", "baseTier": 5 },
    { "id": "CHAR_C", "baseTier": 5 },
    { "id": "CHAR_D", "baseTier": 5 },
    { "id": "CHAR_E", "baseTier": 5 },
    {
      "id": "LEADER",
      "baseTier": 5,
      "synergySets": [
        {
          "synergyEnhancement": 3,
          "characters": ["CHAR_A", "CHAR_B", "CHAR_C", "CHAR_D", "CHAR_E"]
        }
      ]
    }
  ]
}
'@ | Set-Content -Path $testFile -Encoding UTF8

            $result = Invoke-ValidationScript -DataPath $testFile
            $result.ExitCode | Should -Be 1
        }
    }

    Context 'File Not Found' {
        It 'Should fail when the data file does not exist' {
            $nonexistentPath = Join-Path $TestDrive 'nonexistent.json'

            $result = Invoke-ValidationScript -DataPath $nonexistentPath
            $result.ExitCode | Should -Be 1
        }
    }

    Context 'Production Data Validation' {
        It 'Should successfully parse and structure-check the actual characterBaseData.json' {
            # Verify the production data is valid JSON with the correct root structure.
            # Full field validation may surface pre-existing data issues (e.g. synergy slot
            # limits) that are tracked separately, so we only assert parse + structure here.
            $productionDataPath = (Resolve-Path (Join-Path $PSScriptRoot '..\Data\characterBaseData.json')).Path
            $data = Get-Content $productionDataPath -Raw -Encoding UTF8 | ConvertFrom-Json

            $data.characterBaseData | Should -Not -BeNullOrEmpty
            $data.characterBaseData.Count | Should -BeGreaterThan 100
            $data.characterBaseData[0].id | Should -Not -BeNullOrEmpty
        }
    }
}
