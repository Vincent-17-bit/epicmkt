import { Component } from "react";

/** Without this, one rendering error blanks the whole portal. It shows a plain message and a way to recover instead. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Seller portal render error", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ padding: "var(--space-5, 1.5rem)", maxWidth: "32rem" }}>
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p>This page could not be shown. Reload to try again. If it keeps happening, contact EpicMKT support.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
