const { ConflictError } = require("../../errors/AppError");
function createInMemoryBuildingsRepository(initial = [
    { id: 1, name: "Budynek A", address: "Warszawska 24" },
    { id: 2, name: "Budynek B", address: "Szlak 1" }
]) {
    const buildings = structuredClone(initial);
    let nextId = Math.max(0, ...buildings.map(b => b.id)) + 1;
    let countRooms = async () => 0;
    const enrich = async b => b ? { ...structuredClone(b), roomsCount: await countRooms(b.id) } : null;
    return {
        async update(id, input) {
            const building = buildings.find(b => b.id === id);
            if (!building) return null;
            if (input.name && buildings.some(b => b.id !== id && b.name === input.name)) throw new ConflictError("Resource already exists", "UNIQUE_VIOLATION");
            Object.assign(building, input);
            return enrich(building);
        },
        async delete(id) {
            const index = buildings.findIndex(b => b.id === id);
            if (index < 0) return false;
            if (await countRooms(id)) throw new ConflictError("Building still contains rooms", "REFERENCE_CONFLICT");
            buildings.splice(index, 1);
            return true;
        },
        setRoomsCounter(fn) { countRooms = fn; },
        async findAll() { return Promise.all(buildings.map(enrich)); },
        async findById(id) { return enrich(buildings.find(b => b.id === id)); },
        async create(input) {
            if (buildings.some(b => b.name === input.name)) throw new ConflictError("Resource already exists", "UNIQUE_VIOLATION");
            const building = { ...input, id: nextId++ };
            buildings.push(building);
            return enrich(building);
        }
    };
}
module.exports = { createInMemoryBuildingsRepository };
