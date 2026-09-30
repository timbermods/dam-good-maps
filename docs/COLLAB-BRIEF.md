# Collaborative editing brief

Kyler's decisions, 2026-10-01. Two players edit one map live, peer to peer with no server, joined by two copy-paste codes (D349). One player hosts and keeps the order of operations; each browser rebuilds the map from it (proven by the spike, #109: identical maps over 523 mixed edits). Forces are ordered as gestures with their seeds and computed by each browser on the agreed map, never sent as results. Rejoining sends the host's current map plus the edits since.

> Recorded as [PLAN.md §20](../PLAN.md#20-editor-decisions) D362 (extends D349's step 4). Nothing is built before the
> milestone. ROADMAP's "Collaborative editing" section points here.

1. A map starts fully shared: both players can edit everywhere from the moment they join.
2. Claims: either player can claim areas where the other can't edit. In Select, mark an area with any of its shapes, then Claim. Only unclaimed ground can be claimed, at any size. The owner can release all or part of a claim at any time, or "Offer to" the other player, who accepts or declines. Claims never change how the map looks: no tint, no change to lighting or colour; a faint but visible outline in the owner's colour once the claim is made (stronger only while it's being drawn), and a view toggle hides the outlines entirely. Claims are an editing tool only and never go into the saved map.
3. An edit that would reach into the other player's claim is refused, shown before release: while drawing, the part that would land there shows in their colour with "reaches into <name>'s area"; releasing there does nothing. This is the claim stopping it, like the Floor, so D356 isn't breached.
4. Water always flows as the game would, across claims. When a player's edit changes the water inside the other's claim (flooding or draining it), the other gets a quiet note naming who and where, with a way to see it.
5. Undo: each player's undo takes back only their own actions, with a history of their last 50. Where the other player has since built on the same ground, that undo is refused and skipped, naming the edit in the way ("Emma's Raise at the north lake is on top of this"); it becomes undoable again if the other undoes theirs. Edits are never replayed onto changed land.
6. Presence: each player sees the other's cursor with name and colour, the tool they hold, and their stroke as it's drawn, in their colour, before release; then the force playing out. A "Go to <name>" button moves the camera to where the other is looking, never automatically.
7. If a player leaves or the connection drops, the session pauses for the other: the map stays on screen, read-only, with "<name> has left. Waiting to reconnect." They can save their own copy meanwhile. Rejoining with new codes carries on exactly where they stopped.
8. Saving: both players can Save to Timberborn at any time; both copies are the same map. The session is kept in each player's Your maps, to reopen alone later.
9. Changing the whole map (Generate, a real place, another map) is the host's alone; the guest sees a quiet note first ("<name> is opening a new map"), and both keep the previous map in Your maps.
