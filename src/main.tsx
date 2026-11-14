import { render } from "preact";
import { App } from "./ui/App";
import { Tooltips } from "./ui/Tooltip";
import { fitFonts } from "./ui/fontFit";
import { watchPhoneRoot } from "./ui/phoneRoot";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/components.css";
import "./styles/page.css";
import "./styles/phone.css";

fitFonts();
// (the phone layouts by the room, for what lies outside the editor too: #1074)
watchPhoneRoot();

// (the one tooltip layer for every page: D368 (6))
render(
  <>
    <App />
    <Tooltips />
  </>,
  document.getElementById("app")!,
);
