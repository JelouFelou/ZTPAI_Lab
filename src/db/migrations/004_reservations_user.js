const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
exports.up = async db => {
    await db.schema.alterTable("reservations", table => {
        table.integer("user_id").references("id").inTable("users").onDelete("RESTRICT");
    });
    const [{ count }] = await db("reservations").count("id as count");
    if (Number(count) > 0) {
        // Old free-text names do not identify verified accounts. Preserve records
        // under an archival USER account with a random, discarded password.
        const email = "legacy-reservations@migration.invalid";
        await db("users").insert({ email, role: "USER", password_hash: await bcrypt.hash(randomBytes(32).toString("hex"), 10) })
            .onConflict("email").ignore();
        const legacyUser = await db("users").where({ email }).first();
        await db("reservations").update({ user_id: legacyUser.id });
    }
    await db.schema.alterTable("reservations", table => {
        table.integer("user_id").notNullable().alter();
        table.dropColumn("reserved_by");
        table.index("user_id", "reservations_user_id_idx");
    });
};
exports.down = async db => {
    await db.schema.alterTable("reservations", table => table.text("reserved_by"));
    await db.raw("UPDATE reservations AS r SET reserved_by = u.email FROM users AS u WHERE u.id = r.user_id");
    await db.schema.alterTable("reservations", table => {
        table.text("reserved_by").notNullable().alter();
        table.dropIndex("user_id", "reservations_user_id_idx");
        table.dropColumn("user_id");
    });
};
