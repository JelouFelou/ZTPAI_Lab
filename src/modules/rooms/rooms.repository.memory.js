const defaultRooms = [
    { id: 1, name: "A101", capacity: 30 },
    { id: 2, name: "A102", capacity: 20 },
    { id: 3, name: "B201", capacity: 50 },
    { id: 4, name: "B202", capacity: 15 }
];

function createInMemoryRoomsRepository(initialRooms = defaultRooms, buildingsRepository) {
    const rooms = structuredClone(initialRooms);
    rooms.forEach(room => { room.buildingId ??= room.id <= 2 ? 1 : 2; });
    let nextId = Math.max(0, ...rooms.map(r => r.id)) + 1;
    let countReservations = async () => 0;
    if (buildingsRepository) buildingsRepository.setRoomsCounter(async id => rooms.filter(r => r.buildingId === id).length);
    const enrich = async room => {
        if (!room) return null;
        const building = buildingsRepository ? await buildingsRepository.findById(room.buildingId) : null;
        return { ...structuredClone(room), building: building ? { id: building.id, name: building.name } : undefined };
    };

    return {
        setReservationsCounter(fn) { countReservations = fn; },
        async update(id, input) {
            const room = rooms.find(r => r.id === id);
            if (!room) return null;
            const updated = { ...room, ...input };
            if (rooms.some(r => r.id !== id && r.name === updated.name && r.buildingId === updated.buildingId)) {
                const { ConflictError } = require("../../errors/AppError");
                throw new ConflictError("Resource already exists", "UNIQUE_VIOLATION");
            }
            Object.assign(room, input);
            return enrich(room);
        },
        async delete(id) {
            const index = rooms.findIndex(r => r.id === id);
            if (index < 0) return false;
            if (await countReservations(id)) {
                const { ConflictError } = require("../../errors/AppError");
                throw new ConflictError("Room still has reservations", "REFERENCE_CONFLICT");
            }
            rooms.splice(index, 1);
            return true;
        },
        async findAll() {
            return Promise.all(rooms.map(enrich));
        },
        async findById(id) {
            const room = rooms.find(r => r.id === id);
            return enrich(room);
        },
        async lockById(id) { return this.findById(id); },
        async findByBuildingId(id) { return Promise.all(rooms.filter(r => r.buildingId === id).map(enrich)); },
        async create(input) {
            if (rooms.some(r => r.buildingId === input.buildingId && r.name === input.name)) {
                const { ConflictError } = require("../../errors/AppError");
                throw new ConflictError("Resource already exists", "UNIQUE_VIOLATION");
            }
            const room = { ...input, id: nextId++ };
            rooms.push(room);
            return enrich(room);
        }
    };
}

module.exports = { createInMemoryRoomsRepository };

