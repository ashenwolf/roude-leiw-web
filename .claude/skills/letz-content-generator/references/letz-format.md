# .letz File Format Reference

The `.letz` format is a custom DSL for the Roude Léiw Luxembourgish learning app. It defines vocabulary and sentence exercises for Duolingo-style Word Match games.

## File structure

```
# {path}/{filename}.letz          ← comment line (optional)

@lesson {LEVEL.NUMBER} "{Title}"  ← exactly one per file

@word {luxembourgish} = {english} ← zero or more
...

@sentence                         ← zero or more sentence blocks
@lu {luxembourgish sentence}
@en {english translation}
@en {alternate english translation}  ← optional, for acceptable variants
@distractor-en {english word}     ← 3-5 distractors total
@distractor-lu {luxembourgish word}
...
```

## Directives

### `@lesson`
```
@lesson A1.01 "Greetings & Introductions"
```
- Level code: `A1`, `A2`, `B1`, etc.
- Number: two-digit, zero-padded
- Title: in double quotes, English, title case

### `@word`
```
@word Moien = Hi
@word de Gaart = the garden
@word schaffen = to work
```
- Left side: Luxembourgish word/phrase with article if noun
- `=` separator
- Right side: English translation
- One entry per line
- No trailing punctuation unless it's part of the word itself

### `@sentence`
```
@sentence
@lu Ech kommen aus Frankräich.
@en I come from France.
@distractor-en Germany
@distractor-en live
@distractor-lu Däitschland
@distractor-lu wunnen
```
- `@sentence` on its own line opens a new sentence block
- `@lu` — the Luxembourgish sentence (exactly one required)
- `@en` — English translation (at least one required, multiple allowed for variants)
- `@distractor-en` — an English word that does NOT belong in the correct translation
- `@distractor-lu` — a Luxembourgish word that does NOT belong in the correct sentence
- 3–5 distractor lines total per sentence block
- Sentence blocks are separated by blank lines

## Formatting rules

- UTF-8 encoding
- Luxembourgish special characters must be preserved: ë, é, è, ä, ü, ö
- No smart quotes — use straight double quotes for the lesson title
- Blank line between the `@lesson` line and the first `@word`
- Blank line between the last `@word` and the first `@sentence`
- Blank line between each `@sentence` block
- Comment lines start with `#` and are ignored by the parser
- No inline comments

## What goes in @word vs @sentence

| Input | Classification | Reason |
|---|---|---|
| `Moien` = `Hi` | @word | Single word |
| `Gudde Moien` = `Good morning` | @word | Fixed 2-word greeting |
| `de Gaart` = `the garden` | @word | Noun with article |
| `schaffen` = `to work` | @word | Bare infinitive |
| `Gudden Owend` = `Good evening` | @word | Fixed greeting |
| `Ech sinn d'Anne.` | @sentence | Subject + verb + complement |
| `Wéi heeschs du?` | @sentence | Question with conjugated verb |
| `Mir geet et gutt.` | @sentence | >3 words, conjugated verb |
| `Ech kommen aus Frankräich.` | @sentence | Full clause |

## Noun entry conventions

Always use the **definite article** form for noun entries:
- Masculine: `de` / `den` (before UNITED ZOAH consonants)
- Feminine: `d'` (before consonant) or `d'` (before vowel)  
- Neutral: `d'`
- Plural: `d'`

Split singular and plural into separate `@word` entries.

Examples:
```
@word de Gaart = the garden
@word d'Gäert = the gardens
@word d'Mamm = the mother
@word d'Mammen = the mothers
@word d'Kand = the child
@word d'Kanner = the children
```
