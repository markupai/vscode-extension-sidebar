# Markup AI

The Markup AI sidebar for VS Code — a panel that opens from the activity bar, checks the active document (or just your selection) with the Markup AI Style Agent, highlights flagged text in the editor, and applies suggestions directly to your document.

> Looking for native, editor-integrated checking (inline diagnostics, quick fixes, a findings panel, batch folder scanning)? That ships as the separate **Markup AI Lint** extension.

## Prerequisites

To use Markup AI for VS Code, you need a Markup AI account. Once the extension is installed, sign in from inside the sidebar panel to start checking your content.

This extension isn't a stand-alone authoring tool — it works only with the Markup AI platform. To procure the Markup AI solution, please visit [markup.ai/pricing](https://markup.ai/pricing/).

## Features

- **Sidebar panel** — opens from the Markup AI icon in the activity bar
- **Check the active document or a selection** — run a check from the panel
- **In-editor highlighting** — clicking an issue card reveals and highlights the corresponding text in the editor
- **Inline suggestions** — apply a single suggestion, or apply all, directly to the document
- **Self-contained sign-in** — sign in, sign out, and pick a style guide from inside the panel

## Getting Started

### 1. Install the Extension

Install from the VS Code Marketplace, or from the [Open VSX Registry](https://open-vsx.org) for Cursor and other VS Code–compatible editors.

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
- A Markup AI account — see [Prerequisites](#prerequisites)

## Support

For issues, feature requests, or questions, please visit the [Markup AI documentation](https://docs.markup.ai) or contact support.
