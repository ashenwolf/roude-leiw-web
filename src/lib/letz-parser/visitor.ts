import type { CstNode, IToken } from "chevrotain";

import type { LessonMeta, SentenceEntry, WordEntry } from "../../exercise/letz-parser";

import { letzParser } from "./parser";

const BaseCstVisitor = letzParser.getBaseCstVisitorConstructorWithDefaults();

// --- CST node shapes ---

type LessonCst = {
  statement?: StatementCst[];
};

type StatementCst = {
  children: {
    comment?: [{ children: Record<string, unknown> }];
    header?: [HeaderCst];
    wordEntry?: [WordEntryCst];
    sentenceBlock?: [SentenceBlockCst];
  };
};

type HeaderCst = {
  children: {
    LessonId: [IToken];
    QuotedString: [IToken];
  };
};

type WordEntryCst = {
  children: {
    Text: [IToken, IToken];
  };
};

type SentenceBlockCst = {
  children: {
    sentenceTag?: SentenceTagCst[];
  };
};

type SentenceTagCst = {
  children: {
    luTag?: [TagCst];
    enTag?: [TagCst];
    questionTag?: [TagCst];
    distractorEnTag?: [TagCst];
    distractorLuTag?: [TagCst];
  };
};

type TagCst = {
  children: {
    Text: [IToken];
  };
};

// --- Visit result ---

type VisitResult = {
  meta: LessonMeta | null;
  entries: WordEntry[];
  sentences: SentenceEntry[];
};

// --- Visitor ---

class LetzVisitor extends BaseCstVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  lesson(ctx: LessonCst): VisitResult {
    return (ctx.statement ?? []).reduce<VisitResult>(
      (acc, stmt) => {
        const { header, wordEntry, sentenceBlock } = stmt.children;
        if (header) return { ...acc, meta: this.header(header[0]) };
        if (wordEntry) {
          const entry = this.wordEntry(wordEntry[0]);
          return entry ? { ...acc, entries: [...acc.entries, entry] } : acc;
        }
        if (sentenceBlock) {
          const sentence = this.sentenceBlock(sentenceBlock[0]);
          return sentence ? { ...acc, sentences: [...acc.sentences, sentence] } : acc;
        }
        return acc;
      },
      { meta: null, entries: [], sentences: [] },
    );
  }

  header(ctx: HeaderCst): LessonMeta {
    const id = ctx.children.LessonId[0].image;
    const title = ctx.children.QuotedString[0].image.slice(1, -1);
    const level = extractLevel(id);
    return { id, title, level };
  }

  wordEntry(ctx: WordEntryCst): WordEntry | null {
    const [luToken, enToken] = ctx.children.Text;
    if (!luToken || !enToken) return null;
    return { lu: luToken.image.trim(), en: enToken.image.trim() };
  }

  sentenceBlock(ctx: SentenceBlockCst): SentenceEntry | null {
    const tags = ctx.children.sentenceTag ?? [];

    const result = tags.reduce<SentenceEntry>(
      (acc, tag) => {
        const { luTag, enTag, questionTag, distractorEnTag, distractorLuTag } = tag.children;
        if (luTag)          return { ...acc, luVariants: [...acc.luVariants, this.tagText(luTag[0])] };
        if (enTag)          return { ...acc, enVariants: [...acc.enVariants, this.tagText(enTag[0])] };
        if (questionTag)    return { ...acc, question: this.tagText(questionTag[0]) };
        if (distractorEnTag) return { ...acc, distractorsEn: [...(acc.distractorsEn ?? []), this.tagText(distractorEnTag[0])] };
        if (distractorLuTag) return { ...acc, distractorsLu: [...(acc.distractorsLu ?? []), this.tagText(distractorLuTag[0])] };
        return acc;
      },
      { luVariants: [], enVariants: [] },
    );

    return result.luVariants.length > 0 && result.enVariants.length > 0 ? result : null;
  }

  tagText(ctx: TagCst): string {
    return ctx.children.Text[0].image.trim();
  }
}

const extractLevel = (id: string): string => {
  const match = id.match(/^([A-Z]\d)/i);
  return match ? match[1].toUpperCase() : "A1";
};

export const letzVisitor = new LetzVisitor();

export const visitLesson = (
  cst: CstNode,
  fallbackId: string,
): { meta: LessonMeta; entries: WordEntry[]; sentences: SentenceEntry[] } => {
  const result = letzVisitor.visit(cst) as VisitResult;

  return {
    meta: result.meta ?? {
      id: fallbackId,
      title: "Untitled Lesson",
      level: extractLevel(fallbackId),
    },
    entries: result.entries,
    sentences: result.sentences,
  };
};
