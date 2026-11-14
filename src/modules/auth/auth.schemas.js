const { z } = require("zod");
const email = z.string().trim().toLowerCase().pipe(z.email());
const registerBody = z.object({ email, password: z.string().min(10).max(72)
    .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must fit in bcrypt's 72-byte limit") }).strict();
const loginBody = z.object({ email, password: z.string().min(1).max(72)
    .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must fit in bcrypt's 72-byte limit") }).strict();
module.exports = { registerBody, loginBody };
