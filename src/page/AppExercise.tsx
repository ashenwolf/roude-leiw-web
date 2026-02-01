import { useState } from "react";

import { useNavigation } from "../context/useNavigation";
import { WordMatch } from "../exercise/WordMatch";
import { Button } from "../ui/Button";

import type { WordPair } from "../exercise/WordMatch";

// Word pairs for the exercise - can be extended with more pairs
const WordPairs: WordPair[] = [
  ["Hello", "Moien"],
  ["Goodbye", "Äddi"],
  ["Thank you", "Merci"],
  ["Yes", "Jo"],
  ["No", "Nee"],
  ["Please", "Wann ech gelift"],
  ["Good morning", "Gudde Moien"],
  ["Good evening", "Gudden Owend"],
  ["How are you?", "Wéi geet et?"],
  ["I'm fine", "Mir geet et gutt"],
];

export const AppExercise = () => {
  const { navigateTo } = useNavigation();
  const [isComplete, setIsComplete] = useState(false);

  const handleComplete = () => {
    setIsComplete(true);
    // Future: Record progress, update stats, etc.
  };

  return (
    <div>
      <div className="mb-6">
        {isComplete ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <h2 className="text-2xl font-bold text-green-600">Exercise Complete!</h2>
            <p className="text-gray-600">Great job matching all the words!</p>
            <Button onClick={() => setIsComplete(false)}>Try Again</Button>
          </div>
        ) : (
          <WordMatch pairs={WordPairs} onComplete={handleComplete} />
        )}
      </div>

      <div>
        <Button onClick={() => navigateTo("home")}>Back</Button>
      </div>
    </div>
  );
};
