# Kyler's re-check of the ten fixes (2026-10-01)

Kyler's notes from re-checking D361's ten fixes on the preview (`feature/forces` at ea3cc2ad), recorded word for word.
PLAN §20 records them as D368.

---

For the milestone session (Kyler, 2026-10-01): my re-check of the ten fixes on the preview. Passed: Quake's drawn fault, Power and Size on Craterize and Erupt, the start's colour, focus, Select's Ctrl+click, and the More/Less outline. Fix the following on feature/forces, each with a test that fails first where it's a behaviour, then refresh the preview and send me a checklist of only these. The forces release waits for them.
1. One habit for every tool: F with the mouse (and { }) sets Size; [ and ] set strength: Power on every force, strength on Smooth and Naturalize, nothing on Raise, Lower and Flatten (which have a target level instead). This swaps today's keys. Update every tooltip, the shortcuts reference, the first-run hints and EDITOR_PLAN.
2. Quake: hovering shows only a small cursor marker, never a circle. Today it draws a dotted circle of how far a click could reach, which is the force's own decision and is never drawn in advance (as for every force).
3. Glaciate: Power is how deep the ice carves (from a light scour to a deep U-shaped valley); Size is how wide. Each makes a clear, visible difference on its own; the tooltip says so in a short phrase.
4. Sources, still wrong: Ctrl+scroll changes a source's value, but its label on the map (in Markers) doesn't update until later, and the settings row can disagree with it (the row said "This source 8 water/s" while the source's label said "1 water/s"). The label, the row and the source's real strength always show the same number, updating live with every scroll notch.
5. The top right, still misaligned: one tidy cluster. The compass in the corner; the level control beside it on the same line, centred with it; Slow forces and the speaker button directly beneath, lined up with the cluster's edges; even spacing and matching heights throughout.
6. Tooltips: the shortcut sits at the end as a small key cap, not in brackets in the middle. "Carve a river" followed by a key cap showing 7; "Smooth bumps and steps" followed by 4; and so on for every control with a key.
Log it in one line.
