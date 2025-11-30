import { useNavigation } from "../context/useNavigation";
import { WordMatch } from "../excersise/WordMatch";
import { Button } from "../ui/Button";

export const AppExcersise = () => {
  const { navigateTo } = useNavigation();
  return (
    <div>
      <div className="mb-6">
        <WordMatch />
      </div>

      <div>
        <Button onClick={() => navigateTo("home")}>Back</Button>
      </div>
    </div>
  );
};
