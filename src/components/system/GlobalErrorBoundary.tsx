import React, { Component } from "react";
import type { ReactNode } from "react";
import type { GlobalErrorBoundaryProps } from "@/types";
import { GlobalErrorScreen } from "./GlobalErrorScreen";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Globalny Error Boundary opakowujący główne wyspy React
 * Przechwytuje błędy renderu i wyświetla fallback GlobalErrorScreen
 *
 * Uwaga: Error Boundary przechwytuje tylko błędy w renderowaniu,
 * nie obsługuje błędów async (Promise rejection) - te są obsługiwane lokalnie
 */
export class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Aktualizuj stan, aby następny render pokazał UI fallback
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Możesz tutaj zalogować błąd do zewnętrznego serwisu (np. Sentry)
    console.error("[GlobalErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReset = (): void => {
    // Resetuj stan błędu
    this.setState({
      hasError: false,
      error: null,
    });

    // Wywołaj opcjonalny callback onRetry z props
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Renderuj fallback UI
      return (
        <GlobalErrorScreen
          title="Wystąpił nieoczekiwany błąd"
          message={
            this.state.error.message ||
            "Przepraszamy, coś poszło nie tak. Spróbuj odświeżyć stronę lub wróć na stronę główną."
          }
          onRetry={this.handleReset}
        />
      );
    }

    // Normalnie renderuj dzieci
    return this.props.children;
  }
}
