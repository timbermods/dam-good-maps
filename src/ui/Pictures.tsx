// Two pictures of a map, as a shared component (styles in app.css, "two pictures of a map"; D176):
// the main picture, with the other as a small inset in its corner that fills the picture on hover,
// keyboard focus or a click (a tap on a phone); another click puts it back. With `north`, each
// picture carries a north arrow (NorthArrow): both pictures must face the same way.

import { useState } from "preact/hooks";
import { NorthArrow } from "./NorthArrow";

export interface Picture {
  src: string;
  alt: string;
}

function Img({ p }: { p: Picture }) {
  return <img src={p.src} width={240} height={240} loading="lazy" decoding="async" alt={p.alt} />;
}

export function InsetPicture({ main, inset, label, north }: { main: Picture; inset: Picture; label: string; north?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="pictures pictures-inset">
      <Img p={main} />
      {north === undefined ? null : <NorthArrow turns={north} />}
      <button type="button" class="pictures-toggle" aria-pressed={open} aria-label={label} onClick={() => setOpen(!open)}>
        <Img p={inset} />
        {north === undefined ? null : <NorthArrow turns={north} />}
      </button>
    </div>
  );
}
