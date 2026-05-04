require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

mongoose.connect(process.env.MONGO_URI).then(() => console.log("SYSTEM: Core Online"));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String, user: String, text: String, image: String,
    isAdmin: { type: Boolean, default: false },
     timestamp: { type: Date, default: Date.now }
}));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
     resave: true, saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24, secure: false }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
io.engine.use(sessionMiddleware);

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        let user = await User.findOne({ username });
        if (!user) { user = new User({ username, password }); await user.save(); }
         else if (user.password !== password) return res.status(401).send();
        req.session.username = user.username;
        req.session.isAdmin = (password === 'ROOT_ADMIN');
        res.json({ success: true, username: user.username, isAdmin: req.session.isAdmin });
    } catch (err) { res.status(500).send(); }
});

app.get('/api/me', (req, res) => {
    if (req.session.username) res.json({ username: req.session.username, isAdmin: req.session.isAdmin });
    else res.status(401).send();
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

const activeUsers = {};
io.on('connection', (socket) => {
    const session = socket.request.session;