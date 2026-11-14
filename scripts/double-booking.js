const db = require("../src/db/knex");
const { config } = require("../src/config");
async function runDoubleBooking({ baseUrl = config.BASE_URL, roomId = config.ROOM_ID, startTime = config.START_TIME, endTime = config.END_TIME, accessToken = config.ACCESS_TOKEN, database = db } = {}) {
    if (!accessToken) throw new Error("Set ACCESS_TOKEN to an accessToken returned by /api/auth/login");
    const body = { roomId, participants: 5, startTime, endTime };
    const results = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
        const response = await fetch(`${baseUrl}/api/reservations`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body)
        });
        return { request: index + 1, status: response.status, body: await response.json() };
    }));
    const [{ count }] = await database("reservations").where({ room_id: roomId, status: "CONFIRMED" })
        .where("start_time", "<", endTime).where("end_time", ">", startTime).count("id as count");
    console.log(JSON.stringify({ statuses: results.map(r => r.status), confirmed: Number(count) }, null, 2));
    return { results, confirmed: Number(count) };
}
if (require.main === module) runDoubleBooking().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.destroy());
module.exports = { runDoubleBooking };
