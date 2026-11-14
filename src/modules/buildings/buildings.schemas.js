const { z } = require("zod");
const idParams = z.object({ id: z.coerce.number().int().positive() });
const createBuildingBody = z.object({ name: z.string().trim().min(1).max(100), address: z.string().trim().min(3).max(200) }).strict();
const updateBuildingBody = createBuildingBody.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field");
module.exports = { idParams, createBuildingBody, updateBuildingBody };
