<#
.SYNOPSIS
    Starts a local HTTP server for the SWGOH StackRank Visual Editor

.DESCRIPTION
    This script starts a PowerShell-based HTTP server that serves the visual editor
    interface and provides REST API endpoints for loading, saving, and validating
    character data. It automatically detects GitHub Codespaces and adjusts URLs
    accordingly.

.PARAMETER Port
    The port number to listen on. Default is 8080.

.EXAMPLE
    PS> .\StartVisualEditor.ps1
    Starts the server on port 8080 and opens the browser

.EXAMPLE
    PS> .\StartVisualEditor.ps1 -Port 3000
    Starts the server on port 3000
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [int] $Port = 8080
)

$ErrorActionPreference = 'Stop'

# Determine script root and data paths
$scriptRoot = Split-Path -Parent $PSScriptRoot
$dataFilePath = Join-Path $scriptRoot "Data\characterBaseData.json"
$schemaFilePath = Join-Path $scriptRoot "Data\characterBaseData.schema.json"
$editorPath = Join-Path $PSScriptRoot "VisualEditor"

# Verify required files exist
if (!(Test-Path $dataFilePath)) {
    throw "Character data file not found: $dataFilePath"
}
if (!(Test-Path $schemaFilePath)) {
    throw "Schema file not found: $schemaFilePath"
}
if (!(Test-Path $editorPath)) {
    throw "Visual editor directory not found: $editorPath"
}

# Detect GitHub Codespaces environment
$isCodespaces = $null -ne $env:CODESPACES
$baseUrl = if ($isCodespaces) {
    "https://$env:CODESPACE_NAME-$Port.$env:GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"
}
else {
    "http://localhost:$Port"
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SWGOH StackRank Visual Editor Server" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment: " -NoNewline
Write-Host $(if ($isCodespaces) { "GitHub Codespaces" } else { "Local" }) -ForegroundColor Yellow
Write-Host "Server URL:  " -NoNewline
Write-Host $baseUrl -ForegroundColor Green
Write-Host "Data File:   " -NoNewline
Write-Host $dataFilePath -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Create HTTP listener
$listener = New-Object System.Net.HttpListener
$listenerPrefix = if ($isCodespaces) {
    "http://+:$Port/"  # Codespaces requires wildcard binding for port forwarding
}
else {
    "http://localhost:$Port/"  # Local development avoids admin privileges
}
$listener.Prefixes.Add($listenerPrefix)

try {
    $listener.Start()
    Write-Host "Server started successfully on port $Port" -ForegroundColor Green
    Write-Host ""

    # Open browser automatically (not in Codespaces, as it forwards automatically)
    if (!$isCodespaces) {
        Start-Process $baseUrl
    }

    # Main server loop
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $path = $request.Url.LocalPath
            $method = $request.HttpMethod

            Write-Host "$(Get-Date -Format 'HH:mm:ss') $method $path" -ForegroundColor Gray

            # CORS headers for development
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

            # Handle OPTIONS preflight
            if ($method -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }

            # API: Load character data
            if ($method -eq "GET" -and $path -eq "/api/data") {
                $data = Get-Content $dataFilePath -Raw -Encoding UTF8
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($data)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            # API: Save character data
            elseif ($method -eq "POST" -and $path -eq "/api/data") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
                $body = $reader.ReadToEnd()
                $reader.Close()

                # Validate JSON syntax
                try {
                    $jsonData = $body | ConvertFrom-Json
                }
                catch {
                    $errorMsg = @{ error = "Invalid JSON syntax: $($_.Exception.Message)" } | ConvertTo-Json
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buffer.Length
                    $response.StatusCode = 400
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.Close()
                    continue
                }

                # Extract character array (handle both wrapped and direct array formats)
                $characterArray = if ($jsonData.characterBaseData) {
                    $jsonData.characterBaseData
                }
                elseif ($jsonData -is [Array]) {
                    $jsonData
                }
                else {
                    $null
                }

                # Basic validation: check for required fields
                $validationErrors = @()
                if ($null -eq $characterArray) {
                    $validationErrors += "Data is null or empty, or missing 'characterBaseData' property"
                }
                elseif ($characterArray -isnot [Array]) {
                    $validationErrors += "Character data must be an array"
                }
                else {
                    foreach ($char in $characterArray) {
                        if ([string]::IsNullOrWhiteSpace($char.id)) {
                            $validationErrors += "Character missing 'id' field"
                            break
                        }
                        if ($null -eq $char.baseTier) {
                            $validationErrors += "Character '$($char.id)' missing 'baseTier' field"
                            break
                        }
                        if ($char.baseTier -lt 1 -or $char.baseTier -gt 19) {
                            $validationErrors += "Character '$($char.id)' has invalid baseTier: $($char.baseTier) (must be 1-19)"
                            break
                        }
                    }
                }

                if ($validationErrors.Count -gt 0) {
                    $errorMsg = @{ error = "Validation failed"; details = $validationErrors } | ConvertTo-Json
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buffer.Length
                    $response.StatusCode = 400
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.Close()
                    continue
                }

                # Save to file (UTF-8 without BOM)
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($dataFilePath, $body, $utf8NoBom)
                Write-Host "  Data saved successfully (UTF-8 without BOM)" -ForegroundColor Green

                $successMsg = @{ success = $true; message = "Data saved successfully" } | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($successMsg)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            # API: Validate character data without saving
            elseif ($method -eq "POST" -and $path -eq "/api/validate") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
                $body = $reader.ReadToEnd()
                $reader.Close()

                # Validate JSON syntax
                try {
                    $jsonData = $body | ConvertFrom-Json
                }
                catch {
                    $errorMsg = @{ valid = $false; errors = @("Invalid JSON syntax: $($_.Exception.Message)") } | ConvertTo-Json
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buffer.Length
                    $response.StatusCode = 200
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.Close()
                    continue
                }

                # Extract character array (handle both wrapped and direct array formats)
                $characterArray = if ($jsonData.characterBaseData) {
                    $jsonData.characterBaseData
                }
                elseif ($jsonData -is [Array]) {
                    $jsonData
                }
                else {
                    $null
                }

                # Perform validation checks
                $validationErrors = @()

                # Check if data is array
                if ($null -eq $characterArray) {
                    $validationErrors += "Data is null or empty, or missing 'characterBaseData' property"
                }
                elseif ($characterArray -isnot [Array]) {
                    $validationErrors += "Character data must be an array"
                }
                else {
                    # Build character ID index for cross-reference validation
                    $characterIds = @{}
                    foreach ($char in $characterArray) {
                        if (![string]::IsNullOrWhiteSpace($char.id)) {
                            $characterIds[$char.id] = $true
                        }
                    }

                    # Validate each character
                    $previousId = ""
                    $seenIds = @{}
                    
                    foreach ($char in $characterArray) {
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
                            }
                        }
                    }
                }

                # Return validation results
                $result = if ($validationErrors.Count -eq 0) {
                    @{ valid = $true; errors = @() }
                }
                else {
                    @{ valid = $false; errors = $validationErrors }
                }

                $resultJson = $result | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($resultJson)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            # Serve static files
            else {
                $filePath = if ($path -eq "/" -or $path -eq "") {
                    Join-Path $editorPath "index.html"
                }
                else {
                    Join-Path $editorPath $path.TrimStart('/')
                }

                if (Test-Path $filePath) {
                    $content = Get-Content $filePath -Raw -Encoding UTF8
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)

                    # Set content type based on file extension
                    $contentType = switch ([System.IO.Path]::GetExtension($filePath)) {
                        ".html" { "text/html; charset=utf-8" }
                        ".js" { "application/javascript; charset=utf-8" }
                        ".css" { "text/css; charset=utf-8" }
                        ".json" { "application/json; charset=utf-8" }
                        default { "text/plain; charset=utf-8" }
                    }

                    $response.ContentType = $contentType
                    $response.ContentLength64 = $buffer.Length
                    $response.StatusCode = 200
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                }
                else {
                    $errorMsg = "404 Not Found: $path"
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                    $response.ContentType = "text/plain; charset=utf-8"
                    $response.ContentLength64 = $buffer.Length
                    $response.StatusCode = 404
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                }
            }
        }
        catch {
            Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
            
            try {
                $errorMsg = @{ error = $_.Exception.Message } | ConvertTo-Json
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buffer.Length
                $response.StatusCode = 500
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            }
            catch {
                # If we can't send error response, just continue
            }
        }
        finally {
            try {
                $response.Close()
            }
            catch {
                # Ignore close errors
            }
        }
    }
}
catch {
    Write-Host ""
    Write-Host "ERROR: Failed to start server" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    if ($listener.IsListening) {
        $listener.Stop()
        Write-Host ""
        Write-Host "Server stopped" -ForegroundColor Yellow
    }
    $listener.Close()
}
