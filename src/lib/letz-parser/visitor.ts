import type { CstNode, IToken } from "chevrotain";

import type { FillEntry, LessonMeta, SentenceEntry, WordEntry } from "../../exercise/letz-parser";

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
    imageTag?: [QuotedTagCst];
    imageAltTag?: [QuotedTagCst];
    wordEntry?: [WordEntryCst];
    sentenceBlock?: [SentenceBlockCst];
    fillBlock?: [SentenceBlockCst];
  };
};

type HeaderCst = {
  children: {
    LessonId: [IToken];
    QuotedString: [IToken];
  };
};

type QuotedTagCst = {
  children: {
    QuotedString: [IToken];
  };
};

type WordEntryCst = {
  children: {
    Text: [IToken, IToken];
  };
};

// @fill reuses the sentenceTag subrule, so its CST node has the same shape.
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
  fills: FillEntry[];
  image: string | null;
  imageAlt: string | null;
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
        const { header, imageTag, imageAltTag, wordEntry, sentenceBlock, fillBlock } = stmt.children;
        if (header) return { ...acc, meta: this.header(header[0]) };
        if (imageTag) return { ...acc, image: this.quotedText(imageTag[0]) };
        if (imageAltTag) return { ...acc, imageAlt: this.quotedText(imageAltTag[0]) };
        if (wordEntry) {
          const entry = this.wordEntry(wordEntry[0]);
          return entry ? { ...acc, entries: [...acc.entries, entry] } : acc;
        }
        if (sentenceBlock) {
          const sentence = this.sentenceBlock(sentenceBlock[0]);
          return sentence ? { ...acc, sentences: [...acc.sentences, sentence] } : acc;
        }
        if (fillBlock) {
          const fill = this.fillBlock(fillBlock[0]);
          return fill ? { ...acc, fills: [...acc.fills, fill] } : acc;
        }
        return acc;
      },
      { meta: null, entries: [], sentences: [], fills: [], image: null, imageAlt: null },
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

  /**
   * A @fill block. Shares the sentenceTag subrule with @sentence, so the CST is
   * identical; the difference is the collapse to ONE lu/en form rather than a
   * variant list. Extra @lu/@en lines are dropped here (first wins) — the grammar
   * permits them but multiple accepted variants defeat the mechanic's
   * exactly-one-correct-form requirement, so a test rejects them at the content
   * level rather than this silently picking one at runtime.
   */
  fillBlock(ctx: SentenceBlockCst): FillEntry | null {
    const tags = ctx.children.sentenceTag ?? [];

    const collected = tags.reduce<{
      lu: string[];
      en: string[];
      distractorsEn: string[];
      distractorsLu: string[];
    }>(
      (acc, tag) => {
        const { luTag, enTag, distractorEnTag, distractorLuTag } = tag.children;
        if (luTag) return { ...acc, lu: [...acc.lu, this.tagText(luTag[0])] };
        if (enTag) return { ...acc, en: [...acc.en, this.tagText(enTag[0])] };
        if (distractorEnTag) return { ...acc, distractorsEn: [...acc.distractorsEn, this.tagText(distractorEnTag[0])] };
        if (distractorLuTag) return { ...acc, distractorsLu: [...acc.distractorsLu, this.tagText(distractorLuTag[0])] };
        return acc;
      },
      { lu: [], en: [], distractorsEn: [], distractorsLu: [] },
    );

    if (collected.lu.length === 0 || collected.en.length === 0) return null;

    return {
      lu: collected.lu[0],
      en: collected.en[0],
      ...(collected.distractorsEn.length > 0 ? { distractorsEn: collected.distractorsEn } : {}),
      ...(collected.distractorsLu.length > 0 ? { distractorsLu: collected.distractorsLu } : {}),
    };
  }

  tagText(ctx: TagCst): string {
    return ctx.children.Text[0].image.trim();
  }

  /** Unwraps a QuotedString token's surrounding double quotes. */
  quotedText(ctx: QuotedTagCst): string {
    return ctx.children.QuotedString[0].image.slice(1, -1).trim();
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
): { meta: LessonMeta; entries: WordEntry[]; sentences: SentenceEntry[]; fills: FillEntry[] } => {
  const result = letzVisitor.visit(cst) as VisitResult;

  // @image / @image-alt are lesson-level and order-independent — they fold onto
  // meta here rather than in `header`, so they may sit anywhere in the file.
  // Omitted (rather than undefined-valued) when absent, so `parseLetz` output
  // stays deep-equal to the pre-@image shape in existing tests.
  return {
    meta: {
      ...(result.meta ?? {
        id: fallbackId,
        title: "Untitled Lesson",
        level: extractLevel(fallbackId),
      }),
      ...(result.image ? { image: result.image } : {}),
      ...(result.imageAlt ? { imageAlt: result.imageAlt } : {}),
    },
    entries: result.entries,
    sentences: result.sentences,
    // A file with no @fill blocks yields [] — the visitor's reduce seeds it, but
    // guard anyway since `visit` returns undefined fields for an empty CST.
    fills: result.fills ?? [],
  };
};
