import { StrictMode } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./styles.css";

const root = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// The pages arrive prerendered; hydrate them. (The dev server serves an empty shell, which is rendered fresh.)
if (root.hasChildNodes()) hydrateRoot(root, tree);
else createRoot(root).render(tree);
