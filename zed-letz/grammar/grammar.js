/**
 * Tree-sitter grammar for .letz — the Roude Léiw lesson DSL.
 *
 * Mirrors the Chevrotain lexer in src/lib/letz-parser/lexer.ts: same token
 * shapes (LessonId, QuotedString, Text excluding = # @ and newlines), same
 * directive set. Line-oriented and flat on purpose — highlighting needs no
 * block nesting, and a flat grammar recovers per line on malformed input.
 */

const TEXT = /[^=\r\n#@\[\]]+/;

module.exports = grammar({
  name: "letz",

  // Whitespace (including newlines) between tokens. Lines stay separable
  // because every directive line starts with an @-keyword or #.
  extras: (_) => [/\s/],

  rules: {
    source_file: ($) =>
      repeat(
        choice(
          $.comment,
          $.lesson_declaration,
          $.image_declaration,
          $.image_alt_declaration,
          $.word_entry,
          $.sentence_marker,
          $.fill_marker,
          $.question_line,
          $.lu_line,
          $.en_line,
          $.distractor_lu_line,
          $.distractor_en_line,
        ),
      ),

    comment: (_) => token(/#[^\r\n]*/),

    lesson_declaration: ($) => seq("@lesson", $.lesson_id, $.quoted_string),
    image_declaration: ($) => seq("@image", $.quoted_string),
    image_alt_declaration: ($) => seq("@image-alt", $.quoted_string),

    word_entry: ($) =>
      seq(
        "@word",
        alias($._text, $.luxembourgish),
        "=",
        alias($._text, $.english),
      ),

    sentence_marker: (_) => "@sentence",
    fill_marker: (_) => "@fill",

    question_line: ($) => seq("@question", $._lu_content),
    lu_line: ($) => seq("@lu", $._lu_content),
    en_line: ($) => seq("@en", $._en_content),
    distractor_lu_line: ($) =>
      seq("@distractor-lu", alias($._text, $.luxembourgish)),
    distractor_en_line: ($) =>
      seq("@distractor-en", alias($._text, $.english)),

    // @fill blanks: [bracketed] spans highlighted distinctly inside @lu/@en.
    _lu_content: ($) =>
      repeat1(choice(alias($._text, $.luxembourgish), $.blank)),
    _en_content: ($) => repeat1(choice(alias($._text, $.english), $.blank)),

    lesson_id: (_) => /[A-Za-z]\d+\.\d+/,
    quoted_string: (_) => /"[^"\r\n]+"/,
    blank: (_) => /\[[^\[\]\r\n]+\]/,
    _text: (_) => TEXT,
  },
});
