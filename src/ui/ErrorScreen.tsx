import { Button } from "./Button";

export const ErrorScreen = () => (
  <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
    <h2 className="text-xl font-bold text-gray-800">Something went wrong</h2>
    <p className="text-gray-600">
      An unexpected error occurred. Reload the page to continue.
    </p>
    <div className="w-full max-w-xs">
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  </div>
);
