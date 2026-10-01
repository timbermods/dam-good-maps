import { render } from "preact";
import { App } from "./ui/App";
import { Tooltips } from "./ui/Tooltip";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/components.css";

// (the one tooltip layer for every page: D368 (6))
render(
  <>
    <App />
    <Tooltips />
  </>,
  document.getElementById("app")!,
);
