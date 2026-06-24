# Markup AI

The Markup AI sidebar for VS Code — a panel that opens from the activity bar, checks the active document (or just your selection) with the Markup AI Style Agent, highlights flagged text in the editor, and applies suggestions directly to your document.

> Looking for native, editor-integrated checking (inline diagnostics, quick fixes, a findings panel, batch folder scanning)? That ships as the separate **Markup AI Lint** extension.

## Features

- **Sidebar panel** — opens from the Markup AI icon in the activity bar
- **Check the active document or a selection** — run a check from the panel
- **In-editor highlighting** — clicking an issue card reveals and highlights the corresponding text in the editor
- **Inline suggestions** — apply a single suggestion, or apply all, directly to the document
- **Self-contained sign-in** — sign in, sign out, and pick a style guide from inside the panel

## Getting Started

### 1. Install the Extension

Install from the VS Code Marketplace or build from source.

### 2. Open the Sidebar

Click the **Markup AI** icon in the activity bar, then sign in from within the panel.

### 3. Start Checking

Open a supported document (Markdown, plain text, HTML, DITA/XML), then run a check from the panel. Click any issue to jump to it in the editor, and apply suggestions inline.

## Configuration

Access settings via `File > Preferences > Settings` and search for "Markup AI":

| Setting                | Description                       | Default |
| ---------------------- | --------------------------------- | ------- |
| `markupai.environment` | API environment (`prod` or `dev`) | `prod`  |

Sign-in is handled inside the sidebar panel; no token settings are stored by the extension.

## Requirements

- VS Code 1.105.1 or higher (Desktop or Remote)
- A Markup AI account ([markup.ai](https://markup.ai))

## Development

```bash
# Install dependencies
npm install

# Compile (extension host + web + sidebar webview bundles)
npm run compile

# Run tests
npm test

# Run linter
npm run lint:check

# Package extension
npm run package
```

## Support

For issues, feature requests, or questions, please visit the [Markup AI documentation](https://docs.markup.ai) or contact support.
