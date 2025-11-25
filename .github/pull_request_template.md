## Description
<!-- Provide a brief description of the changes in this PR -->

### Characters Affected
<!-- List the character(s) added, modified, or removed -->
- 

### Changes Made
<!-- Describe the specific changes: tier adjustments, new synergies, etc. -->
- 

---

## Tier Changes

### Justification
<!-- Explain why these tier changes are appropriate. Consider: -->
<!-- - Meta relevance and current game state -->
<!-- - Comparison to similar characters -->
<!-- - Role in current team compositions -->
<!-- - Recent buffs/nerfs or new character releases -->


---

## Synergy Changes

### Synergy Adjustments
<!-- If synergy sets were added/modified, explain: -->
<!-- - Team composition this synergy supports -->
<!-- - Why the enhancement value is appropriate -->
<!-- - Whether zetas are required and why -->


---

## Validation Checklist

**Local Testing:**
- [ ] Ran `.\Tools\ValidateCharacterData.ps1` successfully
- [ ] Ran `.\Tools\ValidateCharacterData.ps1 -UseExternalValidator` (if ajv-cli installed)
- [ ] All validation checks passed locally

**Data Integrity:**
- [ ] Characters are sorted alphabetically by ID
- [ ] No duplicate character IDs
- [ ] All `baseTier` values are between 1-19
- [ ] All `synergyEnhancement` values are between 0-7
- [ ] JSON formatting uses 2-space indentation
- [ ] File saved with UTF-8 encoding (no BOM)

**Schema Compliance:**
- [ ] All required fields (`id`, `baseTier`) are present
- [ ] Character IDs follow format: uppercase letters/numbers/underscores only
- [ ] Synergy sets include required `synergyEnhancement` field
- [ ] Category definitions include required `include` and `numberMatchesRequired` fields
- [ ] `numberMatchesRequired` values are between 1-5

**Testing (if applicable):**
- [ ] Exported data to Excel using `ReadBaseDataToXLS.ps1`
- [ ] Verified tier placement visually in Excel
- [ ] Checked synergy calculations using `ReadBaseDataSynergyToXLS.ps1`
- [ ] Confirmed balance relative to similar characters

---

## Additional Context
<!-- Any other information reviewers should know -->
<!-- - Known issues or limitations -->
<!-- - Related discussions or data sources -->
<!-- - Future work planned -->


---

## Deployment Notes

After this PR is merged to `main`:
- ✅ Changes will automatically sync to Azure DevOps `dev` branch
- ✅ Dev environment will be built and deployed automatically
- ⚠️ **IMPORTANT**: Validate changes at https://dev-swgoh-stackrank-westus.azurewebsites.net/stackrank before production promotion
- ℹ️ A comment will be posted on this PR with the deployment status and DEV URL
