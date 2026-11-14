const defaultReservations = [
    {
        id: 100,
        roomId: 1,
        userId: 2,
        participants: 5,
        startTime: "2025-01-01T10:00:00.000Z",
        endTime: "2025-01-01T12:00:00.000Z",
        status: "CONFIRMED",
        createdAt: "2024-12-31T08:00:00.000Z",
        cancelledAt: null,
        internalNote: "past reservation seed"
    }
];

function createInMemoryReservationsRepository(seedReservations = defaultReservations, roomsRepository, usersRepository) {
    const reservations = structuredClone(seedReservations);
    if (roomsRepository) roomsRepository.setReservationsCounter(async id => reservations.filter(r => r.roomId === id).length);
    let nextId = Math.max(0, ...reservations.map(r => r.id)) + 1;
    const enrich = async reservation => {
        if (!reservation) return null;
        const room = roomsRepository ? await roomsRepository.findById(reservation.roomId) : undefined;
        const user = usersRepository ? await usersRepository.findById(reservation.userId) : undefined;
        return { ...structuredClone(reservation), user: user ? { id: user.id, email: user.email } : undefined,
            room: room ? { id: room.id, name: room.name, building: room.building } : undefined };
    };

    return {
        async findAll({ roomId, buildingId, userId, status, from, to, page = 1, limit = 20, sort = "startTime" } = {}) {
            let result = await Promise.all(reservations.map(enrich));
            if (roomId !== undefined) {
                result = result.filter(r => r.roomId === roomId);
            }
            if (buildingId !== undefined) result = result.filter(r => r.room?.building?.id === buildingId);
            if (userId !== undefined) result = result.filter(r => r.userId === userId);
            if (status) result = result.filter(r => r.status === status);
            if (from) result = result.filter(r => new Date(r.endTime) > new Date(from));
            if (to) result = result.filter(r => new Date(r.startTime) < new Date(to));
            const field = sort.replace(/^-/, "");
            const direction = sort.startsWith("-") ? -1 : 1;
            const value = r => field === "participants" ? r[field] : new Date(r[field]).getTime();
            result.sort((a, b) => direction * (value(a) - value(b)) || a.id - b.id);
            return { items: result.slice((page - 1) * limit, page * limit), total: result.length };
        },
        async findById(id) {
            const res = reservations.find(r => r.id === id);
            return enrich(res);
        },
        async findActiveByRoomId(roomId) {
            return structuredClone(reservations.filter(r => r.roomId === roomId && r.status === "CONFIRMED"));
        },
        async create(data) {
            const newRes = {
                id: nextId++,
                ...data,
                status: "CONFIRMED",
                createdAt: new Date().toISOString(),
                cancelledAt: null,
                internalNote: "created via API v2"
            };
            reservations.push(newRes);
            return enrich(newRes);
        },
        async update(id, updates) {
            const index = reservations.findIndex(r => r.id === id);
            if (index === -1) return null;
            reservations[index] = { ...reservations[index], ...updates };
            return enrich(reservations[index]);
        }
    };
}

module.exports = { createInMemoryReservationsRepository };

