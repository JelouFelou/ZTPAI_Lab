const { toUserResponse } = require("./auth.mapper");
function createAuthController(service) {
    return {
        async register(req, res) { res.status(201).json(toUserResponse(await service.register(req.validated.body))); },
        async login(req, res) { res.json(await service.login(req.validated.body)); },
        async me(req, res) { res.json(toUserResponse(await service.me(req.user))); }
    };
}
module.exports = { createAuthController };
