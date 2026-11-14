const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const file = 'src/modules/reservations/reservations.service.js';
const original = fs.readFileSync(file, 'utf8');
const correct = 'start < bEnd && bStart < end';
if (!original.includes(correct)) throw new Error('Expected overlap rule not found');
try {
    fs.writeFileSync(file, original.replace(correct, 'start <= bEnd && bStart <= end'));
    console.log('MUTATION: < changed to <= in overlap rule. Touching intervals should fail.');
    const result = spawnSync(process.execPath, ['node_modules/jest/bin/jest.js', '--runInBand', 'tests/unit/reservations.service.test.js'], { encoding: 'utf8' });
    process.stdout.write(result.stdout || ''); process.stdout.write(result.stderr || '');
    if (result.status === 0 || result.status === null) throw new Error('Mutation was not detected');
    console.log('PASS: tests detected the intentional defect. Restoring correct source.');
} finally { fs.writeFileSync(file, original); }
