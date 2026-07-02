import { Suspense, Component, ReactNode } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "next-themes";
import { Toaster } from "./components/ui/sonner";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "12px", fontFamily: "sans-serif", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", fontWeight: 700, color: "#dc2626" }}>Oops!</div>
          <div style={{ fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Something went wrong</div>
          <div style={{ color: "#64748b", maxWidth: "400px" }}>{(this.state.error as Error).message}</div>
          <button onClick={() => window.location.href = "/"} style={{ marginTop: "8px", padding: "10px 24px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "15px" }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingSpinner() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        gap: "16px",
        backgroundColor: "#ffffff",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          border: "4px solid #e2e8f0",
          borderTopColor: "#2563eb",
          borderRadius: "50%",
          animation: "fieldtrack-spin 0.75s linear infinite",
        }}
      />
      <span
        style={{
          fontSize: "18px",
          fontWeight: 600,
          color: "#2563eb",
          letterSpacing: "0.01em",
        }}
      >
        FieldTrack KSA
      </span>
      <style>{`
        @keyframes fieldtrack-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <Suspense fallback={<LoadingSpinner />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
