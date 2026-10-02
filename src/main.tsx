import { render } from "preact";
import { Workspace } from "./page/Workspace";
import { Tooltips } from "./ui/Tooltip";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/components.css";
import "./styles/lamplight.css";

// (the one tooltip layer for every page: D368 (6))
render(
  <>
    <Workspace />
    <Tooltips />
  </>,
  document.getElementById("app")!,
);
