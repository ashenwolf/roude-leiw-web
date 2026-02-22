import type { Lesson } from "../../exercise/letz-parser";

import { letzLexer } from "./lexer";
import { letzParser } from "./parser";
import { visitLesson } from "./visitor";

/**
 * Parse raw .letz file content into a structured Lesson.
 * Throws if lexing or parsing encounters unrecoverable errors.
 */
export const parseLetz = (content: string, fallbackId = "unknown"): Lesson => {
  const lexResult = letzLexer.tokenize(content);

  if (lexResult.errors.length > 0) {
    const msg = lexResult.errors.map((e) => e.message).join("; ");
    throw new Error(`Letz lex error in "${fallbackId}": ${msg}`);
  }

  letzParser.input = lexResult.tokens;
  const cst = letzParser.lesson();

  if (letzParser.errors.length > 0) {
    const msg = letzParser.errors.map((e) => e.message).join("; ");
    throw new Error(`Letz parse error in "${fallbackId}": ${msg}`);
  }

  return visitLesson(cst, fallbackId);
};
