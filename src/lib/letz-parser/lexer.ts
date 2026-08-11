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

// Directive keywords — all @-prefixed; Text excludes @ so no conflicts
export const AtLesson      = createToken({ name: "AtLesson",      pattern: /@lesson/ });
export const AtSentence    = createToken({ name: "AtSentence",    pattern: /@sentence/ });
export const AtImageAlt    = createToken({ name: "AtImageAlt",    pattern: /@image-alt/ });
export const AtImage       = createToken({ name: "AtImage",       pattern: /@image/ });
export const AtFill        = createToken({ name: "AtFill",        pattern: /@fill/ });
export const AtDistractorEn = createToken({ name: "AtDistractorEn", pattern: /@distractor-en/ });
export const AtDistractorLu = createToken({ name: "AtDistractorLu", pattern: /@distractor-lu/ });
export const AtQuestion    = createToken({ name: "AtQuestion",    pattern: /@question/ });
export const AtWord        = createToken({ name: "AtWord",        pattern: /@word/ });
export const AtLu          = createToken({ name: "AtLu",          pattern: /@lu/ });
export const AtEn          = createToken({ name: "AtEn",          pattern: /@en/ });

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

// Equals separator between LU and EN sides of a word pair
export const Equals = createToken({
  name: "Equals",
  pattern: /=/,
});

// Free text: anything that isn't =, newline, #, or @
export const Text = createToken({
  name: "Text",
  pattern: /[^=\r\n#@]+/,
});

// Token order matters — longer @-prefixed patterns before shorter ones;
// all @ keywords before Text (Text excludes @ so they never truly conflict,
// but ordering ensures maximal-munch picks the right keyword first)
export const allTokens = [
  WhiteSpace,
  NewLine,
  Comment,
  AtLesson,
  AtSentence,
  AtImageAlt,       // before AtImage — longer pattern
  AtImage,
  AtFill,
  AtDistractorEn,   // before AtEn — longer pattern
  AtDistractorLu,   // before AtLu — longer pattern
  AtQuestion,
  AtWord,
  AtLu,
  AtEn,
  LessonId,
  QuotedString,
  Equals,
  Text,
];

export const letzLexer = new Lexer(allTokens, {
  // Surface lex errors instead of silently skipping
  recoveryEnabled: false,
});
