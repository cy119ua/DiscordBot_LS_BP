// utils/db.js
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

class Client {
  constructor(options = {}) {
    // совместимость с прежним конструктором new Client()
    this.file = options.file || path.resolve(process.cwd(), 'data', 'db.json');
    this._ready = this._init();
  }

  async _init() {
    const dir = path.dirname(this.file);
    await fsp.mkdir(dir, { recursive: true });
    try {
      await fsp.access(this.file, fs.constants.F_OK);
    } catch {
      await fsp.writeFile(this.file, JSON.stringify({}), 'utf8');
    }
  }

  async _readAll() {
    await this._ready;
    const raw = await fsp.readFile(this.file, 'utf8');
    try { return JSON.parse(raw || '{}'); } catch { return {}; }
  }

  async _writeAll(obj) {
    const tmp = this.file + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
    await fsp.rename(tmp, this.file);
  }

  // Совместимые методы с @replit/database:
  async get(key) {
    const db = await this._readAll();
    return db[key];
  }

  async set(key, value) {
    const db = await this._readAll();
    db[key] = value;
    await this._writeAll(db);
    return value;
  }

  async delete(key) {
    const db = await this._readAll();
    delete db[key];
    await this._writeAll(db);
  }

  // list(prefix) из @replit/database возвращает объект по префиксу ключей
  async list(prefix = '') {
    const db = await this._readAll();
    const out = {};
    for (const k of Object.keys(db)) {
      if (k.startsWith(prefix)) out[k] = db[k];
    }
    return out;
  }
}

module.exports = { Client };
