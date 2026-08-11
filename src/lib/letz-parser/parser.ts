import { CstParser } from "chevrotain";

import {
  allTokens,
  AtDistractorEn, AtDistractorLu, AtEn, AtFill, AtImage, AtImageAlt, AtLesson, AtLu, AtQuestion,
  AtSentence, AtWord,
  Comment, Equals, LessonId, NewLine, QuotedString, Text,
} from "./lexer";

/**
 * LL(1) grammar for .letz lesson files.
 *
 * lesson          ::= statement* EOF
 * statement       ::= comment | header | imageTag | imageAltTag
 *                   | wordEntry | sentenceBlock | fillBlock | NewLine
 * comment         ::= Comment NewLine?
 * header          ::= AtLesson LessonId QuotedString NewLine?
 * imageTag        ::= AtImage QuotedString NewLine?
 * imageAltTag     ::= AtImageAlt QuotedString NewLine?
 * wordEntry       ::= AtWord Text Equals Text NewLine?
 * sentenceBlock   ::= AtSentence NewLine? sentenceTag*
 * fillBlock       ::= AtFill NewLine? sentenceTag*
 * sentenceTag     ::= luTag | enTag | questionTag | distractorEnTag | distractorLuTag | NewLine
 * luTag           ::= AtLu Text NewLine?
 * enTag           ::= AtEn Text NewLine?
 * questionTag     ::= AtQuestion Text NewLine?
 * distractorEnTag ::= AtDistractorEn Text NewLine?
 * distractorLuTag ::= AtDistractorLu Text NewLine?
 *
 * First-token sets per alternative are all distinct — no lookahead needed.
 *
 * `@image`/`@image-alt` values are QuotedString, not Text: a bare `=` inside an
 * unquoted Text run terminates it (Text excludes `=`), so an unquoted path with a
 * query string would fail to parse. Quoting makes any path or URL safe.
 *
 * `fillBlock` deliberately reuses `sentenceTag`: a @fill carries the same
 * @lu/@en/@distractor-* tags, and the extra rules a fill must satisfy (exactly
 * one @lu and one @en, 1–4 balanced [blanks], ≥2 distractors per direction) are
 * enforced by tests rather than by the grammar. Keeping the grammar permissive
 * means a content slip yields a test failure with a readable message instead of
 * an opaque parse error.
 */
export class LetzParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: true });
    this.performSelfAnalysis();
  }

  lesson = this.RULE("lesson", () => {
    this.MANY(() => this.SUBRULE(this.statement));
  });

  statement = this.RULE("statement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.comment) },
      { ALT: () => this.SUBRULE(this.header) },
      { ALT: () => this.SUBRULE(this.imageTag) },
      { ALT: () => this.SUBRULE(this.imageAltTag) },
      { ALT: () => this.SUBRULE(this.wordEntry) },
      { ALT: () => this.SUBRULE(this.sentenceBlock) },
      { ALT: () => this.SUBRULE(this.fillBlock) },
      { ALT: () => this.CONSUME(NewLine) },
    ]);
  });

  comment = this.RULE("comment", () => {
    this.CONSUME(Comment);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  header = this.RULE("header", () => {
    this.CONSUME(AtLesson);
    this.CONSUME(LessonId);
    this.CONSUME(QuotedString);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  imageTag = this.RULE("imageTag", () => {
    this.CONSUME(AtImage);
    this.CONSUME(QuotedString);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  imageAltTag = this.RULE("imageAltTag", () => {
    this.CONSUME(AtImageAlt);
    this.CONSUME(QuotedString);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  wordEntry = this.RULE("wordEntry", () => {
    this.CONSUME(AtWord);
    this.CONSUME(Text);
    this.CONSUME(Equals);
    this.CONSUME2(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  sentenceBlock = this.RULE("sentenceBlock", () => {
    this.CONSUME(AtSentence);
    this.OPTION(() => this.CONSUME(NewLine));
    this.MANY(() => this.SUBRULE(this.sentenceTag));
  });

  fillBlock = this.RULE("fillBlock", () => {
    this.CONSUME(AtFill);
    this.OPTION(() => this.CONSUME(NewLine));
    this.MANY(() => this.SUBRULE(this.sentenceTag));
  });

  sentenceTag = this.RULE("sentenceTag", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.luTag) },
      { ALT: () => this.SUBRULE(this.enTag) },
      { ALT: () => this.SUBRULE(this.questionTag) },
      { ALT: () => this.SUBRULE(this.distractorEnTag) },
      { ALT: () => this.SUBRULE(this.distractorLuTag) },
      { ALT: () => this.CONSUME(NewLine) },
    ]);
  });

  luTag = this.RULE("luTag", () => {
    this.CONSUME(AtLu);
    this.CONSUME(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  enTag = this.RULE("enTag", () => {
    this.CONSUME(AtEn);
    this.CONSUME(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  questionTag = this.RULE("questionTag", () => {
    this.CONSUME(AtQuestion);
    this.CONSUME(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  distractorEnTag = this.RULE("distractorEnTag", () => {
    this.CONSUME(AtDistractorEn);
    this.CONSUME(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });

  distractorLuTag = this.RULE("distractorLuTag", () => {
    this.CONSUME(AtDistractorLu);
    this.CONSUME(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });
}

export const letzParser = new LetzParser();
