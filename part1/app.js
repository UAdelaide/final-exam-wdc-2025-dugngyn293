const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
const usersRouter = require('./routes/users');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const bcrypt = require('bcrypt');
const session = require('express-session');
const pool = require('./database/pool');

dotenv.config();

const app = express();

// Middleware cơ bản
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(logger('dev'));

// Session config
app.use(session({
    secret: '9f3ba7815c2e4cf49a6d5bfa6f8d1283',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set true if using HTTPS
}));

// Middleware kiểm tra đăng nhập
function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.redirect('/auth.html');
}

// 👉 Chặn truy cập trực tiếp file HTML nếu chưa login
app.use((req, res, next) => {
    if (
        req.url.endsWith('.html') &&
        !req.session?.user &&
        req.url !== '/auth.html'
    ) {
        return res.redirect('/auth.html');
    }
    next();
});


// Router người dùng
app.use('/users', usersRouter);

// -----------------------------
// 🔐 AUTH ROUTES
// -----------------------------

app.get('/check-auth', (req, res) => {
    if (req.session?.user) {
        res.json({
            authenticated: true,
            username: req.session.user.username,
            role: req.session.user.role,
            id: req.session.user.id
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.redirect('/auth.html');
    });
});

app.post('/api/signup', async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role)
        return res.status(400).json({ message: 'All fields are required.' });

    try {
        const [existing] = await pool.query('SELECT * FROM Users WHERE username = ? OR email = ?', [username, email]);
        if (existing.length > 0)
            return res.status(400).json({ message: 'Username or email already exists.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, role]
        );

        res.status(200).json({ message: 'Signup successful!', userId: result.insertId });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password)
        return res.status(400).json({ message: 'Username/email and password are required.' });

    try {
        const [users] = await pool.query('SELECT * FROM Users WHERE username = ? OR email = ?', [identifier, identifier]);
        if (users.length === 0) return res.status(400).json({ message: 'Invalid credentials.' });

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(400).json({ message: 'Invalid credentials.' });

        req.session.user = { id: user.user_id, username: user.username, role: user.role };
        res.status(200).json({ message: 'Login successful', userId: user.user_id, role: user.role });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) return res.status(400).json({ message: 'Missing fields' });

    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        const [result] = await pool.query('UPDATE Users SET password_hash = ? WHERE username = ?', [hashed, username]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Password reset error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/add-dog', async (req, res) => {
    const { name, size } = req.body;
    const owner_id = req.session?.user?.id;

    if (!owner_id || !name || !size) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['small', 'medium', 'large'].includes(size)) {
        return res.status(400).json({ error: 'Invalid size value' });
    }

    try {
        const imgRes = await fetch('https://dog.ceo/api/breeds/image/random');
        const imgData = await imgRes.json();
        const image_url = imgData?.message || `https://loremflickr.com/80/80/dog?random=${Math.floor(Math.random() * 1000)}`;


        const connection = await pool.getConnection();

        const [result] = await connection.query(
            'INSERT INTO Dogs (owner_id, name, size, image_url) VALUES (?, ?, ?, ?)',
            [owner_id, name, size, image_url]
        );

        connection.release();

        res.status(201).json({
            message: 'Dog added successfully',
            dog_id: result.insertId,
            image_url
        });
    } catch (error) {
        console.error('Error adding dog:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/api/my-dogs', async (req, res) => {
    const owner_id = req.session?.user?.id;

    if (!owner_id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const [dogs] = await pool.query(
            'SELECT dog_id, name, size, image_url FROM Dogs WHERE owner_id = ?',
            [owner_id]
        );
        res.json(dogs);
    } catch (err) {
        console.error('Error fetching dogs:', err);
        res.status(500).json({ error: 'Failed to fetch dogs' });
    }
});

app.delete('/api/delete-dog/:id', async (req, res) => {
    const owner_id = req.session?.user?.id;
    const dog_id = req.params.id;

    if (!owner_id) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const [result] = await pool.query(
            'DELETE FROM Dogs WHERE dog_id = ? AND owner_id = ?',
            [dog_id, owner_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Dog not found or not owned by you' });
        }

        res.status(200).json({ message: 'Dog deleted' });
    } catch (err) {
        console.error('Error deleting dog:', err);
        res.status(500).json({ error: 'Failed to delete dog' });
    }
});

app.post('/owner/walk-request', async (req, res) => {
    const owner_id = req.session?.user?.id;
    const { dog_id, datetime, duration, location } = req.body;

    if (!owner_id || !dog_id || !datetime || !duration || !location) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Insert
        await pool.query(
            `INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
             VALUES (?, ?, ?, ?, ?)`,
            [dog_id, datetime, duration, location, 'open']
        );

        // insert into WalkRequestOwners
        res.status(201).json({ message: 'Walk request created successfully' });

    } catch (err) {
        console.error('🚨 Error creating walk request:', err);
        res.status(500).json({ error: 'Failed to create walk request' });
    }
});
app.get('/api/my-walk-requests', async (req, res) => {
    const ownerId = req.session.user?.id;

    if (!ownerId) return res.status(401).json({ message: "Not logged in" });

    try {
        const [requests] = await pool.query(`
      SELECT wr.*, d.name AS dog_name, d.image_url
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      WHERE d.owner_id = ?
      ORDER BY wr.requested_time DESC
    `, [ownerId]);

        for (const req of requests) {
            const [applications] = await pool.query(`
        SELECT wa.application_id, wa.walker_id, u.username, wa.status
        FROM WalkApplications wa
        JOIN Users u ON wa.walker_id = u.user_id
        WHERE wa.request_id = ?
    `, [req.request_id]);

            req.applications = applications;

            // if the request is completed, find the accepted application
            if (req.status === 'completed') {
                const acceptedApp = applications.find(app => app.status === 'completed');
                if (acceptedApp) {
                    req.walker_id = acceptedApp.walker_id;
                }
            }
        }


        res.json(requests);
    } catch (err) {
        console.error('Error loading walk requests:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


// routes/walkRequests.js
app.get('/api/walkrequests/available', async (req, res) => {
    const walkerId = req.session.user?.id;
    if (!walkerId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const [rows] = await pool.query(`
            SELECT
                wr.request_id,
                d.name AS dog_name,
                DATE_FORMAT(wr.requested_time, '%Y-%m-%d') AS date,
                DATE_FORMAT(wr.requested_time, '%H:%i') AS time,
                wr.duration_minutes,
                wr.location,
                wa.status AS application_status,
                wr.status AS walk_status
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            LEFT JOIN WalkApplications wa
                ON wr.request_id = wa.request_id AND wa.walker_id = ?
            WHERE wr.status IN ('open', 'accepted', 'completed')
            ORDER BY wr.requested_time DESC
        `, [walkerId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching walk requests:', err);
        res.status(500).json({ message: 'Failed to fetch walk requests' });
    }
});

app.post('/api/rate-walker', async (req, res) => {
    const ownerId = req.session.user?.id;
    if (!ownerId) return res.status(401).json({ message: 'Not logged in' });

    const { request_id, walker_id, rating, comments } = req.body;

    if (!request_id || !walker_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    try {
        // Insert rating, prevent duplicate per request
        await pool.query(`
            INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
            VALUES (?, ?, ?, ?, ?)
        `, [request_id, walker_id, ownerId, rating, comments]);

        res.status(200).json({ message: 'Rating submitted successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This walk has already been rated.' });
        }
        console.error('Error submitting rating:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


app.post('/api/apply/:requestId', async (req, res) => {
    const requestId = req.params.requestId;
    const walkerId = req.session.user?.id;

    if (!walkerId) {
        return res.status(401).json({ message: 'Not logged in' });
    }

    try {
        await pool.query(
            `INSERT INTO WalkApplications (request_id, walker_id, status)
       VALUES (?, ?, 'pending')`,
            [requestId, walkerId]
        );

        res.status(200).json({ message: 'Application submitted' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ message: 'You have already applied for this walk' });
        } else {
            console.error('Error inserting into WalkApplications:', err);
            res.status(500).json({ message: 'Server error' });
        }
    }
});

app.post('/owner/accept-application', async (req, res) => {
    const { application_id, request_id } = req.body;

    if (!application_id || !request_id) {
        return res.status(400).json({ message: 'Missing data.' });
    }

    try {
        // 1. update the application status to accepted
        await pool.query(`
            UPDATE WalkApplications
            SET status = 'accepted'
            WHERE application_id = ?
        `, [application_id]);

        // 2. reject all other applications for the same request
        await pool.query(`
            UPDATE WalkApplications
            SET status = 'rejected'
            WHERE request_id = ? AND application_id != ?
        `, [request_id, application_id]);

        // 3. update WalkRequest status to accepted
        await pool.query(`
            UPDATE WalkRequests
            SET status = 'accepted'
            WHERE request_id = ?
        `, [request_id]);

        res.json({ message: 'Application accepted!' });
    } catch (err) {
        console.error('Error accepting application:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/complete/:requestId', async (req, res) => {
    const walkerId = req.session.user?.id;
    const requestId = req.params.requestId;

    if (!walkerId) return res.status(401).json({ message: 'Not logged in' });

    try {
        // update the WalkApplications status to completed
        await pool.query(`
            UPDATE WalkApplications
            SET status = 'completed'
            WHERE request_id = ? AND walker_id = ?
        `, [requestId, walkerId]);

        await pool.query(`
            UPDATE WalkRequests
            SET status = 'completed'
            WHERE request_id = ?
        `, [requestId]);

        res.json({ message: 'Walk marked as completed' });
    } catch (err) {
        console.error('Complete error:', err);
        res.status(500).json({ message: 'Failed to complete walk' });
    }
});

app.get('/api/walker-summary', async (req, res) => {
    const walkerId = req.session?.user?.id;

    if (!walkerId) return res.status(401).json({ message: 'Not logged in' });

    try {
        // count completed and pending walks
        const [[completedRow]] = await pool.query(`
            SELECT COUNT(*) AS completed FROM WalkApplications
            WHERE walker_id = ? AND status = 'completed'
        `, [walkerId]);

        const [[pendingRow]] = await pool.query(`
            SELECT COUNT(*) AS pending FROM WalkApplications
            WHERE walker_id = ? AND status = 'pending'
        `, [walkerId]);

        const completed = completedRow.completed;
        const pending = pendingRow.pending;
        const totalEarnings = completed * 300;

        res.json({ completed, pending, totalEarnings });
    } catch (err) {
        console.error('Error fetching summary:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


// Serve public assets BEFORE wildcard route
app.use('/stylesheets', express.static(path.join(__dirname, 'public', 'stylesheets')));
app.use('/Javascripts', express.static(path.join(__dirname, 'public', 'Javascripts')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));


app.get('/auth.html', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'owner' ? '/index.html' : '/walker.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/', ensureAuthenticated, (req, res) => {
    return res.redirect(req.session.user.role === 'owner' ? '/index.html' : '/walker.html');
});

app.get('/index.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/walker.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'walker.html'));
});

// Static files (sau khi xác thực)
app.use('/public', ensureAuthenticated, express.static(path.join(__dirname, 'public')));

// -----------------------------
// 404 và error handler
// -----------------------------

app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).send('Internal Server Error');
});

module.exports = app;