# Letz Language Support for Zed

Syntax highlighting for `.letz` Luxembourgish lesson files — the Zed port of
`vscode-letz/`. Same scopes: directives are keywords, the lesson id a type, quoted
titles and English text strings, Luxembourgish text a variable, `[blanks]` constants.

Unlike the VS Code version (TextMate regexes), Zed requires a Tree-sitter grammar;
it lives in `grammar/` and mirrors the Chevrotain lexer in `src/lib/letz-parser/`.

## Layout

```
zed-letz/
  extension.toml          # extension + grammar registration (pinned to a commit)
  grammar/                # tree-sitter-letz: grammar.js + generated src/parser.c
  languages/letz/
    config.toml           # file type, comment prefix, autoclosing
    highlights.scm        # tree-sitter highlight queries
```

## Install (dev extension)

1. In Zed: `cmd-shift-p` → **zed: install dev extension** → select this
   `zed-letz/` directory.
2. Open any `.letz` file. First install compiles the grammar to WASM
   (Zed downloads wasi-sdk automatically; needs a Rust toolchain via rustup).

## Updating the grammar

Zed builds the grammar from the **committed revision** in `extension.toml`, not the
working tree. After changing `grammar/grammar.js`:

```bash
cd zed-letz/grammar
npx -y tree-sitter-cli@0.25.8 generate     # regenerate src/parser.c
git add -A . && git commit -m "..."         # commit grammar first
git rev-parse HEAD                          # then pin that SHA…
# …as `rev` under [grammars.letz] in extension.toml, commit that too,
# then in Zed: `zed: reload extensions` (or reinstall the dev extension).
```

`repository` is a `file://` URL to this clone, so the pinned commit need not be
pushed — but the extension only installs on this machine. To make it portable,
point `repository` at `https://github.com/ashenwolf/roude-leiw-web` and push.

## Verify

```bash
cd zed-letz/grammar
find ../../public/assets -name '*.letz' \
  -exec npx -y tree-sitter-cli@0.25.8 parse -q {} +   # -q: only report errors
```

All 60 content files parse with zero `ERROR`/`MISSING` nodes as of this commit.
