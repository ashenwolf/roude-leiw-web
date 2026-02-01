# Letz Language Support for VS Code

Syntax highlighting for `.letz` Luxembourgish lesson files used by Roude Léiw.

## Features

- **File icon** — Luxembourgish flag colors (red, white, light blue) in a circle
- **Syntax highlighting** for `.letz` files:
  - Comments (`# ...`)
  - Lesson headers (`@lesson A1.01 "Title"`)
  - Word pairs (`Luxembourgish = English`)
- **Auto-closing** for quoted strings
- **Comment toggling** with `Cmd+/` (macOS) or `Ctrl+/` (Windows/Linux)

## File Format

```letz
# This is a comment

@lesson A1.01 "Basic Greetings"

Moien = hello
Äddi = goodbye
Merci = thank you
```

## Installation

### Option 1: Install from VSIX (Recommended)

1. Package the extension:
   ```bash
   cd vscode-letz
   npm install -g @vscode/vsce
   vsce package
   ```

2. Install the generated `.vsix` file:
   ```bash
   code --install-extension letz-language-1.0.0.vsix
   ```

### Option 2: Development Install (Symlink)

Create a symlink in VS Code's extensions directory:

**macOS/Linux:**
```bash
ln -s "$(pwd)/vscode-letz" ~/.vscode/extensions/letz-language
```

**Windows (PowerShell as Admin):**
```powershell
cmd /c mklink /D "$env:USERPROFILE\.vscode\extensions\letz-language" "$(Get-Location)\vscode-letz"
```

Then restart VS Code or run **Developer: Reload Window**.

### Option 3: Copy to Extensions Folder

Copy the entire `vscode-letz` folder to:

- **macOS/Linux:** `~/.vscode/extensions/`
- **Windows:** `%USERPROFILE%\.vscode\extensions\`

Rename to `letz-language` and restart VS Code.

## Highlighting Preview

| Element | Color (typical theme) |
|---------|----------------------|
| `# comment` | Gray/Green (comment) |
| `@lesson` | Purple (keyword) |
| `A1.01` | Yellow/Blue (class name) |
| `"Title"` | Green/Orange (string) |
| `Luxembourgish` | Light blue (variable) |
| `=` | White/Red (operator) |
| `English` | Green (string) |

## Development

To test changes locally:

1. Open the `vscode-letz` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Open a `.letz` file in the new window

## License

MIT
