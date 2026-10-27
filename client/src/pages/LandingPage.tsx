// What a signed-out visitor sees. Signing in is required to use the app, so this explains what it does and offers the Sign in button; the page content only describes features that exist.
import { FolderTree, Layers, Lock, ShieldCheck, type LucideIcon } from "lucide-react";

const FEATURES: Array<{ title: string; text: string; Icon: LucideIcon }> = [
  {
    title: "Organize projects and folders",
    text: "Keep icons organized in projects and nested folders. Quickly find assets with search, tags, and a structured library.",
    Icon: FolderTree,
  },
  {
    title: "Clean, secure and optimized",
    text: "Uploaded SVGs are sanitized and optimized automatically. Track size reductions and keep version history for easy rollback.",
    Icon: ShieldCheck,
  },
  {
    title: "Compile Icons to Sprites & Fonts",
    text: "Turn a project's icons into SVG sprites and icon fonts with live previews, generated IDs and CSS classes, integration-ready code snippets, and downloadable packages.",
    Icon: Layers,
  },
  {
    title: "Private or public libraries",
    text: "Keep projects private or share public icon libraries that teams and communities can reuse.",
    Icon: Lock,
  },
];

export default function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <>
      <main id="main" className="pt-[57px]">
        <section aria-labelledby="landing-title" className="bg-linear-to-b from-primary/10 to-transparent">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
            <h1 id="landing-title" className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              Your SVG icons, organized and compiled into sprites & icon fonts
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Centralize your SVG assets, organize them into projects, and export optimized SVG sprites or icon font packages ready for web applications and design systems.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Sign in to get started
              </button>
              <p className="text-sm text-muted-foreground">Use your Google or Microsoft account. No separate password.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="landing-features" className="mx-auto max-w-5xl px-4 pb-16 sm:pb-24">
          <h2 id="landing-features" className="sr-only">
            What you can do
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ title, text, Icon }) => (
              <li key={title} className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">IconVault</footer>
    </>
  );
}
