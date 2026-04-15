# Pester Configuration
# Run with: Invoke-Pester -Configuration (& .\Tests\.pester.ps1)

$config = New-PesterConfiguration

# Test discovery
$config.Run.Path = Join-Path $PSScriptRoot '.'
$config.Run.Exit = $true

# Output
$config.Output.Verbosity = 'Detailed'

# Test results (for CI)
$config.TestResult.Enabled = $true
$config.TestResult.OutputFormat = 'NUnitXml'
$config.TestResult.OutputPath = Join-Path $PSScriptRoot '..\TestResults\testResults.xml'

# Code coverage (disabled by default; enable for local analysis)
$config.CodeCoverage.Enabled = $false
$config.CodeCoverage.Path = @(
    Join-Path $PSScriptRoot '..\Tools\ValidateCharacterData.ps1'
)

return $config
