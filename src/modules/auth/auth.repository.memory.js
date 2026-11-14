const { ConflictError } = require("../../errors/AppError");
function createInMemoryUsersRepository(initialUsers = []) {
    const users = structuredClone(initialUsers);
    let nextId = Math.max(0, ...users.map(user => user.id)) + 1;
    return {
        async findByEmail(email) { return structuredClone(users.find(user => user.email === email) || null); },
        async findById(id) { return structuredClone(users.find(user => user.id === id) || null); },
        async create(input) {
            if (users.some(user => user.email === input.email)) throw new ConflictError("Email is already taken", "EMAIL_TAKEN");
            const user = { id: nextId++, email: input.email, passwordHash: input.passwordHash, role: "USER", createdAt: new Date().toISOString() };
            users.push(user);
            return structuredClone(user);
        }
    };
}
module.exports = { createInMemoryUsersRepository };
