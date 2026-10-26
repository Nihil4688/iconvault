// Admin API: totals, list users, delete one (with or without handing their projects to another user) and move a project to another owner. Only admins may call these.
import { http } from "./http";
import type { AdminStats, AdminUserList, BulkProjectsResult, DeleteUserResult, ListUsersParams, ProjectDetail } from "./types";

export async function listUsers(params: ListUsersParams = {}): Promise<AdminUserList> {
  const { data } = await http.get<AdminUserList>("/api/admin/users", { params });
  return data;
}

// Without `transferTo` the user's projects are deleted with them.
export async function deleteUser(userId: string, options: { transferTo?: string } = {}): Promise<DeleteUserResult> {
  const { data } = await http.delete<DeleteUserResult>(`/api/admin/users/${encodeURIComponent(userId)}`, { data: options.transferTo ? { transferTo: options.transferTo } : {} });
  return data;
}

export async function transferProject(projectId: string, userId: string): Promise<ProjectDetail> {
  const { data } = await http.post<ProjectDetail>(`/api/admin/projects/${encodeURIComponent(projectId)}/transfer`, { userId });
  return data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await http.get<AdminStats>("/api/admin/stats");
  return data;
}

export async function bulkTransferProjects(projectIds: string[], userId: string): Promise<BulkProjectsResult> {
  const { data } = await http.post<BulkProjectsResult>("/api/admin/projects/bulk-transfer", { projectIds, userId });
  return data;
}

export async function bulkDeleteProjects(projectIds: string[]): Promise<BulkProjectsResult> {
  const { data } = await http.post<BulkProjectsResult>("/api/admin/projects/bulk-delete", { projectIds });
  return data;
}
