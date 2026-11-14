const { z } = require("zod");

const idParams = z.object({
    id: z.coerce.number().int().positive()
});

const createRoomBody = z.object({
    buildingId: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    capacity: z.number().int().positive()
}).strict();
const updateRoomBody = createRoomBody.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field");
module.exports = { idParams, createRoomBody, updateRoomBody };

