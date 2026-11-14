const { toBuildingResponse } = require("./buildings.mapper");
const { toRoomResponse } = require("../rooms/rooms.mapper");
function createBuildingsController(service) {
    return {
        async update(req, res) { res.json(toBuildingResponse(await service.updateBuilding(req.validated.params.id, req.validated.body))); },
        async delete(req, res) { await service.deleteBuilding(req.validated.params.id); res.status(204).end(); },
        async list(req, res) { res.json((await service.getAllBuildings()).map(toBuildingResponse)); },
        async get(req, res) { res.json(toBuildingResponse(await service.getBuildingById(req.validated.params.id))); },
        async rooms(req, res) { res.json((await service.getBuildingRooms(req.validated.params.id)).map(toRoomResponse)); },
        async create(req, res) {
            const building = await service.createBuilding(req.validated.body);
            res.status(201).location(`/api/buildings/${building.id}`).json(toBuildingResponse(building));
        }
    };
}
module.exports = { createBuildingsController };
