import { lazy, Suspense } from "react";

import { AppHome } from "./page/AppHome";
import { useNavigation } from "./context/useNavigation";

import "./App.css";

const AppExercise = lazy(() =>
  import("./page/AppExercise").then((m) => ({ default: m.AppExercise })),
);

const PageMapper = {
  home: AppHome,
  exercise: AppExercise,
  "word-mix": AppExercise,
  "fix-errors": AppExercise,
};

const PageFallback = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="animate-pulse text-gray-500 text-lg">Loading...</div>
  </div>
);

function App() {
  const { currentPage } = useNavigation();
  const Component = PageMapper[currentPage];

  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

export default App;
