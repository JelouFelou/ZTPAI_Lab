const { NotFoundError } = require("../../errors/AppError");
function createBuildingsService({ buildingsRepository, roomsRepository }) {
    async function getBuildingById(id) {
        const building = await buildingsRepository.findById(id);
        if (!building) throw new NotFoundError("Building");
        return building;
    }
    return {
        getAllBuildings: () => buildingsRepository.findAll(),
        getBuildingById,
        createBuilding: input => buildingsRepository.create(input),
        async updateBuilding(id, input) {
            const building = await buildingsRepository.update(id, input);
            if (!building) throw new NotFoundError("Building");
            return building;
        },
        async deleteBuilding(id) {
            if (!await buildingsRepository.delete(id)) throw new NotFoundError("Building");
        },
        async getBuildingRooms(id) {
            await getBuildingById(id);
            return roomsRepository.findByBuildingId(id);
        }
    };
}
module.exports = { createBuildingsService };
