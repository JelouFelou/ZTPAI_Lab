const { Router } = require("express");
const validate = require("../../middleware/validate");
const { idParams, createBuildingBody, updateBuildingBody } = require("./buildings.schemas");
const { authorize } = require("../../middleware/authorize");
function createBuildingsRouter(controller) {
    const router = Router();
    router.get("/", controller.list);
    router.get("/:id", validate({ params: idParams }), controller.get);
    router.get("/:id/rooms", validate({ params: idParams }), controller.rooms);
    router.post("/", authorize("ADMIN"), validate({ body: createBuildingBody }), controller.create);
    router.patch("/:id", authorize("ADMIN"), validate({ params: idParams, body: updateBuildingBody }), controller.update);
    router.delete("/:id", authorize("ADMIN"), validate({ params: idParams }), controller.delete);
    return router;
}
module.exports = { createBuildingsRouter };
