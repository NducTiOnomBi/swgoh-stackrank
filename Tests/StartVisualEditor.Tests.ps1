#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..\Tools\VisualEditorFunctions.psm1') -Force
}

Describe 'VisualEditorFunctions' {

    Context 'Get-ContentType' {
        It 'Should return <Expected> for <Extension> extension' -TestCases @(
            @{ Extension = '.html'; Expected = 'text/html; charset=utf-8' }
            @{ Extension = '.js';   Expected = 'application/javascript; charset=utf-8' }
            @{ Extension = '.css';  Expected = 'text/css; charset=utf-8' }
            @{ Extension = '.json'; Expected = 'application/json; charset=utf-8' }
        ) {
            param($Extension, $Expected)
            Get-ContentType -Extension $Extension | Should -Be $Expected
        }

        It 'Should return text/plain for unknown extension' {
            Get-ContentType -Extension '.xyz' | Should -Be 'text/plain; charset=utf-8'
        }

        It 'Should return text/plain for empty extension' {
            Get-ContentType -Extension '' | Should -Be 'text/plain; charset=utf-8'
        }
    }

    Context 'Get-BaseUrl' {
        It 'Should return localhost URL for local environment' {
            Get-BaseUrl -Port 8080 | Should -Be 'http://localhost:8080'
        }

        It 'Should return Codespaces URL when in Codespaces' {
            $result = Get-BaseUrl -Port 3000 -IsCodespaces $true `
                -CodespaceName 'myspace' -PortForwardingDomain 'app.github.dev'
            $result | Should -Be 'https://myspace-3000.app.github.dev'
        }

        It 'Should use the provided port number' {
            Get-BaseUrl -Port 9090 | Should -Be 'http://localhost:9090'
        }
    }

    Context 'Get-ListenerPrefix' {
        It 'Should return localhost prefix for local environment' {
            Get-ListenerPrefix -Port 8080 | Should -Be 'http://localhost:8080/'
        }

        It 'Should return wildcard prefix for Codespaces' {
            Get-ListenerPrefix -Port 8080 -IsCodespaces $true | Should -Be 'http://+:8080/'
        }
    }

    Context 'ConvertTo-CharacterArray' {
        It 'Should extract array from wrapped format' {
            $wrapped = [PSCustomObject]@{
                characterBaseData = @(
                    [PSCustomObject]@{ id = 'ALPHA'; baseTier = 5 }
                )
            }
            $result = ConvertTo-CharacterArray -JsonData $wrapped
            $result | Should -Not -BeNullOrEmpty
            $result[0].id | Should -Be 'ALPHA'
        }

        It 'Should return array directly when given an array' {
            $rawArray = @(
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 3 }
            )
            $result = ConvertTo-CharacterArray -JsonData $rawArray
            $result | Should -Not -BeNullOrEmpty
            $result[0].id | Should -Be 'BRAVO'
        }

        It 'Should return null for non-array non-wrapped input' {
            $simple = [PSCustomObject]@{ someField = 'value' }
            $result = ConvertTo-CharacterArray -JsonData $simple
            $result | Should -BeNullOrEmpty
        }

        It 'Should return null for null input' {
            $result = ConvertTo-CharacterArray -JsonData $null
            $result | Should -BeNullOrEmpty
        }
    }

    Context 'Test-CharacterData' {
        It 'Should return no errors for valid data' {
            $validData = @(
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 5 },
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 10 }
            )
            $errors = Test-CharacterData -CharacterArray $validData
            $errors.Count | Should -Be 0
        }

        It 'Should return error for null data' {
            $errors = @(Test-CharacterData -CharacterArray $null)
            $errors.Count | Should -BeGreaterThan 0
            $errors[0] | Should -Match 'null'
        }

        It 'Should return error for non-array data' {
            $errors = @(Test-CharacterData -CharacterArray 'not an array')
            $errors.Count | Should -BeGreaterThan 0
            $errors[0] | Should -Match 'must be an array'
        }

        It 'Should return error when character missing id field' {
            $data = @(
                [PSCustomObject]@{ baseTier = 5 }
            )
            $errors = @(Test-CharacterData -CharacterArray $data)
            $errors.Count | Should -BeGreaterThan 0
            $errors[0] | Should -Match "missing 'id'"
        }

        It 'Should return error when character missing baseTier' {
            $data = @(
                [PSCustomObject]@{ id = 'ALPHA' }
            )
            $errors = @(Test-CharacterData -CharacterArray $data)
            $errors.Count | Should -BeGreaterThan 0
            $errors[0] | Should -Match "missing 'baseTier'"
        }

        It 'Should return error when baseTier is below range' {
            $data = @(
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 0 }
            )
            $errors = @(Test-CharacterData -CharacterArray $data)
            $errors.Count | Should -BeGreaterThan 0
            $errors[0] | Should -Match 'invalid baseTier'
        }

        It 'Should return error when baseTier is above range' {
            $data = @(
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 20 }
            )
            $errors = @(Test-CharacterData -CharacterArray $data)
            $errors.Count | Should -BeGreaterThan 0
            $errors[0] | Should -Match 'invalid baseTier'
        }

        It 'Should return error for duplicate character IDs' {
            $data = @(
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 5 },
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 10 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'Duplicate' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error when characters not alphabetically sorted' {
            $data = @(
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 5 },
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 10 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'alphabetical' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error for invalid omicronEnhancement' {
            $data = @(
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 5; omicronEnhancement = 11 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'omicronEnhancement' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error when synergy set missing both enhancement types' {
            $data = @(
                [PSCustomObject]@{
                    id = 'ALPHA'
                    baseTier = 5
                    synergySets = @(
                        [PSCustomObject]@{
                            characters = @('BRAVO')
                        }
                    )
                },
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 5 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'missing both' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error when synergyEnhancement out of range' {
            $data = @(
                [PSCustomObject]@{
                    id = 'ALPHA'
                    baseTier = 5
                    synergySets = @(
                        [PSCustomObject]@{
                            synergyEnhancement = 15
                            characters = @('BRAVO')
                        }
                    )
                },
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 5 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'invalid synergyEnhancement' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error when synergyEnhancementOmicron out of range' {
            $data = @(
                [PSCustomObject]@{
                    id = 'ALPHA'
                    baseTier = 5
                    synergySets = @(
                        [PSCustomObject]@{
                            synergyEnhancementOmicron = -1
                        }
                    )
                }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'invalid synergyEnhancementOmicron' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error for cross-reference to non-existent character' {
            $data = @(
                [PSCustomObject]@{
                    id = 'ALPHA'
                    baseTier = 5
                    synergySets = @(
                        [PSCustomObject]@{
                            synergyEnhancement = 3
                            characters = @('NONEXISTENT')
                        }
                    )
                }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'non-existent' }).Count | Should -BeGreaterThan 0
        }

        It 'Should return error for invalid numberMatchesRequired' {
            $data = @(
                [PSCustomObject]@{
                    id = 'ALPHA'
                    baseTier = 5
                    synergySets = @(
                        [PSCustomObject]@{
                            synergyEnhancement = 3
                            categoryDefinitions = @(
                                [PSCustomObject]@{
                                    include = @('Sith')
                                    numberMatchesRequired = 5
                                }
                            )
                        }
                    )
                }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 0
            ($errors | Where-Object { $_ -match 'numberMatchesRequired' }).Count | Should -BeGreaterThan 0
        }

        It 'Should accumulate multiple errors' {
            $data = @(
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 0 },
                [PSCustomObject]@{ id = 'ALPHA'; baseTier = 20 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -BeGreaterThan 1
        }

        It 'Should pass valid data with synergy sets' {
            $data = @(
                [PSCustomObject]@{
                    id = 'ALPHA'
                    baseTier = 5
                    synergySets = @(
                        [PSCustomObject]@{
                            synergyEnhancement = 3
                            characters = @('BRAVO')
                            categoryDefinitions = @(
                                [PSCustomObject]@{
                                    include = @('Sith')
                                    numberMatchesRequired = 2
                                }
                            )
                        }
                    )
                },
                [PSCustomObject]@{ id = 'BRAVO'; baseTier = 10 }
            )
            $errors = Test-CharacterData -CharacterArray $data
            $errors.Count | Should -Be 0
        }
    }

    Context 'Get-StaticFilePath' {
        It 'Should return index.html for root path' {
            $result = Get-StaticFilePath -UrlPath '/' -EditorPath 'C:\editor'
            $result | Should -Be 'C:\editor\index.html'
        }

        It 'Should return index.html for empty path' {
            $result = Get-StaticFilePath -UrlPath '' -EditorPath 'C:\editor'
            $result | Should -Be 'C:\editor\index.html'
        }

        It 'Should resolve normal file path' {
            $result = Get-StaticFilePath -UrlPath '/styles.css' -EditorPath 'C:\editor'
            $result | Should -Be 'C:\editor\styles.css'
        }

        It 'Should resolve nested path' {
            $result = Get-StaticFilePath -UrlPath '/sub/file.js' -EditorPath 'C:\editor'
            $result | Should -Be 'C:\editor\sub\file.js'
        }
    }
}
