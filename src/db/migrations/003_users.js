exports.up = async db => {
    await db.schema.createTable("users", table => {
        table.increments("id");
        table.text("email").notNullable();
        table.unique(["email"], { indexName: "users_email_unique" });
        table.text("password_hash").notNullable();
        table.text("role").notNullable().defaultTo("USER");
        table.check("role IN ('USER', 'ADMIN')", [], "users_valid_role");
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
};
exports.down = db => db.schema.dropTable("users");
