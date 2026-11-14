function mapRoom(row) {
    return row ? { id: row.id, name: row.name, capacity: row.capacity, buildingId: row.building_id,
        createdAt: row.created_at, building: { id: row.building_id, name: row.building_name } } : null;
}
function createKnexRoomsRepository(db) {
    const query = () => db("rooms as r").join("buildings as b", "b.id", "r.building_id")
        .select("r.*", "b.name as building_name");
    return {
        async update(id, input) {
            const rows = await db("rooms").where({ id }).update({ name: input.name, building_id: input.buildingId, capacity: input.capacity }).returning("id");
            return rows.length ? this.findById(id) : null;
        },
        async delete(id) { return Boolean(await db("rooms").where({ id }).delete()); },
        async findAll() { return (await query().orderBy("r.id")).map(mapRoom); },
        async findById(id) { return mapRoom(await query().where("r.id", id).first()); },
        async findByBuildingId(id) { return (await query().where("r.building_id", id).orderBy("r.id")).map(mapRoom); },
        async lockById(id) { return db("rooms").select("id").where({ id }).forUpdate().first(); },
        async create(data) {
            const [row] = await db("rooms").insert({ building_id: data.buildingId, name: data.name, capacity: data.capacity }).returning("id");
            return this.findById(row.id);
        }
    };
}
module.exports = { createKnexRoomsRepository };
