[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string] $CharacterBaseDataPath = "$PSScriptRoot\..\Data\characterBaseData.json",
    [Parameter(Mandatory = $false)]
    [string] $OutputFolderPath = "c:\output"  
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $CharacterBaseDataPath)) {
    throw "characterBaseData.json doesn't exist ($CharacterBaseDataPath)"
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

function Get-MaxTier{
    param (
        $characterDataItem
    )

    if ($characterDataItem.synergySets) {
        $maxSynergyEnhancement = 0

        foreach ($synergySet in $characterDataItem.synergySets) {
            $tempMaxSynergyEnhancement = $synergySet.synergyEnhancement

            if ($tempMaxSynergyEnhancement -gt $maxSynergyEnhancement) {
                $maxSynergyEnhancement = $tempMaxSynergyEnhancement
            }
        }

        return $characterDataItem.baseTier - $maxSynergyEnhancement
    } else {
        return $characterDataItem.baseTier
    }
}

try {
    $excelObject = New-Object -Com Excel.Application
    $excelObject.Visible = $false
    
    $workbook = $excelObject.Workbooks.Add()
    $worksheet = $workbook.Worksheets.Item(1)

    $maxTier = 19
    $tierColumnOffset = 0

    foreach($characterBaseDataItem in $characterBaseDataItems) {
        ##$characterBaseDataItem.baseTier = Get-MaxTier $characterBaseDataItem
        $characterBaseDataItem | Add-Member -MemberType NoteProperty -Name "finalTier" -Value (Get-MaxTier $characterBaseDataItem)
    }

    $characterBaseDataItems = $characterBaseDataItems | Sort-Object -Property finalTier

    for ($tier = 1; $tier -le $maxTier; $tier++)
    {
        if (($tier -gt 1) -and (($tier - 1) % 3 -eq 0)) {
            $tierColumnOffset++
        }

        $tierColumn = $tier + $tierColumnOffset

        # Write-Output "Tier: $tier"
        # Write-Output "Tier Column Offset: $tierColumnOffset"
        # Write-Output "Tier Column: $tierColumn"

        ## create tier header
        $worksheet.Cells.Item(1, $tierColumn) = "$tier"

        ## select all toons within the tier
        $charactersInTier = $characterBaseDataItems | Where-Object finalTier -eq $tier | Sort-Object -Property baseTier, Id

        $row = 2

        foreach ($character in $charactersInTier) {
            $worksheet.Cells.Item($row, $tierColumn) = $character.id
            $row++
        }
    }

    $excelOutputFilename = Join-Path -Path $OutputFolderPath -ChildPath "characterBaseDataMaxSynergy.xlsx"

    $workbook.SaveAs($excelOutputFilename)

    Write-Host "Output saved successfully to $excelOutputFilename!"
}
finally {
    $excelObject.Quit() 
}
