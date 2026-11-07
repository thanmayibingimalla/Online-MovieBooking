require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'thanmayi_cinemas',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'thanmayi-development-secret-change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 4 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireLogin = (req, res, next) => req.session.user ? next() : res.status(401).json({ message: 'Please log in first.' });
const requireAdmin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access required.' });

async function initializeAdmin() {
  const [rows] = await pool.query('SELECT user_id FROM users WHERE email=?', ['admin@thanmayi.com']);
  if (!rows.length) {
    const hash = await bcrypt.hash('Admin@123', 10);
    await pool.query(
      'INSERT INTO users(name,email,password,phone,role) VALUES(?,?,?,?,?)',
      ['Thanmayi Admin', 'admin@thanmayi.com', hash, '9999999999', 'admin']
    );
  }
}

app.get('/api/me', (req,res) => res.json({ user: req.session.user || null }));

app.post('/api/register', asyncRoute(async (req,res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({message:'Enter your name, email and a password of at least 6 characters.'});
  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query('INSERT INTO users(name,email,password,phone) VALUES(?,?,?,?)',[name.trim(),email.trim().toLowerCase(),hash,phone || null]);
    req.session.user = { user_id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role:'customer' };
    res.json({message:'Account created successfully.',user:req.session.user});
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({message:'This email is already registered.'});
    throw e;
  }
}));

app.post('/api/login', asyncRoute(async (req,res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE email=?',[String(email || '').trim().toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(password || '', rows[0].password))) return res.status(401).json({message:'Incorrect email or password.'});
  const u = rows[0];
  req.session.user = { user_id:u.user_id, name:u.name, email:u.email, role:u.role };
  res.json({message:'Welcome back!',user:req.session.user});
}));

app.post('/api/logout', (req,res) => req.session.destroy(() => res.json({message:'Logged out.'})));

app.get('/api/movies', asyncRoute(async (req,res) => {
  const [rows] = await pool.query('SELECT * FROM movies ORDER BY movie_id DESC');
  res.json(rows);
}));

app.get('/api/movies/:id/shows', asyncRoute(async (req,res) => {
  const [rows] = await pool.query(
    `SELECT s.*, m.title, m.poster_url, t.city
     FROM shows s JOIN movies m ON m.movie_id=s.movie_id
     JOIN theaters t ON t.theater_id=s.theater_id
     WHERE s.movie_id=? AND s.show_date >= CURDATE()
     ORDER BY s.show_date,s.show_time`, [req.params.id]);
  res.json(rows);
}));

app.get('/api/shows/:id/seats', asyncRoute(async (req,res) => {
  const [shows] = await pool.query('SELECT * FROM shows WHERE show_id=?',[req.params.id]);
  if (!shows.length) return res.status(404).json({message:'Show not found.'});
  const [taken] = await pool.query(
    `SELECT bs.seat_number FROM booking_seats bs
     JOIN bookings b ON b.booking_id=bs.booking_id
     WHERE bs.show_id=? AND b.booking_status='CONFIRMED'`,[req.params.id]);
  res.json({show:shows[0], booked:taken.map(x=>x.seat_number)});
}));

app.post('/api/bookings', requireLogin, asyncRoute(async (req,res) => {
  const showId = Number(req.body.show_id);
  const seats = [...new Set((req.body.seats || []).map(s => String(s).toUpperCase()))];
  const valid = /^([A-F])(0[1-8]|0[9]|10)$/;
  if (!showId || !seats.length || seats.some(s => !valid.test(s))) return res.status(400).json({message:'Select valid seats.'});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [shows] = await conn.query('SELECT * FROM shows WHERE show_id=? FOR UPDATE',[showId]);
    if (!shows.length) throw new Error('Show not found.');
    const [existing] = await conn.query(
      `SELECT bs.seat_number FROM booking_seats bs JOIN bookings b ON b.booking_id=bs.booking_id
       WHERE bs.show_id=? AND b.booking_status='CONFIRMED' AND bs.seat_number IN (?)`,
      [showId,seats]);
    if (existing.length) throw new Error(`Seat(s) already booked: ${existing.map(x=>x.seat_number).join(', ')}`);
    const total = Number(shows[0].ticket_price) * seats.length;
    const [booking] = await conn.query(
      'INSERT INTO bookings(user_id,show_id,seats,total_amount,booking_status) VALUES(?,?,?,?,?)',
      [req.session.user.user_id,showId,seats.length,total,'CONFIRMED']);
    for (const seat of seats) {
      await conn.query('INSERT INTO booking_seats(booking_id,show_id,seat_number) VALUES(?,?,?)',[booking.insertId,showId,seat]);
    }
    await conn.commit();
    res.json({message:'Tickets booked successfully!',booking_id:booking.insertId,total_amount:total,seats});
  } catch (e) {
    await conn.rollback();
    res.status(409).json({message:e.message || 'Booking failed.'});
  } finally { conn.release(); }
}));

app.get('/api/my-bookings', requireLogin, asyncRoute(async (req,res) => {
  const [rows] = await pool.query(
    `SELECT b.booking_id,b.seats,b.total_amount,b.booking_status,b.booking_date,
      m.title,s.show_date,s.show_time,s.theater_name,
      GROUP_CONCAT(bs.seat_number ORDER BY bs.seat_number SEPARATOR ', ') AS seat_list
     FROM bookings b JOIN shows s ON s.show_id=b.show_id
     JOIN movies m ON m.movie_id=s.movie_id
     LEFT JOIN booking_seats bs ON bs.booking_id=b.booking_id
     WHERE b.user_id=? GROUP BY b.booking_id ORDER BY b.booking_id DESC`,
    [req.session.user.user_id]);
  res.json(rows);
}));

app.get('/api/admin/summary', requireAdmin, asyncRoute(async (req,res) => {
  const [[movies]] = await pool.query('SELECT COUNT(*) count FROM movies');
  const [[shows]] = await pool.query('SELECT COUNT(*) count FROM shows');
  const [[bookings]] = await pool.query('SELECT COUNT(*) count FROM bookings');
  res.json({movies:movies.count,shows:shows.count,bookings:bookings.count});
}));

app.post('/api/admin/movies', requireAdmin, asyncRoute(async (req,res) => {
  const {title,genre,language,duration,release_date,poster_url,description} = req.body;
  if (!title || !duration) return res.status(400).json({message:'Movie title and duration are required.'});
  const [r] = await pool.query(
    'INSERT INTO movies(title,genre,language,duration,release_date,poster_url,description) VALUES(?,?,?,?,?,?,?)',
    [title,genre||null,language||null,Number(duration),release_date||null,poster_url||null,description||null]);
  res.json({message:'Movie added.',movie_id:r.insertId});
}));

app.delete('/api/admin/movies/:id', requireAdmin, asyncRoute(async (req,res) => {
  await pool.query('DELETE FROM movies WHERE movie_id=?',[req.params.id]);
  res.json({message:'Movie deleted.'});
}));

app.get('/api/admin/theaters', requireAdmin, asyncRoute(async (req,res) => {
  const [rows] = await pool.query('SELECT * FROM theaters ORDER BY theater_name');
  res.json(rows);
}));

app.post('/api/admin/theaters', requireAdmin, asyncRoute(async (req,res) => {
  const {theater_name,city,address} = req.body;
  if (!theater_name || !city) return res.status(400).json({message:'Theater name and city are required.'});
  const [r] = await pool.query('INSERT INTO theaters(theater_name,city,address) VALUES(?,?,?)',[theater_name,city,address||null]);
  res.json({message:'Theater added.',theater_id:r.insertId});
}));

app.post('/api/admin/shows', requireAdmin, asyncRoute(async (req,res) => {
  const {movie_id,theater_id,show_date,show_time,ticket_price} = req.body;
  const [[theater]] = await pool.query('SELECT theater_name FROM theaters WHERE theater_id=?',[theater_id]);
  if (!theater || !movie_id || !show_date || !show_time || Number(ticket_price)<=0) return res.status(400).json({message:'Fill all show details correctly.'});
  const [r] = await pool.query(
    'INSERT INTO shows(movie_id,theater_id,theater_name,show_date,show_time,ticket_price) VALUES(?,?,?,?,?,?)',
    [movie_id,theater_id,theater.theater_name,show_date,show_time,Number(ticket_price)]);
  res.json({message:'Show added.',show_id:r.insertId});
}));

app.use('/api', (err,req,res,next) => {
  console.error(err);
  res.status(500).json({message:'Server error. Check database settings and server terminal.'});
});

pool.getConnection().then(async c => {
  c.release();
  await initializeAdmin();
  app.listen(PORT, () => console.log(`Thanmayi Cinemas running at http://localhost:${PORT}`));
}).catch(err => {
  console.error('Database connection failed:', err.message);
  console.error('Import database.sql and check your .env file before starting the server.');
});
