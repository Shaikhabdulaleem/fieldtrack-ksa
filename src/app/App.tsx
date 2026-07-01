import { Suspense } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "next-themes";
import { Toaster } from "./components/ui/sonner";

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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Suspense fallback={<LoadingSpinner />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </ThemeProvider>
  );
}
