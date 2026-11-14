function mapBuilding(row) {
    return row ? { id: row.id, name: row.name, address: row.address,
        createdAt: row.created_at, roomsCount: Number(row.rooms_count ?? 0) } : null;
}
function createKnexBuildingsRepository(db) {
    const query = () => db("buildings as b").leftJoin("rooms as r", "r.building_id", "b.id")
        .select("b.*").count("r.id as rooms_count").groupBy("b.id");
    return {
        async update(id, input) {
            const rows = await db("buildings").where({ id }).update({ name: input.name, address: input.address }).returning("id");
            return rows.length ? this.findById(id) : null;
        },
        async delete(id) { return Boolean(await db("buildings").where({ id }).delete()); },
        async findAll() { return (await query().orderBy("b.id")).map(mapBuilding); },
        async findById(id) { return mapBuilding(await query().where("b.id", id).first()); },
        async create(data) {
            const [row] = await db("buildings").insert({ name: data.name, address: data.address }).returning("*");
            return mapBuilding(row);
        }
    };
}
module.exports = { createKnexBuildingsRepository };
