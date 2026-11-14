const { NotFoundError } = require("../../errors/AppError");

function createRoomsService({ roomsRepository, buildingsRepository }) {
    async function getAllRooms() {
        return roomsRepository.findAll();
    }

    async function getRoomById(id) {
        const room = await roomsRepository.findById(id);
        if (!room) {
            throw new NotFoundError("Room");
        }
        return room;
    }

    async function createRoom(input) {
        if (!await buildingsRepository.findById(input.buildingId)) throw new NotFoundError("Building");
        return roomsRepository.create(input);
    }
    async function updateRoom(id, input) {
        await getRoomById(id);
        if (input.buildingId !== undefined && !await buildingsRepository.findById(input.buildingId)) throw new NotFoundError("Building");
        return roomsRepository.update(id, input);
    }
    async function deleteRoom(id) {
        if (!await roomsRepository.delete(id)) throw new NotFoundError("Room");
    }
    return { getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom };
}

module.exports = { createRoomsService };

