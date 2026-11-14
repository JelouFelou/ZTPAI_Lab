exports.up = async function (db) {
    await db.raw("CREATE EXTENSION IF NOT EXISTS btree_gist");
    await db.raw(`ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
        EXCLUDE USING gist (room_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
        WHERE (status = 'CONFIRMED')`);
};
exports.down = async function (db) {
    await db.raw("ALTER TABLE reservations DROP CONSTRAINT reservations_no_overlap");
    // The extension may also be used by other database objects; leave it installed.
};
