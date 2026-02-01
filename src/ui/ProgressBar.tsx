type ProgressBarProps = {
  /** Current progress within the current batch (0-1) */
  batchProgress: number;
  /** Current batch index (0-based) */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
};

export const ProgressBar = ({
  batchProgress,
  currentBatch,
  totalBatches,
}: ProgressBarProps) => {
  return (
    <div className="w-full">
      <div className="flex gap-1 h-3">
        {Array.from({ length: totalBatches }, (_, batchIndex) => {
          // Determine fill percentage for this segment
          const fillPercentage =
            batchIndex < currentBatch
              ? 100 // Completed batches are fully filled
              : batchIndex === currentBatch
                ? batchProgress * 100 // Current batch shows actual progress
                : 0; // Future batches are empty

          const isCompleted = batchIndex < currentBatch;
          const isCurrent = batchIndex === currentBatch;

          return (
            <div
              key={batchIndex}
              className={[
                "flex-1 rounded-full overflow-hidden",
                "bg-gray-200",
                isCurrent ? "ring-2 ring-lime-400 ring-offset-1" : "",
              ].join(" ")}
            >
              <div
                className={[
                  "h-full rounded-full transition-all duration-300 ease-out",
                  isCompleted ? "bg-green-500" : "bg-lime-400",
                ].join(" ")}
                style={{ width: `${fillPercentage}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Batch labels */}
      <div className="flex justify-between mt-1 px-1">
        <span className="text-xs text-gray-500">
          Batch {currentBatch + 1} of {totalBatches}
        </span>
        <span className="text-xs text-gray-500">
          {Math.round(batchProgress * 100)}%
        </span>
      </div>
    </div>
  );
};
