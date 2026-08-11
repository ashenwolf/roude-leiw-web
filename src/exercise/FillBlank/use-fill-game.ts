import { useState } from "react";

import {
  applyBlankClear,
  applyBlankTap,
  applySubmit,
  applyTokenTap,
  initFillGame,
} from "./fill-logic";

import type { FillBlankItem } from "../types";
import type { FillGameState } from "./types";

export const useFillGame = (item: FillBlankItem) => {
  const [state, setState] = useState<FillGameState>(() => initFillGame(item));

  const tapToken = (tokenIdx: number) => setState((s) => applyTokenTap(s, tokenIdx));
  const tapBlank = (blankIdx: number) => setState((s) => applyBlankTap(s, blankIdx));
  const clearBlank = (blankIdx: number) => setState((s) => applyBlankClear(s, blankIdx));
  const submit = () => setState((s) => applySubmit(s, item));

  return { state, tapToken, tapBlank, clearBlank, submit };
};
