# Deutsch Leseecke

Modern German reading platform built with Express and EJS. Stories are gated behind authentication and stored in MySQL. The admin account (`karen12389033@gmail.com`) can publish new stories directly from the web UI.

## Key Features

- Secure sessions with signup/login flows (passwords hashed with bcrypt).
- Story catalogue available only to authenticated readers.
- Admin tooling for creating stories from the browser with live database persistence.
- Admin tooling for creating stories and comprehension questions (with optional audio) directly in the browser.
- Vocabulary studio for curating themed word collections with imagery from the browser-based admin forms.
- Level filtering (A1&ndash;C2), improved navigation, and refined UI.
- Express + EJS server-side rendering with modular partials and modern styling.

## Tech Stack

- **Runtime:** Node.js 18+, Express 4
- **Views:** EJS templates
- **Database:** MySQL (via `mysql2/promise`)
- **Styles:** Custom CSS (Inter font, responsive layout)
- **Auth:** `express-session` + hashed passwords (`bcryptjs`)

## Getting Started

1. Install dependencies
   ```bash
   npm install
   ```
2. Provide environment variables (see `.env.example` if available)  
   Required keys:
   ```env
   PORT=3000
   SESSION_SECRET=replace-me
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=deutsch_leseecke
   DB_SSL=false
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
  ```
3. Prepare the database schema (see below).
4. Run the server:
   ```bash
   npm run dev   # nodemon auto-reload
   # or
   npm start
   ```
5. Visit [http://localhost:3000](http://localhost:3000).

## Google OAuth Setup

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or select an existing one).
2. Enable the **Google People API** and configure an OAuth consent screen (External type is sufficient for testing).
3. Create OAuth 2.0 credentials of type **Web application** and add the authorized redirect URI `http://localhost:3000/auth/google/callback`.
4. Copy the generated Client ID and Client Secret into your `.env` file using the keys described above.
5. Restart the development server so Passport picks up the new environment variables.

## Database Schema

The application expects `users`, `stories`, `questions`, `vocabulary_topics`, `vocabulary_words`, and `grammar_topics` tables. Below is a reference schema (feel free to adjust column types to your needs).

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> **Google sign-in:** Accounts created via the "Continue with Google" button do not have a local password. Allowing `password_hash` to be `NULL` ensures these users can be stored alongside traditional email/password accounts.

Add the `stories` table to persist story content authored by the admin:

```sql
CREATE TABLE IF NOT EXISTS stories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  level ENUM('A1','A2','B1','B2','C1','C2') NOT NULL,
  summary VARCHAR(255) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stories_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> **Tip:** Seed the `users` table with the admin account (`karen12389033@gmail.com`). After creating the user through the signup form you can update the email directly in MySQL if required.

Add the `questions` table so the admin can author multiple-choice prompts with four answers and an optional MP3 audio clip:

```sql
CREATE TABLE IF NOT EXISTS questions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  story_id INT UNSIGNED NOT NULL,
  prompt TEXT NOT NULL,
  answer_a VARCHAR(255) NOT NULL,
  answer_b VARCHAR(255) NOT NULL,
  answer_c VARCHAR(255) NOT NULL,
  answer_d VARCHAR(255) NOT NULL,
  correct_index TINYINT UNSIGNED NOT NULL,
  audio_path VARCHAR(255) NULL,
  author_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_story
    FOREIGN KEY (story_id) REFERENCES stories(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_questions_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_questions_correct_index
    CHECK (correct_index BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> **Note:** Uploaded audio is stored under `public/uploads/questions`. Ensure the folder exists and is writable by the server process.
> Each question is linked to a specific story via `story_id`, so readers can answer the quiz directly underneath the story.

Vocabulary topics collect related words for the `/learning/vocabulary` section. Each word is paired with an illustrative image that is stored under `wordsPhotos/` (the folder is created automatically by the server at runtime):

```sql
CREATE TABLE IF NOT EXISTS vocabulary_topics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  author_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vocab_topics_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vocabulary_words (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic_id INT UNSIGNED NOT NULL,
  term VARCHAR(255) NOT NULL,
  translation VARCHAR(255) NULL,
  example_sentence TEXT NULL,
  photo_path VARCHAR(255) NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vocab_words_topic
    FOREIGN KEY (topic_id) REFERENCES vocabulary_topics(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_vocab_words_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Grammar explanations live in the `/learning/grammar` section and allow rich HTML formatting:

```sql
CREATE TABLE IF NOT EXISTS grammar_topics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  explanation MEDIUMTEXT NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_grammar_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Roles and Access

- **Readers:** Any authenticated user can browse and read stories.
- **Admin (karen12389033@gmail.com):** Gains access to the "Neue Geschichte" workflow (including inline quiz creation) and the learning editors for vocabulary and grammar content (including image-backed vocabulary topics and words).
- Story detail pages, list, and creation routes are all protected; unauthenticated visitors are redirected to `/login`.

## Project Structure

```
.
├─ server.js
├─ public/
│  ├─ css/main.css
│  ├─ uploads/questions/
│  └─ js/
│     ├─ home.js
│     └─ ai-chat.js
├─ wordsPhotos/ (uploaded vocabulary imagery)
├─ views/
│  ├─ partials/ (head, header, footer)
│  ├─ stories/new.ejs
│  ├─ questions/new.ejs
│  ├─ learning/vocabulary(.ejs | -new.ejs | -word-new.ejs)
│  ├─ errors/{403,404,500}.ejs
│  ├─ home.ejs
│  ├─ story.ejs
│  ├─ login.ejs
│  ├─ signup.ejs
│  └─ about.ejs
└─ lib/db.js (MySQL connection pool)
```

## Development Notes

- Password hashing uses 12 salt rounds; adjust in `server.js` if needed.
- `express-session` stores session data in-memory; switch to a persistent store (Redis/MySQL) for production.
- Story filtering is performed client-side (`public/js/home.js`) by toggling visibility classes.
- The floating AI helper is UI-only; integrate an API by replacing the stub in `public/js/ai-chat.js`.

## Next Steps

1. Add pagination or search across the story catalogue.
2. Implement editing/deleting stories for the admin role.
3. Replace session store with a production-ready adapter.
4. Connect the AI helper to an actual language assistant API.
5. Add automated tests for auth and story creation workflows.

Mit viel Erfolg beim Deutschlernen!

## Schema changes (Profile & Library progress)
- Added table `user_settings`:
  - ui_language (VARCHAR 8), ui_theme (ENUM dark/light), level (ENUM A1–C2), ai_teacher_id (VARCHAR 16), avatar_path (VARCHAR 255)
- Added table `reading_progress`:
  - user_id, story_id, percentage TINYINT 0–100, last_read_at TIMESTAMP

Endpoints:
- GET /profile
- POST /profile/avatar
- POST /profile/settings
- GET /library
- POST /library/progress

Notes:
- “Continue reading” strip shows up to 5 latest in-progress stories for the logged-in user.
- Users select their AI Teacher on the /ai-teacher page; the current selection is displayed in Profile → Settings.
