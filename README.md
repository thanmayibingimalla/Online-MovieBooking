# Thanmayi Cinemas — Online Movie Ticket Booking System

A mini-project built with HTML, CSS, JavaScript, Node.js, Express and MySQL.

## Features
- Browse movies with poster images, search and genre/language filters.
- Customer registration and login (passwords are hashed with bcrypt).
- View theaters, show dates, show timings and ticket prices.
- Interactive seat map with available, selected and already-booked seats.
- Book multiple seats; total amount is calculated automatically.
- My Bookings page for the signed-in customer.
- Admin dashboard to add/delete movies, add theaters and schedule shows.
- Database-level unique constraint prevents the same seat being booked twice for one show.

## Requirements
Install Node.js (LTS) and MySQL Server / MySQL Workbench.

## Setup (Windows / VS Code)
1. Extract the ZIP.
2. Open the extracted `Thanmayi_Movie_Booking_System` folder in VS Code.
3. Open MySQL Workbench or MySQL Command Line.
4. Run the complete `database.sql` file. It creates the `thanmayi_cinemas` database, tables and sample movies/theaters/shows.
5. In VS Code terminal, run:
   ```bash
   npm install
   ```
6. Copy `.env.example` and rename the copy to `.env`.
7. Open `.env` and enter your MySQL password:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_actual_mysql_password
   DB_NAME=thanmayi_cinemas
   PORT=3000
   SESSION_SECRET=use_a_long_random_secret
   ```
   If your MySQL root account has no password, leave `DB_PASSWORD=` blank.
8. Start the app:
   ```bash
   npm start
   ```
9. Open **http://localhost:3000** in your browser.

## Admin login
The server automatically creates this admin account the first time it connects:
- Email: `admin@thanmayi.com`
- Password: `Admin@123`

Change this password before using the project beyond a classroom demo. The sample account is for local demonstration only.

## Customer login
Use **Join now** to register a customer account. Then select a movie, choose a show, select seats and confirm.

## Database tables
- `users` — user details, password hash and role.
- `movies` — movie information and poster URL.
- `theaters` — theater details.
- `shows` — movie/theater/date/time/price mapping.
- `bookings` — one row per confirmed booking.
- `booking_seats` — one row per seat in a booking; added so the app can prevent double-booking individual seats.

The requested `shows` fields include a theater name. This project also uses `theater_id` as a foreign key to the separate `theaters` table. The `booking_seats` table is an intentional extra table because a single integer `seats` column cannot store seat labels such as A01 and A02.

## Project structure
```text
Thanmayi_Movie_Booking_System/
├── database.sql
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## Notes
- Poster images are remote image links, so internet access is required to display them.
- Sample shows are generated for today and tomorrow. The demo uses Indian Rupees.
- This is a college mini-project starter, not a production ticketing platform. For production, add CSRF protection, rate limiting, persistent session storage, payment gateway integration, email/SMS confirmations, seat-hold expiry and stronger admin account management.
