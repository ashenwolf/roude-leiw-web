import { useState } from "react";
import { Pill } from "../ui";
import type { PillStatus } from "../ui/Pill";

const WordPairs = [
  ["Hello", "Moien"],
  ["Goodbye", "Äddi"],
  ["Thank you", "Merci"],
  ["Yes", "Jo"],
  ["No", "Nee"],
];

const shuffled = (unshuffled: number[]) =>
  unshuffled
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => i + from);

const flip = (order: number) => (order + 1) % 2;

export const WordMatch = () => {
  const [selectedPair, setSelectedPair] = useState<
    [number | null, number | null]
  >([null, null]);
  const [successPairs, setSuccessPairs] = useState(
    range(0, WordPairs.length).map(() => false)
  );
  const [failPairs, setFailPairs] = useState<[number, number][]>([]);

  const [orderLeft] = useState(shuffled(range(0, WordPairs.length)));
  const [orderRight] = useState(shuffled(range(0, WordPairs.length)));

  const handleSelection = (order: number, index: number) => {
    setSelectedPair((pair) => {
      const newPair: [number | null, number | null] = [
        order === 0 ? (pair[0] !== index ? index : null) : pair[0],
        order === 1 ? (pair[1] !== index ? index : null) : pair[1],
      ];

      // Check if both are selected after this update
      const indexLeft = newPair[0];
      const indexRight = newPair[1];

      if (indexLeft !== null && indexRight !== null) {
        // Process match immediately without useEffect
        // Use requestAnimationFrame to ensure state update completes first
        requestAnimationFrame(() => {
          if (indexLeft === indexRight) {
            setSuccessPairs((pairs) => {
              const newPairs = [...pairs];
              newPairs[indexLeft] = true;
              return newPairs;
            });
          } else {
            setFailPairs((pairs) => [...pairs, [indexLeft, indexRight]]);

            setTimeout(() => {
              setFailPairs((pairs) =>
                pairs.filter(([l, r]) => l !== indexLeft || r !== indexRight)
              );
            }, 1000);
          }
        });
        // Reset selection immediately
        return [null, null];
      }

      return newPair;
    });
  };

  const wordStatus = (order: number, index: number): PillStatus => {
    if (selectedPair[order] == index && selectedPair[flip(order)] == null) {
      return "selected";
    }

    if (successPairs[index]) return "success";

    if (failPairs.some((pair) => pair[order] === index)) return "fail";

    return "blanc"
  };

  if (!orderLeft || !orderRight) return null;

  return (
    <div className="flex flex-col items-center gap-8">
      <h2 className="text-2xl font-bold">Tap the matching pairs</h2>

      <div className="flex gap-8 w-full">
        {/* Left column */}
        <div className="flex flex-col gap-4 flex-1">
          {orderLeft.map((index) => (
            <Pill
              key={`left-${index}`}
              status={wordStatus(0, index)}
              hidden={successPairs[index]}
              onClick={() => handleSelection(0, index)}
            >
              {WordPairs[index][0]}
            </Pill>
          ))}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4 flex-1">
          {orderRight.map((index) => (
            <Pill
              key={`right-${index}`}
              status={wordStatus(1, index)}
              hidden={successPairs[index]}
              onClick={() => handleSelection(1, index)}
            >
              {WordPairs[index][1]}
            </Pill>
          ))}
        </div>
      </div>
    </div>
  );
};
