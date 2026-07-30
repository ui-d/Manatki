import Index from "@/pages/Index";

export function meta() {
  return [
    { title: "Decks - Manatki" },
    // The workspace is private and its content is per-user; only the public
    // home page at `/` should be indexed.
    { name: "robots", content: "noindex" },
  ];
}

/** The deck workspace — the signed-in home. `/` is the public landing page. */
export default function DecksRoute() {
  return <Index />;
}
