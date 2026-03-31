const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('render blueprint contains worker setup and required env vars', () => {
    const renderPath = path.join(__dirname, '..', 'render.yaml');
    const content = fs.readFileSync(renderPath, 'utf8');

    assert.match(content, /type:\s*worker/);
    assert.match(content, /env:\s*node/);
    assert.match(content, /autoDeploy:\s*true/);
    assert.match(content, /buildCommand:\s*npm ci/);
    assert.match(content, /key:\s*BOT_TOKEN/);
    assert.match(content, /key:\s*DB_PATH/);
    assert.match(content, /key:\s*PDF_OUTPUT_DIR/);
    assert.doesNotMatch(content, /PUPPETEER_CACHE_DIR/);
    assert.doesNotMatch(content, /dockerfilePath/);
});

test('package manifest uses direct PDF dependencies without Puppeteer', () => {
    const packagePath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    assert.equal(typeof pkg.dependencies.pdfkit, 'string');
    assert.equal(pkg.dependencies.puppeteer, undefined);
    assert.equal(pkg.dependencies['puppeteer-core'], undefined);
    assert.equal(pkg.dependencies.handlebars, undefined);
    assert.equal(pkg.dependencies['arabic-persian-reshaper'], undefined);
    assert.equal(pkg.dependencies['bidi-js'], undefined);
});

test('database initialization creates required tables', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-db-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    process.env.DB_PATH = dbPath;
    const { initDB, getDB } = require('../src/db');

    await initDB();
    const db = await getDB();
    const row = await db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    assert.equal(row.name, 'users');
});
