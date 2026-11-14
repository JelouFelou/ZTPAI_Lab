const { Router, json } = require("express");
const validate = require("../../middleware/validate");
const { registerBody, loginBody } = require("./auth.schemas");
function createPublicAuthRouter(controller) {
    const router = Router();
    router.post("/register", json(), validate({ body: registerBody }), controller.register);
    router.post("/login", json(), validate({ body: loginBody }), controller.login);
    return router;
}
module.exports = { createPublicAuthRouter };
