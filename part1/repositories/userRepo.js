const { pool } = require('../database/pool');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const SALT_ROUNDS = 10;

// Find user by ID
async function findById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
}

// Find user by email
async function findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
}

async function findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
}

async function create({ username, email = '', password, google_id = null, profile_image_url = null }) {
    let finalPassword;

    if (password) {
        // If raw password provided, hash it
        finalPassword = await bcrypt.hash(password, SALT_ROUNDS);
    } else {
        // For OAuth users, generate random password hash
        const randomPassword = crypto.randomBytes(8).toString('hex');
        finalPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);
    }

    const [result] = await pool.query(
        `INSERT INTO users (username, email, password, google_id, profile_image_url)
     VALUES (?, ?, ?, ?, ?)`,
        [username, email, finalPassword, google_id, profile_image_url]
    );

    return {
        id: result.insertId,
        username,
        email,
        google_id,
        profile_image_url,
    };
}
// Verify user login (check by email or username)
async function verifyPassword(identifier, candidatePassword) {
    // The 'identifier' can be either an email or a username.
    // We construct a query that safely checks both columns.
    const query = `
    SELECT * FROM users
    WHERE email = ? OR username = ?
  `;

    const [rows] = await pool.query(query, [identifier, identifier]);
    const user = rows[0];

    if (!user || !user.password) {
        console.log('❌ User not found or has no password');
        return null;
    }

    const ok = await bcrypt.compare(candidatePassword, user.password);
    console.log('✅ bcrypt.compare result:', ok);
    return ok ? user : null;
}

async function updateUserProfile(username, newPassword, avatarUrl) {
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const [result] = await pool.query(
        `UPDATE users
     SET password = ?, profile_image_url = ?
     WHERE username = ?`,
        [hashedPassword, avatarUrl, username]
    );

    if (result.affectedRows === 0) {
        throw new Error("User not found or not updated.");
    }

    return result;
}

module.exports = {
    findById,
    findByEmail,
    findByUsername,
    create,
    verifyPassword,
    updateUserProfile,
};