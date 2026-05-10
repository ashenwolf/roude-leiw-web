import { useState } from "react";

import { applyAssembledTap, applySubmit, applyTokenTap, initSentenceGame } from "./sentence-logic";

import type { SentenceBuilderItem } from "../types";
import type { SentenceGameState } from "./types";

export const useSentenceGame = (item: SentenceBuilderItem) => {
  const [state, setState] = useState<SentenceGameState>(initSentenceGame);

  const tapToken = (tokenIdx: number) => setState((s) => applyTokenTap(s, tokenIdx));
  const tapAssembled = (assembledPos: number) => setState((s) => applyAssembledTap(s, assembledPos));
  const submit = () => setState((s) => applySubmit(s, item));

  return { state, tapToken, tapAssembled, submit };
};
