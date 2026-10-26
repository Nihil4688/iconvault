// API tokens: list, create (the secret is returned once) and revoke. These need a signed-in browser session.
import { http } from "./http";
import type { ApiTokenItem, ApiTokenList, ApiTokenScope, CreatedApiToken } from "./types";

export async function listTokens(): Promise<ApiTokenList> {
  const { data } = await http.get<ApiTokenList>("/api/tokens");
  return data;
}

// expiresInDays: null means the token never expires.
export async function createToken(name: string, scope: ApiTokenScope = "read", expiresInDays: number | null = 90): Promise<CreatedApiToken> {
  const { data } = await http.post<CreatedApiToken>("/api/tokens", { name, scope, expiresInDays });
  return data;
}

// Ends every other session of this account. The answer holds a fresh token for this device.
export async function signOutEverywhere(): Promise<string> {
  const { data } = await http.post<{ token: string }>("/api/auth/me/sign-out-everywhere");
  return data.token;
}

export async function revokeToken(tokenId: string): Promise<ApiTokenItem> {
  const { data } = await http.delete<ApiTokenItem>(`/api/tokens/${encodeURIComponent(tokenId)}`);
  return data;
}
