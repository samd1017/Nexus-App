/** Yield so React can paint progress during 45k+ open / FTS fill. */
export function yieldToUi(paint = false): Promise<void> {
  return new Promise((resolve) => {
    if (paint && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
      return;
    }
    setTimeout(resolve, 0);
  });
}
