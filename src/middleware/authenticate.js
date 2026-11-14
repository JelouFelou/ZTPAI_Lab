const jwt = require("jsonwebtoken");
const { UnauthorizedError } = require("../errors/AppError");
function createAuthenticate(config) {
    return (req, res, next) => {
        const header = req.get("Authorization");
        if (!header) return next(new UnauthorizedError());
        const match = /^Bearer ([^\s]+)$/i.exec(header);
        if (!match) return next(new UnauthorizedError("Expected Authorization: Bearer <token>", "INVALID_TOKEN"));
        try {
            const payload = jwt.verify(match[1], config.JWT_SECRET, { algorithms: ["HS256"] });
            if (typeof payload !== "object" || !/^[1-9]\d*$/.test(payload.sub || "") ||
                !Number.isSafeInteger(Number(payload.sub)) || !["USER", "ADMIN"].includes(payload.role) ||
                !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) {
                throw new Error("Invalid claims");
            }
            req.user = { id: Number(payload.sub), role: payload.role };
            return next();
        } catch (error) {
            return next(error.name === "TokenExpiredError"
                ? new UnauthorizedError("Token expired", "TOKEN_EXPIRED")
                : new UnauthorizedError("Invalid token", "INVALID_TOKEN"));
        }
    };
}
module.exports = { createAuthenticate };
