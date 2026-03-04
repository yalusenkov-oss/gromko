#!/usr/bin/env tsx
import 'dotenv/config';
import { execute, closeDb } from './db.js';
async function main() {
    const rows = await execute("UPDATE users SET role = 'admin' WHERE email = 'adminlusenkov@gmail.com'");
    console.log('Updated', rows, 'user(s) to admin role');
    await closeDb();
}
main().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=promote-admin.js.map