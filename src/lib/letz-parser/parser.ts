import { CstParser } from "chevrotain";

import { allTokens, AtLesson, Comment, Equals, LessonId, NewLine, QuotedString, Text } from "./lexer";

/**
 * LL(1) grammar for .letz lesson files.
 *
 * lesson     ::= statement* EOF
 * statement  ::= comment | header | entry | NewLine
 * comment    ::= Comment NewLine
 * header     ::= AtLesson LessonId QuotedString NewLine
 * entry      ::= Text Equals Text NewLine
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
      { ALT: () => this.SUBRULE(this.entry) },
      // blank lines
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

  entry = this.RULE("entry", () => {
    this.CONSUME(Text);
    this.CONSUME(Equals);
    this.CONSUME2(Text);
    this.OPTION(() => this.CONSUME(NewLine));
  });
}

export const letzParser = new LetzParser();
