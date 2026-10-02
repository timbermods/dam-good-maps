import { render } from "preact";
import { Workspace } from "./page/Workspace";
import { Tooltips } from "./ui/Tooltip";
// (the map's name: Bitter 700, the one weight used; OFL, public/licences/Bitter-OFL.txt)
import "@fontsource/bitter/latin-700.css";
import "./styles/base.css";
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
