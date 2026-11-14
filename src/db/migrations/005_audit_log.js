exports.up = db => db.schema.createTable('audit_log', table => {
    table.bigIncrements('id').primary();
    table.string('event_type', 100).notNullable().index();
    table.jsonb('payload').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable();
});
exports.down = db => db.schema.dropTable('audit_log');
