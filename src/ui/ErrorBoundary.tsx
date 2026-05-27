import { Component } from "react";
import posthog from "posthog-js";

import { ErrorScreen } from "./ErrorScreen";

import type { ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

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
