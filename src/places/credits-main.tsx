// The real places' credits page (real-places/credits/): each map's in-game description links here.

import { render } from "preact";
import { Credits } from "./Credits";
import { PLACES_URL } from "./data";
import "../styles/app.css";
import "../styles/places.css";

function CreditsPage() {
  return (
    <div class="app places">
      <header class="top">
        <div class="top-row">
          <h1>Real places credits</h1>
          <nav class="top-nav" aria-label="Pages">
            <a href={PLACES_URL}>Real places</a>
          </nav>
        </div>
        <p class="tag">Credits for the Real places maps.</p>
      </header>
      <Credits />
      <footer class="foot">
        Dam Good Maps. Not affiliated with Mechanistry. <a href="https://github.com/timbermods/dam-good-maps">Source</a>
      </footer>
    </div>
  );
}

render(<CreditsPage />, document.getElementById("app")!);
