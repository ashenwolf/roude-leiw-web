; Highlights for .letz — mirrors the VS Code TextMate scopes:
; directives = keyword, lesson id = type, quoted title = string,
; Luxembourgish side = variable, English side = string, = is an operator,
; [blanks] in @fill lines stand out as constants.

(comment) @comment

[
  "@lesson"
  "@word"
  "@question"
  "@image"
  "@image-alt"
  "@lu"
  "@en"
  "@distractor-lu"
  "@distractor-en"
] @keyword

; @sentence / @fill are whole rules whose body is a single literal, so
; tree-sitter exposes only the named node — the literal is not a node type.
[
  (sentence_marker)
  (fill_marker)
] @keyword

(lesson_id) @type
(quoted_string) @string
(luxembourgish) @variable
(english) @string
(blank) @constant
"=" @operator
