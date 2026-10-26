// Renames the ids inside an icon's SVG markup so two icons on one page cannot capture each other's gradients, masks or clip paths (the ids `a` or `clip0` are very common). The markup is the server's cleaned output, which always uses double quotes.
export function namespaceSvgIds(svg: string, prefix: string): string {
  if (!/\sid="/.test(svg)) return svg;
  const ids = new Set<string>();
  for (const match of svg.matchAll(/\sid="([^"]+)"/g)) ids.add(match[1] as string);
  let out = svg;
  for (const id of ids) {
    const next = `${prefix}-${id}`;
    out = out
      .split(`id="${id}"`).join(`id="${next}"`)
      .split(`url(#${id})`).join(`url(#${next})`)
      .split(`url('#${id}')`).join(`url('#${next}')`)
      .split(`url("#${id}")`).join(`url("#${next}")`)
      .split(`href="#${id}"`).join(`href="#${next}"`);
  }
  return out;
}
