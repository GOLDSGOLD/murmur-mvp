# Murmur MVP

Murmur is a privacy-first emotional check-in app designed to help users reflect on tiny truths, feelings, and meaningful moments.

## Features

- Daily prompt-driven check-ins
- Private-by-default journaling
- Mood tracking with archives and mood filters
- Weekly emotional recap with trend insights
- Authenticated user accounts with secure local backend
- Trusted-circle sharing and export tools
- Mobile-friendly responsive layout

## Stack

- Node.js + Express
- SQLite database
- JWT-based auth
- Static frontend served from the server

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:3000

## Notes

- The app persists data in a local SQLite database file (`data/murmur.db`).
- This MVP focuses on the core habit loop while enabling real users, private entries, and sharing features.
- The app is intentionally low-friction and privacy-first.

## Included workflows

- Sign up / sign in / sign out
- Create a murmur entry with mood and optional trusted-circle sharing
- View timeline by date and mood
- Weekly recap dashboard with mood trends
- Manage trusted-circle contacts
- Export entries as JSON or CSV

## Project structure

- `server.js` — Express server and API endpoints
- `public/` — frontend files for the app UI
- `data/` — SQLite database file created at runtime

## License

MIT
