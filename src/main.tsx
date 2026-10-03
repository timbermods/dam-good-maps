import { render } from "preact";
import { App } from "./ui/App";
import { Tooltips } from "./ui/Tooltip";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/components.css";
import "./styles/page.css";

// Temporary, for Kyler to try the chrome's scale-up on the preview (DESIGN.md, "The one-page editor"): ?ui=1.05
// sets the scale applied from 1800px wide; 1.1 without it. Removed once he picks one.
const ui = Number(new URLSearchParams(location.search).get("ui"));
if (ui >= 1 && ui <= 1.5) document.documentElement.style.setProperty("--ui-scale", String(ui));

// (the one tooltip layer for every page: D368 (6))
render(
  <>
    <App />
    <Tooltips />
  </>,
  document.getElementById("app")!,
);
