/**
 * parser.js - JSON parsing and analysis utilities for Reclassifier
 */

const JSONParser = {
    /**
     * Parse JSON string and return the data
     */
    parse(text) {
        return JSON.parse(text);
    },

    /**
     * Analyze JSON structure and find all array paths containing objects.
     * Returns an array of { path, count, sampleKeys, sample } objects.
     */
    analyze(data) {
        const results = [];
        this._walk(data, '', results);

        // If the root is a single object (not array), treat it as a single-item collection
        // Note: Can't add items to a root object, only to arrays
        if (results.length === 0 && typeof data === 'object' && data !== null && !Array.isArray(data)) {
            results.push({
                path: '(root object)',
                count: 1,
                sampleKeys: Object.keys(data).slice(0, 8),
                items: [data],
                sourceArray: null, // Root objects can't have items added
                isRootObject: true
            });
        }

        return results;
    },

    _walk(node, path, results) {
        if (Array.isArray(node)) {
            // Check if this array contains objects
            const objectItems = node.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item));
            if (objectItems.length > 0) {
                const sampleKeys = this._commonKeys(objectItems);
                results.push({
                    path: path || '(root array)',
                    count: objectItems.length,
                    sampleKeys: sampleKeys.slice(0, 8),
                    items: objectItems,
                    sourceArray: node, // Reference to the actual array in rawData
                    isRootObject: false
                });
            }
            // Still recurse into array items for nested arrays
            node.forEach((item, i) => {
                if (typeof item === 'object' && item !== null) {
                    this._walk(item, path + '[' + i + ']', results);
                }
            });
        } else if (typeof node === 'object' && node !== null) {
            for (const key of Object.keys(node)) {
                const childPath = path ? path + '.' + key : key;
                if (typeof node[key] === 'object' && node[key] !== null) {
                    this._walk(node[key], childPath, results);
                }
            }
        }
    },

    /**
     * Get the most common keys across an array of objects
     */
    _commonKeys(objects) {
        const keyCount = {};
        objects.forEach(obj => {
            Object.keys(obj).forEach(key => {
                keyCount[key] = (keyCount[key] || 0) + 1;
            });
        });
        return Object.keys(keyCount).sort((a, b) => keyCount[b] - keyCount[a]);
    },

    /**
     * Try to detect a display-friendly title key for an object
     */
    detectTitleKey(keys) {
        const titleCandidates = ['title', 'name', 'label', 'id', 'key', 'heading', 'subject', 'description'];
        for (const candidate of titleCandidates) {
            const match = keys.find(k => k.toLowerCase() === candidate);
            if (match) return match;
        }
        // Partial match
        for (const candidate of titleCandidates) {
            const match = keys.find(k => k.toLowerCase().includes(candidate));
            if (match) return match;
        }
        return keys[0] || null;
    },

    /**
     * Try to detect an image URL key for an object
     */
    detectImageKey(keys) {
        const imageCandidates = [
            'image', 'img', 'thumbnail', 'thumb', 'cover', 'photo', 'picture',
            'avatar', 'icon', 'poster', 'artwork', 'imageUrl', 'image_url',
            'coverImage', 'cover_image', 'thumbnailUrl', 'thumbnail_url'
        ];
        for (const candidate of imageCandidates) {
            const match = keys.find(k => k.toLowerCase() === candidate.toLowerCase());
            if (match) return match;
        }
        // Partial match
        for (const candidate of ['image', 'img', 'photo', 'cover', 'thumb', 'picture']) {
            const match = keys.find(k => k.toLowerCase().includes(candidate));
            if (match) return match;
        }
        return null;
    },

    /**
     * Get a display-friendly preview of an object's key fields (excluding the title/image)
     */
    getPreviewFields(obj, excludeKeys, maxFields) {
        maxFields = maxFields || 4;
        const keys = Object.keys(obj).filter(k => !excludeKeys.includes(k));
        const preview = [];
        for (let i = 0; i < Math.min(keys.length, maxFields); i++) {
            const val = obj[keys[i]];
            let display;
            if (typeof val === 'string') {
                display = val.length > 60 ? val.substring(0, 60) + '...' : val;
            } else if (typeof val === 'number' || typeof val === 'boolean') {
                display = String(val);
            } else if (Array.isArray(val)) {
                display = '[' + val.length + ' items]';
            } else if (typeof val === 'object' && val !== null) {
                display = '{...}';
            } else {
                display = String(val);
            }
            preview.push({ key: keys[i], value: display });
        }
        return preview;
    }
};
