import type { CstNode, IToken } from "chevrotain";

import type { LessonMeta, WordEntry } from "../../exercise/letz-parser";

import { letzParser } from "./parser";

// Base visitor with default no-op methods for every grammar rule.
// Using WithDefaults avoids having to stub rules we don't care about (comment, statement).
const BaseCstVisitor = letzParser.getBaseCstVisitorConstructorWithDefaults();

type LessonCst = {
  statement?: StatementCst[];
};

type StatementCst = {
  children: {
    comment?: [{ children: Record<string, unknown> }];
    header?: [HeaderCst];
    entry?: [EntryCst];
  };
};

type HeaderCst = {
  children: {
    LessonId: [IToken];
    QuotedString: [IToken];
  };
};

type EntryCst = {
  children: {
    Text: [IToken, IToken];
  };
};

type VisitResult = {
  meta: LessonMeta | null;
  entries: WordEntry[];
};

class LetzVisitor extends BaseCstVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  lesson(ctx: LessonCst): VisitResult {
    return (ctx.statement ?? []).reduce<VisitResult>(
      (acc, stmt) => {
        const { header, entry } = stmt.children;
        if (header) return { ...acc, meta: this.header(header[0]) };
        if (entry) {
          const wordEntry = this.entry(entry[0]);
          return wordEntry ? { ...acc, entries: [...acc.entries, wordEntry] } : acc;
        }
        return acc;
      },
      { meta: null, entries: [] },
    );
  }

  header(ctx: HeaderCst): LessonMeta {
    const id = ctx.children.LessonId[0].image;
    // Strip surrounding quotes from "Title"
    const title = ctx.children.QuotedString[0].image.slice(1, -1);
    const level = extractLevel(id);
    return { id, title, level };
  }

  entry(ctx: EntryCst): WordEntry | null {
    const [luToken, enToken] = ctx.children.Text;
    if (!luToken || !enToken) return null;

    return {
      lu: luToken.image.trim(),
      en: enToken.image.trim(),
    };
  }

}

const extractLevel = (id: string): string => {
  const match = id.match(/^([A-Z]\d)/i);
  return match ? match[1].toUpperCase() : "A1";
};

export const letzVisitor = new LetzVisitor();

export const visitLesson = (cst: CstNode, fallbackId: string): { meta: LessonMeta; entries: WordEntry[] } => {
  const result = letzVisitor.visit(cst) as VisitResult;

  return {
    meta: result.meta ?? {
      id: fallbackId,
      title: "Untitled Lesson",
      level: extractLevel(fallbackId),
    },
    entries: result.entries,
  };
};
