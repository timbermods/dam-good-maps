// Every move of a generator control changes the next map, or the panel greys the control (D527): the delta theme
// (settingsMove.ts; a theme a file, so the nightly suite runs the themes side by side).
import { moveTest } from "./settingsMove";

moveTest("delta");
