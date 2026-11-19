// Shows `text` with every case-insensitive occurrence of `query` marked in yellow, the way search results point out what matched.
type HighlightTextProps = { text: string; query?: string };

export default function HighlightText({ text, query }: HighlightTextProps) {
  if (!query) return <>{text}</>;
  // The capturing group keeps the matches in the split result, at the odd indexes.
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
