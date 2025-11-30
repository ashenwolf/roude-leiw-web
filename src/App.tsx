import { AppHome } from "./page/AppHome";
import { AppExcersise } from "./page/AppExcersise";
import { useNavigation } from "./context/useNavigation";

import "./App.css";

const PageMapper = {
  home: AppHome,
  excersise: AppExcersise,
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
