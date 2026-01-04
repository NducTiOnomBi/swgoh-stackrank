// ============================================
// Application State
// ============================================
let characterData = [];
let selectedCharacter = null;
let includeSynergy = false;
let includeOmicron = false;
let selectedOmicronTypes = ['GAC', 'TB', 'TW']; // Default omicron types to include
let selectedOmicronModeSet = new Set([9, 14, 15, 7, 8]); // Cached Set of omicron mode values for performance
let hasUnsavedChanges = false;

// Omicron mode mapping from API (omicron_mode field) to selectable types
const OMICRON_MODE_MAP = {
    'GAC': [9, 14, 15],
    'TB': [7],
    'TW': [8],
    'Raid': [4],
    'Conquest': [11],
    'GC': [12]
};

// Performance: Index of omicron abilities by character ID and mode
let omicronAbilityIndex = new Map(); // Map<characterId, Set<omicron_mode>>

// Draft state for staging character edits before committing
let currentDraft = null;
let currentDraftBaseline = null; // Snapshot for dirty detection
let draftIsDirty = false; // Cached dirty state

// Category tag autocomplete cache
let categoryTags = []; // All unique tags from character.categories and categoryDefinitions

// Reference data from authoritative API
let referenceCharacters = []; // All characters from swgoh.spineless.net
let referenceAbilities = [];  // All abilities (zetas, omicrons, etc.)
let referenceCategories = []; // All possible categories/tags
let referenceRoles = [];      // All possible roles
let referenceAlignments = []; // All possible alignments

// Sidebar collapse state
let isLeftSidebarCollapsed = true;  // Start collapsed
let isRightSidebarCollapsed = true; // Start collapsed

// Filter state
let activeFilterCategories = [];
let activeFilterRoles = [];
let activeFilterAlignments = [];
let activeFilterCustomCategories = [];

// Filter operators (AND/OR per set)
let filterOperatorCategories = 'AND';
let filterOperatorRoles = 'OR';
let filterOperatorAlignments = 'OR';
let filterOperatorCustomCategories = 'AND';

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize event listeners
    initializeEventListeners();

    // Initialize omicron mode set from defaults
    updateOmicronModeSet();

    // Load reference data and character data in parallel
    await Promise.all([
        loadReferenceData(),
        loadCharacterData()
    ]);

    // Build category tag index after both data sources are loaded
    buildCategoryTagIndex();
});

function initializeEventListeners() {
    // Header actions
    document.getElementById('btnAddCharacter').addEventListener('click', addNewCharacter);
    document.getElementById('btnVisualize').addEventListener('click', showTierDistributionModal);
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

    // Omicron type multi-select dropdown with debouncing for performance
    let omicronTypeTimeout = null;
    document.getElementById('omicronTypeSelector').addEventListener('change', (e) => {
        const select = e.target;
        selectedOmicronTypes = Array.from(select.selectedOptions).map(opt => opt.value);

        // Update cached mode set for fast lookups
        updateOmicronModeSet();

        // Debounce re-render to batch rapid changes
        if (omicronTypeTimeout) clearTimeout(omicronTypeTimeout);
        omicronTypeTimeout = setTimeout(() => {
            renderTierGrid();
        }, 75);
    });

    document.getElementById('btnFilter').addEventListener('click', showFilterModal);

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Click outside to close all dropdowns (character, exclusion, tag, zeta, omicron, and custom category)
    document.addEventListener('click', (e) => {
        const isCharacterInput = e.target.closest('.character-input');
        const isCharacterDropdown = e.target.closest('.character-dropdown');
        const isExclusionInput = e.target.closest('.exclusion-input');
        const isExclusionDropdown = e.target.closest('[id^="exclDropdown_"]');
        const isTagInput = e.target.closest('.tag-input');
        const isTagDropdown = e.target.closest('[id^="tag-dropdown_"]');
        const isZetaInput = e.target.closest('.zeta-input');
        const isZetaDropdown = e.target.closest('[id^="zeta-dropdown_"]');
        const isOmicronInput = e.target.closest('.omicron-input');
        const isOmicronDropdown = e.target.closest('[id^="omicron-dropdown_"]');
        const isCustomCategoryInput = e.target.closest('.custom-category-input');
        const isCustomCategoryDropdown = e.target.closest('[id^="custom-category-dropdown_"]');

        if (!isCharacterInput && !isCharacterDropdown && !isExclusionInput && !isExclusionDropdown && !isTagInput && !isTagDropdown && !isZetaInput && !isZetaDropdown && !isOmicronInput && !isOmicronDropdown && !isCustomCategoryInput && !isCustomCategoryDropdown) {
            hideAllDropdowns();
        }
    });

    // Click on empty area in tier grid to deselect current character
    document.getElementById('tierGrid').addEventListener('click', (e) => {
        // Only deselect if clicking on the tier grid itself or tier containers (not a character card)
        const clickedElement = e.target;
        const isCharacterCard = clickedElement.classList.contains('character-card') || clickedElement.closest('.character-card');
        const isTierGrid = clickedElement.id === 'tierGrid';
        const isTierContainer = clickedElement.classList.contains('tier-container');

        if (!isCharacterCard && (isTierGrid || isTierContainer) && selectedCharacter) {
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
        // Custom category input events
        if (e.target.classList.contains('custom-category-input')) {
            const index = parseInt(e.target.dataset.categoryIndex);
            if (!isNaN(index)) {
                showCustomCategoryDropdown(e.target, index);
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
        // Custom category input keydown
        if (e.target.classList.contains('custom-category-input')) {
            const index = parseInt(e.target.dataset.categoryIndex);
            if (!isNaN(index)) {
                handleCustomCategoryInputKeydown(e, e.target, index);
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
        // Custom category input focus
        if (e.target.classList.contains('custom-category-input')) {
            const index = parseInt(e.target.dataset.categoryIndex);
            if (!isNaN(index)) {
                showCustomCategoryDropdown(e.target, index);
            }
        }
    }, true);
}

// ============================================
// Data Loading and Saving
// ============================================

/**
 * Loads reference data from the authoritative SWGOH API.
 * This includes characters, abilities, categories, roles, and alignments.
 * These are used for validation and autocomplete features.
 */
async function loadReferenceData() {
    const baseUrl = 'https://swgoh.spineless.net/api';

    try {
        updateStatus('Loading reference data...');

        // Fetch all reference data in parallel
        const [charactersRes, abilitiesRes, categoriesRes, rolesRes, alignmentsRes] = await Promise.all([
            fetch(`${baseUrl}/characters`),
            fetch(`${baseUrl}/abilities`),
            fetch(`${baseUrl}/categories`),
            fetch(`${baseUrl}/roles`),
            fetch(`${baseUrl}/alignments`)
        ]);

        // Check for failures
        const responses = [
            { name: 'characters', res: charactersRes },
            { name: 'abilities', res: abilitiesRes },
            { name: 'categories', res: categoriesRes },
            { name: 'roles', res: rolesRes },
            { name: 'alignments', res: alignmentsRes }
        ];

        const failures = responses.filter(r => !r.res.ok);
        if (failures.length > 0) {
            console.warn('Some reference data failed to load:', failures.map(f => f.name).join(', '));
        }

        // Parse successful responses
        if (charactersRes.ok) {
            referenceCharacters = await charactersRes.json();
            console.log(`Loaded ${referenceCharacters.length} reference characters`);
        }

        if (abilitiesRes.ok) {
            referenceAbilities = await abilitiesRes.json();
            console.log(`Loaded ${referenceAbilities.length} reference abilities`);

            // Build omicron ability index for performance
            buildOmicronAbilityIndex();
        }

        if (categoriesRes.ok) {
            referenceCategories = await categoriesRes.json();
            console.log(`Loaded ${referenceCategories.length} reference categories`);
        }

        if (rolesRes.ok) {
            referenceRoles = await rolesRes.json();
            console.log(`Loaded ${referenceRoles.length} reference roles`);
        }

        if (alignmentsRes.ok) {
            referenceAlignments = await alignmentsRes.json();
            console.log(`Loaded ${referenceAlignments.length} reference alignments`);
        }

        updateStatus('Reference data loaded');

        // Update missing characters display now that reference data is available
        updateMissingCharacters();
    } catch (error) {
        console.error('Error loading reference data:', error);
        updateStatus('Warning: Reference data unavailable', 'warning');
        // Don't block the app - reference data is supplementary

        // Still update the display even if reference data failed
        updateMissingCharacters();
    }
}

function updateOmicronModeSet() {
    selectedOmicronModeSet.clear();
    selectedOmicronTypes.forEach(type => {
        const modes = OMICRON_MODE_MAP[type];
        if (modes) {
            modes.forEach(mode => selectedOmicronModeSet.add(mode));
        }
    });
}

function buildOmicronAbilityIndex() {
    omicronAbilityIndex.clear();

    referenceAbilities.forEach(ability => {
        if (ability.is_omicron === true && ability.omicron_mode !== undefined) {
            const charId = ability.character_base_id;
            if (!omicronAbilityIndex.has(charId)) {
                omicronAbilityIndex.set(charId, new Set());
            }
            omicronAbilityIndex.get(charId).add(ability.omicron_mode);
        }
    });

    console.log(`Built omicron ability index for ${omicronAbilityIndex.size} characters`);
}

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
    });

    // Helper function to add tags from reference data arrays
    // Reference data may be strings OR objects with a name field
    const addReferenceData = (refArray, nameField = 'name') => {
        if (!refArray || !Array.isArray(refArray)) return;
        refArray.forEach(item => {
            const tag = typeof item === 'string' ? item : item[nameField];
            if (tag && typeof tag === 'string') {
                const lowerTag = tag.toLowerCase();
                if (!tagMap.has(lowerTag)) {
                    tagMap.set(lowerTag, tag);
                }
            }
        });
    };

    // Collect from reference data
    addReferenceData(referenceCategories);
    addReferenceData(referenceRoles);
    addReferenceData(referenceAlignments);

    // Convert to sorted array for display
    categoryTags = Array.from(tagMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    console.log(`Built category tag index with ${categoryTags.length} tags from:`, {
        characterCategories: tagMap.size - referenceCategories.length - referenceRoles.length - referenceAlignments.length,
        referenceCategories: referenceCategories.length,
        referenceRoles: referenceRoles.length,
        referenceAlignments: referenceAlignments.length
    });
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
    if (draft1.omicronBoost !== draft2.omicronBoost) return false;
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

    // Compare categories arrays
    const cat1 = draft1.categories;
    const cat2 = draft2.categories;
    if ((cat1 === undefined) !== (cat2 === undefined)) return false;
    if (cat1 && cat2) {
        if (cat1.length !== cat2.length) return false;
        for (let i = 0; i < cat1.length; i++) {
            if (cat1[i] !== cat2[i]) return false;
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

function isDraftValid() {
    if (!currentDraft) return true;

    // Check for empty strings in requiredZetas
    if (currentDraft.requiredZetas && currentDraft.requiredZetas.some(z => z.trim() === '')) {
        return false;
    }

    // Check for empty strings in requiredOmicrons
    if (currentDraft.requiredOmicrons && currentDraft.requiredOmicrons.some(o => o.trim() === '')) {
        return false;
    }

    // Check for empty strings or reserved names in custom categories
    if (currentDraft.categories) {
        if (currentDraft.categories.some(cat => cat.trim() === '')) {
            return false;
        }
        if (currentDraft.categories.some(cat => isReservedCategoryName(cat))) {
            return false;
        }
    }

    // Check for empty strings in synergy set characters
    if (currentDraft.synergySets) {
        for (const set of currentDraft.synergySets) {
            if (set.characters && set.characters.some(c => c.trim() === '')) {
                return false;
            }
            if (set.skipIfPresentCharacters && set.skipIfPresentCharacters.some(c => c.trim() === '')) {
                return false;
            }
        }
    }

    return true;
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
        omicronBoost: character.omicronBoost,
        ignoreRequirements: character.ignoreRequirements ? { ...character.ignoreRequirements } : undefined,
        ignoreSynergyRequirements: character.ignoreSynergyRequirements ? { ...character.ignoreSynergyRequirements } : undefined,
        // Clone zeta/omicron requirements arrays (mirror character structure)
        requiredZetas: character.requiredZetas !== undefined ? [...character.requiredZetas] : undefined,
        requiresAllZetas: character.requiresAllZetas,
        requiredOmicrons: character.requiredOmicrons !== undefined ? [...character.requiredOmicrons] : undefined,
        requiresAllOmicrons: character.requiresAllOmicrons,
        // Clone custom categories array
        categories: character.categories !== undefined ? [...character.categories] : undefined,
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
    const hasOmicronBoost = document.getElementById('chkHasOmicronBoost')?.checked;
    const omicronBoost = parseInt(document.getElementById('inputOmicronBoost')?.value);
    const ignoreReqGear = document.getElementById('ignoreReqGear')?.checked;
    const ignoreReqRarity = document.getElementById('ignoreReqRarity')?.checked;
    const ignoreSynergyReqGear = document.getElementById('ignoreSynergyReqGear')?.checked;
    const ignoreSynergyReqRarity = document.getElementById('ignoreSynergyReqRarity')?.checked;

    if (!currentDraft) {
        initializeDraft(selectedCharacter);
    }

    currentDraft.baseTier = baseTier;
    currentDraft.omicronBoost = hasOmicronBoost ? omicronBoost : undefined;

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
let selectedMissingCharacterId = null;

function addNewCharacter() {
    // Check for unsaved draft changes
    if (!confirmDiscardDrafts()) {
        return;
    }

    showAddCharacterModal();
}

function showAddCharacterModal() {
    const modal = document.getElementById('addCharacterModal');
    const missingSection = document.getElementById('missingCharactersSection');
    const missingList = document.getElementById('missingCharactersList');
    const searchInput = document.getElementById('missingCharacterSearch');
    const customInput = document.getElementById('customCharacterId');

    // Reset state
    selectedMissingCharacterId = null;
    customInput.value = '';
    searchInput.value = '';

    // Get missing characters
    const missingIds = getMissingCharacterIds();

    if (missingIds.length > 0) {
        // Show missing characters section
        missingSection.style.display = 'block';

        // Populate missing characters list
        missingList.innerHTML = '';
        missingIds.forEach(id => {
            const item = document.createElement('div');
            item.className = 'missing-character-item';
            item.textContent = id;
            item.dataset.characterId = id;
            item.addEventListener('click', () => selectMissingCharacter(id));
            missingList.appendChild(item);
        });

        // Setup search filter
        searchInput.addEventListener('input', filterMissingCharacters);
    } else {
        // Hide missing characters section if none exist
        missingSection.style.display = 'none';
    }

    // Show modal
    modal.style.display = 'flex';

    // Focus appropriate input
    if (missingIds.length > 0) {
        searchInput.focus();
    } else {
        customInput.focus();
    }
}

function closeAddCharacterModal() {
    const modal = document.getElementById('addCharacterModal');
    modal.style.display = 'none';
    selectedMissingCharacterId = null;
}

function filterMissingCharacters() {
    const searchInput = document.getElementById('missingCharacterSearch');
    const searchTerm = searchInput.value.trim().toUpperCase();
    const items = document.querySelectorAll('.missing-character-item');

    items.forEach(item => {
        const characterId = item.dataset.characterId;
        if (characterId.includes(searchTerm)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}

function selectMissingCharacter(characterId) {
    // Update selection state
    selectedMissingCharacterId = characterId;

    // Update visual selection
    document.querySelectorAll('.missing-character-item').forEach(item => {
        if (item.dataset.characterId === characterId) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    // Clear custom input when selecting from list
    document.getElementById('customCharacterId').value = '';
}

function submitNewCharacter() {
    const customInput = document.getElementById('customCharacterId');
    let characterId = null;

    // Determine which ID to use: selected missing character or custom input
    if (selectedMissingCharacterId) {
        characterId = selectedMissingCharacterId;
    } else {
        characterId = customInput.value.trim();
    }

    if (!characterId) {
        alert('Please select a character from the list or enter a custom character ID.');
        return;
    }

    // Validate format
    const validPattern = /^[A-Z0-9_]+$/;
    if (!validPattern.test(characterId)) {
        alert('Invalid character ID format. Must contain only uppercase letters, numbers, and underscores.');
        return;
    }

    // Check for duplicates
    const exists = characterData.some(char => char.id === characterId);
    if (exists) {
        alert(`Character "${characterId}" already exists.`);
        return;
    }

    // Create new character with default values
    const newCharacter = {
        id: characterId,
        baseTier: 17  // Default tier for new characters
    };

    // Add to character data
    characterData.push(newCharacter);

    // Mark as unsaved
    hasUnsavedChanges = true;
    updateSaveButtonState();
    updateStatus(`Character "${characterId}" added - unsaved changes`, 'warning');
    updateCharacterCount();

    // Re-render grid
    renderTierGrid();

    // Close modal
    closeAddCharacterModal();

    // Reset draft and auto-select the new character
    resetDraft();
    selectCharacter(newCharacter);
}

// ============================================
// Filter Modal
// ============================================
function setFilterOperator(filterSet, operator) {
    // Update state
    if (filterSet === 'Categories') {
        filterOperatorCategories = operator;
    } else if (filterSet === 'Roles') {
        filterOperatorRoles = operator;
    } else if (filterSet === 'Alignments') {
        filterOperatorAlignments = operator;
    } else if (filterSet === 'CustomCategories') {
        filterOperatorCustomCategories = operator;
    }

    // Update button visual states
    const andBtn = document.getElementById(`operator${filterSet}And`);
    const orBtn = document.getElementById(`operator${filterSet}Or`);

    if (operator === 'AND') {
        andBtn.classList.add('active');
        orBtn.classList.remove('active');
    } else {
        orBtn.classList.add('active');
        andBtn.classList.remove('active');
    }
}

function showFilterModal() {
    const modal = document.getElementById('filterModal');

    // Sort reference arrays alphabetically
    const sortedCategories = [...referenceCategories].sort();
    const sortedRoles = [...referenceRoles].sort();
    const sortedAlignments = [...referenceAlignments].sort();

    // Populate Categories
    const categoriesContainer = document.getElementById('filterCategories');
    categoriesContainer.innerHTML = '';
    sortedCategories.forEach(category => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = category;
        checkbox.checked = activeFilterCategories.includes(category);
        checkbox.addEventListener('change', updateFilterClearButton);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(category));
        categoriesContainer.appendChild(label);
    });

    // Populate Roles
    const rolesContainer = document.getElementById('filterRoles');
    rolesContainer.innerHTML = '';
    sortedRoles.forEach(role => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = role;
        checkbox.checked = activeFilterRoles.includes(role);
        checkbox.addEventListener('change', updateFilterClearButton);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(role));
        rolesContainer.appendChild(label);
    });

    // Populate Alignments
    const alignmentsContainer = document.getElementById('filterAlignments');
    alignmentsContainer.innerHTML = '';
    sortedAlignments.forEach(alignment => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = alignment;
        checkbox.checked = activeFilterAlignments.includes(alignment);
        checkbox.addEventListener('change', updateFilterClearButton);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(alignment));
        alignmentsContainer.appendChild(label);
    });

    // Populate Custom Character Categories
    const customCategoriesContainer = document.getElementById('filterCustomCategories');
    customCategoriesContainer.innerHTML = '';
    const allCustomCategories = new Set();
    characterData.forEach(char => {
        if (char.categories && Array.isArray(char.categories)) {
            char.categories.forEach(cat => allCustomCategories.add(cat));
        }
    });
    const sortedCustomCategories = Array.from(allCustomCategories).sort();
    if (sortedCustomCategories.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.color = '#888';
        emptyMessage.textContent = 'No custom categories defined';
        customCategoriesContainer.appendChild(emptyMessage);
    } else {
        sortedCustomCategories.forEach(category => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = category;
            checkbox.checked = activeFilterCustomCategories.includes(category);
            checkbox.addEventListener('change', updateFilterClearButton);

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(category));
            customCategoriesContainer.appendChild(label);
        });
    }

    // Initialize operator button states
    setFilterOperator('Categories', filterOperatorCategories);
    setFilterOperator('Roles', filterOperatorRoles);
    setFilterOperator('Alignments', filterOperatorAlignments);
    setFilterOperator('CustomCategories', filterOperatorCustomCategories);

    // Update Clear button state
    updateFilterClearButton();

    // Show modal
    modal.style.display = 'flex';
}

function closeFilterModal() {
    const modal = document.getElementById('filterModal');
    modal.style.display = 'none';
}

function applyFilter() {
    // Read checked values from checkboxes (these are the pending filter values)
    const categoryCheckboxes = document.querySelectorAll('#filterCategories input[type="checkbox"]:checked');
    const pendingCategories = Array.from(categoryCheckboxes).map(cb => cb.value);

    const roleCheckboxes = document.querySelectorAll('#filterRoles input[type="checkbox"]:checked');
    const pendingRoles = Array.from(roleCheckboxes).map(cb => cb.value);

    const alignmentCheckboxes = document.querySelectorAll('#filterAlignments input[type="checkbox"]:checked');
    const pendingAlignments = Array.from(alignmentCheckboxes).map(cb => cb.value);

    const customCategoryCheckboxes = document.querySelectorAll('#filterCustomCategories input[type="checkbox"]:checked');
    const pendingCustomCategories = Array.from(customCategoryCheckboxes).map(cb => cb.value);

    // Check if selected character would be filtered out
    if (selectedCharacter) {
        const wouldBeFiltered = willCharacterBeFilteredOut(
            selectedCharacter.id,
            pendingCategories,
            pendingRoles,
            pendingAlignments,
            pendingCustomCategories
        );

        if (wouldBeFiltered) {
            // Check for unsaved draft changes before deselecting
            if (!confirmDiscardDrafts()) {
                // User chose to keep editing - don't apply filter, close modal
                closeFilterModal();
                return;
            }

            // User confirmed discard or no changes - clear the character selection
            // This will reset draft, clear selectedCharacter, restore empty states, and collapse sidebars
            resetDraft();
            selectedCharacter = null;
            document.querySelectorAll('.character-card').forEach(card => {
                card.classList.remove('selected');
            });
            renderEmptyCharacterDetails();
            renderEmptySynergyEditor();
            collapseBothSidebars();
        }
    }

    // Apply the filter
    activeFilterCategories = pendingCategories;
    activeFilterRoles = pendingRoles;
    activeFilterAlignments = pendingAlignments;
    activeFilterCustomCategories = pendingCustomCategories;

    // Update indicator
    updateFilterIndicator();

    // Close modal
    closeFilterModal();

    // Re-render grid with filter
    renderTierGrid();
}

// Check if a character would be filtered out by the given filter criteria
function willCharacterBeFilteredOut(characterId, filterCategories, filterRoles, filterAlignments, filterCustomCategories) {
    // If no filters are active, character won't be filtered out
    if (filterCategories.length === 0 && filterRoles.length === 0 && filterAlignments.length === 0 && filterCustomCategories.length === 0) {
        return false;
    }

    // Find reference character
    const refChar = referenceCharacters.find(rc => rc.baseId === characterId);
    if (!refChar) {
        // No reference data - character will be hidden by the filter
        return true;
    }

    // Check Categories based on operator
    if (filterCategories.length > 0) {
        if (filterOperatorCategories === 'AND') {
            // AND: must have ALL selected categories
            const hasAllCategories = filterCategories.every(filterCat =>
                refChar.categories && refChar.categories.includes(filterCat)
            );
            if (!hasAllCategories) return true;
        } else {
            // OR: must have AT LEAST ONE selected category
            const hasAnyCategory = filterCategories.some(filterCat =>
                refChar.categories && refChar.categories.includes(filterCat)
            );
            if (!hasAnyCategory) return true;
        }
    }

    // Check Roles based on operator
    if (filterRoles.length > 0) {
        if (filterOperatorRoles === 'AND') {
            // AND: must match ALL selected roles
            // Since a character can only have ONE role, AND with multiple roles is impossible
            if (filterRoles.length > 1) {
                // Impossible condition - character cannot be multiple roles simultaneously
                return true;
            }
            // Single role selected - character must match it
            if (!refChar.role || !filterRoles.includes(refChar.role)) {
                return true;
            }
        } else {
            // OR: must match AT LEAST ONE selected role
            if (!refChar.role || !filterRoles.includes(refChar.role)) {
                return true;
            }
        }
    }

    // Check Alignments based on operator
    if (filterAlignments.length > 0) {
        if (filterOperatorAlignments === 'AND') {
            // AND: must match ALL selected alignments
            // Since a character can only have ONE alignment, AND with multiple alignments is impossible
            if (filterAlignments.length > 1) {
                // Impossible condition - character cannot have multiple alignments simultaneously
                return true;
            }
            // Single alignment selected - character must match it
            if (!refChar.alignment || !filterAlignments.includes(refChar.alignment)) {
                return true;
            }
        } else {
            // OR: must match AT LEAST ONE selected alignment
            if (!refChar.alignment || !filterAlignments.includes(refChar.alignment)) {
                return true;
            }
        }
    }

    // Check Custom Character Categories based on operator
    if (filterCustomCategories.length > 0) {
        const charData = characterData.find(c => c.id === characterId);
        if (!charData || !charData.categories) return true;

        if (filterOperatorCustomCategories === 'AND') {
            // AND: must have ALL selected custom categories
            const hasAllCustomCategories = filterCustomCategories.every(filterCat =>
                charData.categories.includes(filterCat)
            );
            if (!hasAllCustomCategories) return true;
        } else {
            // OR: must have AT LEAST ONE selected custom category
            const hasAnyCustomCategory = filterCustomCategories.some(filterCat =>
                charData.categories.includes(filterCat)
            );
            if (!hasAnyCustomCategory) return true;
        }
    }

    return false;
}

function clearFilterSelections() {
    // Uncheck all checkboxes
    document.querySelectorAll('#filterCategories input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#filterRoles input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#filterAlignments input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#filterCustomCategories input[type="checkbox"]').forEach(cb => cb.checked = false);

    // Reset operators to AND
    setFilterOperator('Categories', 'AND');
    setFilterOperator('Roles', 'AND');
    setFilterOperator('Alignments', 'AND');
    setFilterOperator('CustomCategories', 'AND');

    // Update Clear button state
    updateFilterClearButton();
}

function updateFilterClearButton() {
    const anyChecked =
        document.querySelectorAll('#filterCategories input[type="checkbox"]:checked').length > 0 ||
        document.querySelectorAll('#filterRoles input[type="checkbox"]:checked').length > 0 ||
        document.querySelectorAll('#filterAlignments input[type="checkbox"]:checked').length > 0 ||
        document.querySelectorAll('#filterCustomCategories input[type="checkbox"]:checked').length > 0;

    const clearButton = document.getElementById('btnFilterClear');
    clearButton.disabled = !anyChecked;
}

function updateFilterIndicator() {
    const indicator = document.getElementById('filterIndicator');
    const isFilterActive = activeFilterCategories.length > 0 || activeFilterRoles.length > 0 || activeFilterAlignments.length > 0 || activeFilterCustomCategories.length > 0;

    if (isFilterActive) {
        indicator.classList.add('active');
    } else {
        indicator.classList.remove('active');
    }
}

function getFilteredCharacterIds() {
    // Returns a Set of character IDs (from characterData) that match ALL active filter criteria
    const matchingIds = new Set();

    // If no reference data is loaded, we can't filter
    if (referenceCharacters.length === 0) {
        console.warn('No reference character data available for filtering');
        return matchingIds;
    }

    // Build a map of baseId to reference character for quick lookup
    const refCharMap = new Map();
    referenceCharacters.forEach(refChar => {
        // API returns baseId (camelCase)
        const key = refChar.baseId;
        if (key) {
            refCharMap.set(key, refChar);
        }
    });

    // Check each character in characterData
    characterData.forEach(character => {
        const refChar = refCharMap.get(character.id);

        // If no reference character found, skip (can't match)
        if (!refChar) return;

        // Check Categories based on operator
        if (activeFilterCategories.length > 0) {
            if (filterOperatorCategories === 'AND') {
                // AND: must have ALL selected categories
                const hasAllCategories = activeFilterCategories.every(filterCat =>
                    refChar.categories && refChar.categories.includes(filterCat)
                );
                if (!hasAllCategories) return;
            } else {
                // OR: must have AT LEAST ONE selected category
                const hasAnyCategory = activeFilterCategories.some(filterCat =>
                    refChar.categories && refChar.categories.includes(filterCat)
                );
                if (!hasAnyCategory) return;
            }
        }

        // Check Roles based on operator
        if (activeFilterRoles.length > 0) {
            if (filterOperatorRoles === 'AND') {
                // AND: must match ALL selected roles
                // Since a character can only have ONE role, AND with multiple roles is impossible
                if (activeFilterRoles.length > 1) {
                    // Impossible condition - skip this character
                    return;
                }
                // Single role selected - character must match it
                if (!refChar.role || !activeFilterRoles.includes(refChar.role)) {
                    return;
                }
            } else {
                // OR: must match AT LEAST ONE selected role
                if (!refChar.role || !activeFilterRoles.includes(refChar.role)) {
                    return;
                }
            }
        }

        // Check Alignments based on operator
        if (activeFilterAlignments.length > 0) {
            if (filterOperatorAlignments === 'AND') {
                // AND: must match ALL selected alignments
                // Since a character can only have ONE alignment, AND with multiple alignments is impossible
                if (activeFilterAlignments.length > 1) {
                    // Impossible condition - skip this character
                    return;
                }
                // Single alignment selected - character must match it
                if (!refChar.alignment || !activeFilterAlignments.includes(refChar.alignment)) {
                    return;
                }
            } else {
                // OR: must match AT LEAST ONE selected alignment
                if (!refChar.alignment || !activeFilterAlignments.includes(refChar.alignment)) {
                    return;
                }
            }
        }

        // Check Custom Character Categories based on operator
        if (activeFilterCustomCategories.length > 0) {
            const charData = characterData.find(c => c.id === character.id);
            if (!charData || !charData.categories) return;

            if (filterOperatorCustomCategories === 'AND') {
                // AND: must have ALL selected custom categories
                const hasAllCustomCategories = activeFilterCustomCategories.every(filterCat =>
                    charData.categories.includes(filterCat)
                );
                if (!hasAllCustomCategories) return;
            } else {
                // OR: must have AT LEAST ONE selected custom category
                const hasAnyCustomCategory = activeFilterCustomCategories.some(filterCat =>
                    charData.categories.includes(filterCat)
                );
                if (!hasAnyCustomCategory) return;
            }
        }

        // If we made it here, character matches all criteria
        matchingIds.add(character.id);
    });

    return matchingIds;
}

// ============================================
// Tier Distribution Visualization Modal
// ============================================
function showTierDistributionModal() {
    const modal = document.getElementById('tierDistributionModal');

    // Initialize toggles to match current view state
    document.getElementById('vizIncludeSynergy').checked = includeSynergy;
    document.getElementById('vizIncludeOmicron').checked = includeOmicron;

    // Initialize omicron type dropdown to match current selections
    const vizSelect = document.getElementById('vizOmicronTypeSelector');
    Array.from(vizSelect.options).forEach(option => {
        option.selected = selectedOmicronTypes.includes(option.value);
    });

    // Add event listeners for toggles
    const synergyToggle = document.getElementById('vizIncludeSynergy');
    const omicronToggle = document.getElementById('vizIncludeOmicron');

    synergyToggle.onchange = renderTierDistributionChart;
    omicronToggle.onchange = renderTierDistributionChart;

    // Add event listener for omicron type dropdown
    vizSelect.onchange = renderTierDistributionChart;

    // Render initial chart
    renderTierDistributionChart();

    // Show modal
    modal.style.display = 'flex';
}

function closeTierDistributionModal() {
    const modal = document.getElementById('tierDistributionModal');
    modal.style.display = 'none';
}

function computeTierDistribution() {
    const vizIncludeSynergy = document.getElementById('vizIncludeSynergy').checked;
    const vizIncludeOmicron = document.getElementById('vizIncludeOmicron').checked;

    // Get selected omicron types from visualization modal dropdown
    const vizSelect = document.getElementById('vizOmicronTypeSelector');
    const vizSelectedOmicronTypes = Array.from(vizSelect.selectedOptions).map(opt => opt.value);

    // Initialize counts for tiers 1-19
    const tierCounts = new Array(19).fill(0);

    // Get filtered character IDs if filter is active
    const isFilterActive = activeFilterCategories.length > 0 || activeFilterRoles.length > 0 ||
        activeFilterAlignments.length > 0 || activeFilterCustomCategories.length > 0;
    let filteredIds = null;
    if (isFilterActive) {
        filteredIds = getFilteredCharacterIds();
    }

    // Build mode set once for visualization context (optimized - cache outside loop)
    const vizModeSet = new Set();
    vizSelectedOmicronTypes.forEach(type => {
        const modes = OMICRON_MODE_MAP[type];
        if (modes) modes.forEach(mode => vizModeSet.add(mode));
    });

    // Helper function to check if character has omicron abilities matching selected types (optimized)
    const hasMatchingOmicronAbilities = (characterId) => {
        if (vizModeSet.size === 0) return false;

        const characterModes = omicronAbilityIndex.get(characterId);
        if (!characterModes) return false;

        // Check if any of the character's omicron modes match selected modes
        for (const mode of characterModes) {
            if (vizModeSet.has(mode)) return true;
        }
        return false;
    };

    // Calculate tier for each character
    characterData.forEach(character => {
        // Skip character if filter is active and character doesn't match
        if (filteredIds !== null && !filteredIds.has(character.id)) {
            return;
        }

        let finalTier = character.baseTier;
        let appliedOmicronBonus = 0;

        // Apply omicron bonus if enabled
        if (vizIncludeOmicron) {
            // Check if character has omicron abilities matching selected types
            const hasOmicronAbilities = hasMatchingOmicronAbilities(character.id);

            // Personal omicron
            let personalOmicron = 0;
            if (character.omicronBoost !== undefined && hasOmicronAbilities) {
                personalOmicron = character.omicronBoost;
            } else if (hasOmicronAbilities) {
                personalOmicron = 1;
            }

            // Check for synergy omicron bonuses from other characters
            let bestSynergyOmicronBonus = 0;
            characterData.forEach(otherChar => {
                if (!otherChar.synergySets || otherChar.synergySets.length === 0) return;

                // Only consider synergy omicrons from characters with matching omicron types
                if (!hasMatchingOmicronAbilities(otherChar.id)) return;

                otherChar.synergySets.forEach(synergySet => {
                    const synergyOmicronBonus = synergySet.synergyEnhancementOmicron ?? 0;
                    if (synergyOmicronBonus === 0) return;

                    if (doesSynergyOmicronApplyToCharacter(synergySet, character)) {
                        if (synergyOmicronBonus > bestSynergyOmicronBonus) {
                            bestSynergyOmicronBonus = synergyOmicronBonus;
                        }
                    }
                });
            });

            // Apply the largest omicron bonus
            appliedOmicronBonus = Math.max(personalOmicron, bestSynergyOmicronBonus);
            finalTier -= appliedOmicronBonus;
        }

        // Apply synergy enhancement if enabled
        if (vizIncludeSynergy && character.synergySets && character.synergySets.length > 0) {
            const synergyTiers = calculateSynergyTiers(character);

            let bestSynergy = null;
            if (vizIncludeOmicron && synergyTiers.bestOmicron !== null) {
                bestSynergy = synergyTiers.bestOmicron;
            } else if (synergyTiers.bestStandard !== null) {
                bestSynergy = synergyTiers.bestStandard;
            }

            if (bestSynergy !== null) {
                finalTier = character.baseTier - appliedOmicronBonus - bestSynergy.synergyEnhancement;
            }
        }

        // Clamp tier to valid range (1-19)
        finalTier = Math.max(1, Math.min(19, finalTier));

        // Increment count for this tier (tier is 1-indexed, array is 0-indexed)
        tierCounts[finalTier - 1]++;
    });

    return tierCounts;
}

function renderTierDistributionChart() {
    const container = document.getElementById('tierDistributionChart');
    const tierCounts = computeTierDistribution();
    const maxCount = Math.max(...tierCounts, 1); // Avoid division by zero

    // Clear existing chart
    container.innerHTML = '';

    // Create horizontal bar chart
    tierCounts.forEach((count, index) => {
        const tier = index + 1;

        const barRow = document.createElement('div');
        barRow.className = 'tier-bar-row';

        // Tier label
        const label = document.createElement('div');
        label.className = 'tier-bar-label';
        label.textContent = `Tier ${tier}`;
        barRow.appendChild(label);

        // Bar container
        const barContainer = document.createElement('div');
        barContainer.className = 'tier-bar-container';

        // Bar fill
        const barFill = document.createElement('div');
        barFill.className = 'tier-bar-fill';
        const percentage = (count / maxCount) * 100;
        barFill.style.width = `${percentage}%`;
        barContainer.appendChild(barFill);

        barRow.appendChild(barContainer);

        // Count label
        const countLabel = document.createElement('div');
        countLabel.className = 'tier-bar-count';
        countLabel.textContent = count;
        barRow.appendChild(countLabel);

        container.appendChild(barRow);
    });
}

// ============================================
// Tier Grid Rendering
// ============================================
function renderTierGrid() {
    const grid = document.getElementById('tierGrid');
    grid.innerHTML = '';

    // Update header text to show filter status
    const gridHeader = document.querySelector('.tier-grid-header h2');
    const isFilterActive = activeFilterCategories.length > 0 || activeFilterRoles.length > 0 || activeFilterAlignments.length > 0 || activeFilterCustomCategories.length > 0;
    gridHeader.textContent = isFilterActive ? 'Tier Grid (Filtered)' : 'Tier Grid';

    // Get filtered character IDs if filter is active
    let filteredIds = null;
    if (isFilterActive) {
        filteredIds = getFilteredCharacterIds();
    }

    // Create 19 tier columns
    for (let tier = 1; tier <= 19; tier++) {
        const column = createTierColumn(tier);
        grid.appendChild(column);
    }

    // Add characters to their respective tiers based on Final tier
    characterData.forEach(character => {
        // Skip character if filter is active and character doesn't match
        if (filteredIds !== null && !filteredIds.has(character.id)) {
            return;
        }

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

    // Helper function to check if character has omicron abilities matching selected types (optimized)
    const hasMatchingOmicronAbilities = (characterId) => {
        if (selectedOmicronModeSet.size === 0) return false;

        const characterModes = omicronAbilityIndex.get(characterId);
        if (!characterModes) return false;

        // Check if any of the character's omicron modes match selected modes
        for (const mode of characterModes) {
            if (selectedOmicronModeSet.has(mode)) return true;
        }
        return false;
    };

    // Determine the best omicron boost to apply (max of personal vs synergy)
    if (includeOmicron) {
        // Check if character has omicron abilities matching selected types
        const hasOmicronAbilities = hasMatchingOmicronAbilities(character.id);

        // Personal omicron: use defined value, or default to 1 if character has matching omicron abilities, otherwise 0
        let personalOmicron = 0;
        if (character.omicronBoost !== undefined && hasOmicronAbilities) {
            personalOmicron = character.omicronBoost;
        } else if (hasOmicronAbilities) {
            // StackRank service auto-applies 1 tier boost for characters with omicron abilities
            personalOmicron = 1;
        }

        let bestSynergyOmicronBonus = 0;
        let bestSynergyOmicronSource = null;

        // Scan all characters to see if any reference this character in a synergy set with synergyEnhancementOmicron
        characterData.forEach(otherChar => {
            if (!otherChar.synergySets || otherChar.synergySets.length === 0) return;

            // Only consider synergy omicrons from characters with matching omicron types
            if (!hasMatchingOmicronAbilities(otherChar.id)) return;

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

    // Clamp final tier to valid range (1-19)
    finalTier = Math.max(1, Math.min(19, finalTier));

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
    const omicronBoost = character.omicronBoost ?? 0;

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
        if (omicronBoost > 0 && standardEnhancement > 0) {
            const omicronTier = character.baseTier - omicronBoost - standardEnhancement;

            if (bestOmicron === null || omicronTier < bestOmicron.finalTier) {
                bestOmicron = {
                    finalTier: omicronTier,
                    baseTier: character.baseTier,
                    appliedOmicronBonus: omicronBoost,
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
            text += `\n- Omicron Boost (${calculation.appliedOmicronBonus} from self)`;
        } else if (calculation.omicronSource) {
            text += `\n- Omicron Boost (${calculation.appliedOmicronBonus} from ${calculation.omicronSource})`;
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
    updateCharacterIdDisplay(null);
}

function renderEmptySynergyEditor() {
    const container = document.getElementById('synergyEditor');
    container.innerHTML = `
        <div class="empty-state">
            <p>Select a character to view synergy sets</p>
        </div>
    `;
}

/**
 * Updates the character ID display in both sidebar subheaders
 * @param {string|null} characterId - The character ID to display, or null to show default message
 */
function updateCharacterIdDisplay(characterId) {
    const leftDisplay = document.querySelector('#characterIdLeft .character-id-display');
    const rightDisplay = document.querySelector('#characterIdRight .character-id-display');
    const displayText = characterId || 'No character selected';

    if (leftDisplay) leftDisplay.textContent = displayText;
    if (rightDisplay) rightDisplay.textContent = displayText;
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

    // Update character ID display in both sidebars
    updateCharacterIdDisplay(character.id);

    // Use draft values if available, otherwise use character values
    const draftValues = currentDraft || character;

    // Count total zeta and omicron abilities for this character
    const totalZetaCount = referenceAbilities.filter(ability =>
        ability.character_base_id === character.id && ability.is_zeta === true
    ).length;
    const totalOmicronCount = referenceAbilities.filter(ability =>
        ability.character_base_id === character.id && ability.is_omicron === true
    ).length;

    // Format required zetas display
    let requiredZetasDisplay = 'All (if any)';
    if (totalZetaCount === 0) {
        requiredZetasDisplay = 'None';
    } else if (draftValues.requiredZetas !== undefined) {
        const requiredCount = draftValues.requiredZetas.length;
        if (requiredCount === 0) {
            requiredZetasDisplay = 'None';
        } else {
            requiredZetasDisplay = `${requiredCount} of ${totalZetaCount}`;
        }
    } else {
        requiredZetasDisplay = `All (${totalZetaCount})`;
    }

    // Format required omicrons display
    let requiredOmicronsDisplay = 'All (if any)';
    if (totalOmicronCount === 0) {
        requiredOmicronsDisplay = 'None';
    } else if (draftValues.requiredOmicrons !== undefined) {
        const requiredCount = draftValues.requiredOmicrons.length;
        if (requiredCount === 0) {
            requiredOmicronsDisplay = 'None';
        } else {
            requiredOmicronsDisplay = `${requiredCount} of ${totalOmicronCount}`;
        }
    } else {
        requiredOmicronsDisplay = `All (${totalOmicronCount})`;
    }

    // Check requiresAllZetas (default is true if not explicitly set to false)
    const requiresAllZetas = draftValues.requiresAllZetas !== false ? 'Yes' : 'No';

    const html = `
        <div class="character-info">
            <div class="info-row">
                <span class="info-label">Base Tier</span>
                <span class="info-value">${character.baseTier}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Omicron Boost</span>
                <span class="info-value">${character.omicronBoost ?? 1}${character.omicronBoost === undefined ? ' (default)' : ''}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Synergy Sets</span>
                <span class="info-value">${draftValues.synergySets ? draftValues.synergySets.length : 0}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Required Zetas</span>
                <span class="info-value">${requiredZetasDisplay}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Required Omicrons</span>
                <span class="info-value">${requiredOmicronsDisplay}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Custom Categories</span>
                <span class="info-value">${draftValues.categories && draftValues.categories.length > 0 ? 'Yes' : 'No'}</span>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Base Tier (1-19)</label>
            <input type="number" class="form-input" id="inputBaseTier" 
                   value="${draftValues.baseTier}" min="1" max="19">
        </div>
        
        <div class="form-group">
            <label class="form-label">
                <input type="checkbox" id="chkHasomicronBoost" 
                       ${draftValues.omicronBoost !== undefined ? 'checked' : ''}
                       onchange="toggleomicronBoost()" style="margin-right: 8px;">
                Omicron Boost (0-10)
            </label>
            <input type="number" class="form-input" id="inputomicronBoost" 
                   value="${draftValues.omicronBoost ?? 1}" min="0" max="10"
                   ${draftValues.omicronBoost === undefined ? 'readonly' : ''}>
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

    // Render the custom categories editor
    renderCustomCategoriesEditor(character);

    // Add event listeners to capture form changes into draft
    setTimeout(() => {
        ['inputBaseTier', 'chkHasomicronBoost', 'inputomicronBoost', 'ignoreReqGear', 'ignoreReqRarity', 'ignoreSynergyReqGear', 'ignoreSynergyReqRarity'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', updateDraftFromForm);
                element.addEventListener('change', updateDraftFromForm);
            }
        });
    }, 0);
}

function toggleomicronBoost() {
    const checkbox = document.getElementById('chkHasomicronBoost');
    const input = document.getElementById('inputomicronBoost');

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

    if (currentDraft.omicronBoost !== undefined && (currentDraft.omicronBoost < 0 || currentDraft.omicronBoost > 10)) {
        alert('Omicron Boost must be between 0 and 10');
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
                alert(`Synergy Set #${i + 1}: Omicron Boost must be between 0 and 10`);
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

    if (currentDraft.omicronBoost !== undefined) {
        selectedCharacter.omicronBoost = currentDraft.omicronBoost;
    } else {
        delete selectedCharacter.omicronBoost;
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
        const filteredZetas = currentDraft.requiredZetas.filter(z => z.trim() !== '');
        if (filteredZetas.length > 0) {
            selectedCharacter.requiredZetas = filteredZetas;
        } else {
            delete selectedCharacter.requiredZetas;
        }
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
        const filteredOmicrons = currentDraft.requiredOmicrons.filter(o => o.trim() !== '');
        if (filteredOmicrons.length > 0) {
            selectedCharacter.requiredOmicrons = filteredOmicrons;
        } else {
            delete selectedCharacter.requiredOmicrons;
        }
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
        selectedCharacter.synergySets = currentDraft.synergySets.map(set => {
            // Filter empty strings from character arrays
            const filteredCharacters = set.characters ? set.characters.filter(c => c.trim() !== '') : undefined;
            const filteredSkipIfPresent = set.skipIfPresentCharacters ? set.skipIfPresentCharacters.filter(c => c.trim() !== '') : undefined;

            return {
                ...set,
                characters: filteredCharacters && filteredCharacters.length > 0 ? filteredCharacters : undefined,
                skipIfPresentCharacters: filteredSkipIfPresent && filteredSkipIfPresent.length > 0 ? filteredSkipIfPresent : undefined,
                categoryDefinitions: set.categoryDefinitions ? set.categoryDefinitions.map(catDef => ({
                    ...catDef,
                    include: catDef.include ? [...catDef.include] : undefined,
                    exclude: catDef.exclude ? [...catDef.exclude] : undefined
                })) : undefined
            };
        });
    } else {
        delete selectedCharacter.synergySets;
    }

    // Apply draft to character - custom categories
    if (currentDraft.categories && currentDraft.categories.length > 0) {
        const filteredCategories = currentDraft.categories.filter(cat => cat.trim() !== '');
        if (filteredCategories.length > 0) {
            selectedCharacter.categories = filteredCategories;
        } else {
            delete selectedCharacter.categories;
        }
    } else {
        delete selectedCharacter.categories;
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
                        <input type="text" class="zeta-input" 
                               data-zeta-index="${index}"
                               data-zeta-value="${zeta}"
                               value="${zeta}" 
                               oninput="showZetaDropdown(this, ${index})"
                               onfocus="showZetaDropdown(this, ${index})"
                               onkeydown="handleZetaInputKeydown(event, this, ${index})"
                               onblur="updateRequiredZetaFromInput(${index}, this)" 
                               placeholder="Type to search zeta abilities..."
                               style="flex: 1; font-family: monospace;">
                        <button class="btn btn-danger btn-small" onclick="removeRequiredZeta(${index})">
                            <span class="icon">×</span>
                        </button>
                    </div>
                `;
            });

            zetaEditorHtml += '</div>';
        }

        // Check if there are any available zeta abilities left
        const characterId = character.id;
        const existingZetas = (requiredZetas || []).filter(z => z.trim() !== '');
        const availableZetas = getAvailableZetaAbilities(characterId, existingZetas);
        const hasAvailableZetas = availableZetas.length > 0;

        zetaEditorHtml += `
            <button class="btn btn-secondary" onclick="addRequiredZeta()" style="margin-top: 10px;" ${!hasAvailableZetas ? 'disabled' : ''}>
                <span class="icon">+</span> Add Required Zeta
            </button>
        `;

        if (!hasAvailableZetas && requiredZetas.length === 0) {
            zetaEditorHtml += '<div class="form-help" style="margin-top: 8px; color: #888;">No zeta abilities available for this character</div>';
        } else if (!hasAvailableZetas && requiredZetas.length > 0) {
            zetaEditorHtml += '<div class="form-help" style="margin-top: 8px; color: #888;">All available zetas have been added</div>';
        }

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

// Update zeta from input blur
function updateRequiredZetaFromInput(index, inputElement) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredZetas) return;

    const storedValue = inputElement.dataset.zetaValue;
    const inputValue = inputElement.value.trim();

    // If no change from stored value, skip
    if (storedValue === inputValue) {
        return;
    }

    updateRequiredZeta(index, inputValue);
}

// Get available zeta abilities for the selected character
function getAvailableZetaAbilities(characterId, existingZetas = []) {
    if (!characterId || referenceAbilities.length === 0) return [];

    return referenceAbilities
        .filter(ability =>
            ability.character_base_id === characterId &&
            ability.is_zeta === true &&
            !existingZetas.includes(ability.base_id)
        )
        .map(ability => ({
            base_id: ability.base_id,
            name: ability.name,
            displayText: `${ability.name} (${ability.base_id})`
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Show zeta dropdown with filtered abilities
function showZetaDropdown(inputElement, zetaIndex) {
    hideAllDropdowns();

    if (!selectedCharacter || !currentDraft) return;

    const characterId = selectedCharacter.id;
    const existingZetas = (currentDraft.requiredZetas || []).filter((z, i) => i !== zetaIndex);
    const allAbilities = getAvailableZetaAbilities(characterId, existingZetas);

    // Filter based on input text
    const inputValue = inputElement.value.trim().toLowerCase();
    const filteredAbilities = inputValue
        ? allAbilities.filter(a =>
            a.name.toLowerCase().includes(inputValue) ||
            a.base_id.toLowerCase().includes(inputValue))
        : allAbilities;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'character-dropdown';
    dropdown.id = `zeta-dropdown_${zetaIndex}`;

    if (allAbilities.length === 0) {
        // No zeta abilities for this character
        const emptyOption = document.createElement('div');
        emptyOption.className = 'dropdown-option';
        emptyOption.style.fontStyle = 'italic';
        emptyOption.style.color = '#888';
        emptyOption.textContent = 'No zeta abilities available for this character';
        dropdown.appendChild(emptyOption);
    } else if (filteredAbilities.length === 0) {
        // No matches for filter
        const noMatch = document.createElement('div');
        noMatch.className = 'dropdown-option';
        noMatch.style.fontStyle = 'italic';
        noMatch.style.color = '#888';
        noMatch.textContent = 'No matching abilities found';
        dropdown.appendChild(noMatch);
    } else {
        filteredAbilities.forEach((ability, index) => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.index = index;
            option.dataset.baseId = ability.base_id;
            option.textContent = ability.displayText;

            option.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur
                e.stopPropagation();
                selectZetaFromDropdown(zetaIndex, ability, inputElement);
            });

            option.addEventListener('mouseenter', () => {
                dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });

            dropdown.appendChild(option);
        });
    }

    // Position dropdown below input
    const inputRect = inputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';

    document.body.appendChild(dropdown);
    inputElement.dataset.dropdownOpen = 'true';
}

// Handle zeta selection from dropdown
function selectZetaFromDropdown(zetaIndex, ability, inputElement) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredZetas) return;

    // Update the draft
    currentDraft.requiredZetas[zetaIndex] = ability.base_id;

    // Update the input display (just the base_id)
    inputElement.value = ability.base_id;
    inputElement.dataset.zetaValue = ability.base_id;

    refreshDraftDirtyState();
    updateStatus('Zeta ability selected - click Update Character to apply', 'warning');

    // Re-render to update button state based on remaining available zetas
    renderCharacterDetails(selectedCharacter);

    hideAllDropdowns();
}

// Keyboard navigation for zeta dropdown
function handleZetaInputKeydown(event, inputElement, zetaIndex) {
    const dropdown = document.getElementById(`zeta-dropdown_${zetaIndex}`);

    if (!dropdown) {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            showZetaDropdown(inputElement, zetaIndex);
            event.preventDefault();
        }
        return;
    }

    const options = dropdown.querySelectorAll('.dropdown-option:not([style*="italic"])');
    if (options.length === 0) {
        if (event.key === 'Escape') {
            event.preventDefault();
            hideAllDropdowns();
        }
        return;
    }

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
            if (selectedOption && selectedOption.dataset.baseId) {
                const ability = {
                    base_id: selectedOption.dataset.baseId,
                    displayText: selectedOption.textContent
                };
                selectZetaFromDropdown(zetaIndex, ability, inputElement);
            } else if (options.length === 1 && options[0].dataset.baseId) {
                const ability = {
                    base_id: options[0].dataset.baseId,
                    displayText: options[0].textContent
                };
                selectZetaFromDropdown(zetaIndex, ability, inputElement);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAllDropdowns();
            break;
    }
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
                        <input type="text" class="omicron-input" 
                               data-omicron-index="${index}"
                               data-omicron-value="${omicron}"
                               value="${omicron}" 
                               oninput="showOmicronDropdown(this, ${index})"
                               onfocus="showOmicronDropdown(this, ${index})"
                               onkeydown="handleOmicronInputKeydown(event, this, ${index})"
                               onblur="updateRequiredOmicronFromInput(${index}, this)"
                               placeholder="Type to search omicron abilities..."
                               style="flex: 1; margin-right: 8px; font-family: monospace;">
                        <button class="btn btn-danger btn-small" onclick="removeRequiredOmicron(${index})">
                            <span class="icon">×</span>
                        </button>
                    </div>
                `;
            });

            omicronEditorHtml += '</div>';
        }

        // Check if there are any available omicron abilities left
        const characterId = character.id;
        const existingOmicrons = (requiredOmicrons || []).filter(o => o.trim() !== '');
        const availableOmicrons = getAvailableOmicronAbilities(characterId, existingOmicrons);
        const hasAvailableOmicrons = availableOmicrons.length > 0;

        omicronEditorHtml += `
            <button class="btn btn-secondary" onclick="addRequiredOmicron()" style="margin-top: 10px;" ${!hasAvailableOmicrons ? 'disabled' : ''}>
                <span class="icon">+</span> Add Required Omicron
            </button>
        `;

        if (!hasAvailableOmicrons && requiredOmicrons.length === 0) {
            omicronEditorHtml += '<div class="form-help" style="margin-top: 8px; color: #888;">No omicron abilities available for this character</div>';
        } else if (!hasAvailableOmicrons && requiredOmicrons.length > 0) {
            omicronEditorHtml += '<div class="form-help" style="margin-top: 8px; color: #888;">All available omicrons have been added</div>';
        }

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

function updateRequiredOmicronFromInput(index, inputElement) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredOmicrons) return;

    const storedValue = inputElement.dataset.omicronValue;
    const inputValue = inputElement.value.trim();

    // If no change from stored value, skip
    if (storedValue === inputValue) {
        return;
    }

    updateRequiredOmicron(index, inputValue);
}

// Get available omicron abilities for the selected character
function getAvailableOmicronAbilities(characterId, existingOmicrons = []) {
    if (!characterId || referenceAbilities.length === 0) return [];

    return referenceAbilities
        .filter(ability =>
            ability.character_base_id === characterId &&
            ability.is_omicron === true &&
            !existingOmicrons.includes(ability.base_id)
        )
        .map(ability => ({
            base_id: ability.base_id,
            name: ability.name,
            displayText: `${ability.name} (${ability.base_id})`
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Show omicron dropdown with filtered abilities
function showOmicronDropdown(inputElement, omicronIndex) {
    hideAllDropdowns();

    if (!selectedCharacter || !currentDraft) return;

    const characterId = selectedCharacter.id;
    const existingOmicrons = (currentDraft.requiredOmicrons || []).filter((o, i) => i !== omicronIndex);
    const allAbilities = getAvailableOmicronAbilities(characterId, existingOmicrons);

    // Filter based on input text
    const inputValue = inputElement.value.trim().toLowerCase();
    const filteredAbilities = inputValue
        ? allAbilities.filter(a =>
            a.name.toLowerCase().includes(inputValue) ||
            a.base_id.toLowerCase().includes(inputValue))
        : allAbilities;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'character-dropdown';
    dropdown.id = `omicron-dropdown_${omicronIndex}`;

    if (allAbilities.length === 0) {
        // No omicron abilities for this character
        const emptyOption = document.createElement('div');
        emptyOption.className = 'dropdown-option';
        emptyOption.style.fontStyle = 'italic';
        emptyOption.style.color = '#888';
        emptyOption.textContent = 'No omicron abilities available for this character';
        dropdown.appendChild(emptyOption);
    } else if (filteredAbilities.length === 0) {
        // No matches for filter
        const noMatch = document.createElement('div');
        noMatch.className = 'dropdown-option';
        noMatch.style.fontStyle = 'italic';
        noMatch.style.color = '#888';
        noMatch.textContent = 'No matching abilities found';
        dropdown.appendChild(noMatch);
    } else {
        filteredAbilities.forEach((ability, index) => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.index = index;
            option.dataset.baseId = ability.base_id;
            option.textContent = ability.displayText;

            option.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur
                e.stopPropagation();
                selectOmicronFromDropdown(omicronIndex, ability, inputElement);
            });

            option.addEventListener('mouseenter', () => {
                dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });

            dropdown.appendChild(option);
        });
    }

    // Position dropdown below input
    const inputRect = inputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';

    document.body.appendChild(dropdown);
    inputElement.dataset.dropdownOpen = 'true';
}

// Handle omicron selection from dropdown
function selectOmicronFromDropdown(omicronIndex, ability, inputElement) {
    if (!selectedCharacter || !currentDraft || !currentDraft.requiredOmicrons) return;

    // Update the draft
    currentDraft.requiredOmicrons[omicronIndex] = ability.base_id;

    // Update the input display (just the base_id)
    inputElement.value = ability.base_id;
    inputElement.dataset.omicronValue = ability.base_id;

    refreshDraftDirtyState();
    updateStatus('Omicron ability selected - click Update Character to apply', 'warning');

    // Re-render to update button state based on remaining available omicrons
    renderCharacterDetails(selectedCharacter);

    hideAllDropdowns();
}

// Keyboard navigation for omicron dropdown
function handleOmicronInputKeydown(event, inputElement, omicronIndex) {
    const dropdown = document.getElementById(`omicron-dropdown_${omicronIndex}`);

    if (!dropdown) {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            showOmicronDropdown(inputElement, omicronIndex);
            event.preventDefault();
        }
        return;
    }

    const options = dropdown.querySelectorAll('.dropdown-option:not([style*="italic"])');
    if (options.length === 0) {
        if (event.key === 'Escape') {
            event.preventDefault();
            hideAllDropdowns();
        }
        return;
    }

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
            if (selectedOption && selectedOption.dataset.baseId) {
                const ability = {
                    base_id: selectedOption.dataset.baseId,
                    displayText: selectedOption.textContent
                };
                selectOmicronFromDropdown(omicronIndex, ability, inputElement);
            } else if (options.length === 1 && options[0].dataset.baseId) {
                const ability = {
                    base_id: options[0].dataset.baseId,
                    displayText: options[0].textContent
                };
                selectOmicronFromDropdown(omicronIndex, ability, inputElement);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAllDropdowns();
            break;
    }
}

// ============================================
// Custom Character Categories Editor
// ============================================
function renderCustomCategoriesEditor(character) {
    const container = document.getElementById('characterDetails');

    // Use draft values if available, otherwise use character values
    const draftValues = currentDraft || character;
    const categories = draftValues.categories || [];

    let customCategoriesHtml = `
        <div class="form-group" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 20px;">
            <label class="form-label">Custom Character Categories</label>
            <div class="form-help">Assign custom categories to this character for filtering and synergy matching</div>
        </div>
    `;

    if (categories.length === 0) {
        customCategoriesHtml += `
            <div class="empty-state" style="margin: 10px 0;">
                <p style="font-size: 0.9em; color: #888;">No custom categories assigned</p>
            </div>
        `;
    } else {
        customCategoriesHtml += '<div class="form-group">';
        categories.forEach((category, index) => {
            customCategoriesHtml += `
                <div class="info-row" style="margin-bottom: 8px; align-items: center;">
                    <input type="text" class="form-input custom-category-input" 
                           id="customCategoryInput_${index}"
                           data-category-index="${index}"
                           data-category-value="${category}"
                           value="${category}" 
                           placeholder="Type to search categories..."
                           onblur="updateCustomCategoryFromInput(${index}, this)"
                           style="flex: 1; font-family: monospace;">
                    <button class="btn btn-danger btn-small" onclick="removeCustomCategory(${index})" style="margin-left: 8px;">
                        <span class="icon">×</span>
                    </button>
                </div>
            `;
        });
        customCategoriesHtml += '</div>';
    }

    customCategoriesHtml += `
        <button class="btn btn-secondary" onclick="addCustomCategory()" style="margin-top: 10px;">
            <span class="icon">+</span> Add Custom Category
        </button>
    `;

    container.innerHTML += customCategoriesHtml;
}

// Check if a category name conflicts with reserved names (Categories, Roles, Alignments)
function isReservedCategoryName(categoryName) {
    const normalized = categoryName.trim().toLowerCase();

    // Check against reference categories
    if (referenceCategories.some(cat => cat.toLowerCase() === normalized)) {
        return true;
    }

    // Check against reference roles
    if (referenceRoles.some(role => role.toLowerCase() === normalized)) {
        return true;
    }

    // Check against reference alignments
    if (referenceAlignments.some(align => align.toLowerCase() === normalized)) {
        return true;
    }

    return false;
}

// Get all unique custom categories from character data
function getAllCustomCategories() {
    const allCategories = new Set();
    characterData.forEach(char => {
        if (char.categories && Array.isArray(char.categories)) {
            char.categories.forEach(cat => allCategories.add(cat));
        }
    });
    return Array.from(allCategories).sort();
}

// Get available custom categories (excluding already assigned ones)
function getAvailableCustomCategories(existingCategories = []) {
    const allCategories = getAllCustomCategories();
    return allCategories.filter(cat => !existingCategories.includes(cat));
}

// Show custom category dropdown with filtered options
function showCustomCategoryDropdown(inputElement, categoryIndex) {
    hideAllDropdowns();

    if (!selectedCharacter || !currentDraft) return;

    // Get existing categories (excluding the one being edited)
    const existingCategories = (currentDraft.categories || [])
        .filter((c, i) => i !== categoryIndex && c.trim() !== '');

    // Get all available categories
    const allCategories = getAvailableCustomCategories(existingCategories);

    // Filter based on input text (preserve original case)
    const inputValue = inputElement.value.trim();
    const inputValueLower = inputValue.toLowerCase();
    const filteredCategories = inputValue
        ? allCategories.filter(cat => cat.toLowerCase().includes(inputValueLower))
        : allCategories;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'character-dropdown';
    dropdown.id = `custom-category-dropdown_${categoryIndex}`;

    // Check if input value is a new category (not in existing list)
    const isNewCategory = inputValue &&
        !allCategories.some(cat => cat.toLowerCase() === inputValueLower) &&
        !existingCategories.some(cat => cat.toLowerCase() === inputValueLower);

    // Check if the new category name is reserved
    const isReservedName = inputValue && isReservedCategoryName(inputValue);

    if (isNewCategory && !isReservedName) {
        // Show option to create new category
        const newOption = document.createElement('div');
        newOption.className = 'dropdown-option';
        newOption.dataset.index = '0';
        newOption.dataset.value = inputValue;
        newOption.innerHTML = `<em>Create new: "${inputValue}"</em>`;

        newOption.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectCustomCategoryFromDropdown(categoryIndex, inputValue, inputElement);
        });

        newOption.addEventListener('mouseenter', () => {
            dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
            newOption.classList.add('selected');
        });

        dropdown.appendChild(newOption);
    } else if (isReservedName) {
        // Show message that this name is reserved
        const reservedOption = document.createElement('div');
        reservedOption.className = 'dropdown-option';
        reservedOption.style.fontStyle = 'italic';
        reservedOption.style.color = '#d9534f';
        reservedOption.textContent = `"${inputValue}" conflicts with existing Category, Role, or Alignment`;
        dropdown.appendChild(reservedOption);
    }

    if (filteredCategories.length === 0 && !isNewCategory && !isReservedName) {
        const noMatch = document.createElement('div');
        noMatch.className = 'dropdown-option';
        noMatch.style.fontStyle = 'italic';
        noMatch.style.color = '#888';
        noMatch.textContent = inputValue ? 'Type to create a new category' : 'No categories available';
        dropdown.appendChild(noMatch);
    } else if (filteredCategories.length > 0) {
        const startIndex = (isNewCategory && !isReservedName) ? 1 : 0;
        filteredCategories.forEach((category, index) => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.index = startIndex + index;
            option.dataset.value = category;
            option.textContent = category;

            option.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectCustomCategoryFromDropdown(categoryIndex, category, inputElement);
            });

            option.addEventListener('mouseenter', () => {
                dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });

            dropdown.appendChild(option);
        });
    }

    // Position dropdown below input
    const inputRect = inputElement.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${inputRect.bottom + 2}px`;
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.width = `${inputRect.width}px`;
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';

    document.body.appendChild(dropdown);
    inputElement.dataset.dropdownOpen = 'true';
}

// Handle custom category selection from dropdown
function selectCustomCategoryFromDropdown(categoryIndex, category, inputElement) {
    if (!selectedCharacter || !currentDraft) return;

    // Ensure categories array exists
    if (!currentDraft.categories) {
        currentDraft.categories = [];
    }

    // Update the draft
    currentDraft.categories[categoryIndex] = category;

    // Update the input display
    inputElement.value = category;
    inputElement.dataset.categoryValue = category;

    refreshDraftDirtyState();
    updateStatus('Category selected - click Update Character to apply', 'warning');

    // Re-render to update UI
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);

    hideAllDropdowns();
}

// Keyboard navigation for custom category dropdown
function handleCustomCategoryInputKeydown(event, inputElement, categoryIndex) {
    const dropdown = document.getElementById(`custom-category-dropdown_${categoryIndex}`);

    if (!dropdown) {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            showCustomCategoryDropdown(inputElement, categoryIndex);
            event.preventDefault();
        }
        return;
    }

    const options = dropdown.querySelectorAll('.dropdown-option:not([style*="italic"])');
    if (options.length === 0) {
        if (event.key === 'Escape') {
            event.preventDefault();
            hideAllDropdowns();
        }
        return;
    }

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
            if (selectedOption && selectedOption.dataset.value) {
                selectCustomCategoryFromDropdown(categoryIndex, selectedOption.dataset.value, inputElement);
            } else if (options.length === 1 && options[0].dataset.value) {
                selectCustomCategoryFromDropdown(categoryIndex, options[0].dataset.value, inputElement);
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideAllDropdowns();
            break;
    }
}

function addCustomCategory() {
    if (!selectedCharacter || !currentDraft) return;

    if (!currentDraft.categories) {
        currentDraft.categories = [];
    }

    // Add empty string for user to fill in
    currentDraft.categories.push('');

    refreshDraftDirtyState();
    updateStatus('Category field added - click Update Character to apply', 'warning');

    // Re-render
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function removeCustomCategory(index) {
    if (!selectedCharacter || !currentDraft || !currentDraft.categories) return;

    // Remove the category at the specified index
    currentDraft.categories.splice(index, 1);

    // Remove array if empty
    if (currentDraft.categories.length === 0) {
        delete currentDraft.categories;
    }

    refreshDraftDirtyState();
    updateStatus('Category removed - click Update Character to apply', 'warning');

    // Re-render
    renderCharacterDetails(selectedCharacter);
    renderSynergyEditor(selectedCharacter);
}

function updateCustomCategory(index, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.categories) return;

    // Trim whitespace
    value = value.trim();

    // Auto-remove if empty
    if (value === '') {
        removeCustomCategory(index);
        return;
    }

    // Check for duplicates
    const isDuplicate = currentDraft.categories.some((cat, i) =>
        i !== index && cat.toLowerCase() === value.toLowerCase()
    );

    if (isDuplicate) {
        alert('This category is already assigned. Duplicates are not allowed.');
        renderCharacterDetails(selectedCharacter);
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Check if the name conflicts with reserved names
    const isReserved = isReservedCategoryName(value);

    // Update the value (even if invalid, so user can see the error)
    currentDraft.categories[index] = value;

    refreshDraftDirtyState();

    if (isReserved) {
        updateStatus('Invalid category: conflicts with existing Category, Role, or Alignment', 'error');
    } else {
        updateStatus('Category updated - click Update Character to apply', 'warning');
    }
}

function updateCustomCategoryFromInput(index, inputElement) {
    if (!selectedCharacter || !currentDraft || !currentDraft.categories) return;

    const storedValue = inputElement.dataset.categoryValue;
    const inputValue = inputElement.value.trim();

    // If no change from stored value, skip
    if (storedValue === inputValue) {
        return;
    }

    updateCustomCategory(index, inputValue);
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
            <button class="btn btn-secondary btn-small" 
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
            <button class="btn btn-secondary btn-small" 
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
            <button class="btn btn-secondary btn-small" 
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
            <button class="btn btn-secondary add-synergy-btn" onclick="addSynergySet()">
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
                           oninput="updateSynergyEnhancement(${index}, this.value)">
                    <div class="form-help">When checked, the specified synergy enhancement will be applied if the synergy set criteria are met.</div>
                </div>
                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="chkSynergyOmicron_${index}" 
                               ${synergySet.synergyEnhancementOmicron !== undefined ? 'checked' : ''}
                               onchange="toggleSynergyomicronBoost(${index})" style="margin-right: 8px;">
                        Omicron Boost (0-10)
                    </label>
                    <input type="number" 
                           class="form-input"
                           id="inputSynergyOmicron_${index}"
                           min="0" 
                           max="10" 
                           value="${synergySet.synergyEnhancementOmicron ?? 0}"
                           ${synergySet.synergyEnhancementOmicron === undefined ? 'readonly' : ''}
                           oninput="updateSynergyomicronBoost(${index}, this.value)">
                    <div class="form-help">When checked, the specified Omicron boost will be applied to the synergy characters specified below. NOTE: This will only apply if ${character.id} has an Omicron ability.</div>
                </div>
                ${renderSynergyCharactersEditor(index, synergySet)}
                ${renderSynergyCategoryDefinitionsEditor(index, synergySet)}
                ${renderSynergyExclusionsEditor(index, synergySet)}
            </div>
        `;
    });

    html += '</div>';
    html += `
        <button class="btn btn-secondary add-synergy-btn" onclick="addSynergySet()">
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
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[index]) return;

    const checkbox = document.getElementById(`chkSynergyEnhancement_${index}`);
    const input = document.getElementById(`inputSynergyEnhancement_${index}`);

    if (checkbox.checked) {
        // Enable input - user wants to set a specific value
        input.removeAttribute('readonly');
        // Set initial value in draft (use current input value or default to 0)
        const currentValue = parseInt(input.value, 10);
        currentDraft.synergySets[index].synergyEnhancement = isNaN(currentValue) ? 0 : currentValue;
    } else {
        // Disable input and show default value
        input.setAttribute('readonly', 'readonly');
        input.value = 0;
        // Remove from draft
        delete currentDraft.synergySets[index].synergyEnhancement;
    }

    refreshDraftDirtyState();
    updateStatus('Synergy enhancement toggled - click Update Character to apply', 'warning');
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

function toggleSynergyomicronBoost(index) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[index]) return;

    const checkbox = document.getElementById(`chkSynergyOmicron_${index}`);
    const input = document.getElementById(`inputSynergyOmicron_${index}`);

    if (checkbox.checked) {
        // Enable input - user wants to set a specific value
        input.removeAttribute('readonly');
        // Set initial value in draft (use current input value or default to 0)
        const currentValue = parseInt(input.value, 10);
        currentDraft.synergySets[index].synergyEnhancementOmicron = isNaN(currentValue) ? 0 : currentValue;
    } else {
        // Disable input and show default value
        input.setAttribute('readonly', 'readonly');
        input.value = 0;
        // Remove from draft
        delete currentDraft.synergySets[index].synergyEnhancementOmicron;
    }

    refreshDraftDirtyState();
    updateStatus('Omicron boost toggled - click Update Character to apply', 'warning');
}

function updateSynergyomicronBoost(index, value) {
    if (!selectedCharacter || !currentDraft || !currentDraft.synergySets || !currentDraft.synergySets[index]) return;

    const hasomicronBoost = document.getElementById(`chkSynergyOmicron_${index}`).checked;
    const numValue = parseInt(value, 10);

    if (hasomicronBoost && (isNaN(numValue) || numValue < 0 || numValue > 10)) {
        alert('Omicron Boost must be between 0 and 10');
        renderSynergyEditor(selectedCharacter);
        return;
    }

    // Use checkbox state to determine whether to set the value
    if (hasomicronBoost) {
        currentDraft.synergySets[index].synergyEnhancementOmicron = numValue;
    } else {
        delete currentDraft.synergySets[index].synergyEnhancementOmicron;
    }

    refreshDraftDirtyState();
    updateStatus('Omicron boost updated - click Update Character to apply', 'warning');
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
    document.querySelectorAll('[id^="zeta-dropdown_"]').forEach(dropdown => dropdown.remove());
    document.querySelectorAll('[id^="omicron-dropdown_"]').forEach(dropdown => dropdown.remove());
    document.querySelectorAll('[id^="custom-category-dropdown_"]').forEach(dropdown => dropdown.remove());
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

        option.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur event from firing
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
    // Trim whitespace AND trailing/leading commas to avoid double commas
    const before = inputValue.substring(0, tagStartIndex).trim().replace(/,+$/, '').trim();
    const after = inputValue.substring(tagEndIndex).trim().replace(/^,+/, '').trim();

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

    console.log('insertTagAtCursor:', { tag, before, after, newValue, field });

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

    console.log('updateCategoryDefInclude:', { value, tags });

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
    const isValid = isDraftValid();
    const updateButtonLeft = document.getElementById('btnUpdateCharacterLeft');
    const updateButtonRight = document.getElementById('btnUpdateCharacterRight');

    if (updateButtonLeft) {
        updateButtonLeft.disabled = !isDraftDirty || !isValid;
    }
    if (updateButtonRight) {
        updateButtonRight.disabled = !isDraftDirty || !isValid;
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
    updateMissingCharacters();
}

/**
 * Gets the list of missing character IDs by comparing reference data with existing characters.
 * @returns {string[]} Array of missing character IDs, sorted alphabetically
 */
function getMissingCharacterIds() {
    if (!referenceCharacters || referenceCharacters.length === 0) {
        return [];
    }

    const existingIds = new Set(characterData.map(c => c.id));
    const missingCharacters = referenceCharacters.filter(refChar => {
        const refId = refChar.id || refChar.baseId;
        return refId && !existingIds.has(refId);
    });

    return missingCharacters
        .map(refChar => refChar.id || refChar.baseId)
        .filter(id => id)
        .sort();
}

function updateMissingCharacters() {
    const missingElement = document.getElementById('missingCharacters');

    if (!referenceCharacters || referenceCharacters.length === 0) {
        missingElement.textContent = 'Reference data loading...';
        missingElement.style.color = '';
        return;
    }

    const missingIds = getMissingCharacterIds();
    const missingCount = missingIds.length;

    if (missingCount === 0) {
        missingElement.textContent = 'No missing characters';
        missingElement.style.color = '';
    } else {
        missingElement.textContent = `${missingCount} missing character${missingCount === 1 ? '' : 's'}`;
        missingElement.style.color = '#f0ad4e';
    }
}

function updateValidationStatus(status) {
    const statusElement = document.getElementById('validationStatus');
    statusElement.textContent = status;
}
