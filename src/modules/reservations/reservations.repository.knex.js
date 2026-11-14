const SORT_COLUMNS = { startTime: "v.start_time", createdAt: "v.created_at", participants: "v.participants" };
function mapReservation(row) {
    if (!row) return null;
    return { id: row.id, roomId: row.room_id, userId: row.user_id, user: { id: row.user_id, email: row.user_email }, participants: row.participants,
        startTime: row.start_time, endTime: row.end_time, status: row.status,
        createdAt: row.created_at, cancelledAt: row.cancelled_at,
        room: { id: row.room_id, name: row.room_name, building: { id: row.building_id, name: row.building_name } } };
}
function createKnexReservationsRepository(db) {
    const base = () => db("reservations as v").join("rooms as r", "r.id", "v.room_id")
        .join("buildings as b", "b.id", "r.building_id").join("users as u", "u.id", "v.user_id");
    const select = query => query.select("v.*", "r.name as room_name", "r.building_id", "b.name as building_name", "u.email as user_email");
    return {
        async findAll({ roomId, buildingId, userId, status, from, to, page = 1, limit = 20, sort = "startTime" } = {}) {
            const query = base();
            if (roomId !== undefined) query.where("v.room_id", roomId);
            if (buildingId !== undefined) query.where("r.building_id", buildingId);
            if (userId !== undefined) query.where("v.user_id", userId);
            if (status) query.where("v.status", status);
            if (from) query.where("v.end_time", ">", from);
            if (to) query.where("v.start_time", "<", to);
            const column = SORT_COLUMNS[sort.replace(/^-/, "")];
            if (!column) throw new Error("Unsupported repository sort");
            const [{ total }] = await query.clone().count("v.id as total");
            const rows = await select(query).orderBy(column, sort.startsWith("-") ? "desc" : "asc")
                .orderBy("v.id", "asc").limit(limit).offset((page - 1) * limit);
            return { items: rows.map(mapReservation), total: Number(total) };
        },
        async findById(id) { return mapReservation(await select(base()).where("v.id", id).first()); },
        async findActiveByRoomId(id) {
            return (await select(base()).where({ "v.room_id": id, "v.status": "CONFIRMED" })).map(mapReservation);
        },
        async create(data) {
            const [row] = await db("reservations").insert({ room_id: data.roomId, user_id: data.userId,
                participants: data.participants, start_time: data.startTime, end_time: data.endTime,
                status: "CONFIRMED" }).returning("id");
            return this.findById(row.id);
        },
        async update(id, data) {
            const rows = await db("reservations").where({ id }).update({ status: data.status, cancelled_at: data.cancelledAt }).returning("id");
            return rows.length ? this.findById(id) : null;
        }
    };
}
module.exports = { createKnexReservationsRepository };
