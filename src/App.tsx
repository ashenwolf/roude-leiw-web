import { AppHome } from "./page/AppHome";
import { AppExercise } from "./page/AppExercise";
import { useNavigation } from "./context/useNavigation";

import "./App.css";

const PageMapper = {
  home: AppHome,
  exercise: AppExercise,
};

function App() {
  const { currentPage } = useNavigation();
  const Component = PageMapper[currentPage];

  return (
    <>
      <Component />
    </>
  );
}

export default App;
