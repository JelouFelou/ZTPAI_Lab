// Uses the existing Git credential manager. Never prints credentials.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
async function main() {
    const [method = 'GET', endpoint = '/repos/JelouFelou/ZTPAI_Lab', bodyFile] = process.argv.slice(2);
    const credentials = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
    if (credentials.status !== 0) throw new Error('Git credential manager did not supply GitHub credentials.');
    const fields = Object.fromEntries(credentials.stdout.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
    if (!fields.password) throw new Error('No GitHub credential available');
    const response = await fetch('https://api.github.com' + endpoint, { method,
        headers: { Authorization: `Bearer ${fields.password}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        body: bodyFile ? fs.readFileSync(bodyFile, 'utf8') : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${result.message}`);
    console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
