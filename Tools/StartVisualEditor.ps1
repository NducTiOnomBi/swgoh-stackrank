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

Import-Module (Join-Path $PSScriptRoot "VisualEditorFunctions.psm1") -Force

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
$baseUrl = Get-BaseUrl -Port $Port -IsCodespaces $isCodespaces -CodespaceName $env:CODESPACE_NAME -PortForwardingDomain $env:GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN

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
$listenerPrefix = Get-ListenerPrefix -Port $Port -IsCodespaces $isCodespaces
$listener.Prefixes.Add($listenerPrefix)

try {
    $listener.Start()
    Write-Host "Server started successfully on port $Port" -ForegroundColor Green
    Write-Host ""

    # Open browser automatically (not in Codespaces, as it forwards automatically)
    if (!$isCodespaces) {
        Start-Process $baseUrl
    }

    # Main server loop — use async GetContext so Ctrl+C can interrupt
    while ($listener.IsListening) {
        $contextTask = $listener.GetContextAsync()

        # Poll until a request arrives; short wait lets Ctrl+C interrupt between iterations
        while (-not $contextTask.AsyncWaitHandle.WaitOne(500)) { }

        $context = $contextTask.GetAwaiter().GetResult()
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

                # Extract character array and validate
                $characterArray = ConvertTo-CharacterArray -JsonData $jsonData

                $validationErrors = Test-CharacterData -CharacterArray $characterArray

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

                # Extract character array and validate
                $characterArray = ConvertTo-CharacterArray -JsonData $jsonData
                $validationErrors = Test-CharacterData -CharacterArray $characterArray

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
                $filePath = Get-StaticFilePath -UrlPath $path -EditorPath $editorPath

                if (Test-Path $filePath) {
                    $content = Get-Content $filePath -Raw -Encoding UTF8
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($content)

                    $contentType = Get-ContentType -Extension ([System.IO.Path]::GetExtension($filePath))

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
catch [System.Net.HttpListenerException] {
    # Expected when listener is stopped during Ctrl+C shutdown
}
catch [System.OperationCanceledException] {
    # Expected when async operation is cancelled during shutdown
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
    }
    $listener.Close()
    Write-Host ""
    Write-Host "Server stopped" -ForegroundColor Yellow
}
