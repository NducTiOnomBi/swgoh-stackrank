[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string] $XlsSourcePath = "c:\output\characterBaseData.xlsx",
    [Parameter(Mandatory = $false)]
    [string] $CharacterBaseDataPath = "$PSScriptRoot\..\Data\characterBaseData.json",
    [Parameter(Mandatory = $false)]
    [string] $OutputFolderPath = "c:\output"
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $XlsSourcePath)) {
    throw "characterBaseData.xls doesn't exist"
}

if (!(Test-Path $CharacterBaseDataPath)) {
    throw "characterBaseData.json doesn't exist"
}

if (!(Test-Path $OutputFolderPath)) {
    Write-Host "Output folder does not exist, creating..."
    New-Item -Path $OutputFolderPath -ItemType Directory

    if (Test-Path $OutputFolderPath) {
        Write-Host "Folder created..."
    }
}

$characterBaseData = Get-Content $CharacterBaseDataPath | ConvertFrom-Json

$characterBaseDataItems = $characterBaseData.characterBaseData

try {
    $excelObject = New-Object -Com Excel.Application
    $excelObject.Visible = $false

    $workbook = $excelObject.Workbooks.Open($XlsSourcePath)
    $worksheet = $workbook.Worksheets.Item(1)

    $usedColumnsCount = ($worksheet.UsedRange.Columns).count

    $columnValueOffset = 0
    $tierValue = 1

    for ($columnIndex = 1; $columnIndex -le $usedColumnsCount; $columnIndex++) {
        $headerValue = $worksheet.Cells.Item(1, $columnIndex).Value2

        if ([string]::IsNullOrWhitespace($headerValue) -eq $false) {

            if ((($columnIndex - 1) % 3 -eq 0)) {
                $columnValueOffset++
            }
    
            $cellIndex = 2

            while ([string]::IsNullOrWhitespace($worksheet.Cells.Item($cellIndex, $columnIndex).Value2) -eq $false) {
                $cellValue = ($worksheet.Cells.Item($cellIndex, $columnIndex).Value2 -split " ")[0]

                $characterBaseDataItem = $characterBaseDataItems | Where-Object -Property Id -eq $cellValue
                
                if ($characterBaseDataItem) {
                    $characterBaseDataItem.baseTier = $tierValue
                } 
                else {
                    # create new toon
                    $characterBaseDataItems += New-Object PSObject -Property @{id = $cellValue; baseTier = $tierValue}
                }
                
                $cellIndex++
            }
    
            $tierValue++
        }
    }

    # sort all entries
    $characterBaseData.characterBaseData = $characterBaseDataItems | Sort-Object -Property id

    # save json
    $filePath = Join-Path -Path $OutputFolderPath -ChildPath "characterBaseData.json"
    $characterBaseData | ConvertTo-Json -Depth 10 | Out-File $filePath

    Write-Host "Output saved successfully to $filePath!"

}
finally {
    $excelObject.Quit() 
}
