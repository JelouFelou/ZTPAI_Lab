const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { UnauthorizedError } = require("../../errors/AppError");
function createAuthService({ usersRepository, config }) {
    const dummyHash = bcrypt.hashSync("dummy-password-never-used", config.BCRYPT_COST);
    return {
        async register(input) {
            const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_COST);
            // UNIQUE resolves concurrent registrations; the error handler maps 23505.
            return usersRepository.create({ email: input.email, passwordHash });
        },
        async login(input) {
            const user = await usersRepository.findByEmail(input.email);
            const validPassword = await bcrypt.compare(input.password, user?.passwordHash || dummyHash);
            if (!user || !validPassword) throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
            return {
                accessToken: jwt.sign({ role: user.role }, config.JWT_SECRET, {
                    algorithm: "HS256", subject: String(user.id), expiresIn: config.JWT_EXPIRES_IN
                }),
                tokenType: "Bearer", expiresIn: config.JWT_EXPIRES_IN
            };
        },
        async me(currentUser) {
            const user = await usersRepository.findById(currentUser.id);
            if (!user) throw new UnauthorizedError("Account is unavailable");
            return user;
        }
    };
}
module.exports = { createAuthService };
