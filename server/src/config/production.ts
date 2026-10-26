// Refuses to start a production server with unsafe settings. In development (anything but NODE_ENV=production) nothing is checked.
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

// Returns what is wrong with the environment, one sentence per problem. Empty when it is fine.
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if ((env.SESSION_SECRET ?? "").length < MIN_PRODUCTION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`);
  }
  if (!(env.CORS_ORIGINS ?? "").split(",").some((origin) => origin.trim())) {
    problems.push("CORS_ORIGINS must list the allowed origins in production (for example https://app.example.com).");
  }
  return problems;
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const problems = productionConfigProblems(env);
  if (problems.length > 0) throw new Error(`Unsafe production configuration:\n- ${problems.join("\n- ")}`);
}
