# SWGOH Stack Rank Tools Documentation

## About

The purpose of these tools are to manage the [characterBaseData.json](../Data/characterBaseData.json) file values.

When the characterBaseData is converted into an Excel file, the data will be formatted to validate character tiering. specifically how the characters will be sorted into tiers. This sorting does not take into account any player specifics, so all sorting is done based on best case scenario.

There are two types of tiered Excel output, the default which ignores all synergy bonuses, and the synergy based output. The synergy based will sort all characters like the defalt, but will take into account the best synergy optimizations for every character. The synergy based output is intended to validate synergy optimization balance.

Both of these outputs work together, specifcially when optimizing for a specific ranking position.

## Requirements
- PowerShell
- Microsoft Excel

## The Tools

### ReadBaseDataToXLS.ps1

The ReadBaseDataToXLS.ps1 PowerShell script will read the characterBaseData.json file into an Excel (XLS) format for visual validation of the default tier sorting.

#### Parameters
- CharacterBaseDataPath
    > optional    
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- OutputFolderPath
    > optional    
    > default value="c:\output"

#### Usage

`PS C:\<path to repo>\swgoh-stackrank\Tools> .\ReadBaseDataToXLS.ps1`
##### Output
`Output saved successfully to c:\output\characterBaseData.xlsx!`

### ReadBaseDataSynergyToXLS.ps1

The ReadBaseDataSynergyToXLS.ps1 PowerShell script will read the characterBaseData.json file into an Excel (XLS) format for visual validation of the default tier sorting.

#### Parameters
- CharacterBaseDataPath
    > optional    
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- OutputFolderPath
    > optional    
    > default value="c:\output"

#### Usage

`PS C:\<path to repo>\swgoh-stackrank\Tools> .\ReadBaseDataSynergyToXLS.ps1`
##### Output
`Output saved successfully to c:\output\characterBaseDataMaxSynergy.xlsx!`

### ReadXLSBaseDataJson.ps1

The ReadBaseDataToXLS.ps1 PowerShell script will read the characterBaseData.xlsx file and update the baseTier values in the characterBaseData.json based upon any tier changes made within this file.

This is useful for adding new characters or updating existing characters.

#### Parameters
- XlsSourcePath
    > optional    
    > default value="c:\output\characterBaseData.xlsx"

- CharacterBaseDataPath
    > optional    
    > default value="$PSScriptRoot\..\Data\characterBaseData.json"

- OutputFolderPath
    > optional    
    > default value="c:\output"

#### Usage

`PS C:\<path to repo>\swgoh-stackrank\Tools> .\ReadXLStoBaseDataJson.ps1`
##### Output
`Output saved successfully to c:\output\characterBaseData.json!`