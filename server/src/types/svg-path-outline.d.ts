declare module "svg-path-outline" {
  export default function outline(
    pathData: string,
    distance: number,
    options?: {
      bezierAccuracy?: number;
      joints?: number;
      inside?: boolean;
      outside?: boolean;
      tagName?: "path" | "polygon" | "polyline";
    },
  ): string;
}
