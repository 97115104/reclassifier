document.addEventListener('DOMContentLoaded', function () {
    // --- State ---
    let rawData = null;
    let originalDataSnapshot = null; // Deep copy of original for diffing
    let originalItemCounts = {}; // Track original item counts per collection index
    let fileName = '';
    let collections = [];
    let fieldConfigs = [];
    let currentItemIndex = 0;
    let currentTarget = null;
    let currentFields = null;
    let currentOnComplete = null;
    // Track history: { itemIndex, title, status: 'modified'|'skipped'|'pending', fieldsSnapshot }
    let history = [];

    // --- Elements ---
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');

    const stepUpload = document.getElementById('step-upload');
    const stepSummary = document.getElementById('step-summary');
    const stepFields = document.getElementById('step-fields');
    const stepClassify = document.getElementById('step-classify');
    const stepResults = document.getElementById('step-results');

    const jsonSummary = document.getElementById('json-summary');
    const targetSelect = document.getElementById('target-select');
    const fieldsList = document.getElementById('fields-list');
    const classifyProgress = document.getElementById('classify-progress');
    const classifyCard = document.getElementById('classify-card');
    const historyList = document.getElementById('history-list');
    const jsonOutput = document.getElementById('json-output');
    const resultsSummary = document.getElementById('results-summary');

    const existingFieldsHint = document.getElementById('existing-fields-hint');
    const existingFieldsList = document.getElementById('existing-fields-list');

    // --- Navigation ---
    function showStep(step) {
        [stepUpload, stepSummary, stepFields, stepClassify, stepResults].forEach(s => s.classList.add('hidden'));
        step.classList.remove('hidden');
    }

    // --- Toast ---
    function showToast(msg) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // --- Info Modal ---
    document.getElementById('btn-info').addEventListener('click', () => {
        document.getElementById('info-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-info').addEventListener('click', () => {
        document.getElementById('info-modal').classList.add('hidden');
    });
    document.getElementById('info-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('info-modal').classList.add('hidden');
        }
    });

    // ============================
    // STEP 1: Upload
    // ============================
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('highlight');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('highlight'));
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('highlight');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    // ============================
    // JSON Validator (paste)
    // ============================
    const jsonPaste = document.getElementById('json-paste');
    const btnValidate = document.getElementById('btn-validate');
    const btnLoadPasted = document.getElementById('btn-load-pasted');
    const validatorResult = document.getElementById('validator-result');
    let validatedPastedData = null;

    btnValidate.addEventListener('click', () => {
        const text = jsonPaste.value.trim();
        if (!text) {
            showValidatorResult(false, 'Please paste some JSON first.');
            return;
        }
        try {
            const parsed = JSON.parse(text);
            validatedPastedData = parsed;
            const info = describeJson(parsed);
            showValidatorResult(true, 'Valid JSON — ' + info);
            btnLoadPasted.disabled = false;
        } catch (err) {
            validatedPastedData = null;
            btnLoadPasted.disabled = true;
            showValidatorResult(false, 'Invalid JSON: ' + err.message);
        }
    });

    btnLoadPasted.addEventListener('click', () => {
        if (!validatedPastedData) return;
        rawData = validatedPastedData;
        fileName = 'pasted.json';
        collections = JSONParser.analyze(rawData);
        if (collections.length === 0) {
            showToast('No classifiable objects found in this JSON.');
            return;
        }
        renderSummary();
        showStep(stepSummary);
    });

    function showValidatorResult(isValid, message) {
        validatorResult.classList.remove('hidden', 'valid', 'invalid');
        validatorResult.classList.add(isValid ? 'valid' : 'invalid');
        validatorResult.textContent = message;
    }

    function describeJson(data) {
        if (Array.isArray(data)) {
            return 'Array with ' + data.length + ' item' + (data.length !== 1 ? 's' : '');
        } else if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            return 'Object with ' + keys.length + ' key' + (keys.length !== 1 ? 's' : '');
        }
        return typeof data;
    }

    // ============================
    // File Upload
    // ============================
    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.json')) {
            showToast('Please select a valid JSON file.');
            return;
        }
        fileName = file.name;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                rawData = JSONParser.parse(e.target.result);
                collections = JSONParser.analyze(rawData);
                if (collections.length === 0) {
                    showToast('No classifiable objects found in this JSON.');
                    return;
                }
                renderSummary();
                showStep(stepSummary);
            } catch (err) {
                showToast('Invalid JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ============================
    // STEP 2: Summary
    // ============================
    function renderSummary() {
        let html = '<div class="summary-item"><span class="summary-label">File</span><span class="summary-value">' + escapeHtml(fileName) + '</span></div>';
        html += '<div class="summary-item"><span class="summary-label">Structure</span><span class="summary-value">' + (Array.isArray(rawData) ? 'Array' : 'Object') + '</span></div>';
        html += '<div class="summary-item"><span class="summary-label">Collections found</span><span class="summary-value">' + collections.length + '</span></div>';
        html += '<div class="summary-path-list">';
        collections.forEach(c => {
            html += '<div class="summary-path"><span>' + escapeHtml(c.path) + '</span><span class="count">' + c.count + ' item' + (c.count !== 1 ? 's' : '') + '</span></div>';
            html += '<div style="padding:0 12px 8px;font-size:12px;color:#888;">Fields: ' + c.sampleKeys.map(escapeHtml).join(', ') + (c.sampleKeys.length < c.items.reduce((a, o) => Math.max(a, Object.keys(o).length), 0) ? ', ...' : '') + '</div>';
        });
        html += '</div>';
        jsonSummary.innerHTML = html;
    }

    document.getElementById('btn-back-upload').addEventListener('click', () => {
        resetAll();
        showStep(stepUpload);
    });

    document.getElementById('btn-to-fields').addEventListener('click', () => {
        // Capture original snapshot before any modifications
        if (!originalDataSnapshot) {
            originalDataSnapshot = JSON.stringify(rawData, null, 2);
            // Capture original item counts per collection
            collections.forEach((c, i) => {
                originalItemCounts[i] = c.items.length;
            });
        }
        populateTargetSelect();
        updateExistingFieldsHint();
        renderFieldRows();
        showStep(stepFields);
    });

    // ============================
    // STEP 3: Configure Fields
    // ============================
    function populateTargetSelect() {
        targetSelect.innerHTML = '';
        collections.forEach((c, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = c.path + ' (' + c.count + ' items)';
            targetSelect.appendChild(opt);
        });
    }

    function updateExistingFieldsHint() {
        const targetIdx = parseInt(targetSelect.value);
        const col = collections[targetIdx];
        if (!col) return;

        const allKeys = JSONParser._commonKeys(col.items);
        if (allKeys.length === 0) {
            existingFieldsHint.classList.add('hidden');
            return;
        }

        existingFieldsHint.classList.remove('hidden');
        let html = '';
        allKeys.forEach(key => {
            html += '<span class="field-chip" data-field="' + escapeHtml(key) + '">' + escapeHtml(key) + '</span>';
        });
        existingFieldsList.innerHTML = html;

        // Click to add existing field for editing
        existingFieldsList.querySelectorAll('.field-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const fieldName = chip.dataset.field;
                // Check if already added
                const alreadyAdded = fieldConfigs.some(f => f.fieldName === fieldName && f.targetIndex === targetIdx);
                if (alreadyAdded) {
                    showToast('Field "' + fieldName + '" is already in the list.');
                    return;
                }
                addFieldRow({ fieldName, fieldType: 'text', options: null, isExisting: true });
                showToast('Added "' + fieldName + '" for editing.');
            });
        });
    }

    function renderFieldRows() {
        fieldsList.innerHTML = '';
        const targetIdx = parseInt(targetSelect.value);
        const relevantFields = fieldConfigs.filter(f => f.targetIndex === targetIdx);
        if (relevantFields.length === 0) {
            updateClassifyButton();
            return;
        }
        relevantFields.forEach(f => addFieldRow(f));
        updateClassifyButton();
    }

    targetSelect.addEventListener('change', () => {
        updateExistingFieldsHint();
        renderFieldRows();
    });

    function addFieldRow(existing) {
        const targetIdx = parseInt(targetSelect.value);
        const col = collections[targetIdx];
        const existingKeys = col ? JSONParser._commonKeys(col.items) : [];

        const row = document.createElement('div');
        row.className = 'field-row';
        row.dataset.targetIndex = targetIdx;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Field name (e.g. genre)';
        nameInput.value = existing ? existing.fieldName : '';

        const isExisting = existing && existing.isExisting;

        // Tag for existing fields
        const editTag = document.createElement('span');
        editTag.className = 'edit-existing-tag';
        editTag.textContent = 'edit';
        editTag.style.display = isExisting || (existing && existingKeys.includes(existing.fieldName)) ? 'inline-block' : 'none';

        const typeSelect = document.createElement('select');
        [
            { value: 'text', label: 'Text' },
            { value: 'textarea', label: 'Long Text' },
            { value: 'choice', label: 'Choice (Yes/No or Custom)' },
            { value: 'number', label: 'Number' },
            { value: 'boolean', label: 'True / False' }
        ].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.value;
            opt.textContent = t.label;
            typeSelect.appendChild(opt);
        });
        if (existing) typeSelect.value = existing.fieldType;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = '\u00d7';
        removeBtn.addEventListener('click', () => {
            row.remove();
            syncFieldConfigs();
            updateClassifyButton();
        });

        // Options area for choice type
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'field-options';
        optionsDiv.style.display = (existing && existing.fieldType === 'choice') ? 'block' : 'none';

        const optionsLabel = document.createElement('label');
        optionsLabel.textContent = 'Choices (comma-separated):';
        const optionsInput = document.createElement('input');
        optionsInput.type = 'text';
        optionsInput.placeholder = 'e.g. Fiction, Non-Fiction';
        optionsInput.value = existing && existing.options ? existing.options.join(', ') : '';

        optionsDiv.appendChild(optionsLabel);
        optionsDiv.appendChild(optionsInput);

        typeSelect.addEventListener('change', () => {
            optionsDiv.style.display = typeSelect.value === 'choice' ? 'block' : 'none';
            syncFieldConfigs();
        });

        nameInput.addEventListener('input', () => {
            // Show "edit" tag if this field already exists
            const name = nameInput.value.trim();
            editTag.style.display = existingKeys.includes(name) ? 'inline-block' : 'none';
            syncFieldConfigs();
            updateClassifyButton();
        });
        optionsInput.addEventListener('input', syncFieldConfigs);

        row.appendChild(nameInput);
        row.appendChild(editTag);
        row.appendChild(typeSelect);
        row.appendChild(removeBtn);
        row.appendChild(optionsDiv);
        fieldsList.appendChild(row);

        syncFieldConfigs();
        updateClassifyButton();
    }

    document.getElementById('btn-add-field').addEventListener('click', () => addFieldRow());

    // ============================
    // Add New Item Modal
    // ============================
    const addItemModal = document.getElementById('add-item-modal');
    const addItemFields = document.getElementById('add-item-fields');
    const btnAddItem = document.getElementById('btn-add-item');
    const btnAddItemStep3 = document.getElementById('btn-add-item-step3');
    const btnCloseAddItem = document.getElementById('btn-close-add-item');
    const btnCancelAddItem = document.getElementById('btn-cancel-add-item');
    const btnSaveNewItem = document.getElementById('btn-save-new-item');
    const btnAddAnotherItem = document.getElementById('btn-add-another-item');
    const newItemsCountEl = document.getElementById('new-items-count');
    const newItemsListEl = document.getElementById('new-items-list');

    // What's Next Modal elements
    const whatsNextModal = document.getElementById('whats-next-modal');
    const whatsNextMessage = document.getElementById('whats-next-message');
    const btnContinueEditFields = document.getElementById('btn-continue-edit-fields');
    const btnViewDiff = document.getElementById('btn-view-diff');

    let newItemsAddedCount = 0;
    let newItemsAdded = []; // Array of { item, title, collectionPath }
    let addItemContext = null; // 'step3' or 'step4'

    function openAddItemModal(context) {
        addItemContext = context || 'step4';
        
        // Get the target collection
        let targetCollection;
        if (addItemContext === 'step3') {
            const targetIdx = parseInt(targetSelect.value);
            targetCollection = collections[targetIdx];
        } else {
            targetCollection = currentTarget;
        }

        if (!targetCollection || !targetCollection.items) {
            showToast('No collection selected.');
            return;
        }

        // Get all unique keys from existing items to build the form
        const allKeys = JSONParser._commonKeys(targetCollection.items);
        
        addItemFields.innerHTML = '';

        if (allKeys.length === 0) {
            addItemFields.innerHTML = '<p style="color:#888;font-size:13px;">No existing fields found. Add at least one item manually first.</p>';
        }

        allKeys.forEach(key => {
            // Sample values to determine field type
            const sampleValues = targetCollection.items
                .map(item => item[key])
                .filter(v => v !== undefined && v !== null);
            
            const fieldType = detectFieldType(sampleValues);
            const group = document.createElement('div');
            group.className = 'add-item-field-group';

            const label = document.createElement('label');
            label.textContent = key;
            group.appendChild(label);

            let input;
            if (fieldType === 'boolean') {
                input = document.createElement('select');
                input.innerHTML = '<option value="">-- Select --</option><option value="true">True</option><option value="false">False</option>';
            } else if (fieldType === 'number') {
                input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.placeholder = 'Enter a number';
            } else if (fieldType === 'longtext') {
                input = document.createElement('textarea');
                input.placeholder = 'Enter value...';
                input.rows = 3;
            } else if (fieldType === 'url') {
                input = document.createElement('input');
                input.type = 'url';
                input.placeholder = 'https://...';
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Enter value...';
            }
            input.dataset.fieldName = key;
            input.dataset.fieldType = fieldType;
            group.appendChild(input);

            // Add type hint
            const hint = document.createElement('div');
            hint.className = 'field-type-hint';
            hint.textContent = fieldType === 'longtext' ? 'text' : fieldType;
            group.appendChild(hint);

            addItemFields.appendChild(group);
        });

        addItemModal.classList.remove('hidden');
    }

    function detectFieldType(sampleValues) {
        if (sampleValues.length === 0) return 'text';
        
        const firstNonNull = sampleValues[0];
        
        if (typeof firstNonNull === 'boolean') return 'boolean';
        if (typeof firstNonNull === 'number') return 'number';
        if (typeof firstNonNull === 'string') {
            // Check if it's a URL
            if (sampleValues.every(v => typeof v === 'string' && /^https?:\/\//i.test(v))) {
                return 'url';
            }
            // Check if it's long text (average > 100 chars)
            const avgLen = sampleValues.reduce((sum, v) => sum + (typeof v === 'string' ? v.length : 0), 0) / sampleValues.length;
            if (avgLen > 100) return 'longtext';
            return 'text';
        }
        return 'text';
    }

    function closeAddItemModal() {
        addItemModal.classList.add('hidden');
        addItemFields.innerHTML = '';
        addItemContext = null;
        editingItemIndex = null;
        // Reset modal header and buttons
        document.querySelector('#add-item-modal .modal-header h3').textContent = 'Add New Item';
        btnAddAnotherItem.style.display = '';
        btnSaveNewItem.textContent = 'Add Item';
    }

    function updateNewItemsCount() {
        if (newItemsAddedCount > 0) {
            newItemsCountEl.textContent = newItemsAddedCount + ' new item' + (newItemsAddedCount !== 1 ? 's' : '') + ' added';
            newItemsCountEl.classList.remove('hidden');
            
            // Render the list of new items
            renderNewItemsList();
        } else {
            newItemsCountEl.classList.add('hidden');
            newItemsListEl.classList.add('hidden');
        }
    }

    function renderNewItemsList() {
        if (newItemsAdded.length === 0) {
            newItemsListEl.classList.add('hidden');
            return;
        }

        let html = '';
        newItemsAdded.forEach((entry, i) => {
            const keys = Object.keys(entry.item);
            const previewKeys = keys.slice(0, 3).filter(k => k !== entry.titleKey);
            const previewParts = [];
            previewKeys.forEach(k => {
                const val = entry.item[k];
                if (typeof val === 'string' || typeof val === 'number') {
                    previewParts.push(truncate(String(val), 20));
                }
            });
            const preview = previewParts.join(' • ');

            html += '<div class="new-item-entry" data-item-index="' + i + '">';
            html += '<span class="new-item-badge">new</span>';
            html += '<span class="new-item-title">' + escapeHtml(entry.title) + '</span>';
            if (preview) {
                html += '<span class="new-item-preview">' + escapeHtml(preview) + '</span>';
            }
            html += '<button class="btn-edit-new-item" data-item-index="' + i + '">Edit</button>';
            html += '</div>';
        });

        newItemsListEl.innerHTML = html;
        newItemsListEl.classList.remove('hidden');

        // Wire up edit buttons
        newItemsListEl.querySelectorAll('.btn-edit-new-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.itemIndex);
                openEditItemModal(idx);
            });
        });
    }

    let editingItemIndex = null; // Track which item we're editing

    function openEditItemModal(itemIndex) {
        editingItemIndex = itemIndex;
        const entry = newItemsAdded[itemIndex];
        if (!entry) return;

        addItemContext = 'step3';
        
        // Get the target collection
        const targetIdx = parseInt(targetSelect.value);
        const targetCollection = collections[targetIdx];

        if (!targetCollection || !targetCollection.items) {
            showToast('No collection selected.');
            return;
        }

        // Get all unique keys from existing items to build the form
        const allKeys = JSONParser._commonKeys(targetCollection.items);
        
        addItemFields.innerHTML = '';

        // Update modal header to show "Edit Item" and hide "Add Another Item" button
        document.querySelector('#add-item-modal .modal-header h3').textContent = 'Edit Item';
        btnAddAnotherItem.style.display = 'none';
        btnSaveNewItem.textContent = 'Save Changes';

        allKeys.forEach(key => {
            // Sample values to determine field type
            const sampleValues = targetCollection.items
                .map(item => item[key])
                .filter(v => v !== undefined && v !== null);
            
            const fieldType = detectFieldType(sampleValues);
            const group = document.createElement('div');
            group.className = 'add-item-field-group';

            const label = document.createElement('label');
            label.textContent = key;
            group.appendChild(label);

            // Get current value from the item being edited
            const currentValue = entry.item[key];
            const valueStr = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';

            let input;
            if (fieldType === 'boolean') {
                input = document.createElement('select');
                input.innerHTML = '<option value="">-- Select --</option><option value="true"' + (currentValue === true ? ' selected' : '') + '>True</option><option value="false"' + (currentValue === false ? ' selected' : '') + '>False</option>';
            } else if (fieldType === 'number') {
                input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.placeholder = 'Enter a number';
                input.value = valueStr;
            } else if (fieldType === 'longtext') {
                input = document.createElement('textarea');
                input.placeholder = 'Enter value...';
                input.rows = 3;
                input.value = valueStr;
            } else if (fieldType === 'url') {
                input = document.createElement('input');
                input.type = 'url';
                input.placeholder = 'https://...';
                input.value = valueStr;
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Enter value...';
                input.value = valueStr;
            }
            input.dataset.fieldName = key;
            input.dataset.fieldType = fieldType;
            group.appendChild(input);

            // Add type hint
            const hint = document.createElement('div');
            hint.className = 'field-type-hint';
            hint.textContent = fieldType === 'longtext' ? 'text' : fieldType;
            group.appendChild(hint);

            addItemFields.appendChild(group);
        });

        addItemModal.classList.remove('hidden');
    }

    function updateExistingItem() {
        if (editingItemIndex === null) return;

        const entry = newItemsAdded[editingItemIndex];
        if (!entry) return;

        let hasValue = false;

        addItemFields.querySelectorAll('[data-field-name]').forEach(input => {
            const fieldName = input.dataset.fieldName;
            const fieldType = input.dataset.fieldType;
            let value = input.value.trim();

            if (value === '') {
                // Remove empty fields
                delete entry.item[fieldName];
                return;
            }

            hasValue = true;

            if (fieldType === 'boolean') {
                entry.item[fieldName] = value === 'true';
            } else if (fieldType === 'number') {
                const num = Number(value);
                entry.item[fieldName] = isNaN(num) ? value : num;
            } else {
                entry.item[fieldName] = value;
            }
        });

        if (!hasValue) {
            showToast('Please fill in at least one field.');
            return false;
        }

        // Update title
        const titleKey = JSONParser.detectTitleKey(Object.keys(entry.item));
        entry.title = titleKey && entry.item[titleKey] ? String(entry.item[titleKey]) : 'New Item';
        entry.titleKey = titleKey;

        editingItemIndex = null;
        closeAddItemModal();
        showToast('Item updated');
        renderNewItemsList();
        
        return true;
    }

    /**
     * Core function to collect form data and save the new item to the collection.
     * Returns { success: boolean, itemTitle: string, targetCollection: object } or null on failure.
     */
    function collectAndSaveItem() {
        const newItem = {};
        let hasValue = false;

        addItemFields.querySelectorAll('[data-field-name]').forEach(input => {
            const fieldName = input.dataset.fieldName;
            const fieldType = input.dataset.fieldType;
            let value = input.value.trim();

            if (value === '') return;

            hasValue = true;

            if (fieldType === 'boolean') {
                newItem[fieldName] = value === 'true';
            } else if (fieldType === 'number') {
                const num = Number(value);
                newItem[fieldName] = isNaN(num) ? value : num;
            } else {
                newItem[fieldName] = value;
            }
        });

        if (!hasValue) {
            showToast('Please fill in at least one field.');
            return null;
        }

        // Get the target collection based on context
        let targetCollection;
        if (addItemContext === 'step3') {
            const targetIdx = parseInt(targetSelect.value);
            targetCollection = collections[targetIdx];
        } else {
            targetCollection = currentTarget;
        }

        // Check if we can add items to this collection
        if (!targetCollection.sourceArray) {
            showToast('Cannot add items to a root object. The JSON must be an array.');
            return null;
        }

        // Add the new item to the actual source array in rawData
        targetCollection.sourceArray.push(newItem);
        // Also update the items reference for UI consistency
        targetCollection.items.push(newItem);
        targetCollection.count = targetCollection.items.length;
        newItemsAddedCount++;

        // Get title for display
        const titleKey = JSONParser.detectTitleKey(Object.keys(newItem));
        const itemTitle = titleKey && newItem[titleKey] ? String(newItem[titleKey]) : 'New Item';

        // Track the item for display in the list
        newItemsAdded.push({
            item: newItem,
            title: itemTitle,
            titleKey: titleKey,
            collectionPath: targetCollection.path
        });

        return { success: true, itemTitle, targetCollection, newItem };
    }

    function saveNewItem() {
        // Check if we're editing an existing item
        if (editingItemIndex !== null) {
            updateExistingItem();
            return;
        }

        const savedContext = addItemContext;
        const result = collectAndSaveItem();
        if (!result) return;

        const { itemTitle, targetCollection, newItem } = result;

        closeAddItemModal();
        showToast('Added: ' + itemTitle);

        if (savedContext === 'step3') {
            // In Step 3, update count and show "What's Next" modal
            updateNewItemsCount();
            showWhatsNextModal(itemTitle);
        } else {
            // In Step 4, add to history and jump to the new item
            history.push({
                itemIndex: history.length,
                title: itemTitle,
                status: 'modified',
                fieldsSnapshot: { ...newItem }
            });
            currentItemIndex = targetCollection.items.length - 1;
            renderClassifyItem();
        }
    }

    function saveAndAddAnother() {
        const savedContext = addItemContext;
        const result = collectAndSaveItem();
        if (!result) return;

        const { itemTitle } = result;

        showToast('Added: ' + itemTitle);
        updateNewItemsCount();

        // Clear the form fields and keep modal open for another item
        addItemFields.querySelectorAll('[data-field-name]').forEach(input => {
            if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
            }
        });

        // Focus the first input
        const firstInput = addItemFields.querySelector('[data-field-name]');
        if (firstInput) firstInput.focus();
    }

    function showWhatsNextModal(itemTitle) {
        whatsNextMessage.textContent = 'Successfully added "' + itemTitle + '". What would you like to do next?';
        whatsNextModal.classList.remove('hidden');
    }

    function closeWhatsNextModal() {
        whatsNextModal.classList.add('hidden');
    }

    btnAddItem.addEventListener('click', () => openAddItemModal('step4'));
    btnAddItemStep3.addEventListener('click', () => openAddItemModal('step3'));
    btnCloseAddItem.addEventListener('click', closeAddItemModal);
    btnCancelAddItem.addEventListener('click', closeAddItemModal);
    btnSaveNewItem.addEventListener('click', saveNewItem);
    btnAddAnotherItem.addEventListener('click', saveAndAddAnother);

    // What's Next modal event handlers
    btnContinueEditFields.addEventListener('click', () => {
        closeWhatsNextModal();
        // Stay on step 3 to configure fields
    });

    btnViewDiff.addEventListener('click', () => {
        closeWhatsNextModal();
        // originalDataSnapshot was captured when entering step 3
        showResults();
    });

    // Close What's Next modal on overlay click
    whatsNextModal.addEventListener('click', (e) => {
        if (e.target === whatsNextModal) {
            closeWhatsNextModal();
        }
    });

    // Close modal on overlay click
    addItemModal.addEventListener('click', (e) => {
        if (e.target === addItemModal) {
            closeAddItemModal();
        }
    });

    function syncFieldConfigs() {
        fieldConfigs = [];
        fieldsList.querySelectorAll('.field-row').forEach(row => {
            const inputs = row.querySelectorAll('input[type="text"]');
            const select = row.querySelector('select');
            const fieldName = inputs[0].value.trim();
            const fieldType = select.value;
            const optionsInput = inputs[1];
            let options = null;
            if (fieldType === 'choice' && optionsInput && optionsInput.value.trim()) {
                options = optionsInput.value.split(',').map(o => o.trim()).filter(Boolean);
            }
            const targetIdx = parseInt(row.dataset.targetIndex);
            const col = collections[targetIdx];
            const existingKeys = col ? JSONParser._commonKeys(col.items) : [];
            fieldConfigs.push({
                targetIndex: targetIdx,
                fieldName,
                fieldType,
                options,
                isExisting: existingKeys.includes(fieldName)
            });
        });
    }

    function updateClassifyButton() {
        // Button is always enabled now - users can add items OR configure fields
        // No longer need to disable
    }

    document.getElementById('btn-back-summary').addEventListener('click', () => {
        // Reset new items tracking when going back
        // Note: Items remain in rawData but tracking is reset
        newItemsAddedCount = 0;
        newItemsAdded = [];
        updateNewItemsCount();
        showStep(stepSummary);
    });

    document.getElementById('btn-to-classify').addEventListener('click', () => {
        syncFieldConfigs();
        const validFields = fieldConfigs.filter(f => f.fieldName.length > 0);
        
        if (validFields.length === 0 && newItemsAddedCount === 0) {
            showToast('Add new items or configure fields to edit first.');
            return;
        }

        if (validFields.length === 0) {
            // Only items added, no fields to edit - go straight to results
            // originalDataSnapshot was already captured when entering step 3
            showResults();
            return;
        }

        fieldConfigs = validFields;
        startClassification();
    });

    // ============================
    // STEP 4: Classify
    // ============================
    function startClassification() {
        // Snapshot the original data if not already captured
        if (!originalDataSnapshot) {
            originalDataSnapshot = JSON.stringify(rawData, null, 2);
        }

        const targetGroups = {};
        fieldConfigs.forEach(f => {
            if (!targetGroups[f.targetIndex]) targetGroups[f.targetIndex] = [];
            targetGroups[f.targetIndex].push(f);
        });

        const targetIndices = Object.keys(targetGroups).map(Number);
        classifyTargets(targetIndices, targetGroups, 0);
    }

    function classifyTargets(targetIndices, targetGroups, idx) {
        if (idx >= targetIndices.length) {
            showResults();
            return;
        }
        const ti = targetIndices[idx];
        currentTarget = collections[ti];
        currentItemIndex = 0;
        currentFields = targetGroups[ti];
        currentOnComplete = () => classifyTargets(targetIndices, targetGroups, idx + 1);

        // Build history entries for all items
        history = currentTarget.items.map((item, i) => {
            const titleKey = JSONParser.detectTitleKey(Object.keys(item));
            return {
                itemIndex: i,
                title: titleKey ? String(item[titleKey]) : 'Item ' + (i + 1),
                status: 'pending',
                fieldsSnapshot: null
            };
        });

        showStep(stepClassify);
        renderClassifyItem();
    }

    function renderClassifyItem() {
        const items = currentTarget.items;
        if (currentItemIndex >= items.length) {
            currentOnComplete();
            return;
        }

        const item = items[currentItemIndex];
        const fields = currentFields;
        const total = items.length;
        const pct = Math.round((currentItemIndex / total) * 100);

        // Progress
        classifyProgress.innerHTML =
            '<div>Item ' + (currentItemIndex + 1) + ' of ' + total + ' &mdash; <strong>' + escapeHtml(currentTarget.path) + '</strong></div>' +
            '<div class="progress-bar-wrapper"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>';

        // Detect title and image
        const keys = Object.keys(item);
        const titleKey = JSONParser.detectTitleKey(keys);
        const imageKey = JSONParser.detectImageKey(keys);
        const excludeKeys = [titleKey, imageKey].filter(Boolean);
        // Also exclude the fields we're editing from the preview
        fields.forEach(f => { if (!excludeKeys.includes(f.fieldName)) excludeKeys.push(f.fieldName); });
        const previewFields = JSONParser.getPreviewFields(item, excludeKeys, 5);

        let html = '<div class="card-header">';
        if (imageKey && item[imageKey] && typeof item[imageKey] === 'string' && isUrl(item[imageKey])) {
            html += '<img class="card-image" src="' + escapeHtml(item[imageKey]) + '" alt="" onerror="this.style.display=\'none\'">';
        }
        html += '<div class="card-details">';
        if (titleKey) {
            html += '<div class="card-title">' + escapeHtml(String(item[titleKey])) + '</div>';
        }
        previewFields.forEach(pf => {
            html += '<div class="card-meta"><strong>' + escapeHtml(pf.key) + ':</strong> ' + escapeHtml(pf.value) + '</div>';
        });
        html += '</div></div>';

        // Field inputs
        html += '<div class="card-fields">';
        fields.forEach((f, fi) => {
            const existingValue = item.hasOwnProperty(f.fieldName) ? item[f.fieldName] : null;
            html += '<div class="card-field-group" data-field-index="' + fi + '">';
            html += '<label>' + escapeHtml(f.fieldName);
            if (f.isExisting && existingValue !== null) {
                html += '<span class="existing-value-hint">(current: ' + escapeHtml(truncate(String(existingValue), 40)) + ')</span>';
            }
            html += '</label>';

            const prefillValue = existingValue !== null ? String(existingValue) : '';

            if (f.fieldType === 'choice' && f.options && f.options.length > 0) {
                html += '<div class="choice-group">';
                f.options.forEach(opt => {
                    const sel = (prefillValue === opt) ? ' selected' : '';
                    html += '<button type="button" class="choice-btn' + sel + '" data-value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
                });
                html += '</div>';
            } else if (f.fieldType === 'boolean') {
                html += '<div class="choice-group">';
                const trueSelected = (existingValue === true || prefillValue === 'true') ? ' selected' : '';
                const falseSelected = (existingValue === false || prefillValue === 'false') ? ' selected' : '';
                html += '<button type="button" class="choice-btn' + trueSelected + '" data-value="true">True</button>';
                html += '<button type="button" class="choice-btn' + falseSelected + '" data-value="false">False</button>';
                html += '</div>';
            } else if (f.fieldType === 'textarea') {
                html += '<textarea data-field-name="' + escapeHtml(f.fieldName) + '">' + escapeHtml(prefillValue) + '</textarea>';
            } else if (f.fieldType === 'number') {
                html += '<input type="text" inputmode="numeric" data-field-name="' + escapeHtml(f.fieldName) + '" placeholder="Enter a number" value="' + escapeHtml(prefillValue) + '">';
            } else {
                html += '<input type="text" data-field-name="' + escapeHtml(f.fieldName) + '" placeholder="Enter value" value="' + escapeHtml(prefillValue) + '">';
            }
            html += '</div>';
        });
        html += '</div>';

        classifyCard.innerHTML = html;

        // Wire up choice buttons
        classifyCard.querySelectorAll('.choice-group').forEach(group => {
            group.querySelectorAll('.choice-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                });
            });
        });

        // Render history sidebar
        renderHistory();

        // Wire buttons
        wireClassifyButtons();
    }

    function wireClassifyButtons() {
        const saveBtn = document.getElementById('btn-save-item');
        const skipBtn = document.getElementById('btn-skip');
        const prevBtn = document.getElementById('btn-prev');

        const newSave = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSave, saveBtn);
        const newSkip = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        const newPrev = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrev, prevBtn);

        // Disable back if at first item
        newPrev.disabled = currentItemIndex === 0;

        newSave.addEventListener('click', () => {
            saveCurrentItem();
            history[currentItemIndex].status = 'modified';
            history[currentItemIndex].fieldsSnapshot = getFieldSnapshot();
            currentItemIndex++;
            renderClassifyItem();
        });

        newSkip.addEventListener('click', () => {
            if (history[currentItemIndex].status === 'pending') {
                history[currentItemIndex].status = 'skipped';
            }
            currentItemIndex++;
            renderClassifyItem();
        });

        newPrev.addEventListener('click', () => {
            if (currentItemIndex > 0) {
                currentItemIndex--;
                renderClassifyItem();
            }
        });
    }

    function getFieldSnapshot() {
        const snap = {};
        currentFields.forEach((f, fi) => {
            const group = classifyCard.querySelector('[data-field-index="' + fi + '"]');
            if (!group) return;
            if (f.fieldType === 'choice' || f.fieldType === 'boolean') {
                const selected = group.querySelector('.choice-btn.selected');
                snap[f.fieldName] = selected ? selected.dataset.value : null;
            } else if (f.fieldType === 'textarea') {
                snap[f.fieldName] = group.querySelector('textarea').value;
            } else {
                snap[f.fieldName] = group.querySelector('input').value;
            }
        });
        return snap;
    }

    function saveCurrentItem() {
        const item = currentTarget.items[currentItemIndex];
        currentFields.forEach((f, fi) => {
            const group = classifyCard.querySelector('[data-field-index="' + fi + '"]');
            if (!group) return;

            var originalValue = item.hasOwnProperty(f.fieldName) ? item[f.fieldName] : undefined;
            let value = null;

            if (f.fieldType === 'choice' || f.fieldType === 'boolean') {
                const selected = group.querySelector('.choice-btn.selected');
                if (selected) {
                    value = selected.dataset.value;
                    if (f.fieldType === 'boolean') {
                        value = value === 'true';
                    }
                }
            } else if (f.fieldType === 'textarea') {
                value = group.querySelector('textarea').value;
            } else if (f.fieldType === 'number') {
                const raw = group.querySelector('input').value.trim();
                if (raw !== '') value = Number(raw);
            } else {
                value = group.querySelector('input').value;
            }

            if (value !== null && value !== '') {
                // If the field already existed, preserve original type when value is unchanged
                if (originalValue !== undefined && String(originalValue) === String(value)) {
                    // No change — keep original value and type
                    return;
                }
                // If the user typed a value that looks like the original type, preserve it
                if (typeof value === 'string' && f.fieldType === 'text') {
                    value = preserveType(value, originalValue);
                }
                item[f.fieldName] = value;
            }
        });
    }

    /**
     * If the new string value can be interpreted as the same type as the original,
     * return it in that type. Otherwise return the string as-is.
     */
    function preserveType(strValue, originalValue) {
        if (originalValue === undefined || originalValue === null) return strValue;

        if (typeof originalValue === 'number') {
            var num = Number(strValue);
            if (!isNaN(num) && strValue.trim() !== '') return num;
        } else if (typeof originalValue === 'boolean') {
            if (strValue === 'true') return true;
            if (strValue === 'false') return false;
        }
        return strValue;
    }

    // --- History ---
    function renderHistory() {
        if (history.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No items yet</div>';
            return;
        }

        let html = '';
        history.forEach((h, i) => {
            const isActive = i === currentItemIndex;
            html += '<div class="history-item' + (isActive ? ' active' : '') + '" data-index="' + i + '">';
            html += '<div class="history-title">' + escapeHtml(truncate(h.title, 28)) + '</div>';
            if (h.status === 'modified') {
                html += '<div class="history-status modified">modified</div>';
            } else if (h.status === 'skipped') {
                html += '<div class="history-status skipped">skipped</div>';
            } else {
                html += '<div class="history-meta">#' + (i + 1) + '</div>';
            }
            html += '</div>';
        });
        historyList.innerHTML = html;

        // Click to jump
        historyList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index);
                // Save current before jumping if user made changes
                if (history[currentItemIndex] && history[currentItemIndex].status !== 'pending') {
                    // Already saved or skipped — just jump
                }
                currentItemIndex = idx;
                renderClassifyItem();
            });
        });

        // Scroll active into view
        const activeEl = historyList.querySelector('.history-item.active');
        if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    // ============================
    // STEP 5: Results
    // ============================
    function showResults() {
        showStep(stepResults);

        const newDataStr = JSON.stringify(rawData, null, 2);
        const oldLines = originalDataSnapshot.split('\n');
        const newLines = newDataStr.split('\n');

        // Calculate new items added across all collections
        let totalNewItems = 0;
        const newItemsPerCollection = {};
        collections.forEach((c, i) => {
            const originalCount = originalItemCounts[i] || 0;
            const currentCount = c.items.length;
            const newCount = currentCount - originalCount;
            if (newCount > 0) {
                totalNewItems += newCount;
                newItemsPerCollection[i] = {
                    path: c.path,
                    count: newCount,
                    startIndex: originalCount // Index where new items start
                };
            }
        });

        // Compute diff
        const diffOps = computeDiff(oldLines, newLines);

        // Count actual changes from diff
        let linesAdded = 0;
        let linesRemoved = 0;
        diffOps.forEach(op => {
            if (op.type === 'add') linesAdded++;
            if (op.type === 'remove') linesRemoved++;
        });

        // Summary
        let totalFields = fieldConfigs.length;
        const fieldsAdded = {};
        const fieldsEdited = {};

        fieldConfigs.forEach(f => {
            const key = f.fieldName;
            const target = collections[f.targetIndex];
            let count = 0;
            target.items.forEach(item => {
                if (item.hasOwnProperty(key)) count++;
            });

            if (f.isExisting) {
                if (!fieldsEdited[key]) fieldsEdited[key] = 0;
                fieldsEdited[key] += count;
            } else {
                if (!fieldsAdded[key]) fieldsAdded[key] = 0;
                fieldsAdded[key] += count;
            }
        });

        let summaryHtml = '';

        // Show new items added prominently at the top
        if (totalNewItems > 0) {
            summaryHtml += '<div class="summary-item summary-highlight"><span class="summary-label">New items added</span><span class="summary-value summary-value-highlight">' + totalNewItems + ' new item' + (totalNewItems !== 1 ? 's' : '') + '</span></div>';
            Object.values(newItemsPerCollection).forEach(info => {
                summaryHtml += '<div class="summary-item summary-sub"><span class="summary-label">&nbsp;&nbsp;' + escapeHtml(info.path) + '</span><span class="summary-value">+' + info.count + '</span></div>';
            });
        }

        if (totalFields > 0) {
            summaryHtml += '<div class="summary-item"><span class="summary-label">Fields configured</span><span class="summary-value">' + totalFields + '</span></div>';
        }
        Object.keys(fieldsAdded).forEach(fn => {
            summaryHtml += '<div class="summary-item"><span class="summary-label">' + escapeHtml(fn) + ' (new)</span><span class="summary-value">' + fieldsAdded[fn] + ' objects updated</span></div>';
        });
        Object.keys(fieldsEdited).forEach(fn => {
            summaryHtml += '<div class="summary-item"><span class="summary-label">' + escapeHtml(fn) + ' (edited)</span><span class="summary-value">' + fieldsEdited[fn] + ' objects updated</span></div>';
        });

        if (linesAdded === 0 && linesRemoved === 0 && totalNewItems === 0) {
            summaryHtml += '<div class="summary-item"><span class="summary-label">Result</span><span class="summary-value">No changes made</span></div>';
        } else {
            summaryHtml += '<div class="summary-item"><span class="summary-label">Diff</span><span class="summary-value">+' + linesAdded + ' / -' + linesRemoved + ' lines</span></div>';
        }
        resultsSummary.innerHTML = summaryHtml;

        // Render diff
        const diffOutput = document.getElementById('diff-output');
        if (linesAdded === 0 && linesRemoved === 0) {
            diffOutput.innerHTML = '<span class="diff-no-changes">No changes were made to the JSON data.</span>';
        } else {
            diffOutput.innerHTML = renderDiffHtml(diffOps);
        }

        // Render JSON with highlighted new items
        jsonOutput.innerHTML = renderJsonWithHighlights(rawData, newItemsPerCollection);
    }

    /**
     * Render JSON with new items highlighted
     */
    function renderJsonWithHighlights(data, newItemsPerCollection) {
        const jsonStr = JSON.stringify(data, null, 2);
        
        // If no new items, just return escaped JSON
        if (Object.keys(newItemsPerCollection).length === 0) {
            return escapeHtml(jsonStr);
        }

        // Build a list of new item JSON representations for matching
        const newItemMarkers = [];
        Object.entries(newItemsPerCollection).forEach(([colIndex, info]) => {
            const col = collections[colIndex];
            for (let i = info.startIndex; i < col.items.length; i++) {
                const itemJson = JSON.stringify(col.items[i], null, 2);
                newItemMarkers.push(itemJson);
            }
        });

        // Highlight new items in the JSON output
        let result = escapeHtml(jsonStr);
        newItemMarkers.forEach(marker => {
            const escapedMarker = escapeHtml(marker);
            // Wrap matched items with highlight span
            result = result.replace(escapedMarker, '<span class="json-new-item">' + escapedMarker + '</span>');
        });

        return result;
    }

    // --- Diff engine (Myers-like, simplified) ---
    function computeDiff(oldLines, newLines) {
        // Build a simple LCS-based diff
        var oldLen = oldLines.length;
        var newLen = newLines.length;

        // For large files, use a windowed approach
        // But for typical JSON files this is fine
        var maxLen = oldLen + newLen;

        // LCS via Hunt-Szymanski for better perf on similar files
        // Fallback: simple O(NM) DP for correctness
        var dp = [];
        for (var i = 0; i <= oldLen; i++) {
            dp[i] = new Uint16Array(newLen + 1);
        }
        for (var i = 1; i <= oldLen; i++) {
            for (var j = 1; j <= newLen; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
                }
            }
        }

        // Backtrack to build diff ops
        var ops = [];
        var i = oldLen, j = newLen;
        var rawOps = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                rawOps.push({ type: 'context', line: oldLines[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                rawOps.push({ type: 'add', line: newLines[j - 1] });
                j--;
            } else {
                rawOps.push({ type: 'remove', line: oldLines[i - 1] });
                i--;
            }
        }
        rawOps.reverse();

        // Collapse context: show only 3 lines around changes
        var contextRadius = 3;
        var hasChange = rawOps.map(op => op.type !== 'context');
        var show = new Array(rawOps.length).fill(false);
        for (var k = 0; k < rawOps.length; k++) {
            if (hasChange[k]) {
                for (var c = Math.max(0, k - contextRadius); c <= Math.min(rawOps.length - 1, k + contextRadius); c++) {
                    show[c] = true;
                }
            }
        }

        var result = [];
        var inHidden = false;
        for (var k = 0; k < rawOps.length; k++) {
            if (show[k]) {
                inHidden = false;
                result.push(rawOps[k]);
            } else if (!inHidden) {
                inHidden = true;
                result.push({ type: 'separator' });
            }
        }

        return result;
    }

    function renderDiffHtml(ops) {
        var html = '';
        ops.forEach(function (op) {
            if (op.type === 'separator') {
                html += '<span class="diff-line-header">  ...</span>';
            } else if (op.type === 'add') {
                html += '<span class="diff-line-add">+ ' + escapeHtml(op.line) + '</span>';
            } else if (op.type === 'remove') {
                html += '<span class="diff-line-remove">- ' + escapeHtml(op.line) + '</span>';
            } else {
                html += '<span class="diff-line-context">  ' + escapeHtml(op.line) + '</span>';
            }
        });
        return html;
    }

    document.getElementById('btn-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(rawData, null, 2)).then(() => {
            showToast('Copied to clipboard');
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = JSON.stringify(rawData, null, 2);
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Copied to clipboard');
        });
    });

    document.getElementById('btn-validate-output').addEventListener('click', () => {
        const el = document.getElementById('output-validator-result');
        try {
            JSON.parse(JSON.stringify(rawData));
            el.classList.remove('hidden', 'invalid');
            el.classList.add('valid');
            el.textContent = 'Valid JSON — ' + describeJson(rawData);
        } catch (err) {
            el.classList.remove('hidden', 'valid');
            el.classList.add('invalid');
            el.textContent = 'Invalid JSON: ' + err.message;
        }
    });

    document.getElementById('btn-download').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(rawData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.json$/i, '') + '_reclassified.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btn-back-classify').addEventListener('click', () => {
        // If we have field configs, go back to classify step
        if (fieldConfigs.length > 0 && currentTarget) {
            currentItemIndex = currentTarget.items.length - 1;
            showStep(stepClassify);
            renderClassifyItem();
        } else {
            // Otherwise go back to the Configure Fields step
            populateTargetSelect();
            updateExistingFieldsHint();
            renderFieldRows();
            updateNewItemsCount();
            showStep(stepFields);
        }
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
        resetAll();
        showStep(stepUpload);
    });

    // ============================
    // Helpers
    // ============================
    function resetAll() {
        rawData = null;
        originalDataSnapshot = null;
        originalItemCounts = {};
        fileName = '';
        collections = [];
        fieldConfigs = [];
        currentItemIndex = 0;
        currentTarget = null;
        currentFields = null;
        currentOnComplete = null;
        history = [];
        newItemsAddedCount = 0;
        newItemsAdded = [];
        fileInput.value = '';
        dropArea.innerHTML = '<p>Drag &amp; drop a JSON file here or click to select</p>';
        jsonPaste.value = '';
        validatedPastedData = null;
        btnLoadPasted.disabled = true;
        validatorResult.classList.add('hidden');
        fieldsList.innerHTML = '';
        classifyCard.innerHTML = '';
        classifyProgress.innerHTML = '';
        historyList.innerHTML = '';
        jsonOutput.innerHTML = '';
        resultsSummary.innerHTML = '';
        jsonSummary.innerHTML = '';
        existingFieldsHint.classList.add('hidden');
        newItemsCountEl.classList.add('hidden');
        newItemsListEl.innerHTML = '';
        newItemsListEl.classList.add('hidden');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function isUrl(str) {
        return /^https?:\/\//i.test(str);
    }

    function truncate(str, max) {
        return str.length > max ? str.substring(0, max) + '...' : str;
    }
});
