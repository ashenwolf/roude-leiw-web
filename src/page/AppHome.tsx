import { useNavigation } from "../context/useNavigation";
import { Button } from "../ui/Button";

export const AppHome = () => {
  const { navigateTo } = useNavigation();
  return (
    <div>
      <Button onClick={() => navigateTo("exercise")}>Start Exercise</Button>
    </div>
  );
};
