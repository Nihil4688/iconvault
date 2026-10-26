// Small helpers shared by the project, folder and icon routes: who is asking, id parsing, and loading a project with the right permission.
import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import mongoose from "mongoose";
import Project, { type ProjectDoc } from "../models/Project.js";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "./errors.js";
import { canEdit, canManage, canView, type Actor } from "./permissions.js";

export type SignedInActor = NonNullable<Actor>;
export type ProjectNeed = "view" | "edit" | "manage";
export type LoadedProject = HydratedDocument<ProjectDoc>;

const OBJECT_ID = /^[a-f\d]{24}$/i;

// The signed-in user as the permission functions expect it. Throws 401 when there is none.
export function actorOf(req: Request): SignedInActor {
  if (!req.user) throw new UnauthorizedError();
  return { id: String(req.user._id), isAdmin: req.isAdmin === true };
}

export function parseObjectId(value: unknown, what = "id"): mongoose.Types.ObjectId {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== "string" || !OBJECT_ID.test(value)) {
    throw new BadRequestError(`Invalid ${what}.`);
  }
  return new mongoose.Types.ObjectId(value);
}

// Loads a project and checks the actor may do what they are about to do. A project the actor cannot see is reported as missing (404), so private projects do not reveal that they exist; a visible project they may not change is 403.
export async function loadProject(actor: SignedInActor, projectId: unknown, need: ProjectNeed): Promise<LoadedProject> {
  const id = parseObjectId(projectId, "project id");
  const project = await Project.findById(id);
  if (!project || !canView(actor, project)) {
    throw new NotFoundError("Project not found.");
  }
  if (need === "edit" && !canEdit(actor, project)) {
    throw new ForbiddenError("You can only change projects you own.");
  }
  if (need === "manage" && !canManage(actor, project)) {
    throw new ForbiddenError("You can only manage projects you own.");
  }
  return project;
}

// Escapes user text for use inside a regular expression.
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type DownloadFile = { filename: string; contentType: string; body: Buffer };

// Sends a file for download. The restrictive headers matter: an SVG opened directly could otherwise run in the page's origin.
export function sendDownload(res: Response, file: DownloadFile): void {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename.replace(/[^\w.-]/g, "_")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.send(file.body);
}
