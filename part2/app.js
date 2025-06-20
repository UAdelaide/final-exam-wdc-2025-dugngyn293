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

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);
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

app.get('/owner-dashboard.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'owner-dashboard.html'));
});

app.get('/walker-dashboard.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'walker-dashboard.html'));}
    // Static files
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