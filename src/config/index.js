const { z } = require("zod");
try { process.loadEnvFile(); } catch (error) {
    if (error.code !== "ENOENT") throw error;
}
const schema = z.object({
    DATABASE_URL: z.url().pipe(z.string().refine(value => ["postgres:", "postgresql:"].includes(new URL(value).protocol), "Expected a PostgreSQL connection URL")),
    JWT_SECRET: z.string().min(32, "Must contain at least 32 characters"),
    JWT_EXPIRES_IN: z.string().regex(/^[1-9]\d*(s|m|h|d)$/, "Use a positive duration, e.g. 15m or 10s").default("15m"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    REPOSITORY: z.enum(["knex", "memory"]).default("knex"),
    BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(10),
    SEED_ADMIN_EMAIL: z.email().transform(value => value.toLowerCase()).default("admin@example.com"),
    SEED_ADMIN_PASSWORD: z.string().min(10).max(72).default("Admin-demo-2026!"),
    BASE_URL: z.url().default("http://localhost:3000"),
    ROOM_ID: z.coerce.number().int().positive().default(5),
    START_TIME: z.iso.datetime({ offset: true }).default("2099-12-01T10:00:00Z"),
    END_TIME: z.iso.datetime({ offset: true }).default("2099-12-01T12:00:00Z"),
    ACCESS_TOKEN: z.string().optional()
});
function parseConfig(environment) {
    const result = schema.safeParse(environment);
    if (!result.success) {
        // Report field names and validation messages, never secret values.
        throw new Error("Invalid configuration:\n" + result.error.issues.map(issue => `- ${issue.path.join(".")}: ${issue.message}`).join("\n"));
    }
    return Object.freeze(result.data);
}
const config = parseConfig(process.env);
// Tooling starts child processes through the same configuration boundary.
function childEnvironment(overrides = {}) { return { ...process.env, ...overrides }; }
module.exports = { config, parseConfig, childEnvironment };
