import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";

// ✅ IMPORTANTE: CSS base de MapLibre (arregla el desfasaje de markers)
import "maplibre-gl/dist/maplibre-gl.css";

import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<App />);
