import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '~/lib/env';
import * as schema from './schema/index';

// Single shared pool. In dev this connects through the SSH tunnel to the
// `Evergreen` production DB (see README). There is no separate dev DB.
const pool = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 10 });

export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };
