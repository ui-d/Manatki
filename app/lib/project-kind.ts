import type { DeckKind } from "@/lib/slide-size";

/**
 * Normalize a project's kind.
 *
 * `kind` was added with social projects, so every deck created before that
 * has no `kind` field at all. Absent means presentation — never treat a
 * missing `kind` as unknown, or the whole pre-existing library drops out of
 * the "Decks" filter.
 */
export function projectKindOf(project: { kind?: DeckKind }): DeckKind {
  return project.kind === "social" ? "social" : "deck";
}

export function isSocialProject(project: { kind?: DeckKind }): boolean {
  return projectKindOf(project) === "social";
}
