// ============================================
// Application State
// ============================================
let characterData = [];
let selectedCharacter = null;
let includeSynergy = false;
let includeOmicron = false;
let hasUnsavedChanges = false;

// Draft state for staging character edits before committing
let currentDraft = null;
let currentDraftBaseline = null; // Snapshot for dirty detection
let draftIsDirty = false; // Cached dirty state

// Category tag autocomplete cache
let categoryTags = []; // All unique tags from character.categories and categoryDefinitions

// Sidebar collapse state
let isLeftSidebarCollapsed = true;  // Start collapsed
let isRightSidebarCollapsed = true; // Start collapsed

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize event listeners
    initializeEventListeners();

    // Load character data from server
    await loadCharacterData();
});

function initializeEventListeners() {
    // Header actions
    document.getElementById('btnAddCharacter').addEventListener('click', addNewCharacter);
    document.getElementById('btnValidate').addEventListener('click', validateData);
    document.getElementById('btnExport').addEventListener('click', exportData);
    document.getElementById('btnSave').addEventListener('click', saveData);

    // Sidebar toggle buttons
    document.getElementById('toggleLeftSidebar').addEventListener('click', toggleLeftSidebar);
    document.getElementById('toggleRightSidebar').addEventListener('click', toggleRightSidebar);

    // View controls
    document.getElementById('chkIncludeSynergy').addEventListener('change', (e) => {
        includeSynergy = e.target.checked;
        renderTierGrid();
    });

    document.getElementById('chkIncludeOmicron').addEventListener('change', (e) => {
        includeOmicron = e.target.checked;
        renderTierGrid();
    });

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Click outside to close all dropdowns (character, exclusion, and tag)
    document.addEventListener('click', (e) => {
        const isCharacterInput = e.target.closest('.character-input');
        const isCharacterDropdown = e.target.closest('.character-dropdown');
        const isExclusionInput = e.target.closest('.exclusion-input');
        const isExclusionDropdown = e.target.closest('[id^="exclDropdown_"]');
        const isTagInput = e.target.closest('.tag-input');
        const isTagDropdown = e.target.closest('[id^="tag-dropdown_"]');

        if (!isCharacterInput && !isCharacterDropdown && !isExclusionInput && !isExclusionDropdown && !isTagInput && !isTagDropdown) {
            hideAllDropdowns();
        }
    });

    // Click on empty area in tier grid to deselect current character
    document.getElementById('tierGrid').addEventListener('click', (e) => {
        // Only deselect if clicking empty space (not a character card)
        if (!e.target.closest('.character-card') && selectedCharacter) {
            clearCharacterSelection();
        }
    });

    // Delegate input events for character dropdowns
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('character-input')) {
            const match = e.target.id.match(/charInput_(\d+)_(\d+)/);
            if (match) {
                const synergyIndex = parseInt(match[1]);
                const charIndex = parseInt(match[2]);
                showCharacterDropdown(e.target, synergyIndex, charIndex);
            }
        }
        // Exclusion input events
        if (e.target.classList.contains('exclusion-input')) {
            const match = e.target.id.match(/exclInput_(\d+)_(\d+)/);
            if (match) {
                const synergyIndex = parseInt(match[1]);
                const exclIndex = parseInt(match[2]);
                showExclusionDropdown(e.target, synergyIndex, exclIndex);
            }
        }
        // Tag input events
        if (e.target.classList.contains('tag-input')) {
            const synergyIndex = parseInt(e.target.dataset.synergyIndex);
            const catIndex = parseInt(e.target.dataset.catIndex);
            const field = e.target.dataset.field;
            if (!isNaN(synergyIndex) && !isNaN(catIndex) && field) {
                showTagDropdown(e.target, synergyIndex, catIndex, field);
            }
        }
    });

    // Delegate keydown events for character and tag dropdowns
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('character-input')) {
            const match = e.target.id.match(/charInput_(\d+)_(\d+)/);
            if (match) {
                const synergyIndex = parseInt(match[1]);
                const charIndex = parseInt(match[2]);
                handleCharacterInputKeydown(e, e.target, synergyIndex, charIndex);
            }
        }
        // Exclusion input keydown
        if (e.target.classList.contains('exclusion-input')) {
            const match = e.target.id.match(/exclInput_(\d+)_(\d+)/);
            if (match) {
                const synergyIndex = parseInt(match[1]);
                const exclIndex = parseInt(match[2]);
                handleExclusionInputKeydown(e, e.target, synergyIndex, exclIndex);
            }
        }
        // Tag input keydown
        if (e.target.classList.contains('tag-input')) {
            const synergyIndex = parseInt(e.target.dataset.synergyIndex);
            const catIndex = parseInt(e.target.dataset.catIndex);
            const field = e.target.dataset.field;
            if (!isNaN(synergyIndex) && !isNaN(catIndex) && field) {
                handleTagInputKeydown(e, e.target, synergyIndex, catIndex, field);
            }
        }
    });

    // Delegate focus events to show dropdowns
    document.addEventListener('focus', (e) => {
        if (e.target.classList.contains('character-input')) {
            const match = e.target.id.match(/charInput_(\d+)_(\d+)/);
            if (match) {
                const synergyIndex = parseInt(match[1]);
                const charIndex = parseInt(match[2]);
                showCharacterDropdown(e.target, synergyIndex, charIndex);
            }
        }
        // Exclusion input focus
        if (e.target.classList.contains('exclusion-input')) {
            const match = e.target.id.match(/exclInput_(\d+)_(\d+)/);
            if (match) {
                const synergyIndex = parseInt(match[1]);
                const exclIndex = parseInt(match[2]);
                showExclusionDropdown(e.target, synergyIndex, exclIndex);
            }
        }
        // Tag input focus
        if (e.target.classList.contains('tag-input')) {
            const synergyIndex = parseInt(e.target.dataset.synergyIndex);
            const catIndex = parseInt(e.target.dataset.catIndex);
            const field = e.target.dataset.field;
            if (!isNaN(synergyIndex) && !isNaN(catIndex) && field) {
                showTagDropdown(e.target, synergyIndex, catIndex, field);
            }
        }
    }, true);
}

// ============================================
// Data Loading and Saving
// ============================================
async function loadCharacterData() {
    try {
        showLoading(true);
        updateStatus('Loading character data...');

        const response = await fetch('/api/data');
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.statusText}`);
        }

        const data = await response.json();

        // Handle both formats: direct array or wrapped in characterBaseData
        characterData = data.characterBaseData || data;

        updateStatus(`Loaded ${characterData.length} characters`);
        updateCharacterCount();
        renderTierGrid();

        hasUnsavedChanges = false;
        updateSaveButtonState();
        buildCategoryTagIndex();
    } catch (error) {
        console.error('Error loading data:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        alert(`Failed to load character data: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function buildCategoryTagIndex() {
    const tagMap = new Map(); // Use Map to preserve original casing, keyed by lowercase

    characterData.forEach(char => {
        // Collect from character.categories
        if (char.categories && Array.isArray(char.categories)) {
            char.categories.forEach(tag => {
                if (tag && typeof tag === 'string') {
                    const lowerTag = tag.toLowerCase();
                    if (!tagMap.has(lowerTag)) {
                        tagMap.set(lowerTag, tag); // Preserve first occurrence's casing
                    }
                }
            });
        }

        // Collect from synergySets categoryDefinitions
        if (char.synergySets && Array.isArray(char.synergySets)) {
            char.synergySets.forEach(synergySet => {
                if (synergySet.categoryDefinitions && Array.isArray(synergySet.categoryDefinitions)) {
                    synergySet.categoryDefinitions.forEach(catDef => {
                        // Include tags
                        if (catDef.include && Array.isArray(catDef.include)) {
                            catDef.include.forEach(tag => {
                                if (tag && typeof tag === 'string') {
                                    const lowerTag = tag.toLowerCase();
                                    if (!tagMap.has(lowerTag)) {
                                        tagMap.set(lowerTag, tag);
                                    }
                                }
                            });
                        }
                        // Exclude tags
                        if (catDef.exclude && Array.isArray(catDef.exclude)) {
                            catDef.exclude.forEach(tag => {
                                if (tag && typeof tag === 'string') {
                                    const lowerTag = tag.toLowerCase();
                                    if (!tagMap.has(lowerTag)) {
                                        tagMap.set(lowerTag, tag);
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
    });

    // Convert to sorted array for display
    categoryTags = Array.from(tagMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function saveData() {
    try {
        updateStatus('Saving changes...');

        // Sort characters alphabetically before saving
        characterData.sort((a, b) => a.id.localeCompare(b.id));

        // Wrap in characterBaseData structure
        const dataToSave = {
            characterBaseData: characterData
        };

        const response = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSave, null, 2)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to save data');
        }

        updateStatus('Changes saved successfully', 'success');
        hasUnsavedChanges = false;
        updateSaveButtonState();

        // Re-render to reflect sorting
        renderTierGrid();
    } catch (error) {
        console.error('Error saving data:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        alert(`Failed to save changes: ${error.message}`);
    }
}

async function validateData() {
    try {
        updateStatus('Validating data...');

        // Wrap in characterBaseData structure
        const dataToValidate = {
            characterBaseData: characterData
        };

        const response = await fetch('/api/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToValidate, null, 2)
        });

        const result = await response.json();

        if (result.valid) {
            updateStatus('Validation passed', 'success');
            updateValidationStatus('✓ Valid');
            showValidationResults(true, []);
        } else {
            updateStatus(`Validation failed: ${result.errors.length} error(s)`, 'error');
            updateValidationStatus('✗ Invalid');
            showValidationResults(false, result.errors);
        }
    } catch (error) {
        console.error('Error validating data:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        alert(`Failed to validate data: ${error.message}`);
    }
}

function exportData() {
    try {
        // Sort characters alphabetically before export
        characterData.sort((a, b) => a.id.localeCompare(b.id));

        // Wrap in characterBaseData structure
        const dataToExport = {
            characterBaseData: characterData
        };

        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'characterBaseData.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus('Data exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        updateStatus(`Error: ${error.message}`, 'error');
        alert(`Failed to export data: ${error.message}`);
    }
}

// ============================================
// Draft Management
// ============================================
function deepEqualDrafts(draft1, draft2) {
    if (draft1 === draft2) return true;
    if (!draft1 || !draft2) return false;

    // Compare primitives
    if (draft1.baseTier !== draft2.baseTier) return false;
    if (draft1.omicronEnhancement !== draft2.omicronEnhancement) return false;
    if (draft1.requiresAllZetas !== draft2.requiresAllZetas) return false;
    if (draft1.requiresAllOmicrons !== draft2.requiresAllOmicrons) return false;

    // Compare ignoreRequirements objects
    const ir1 = draft1.ignoreRequirements;
    const ir2 = draft2.ignoreRequirements;
    if ((ir1?.gear || false) !== (ir2?.gear || false)) return false;
    if ((ir1?.rarity || false) !== (ir2?.rarity || false)) return false;

    // Compare ignoreSynergyRequirements objects
    const isr1 = draft1.ignoreSynergyRequirements;
    const isr2 = draft2.ignoreSynergyRequirements;
    if ((isr1?.gear || false) !== (isr2?.gear || false)) return false;
    if ((isr1?.rarity || false) !== (isr2?.rarity || false)) return false;

    // Compare requiredZetas arrays
    const rz1 = draft1.requiredZetas;
    const rz2 = draft2.requiredZetas;
    if ((rz1 === undefined) !== (rz2 === undefined)) return false;
    if (rz1 && rz2) {
        if (rz1.length !== rz2.length) return false;
        for (let i = 0; i < rz1.length; i++) {
            if (rz1[i] !== rz2[i]) return false;
        }
    }

    // Compare requiredOmicrons arrays
    const ro1 = draft1.requiredOmicrons;
    const ro2 = draft2.requiredOmicrons;
    if ((ro1 === undefined) !== (ro2 === undefined)) return false;
    if (ro1 && ro2) {
        if (ro1.length !== ro2.length) return false;
        for (let i = 0; i < ro1.length; i++) {
            if (ro1[i] !== ro2[i]) return false;
        }
    }

    // Compare synergySets arrays (deep nested structure)
    const ss1 = draft1.synergySets;
    const ss2 = draft2.synergySets;
    if ((ss1 === undefined) !== (ss2 === undefined)) return false;
    if (ss1 && ss2) {
        if (ss1.length !== ss2.length) return false;
        for (let i = 0; i < ss1.length; i++) {
            const set1 = ss1[i];
            const set2 = ss2[i];

            if (set1.synergyEnhancement !== set2.synergyEnhancement) return false;
            if (set1.synergyEnhancementOmicron !== set2.synergyEnhancementOmicron) return false;

            // Compare characters arrays
            const c1 = set1.characters;
            const c2 = set2.characters;
            if ((c1 === undefined) !== (c2 === undefined)) return false;
            if (c1 && c2) {
                if (c1.length !== c2.length) return false;
                for (let j = 0; j < c1.length; j++) {
                    if (c1[j] !== c2[j]) return false;
                }
            }

            // Compare categoryDefinitions arrays
            const cd1 = set1.categoryDefinitions;
            const cd2 = set2.categoryDefinitions;
            if ((cd1 === undefined) !== (cd2 === undefined)) return false;
            if (cd1 && cd2) {
                if (cd1.length !== cd2.length) return false;
                for (let j = 0; j < cd1.length; j++) {
                    const catDef1 = cd1[j];
                    const catDef2 = cd2[j];

                    if (catDef1.numberMatchesRequired !== catDef2.numberMatchesRequired) return false;

                    // Compare include arrays
                    const inc1 = catDef1.include;
                    const inc2 = catDef2.include;
                    if ((inc1 === undefined) !== (inc2 === undefined)) return false;
                    if (inc1 && inc2) {
                        if (inc1.length !== inc2.length) return false;
                        for (let k = 0; k < inc1.length; k++) {
                            if (inc1[k] !== inc2[k]) return false;
                        }
                    }

                    // Compare exclude arrays
                    const exc1 = catDef1.exclude;
                    const exc2 = catDef2.exclude;
                    if ((exc1 === undefined) !== (exc2 === undefined)) return false;
                    if (exc1 && exc2) {
                        if (exc1.length !== exc2.length) return false;
                        for (let k = 0; k < exc1.length; k++) {
                            if (exc1[k] !== exc2[k]) return false;
                        }
                    }
                }
            }

            // Compare skipIfPresentCharacters arrays
            const excChar1 = set1.skipIfPresentCharacters;
            const excChar2 = set2.skipIfPresentCharacters;
            if ((excChar1 === undefined) !== (excChar2 === undefined)) return false;
            if (excChar1 && excChar2) {
                if (excChar1.length !== excChar2.length) return false;
                for (let j = 0; j < excChar1.length; j++) {
                    if (excChar1[j] !== excChar2[j]) return false;
                }
            }
        }
    }

    return true;
}

function refreshDraftDirtyState() {
    if (!currentDraft || !currentDraftBaseline) {
        draftIsDirty = false;
    } else {
        draftIsDirty = !deepEqualDrafts(currentDraft, currentDraftBaseline);
    }
    updateSaveButtonState();
}

function hasDraftChanges() {
    return draftIsDirty;
}

function resetDraft() {
    currentDraft = null;
    currentDraftBaseline = null;
    draftIsDirty = false;
    updateSaveButtonState();
}

function confirmDiscardDrafts() {
    if (!hasDraftChanges()) {
        return true;
    }

    return confirm('You have unsaved detail changes that will be lost. Do you want to continue?');
}

function initializeDraft(character) {
    // Deep clone helper for nested arrays
    const deepCloneSynergySets = (sets) => {
        if (!sets) return undefined;
        return sets.map(set => ({
            ...set,
            characters: set.characters ? [...set.characters] : undefined,
            skipIfPresentCharacters: set.skipIfPresentCharacters ? [...set.skipIfPresentCharacters] : undefined,
            categoryDefinitions: set.categoryDefinitions ? set.categoryDefinitions.map(catDef => ({
                ...catDef,
                include: catDef.include ? [...catDef.include] : undefined,
                exclude: catDef.exclude ? [...catDef.exclude] : undefined
            })) : undefined
        }));
    };

    const draftSnapshot = {
        characterId: character.id,
        baseTier: character.baseTier,
        omicronEnhancement: character.omicronEnhancement,
        ignoreRequirements: character.ignoreRequirements ? { ...character.ignoreRequirements } : undefined,
        ignoreSynergyRequirements: character.ignoreSynergyRequirements ? { ...character.ignoreSynergyRequirements } : undefined,
        // Clone zeta/omicron requirements arrays (mirror character structure)
        requiredZetas: character.requiredZetas !== undefined ? [...character.requiredZetas] : undefined,
        requiresAllZetas: character.requiresAllZetas,
        requiredOmicrons: character.requiredOmicrons !== undefined ? [...character.requiredOmicrons] : undefined,
        requiresAllOmicrons: character.requiresAllOmicrons,
        // Deep clone synergy sets with nested arrays
        synergySets: deepCloneSynergySets(character.synergySets)
    };

    // Create both draft and baseline from the same snapshot structure
    currentDraft = JSON.parse(JSON.stringify(draftSnapshot));
    currentDraftBaseline = JSON.parse(JSON.stringify(draftSnapshot));
    draftIsDirty = false;
    updateSaveButtonState();
}

function updateDraftFromForm() {
    if (!selectedCharacter) return;

    const baseTier = parseInt(document.getElementById('inputBaseTier')?.value);
    const hasOmicronEnhancement = document.getElementById('chkHasOmicronEnhancement')?.checked;
    const omicronEnhancement = parseInt(document.getElementById('inputOmicronEnhancement')?.value);
    const ignoreReqGear = document.getElementById('ignoreReqGear')?.checked;
    const ignoreReqRarity = document.getElementById('ignoreReqRarity')?.checked;
    const ignoreSynergyReqGear = document.getElementById('ignoreSynergyReqGear')?.checked;
    const ignoreSynergyReqRarity = document.getElementById('ignoreSynergyReqRarity')?.checked;

    if (!currentDraft) {
        initializeDraft(selectedCharacter);
    }

    currentDraft.baseTier = baseTier;
    currentDraft.omicronEnhancement = hasOmicronEnhancement ? omicronEnhancement : undefined;

    if (ignoreReqGear || ignoreReqRarity) {
        currentDraft.ignoreRequirements = {};
        if (ignoreReqGear) currentDraft.ignoreRequirements.gear = true;
        if (ignoreReqRarity) currentDraft.ignoreRequirements.rarity = true;
    } else {
        currentDraft.ignoreRequirements = undefined;
    }

    if (ignoreSynergyReqGear || ignoreSynergyReqRarity) {
        currentDraft.ignoreSynergyRequirements = {};
        if (ignoreSynergyReqGear) currentDraft.ignoreSynergyRequirements.gear = true;
        if (ignoreSynergyReqRarity) currentDraft.ignoreSynergyRequirements.rarity = true;
    } else {
        currentDraft.ignoreSynergyRequirements = undefined;
    }

    refreshDraftDirtyState();
}

// ============================================
// Add New Character
// ============================================
function addNewCharacter() {
    // Check for unsaved draft changes
    if (!confirmDiscardDrafts()) {
        return;
    }

    const characterId = prompt('Enter the new character ID (uppercase letters, numbers, and underscores only):');

    if (!characterId) {
        return; // User cancelled
    }

    const trimmedId = characterId.trim();

    // Validate format
    const validPattern = /^[A-Z0-9_]+$/;
    if (!validPattern.test(trimmedId)) {
        alert('Invalid character ID format. Must contain only uppercase letters, numbers, and underscores.');
        return;
    }

    // Check for duplicates
    const exists = characterData.some(char => char.id === trimmedId);
    if (exists) {
        alert(`Character "${trimmedId}" already exists.`);
        return;
    }

    // Create new character with default values
    const newCharacter = {
        id: trimmedId,
        baseTier: 17  // Default tier for new characters
    };

    // Add to character data
    characterData.push(newCharacter);

    // Mark as unsaved
    hasUnsavedChanges = true;
    updateSaveButtonState();
    updateStatus(`Character "${trimmedId}" added - unsaved changes`, 'warning');
    updateCharacterCount();

    // Re-render grid
    renderTierGrid();

    // Reset draft and auto-select the new character
    resetDraft();
    selectCharacter(newCharacter);
}

// ============================================
// Tier Grid Rendering
// ============================================
function renderTierGrid() {
    const grid = document.getElementById('tierGrid');
    grid.innerHTML = '';

    // Create 19 tier columns
    for (let tier = 1; tier <= 19; tier++) {
        const column = createTierColumn(tier);
        grid.appendChild(column);
    }

    // Add characters to their respective tiers based on Final tier
    characterData.forEach(character => {
        const card = createCharacterCard(character);
        const tierData = calculateFinalTier(character);
        const columnId = `tier-${tierData.finalTier}`;
        const column = document.getElementById(columnId);

        if (column) {
            const cardsContainer = column.querySelector('.tier-cards');
            cardsContainer.appendChild(card);
        }
    });
}

// Calculate the Final tier based on current checkbox states
// Returns an object with finalTier and omicron metadata
function calculateFinalTier(character) {
    let finalTier = character.baseTier;
    let appliedOmicronBonus = 0;
    let omicronSource = null; // null, 'character', or character ID that provides synergy omicron

    // Determine the best omicron enhancement to apply (max of personal vs synergy)
    if (includeOmicron) {
        const personalOmicron = character.omicronEnhancement ?? 0;
        let bestSynergyOmicronBonus = 0;
        let bestSynergyOmicronSource = null;

        // Scan all characters to see if any reference this character in a synergy set with synergyEnhancementOmicron
        characterData.forEach(otherChar => {
            if (!otherChar.synergySets || otherChar.synergySets.length === 0) return;

            otherChar.synergySets.forEach(synergySet => {
                // Check if this synergy set has synergyEnhancementOmicron
                const synergyOmicronBonus = synergySet.synergyEnhancementOmicron ?? 0;
                if (synergyOmicronBonus === 0) return;

                // Check if this character is explicitly referenced (omicron bonuses only apply to explicit IDs)
                if (doesSynergyOmicronApplyToCharacter(synergySet, character)) {
                    if (synergyOmicronBonus > bestSynergyOmicronBonus) {
                        bestSynergyOmicronBonus = synergyOmicronBonus;
                        bestSynergyOmicronSource = otherChar.id;
                    }
                }
            });
        });

        // Apply only the largest omicron bonus (personal or synergy)
        if (personalOmicron > 0 && personalOmicron >= bestSynergyOmicronBonus) {
            appliedOmicronBonus = personalOmicron;
            omicronSource = 'character';
        } else if (bestSynergyOmicronBonus > 0) {
            appliedOmicronBonus = bestSynergyOmicronBonus;
            omicronSource = bestSynergyOmicronSource;
        }

        finalTier -= appliedOmicronBonus;
    }

    // Apply synergy enhancement if checkbox is checked
    if (includeSynergy && character.synergySets && character.synergySets.length > 0) {
        const synergyTiers = calculateSynergyTiers(character);

        // Determine which synergy to use based on includeOmicron setting
        let bestSynergy = null;
        if (includeOmicron && synergyTiers.bestOmicron !== null) {
            bestSynergy = synergyTiers.bestOmicron;
        } else if (synergyTiers.bestStandard !== null) {
            bestSynergy = synergyTiers.bestStandard;
        }

        if (bestSynergy !== null) {
            // Recalculate final tier with synergy
            finalTier = character.baseTier - appliedOmicronBonus - bestSynergy.synergyEnhancement;
        }
    }

    return {
        finalTier: finalTier,
        appliedOmicronBonus: appliedOmicronBonus,
        omicronSource: omicronSource
    };
}

function createTierColumn(tier) {
    const column = document.createElement('div');
    column.className = 'tier-column';
    column.id = `tier-${tier}`;
    column.dataset.tier = tier;

    // Add spacing after every 3 tiers
    if (tier % 3 === 0 && tier < 19) {
        column.classList.add('spacing-after');
    }

    // Column header
    const header = document.createElement('div');
    header.className = 'tier-column-header';
    header.textContent = `Tier ${tier}`;
    column.appendChild(header);

    // Cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'tier-cards';
    column.appendChild(cardsContainer);

    // Drag and drop event listeners - Mouse
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('drop', handleDrop);
    column.addEventListener('dragleave', handleDragLeave);

    // Touch/Pointer event listeners
    column.addEventListener('pointerenter', handlePointerEnterColumn);
    column.addEventListener('pointerleave', handlePointerLeaveColumn);

    return column;
}

function createCharacterCard(character) {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.draggable = true;
    card.dataset.characterId = character.id;

    if (selectedCharacter && selectedCharacter.id === character.id) {
        card.classList.add('selected');
    }

    // Character name
    const name = document.createElement('div');
    name.className = 'character-name';
    name.textContent = character.id;
    card.appendChild(name);

    // Tier information
    const tiers = document.createElement('div');
    tiers.className = 'character-tiers';

    // Final tier - always shown, calculated based on checkbox states
    const tierData = calculateFinalTier(character);
    const finalTierValue = tierData.finalTier;
    let finalTierCalculation = null;

    // Get calculation details if synergy is applied
    if (includeSynergy && character.synergySets && character.synergySets.length > 0) {
        const synergyTiers = calculateSynergyTiers(character);

        // Determine which synergy to use based on includeOmicron setting
        let bestSynergy = null;
        if (includeOmicron && synergyTiers.bestOmicron !== null) {
            bestSynergy = synergyTiers.bestOmicron;
        } else if (synergyTiers.bestStandard !== null) {
            bestSynergy = synergyTiers.bestStandard;
        }

        if (bestSynergy !== null) {
            finalTierCalculation = {
                finalTier: finalTierValue,
                baseTier: character.baseTier,
                appliedOmicronBonus: tierData.appliedOmicronBonus,
                omicronSource: tierData.omicronSource,
                synergyEnhancement: bestSynergy.synergyEnhancement,
                synergySet: bestSynergy.synergySet,
                setIndex: bestSynergy.setIndex
            };
        }
    }

    // If no synergy but we have omicron adjustments, create tooltip data
    if (finalTierCalculation === null && includeOmicron && tierData.appliedOmicronBonus > 0) {
        finalTierCalculation = {
            finalTier: finalTierValue,
            baseTier: character.baseTier,
            appliedOmicronBonus: tierData.appliedOmicronBonus,
            omicronSource: tierData.omicronSource,
            synergyEnhancement: 0,
            synergySet: null,
            setIndex: -1
        };
    }

    // Create single row with both base and final tiers
    const tierRow = document.createElement('div');
    tierRow.className = 'tier-info';

    const baseTierSpan = document.createElement('span');
    baseTierSpan.className = 'tier-label';
    baseTierSpan.textContent = `Base: ${character.baseTier}`;

    const finalTierSpan = document.createElement('span');
    finalTierSpan.className = 'tier-value';
    if ((includeSynergy || includeOmicron) && finalTierCalculation !== null) {
        finalTierSpan.classList.add('clickable');
        finalTierSpan.addEventListener('mouseenter', (e) => showTierTooltip(e, character, finalTierCalculation));
        finalTierSpan.addEventListener('mouseleave', hideTierTooltip);
    }
    finalTierSpan.textContent = `Final: ${finalTierValue}`;

    tierRow.appendChild(baseTierSpan);
    tierRow.appendChild(finalTierSpan);
    tiers.appendChild(tierRow);

    card.appendChild(tiers);

    // Event listeners - Mouse drag
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    // Event listeners - Touch/Pointer drag
    card.addEventListener('pointerdown', handlePointerDown);

    card.addEventListener('click', () => selectCharacter(character));

    return card;
}

function createTierInfo(label, value, isClickable = false, character = null, calculation = null) {
    const info = document.createElement('div');
    info.className = 'tier-info';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'tier-label';
    labelSpan.textContent = `${label}:`;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'tier-value';
    if (isClickable) {
        valueSpan.classList.add('clickable');
    }
    valueSpan.textContent = value;

    if (isClickable && character && calculation) {
        valueSpan.addEventListener('mouseenter', (e) => showTierTooltip(e, character, calculation));
        valueSpan.addEventListener('mouseleave', hideTierTooltip);
    }

    info.appendChild(labelSpan);
    info.appendChild(valueSpan);

    return info;
}

// ============================================
// Synergy Set Applicability Helper
// ============================================
/**
 * Determines if a synergy set applies to a given character for omicron bonuses.
 * ONLY checks explicit character IDs - synergyEnhancementOmicron does NOT apply via category matches.
 * @param {Object} synergySet - The synergy set to evaluate
 * @param {Object} character - The character to check against
 * @returns {boolean} True if the character is explicitly listed in the synergy set
 */
function doesSynergyOmicronApplyToCharacter(synergySet, character) {
    // Omicron bonuses ONLY apply to explicitly listed characters
    return synergySet.characters && synergySet.characters.includes(character.id);
}

/**
 * Determines if a synergy set applies to a given character for standard synergy bonuses.
 * Checks both explicit character IDs and category-based definitions.
 * @param {Object} synergySet - The synergy set to evaluate
 * @param {Object} character - The character to check against
 * @returns {boolean} True if the synergy set applies to this character
 */
function doesSynergySetApplyToCharacter(synergySet, character) {
    // Check explicit character references
    if (synergySet.characters && synergySet.characters.includes(character.id)) {
        return true;
    }

    // Check category-based definitions (for standard synergy, not omicron)
    if (synergySet.categoryDefinitions && synergySet.categoryDefinitions.length > 0) {
        const charCategories = character.categories || [];

        // At least one category definition must match for the set to apply
        for (const catDef of synergySet.categoryDefinitions) {
            const includeCategories = catDef.include || [];
            const excludeCategories = catDef.exclude || [];

            // Check if character has all required include categories
            const hasAllIncludes = includeCategories.every(cat => charCategories.includes(cat));

            // Check if character has any exclude categories (disqualifies)
            const hasAnyExcludes = excludeCategories.some(cat => charCategories.includes(cat));

            // If this category definition matches, the set applies
            if (hasAllIncludes && !hasAnyExcludes) {
                return true;
            }
        }
    }

    return false;
}

// ============================================
// Synergy Tier Calculations
// ============================================
function calculateSynergyTiers(character) {
    let bestStandard = null;
    let bestOmicron = null;

    // Use ?? to treat undefined as 0, but preserve explicit 0 value
    const omicronEnhancement = character.omicronEnhancement ?? 0;

    if (!character.synergySets || character.synergySets.length === 0) {
        return { bestStandard, bestOmicron };
    }

    character.synergySets.forEach((synergySet, setIndex) => {
        const standardEnhancement = synergySet.synergyEnhancement || 0;

        // Calculate standard synergy tier
        if (standardEnhancement > 0) {
            const standardTier = character.baseTier - standardEnhancement;

            if (bestStandard === null || standardTier < bestStandard.finalTier) {
                bestStandard = {
                    finalTier: standardTier,
                    baseTier: character.baseTier,
                    appliedOmicronBonus: 0,
                    omicronSource: null,
                    synergyEnhancement: standardEnhancement,
                    synergySet: synergySet,
                    setIndex: setIndex
                };
            }
        }

        // For omicron mode, use character's own omicron + standard synergy
        // Note: synergyEnhancementOmicron does NOT apply to the owning character
        if (omicronEnhancement > 0 && standardEnhancement > 0) {
            const omicronTier = character.baseTier - omicronEnhancement - standardEnhancement;

            if (bestOmicron === null || omicronTier < bestOmicron.finalTier) {
                bestOmicron = {
                    finalTier: omicronTier,
                    baseTier: character.baseTier,
                    appliedOmicronBonus: omicronEnhancement,
                    omicronSource: 'character',
                    synergyEnhancement: standardEnhancement,
                    synergySet: synergySet,
                    setIndex: setIndex
                };
            }
        }
    });

    return { bestStandard, bestOmicron };
}

function formatSynergySources(synergySet) {
    const parts = [];

    // Add specific character IDs
    if (synergySet.characters && synergySet.characters.length > 0) {
        parts.push(synergySet.characters.join(', '));
    }

    // Add category-based synergies
    if (synergySet.categoryDefinitions && synergySet.categoryDefinitions.length > 0) {
        synergySet.categoryDefinitions.forEach(catDef => {
            const count = catDef.numberMatchesRequired || 1;
            const includes = catDef.include || [];
            const excludes = catDef.exclude || [];

            const categoryParts = [];
            if (includes.length > 0) {
                categoryParts.push(`${count}× ${includes.join(', ')}`);
            }
            if (excludes.length > 0) {
                categoryParts.push(`NOT ${excludes.join(', ')}`);
            }
            if (categoryParts.length > 0) {
                parts.push(categoryParts.join(' '));
            }
        });
    }

    return parts.join(' | ') || 'Unknown';
}

// ============================================
// Tooltip
// ============================================
function showTierTooltip(event, character, calculation) {
    const tooltip = document.getElementById('tierTooltip');
    const content = tooltip.querySelector('.tooltip-content');

    // Build tooltip text with separate lines for each component
    let text = `Base Tier (${calculation.baseTier})`;

    // Show the single applied omicron bonus (max of character or synergy)
    if (calculation.appliedOmicronBonus > 0) {
        if (calculation.omicronSource === 'character') {
            text += `\n- Omicron Enhancement (${calculation.appliedOmicronBonus} from character)`;
        } else if (calculation.omicronSource) {
            text += `\n- Omicron Enhancement (${calculation.appliedOmicronBonus} from ${calculation.omicronSource})`;
        }
    }

    if (calculation.synergyEnhancement > 0) {
        const sources = formatSynergySources(calculation.synergySet);
        text += `\n- Best Synergy (${calculation.synergyEnhancement} from ${sources})`;
    }

    text += `\n= Final Tier (${calculation.finalTier})`;

    content.textContent = text;

    // Position tooltip near mouse
    tooltip.style.left = (event.clientX + 10) + 'px';
    tooltip.style.top = (event.clientY + 10) + 'px';
    tooltip.style.display = 'block';
}

function hideTierTooltip() {
    const tooltip = document.getElementById('tierTooltip');
    tooltip.style.display = 'none';
}

// ============================================
// Drag and Drop (Mouse + Touch/Pointer Support)
// ============================================
let draggedCharacterId = null;
let isDraggingWithPointer = false;
let draggedElement = null;
let currentDropTarget = null;

function handleDragStart(e) {
    draggedCharacterId = e.target.dataset.characterId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');

    // Remove drag-over styling from all columns
    document.querySelectorAll('.tier-column').forEach(col => {
        col.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const column = e.currentTarget;
    column.classList.add('drag-over');

    return false;
}

function handleDragLeave(e) {
    const column = e.currentTarget;
    column.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    const column = e.currentTarget;
    column.classList.remove('drag-over');

    const newFinalTier = parseInt(column.dataset.tier);

    // Find and update the character
    const character = characterData.find(c => c.id === draggedCharacterId);
    if (character) {
        // Calculate current final tier
        const tierData = calculateFinalTier(character);
        const currentFinalTier = tierData.finalTier;

        // Only update if tier actually changed
        if (currentFinalTier !== newFinalTier) {
            // Calculate tier difference
            const tierOffset = newFinalTier - currentFinalTier;

            // Apply offset to baseTier
            character.baseTier += tierOffset;

            // Clamp to valid range (1-19)
            character.baseTier = Math.max(1, Math.min(19, character.baseTier));

            hasUnsavedChanges = true;
            updateSaveButtonState();
            updateStatus('Character moved - unsaved changes', 'warning');
            renderTierGrid();

            // Keep character selected if it was selected
            if (selectedCharacter && selectedCharacter.id === character.id) {
                selectCharacter(character);
            }
        }
    }

    return false;
}

// ============================================
// Touch/Pointer Event Handlers for iPad Support
// ============================================
function handlePointerDown(e) {
    // Only handle primary pointer (first finger/mouse)
    if (!e.isPrimary) return;

    // Skip pointer events for mouse - let native drag/drop handle it
    // Only use pointer events for touch input
    if (e.pointerType === 'mouse') return;

    const card = e.currentTarget;
    draggedCharacterId = card.dataset.characterId;
    draggedElement = card;
    isDraggingWithPointer = true;

    // Capture pointer to receive events even when moving outside element
    card.setPointerCapture(e.pointerId);

    // Create drag ghost element
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('selected');
    ghost.style.width = card.offsetWidth + 'px';
    ghost.style.left = e.clientX - (card.offsetWidth / 2) + 'px';
    ghost.style.top = e.clientY - 20 + 'px';
    document.body.appendChild(ghost);
    draggedElement.ghostElement = ghost;

    // Add dragging state to original card (make it semi-transparent)
    card.classList.add('dragging-touch');

    // Add pointer event listeners
    card.addEventListener('pointermove', handlePointerMove);
    card.addEventListener('pointerup', handlePointerUp);
    card.addEventListener('pointercancel', handlePointerCancel);

    // Prevent text selection and default touch behavior
    e.preventDefault();
}

function handlePointerMove(e) {
    if (!isDraggingWithPointer) return;

    // Update ghost position
    if (draggedElement.ghostElement) {
        draggedElement.ghostElement.style.left = e.clientX - (draggedElement.offsetWidth / 2) + 'px';
        draggedElement.ghostElement.style.top = e.clientY - 20 + 'px';
    }

    // Get element at pointer position (excluding the dragged element and ghost)
    draggedElement.style.pointerEvents = 'none';
    if (draggedElement.ghostElement) {
        draggedElement.ghostElement.style.pointerEvents = 'none';
    }
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    draggedElement.style.pointerEvents = '';
    if (draggedElement.ghostElement) {
        draggedElement.ghostElement.style.pointerEvents = 'none'; // Keep ghost non-interactive
    }

    // Find the tier column
    const tierColumn = elementBelow?.closest('.tier-column');

    // Update drop target highlighting
    if (tierColumn !== currentDropTarget) {
        // Remove highlight from previous target
        if (currentDropTarget) {
            currentDropTarget.classList.remove('drag-over');
        }

        // Add highlight to new target
        if (tierColumn) {
            tierColumn.classList.add('drag-over');
        }

        currentDropTarget = tierColumn;
    }
}

function handlePointerUp(e) {
    if (!isDraggingWithPointer) return;

    const card = e.currentTarget;

    // Get the drop target column
    if (currentDropTarget) {
        const newFinalTier = parseInt(currentDropTarget.dataset.tier);

        // Find and update the character
        const character = characterData.find(c => c.id === draggedCharacterId);
        if (character) {
            const tierData = calculateFinalTier(character);
            const currentFinalTier = tierData.finalTier;

            // Only update if tier actually changed
            if (currentFinalTier !== newFinalTier) {
                // Calculate tier difference
                const tierOffset = newFinalTier - currentFinalTier;

                // Apply offset to baseTier
                character.baseTier += tierOffset;

                // Clamp to valid range (1-19)
                character.baseTier = Math.max(1, Math.min(19, character.baseTier));

                hasUnsavedChanges = true;
                updateSaveButtonState();
                updateStatus('Character moved - unsaved changes', 'warning');
                renderTierGrid();

                // Keep character selected if it was selected
                if (selectedCharacter && selectedCharacter.id === character.id) {
                    selectCharacter(character);
                }
            }
        }

        // Remove highlight
        currentDropTarget.classList.remove('drag-over');
    }

    // Cleanup
    cleanupPointerDrag(card, e.pointerId);
}

function handlePointerCancel(e) {
    if (!isDraggingWithPointer) return;
    cleanupPointerDrag(e.currentTarget, e.pointerId);
}

function cleanupPointerDrag(card, pointerId) {
    // Remove dragging state
    card.classList.remove('dragging-touch');

    // Remove ghost element
    if (draggedElement && draggedElement.ghostElement) {
        draggedElement.ghostElement.remove();
        draggedElement.ghostElement = null;
    }

    // Remove all column highlights
    document.querySelectorAll('.tier-column').forEach(col => {
        col.classList.remove('drag-over');
    });

    // Remove pointer event listeners
    card.removeEventListener('pointermove', handlePointerMove);
    card.removeEventListener('pointerup', handlePointerUp);
    card.removeEventListener('pointercancel', handlePointerCancel);

    // Release pointer capture
    if (card.hasPointerCapture(pointerId)) {
        card.releasePointerCapture(pointerId);
    }

    // Reset state
    isDraggingWithPointer = false;
    draggedElement = null;
    currentDropTarget = null;
    draggedCharacterId = null;
}

function handlePointerEnterColumn(e) {
    // This is a backup for when pointermove doesn't catch the column
    if (isDraggingWithPointer && e.currentTarget.classList.contains('tier-column')) {
        if (currentDropTarget !== e.currentTarget) {
            if (currentDropTarget) {
                currentDropTarget.classList.remove('drag-over');
            }
            e.currentTarget.classList.add('drag-over');
            currentDropTarget = e.currentTarget;
        }
    }
}

function handlePointerLeaveColumn(e) {
    // Only remove highlight if we're actually leaving (not just moving to a child)
    if (isDraggingWithPointer && e.currentTarget === currentDropTarget) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        // Check if pointer is actually outside the column
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            e.currentTarget.classList.remove('drag-over');
            if (currentDropTarget === e.currentTarget) {
                currentDropTarget = null;
            }
        }
    }
}

// ============================================
// Sidebar Collapse Management
// ============================================
function toggleLeftSidebar() {
    isLeftSidebarCollapsed = !isLeftSidebarCollapsed;
    const sidebar = document.querySelector('.sidebar-left');
    const button = document.getElementById('toggleLeftSidebar');

    if (isLeftSidebarCollapsed) {
        sidebar.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
    } else {
        sidebar.classList.remove('collapsed');
        button.setAttribute('aria-expanded', 'true');
    }

    // Close dropdowns when collapsing
    if (isLeftSidebarCollapsed) {
        hideAllDropdowns();
    }
}

function toggleRightSidebar() {
    isRightSidebarCollapsed = !isRightSidebarCollapsed;
    const sidebar = document.querySelector('.sidebar-right');
    const button = document.getElementById('toggleRightSidebar');

    if (isRightSidebarCollapsed) {
        sidebar.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
    } else {
        sidebar.classList.remove('collapsed');
        button.setAttribute('aria-expanded', 'true');
    }

    // Close dropdowns when collapsing
    if (isRightSidebarCollapsed) {
        hideAllDropdowns();
    }
}

function expandBothSidebars() {
    // Expand left sidebar
    if (isLeftSidebarCollapsed) {
        isLeftSidebarCollapsed = false;
        const leftSidebar = document.querySelector('.sidebar-left');
        const leftButton = document.getElementById('toggleLeftSidebar');
        leftSidebar.classList.remove('collapsed');
        leftButton.setAttribute('aria-expanded', 'true');
    }

    // Expand right sidebar
    if (isRightSidebarCollapsed) {
        isRightSidebarCollapsed = false;
        const rightSidebar = document.querySelector('.sidebar-right');
        const rightButton = document.getElementById('toggleRightSidebar');
        rightSidebar.classList.remove('collapsed');
        rightButton.setAttribute('aria-expanded', 'true');
    }
}

function collapseBothSidebars() {
    // Collapse left sidebar
    if (!isLeftSidebarCollapsed) {
        isLeftSidebarCollapsed = true;
        const leftSidebar = document.querySelector('.sidebar-left');
        const leftButton = document.getElementById('toggleLeftSidebar');
        leftSidebar.classList.add('collapsed');
        leftButton.setAttribute('aria-expanded', 'false');
    }

    // Collapse right sidebar
    if (!isRightSidebarCollapsed) {
        isRightSidebarCollapsed = true;
        const rightSidebar = document.querySelector('.sidebar-right');
        const rightButton = document.getElementById('toggleRightSidebar');
        rightSidebar.classList.add('collapsed');
        rightButton.setAttribute('aria-expanded', 'false');
    }

    // Close any open dropdowns
    hideAllDropdowns();
}

// ============================================
// Character Selection and Details
// ============================================
function renderEmptyCharacterDetails() {
    const container = document.getElementById('characterDetails');
    container.innerHTML = `
        <div class="empty-state">
            <p>Select a character to view details</p>
        </div>
    `;
}

function renderEmptySynergyEditor() {
    const container = document.getElementById('synergyEditor');
    container.innerHTML = `
        <div class="empty-state">
            <p>Select a character to view synergy sets</p>
        </div>
    `;
}

function clearCharacterSelection() {
    // Check for unsaved draft changes before clearing
    if (!confirmDiscardDrafts()) {
        return;
    }

    // Reset state
    resetDraft();
    selectedCharacter = null;

    // Remove visual selection from all cards
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.remove('selected');
    });

    // Restore empty state views
    renderEmptyCharacterDetails();
    renderEmptySynergyEditor();

    // Auto-collapse both sidebars when character is deselected
    collapseBothSidebars();
}

function selectCharacter(character) {
    // Toggle deselection if clicking the already-selected character
    if (selectedCharacter && selectedCharacter.id === character.id) {
        clearCharacterSelection();
        return;
    }

    // Check for unsaved draft changes before switching characters
    if (selectedCharacter && selectedCharacter.id !== character.id && !confirmDiscardDrafts()) {
        return;
    }

    selectedCharacter = character;
    resetDraft();
    initializeDraft(character);

    // Auto-expand both sidebars when character is selected
    expandBothSidebars();

    renderCharacterDetails(character);
    renderSynergyEditor(character);

    // Update visual selection
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.characterId === character.id) {
            card.classList.add('selected');
        }
    });
}

function renderCharacterDetails(character) {
    const container = document.getElementById('characterDetails');

    // Use draft values if available, otherwise use character values
    const draftValues = currentDraft || character;

    // Format required zetas from draft
    let requiredZetasDisplay = 'All (if any)';
    if (draftValues.requiredZetas !== undefined) {
        requiredZetasDisplay = (draftValues.requiredZetas.length > 0)
            ? draftValues.requiredZetas.join(', ')
            : 'None';
    }

    // Check requiresAllZetas (default is true if not explicitly set to false)
    const requiresAllZetas = draftValues.requiresAllZetas !== false ? 'Yes' : 'No';

    const html = `
        <div class="character-info">
            <div class="character-info-header">${character.id}</div>
            <div class="info-row">
                <span class="info-label">Base Tier</span>
                <span class="info-value">${character.baseTier}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Omicron Enhancement</span>
                <span class="info-value">${character.omicronEnhancement ?? 1}${character.omicronEnhancement === undefined ? ' (default)' : ''}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Synergy Sets</span>
                <span class="info-value">${draftValues.synergySets ? draftValues.synergySets.length : 0}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Required Zetas</span>
                <span class="info-value" style="font-size: 0.85em; word-break: break-all;">${requiredZetasDisplay}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Required Omicrons</span>
                <span class="info-value" style="font-size: 0.85em; word-break: break-all;">${draftValues.requiredOmicrons !== undefined ? (draftValues.requiredOmicrons.length > 0 ? draftValues.requiredOmicrons.join(', ') : 'None') : 'All (if any)'}</span>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Base Tier (1-19)</label>
            <input type="number" class="form-input" id="inputBaseTier" 
                   value="${draftValues.baseTier}" min="1" max="19">
        </div>
        
        <div class="form-group">
            <label class="form-label">
                <input type="checkbox" id="chkHasOmicronEnhancement" 
                       ${draftValues.omicronEnhancement !== undefined ? 'checked' : ''}
                       onchange="toggleOmicronEnhancement()" style="margin-right: 8px;">
                Omicron Enhancement (0-10)
            </label>
            <input type="number" class="form-input" id="inputOmicronEnhancement" 
                   value="${draftValues.omicronEnhancement ?? 1}" min="0" max="10"
                   ${draftValues.omicronEnhancement === undefined ? 'readonly' : ''}>
            <div class="form-help">If a character has an Omicron and meets the requirements, StackRank will automatically apply a default boost of 1. When checked, the defined value will override the default boost.</div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Ignore Requirements</label>
            <div class="form-help">Skip normal requirements for this character</div>
            <div style="display: flex; gap: 20px; margin-top: 8px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="ignoreReqGear" 
                           ${draftValues.ignoreRequirements?.gear ? 'checked' : ''} 
                           style="margin-right: 6px; cursor: pointer;">
                    Gear
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="ignoreReqRarity" 
                           ${draftValues.ignoreRequirements?.rarity ? 'checked' : ''} 
                           style="margin-right: 6px; cursor: pointer;">
                    Rarity
                </label>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Ignore Synergy Requirements</label>
            <div class="form-help">Skip synergy-specific requirements for this character</div>
            <div style="display: flex; gap: 20px; margin-top: 8px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="ignoreSynergyReqGear" 
                           ${draftValues.ignoreSynergyRequirements?.gear ? 'checked' : ''} 
                           style="margin-right: 6px; cursor: pointer;">
                    Gear
                </label>
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="ignoreSynergyReqRarity" 
                           ${draftValues.ignoreSynergyRequirements?.rarity ? 'checked' : ''} 
                           style="margin-right: 6px; cursor: pointer;">
                    Rarity
                </label>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Render the zeta requirements editor
    renderZetaEditor(character);

    // Render the omicron requirements editor
    renderOmicronEditor(character);

    // Add event listeners to capture form changes into draft
    setTimeout(() => {
        ['inputBaseTier', 'chkHasOmicronEnhancement', 'inputOmicronEnhancement', 'ignoreReqGear', 'ignoreReqRarity', 'ignoreSynergyReqGear', 'ignoreSynergyReqRarity'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', updateDraftFromForm);
                element.addEventListener('change', updateDraftFromForm);
            }
        });
    }, 0);
}

function toggleOmicronEnhancement() {
    const checkbox = document.getElementById('chkHasOmicronEnhancement');
    const input = document.getElementById('inputOmicronEnhancement');

    if (checkbox.checked) {
        // Enable input - user wants to set a specific value
        input.removeAttribute('readonly');
    } else {
        // Disable input and show default value
        input.setAttribute('readonly', 'readonly');
        input.value = 1;
    }

    updateDraftFromForm();
}

function updateCharacter() {
    if (!selectedCharacter || !currentDraft) return;

    // Validate basics
    if (currentDraft.baseTier < 1 || currentDraft.baseTier > 19) {
        alert('Base tier must be between 1 and 19');
        return;
    }

    if (currentDraft.omicronEnhancement !== undefined && (currentDraft.omicronEnhancement < 0 || currentDraft.omicronEnhancement > 10)) {
        alert('Omicron enhancement must be between 0 and 10');
        return;
    }

    // Validate synergy enhancements
    if (currentDraft.synergySets) {
        for (let i = 0; i < currentDraft.synergySets.length; i++) {
            const set = currentDraft.synergySets[i];
            if (set.synergyEnhancement !== undefined && (set.synergyEnhancement < 0 || set.synergyEnhancement > 10)) {
                alert(`Synergy Set #${i + 1}: Synergy enhancement must be between 0 and 10`);
                return;
            }
            if (set.synergyEnhancementOmicron !== undefined && (set.synergyEnhancementOmicron < 0 || set.synergyEnhancementOmicron > 10)) {
                alert(`Synergy Set #${i + 1}: Omicron enhancement must be between 0 and 10`);
                return;
            }

            // Validate synergy slot usage (characters + required matches <= 4)
            const slotsUsed = getSynergySlotUsage(set);
            if (slotsUsed < 1 || slotsUsed > 4) {
                const charCount = (set.characters || []).length;
                const matchCount = slotsUsed - charCount;
                alert(`Synergy Set #${i + 1}: Must reference between 1 and 4 total teammates (found: ${slotsUsed}).\n\nCharacters: ${charCount}\nCategory matches required: ${matchCount}\n\nPlease adjust the synergy set before updating.`);
                return;
            }
        }
    }

    // Apply draft to character - basics
    selectedCharacter.baseTier = currentDraft.baseTier;

    if (currentDraft.omicronEnhancement !== undefined) {
        selectedCharacter.omicronEnhancement = currentDraft.omicronEnhancement;
    } else {
        delete selectedCharacter.omicronEnhancement;
    }

    if (currentDraft.ignoreRequirements) {
        selectedCharacter.ignoreRequirements = { ...currentDraft.ignoreRequirements };
    } else {
        delete selectedCharacter.ignoreRequirements;
    }

    if (currentDraft.ignoreSynergyRequirements) {
        selectedCharacter.ignoreSynergyRequirements = { ...currentDraft.ignoreSynergyRequirements };
    } else {
        delete selectedCharacter.ignoreSynergyRequirements;
    }

    // Apply draft to character - zeta requirements
    if (currentDraft.requiredZetas !== undefined) {
        selectedCharacter.requiredZetas = [...currentDraft.requiredZetas];
    } else {
        delete selectedCharacter.requiredZetas;
    }

    if (currentDraft.requiresAllZetas !== undefined) {
        selectedCharacter.requiresAllZetas = currentDraft.requiresAllZetas;
    } else {
        delete selectedCharacter.requiresAllZetas;
    }

    // Apply draft to character - omicron requirements
    if (currentDraft.requiredOmicrons !== undefined) {
        selectedCharacter.requiredOmicrons = [...currentDraft.requiredOmicrons];
    } else {
        delete selectedCharacter.requiredOmicrons;
    }

    if (currentDraft.requiresAllOmicrons !== undefined) {
        selectedCharacter.requiresAllOmicrons = currentDraft.requiresAllOmicrons;
    } else {
        delete selectedCharacter.requiresAllOmicrons;
    }

    // Apply draft to character - synergy sets (deep copy)
    if (currentDraft.synergySets) {
        selectedCharacter.synergySets = currentDraft.synergySets.map(set => ({
            ...set,
            characters: set.characters ? [...set.characters] : undefined,
            categoryDefinitions: set.categoryDefinitions ? set.categoryDefinitions.map(catDef => ({
                ...catDef,
                include: catDef.include ? [...catDef.include] : undefined,
                exclude: catDef.exclude ? [...catDef.exclude] : undefined
            })) : undefined
        }));
    } else {
        delete selectedCharacter.synergySets;
    }

    hasUnsavedChanges = true;
    updateStatus('Character updated - unsaved changes', 'warning');

    // Rebuild tag index to include any new tags
    buildCategoryTagIndex();

    // Re-render and reinitialize draft with new baseline
    renderTierGrid();
    initializeDraft(selectedCharacter);
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

// ============================================
// Zeta Requirements Editor
// ============================================
function renderZetaEditor(character) {
    const container = document.getElementById('characterDetails');

    // Use draft values if available, otherwise use character values
    const draftValues = currentDraft || character;

    // Determine if "requires all zetas" is checked (when requiredZetas is undefined)
    const requiresAllChecked = draftValues.requiredZetas === undefined;
    const requiredZetas = draftValues.requiredZetas || [];

    let zetaEditorHtml = `
        <div class="form-group" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 20px;">
            <label class="form-label" style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox" id="chkRequiresAllZetas" 
                       ${requiresAllChecked ? 'checked' : ''} 
                       onchange="toggleRequiresAllZetas()" 
                       style="margin-right: 8px; cursor: pointer;">
                Requires all Zetas (if any)
            </label>
            <div class="form-help">When checked, all Zeta abilities are required (default behavior)</div>
        </div>
    `;

    if (!requiresAllChecked) {
        zetaEditorHtml += '<div id="zetaListContainer">';

        if (requiredZetas.length === 0) {
            zetaEditorHtml += `
                <div class="empty-state" style="margin: 10px 0;">
                    <p style="font-size: 0.9em; color: #888;">No specific zetas required (None case)</p>
                </div>
            `;
        } else {
            zetaEditorHtml += '<div class="form-group"><label class="form-label">Required Zeta Abilities</label>';

            requiredZetas.forEach((zeta, index) => {
                zetaEditorHtml += `
                    <div class="info-row" style="margin-bottom: 8px; align-items: center;">
                        <input type="text" class="form-input" 
                               value="${zeta}" 
                               onblur="updateRequiredZeta(${index}, this.value)" 
                               placeholder="e.g., uniqueskill_VADER01"
                               style="flex: 1; margin-right: 8px; font-size: 0.85em;">
                        <button class="btn btn-danger btn-small" onclick="removeRequiredZeta(${index})">
                            <span class="icon">×</span>
                        </button>
                    </div>
                `;
            });

            zetaEditorHtml += '</div>';
        }

        zetaEditorHtml += `
            <button class="btn btn-secondary" onclick="addRequiredZeta()" style="margin-top: 10px;">
                <span class="icon">+</span> Add Required Zeta
            </button>
        `;

        zetaEditorHtml += '</div>';
    }

    container.innerHTML += zetaEditorHtml;
}

function toggleRequiresAllZetas() {
    if (!selectedCharacter || !currentDraft) return;

    const checkbox = document.getElementById('chkRequiresAllZetas');

    if (checkbox.checked) {
        // Requires all zetas (default behavior) - remove both properties
        delete currentDraft.requiresAllZetas;
        delete currentDraft.requiredZetas;
    } else {
        // Specific zetas required - set flag and initialize empty array
        currentDraft.requiresAllZetas = false;
        if (!currentDraft.requiredZetas) {
            currentDraft.requiredZetas = [];
        }
    }

    refreshDraftDirtyState();
    updateStatus('Zeta requirements staged - click Update Character to apply', 'warning');

    // Re-render to show draft changes
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function addRequiredZeta() {
    if (!selectedCharacter || !currentDraft) return;

    // Ensure requiresAllZetas is false and array exists
    currentDraft.requiresAllZetas = false;
    if (!currentDraft.requiredZetas) {
        currentDraft.requiredZetas = [];
    }

    // Add empty string for user to fill in
    currentDraft.requiredZetas.push('');

    refreshDraftDirtyState();
    updateStatus('Zeta field added - click Update Character to apply', 'warning');

    // Re-render to show draft changes
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function removeRequiredZeta(index) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredZetas) return;

    // Remove the zeta at the specified index
    currentDraft.requiredZetas.splice(index, 1);

    // Keep requiresAllZetas: false and empty array (the "None" case)
    // Don't delete the properties

    refreshDraftDirtyState();
    updateStatus('Required Zeta removed - click Update Character to apply', 'warning');

    // Re-render to show draft changes
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function updateRequiredZeta(index, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredZetas) return;

    // Trim whitespace
    value = value.trim();

    // Auto-remove if empty
    if (value === '') {
        removeRequiredZeta(index);
        return;
    }

    // Validate format: alphanumeric and underscores only
    const validPattern = /^[A-Za-z0-9_]+$/;
    if (!validPattern.test(value)) {
        alert('Invalid ability ID format. Only letters, numbers, and underscores are allowed.');
        // Re-render to restore previous value
        renderCharacterDetails(selectedCharacter);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check for duplicates
    const isDuplicate = currentDraft.requiredZetas.some((zeta, i) =>
        i !== index && zeta === value
    );

    if (isDuplicate) {
        alert('This Zeta ability is already in the list. Duplicates are not allowed.');
        // Re-render to restore previous value
        renderCharacterDetails(selectedCharacter);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Update the value
    currentDraft.requiredZetas[index] = value;

    refreshDraftDirtyState();
    updateStatus('Required Zeta updated - click Update Character to apply', 'warning');
}

// ============================================
// Omicron Requirements Editor
// ============================================
function renderOmicronEditor(character) {
    const container = document.getElementById('characterDetails');

    // Use draft values if available, otherwise use character values
    const draftValues = currentDraft || character;

    // Determine if "requires all omicrons" is checked (when requiredOmicrons is undefined)
    const requiresAllChecked = draftValues.requiredOmicrons === undefined;
    const requiredOmicrons = draftValues.requiredOmicrons || [];

    let omicronEditorHtml = `
        <div class="form-group" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 20px;">
            <label class="form-label" style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox" id="chkRequiresAllOmicrons" 
                       ${requiresAllChecked ? 'checked' : ''} 
                       onchange="toggleRequiresAllOmicrons()" 
                       style="margin-right: 8px; cursor: pointer;">
                Requires all Omicrons (if any)
            </label>
            <div class="form-help">When checked, all Omicron abilities are required for boost (default behavior)</div>
        </div>
    `;

    if (!requiresAllChecked) {
        omicronEditorHtml += '<div id="omicronListContainer">';

        if (requiredOmicrons.length === 0) {
            omicronEditorHtml += `
                <div class="empty-state" style="margin: 10px 0;">
                    <p style="font-size: 0.9em; color: #888;">No specific omicrons required (None case)</p>
                </div>
            `;
        } else {
            omicronEditorHtml += '<div class="form-group"><label class="form-label">Required Omicron Abilities</label>';

            requiredOmicrons.forEach((omicron, index) => {
                omicronEditorHtml += `
                    <div class="info-row" style="margin-bottom: 8px; align-items: center;">
                        <input type="text" class="form-input" 
                               value="${omicron}" 
                               onblur="updateRequiredOmicron(${index}, this.value)" 
                               placeholder="e.g., specialskill_DARTHMALAK01"
                               style="flex: 1; margin-right: 8px; font-size: 0.85em;">
                        <button class="btn btn-danger btn-small" onclick="removeRequiredOmicron(${index})">
                            <span class="icon">×</span>
                        </button>
                    </div>
                `;
            });

            omicronEditorHtml += '</div>';
        }

        omicronEditorHtml += `
            <button class="btn btn-secondary" onclick="addRequiredOmicron()" style="margin-top: 10px;">
                <span class="icon">+</span> Add Required Omicron
            </button>
        `;

        omicronEditorHtml += '</div>';
    }

    container.innerHTML += omicronEditorHtml;
}

function toggleRequiresAllOmicrons() {
    if (!selectedCharacter || !currentDraft) return;

    const checkbox = document.getElementById('chkRequiresAllOmicrons');

    if (checkbox.checked) {
        // Requires all omicrons (default behavior) - remove both properties
        delete currentDraft.requiresAllOmicrons;
        delete currentDraft.requiredOmicrons;
    } else {
        // Specific omicrons required - set flag and initialize empty array
        currentDraft.requiresAllOmicrons = false;
        if (!currentDraft.requiredOmicrons) {
            currentDraft.requiredOmicrons = [];
        }
    }

    refreshDraftDirtyState();
    updateStatus('Omicron requirements staged - click Update Character to apply', 'warning');

    // Re-render to show draft changes
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function addRequiredOmicron() {
    if (!selectedCharacter || !currentDraft) return;

    // Ensure requiresAllOmicrons is false and array exists
    currentDraft.requiresAllOmicrons = false;
    if (!currentDraft.requiredOmicrons) {
        currentDraft.requiredOmicrons = [];
    }

    // Add empty string for user to fill in
    currentDraft.requiredOmicrons.push('');

    refreshDraftDirtyState();
    updateStatus('Omicron field added - click Update Character to apply', 'warning');

    // Re-render to show draft changes
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function removeRequiredOmicron(index) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredOmicrons) return;

    // Remove the omicron at the specified index
    currentDraft.requiredOmicrons.splice(index, 1);

    // Keep requiresAllOmicrons: false and empty array (the "None" case)
    // Don't delete the properties

    refreshDraftDirtyState();
    updateStatus('Required Omicron removed - click Update Character to apply', 'warning');

    // Re-render to show draft changes
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function updateRequiredOmicron(index, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredOmicrons) return;

    // Trim whitespace
    value = value.trim();

    // Auto-remove if empty
    if (value === '') {
        removeRequiredOmicron(index);
        return;
    }

    // Validate format: alphanumeric and underscores only
    const validPattern = /^[A-Za-z0-9_]+$/;
    if (!validPattern.test(value)) {
        alert('Invalid ability ID format. Only letters, numbers, and underscores are allowed.');
        // Re-render to restore previous value
        renderCharacterDetails(selectedCharacter);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check for duplicates
    const isDuplicate = currentDraft.requiredOmicrons.some((omicron, i) =>
        i !== index && omicron === value
    );

    if (isDuplicate) {
        alert('This Omicron ability is already in the list.');
        // Re-render to restore previous value
        renderCharacterDetails(selectedCharacter);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Update the value
    currentDraft.requiredOmicrons[index] = value;

    refreshDraftDirtyState();
    updateStatus('Required Omicron updated - click Update Character to apply', 'warning');
}

// ============================================
// Synergy Editor
// ============================================

/**
 * Calculate total slot usage for a synergy set.
 * A synergy set can reference a maximum of 4 total teammates:
 * characters.length + sum(categoryDefinitions[].numberMatchesRequired) <= 4
 * 
 * @param {Object} synergySet - The synergy set object
 * @returns {number} Total slots used (0-4+)
 */
function getSynergySlotUsage(synergySet) {
    if (!synergySet) return 0;

    let totalSlots = 0;

    // Count explicit characters
    if (synergySet.characters && Array.isArray(synergySet.characters)) {
        totalSlots += synergySet.characters.length;
    }

    // Count required matches from category definitions
    if (synergySet.categoryDefinitions && Array.isArray(synergySet.categoryDefinitions)) {
        totalSlots += synergySet.categoryDefinitions.reduce((sum, catDef) => {
            return sum + (catDef.numberMatchesRequired || 0);
        }, 0);
    }

    return totalSlots;
}

function renderSynergyCharactersEditor(synergyIndex, synergySet) {
    const characters = synergySet.characters || [];

    // Check if we've reached the limit (characters + required matches = 4)
    const currentTotal = getSynergySlotUsage(synergySet);
    const canAddCharacter = currentTotal < 4;

    let html = `
        <div class="form-group">
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label class="info-label">Characters:</label>
                <div style="display: flex; flex-direction: column; gap: 8px;">`;

    characters.forEach((charId, charIndex) => {
        html += `
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" 
                               id="charInput_${synergyIndex}_${charIndex}"
                               value="${charId}"
                               class="character-input"
                               style="flex: 1; font-family: monospace;"
                               placeholder="Type to filter...">
                        <button class="btn btn-danger btn-small" 
                                onclick="removeSynergyCharacter(${synergyIndex}, ${charIndex})"
                                style="padding: 4px 8px;">
                            <span class="icon">×</span>
                        </button>
                    </div>`;
    });

    html += `
                </div>
            </div>`;

    // Only show Add Character button if limit not reached
    if (canAddCharacter) {
        html += `
            <button class="btn btn-primary btn-small" 
                    onclick="addSynergyCharacter(${synergyIndex})"
                    style="margin-top: 8px; align-self: flex-end;">
                <span class="icon">+</span> Add Character
            </button>`;
    } else {
        html += `
            <div style="margin-top: 8px; font-size: 12px; color: #999; font-style: italic;">
                Cannot add more characters (limit: characters + required matches = 4)
            </div>`;
    }

    html += `
        </div>`;

    return html;
}

function renderSynergyExclusionsEditor(synergyIndex, synergySet) {
    const exclusions = synergySet.skipIfPresentCharacters || [];

    let html = `
        <div class="form-group">
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label class="info-label">Skip If Present:</label>
                <div style="display: flex; flex-direction: column; gap: 8px;">`;

    exclusions.forEach((charId, exclIndex) => {
        html += `
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" 
                               id="exclInput_${synergyIndex}_${exclIndex}"
                               value="${charId}"
                               class="exclusion-input"
                               style="flex: 1; font-family: monospace;"
                               placeholder="Type to filter...">
                        <button class="btn btn-danger btn-small" 
                                onclick="removeExclusionCharacter(${synergyIndex}, ${exclIndex})"
                                style="padding: 4px 8px;">
                            <span class="icon">×</span>
                        </button>
                    </div>`;
    });

    html += `
                </div>
            </div>
            <div class="form-help">This synergy set  will be skipped if the specified characters meet the synergy requirements.</div>
            <button class="btn btn-primary btn-small" 
                    onclick="addExclusionCharacter(${synergyIndex})"
                    style="margin-top: 8px; align-self: flex-end;">
                <span class="icon">+</span> Add Skip
            </button>
        </div>`;

    return html;
}

function renderSynergyCategoryDefinitionsEditor(synergyIndex, synergySet) {
    const categoryDefs = synergySet.categoryDefinitions || [];

    // Check if we've reached the limit (characters + required matches = 4)
    const currentTotal = getSynergySlotUsage(synergySet);
    const canAddCategoryDef = currentTotal < 4;

    let html = `
        <div class="form-group">
            <label class="info-label">Category Definitions:</label>
            <div style="display: flex; flex-direction: column; gap: 12px;">`;

    categoryDefs.forEach((catDef, catIndex) => {
        html += `
                <div style="border: 1px solid #ddd; padding: 12px; border-radius: 4px; background: #f9f9f9;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong>Definition #${catIndex + 1}</strong>
                        <button class="btn btn-danger btn-small" 
                                onclick="removeCategoryDefinition(${synergyIndex}, ${catIndex})"
                                style="padding: 4px 8px;">
                            <span class="icon">×</span> Remove
                        </button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div>
                            <label style="font-size: 12px; color: #666;">Include Tags (comma-separated):</label>
                            <input type="text" 
                                   class="tag-input"
                                   data-synergy-index="${synergyIndex}"
                                   data-cat-index="${catIndex}"
                                   data-field="include"
                                   value="${(catDef.include || []).join(', ')}"
                                   onblur="updateCategoryDefInclude(${synergyIndex}, ${catIndex}, this.value)"
                                   style="width: 100%; font-family: monospace;"
                                   placeholder="Empire, Sith, Dark Side">
                        </div>
                        <div>
                            <label style="font-size: 12px; color: #666;">Exclude Tags (comma-separated, optional):</label>
                            <input type="text" 
                                   class="tag-input"
                                   data-synergy-index="${synergyIndex}"
                                   data-cat-index="${catIndex}"
                                   data-field="exclude"
                                   value="${(catDef.exclude || []).join(', ')}"
                                   onblur="updateCategoryDefExclude(${synergyIndex}, ${catIndex}, this.value)"
                                   style="width: 100%; font-family: monospace;"
                                   placeholder="Jedi, Light Side">
                        </div>
                        <div>
                            <label style="font-size: 12px; color: #666;">Number Matches Required (1-4):</label>
                            <input type="number" 
                                   min="1" 
                                   max="4" 
                                   value="${catDef.numberMatchesRequired || 1}"
                                   onchange="updateCategoryDefNumberMatches(${synergyIndex}, ${catIndex}, this.value)"
                                   style="width: 80px;">
                        </div>
                    </div>
                </div>`;
    });

    html += `
            </div>`;

    // Only show Add Category Definition button if limit not reached
    if (canAddCategoryDef) {
        html += `
            <button class="btn btn-primary btn-small" 
                    onclick="addCategoryDefinition(${synergyIndex})"
                    style="margin-top: 8px; align-self: flex-end;">
                <span class="icon">+</span> Add Category Definition
            </button>`;
    } else {
        html += `
            <div style="margin-top: 8px; font-size: 12px; color: #999; font-style: italic;">
                Cannot add more category definitions (limit: characters + required matches = 4)
            </div>`;
    }

    html += `
        </div>`;

    return html;
}

// ============================================
function renderSynergyEditor(character) {
    const container = document.getElementById('synergyEditor');

    // Use draft values if available, otherwise use character values
    const draftValues = currentDraft || character;

    if (!draftValues.synergySets || draftValues.synergySets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No synergy sets defined</p>
            </div>
            <button class="btn btn-primary add-synergy-btn" onclick="addSynergySet()">
                <span class="icon">+</span> Add Synergy Set
            </button>
        `;
        return;
    }

    let html = '<div class="synergy-list">';

    draftValues.synergySets.forEach((synergySet, index) => {
        // Build separate section for characters
        let charactersHtml = '';

        // Characters section
        if (synergySet.characters && synergySet.characters.length > 0) {
            charactersHtml = `
                <div class="info-row">
                    <span class="info-label">Characters</span>
                    <span class="info-value">${synergySet.characters.join(', ')}</span>
                </div>`;
        }

        html += `
            <div class="synergy-set">
                <div class="synergy-set-header">
                    <span class="synergy-set-title">Synergy Set #${index + 1}</span>
                    <button class="btn btn-danger btn-small" onclick="removeSynergySet(${index})">
                        <span class="icon">×</span> Remove
                    </button>
                </div>
                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="chkSynergyEnhancement_${index}" 
                               ${synergySet.synergyEnhancement !== undefined ? 'checked' : ''}
                               onchange="toggleSynergyEnhancement(${index})" style="margin-right: 8px;">
                        Synergy Enhancement (0-10)
                    </label>
                    <input type="number" 
                           class="form-input"
                           id="inputSynergyEnhancement_${index}"
                           min="0" 
                           max="10" 
                           value="${synergySet.synergyEnhancement ?? 0}"
                           ${synergySet.synergyEnhancement === undefined ? 'readonly' : ''}
                           onchange="updateSynergyEnhancement(${index}, this.value)">
                    <div class="form-help">When checked, the specified synergy enhancement will be applied if the synergy set criteria are met.</div>
                </div>
                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="chkSynergyOmicron_${index}" 
                               ${synergySet.synergyEnhancementOmicron !== undefined ? 'checked' : ''}
                               onchange="toggleSynergyOmicronEnhancement(${index})" style="margin-right: 8px;">
                        Omicron Enhancement (0-10)
                    </label>
                    <input type="number" 
                           class="form-input"
                           id="inputSynergyOmicron_${index}"
                           min="0" 
                           max="10" 
                           value="${synergySet.synergyEnhancementOmicron ?? 0}"
                           ${synergySet.synergyEnhancementOmicron === undefined ? 'readonly' : ''}
                           onchange="updateSynergyOmicronEnhancement(${index}, this.value)">
                    <div class="form-help">When checked, the specified Omicron enhancement will be applied to the synergy characters specified below. NOTE: This will only apply if ${character.id} has an Omicron ability.</div>
                </div>
                ${renderSynergyCharactersEditor(index, synergySet)}
                ${renderSynergyCategoryDefinitionsEditor(index, synergySet)}
                ${renderSynergyExclusionsEditor(index, synergySet)}
            </div>
        `;
    });

    html += '</div>';
    html += `
        <button class="btn btn-primary add-synergy-btn" onclick="addSynergySet()">
            <span class="icon">+</span> Add Synergy Set
        </button>
    `;

    container.innerHTML = html;
}

function addSynergySet() {
    if (!selectedCharacter || !currentDraft) return;

    // Initialize synergySets array if it doesn't exist
    if (!currentDraft.synergySets) {
        currentDraft.synergySets = [];
    }

    // Add a basic synergy set template
    currentDraft.synergySets.push({
        synergyEnhancement: 0,
        characters: []
    });

    refreshDraftDirtyState();
    updateStatus('Synergy set added - click Update Character to apply', 'warning');

    renderSynergyEditor(selectedCharacter);
}

function removeSynergySet(index) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets) return;

    if (confirm('Are you sure you want to remove this synergy set?')) {
        currentDraft.synergySets.splice(index, 1);

        // Remove synergySets array if empty
        if (currentDraft.synergySets.length === 0) {
            delete currentDraft.synergySets;
        }

        refreshDraftDirtyState();
        updateStatus('Synergy set removed - click Update Character to apply', 'warning');

        renderSynergyEditor(selectedCharacter);
    }
}

function toggleSynergyEnhancement(index) {
    const checkbox = document.getElementById(`chkSynergyEnhancement_${index}`);
    const input = document.getElementById(`inputSynergyEnhancement_${index}`);

    if (checkbox.checked) {
        // Enable input - user wants to set a specific value
        input.removeAttribute('readonly');
    } else {
        // Disable input and show default value
        input.setAttribute('readonly', 'readonly');
        input.value = 0;
    }
}

function updateSynergyEnhancement(index, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[index]) return;

    const hasSynergyEnhancement = document.getElementById(`chkSynergyEnhancement_${index}`).checked;
    const numValue = parseInt(value, 10);

    if (hasSynergyEnhancement && (isNaN(numValue) || numValue < 0 || numValue > 10)) {
        alert('Synergy Enhancement must be between 0 and 10');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Use checkbox state to determine whether to set the value
    if (hasSynergyEnhancement) {
        currentDraft.synergySets[index].synergyEnhancement = numValue;
    } else {
        delete currentDraft.synergySets[index].synergyEnhancement;
    }

    refreshDraftDirtyState();
    updateStatus('Synergy enhancement updated - click Update Character to apply', 'warning');
}

function toggleSynergyOmicronEnhancement(index) {
    const checkbox = document.getElementById(`chkSynergyOmicron_${index}`);
    const input = document.getElementById(`inputSynergyOmicron_${index}`);

    if (checkbox.checked) {
        // Enable input - user wants to set a specific value
        input.removeAttribute('readonly');
    } else {
        // Disable input and show default value
        input.setAttribute('readonly', 'readonly');
        input.value = 0;
    }
}

function updateSynergyOmicronEnhancement(index, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[index]) return;

    const hasOmicronEnhancement = document.getElementById(`chkSynergyOmicron_${index}`).checked;
    const numValue = parseInt(value, 10);

    if (hasOmicronEnhancement && (isNaN(numValue) || numValue < 0 || numValue > 10)) {
        alert('Omicron Enhancement must be between 0 and 10');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Use checkbox state to determine whether to set the value
    if (hasOmicronEnhancement) {
        currentDraft.synergySets[index].synergyEnhancementOmicron = numValue;
    } else {
        delete currentDraft.synergySets[index].synergyEnhancementOmicron;
    }

    refreshDraftDirtyState();
    updateStatus('Omicron enhancement updated - click Update Character to apply', 'warning');
}

function addSynergyCharacter(synergyIndex) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];

    // Check if we've reached the limit
    const currentTotal = getSynergySlotUsage(synergySet);
    if (currentTotal >= 4) {
        alert('Cannot add more characters. This synergy set already references 4 teammates (max limit).');
        return;
    }

    if (!synergySet.characters) {
        synergySet.characters = [];
    }

    synergySet.characters.push('');

    refreshDraftDirtyState();
    updateStatus('Character field added - click Update Character to apply', 'warning');
    renderSynergyEditor(selectedCharacter);
}

function getAvailableCharacterIds(synergyIndex, charIndex) {
    if (!selectedCharacter || !currentDraft) return [];

    const currentCharId = selectedCharacter.id;
    const synergySet = currentDraft.synergySets?.[synergyIndex];
    const existingCharIds = synergySet?.characters || [];

    // Get the ID being edited (if any)
    const editingCharId = existingCharIds[charIndex] || '';

    return characterData
        .map(char => char.id)
        .filter(id => {
            // Exclude the current character being edited
            if (id === currentCharId) return false;
            // Include the character being edited or characters not in the list
            return id === editingCharId || !existingCharIds.includes(id);
        })
        .sort();
}

function showCharacterDropdown(inputElement, synergyIndex, charIndex) {
    hideAllDropdowns();

    const availableIds = getAvailableCharacterIds(synergyIndex, charIndex);
    const inputValue = inputElement.value.trim().toUpperCase();

    const filteredIds = inputValue
        ? availableIds.filter(id => id.startsWith(inputValue))
        : availableIds;

    if (filteredIds.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'character-dropdown';
    dropdown.id = `dropdown_${synergyIndex}_${charIndex}`;

    filteredIds.forEach((id, index) => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.textContent = id;
        option.dataset.index = index;

        option.addEventListener('click', (e) => {
            e.stopPropagation();
            selectCharacterFromDropdown(synergyIndex, charIndex, id);
        });

        option.addEventListener('mouseenter', () => {
            dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });

        dropdown.appendChild(option);
    });

    const inputRect = inputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;

    document.body.appendChild(dropdown);

    inputElement.dataset.dropdownOpen = 'true';
}

function hideAllDropdowns() {
    document.querySelectorAll('.character-dropdown').forEach(dropdown => dropdown.remove());
    document.querySelectorAll('[id^="tag-dropdown_"]').forEach(dropdown => dropdown.remove());
    document.querySelectorAll('input[data-dropdown-open]').forEach(input => {
        delete input.dataset.dropdownOpen;
    });
}

function selectCharacterFromDropdown(synergyIndex, charIndex, characterId) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.characters || charIndex >= synergySet.characters.length) return;

    synergySet.characters[charIndex] = characterId;

    refreshDraftDirtyState();
    updateStatus('Character selected - staged in draft', 'warning');

    hideAllDropdowns();
    renderSynergyEditor(selectedCharacter);
}

function handleCharacterInputKeydown(event, inputElement, synergyIndex, charIndex) {
    const dropdown = document.getElementById(`dropdown_${synergyIndex}_${charIndex}`);

    if (!dropdown) {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            showCharacterDropdown(inputElement, synergyIndex, charIndex);
            event.preventDefault();
        }
        return;
    }

    const options = dropdown.querySelectorAll('.dropdown-option');
    const selectedOption = dropdown.querySelector('.dropdown-option.selected');
    let currentIndex = selectedOption ? parseInt(selectedOption.dataset.index) : -1;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = Math.min(currentIndex + 1, options.length - 1);
            options.forEach(opt => opt.classList.remove('selected'));
            if (options[currentIndex]) {
                options[currentIndex].classList.add('selected');
                options[currentIndex].scrollIntoView({ block: 'nearest' });
            }
            break;

        case 'ArrowUp':
            event.preventDefault();
            currentIndex = Math.max(currentIndex - 1, 0);
            options.forEach(opt => opt.classList.remove('selected'));
            if (options[currentIndex]) {
                options[currentIndex].classList.add('selected');
                options[currentIndex].scrollIntoView({ block: 'nearest' });
            }
            break;

        case 'Enter':
            event.preventDefault();
            if (selectedOption) {
                selectCharacterFromDropdown(synergyIndex, charIndex, selectedOption.textContent);
            } else if (options.length === 1) {
                selectCharacterFromDropdown(synergyIndex, charIndex, options[0].textContent);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAllDropdowns();
            break;
    }
}

function removeSynergyCharacter(synergyIndex, charIndex) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.characters || charIndex >= synergySet.characters.length) return;

    // Check for unsaved draft changes (gate before destructive action)
    if (!confirmDiscardDrafts()) {
        return;
    }

    synergySet.characters.splice(charIndex, 1);

    // Remove characters array if empty
    if (synergySet.characters.length === 0) {
        delete synergySet.characters;
    }

    refreshDraftDirtyState();
    updateStatus('Character removed - staged in draft', 'warning');
    renderSynergyEditor(selectedCharacter);
}

// ============================================
// Exclusion Character Handlers
// ============================================
function addExclusionCharacter(synergyIndex) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];

    if (!synergySet.skipIfPresentCharacters) {
        synergySet.skipIfPresentCharacters = [];
    }

    synergySet.skipIfPresentCharacters.push('');

    refreshDraftDirtyState();
    updateStatus('Exclusion field added - click Update Character to apply', 'warning');
    renderSynergyEditor(selectedCharacter);
}

function removeExclusionCharacter(synergyIndex, exclIndex) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.skipIfPresentCharacters || exclIndex >= synergySet.skipIfPresentCharacters.length) return;

    // Check for unsaved draft changes (gate before destructive action)
    if (!confirmDiscardDrafts()) {
        return;
    }

    synergySet.skipIfPresentCharacters.splice(exclIndex, 1);

    // Remove array if empty
    if (synergySet.skipIfPresentCharacters.length === 0) {
        delete synergySet.skipIfPresentCharacters;
    }

    refreshDraftDirtyState();
    updateStatus('Exclusion removed - staged in draft', 'warning');
    renderSynergyEditor(selectedCharacter);
}

function updateExclusionCharacter(synergyIndex, exclIndex, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.skipIfPresentCharacters || exclIndex >= synergySet.skipIfPresentCharacters.length) return;

    // Auto-uppercase and trim
    value = value.trim().toUpperCase();

    // Auto-remove if empty
    if (value === '') {
        removeExclusionCharacter(synergyIndex, exclIndex);
        return;
    }

    // Validate format: uppercase letters, numbers, and underscores only
    const validPattern = /^[A-Z0-9_]+$/;
    if (!validPattern.test(value)) {
        alert('Invalid character ID format. Only uppercase letters, numbers, and underscores are allowed.');
        // Re-render to restore previous value
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check for duplicates within the same exclusion list
    const isDuplicate = synergySet.skipIfPresentCharacters.some((excl, i) =>
        i !== exclIndex && excl === value
    );

    if (isDuplicate) {
        alert('This character is already in the exclusion list. Duplicates are not allowed.');
        // Re-render to restore previous value
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Update the value
    synergySet.skipIfPresentCharacters[exclIndex] = value;

    refreshDraftDirtyState();
    updateStatus('Exclusion character updated - staged in draft', 'warning');
    renderSynergyEditor(selectedCharacter);
}

function getAvailableExclusionIds(synergyIndex, exclIndex) {
    if (!selectedCharacter || !currentDraft) return [];

    const currentCharId = selectedCharacter.id;
    const synergySet = currentDraft.synergySets?.[synergyIndex];
    const existingExclIds = synergySet?.skipIfPresentCharacters || [];

    // Get the ID being edited (if any)
    const editingExclId = existingExclIds[exclIndex] || '';

    return characterData
        .map(char => char.id)
        .filter(id => {
            // Exclude the current character being edited
            if (id === currentCharId) return false;
            // Include the exclusion being edited or characters not in the list
            return id === editingExclId || !existingExclIds.includes(id);
        })
        .sort();
}

function showExclusionDropdown(inputElement, synergyIndex, exclIndex) {
    hideAllDropdowns();

    const availableIds = getAvailableExclusionIds(synergyIndex, exclIndex);
    const inputValue = inputElement.value.trim().toUpperCase();

    const filteredIds = inputValue
        ? availableIds.filter(id => id.startsWith(inputValue))
        : availableIds;

    if (filteredIds.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'character-dropdown';
    dropdown.id = `exclDropdown_${synergyIndex}_${exclIndex}`;

    filteredIds.forEach((id, index) => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.textContent = id;
        option.dataset.index = index;

        option.addEventListener('click', (e) => {
            e.stopPropagation();
            selectExclusionFromDropdown(synergyIndex, exclIndex, id);
        });

        option.addEventListener('mouseenter', () => {
            dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });

        dropdown.appendChild(option);
    });

    const inputRect = inputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;

    document.body.appendChild(dropdown);

    inputElement.dataset.dropdownOpen = 'true';
}

function selectExclusionFromDropdown(synergyIndex, exclIndex, characterId) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.skipIfPresentCharacters || exclIndex >= synergySet.skipIfPresentCharacters.length) return;

    synergySet.skipIfPresentCharacters[exclIndex] = characterId;

    refreshDraftDirtyState();
    updateStatus('Exclusion character selected - staged in draft', 'warning');

    hideAllDropdowns();
    renderSynergyEditor(selectedCharacter);
}

function handleExclusionInputKeydown(event, inputElement, synergyIndex, exclIndex) {
    const dropdown = document.getElementById(`exclDropdown_${synergyIndex}_${exclIndex}`);

    if (!dropdown) {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            showExclusionDropdown(inputElement, synergyIndex, exclIndex);
            event.preventDefault();
        }
        return;
    }

    const options = dropdown.querySelectorAll('.dropdown-option');
    const selectedOption = dropdown.querySelector('.dropdown-option.selected');
    let currentIndex = selectedOption ? parseInt(selectedOption.dataset.index) : -1;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = Math.min(currentIndex + 1, options.length - 1);
            options.forEach(opt => opt.classList.remove('selected'));
            if (options[currentIndex]) {
                options[currentIndex].classList.add('selected');
                options[currentIndex].scrollIntoView({ block: 'nearest' });
            }
            break;

        case 'ArrowUp':
            event.preventDefault();
            currentIndex = Math.max(currentIndex - 1, 0);
            options.forEach(opt => opt.classList.remove('selected'));
            if (options[currentIndex]) {
                options[currentIndex].classList.add('selected');
                options[currentIndex].scrollIntoView({ block: 'nearest' });
            }
            break;

        case 'Enter':
            event.preventDefault();
            if (selectedOption) {
                selectExclusionFromDropdown(synergyIndex, exclIndex, selectedOption.textContent);
            } else if (options.length === 1) {
                selectExclusionFromDropdown(synergyIndex, exclIndex, options[0].textContent);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAllDropdowns();
            break;
    }
}

// Tag dropdown helper functions for category definitions
function showTagDropdown(inputElement, synergyIndex, catIndex, field) {
    hideAllDropdowns();

    if (!currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.categoryDefinitions || !synergySet.categoryDefinitions[catIndex]) return;

    const catDef = synergySet.categoryDefinitions[catIndex];

    // Get already-used tags in this category definition
    const usedTags = new Set();
    if (catDef.include && Array.isArray(catDef.include)) {
        catDef.include.forEach(tag => usedTags.add(tag.toLowerCase()));
    }
    if (catDef.exclude && Array.isArray(catDef.exclude)) {
        catDef.exclude.forEach(tag => usedTags.add(tag.toLowerCase()));
    }

    // Get current input value (last incomplete tag being typed)
    const inputValue = inputElement.value;
    const cursorPosition = inputElement.selectionStart;
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastCommaIndex = textBeforeCursor.lastIndexOf(',');
    const currentTag = textBeforeCursor.substring(lastCommaIndex + 1).trim();

    // Filter available tags: not already used + matches current input
    const availableTags = categoryTags.filter(tag => {
        const lowerTag = tag.toLowerCase();
        if (usedTags.has(lowerTag)) return false;
        if (currentTag && !lowerTag.startsWith(currentTag.toLowerCase())) return false;
        return true;
    });

    if (availableTags.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'character-dropdown'; // Reuse existing CSS
    dropdown.id = `tag-dropdown_${synergyIndex}_${catIndex}_${field}`;

    availableTags.forEach((tag, index) => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.textContent = tag;
        option.dataset.index = index;

        option.addEventListener('click', (e) => {
            e.stopPropagation();
            insertTagAtCursor(inputElement, tag, synergyIndex, catIndex, field);
        });

        option.addEventListener('mouseenter', () => {
            dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });

        dropdown.appendChild(option);
    });

    const inputRect = inputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;

    document.body.appendChild(dropdown);

    inputElement.dataset.dropdownOpen = 'true';
}

function insertTagAtCursor(inputElement, tag, synergyIndex, catIndex, field) {
    const cursorPosition = inputElement.selectionStart;
    const inputValue = inputElement.value;

    // Find the start of the current tag being edited
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastCommaIndex = textBeforeCursor.lastIndexOf(',');
    const tagStartIndex = lastCommaIndex === -1 ? 0 : lastCommaIndex + 1;

    // Find where current tag ends (next comma or end of string)
    const textAfterCursor = inputValue.substring(cursorPosition);
    const nextCommaIndex = textAfterCursor.indexOf(',');
    const tagEndIndex = nextCommaIndex === -1 ? inputValue.length : cursorPosition + nextCommaIndex;

    // Build new value: before + tag + after
    const before = inputValue.substring(0, tagStartIndex).trim();
    const after = inputValue.substring(tagEndIndex).trim();

    let newValue;
    if (before && after) {
        newValue = before + ', ' + tag + ', ' + after;
    } else if (before) {
        newValue = before + ', ' + tag;
    } else if (after) {
        newValue = tag + ', ' + after;
    } else {
        newValue = tag;
    }

    inputElement.value = newValue;

    // Update the draft
    if (field === 'include') {
        updateCategoryDefInclude(synergyIndex, catIndex, newValue);
    } else {
        updateCategoryDefExclude(synergyIndex, catIndex, newValue);
    }

    hideAllDropdowns();

    // Set cursor after the inserted tag
    const newCursorPos = (before ? before.length + 2 : 0) + tag.length;
    inputElement.focus();
    inputElement.setSelectionRange(newCursorPos, newCursorPos);
}

function handleTagInputKeydown(event, inputElement, synergyIndex, catIndex, field) {
    const dropdown = document.getElementById(`tag-dropdown_${synergyIndex}_${catIndex}_${field}`);

    if (!dropdown) {
        if (event.key === 'ArrowDown') {
            showTagDropdown(inputElement, synergyIndex, catIndex, field);
            event.preventDefault();
        }
        return;
    }

    const options = dropdown.querySelectorAll('.dropdown-option');
    const selectedOption = dropdown.querySelector('.dropdown-option.selected');
    let currentIndex = selectedOption ? parseInt(selectedOption.dataset.index) : -1;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = Math.min(currentIndex + 1, options.length - 1);
            options.forEach(opt => opt.classList.remove('selected'));
            if (options[currentIndex]) {
                options[currentIndex].classList.add('selected');
                options[currentIndex].scrollIntoView({ block: 'nearest' });
            }
            break;

        case 'ArrowUp':
            event.preventDefault();
            currentIndex = Math.max(currentIndex - 1, 0);
            options.forEach(opt => opt.classList.remove('selected'));
            if (options[currentIndex]) {
                options[currentIndex].classList.add('selected');
                options[currentIndex].scrollIntoView({ block: 'nearest' });
            }
            break;

        case 'Enter':
        case 'Tab':
            if (selectedOption) {
                event.preventDefault();
                insertTagAtCursor(inputElement, selectedOption.textContent, synergyIndex, catIndex, field);
            } else if (options.length === 1) {
                event.preventDefault();
                insertTagAtCursor(inputElement, options[0].textContent, synergyIndex, catIndex, field);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAllDropdowns();
            break;
    }
}

function updateSynergyCharacter(synergyIndex, charIndex, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.characters || charIndex >= synergySet.characters.length) return;

    const trimmedValue = value.trim();

    // Validate format
    const validPattern = /^[A-Z0-9_]+$/;
    if (trimmedValue && !validPattern.test(trimmedValue)) {
        alert('Invalid character ID format. Must contain only uppercase letters, numbers, and underscores.');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check for duplicates (excluding current index)
    const otherCharacters = synergySet.characters.filter((_, idx) => idx !== charIndex);
    if (trimmedValue && otherCharacters.includes(trimmedValue)) {
        alert('Duplicate character ID. Each ID must be unique.');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Update the value
    synergySet.characters[charIndex] = trimmedValue;

    refreshDraftDirtyState();
    updateStatus('Character updated - staged in draft', 'warning');
    renderTierGrid();
}

function addCategoryDefinition(synergyIndex) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    // Check for unsaved draft changes
    if (!confirmDiscardDrafts()) {
        return;
    }

    const synergySet = currentDraft.synergySets[synergyIndex];

    // Check if adding a new definition (with default of 1 match) would exceed the limit
    const currentTotal = getSynergySlotUsage(synergySet);
    if (currentTotal >= 4) {
        alert('Cannot add more category definitions. This synergy set already references 4 teammates (max limit).');
        return;
    }

    if (!synergySet.categoryDefinitions) {
        synergySet.categoryDefinitions = [];
    }

    synergySet.categoryDefinitions.push({
        include: [],
        numberMatchesRequired: 1
    });

    refreshDraftDirtyState();
    updateStatus('Category definition added - staged in draft', 'warning');
    renderSynergyEditor(selectedCharacter);
}

function removeCategoryDefinition(synergyIndex, catIndex) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.categoryDefinitions || catIndex >= synergySet.categoryDefinitions.length) return;

    // Check for unsaved draft changes (gate before destructive action)
    if (!confirmDiscardDrafts()) {
        return;
    }

    synergySet.categoryDefinitions.splice(catIndex, 1);

    // Remove categoryDefinitions array if empty
    if (synergySet.categoryDefinitions.length === 0) {
        delete synergySet.categoryDefinitions;
    }

    refreshDraftDirtyState();
    updateStatus('Category definition removed - staged in draft', 'warning');
    renderSynergyEditor(selectedCharacter);
}

function updateCategoryDefInclude(synergyIndex, catIndex, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.categoryDefinitions || catIndex >= synergySet.categoryDefinitions.length) return;

    const tags = value.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

    if (tags.length === 0) {
        alert('Include tags cannot be empty. At least one tag is required.');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check for case-insensitive duplicates within include tags
    const lowerCaseTags = tags.map(tag => tag.toLowerCase());
    const uniqueLowerCaseTags = new Set(lowerCaseTags);
    if (lowerCaseTags.length !== uniqueLowerCaseTags.size) {
        // Find which tags are duplicated
        const duplicates = lowerCaseTags.filter((tag, index) => lowerCaseTags.indexOf(tag) !== index);
        const duplicateOriginals = [...new Set(duplicates.map(dupLower =>
            tags[lowerCaseTags.indexOf(dupLower)]
        ))];
        alert(`Duplicate include tags detected (case-insensitive): ${duplicateOriginals.join(', ')}`);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check for case-insensitive overlap with exclude tags
    const excludeTags = synergySet.categoryDefinitions[catIndex].exclude || [];
    const lowerCaseExclude = excludeTags.map(tag => tag.toLowerCase());
    const overlappingTags = tags.filter((tag, index) => lowerCaseExclude.includes(lowerCaseTags[index]));
    if (overlappingTags.length > 0) {
        alert(`Tags cannot appear in both include and exclude: ${overlappingTags.join(', ')}`);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    synergySet.categoryDefinitions[catIndex].include = tags;

    refreshDraftDirtyState();
    updateStatus('Include tags updated - staged in draft', 'warning');
}

function updateCategoryDefExclude(synergyIndex, catIndex, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.categoryDefinitions || catIndex >= synergySet.categoryDefinitions.length) return;

    const tags = value.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

    if (tags.length === 0) {
        delete synergySet.categoryDefinitions[catIndex].exclude;
    } else {
        // Check for case-insensitive duplicates within exclude tags
        const lowerCaseTags = tags.map(tag => tag.toLowerCase());
        const uniqueLowerCaseTags = new Set(lowerCaseTags);
        if (lowerCaseTags.length !== uniqueLowerCaseTags.size) {
            // Find which tags are duplicated
            const duplicates = lowerCaseTags.filter((tag, index) => lowerCaseTags.indexOf(tag) !== index);
            const duplicateOriginals = [...new Set(duplicates.map(dupLower =>
                tags[lowerCaseTags.indexOf(dupLower)]
            ))];
            alert(`Duplicate exclude tags detected (case-insensitive): ${duplicateOriginals.join(', ')}`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        // Check for case-insensitive overlap with include tags
        const includeTags = synergySet.categoryDefinitions[catIndex].include || [];
        const lowerCaseInclude = includeTags.map(tag => tag.toLowerCase());
        const overlappingTags = tags.filter((tag, index) => lowerCaseInclude.includes(lowerCaseTags[index]));
        if (overlappingTags.length > 0) {
            alert(`Tags cannot appear in both include and exclude: ${overlappingTags.join(', ')}`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        synergySet.categoryDefinitions[catIndex].exclude = tags;
    }

    refreshDraftDirtyState();
    updateStatus('Exclude tags updated - staged in draft', 'warning');
}

function updateCategoryDefNumberMatches(synergyIndex, catIndex, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[synergyIndex]) return;

    const synergySet = currentDraft.synergySets[synergyIndex];
    if (!synergySet.categoryDefinitions || catIndex >= synergySet.categoryDefinitions.length) return;

    const numValue = parseInt(value, 10);

    if (isNaN(numValue) || numValue < 1 || numValue > 4) {
        alert('Number matches required must be between 1 and 4.');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Calculate what the total would be with the new value
    const oldValue = synergySet.categoryDefinitions[catIndex].numberMatchesRequired || 1;
    const currentSlots = getSynergySlotUsage(synergySet);
    const newSlots = currentSlots - oldValue + numValue;

    // Enforce the 4-slot limit
    if (newSlots > 4) {
        alert(`Cannot set number matches to ${numValue}. This synergy set would reference ${newSlots} total teammates (max: 4).\n\nCurrent slots used: ${currentSlots}\nCharacters: ${(synergySet.characters || []).length}\nCategory matches: ${currentSlots - (synergySet.characters || []).length}`);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    synergySet.categoryDefinitions[catIndex].numberMatchesRequired = numValue;

    refreshDraftDirtyState();
    updateStatus('Number matches updated - staged in draft', 'warning');

    // Re-render to update button states
    renderSynergyEditor(selectedCharacter);
}

// Legacy function kept for reference - can be removed if no longer needed
function updateSynergyCategoryDefinitions_OLD(index, value) {
    if (!selectedCharacter || !selectedCharacter.synergySets || !selectedCharacter.synergySets[index]) return;

    const trimmedValue = value.trim();

    // If empty, remove categoryDefinitions
    if (trimmedValue === '') {
        delete selectedCharacter.synergySets[index].categoryDefinitions;
        hasUnsavedChanges = true;
        updateStatus('Category definitions removed - unsaved changes', 'warning');
        renderSynergyEditor(selectedCharacter);
        renderTierGrid();
        return;
    }

    // Try to parse as JSON
    let categoryDefs;
    try {
        categoryDefs = JSON.parse(trimmedValue);
    } catch (e) {
        alert('Invalid JSON format. Please check your syntax.');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Validate it's an array
    if (!Array.isArray(categoryDefs)) {
        alert('Category definitions must be an array of objects.');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Validate each category definition
    for (let i = 0; i < categoryDefs.length; i++) {
        const catDef = categoryDefs[i];

        // Must be an object
        if (typeof catDef !== 'object' || catDef === null) {
            alert(`Category definition #${i + 1} must be an object.`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        // Must have 'include' array
        if (!catDef.include || !Array.isArray(catDef.include) || catDef.include.length === 0) {
            alert(`Category definition #${i + 1} must have a non-empty "include" array.`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        // Validate all include values are strings
        if (!catDef.include.every(tag => typeof tag === 'string' && tag.length > 0)) {
            alert(`Category definition #${i + 1}: all "include" values must be non-empty strings.`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        // Must have numberMatchesRequired
        if (!catDef.numberMatchesRequired || typeof catDef.numberMatchesRequired !== 'number') {
            alert(`Category definition #${i + 1} must have "numberMatchesRequired" as a number.`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        // numberMatchesRequired must be 1-4
        if (catDef.numberMatchesRequired < 1 || catDef.numberMatchesRequired > 4) {
            alert(`Category definition #${i + 1}: "numberMatchesRequired" must be between 1 and 4.`);
            renderSynergyEditor(selectedCharacter);
            return;
        }

        // If exclude exists, validate it
        if (catDef.exclude !== undefined) {
            if (!Array.isArray(catDef.exclude)) {
                alert(`Category definition #${i + 1}: "exclude" must be an array.`);
                renderSynergyEditor(selectedCharacter);
                return;
            }

            if (!catDef.exclude.every(tag => typeof tag === 'string' && tag.length > 0)) {
                alert(`Category definition #${i + 1}: all "exclude" values must be non-empty strings.`);
                renderSynergyEditor(selectedCharacter);
                return;
            }
        }

        // Check for unknown properties
        const allowedProps = ['include', 'exclude', 'numberMatchesRequired'];
        const unknownProps = Object.keys(catDef).filter(key => !allowedProps.includes(key));
        if (unknownProps.length > 0) {
            alert(`Category definition #${i + 1} has unknown properties: ${unknownProps.join(', ')}`);
            renderSynergyEditor(selectedCharacter);
            return;
        }
    }

    // All validation passed, update the data
    selectedCharacter.synergySets[index].categoryDefinitions = categoryDefs;

    hasUnsavedChanges = true;
    updateSaveButtonState();
    updateStatus('Category definitions updated - unsaved changes', 'warning');
    renderSynergyEditor(selectedCharacter);
    renderTierGrid();
}

// ============================================
// Validation Results Modal
// ============================================
function showValidationResults(isValid, errors) {
    const modal = document.getElementById('validationModal');
    const resultsContainer = document.getElementById('validationResults');

    if (isValid) {
        resultsContainer.innerHTML = `
            <div class="validation-success">
                <strong>✓ Validation Passed</strong>
                <p>All character data is valid and ready to save.</p>
            </div>
        `;
    } else {
        let errorList = '<ul>';
        errors.forEach(error => {
            errorList += `<li>${error}</li>`;
        });
        errorList += '</ul>';

        resultsContainer.innerHTML = `
            <div class="validation-errors">
                <strong>✗ Validation Failed</strong>
                <p>Found ${errors.length} error(s):</p>
                ${errorList}
            </div>
        `;
    }

    modal.style.display = 'flex';
}

function closeValidationModal() {
    const modal = document.getElementById('validationModal');
    modal.style.display = 'none';
}

// ============================================
// UI Helpers
// ============================================
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

function updateSaveButtonState() {
    const saveButton = document.getElementById('btnSave');
    if (saveButton) {
        saveButton.disabled = !hasUnsavedChanges;
    }

    // Update both sidebar Update Character buttons
    const isDraftDirty = hasDraftChanges();
    const updateButtonLeft = document.getElementById('btnUpdateCharacterLeft');
    const updateButtonRight = document.getElementById('btnUpdateCharacterRight');

    if (updateButtonLeft) {
        updateButtonLeft.disabled = !isDraftDirty;
    }
    if (updateButtonRight) {
        updateButtonRight.disabled = !isDraftDirty;
    }
}

function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;

    // Optional: Add color coding based on type
    statusElement.style.color = type === 'error' ? 'var(--color-danger)' :
        type === 'success' ? 'var(--color-success)' :
            type === 'warning' ? 'var(--color-warning)' :
                'inherit';
}

function updateCharacterCount() {
    const countElement = document.getElementById('characterCount');
    countElement.textContent = `${characterData.length} characters`;
}

function updateValidationStatus(status) {
    const statusElement = document.getElementById('validationStatus');
    statusElement.textContent = status;
}
