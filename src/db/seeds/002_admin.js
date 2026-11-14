const bcrypt = require("bcryptjs");
const { config } = require("../../config");
// Can be run separately on an existing database without deleting any data.
exports.seed = async db => {
    const existing = await db("users").where({ email: config.SEED_ADMIN_EMAIL }).first();
    if (existing) {
        if (existing.role !== "ADMIN") throw new Error("Seed admin email belongs to a USER; choose another SEED_ADMIN_EMAIL");
        return;
    }
    await db("users").insert({ email: config.SEED_ADMIN_EMAIL, password_hash: await bcrypt.hash(config.SEED_ADMIN_PASSWORD, config.BCRYPT_COST), role: "ADMIN" });
};
