; Highlights for .letz — mirrors the VS Code TextMate scopes:
; directives = keyword, lesson id = type, quoted title = string,
; Luxembourgish side = variable, English side = string, = is an operator,
; [blanks] in @fill lines stand out as constants.

(comment) @comment

[
  "@lesson"
  "@word"
  "@sentence"
  "@fill"
  "@question"
  "@image"
  "@image-alt"
  "@lu"
  "@en"
  "@distractor-lu"
  "@distractor-en"
] @keyword

(lesson_id) @type
(quoted_string) @string
(luxembourgish) @variable
(english) @string
(blank) @constant
"=" @operator
