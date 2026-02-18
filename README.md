# Reclassifier

A serverless web tool for adding items and editing fields in JSON data. Upload a JSON file, add new entries, define fields to edit, and download the updated JSON.

**Live:** [https://97115104.github.io/reclassifier/](https://97115104.github.io/reclassifier/)

## Features

- **Upload JSON** — Drag & drop or click to upload any `.json` file
- **Auto-detection** — Parses nested structures and finds all classifiable object collections
- **Flexible field types** — Text, long text, number, boolean, or custom choice fields
- **Smart display** — Auto-detects title and image keys to give context while classifying
- **Batch processing** — Work through every object one at a time with progress tracking
- **Add new items** — Add new entries to your collections directly from the interface
- **Skip support** — Skip objects you don't want to classify
- **Export** — Download the modified JSON or copy it to clipboard

## How It Works

1. **Upload** a JSON file containing objects (array of objects, nested collections, or a single object)
2. **Review** the parsed structure — see what collections were found and their fields
3. **Add fields** — Define one or more new fields to add, choosing the input type (text, choice, boolean, etc.)
4. **Classify** — For each object, see its existing data and fill in the new field values
5. **Add items** — Use the "+ Add New Item" button to add new entries to your collection
6. **Export** — Review a summary of changes, then download or copy the updated JSON

## Example Use Cases

- Add genre classifications to a list of books
- Add new books or projects to existing JSON collections
- Tag products with categories
- Add review scores to a collection of items
- Mark records as active/inactive
- Annotate any JSON dataset with new metadata

## Project Structure

```
├── index.html          # Main HTML page
├── css/
│   └── main.css        # All styles
├── js/
│   ├── parser.js       # JSON parsing and analysis
│   └── app.js          # Application logic and UI
├── assets/
│   └── favicon.svg     # Favicon
├── LICENSE             # MIT License
└── README.md           # This file
```

## Development

No build tools or dependencies required. Open `index.html` in a browser or serve with any static file server:

```bash
python3 -m http.server 8000
```

## Attestation

This project was built with the assistance of Claude (Anthropic). Verified via [attest.ink](https://attest.ink).

## License

[MIT](LICENSE) — Copyright (c) 2025 Austin Harshberger
