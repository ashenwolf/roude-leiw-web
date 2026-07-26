import { CstParser } from "chevrotain";

import {
  allTokens,
  AtDistractorEn, AtDistractorLu, AtEn, AtLesson, AtLu, AtQuestion, AtSentence, AtWord,
  Comment, Equals, LessonId, NewLine, QuotedString, Text,
} from "./lexer";

/**
 * LL(1) grammar for .letz lesson files.
 *
 * lesson          ::= statement* EOF
 * statement       ::= comment | header | wordEntry | sentenceBlock | NewLine
 * comment         ::= Comment NewLine?
 * header          ::= AtLesson LessonId QuotedString NewLine?
 * wordEntry       ::= AtWord Text Equals Text NewLine?
 * sentenceBlock   ::= AtSentence NewLine? sentenceTag*
 * sentenceTag     ::= luTag | enTag | questionTag | distractorEnTag | distractorLuTag | NewLine
 * luTag           ::= AtLu Text NewLine?
 * enTag           ::= AtEn Text NewLine?
 * questionTag     ::= AtQuestion Text NewLine?
 * distractorEnTag ::= AtDistractorEn Text NewLine?
 * distractorLuTag ::= AtDistractorLu Text NewLine?
 *
 * First-token sets per alternative are all distinct — no lookahead needed.
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
      { ALT: () => this.SUBRULE(this.wordEntry) },
      { ALT: () => this.SUBRULE(this.sentenceBlock) },
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
