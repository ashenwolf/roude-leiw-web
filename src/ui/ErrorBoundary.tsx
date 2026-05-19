import { Component } from "react";
import posthog from "posthog-js";

import { Button } from "./Button";

import type { ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

const ErrorScreen = () => (
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

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    posthog.capture("error_boundary_triggered", {
      message: error.message,
      component_stack: info.componentStack,
    });
  }

  render() {
    return this.state.hasError ? <ErrorScreen /> : this.props.children;
  }
}
