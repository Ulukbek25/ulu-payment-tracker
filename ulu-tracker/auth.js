import crypto from 'node:crypto';
import pg from 'pg';
const {Pool}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for secure authentication');
if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<14)throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (14+ characters)');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});
const hash=p=>crypto.scryptSync(p, 'ulu-auth-v6',64).toString('hex');
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
const same=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function init(){await pool.query(`CREATE TABLE IF NOT EXISTS ulu_users(id BIGSERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,admin BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS ulu_sessions(token_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES ulu_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);`);const {rows}=await pool.query('SELECT id FROM ulu_users WHERE username=$1',[process.env.ADMIN_USERNAME]);if(!rows.length)await pool.query('INSERT INTO ulu_users(username,password_hash,admin) VALUES($1,$2,TRUE)',[process.env.ADMIN_USERNAME,hash(process.env.ADMIN_PASSWORD)]);}
export async function current(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ulu_session='))?.slice(12);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const {rows}=await pool.query('SELECT u.id,u.username,u.admin FROM ulu_sessions s JOIN ulu_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[hashToken(token)]);return rows[0]||null;}
export async function login(username,password){const {rows}=await pool.query('SELECT * FROM ulu_users WHERE username=$1 AND active=true',[username]);if(!rows.length||!same(rows[0].password_hash,hash(password)))return null;const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO ulu_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),rows[0].id]);return {token,user:{username:rows[0].username,admin:rows[0].admin}};}
export async function logout(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ulu_session='))?.slice(12);if(token)await pool.query('DELETE FROM ulu_sessions WHERE token_hash=$1',[hashToken(token)]);}
export async function users(){const {rows}=await pool.query('SELECT id,username,admin,active,created_at FROM ulu_users ORDER BY id');return rows;}
export async function createUser(username,password){const {rows}=await pool.query('INSERT INTO ulu_users(username,password_hash) VALUES($1,$2) RETURNING id,username,active',[username,hash(password)]);return rows[0];}
export async function setActive(id,active){const {rows}=await pool.query('UPDATE ulu_users SET active=$2 WHERE id=$1 AND admin=false RETURNING id',[id,active]);if(rows.length&&!active)await pool.query('DELETE FROM ulu_sessions WHERE user_id=$1',[id]);return !!rows.length;}
export async function setPassword(id,password){const {rows}=await pool.query('UPDATE ulu_users SET password_hash=$2 WHERE id=$1 AND admin=false RETURNING id',[id,hash(password)]);if(rows.length)await pool.query('DELETE FROM ulu_sessions WHERE user_id=$1',[id]);return !!rows.length;}
