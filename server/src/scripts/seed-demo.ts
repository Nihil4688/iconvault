// Demo data for looking at the admin screens: a handful of made-up users (e-mail ending in @demo.example.test) with projects of every kind (private, public, sprite, font, draft) and a few icons each. The demo users cannot sign in (there are no passwords); they only show up in the lists. Run `npm run seed:demo` to add them (running it again changes nothing) and `npm run seed:demo -- --remove` to take every trace of them out again. Admin rights are never granted here: they come only from ADMIN_EMAILS.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import Icon from "../models/Icon.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import ApiToken from "../models/ApiToken.js";
import { deleteProject } from "../services/projectService.js";

const DOMAIN = "@demo.example.test";

const PEOPLE = [
  { key: "admin", name: "Demo Admin" },
  { key: "ada", name: "Ada Demo" },
  { key: "grace", name: "Grace Demo" },
  { key: "linus", name: "Linus Demo" },
];

const PROJECTS: { owner: string; name: string; prefix: string; purpose: "sprite" | "font"; visibility: "public" | "private"; draft?: boolean; color: string; icons: string[] }[] = [
  { owner: "ada", name: "Storefront Icons", prefix: "shop", purpose: "sprite", visibility: "public", color: "#2563eb", icons: ["cart", "bag", "tag", "card"] },
  { owner: "ada", name: "Admin Dashboard Font", prefix: "dash", purpose: "font", visibility: "private", color: "#7c3aed", icons: ["chart", "users", "gear"] },
  { owner: "grace", name: "Brand Marks", prefix: "brand", purpose: "sprite", visibility: "private", color: "#047857", icons: ["star", "heart", "bolt"] },
  { owner: "grace", name: "Weather Glyphs", prefix: "wx", purpose: "font", visibility: "public", color: "#0e7490", icons: ["sun", "cloud", "rain", "snow"] },
  { owner: "linus", name: "Old Marketing Set", prefix: "mkt", purpose: "sprite", visibility: "public", draft: true, color: "#b45309", icons: ["flag", "mail"] },
  { owner: "admin", name: "Team Shared Library", prefix: "team", purpose: "sprite", visibility: "public", color: "#be185d", icons: ["home", "search", "plus"] },
];

// A small, valid stroke icon; the shape differs per name so the lists do not look identical.
function svgFor(name: string): string {
  const n = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const r = 4 + (n % 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="${r}"/><path d="M${3 + (n % 5)} 21h${12 + (n % 7)}"/></svg>`;
}

async function remove() {
  const users = await User.find({ email: { $regex: `${DOMAIN.replace(".", "\\.")}$` } });
  let projects = 0;
  for (const user of users) {
    for (const project of await Project.find({ ownerId: user._id })) {
      await deleteProject(project);
      projects += 1;
    }
    await ApiToken.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
  }
  console.log(`Removed ${users.length} demo users and ${projects} demo projects.`);
}

async function add() {
  const ids = new Map<string, mongoose.Types.ObjectId>();
  for (const person of PEOPLE) {
    const email = `${person.key === "admin" ? "demo.admin" : person.key}${DOMAIN}`;
    const user =
      (await User.findOne({ email })) ??
      (await User.create({ provider: "system", providerId: `demo-${person.key}`, email, emailVerified: true, displayName: person.name, name: person.name, lastLoginAt: new Date(Date.now() - (PEOPLE.indexOf(person) + 1) * 3_600_000 * 7) }));
    ids.set(person.key, user._id);
  }
  let made = 0;
  for (const spec of PROJECTS) {
    const ownerId = ids.get(spec.owner);
    if (!ownerId || (await Project.exists({ ownerId, name: spec.name }))) continue;
    const project = await Project.create({ ownerId, name: spec.name, description: "Demo project for the admin screens.", prefix: spec.prefix, color: spec.color, purpose: spec.purpose, visibility: spec.visibility, isArchived: spec.draft === true });
    for (const name of spec.icons) {
      const svg = svgFor(name);
      await Icon.create({ projectId: project._id, name, slug: name, svg, byteSize: Buffer.byteLength(svg) });
    }
    made += 1;
  }
  console.log(`Demo users: ${PEOPLE.map((p) => p.name).join(", ")} (e-mails end in ${DOMAIN}).`);
  console.log(`Added ${made} demo projects (${PROJECTS.length - made} already there). Remove them with: npm run seed:demo -- --remove`);
  console.log("They only appear in the admin lists. To open the admin screens yourself, put your own e-mail in ADMIN_EMAILS in server/.env and restart the server.");
}

async function main() {
  await connectDb();
  try {
    if (process.argv.includes("--remove")) await remove();
    else await add();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
