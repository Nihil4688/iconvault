// Runs the axe accessibility engine over part of the rendered page and returns a short description of every violation (empty when clean). Colour contrast is checked separately against the real colour tokens (lib/contrast.test.ts) because jsdom cannot compute styles; the page-landmark rule is skipped for pieces rendered on their own.
import axe from "axe-core";

export async function accessibilityViolations(root: Element = document.body, options: { region?: boolean } = {}): Promise<string[]> {
  const results = await axe.run(root, {
    resultTypes: ["violations"],
    // jsdom cannot run axe inside frames; the preview frame's title is asserted by its own test.
    iframes: false,
    rules: { "color-contrast": { enabled: false }, region: { enabled: options.region ?? false } },
  });
  return results.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => `${node.target.join(" ")} → ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`).join("\n    ")}`);
}
