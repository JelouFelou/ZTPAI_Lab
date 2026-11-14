const bcrypt = require("bcryptjs");
const { config } = require("../../config");
exports.seed = async function (db) {
    await db.transaction(async trx => {
        const created_at = "2026-10-27T08:00:00Z";
        await trx.raw("TRUNCATE reservations, rooms, buildings, users RESTART IDENTITY CASCADE");
        await trx("users").insert([
            { email: config.SEED_ADMIN_EMAIL, password_hash: await bcrypt.hash(config.SEED_ADMIN_PASSWORD, config.BCRYPT_COST), role: "ADMIN", created_at },
            { email: "user@example.com", password_hash: await bcrypt.hash("User-demo-2026!", config.BCRYPT_COST), role: "USER", created_at },
            { email: "other@example.com", password_hash: await bcrypt.hash("Other-demo-2026!", config.BCRYPT_COST), role: "USER", created_at }
        ]);
        await trx("buildings").insert([
            { name: "Budynek A", address: "ul. Warszawska 24, Kraków" },
            { name: "Budynek B", address: "ul. Szlak 1, Kraków" }
        ].map(row => ({ ...row, created_at })));
        await trx("rooms").insert([
            { building_id: 1, name: "101", capacity: 30 },
            { building_id: 1, name: "102", capacity: 20 },
            { building_id: 1, name: "201", capacity: 50 },
            { building_id: 2, name: "101", capacity: 15 },
            { building_id: 2, name: "202", capacity: 40 }
        ].map(row => ({ ...row, created_at })));
        await trx("reservations").insert([
            { room_id: 1, user_id: 2, participants: 10, start_time: "2099-11-10T10:00:00Z", end_time: "2099-11-10T12:00:00Z", status: "CONFIRMED" },
            { room_id: 1, user_id: 2, participants: 5, start_time: "2099-11-10T12:00:00Z", end_time: "2099-11-10T13:00:00Z", status: "CONFIRMED" },
            { room_id: 2, user_id: 2, participants: 5, start_time: "2099-11-10T10:00:00Z", end_time: "2099-11-10T12:00:00Z", status: "CANCELLED", cancelled_at: "2026-01-01T00:00:00Z" },
            { room_id: 3, user_id: 2, participants: 5, start_time: "2025-01-01T10:00:00Z", end_time: "2025-01-01T12:00:00Z", status: "CONFIRMED" },
            { room_id: 4, user_id: 3, participants: 8, start_time: "2099-11-11T10:00:00Z", end_time: "2099-11-11T11:00:00Z", status: "CONFIRMED" }
        ].map(row => ({ ...row, created_at })));
    });
};
