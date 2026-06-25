# Changelog

All notable changes to the Markup AI sidebar extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-25

### Added

- Published to the [Open VSX registry](https://open-vsx.org/extension/markupai/vscode-markupai),
  making the extension installable in Open VSX–based editors such as Cursor, VSCodium, and
  Windsurf, alongside the VS Code Marketplace.

## [0.1.0] - 2026-06-24

Initial public release.

### Added

- Sidebar panel that opens from the Markup AI icon in the activity bar and hosts the Markup AI
  web app.
- Check the active document or just the current selection from the panel.
- In-editor highlighting — clicking an issue card reveals and highlights the corresponding text
  in the editor.
- Inline suggestions — apply a single suggestion or apply all directly to the document.
- Self-contained sign-in, sign-out, and style-guide selection from inside the panel.
- Support for Markdown, plain text, HTML, and DITA/XML documents.
- `markupai.environment` setting to switch between the `prod` and `dev` API environments.
