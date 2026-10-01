// Adoption seam: the workspace starts its renderer/editor and first map together.
// Supply the existing worker API; errors keep the workspace's usual fallback policy.
import { loadFirstVisit } from "./load";

export async function startFirstVisit<T, U>(
  loadEditor: () => Promise<T>,
  openProject: (bytes: Uint8Array) => Promise<U>,
  random: () => number = Math.random,
): Promise<{ editor: T; opened: U; map: NonNullable<Awaited<ReturnType<typeof loadFirstVisit>>>["map"] } | null> {
  const [editor, first] = await Promise.all([
    loadEditor(),
    loadFirstVisit(random).then(async (first) => first ? { opened: await openProject(first.project), map: first.map } : null),
  ]);
  return first ? { editor, ...first } : null;
}
