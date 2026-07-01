import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
