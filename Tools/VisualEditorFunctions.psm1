<#
.SYNOPSIS
    Shared functions for the SWGOH StackRank Visual Editor server.

.DESCRIPTION
    This module contains business logic extracted from StartVisualEditor.ps1
    for testability. Functions handle content type mapping, URL construction,
    character data extraction, validation, and static file path resolution.
#>

function Get-ContentType {
    <#
    .SYNOPSIS
        Returns the MIME content type for a given file extension.
    .PARAMETER Extension
        The file extension including the leading dot (e.g., ".html").
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string] $Extension
    )

    switch ($Extension) {
        ".html" { "text/html; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        default { "text/plain; charset=utf-8" }
    }
}

function Get-BaseUrl {
    <#
    .SYNOPSIS
        Builds the server base URL based on environment.
    .PARAMETER Port
        The port number the server listens on.
    .PARAMETER IsCodespaces
        Whether running in GitHub Codespaces.
    .PARAMETER CodespaceName
        The CODESPACE_NAME environment variable value.
    .PARAMETER PortForwardingDomain
        The GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN environment variable value.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [int] $Port,

        [Parameter(Mandatory = $false)]
        [bool] $IsCodespaces = $false,

        [Parameter(Mandatory = $false)]
        [string] $CodespaceName,

        [Parameter(Mandatory = $false)]
        [string] $PortForwardingDomain
    )

    if ($IsCodespaces) {
        "https://$CodespaceName-$Port.$PortForwardingDomain"
    }
    else {
        "http://localhost:$Port"
    }
}

function Get-ListenerPrefix {
    <#
    .SYNOPSIS
        Returns the HTTP listener prefix based on environment.
    .PARAMETER Port
        The port number the server listens on.
    .PARAMETER IsCodespaces
        Whether running in GitHub Codespaces.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [int] $Port,

        [Parameter(Mandatory = $false)]
        [bool] $IsCodespaces = $false
    )

    if ($IsCodespaces) {
        "http://+:$Port/"
    }
    else {
        "http://localhost:$Port/"
    }
}

function ConvertTo-CharacterArray {
    <#
    .SYNOPSIS
        Extracts the character array from parsed JSON data.
    .DESCRIPTION
        Handles both wrapped format ({ characterBaseData: [...] })
        and direct array format ([...]).
    .PARAMETER JsonData
        The parsed JSON object (from ConvertFrom-Json).
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [object] $JsonData
    )

    if ($null -eq $JsonData) {
        return $null
    }

    if ($null -ne $JsonData.characterBaseData) {
        # Force to array in case PowerShell unwrapped a single-element array
        return @($JsonData.characterBaseData)
    }
    elseif ($JsonData -is [Array]) {
        return $JsonData
    }
    else {
        return $null
    }
}

function Test-CharacterData {
    <#
    .SYNOPSIS
        Validates an array of character data objects.
    .DESCRIPTION
        Performs comprehensive validation including required fields, tier range,
        duplicate IDs, alphabetical order, enhancement ranges, and cross-references.
        Returns an array of error strings (empty if valid).
    .PARAMETER CharacterArray
        The array of character objects to validate.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [object] $CharacterArray
    )

    $validationErrors = @()

    if ($null -eq $CharacterArray) {
        $validationErrors += "Data is null or empty, or missing 'characterBaseData' property"
        return $validationErrors
    }

    if ($CharacterArray -isnot [Array]) {
        $validationErrors += "Character data must be an array"
        return $validationErrors
    }

    # Build character ID index for cross-reference validation
    $characterIds = @{}
    foreach ($char in $CharacterArray) {
        if (![string]::IsNullOrWhiteSpace($char.id)) {
            $characterIds[$char.id] = $true
        }
    }

    $previousId = ""
    $seenIds = @{}

    foreach ($char in $CharacterArray) {
        $charId = $char.id

        # Check required fields
        if ([string]::IsNullOrWhiteSpace($charId)) {
            $validationErrors += "Character missing 'id' field"
            continue
        }
        if ($null -eq $char.baseTier) {
            $validationErrors += "Character '$charId' missing 'baseTier' field"
            continue
        }

        # Check character ID format (uppercase letters, numbers, underscores only)
        if ($charId -notmatch '^[A-Z0-9_]+$') {
            $validationErrors += "Character '$charId' has invalid ID format (must be uppercase letters, numbers, and underscores only)"
        }

        # Check for duplicates
        if ($seenIds.ContainsKey($charId)) {
            $validationErrors += "Duplicate character ID: $charId"
        }
        $seenIds[$charId] = $true

        # Check alphabetical order
        if ($previousId -ne "" -and $charId -lt $previousId) {
            $validationErrors += "Characters not in alphabetical order: '$previousId' should come after '$charId'"
        }
        $previousId = $charId

        # Check tier range
        if ($char.baseTier -lt 1 -or $char.baseTier -gt 19) {
            $validationErrors += "Character '$charId' has invalid baseTier: $($char.baseTier) (must be 1-19)"
        }

        # Check omicronEnhancement range if present
        if ($null -ne $char.omicronEnhancement) {
            if ($char.omicronEnhancement -lt 0 -or $char.omicronEnhancement -gt 10) {
                $validationErrors += "Character '$charId' has invalid omicronEnhancement: $($char.omicronEnhancement) (must be 0-10)"
            }
        }

        # Validate synergy sets
        if ($null -ne $char.synergySets -and $char.synergySets -is [Array]) {
            $setIndex = 0
            foreach ($synergySet in $char.synergySets) {
                $setIndex++

                # Check that at least one enhancement type exists
                $hasStandard = $null -ne $synergySet.synergyEnhancement
                $hasOmicron = $null -ne $synergySet.synergyEnhancementOmicron

                if (!$hasStandard -and !$hasOmicron) {
                    $validationErrors += "Character '$charId' synergy set #$setIndex missing both synergyEnhancement and synergyEnhancementOmicron"
                }

                # Check enhancement ranges
                if ($hasStandard) {
                    if ($synergySet.synergyEnhancement -lt 0 -or $synergySet.synergyEnhancement -gt 10) {
                        $validationErrors += "Character '$charId' synergy set #$setIndex has invalid synergyEnhancement: $($synergySet.synergyEnhancement) (must be 0-10)"
                    }
                }
                if ($hasOmicron) {
                    if ($synergySet.synergyEnhancementOmicron -lt 0 -or $synergySet.synergyEnhancementOmicron -gt 10) {
                        $validationErrors += "Character '$charId' synergy set #$setIndex has invalid synergyEnhancementOmicron: $($synergySet.synergyEnhancementOmicron) (must be 0-10)"
                    }
                }

                # Check character cross-references
                if ($null -ne $synergySet.characters -and $synergySet.characters -is [Array]) {
                    foreach ($refCharId in $synergySet.characters) {
                        if (!$characterIds.ContainsKey($refCharId)) {
                            $validationErrors += "Character '$charId' synergy set #$setIndex references non-existent character: $refCharId"
                        }
                    }
                }

                # Check skipIfPresentCharacters cross-references
                if ($null -ne $synergySet.skipIfPresentCharacters -and $synergySet.skipIfPresentCharacters -is [Array]) {
                    foreach ($refCharId in $synergySet.skipIfPresentCharacters) {
                        if (!$characterIds.ContainsKey($refCharId)) {
                            $validationErrors += "Character '$charId' synergy set #$setIndex skipIfPresentCharacters references non-existent character: $refCharId"
                        }
                    }
                }

                # Check numberMatchesRequired range
                if ($null -ne $synergySet.categoryDefinitions -and $synergySet.categoryDefinitions -is [Array]) {
                    $catIndex = 0
                    foreach ($catDef in $synergySet.categoryDefinitions) {
                        $catIndex++
                        if ($null -ne $catDef.numberMatchesRequired) {
                            if ($catDef.numberMatchesRequired -lt 1 -or $catDef.numberMatchesRequired -gt 4) {
                                $validationErrors += "Character '$charId' synergy set #$setIndex category #$catIndex has invalid numberMatchesRequired: $($catDef.numberMatchesRequired) (must be 1-4)"
                            }
                        }
                    }
                }

                # Check synergy slot limit: characters + sum(numberMatchesRequired) <= 4
                $charSlots = 0
                if ($null -ne $synergySet.characters -and $synergySet.characters -is [Array]) {
                    $charSlots = $synergySet.characters.Count
                }
                $categorySlots = 0
                if ($null -ne $synergySet.categoryDefinitions -and $synergySet.categoryDefinitions -is [Array]) {
                    foreach ($catDef in $synergySet.categoryDefinitions) {
                        if ($null -ne $catDef.numberMatchesRequired) {
                            $categorySlots += $catDef.numberMatchesRequired
                        }
                    }
                }
                $totalSlots = $charSlots + $categorySlots
                if ($totalSlots -gt 4) {
                    $validationErrors += "Character '$charId' synergy set #$setIndex exceeds 4-slot limit: $charSlots character(s) + $categorySlots category match(es) = $totalSlots"
                }
            }
        }
    }

    return $validationErrors
}

function Get-StaticFilePath {
    <#
    .SYNOPSIS
        Resolves a URL path to a filesystem path within the editor directory.
    .PARAMETER UrlPath
        The URL path from the HTTP request (e.g., "/" or "/styles.css").
    .PARAMETER EditorPath
        The base filesystem path of the visual editor directory.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string] $UrlPath,

        [Parameter(Mandatory)]
        [string] $EditorPath
    )

    if ($UrlPath -eq "/" -or $UrlPath -eq "") {
        Join-Path $EditorPath "index.html"
    }
    else {
        Join-Path $EditorPath $UrlPath.TrimStart('/')
    }
}

Export-ModuleMember -Function @(
    'Get-ContentType',
    'Get-BaseUrl',
    'Get-ListenerPrefix',
    'ConvertTo-CharacterArray',
    'Test-CharacterData',
    'Get-StaticFilePath'
)
