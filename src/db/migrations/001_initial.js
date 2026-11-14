exports.up = async function (db) {
    await db.schema.createTable("buildings", table => {
        table.increments("id");
        table.text("name").notNullable().unique();
        table.text("address").notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
    await db.schema.createTable("rooms", table => {
        table.increments("id");
        table.integer("building_id").notNullable().references("id").inTable("buildings").onDelete("RESTRICT");
        table.text("name").notNullable();
        table.integer("capacity").notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.unique(["building_id", "name"]);
        table.check("capacity > 0", [], "rooms_capacity_positive");
    });
    await db.schema.createTable("reservations", table => {
        table.increments("id");
        table.integer("room_id").notNullable().references("id").inTable("rooms").onDelete("RESTRICT");
        table.text("reserved_by").notNullable();
        table.integer("participants").notNullable();
        table.timestamp("start_time", { useTz: true }).notNullable();
        table.timestamp("end_time", { useTz: true }).notNullable();
        table.text("status").notNullable().defaultTo("CONFIRMED");
        table.timestamp("cancelled_at", { useTz: true });
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.check("end_time > start_time", [], "reservations_valid_interval");
        table.check("status IN ('CONFIRMED', 'CANCELLED')", [], "reservations_valid_status");
        table.check("participants > 0", [], "reservations_participants_positive");
        table.index(["room_id", "start_time", "end_time"], "reservations_overlap_idx");
    });
};
exports.down = async function (db) {
    await db.schema.dropTable("reservations");
    await db.schema.dropTable("rooms");
    await db.schema.dropTable("buildings");
};
