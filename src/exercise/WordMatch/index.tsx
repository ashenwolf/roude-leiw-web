import { FadingPill } from "../../ui/FadingPill";

import { useGame } from "./use-game";

import type { ColumnSide, WordPair, WordResultMap } from "./types";
import type { PillStatus } from "../../ui/Pill";

export type { WordPair, WordResultMap } from "./types";

type WordMatchProps = {
  pairs: WordPair[];
  onComplete?: (wordResults: WordResultMap) => void;
  onMatch?: (matchedCount: number, totalPairs: number) => void;
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => i + from);

type WordColumnProps = {
  side: ColumnSide;
  displayCount: number;
  getSlotStatus: (side: ColumnSide, position: number) => PillStatus;
  getSlotWord: (side: ColumnSide, position: number) => string;
  isSlotFading: (side: ColumnSide, position: number) => boolean;
  isSlotEmpty: (side: ColumnSide, position: number) => boolean;
  onSelect: (side: ColumnSide, position: number) => void;
  onFadeComplete: (side: ColumnSide, position: number) => void;
};

const WordColumn = ({
  side,
  displayCount,
  getSlotStatus,
  getSlotWord,
  isSlotFading,
  isSlotEmpty,
  onSelect,
  onFadeComplete,
}: WordColumnProps) => (
  <div className="flex flex-col gap-2.5 flex-1">
    {range(0, displayCount).map((position) => {
      const empty = isSlotEmpty(side, position);

      // Render invisible placeholder for empty slots to maintain layout.
      // Must match FadingPill's rendered height, or rows misalign as pairs clear.
      if (empty) {
        return <div key={`${side}-${position}`} className="h-18" />;
      }

      return (
        <FadingPill
          key={`${side}-${position}`}
          status={getSlotStatus(side, position)}
          hidden={isSlotFading(side, position)}
          onClick={() => onSelect(side, position)}
          onFadeComplete={() => onFadeComplete(side, position)}
        >
          {getSlotWord(side, position)}
        </FadingPill>
      );
    })}
  </div>
);

export const WordMatch = ({ pairs, onComplete, onMatch }: WordMatchProps) => {
  const {
    displayCount,
    getSlotStatus,
    getSlotWord,
    isSlotFading,
    isSlotEmpty,
    handleSelection,
    handleFadeComplete,
  } = useGame({ pairs, onComplete, onMatch });

  return (
    // Tight gaps: a picture-description Session renders a full-bleed 16:9 photo
    // above this, and five pill rows per column still have to fit unscrolled.
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-xl font-bold">Tap the matching pairs</h2>

      <div className="flex gap-4 w-full">
        <WordColumn
          side="left"
          displayCount={displayCount}
          getSlotStatus={getSlotStatus}
          getSlotWord={getSlotWord}
          isSlotFading={isSlotFading}
          isSlotEmpty={isSlotEmpty}
          onSelect={handleSelection}
          onFadeComplete={handleFadeComplete}
        />
        <WordColumn
          side="right"
          displayCount={displayCount}
          getSlotStatus={getSlotStatus}
          getSlotWord={getSlotWord}
          isSlotFading={isSlotFading}
          isSlotEmpty={isSlotEmpty}
          onSelect={handleSelection}
          onFadeComplete={handleFadeComplete}
        />
      </div>
    </div>
  );
};
