export function RequiredIndicator() {
  return (
    <>
      <span aria-hidden="true" className="text-xs ml-1 text-red-600">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
