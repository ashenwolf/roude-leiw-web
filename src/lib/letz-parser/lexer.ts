import { createToken, Lexer } from "chevrotain";

// Whitespace (spaces/tabs) — skipped, not emitted
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});

// Newlines — significant for line-based grammar
export const NewLine = createToken({
  name: "NewLine",
  pattern: /\r?\n/,
});

// Comment: # until end of line (the newline itself is NOT consumed)
export const Comment = createToken({
  name: "Comment",
  pattern: /#[^\r\n]*/,
});

// Directive keyword: @lesson
export const AtLesson = createToken({
  name: "AtLesson",
  pattern: /@lesson/,
});

// Lesson ID, e.g. A1.01
export const LessonId = createToken({
  name: "LessonId",
  pattern: /[A-Za-z]\d+\.\d+/,
});

// Quoted string: "anything except newline"
export const QuotedString = createToken({
  name: "QuotedString",
  pattern: /"[^"\r\n]+"/,
});

// Equals separator between LU and EN
export const Equals = createToken({
  name: "Equals",
  pattern: /=/,
});

// Free text: anything that isn't =, newline, #, or @
// Used for both LU side and EN side of a word pair
export const Text = createToken({
  name: "Text",
  pattern: /[^=\r\n#@]+/,
});

// Token order matters — more specific patterns must come first
export const allTokens = [
  WhiteSpace,
  NewLine,
  Comment,
  AtLesson,
  LessonId,
  QuotedString,
  Equals,
  Text,
];

export const letzLexer = new Lexer(allTokens, {
  // Surface lex errors instead of silently skipping
  recoveryEnabled: false,
});
