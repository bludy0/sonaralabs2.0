import { Component, type ReactNode } from "react";

interface Props  { children: ReactNode }
interface State  { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
          background: "#0a0a0a", color: "#fff", padding: 32, textAlign: "center",
        }}>
          <p style={{ fontSize: 32 }}>⚠</p>
          <p style={{ fontWeight: 700, fontSize: 18 }}>Bir şeyler ters gitti</p>
          <p style={{ fontSize: 13, color: "#999", maxWidth: 400 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: "10px 24px", borderRadius: 8,
              background: "#fff", color: "#000", fontWeight: 700,
              border: "none", cursor: "pointer", fontSize: 13,
            }}
          >
            Sayfayı Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
