require("dotenv").config()

const express = require("express")
const fs = require("fs")
const path = require("path")
const session = require("express-session")
const bcrypt = require("bcryptjs")
const multer = require("multer")
const passport = require("passport")

const db = require("./lib/db")
const grammarI18n = require("./lib/i18n")
const configureGoogleAuth = require("./lib/auth-google")

const app = express()
const PORT = process.env.PORT || 3000
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-session-secret"
const ADMIN_EMAIL = "karen12389033@gmail.com"
const STORY_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
const AUDIO_UPLOAD_DIR = path.join(__dirname, "public", "uploads", "questions")
const WORD_PHOTO_DIR = path.join(__dirname, "wordsPhotos")
const AVATAR_UPLOAD_DIR = path.join(__dirname, "public", "uploads", "avatars")

fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true })
fs.mkdirSync(WORD_PHOTO_DIR, { recursive: true })
fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true })

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, AUDIO_UPLOAD_DIR)
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now()
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}${ext}`)
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext !== ".mp3") {
      return cb(new Error("Only MP3 audio files are allowed."))
    }
    cb(null, true)
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
})

const wordPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, WORD_PHOTO_DIR)
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now()
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}${ext}`)
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"])
    if (!allowed.has(ext)) {
      return cb(new Error("Only JPG, JPEG, PNG or WEBP images are allowed."))
    }
    cb(null, true)
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
})

// Application middleware
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))
app.use(express.static(path.join(__dirname, "public")))
app.use("/wordsPhotos", express.static(WORD_PHOTO_DIR))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
)

app.use(passport.initialize())
app.use(passport.session())

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null
  res.locals.isAdmin = isAdmin(req.session.user)
  next()
})

app.use((req, res, next) => {
  const locale = grammarI18n.determineLocale(req)
  req.locale = locale
  res.locals.siteLanguage = locale
  res.locals.supportedLanguages = grammarI18n.SUPPORTED_LANGUAGES
  next()
})

// Helpers
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

async function findUserByEmail(email) {
  const rows = await db.query(
    `SELECT u.id, u.email, u.password_hash, us.ui_language, us.ui_theme, us.level, us.avatar_path, us.ai_teacher_id
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  )
  return rows[0] || null
}

async function findUserById(id) {
  const rows = await db.query(
    `SELECT u.id, u.email, u.password_hash, us.ui_language, us.ui_theme, us.level, us.avatar_path, us.ai_teacher_id
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

function normalizeEmail(email = "") {
  return email.trim().toLowerCase()
}

function slugifyTopic(name = "") {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    || "topic"
}

function setLoggedInUser(req, user, extras = {}) {
  const normalizedEmail = normalizeEmail(user.email || extras.email || "")
  const sessionUser = {
    id: user.id,
    email: normalizedEmail,
  }

  const displayName = extras.name || user.name
  const photo = extras.photo || user.photo
  const avatarPath = extras.avatar || user.avatar_path

  if (displayName) {
    sessionUser.name = displayName
  }

  const normalizedAvatar = avatarPath
    ? avatarPath.startsWith("/")
      ? avatarPath
      : `/${avatarPath}`
    : null

  if (normalizedAvatar) {
    sessionUser.avatar = normalizedAvatar
    sessionUser.photo = normalizedAvatar
  } else if (photo) {
    sessionUser.photo = photo
  }

  req.session.user = sessionUser
  req.user = Object.assign({}, req.user, sessionUser)

  const preferredLanguage = extras.ui_language || user.ui_language
  const normalizedLanguage = grammarI18n.normalizeLanguage(preferredLanguage)
  if (normalizedLanguage && req.session) {
    req.session.locale = normalizedLanguage
  }
}

function isAdmin(user) {
  return Boolean(user && user.email === ADMIN_EMAIL)
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl
    return res.redirect("/login")
  }
  next()
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl
    return res.redirect("/login")
  }
  if (!isAdmin(req.session.user)) {
    return res.status(403).render("errors/403")
  }
  next()
}

configureGoogleAuth()

async function ensureProfileSchema() {
  await db.pool.execute(
    `CREATE TABLE IF NOT EXISTS user_settings (
      user_id INT PRIMARY KEY,
      ui_language VARCHAR(8) NULL,
      ui_theme ENUM('dark','light') DEFAULT 'dark',
      level ENUM('A1','A2','B1','B2','C1','C2') NULL,
      ai_teacher_id VARCHAR(16) NULL,
      avatar_path VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )

  await db.pool.execute(
    `CREATE TABLE IF NOT EXISTS reading_progress (
      user_id INT NOT NULL,
      story_id INT NOT NULL,
      percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
      last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, story_id),
      CONSTRAINT fk_reading_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reading_progress_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

ensureProfileSchema().catch((error) => {
  console.error("Failed to ensure profile schema:", error)
})

const profileRouter = require("./routes/profile")({
  requireAuth,
  asyncHandler,
  db,
  storyLevels: STORY_LEVELS,
  supportedLanguages: grammarI18n.SUPPORTED_LANGUAGES,
  avatarUploadDir: AVATAR_UPLOAD_DIR,
  normalizeLanguage: grammarI18n.normalizeLanguage,
})

const libraryRouter = require("./routes/library")({
  requireAuth,
  asyncHandler,
  db,
  storyLevels: STORY_LEVELS,
})

app.use("/profile", profileRouter)
app.use("/library", libraryRouter)

app.post(
  "/support/ticket",
  requireAuth,
  asyncHandler(async (req, res) => {
    const subject = (req.body?.subject || "").slice(0, 255)
    const description = (req.body?.description || "").slice(0, 2000)

    if (!subject && !description) {
      return res.status(400).json({ success: false, message: "Missing content" })
    }

    res.json({
      success: true,
      subject,
      description,
      message: "Support request received.",
    })
  })
)

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id)
    if (!user) {
      return done(null, false)
    }
    const normalizedEmail = normalizeEmail(user.email)
    return done(null, { id: user.id, email: normalizedEmail })
  } catch (error) {
    done(error)
  }
})

async function getAllStories() {
  return db.query(
    "SELECT id, title, level, summary, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM stories ORDER BY created_at DESC, id DESC"
  )
}

async function getStorySummaries() {
  return db.query(
    "SELECT id, title FROM stories ORDER BY created_at DESC, id DESC"
  )
}

async function getStoryById(id) {
  const rows = await db.query(
    "SELECT id, title, level, summary, body, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM stories WHERE id = ? LIMIT 1",
    [id]
  )
  return rows[0] || null
}

async function getAdjacentStories(id) {
  const prevRows = await db.query(
    "SELECT id, title FROM stories WHERE id < ? ORDER BY id DESC LIMIT 1",
    [id]
  )
  const nextRows = await db.query(
    "SELECT id, title FROM stories WHERE id > ? ORDER BY id ASC LIMIT 1",
    [id]
  )

  return {
    prevStory: prevRows[0] || null,
    nextStory: nextRows[0] || null,
  }
}

async function createStory({ title, level, summary, body, authorId }, connection = db.pool) {
  const executor = connection.execute ? connection : db.pool
  const [result] = await executor.execute(
    "INSERT INTO stories (title, level, summary, body, author_id) VALUES (?, ?, ?, ?, ?)",
    [title, level, summary, body, authorId]
  )
  return result.insertId
}

async function createQuestion(
  { storyId, prompt, answers, correctIndex, audioPath, authorId },
  connection = db.pool
) {
  const executor = connection.execute ? connection : db.pool
  const [result] = await executor.execute(
    "INSERT INTO questions (story_id, prompt, answer_a, answer_b, answer_c, answer_d, correct_index, audio_path, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      storyId,
      prompt,
      answers[0],
      answers[1],
      answers[2],
      answers[3],
      correctIndex,
      audioPath,
      authorId,
    ]
  )
  return result.insertId
}

async function getQuestionsForStory(storyId) {
  const rows = await db.query(
    "SELECT id, prompt, answer_a, answer_b, answer_c, answer_d, correct_index, audio_path FROM questions WHERE story_id = ? ORDER BY id ASC",
    [storyId]
  )

  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    answers: [row.answer_a, row.answer_b, row.answer_c, row.answer_d],
    correctIndex: row.correct_index,
    audioPath: row.audio_path,
  }))
}

async function getVocabularyTopicsWithWords() {
  const topics = await db.query(
    "SELECT id, name, description, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM vocabulary_topics ORDER BY created_at DESC, id DESC"
  )

  if (topics.length === 0) {
    return []
  }

  const topicIds = topics.map((topic) => topic.id)
  const placeholders = topicIds.map(() => "?").join(", ")
  const words = await db.query(
    `SELECT id, topic_id, term, translation, example_sentence, photo_path, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM vocabulary_words WHERE topic_id IN (${placeholders}) ORDER BY created_at DESC, id DESC`,
    topicIds
  )

  const wordsByTopic = new Map()
  for (const word of words) {
    if (!wordsByTopic.has(word.topic_id)) {
      wordsByTopic.set(word.topic_id, [])
    }
    wordsByTopic.get(word.topic_id).push({
      id: word.id,
      term: word.term,
      translation: word.translation,
      exampleSentence: word.example_sentence,
      photoPath: word.photo_path,
      createdAt: word.created_at,
    })
  }

  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description,
    createdAt: topic.created_at,
    words: wordsByTopic.get(topic.id) || [],
  }))
}

async function getVocabularyTopicById(id) {
  const rows = await db.query(
    "SELECT id, name, description, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM vocabulary_topics WHERE id = ? LIMIT 1",
    [id]
  )
  return rows[0] || null
}

async function createVocabularyTopic({ name, description, authorId }) {
  const [result] = await db.pool.execute(
    "INSERT INTO vocabulary_topics (name, description, author_id) VALUES (?, ?, ?)",
    [name, description || null, authorId]
  )
  return result.insertId
}

async function createVocabularyWord({
  topicId,
  term,
  translation,
  exampleSentence,
  photoPath,
  authorId,
}) {
  const [result] = await db.pool.execute(
    "INSERT INTO vocabulary_words (topic_id, term, translation, example_sentence, photo_path, author_id) VALUES (?, ?, ?, ?, ?, ?)",
    [topicId, term, translation || null, exampleSentence || null, photoPath, authorId]
  )
  return result.insertId
}

async function createGrammarTopic({ title, explanation, authorId }) {
  const [result] = await db.pool.execute(
    "INSERT INTO grammar_topics (title, explanation, author_id) VALUES (?, ?, ?)",
    [title, explanation, authorId]
  )
  return result.insertId
}

// Routes
app.get(
  "/",
  asyncHandler(async (req, res) => {
    const stories = await getAllStories()
    res.render("home", { stories })
  })
)

app.get(
  "/story/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const storyId = Number.parseInt(req.params.id, 10)
    if (Number.isNaN(storyId)) {
      return res.status(404).render("errors/404")
    }

    const story = await getStoryById(storyId)
    if (!story) {
      return res.status(404).render("errors/404")
    }

    const { prevStory, nextStory } = await getAdjacentStories(storyId)
    const questions = await getQuestionsForStory(storyId)
    res.render("story", { story, prevStory, nextStory, questions })
  })
)

app.get("/stories/new", requireAdmin, (req, res) => {
  res.render("stories/new", {
    error: null,
    values: {
      title: "",
      level: "A1",
      summary: "",
      body: "",
      questions: [],
    },
  })
})

const storyQuestionsUpload = audioUpload.any()
const singleWordPhotoUpload = wordPhotoUpload.single("photo")

function parseStoryQuestions(body, files) {
  const questionMap = new Map()

  const ensureQuestion = (index) => {
    if (!questionMap.has(index)) {
      questionMap.set(index, {
        prompt: "",
        answers: ["", "", "", ""],
        correctIndex: 0,
        file: null,
      })
    }
    return questionMap.get(index)
  }

  const mergeAnswers = (question, rawAnswers) => {
    if (!rawAnswers) {
      return
    }

    const normalized = []

    if (Array.isArray(rawAnswers)) {
      rawAnswers.forEach((answer, answerIndex) => {
        if (answerIndex >= 0 && answerIndex < 4) {
          normalized[answerIndex] = (answer || "").trim()
        }
      })
    } else if (typeof rawAnswers === "object") {
      Object.entries(rawAnswers).forEach(([key, answer]) => {
        const answerIndex = Number.parseInt(key, 10)
        if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex > 3) {
          return
        }
        normalized[answerIndex] = (answer || "").trim()
      })
    }

    for (let i = 0; i < 4; i += 1) {
      if (normalized[i]) {
        question.answers[i] = normalized[i]
      }
    }
  }

  for (const [field, value] of Object.entries(body)) {
    const promptMatch = field.match(/^questions\[(\d+)\]\[prompt\]$/)
    if (promptMatch) {
      const question = ensureQuestion(Number.parseInt(promptMatch[1], 10))
      question.prompt = (value || "").trim()
      continue
    }

    const correctMatch = field.match(/^questions\[(\d+)\]\[correctIndex\]$/)
    if (correctMatch) {
      const question = ensureQuestion(Number.parseInt(correctMatch[1], 10))
      const parsedIndex = Number.parseInt(value, 10)
      if (!Number.isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex <= 3) {
        question.correctIndex = parsedIndex
      }
      continue
    }

    const answerMatch = field.match(/^questions\[(\d+)\]\[answers\]\[(\d+)\]$/)
    if (answerMatch) {
      const question = ensureQuestion(Number.parseInt(answerMatch[1], 10))
      const answerIndex = Number.parseInt(answerMatch[2], 10)
      if (answerIndex >= 0 && answerIndex < 4) {
        question.answers[answerIndex] = (value || "").trim()
      }
    }
  }

  const nestedQuestions = body.questions

  if (Array.isArray(nestedQuestions)) {
    nestedQuestions.forEach((questionData, index) => {
      if (!questionData) {
        return
      }
      const question = ensureQuestion(index)
      question.prompt = (questionData.prompt || "").trim()
      mergeAnswers(question, questionData.answers)
      const parsedIndex = Number.parseInt(questionData.correctIndex, 10)
      if (!Number.isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex <= 3) {
        question.correctIndex = parsedIndex
      }
    })
  } else if (nestedQuestions && typeof nestedQuestions === "object") {
    Object.entries(nestedQuestions).forEach(([key, questionData]) => {
      const index = Number.parseInt(key, 10)
      if (Number.isNaN(index) || !questionData) {
        return
      }
      const question = ensureQuestion(index)
      question.prompt = (questionData.prompt || "").trim()
      mergeAnswers(question, questionData.answers)
      const parsedIndex = Number.parseInt(questionData.correctIndex, 10)
      if (!Number.isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex <= 3) {
        question.correctIndex = parsedIndex
      }
    })
  }

  for (const file of files || []) {
    const audioMatch = file.fieldname.match(/^questions\[(\d+)\]\[audio\]$/)
    if (!audioMatch) {
      continue
    }
    const question = ensureQuestion(Number.parseInt(audioMatch[1], 10))
    question.file = file
  }

  const sorted = Array.from(questionMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, question]) => ({
      ...question,
      answers: question.answers.map((answer) => (answer || "").trim()),
    }))

  return sorted.filter((question) => {
    const hasPrompt = Boolean(question.prompt)
    const hasAnyAnswer = question.answers.some((answer) => Boolean(answer))
    return hasPrompt || hasAnyAnswer
  })
}

function cleanupFiles(files = []) {
  for (const file of files) {
    fs.unlink(file.path, () => {})
  }
}

app.post(
  "/stories",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const values = {
      title: "",
      level: "A1",
      summary: "",
      body: "",
      questions: [],
    }

    const renderForm = ({ status, errorMessage }) => {
      return res.status(status).render("stories/new", {
        error: errorMessage,
        values,
      })
    }

    const runUpload = () =>
      new Promise((resolve, reject) => {
        storyQuestionsUpload(req, res, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

    try {
      await runUpload()
    } catch (uploadError) {
      cleanupFiles(req.files)
      return renderForm({ status: 400, errorMessage: uploadError.message })
    }

    values.title = (req.body.title || "").trim()
    values.level = (req.body.level || "").trim().toUpperCase()
    values.summary = (req.body.summary || "").trim()
    values.body = (req.body.body || "").trim()
    values.questions = parseStoryQuestions(req.body, req.files)

    if (!values.title || !values.summary || !values.body) {
      cleanupFiles(req.files)
      return renderForm({ status: 400, errorMessage: "Please fill in all required fields." })
    }

    if (!STORY_LEVELS.includes(values.level)) {
      cleanupFiles(req.files)
      return renderForm({ status: 400, errorMessage: "Please choose a valid level (A1–C2)." })
    }

    for (const question of values.questions) {
      if (!question.prompt || question.answers.some((answer) => !answer)) {
        cleanupFiles(req.files)
        return renderForm({
          status: 400,
          errorMessage: "Each question must include a prompt and four answers.",
        })
      }

      if (
        Number.isNaN(question.correctIndex) ||
        question.correctIndex < 0 ||
        question.correctIndex > 3
      ) {
        cleanupFiles(req.files)
        return renderForm({
          status: 400,
          errorMessage: "Select which answer is correct for each question.",
        })
      }
    }

    const connection = await db.pool.getConnection()

    try {
      await connection.beginTransaction()

      const storyId = await createStory(
        {
          title: values.title,
          level: values.level,
          summary: values.summary,
          body: values.body,
          authorId: req.session.user.id,
        },
        connection
      )

      for (const question of values.questions) {
        const audioPath = question.file
          ? path.posix.join("uploads/questions", question.file.filename)
          : null

        await createQuestion(
          {
            storyId,
            prompt: question.prompt,
            answers: question.answers,
            correctIndex: question.correctIndex,
            audioPath,
            authorId: req.session.user.id,
          },
          connection
        )
      }

      await connection.commit()

      res.redirect(`/story/${storyId}`)
    } catch (error) {
      await connection.rollback()
      cleanupFiles(req.files)
      console.error(error)
      return renderForm({
        status: 500,
        errorMessage: "An unexpected error occurred while saving the story.",
      })
    } finally {
      connection.release()
    }
  })
)

const singleAudioUpload = audioUpload.single("audio")

app.get(
  "/questions/new",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stories = await getStorySummaries()
    const createdId = Number.parseInt(req.query.created, 10)
    res.render("questions/new", {
      error: null,
      success: Number.isNaN(createdId)
        ? null
        : `Question #${createdId} saved successfully.`,
      stories,
      values: {
        storyId: stories[0]?.id || "",
        prompt: "",
        answers: ["", "", "", ""],
        correctIndex: 0,
      },
    })
  })
)

app.post(
  "/questions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const runUpload = () =>
      new Promise((resolve, reject) => {
        singleAudioUpload(req, res, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

    const cleanupUploadedFile = () => {
      if (req.file) {
        fs.unlink(req.file.path, () => {})
      }
    }

    const renderForm = async ({ status = 200, error = null, success = null, values }) => {
      const stories = await getStorySummaries()
      const answers = Array.isArray(values.answers) ? values.answers.slice(0, 4) : []
      while (answers.length < 4) {
        answers.push("")
      }
      const normalizedValues = {
        storyId: values.storyId || "",
        prompt: values.prompt,
        answers,
        correctIndex: values.correctIndex,
      }

      return res.status(status).render("questions/new", {
        error,
        success,
        stories,
        values: normalizedValues,
      })
    }

    const values = {
      storyId: Number.parseInt(req.body.storyId, 10),
      prompt: (req.body.prompt || "").trim(),
      answers: Array.isArray(req.body.answers)
        ? req.body.answers.map((answer) => (answer || "").trim())
        : [req.body.answers || ""],
      correctIndex: Number.parseInt(req.body.correctIndex, 10),
    }

    if (values.answers.length < 4) {
      values.answers = [...values.answers, "", "", "", ""].slice(0, 4)
    }

    try {
      await runUpload()
    } catch (uploadError) {
      cleanupUploadedFile()
      await renderForm({
        status: 400,
        error: uploadError.message,
        success: null,
        values,
      })
      return
    }

    if (!Number.isInteger(values.storyId) || values.storyId <= 0) {
      cleanupUploadedFile()
      await renderForm({
        status: 400,
        error: "Please choose which story this question belongs to.",
        success: null,
        values,
      })
      return
    }

    if (!values.prompt) {
      cleanupUploadedFile()
      await renderForm({
        status: 400,
        error: "Please provide the question prompt.",
        success: null,
        values,
      })
      return
    }

    if (values.answers.some((answer) => !answer)) {
      cleanupUploadedFile()
      await renderForm({
        status: 400,
        error: "All four answer options are required.",
        success: null,
        values,
      })
      return
    }

    if (Number.isNaN(values.correctIndex) || values.correctIndex < 0 || values.correctIndex > 3) {
      cleanupUploadedFile()
      await renderForm({
        status: 400,
        error: "Select which answer is correct.",
        success: null,
        values,
      })
      return
    }

    const story = await getStoryById(values.storyId)
    if (!story) {
      cleanupUploadedFile()
      await renderForm({
        status: 400,
        error: "The selected story could not be found.",
        success: null,
        values,
      })
      return
    }

    const audioPath = req.file ? path.posix.join("uploads/questions", req.file.filename) : null

    const questionId = await createQuestion({
      storyId: values.storyId,
      prompt: values.prompt,
      answers: values.answers,
      correctIndex: values.correctIndex,
      audioPath,
      authorId: req.session.user.id,
    })

    res.redirect(`/questions/new?created=${questionId}`)
  })
)

app.get(
  "/learning/vocabulary",
  asyncHandler(async (req, res) => {
    const { q = "", sort = "newest" } = req.query
    const searchTerm = String(q || "").trim().toLowerCase()

    const topicsWithMeta = (await getVocabularyTopicsWithWords()).map((topic) => ({
      ...topic,
      slug: slugifyTopic(topic.name),
      wordCount: topic.words.length,
    }))

    let filteredTopics = topicsWithMeta
    if (searchTerm) {
      filteredTopics = filteredTopics.filter((topic) =>
        topic.name.toLowerCase().includes(searchTerm)
      )
    }

    if (sort === "az") {
      filteredTopics = [...filteredTopics].sort((a, b) =>
        a.name.localeCompare(b.name, "de", { sensitivity: "base" })
      )
    }

    const sortOptions = [
      { value: "newest", label: "Neueste" },
      { value: "az", label: "A–Z" },
    ]

    res.render("learning/vocabulary", {
      topics: filteredTopics,
      query: String(q || ""),
      selectedSort: sortOptions.some((option) => option.value === sort) ? sort : "newest",
      sortOptions,
    })
  })
)

app.get("/learning/vocabulary/new", requireAdmin, (req, res) => {
  res.render("learning/vocabulary-new", {
    error: null,
    success: null,
    values: {
      name: "",
      description: "",
    },
  })
})

app.post(
  "/learning/vocabulary",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const values = {
      name: (req.body.name || "").trim(),
      description: (req.body.description || "").trim(),
    }

    if (!values.name) {
      return res.status(400).render("learning/vocabulary-new", {
        error: "Please provide a topic name.",
        success: null,
        values,
      })
    }

    await createVocabularyTopic({
      name: values.name,
      description: values.description,
      authorId: req.session.user.id,
    })

    res.render("learning/vocabulary-new", {
      error: null,
      success: "Topic created successfully.",
      values: {
        name: "",
        description: "",
      },
    })
  })
)

app.get(
  "/learning/vocabulary/topics/:topicId/words/new",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const topicId = Number.parseInt(req.params.topicId, 10)
    if (Number.isNaN(topicId)) {
      return res.status(404).render("errors/404")
    }

    const topic = await getVocabularyTopicById(topicId)
    if (!topic) {
      return res.status(404).render("errors/404")
    }

    res.render("learning/vocabulary-word-new", {
      error: null,
      success: null,
      topic,
      values: {
        term: "",
        translation: "",
        exampleSentence: "",
      },
    })
  })
)

app.post(
  "/learning/vocabulary/topics/:topicId/words",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const topicId = Number.parseInt(req.params.topicId, 10)
    if (Number.isNaN(topicId)) {
      return res.status(404).render("errors/404")
    }

    const topic = await getVocabularyTopicById(topicId)
    if (!topic) {
      return res.status(404).render("errors/404")
    }

    const runUpload = () =>
      new Promise((resolve, reject) => {
        singleWordPhotoUpload(req, res, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

    try {
      await runUpload()
    } catch (uploadError) {
      if (req.file) {
        cleanupFiles([req.file])
      }
      return res.status(400).render("learning/vocabulary-word-new", {
        error: uploadError.message,
        success: null,
        topic,
        values: {
          term: (req.body.term || "").trim(),
          translation: (req.body.translation || "").trim(),
          exampleSentence: (req.body.exampleSentence || "").trim(),
        },
      })
    }

    const values = {
      term: (req.body.term || "").trim(),
      translation: (req.body.translation || "").trim(),
      exampleSentence: (req.body.exampleSentence || "").trim(),
    }

    if (!values.term) {
      if (req.file) {
        cleanupFiles([req.file])
      }
      return res.status(400).render("learning/vocabulary-word-new", {
        error: "Please provide a word.",
        success: null,
        topic,
        values,
      })
    }

    if (!req.file) {
      return res.status(400).render("learning/vocabulary-word-new", {
        error: "Please upload an image for the word.",
        success: null,
        topic,
        values,
      })
    }

    const photoPath = path.posix.join("wordsPhotos", req.file.filename)

    try {
      await createVocabularyWord({
        topicId,
        term: values.term,
        translation: values.translation,
        exampleSentence: values.exampleSentence,
        photoPath,
        authorId: req.session.user.id,
      })
    } catch (error) {
      cleanupFiles([req.file])
      throw error
    }

    res.render("learning/vocabulary-word-new", {
      error: null,
      success: "Word added successfully.",
      topic,
      values: {
        term: "",
        translation: "",
        exampleSentence: "",
      },
    })
  })
)

app.get(
  "/learning/vocabulary/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase()
    const topicsWithWords = (await getVocabularyTopicsWithWords()).map((topic) => ({
      ...topic,
      slug: slugifyTopic(topic.name),
      wordCount: topic.words.length,
    }))

    const topic = topicsWithWords.find((entry) => entry.slug === slug)

    if (!topic) {
      return res.status(404).render("errors/404")
    }

    res.render("learning/vocabulary-topic", {
      topic,
    })
  })
)

app.get("/learning/grammar", (req, res) => {
  const locale = req.locale || grammarI18n.DEFAULT_LANGUAGE
  const grammarMeta = grammarI18n.getGrammarMeta(locale)
  const sections = grammarI18n.getGrammarSections(locale)
  const breadcrumbs = [
    {
      label: grammarMeta.breadcrumbs?.learning || "Learning",
      url: null,
    },
    {
      label: grammarMeta.breadcrumbs?.grammar || grammarMeta.title || "Grammar",
      url: null,
      current: true,
    },
  ]

  res.render("grammar/overview", {
    grammar: grammarMeta,
    overview: grammarMeta.overview || {},
    ui: grammarMeta.ui || {},
    sections,
    sidebarLabel: grammarMeta.sidebarLabel || grammarMeta.title || "Sections",
    breadcrumbs,
    locale,
  })
})

app.get("/learning/grammar/:sectionSlug/:subtopicSlug", (req, res) => {
  const locale = req.locale || grammarI18n.DEFAULT_LANGUAGE
  const { sectionSlug, subtopicSlug } = req.params
  const grammarMeta = grammarI18n.getGrammarMeta(locale)
  const sections = grammarI18n.getGrammarSections(locale)
  const section = grammarI18n.getSection(locale, sectionSlug)

  if (!section) {
    return res.status(404).render("errors/404")
  }

  const subtopic = grammarI18n.getSubtopic(locale, sectionSlug, subtopicSlug)

  if (!subtopic) {
    return res.status(404).render("errors/404")
  }

  const breadcrumbs = [
    {
      label: grammarMeta.breadcrumbs?.learning || "Learning",
      url: null,
    },
    {
      label: grammarMeta.breadcrumbs?.grammar || grammarMeta.title || "Grammar",
      url: "/learning/grammar",
    },
    {
      label: section.title,
      url: `/learning/grammar/${section.slug}`,
    },
    {
      label: subtopic.title,
      url: null,
      current: true,
    },
  ]

  res.render("grammar/lesson", {
    grammar: grammarMeta,
    ui: grammarMeta.ui || {},
    section,
    sections,
    subtopic,
    lesson: subtopic.lesson || { blocks: [], takeaways: [], quiz: null },
    sidebarLabel: grammarMeta.sidebarLabel || grammarMeta.title || "Sections",
    breadcrumbs,
    locale,
  })
})

app.get("/learning/grammar/:sectionSlug", (req, res) => {
  const locale = req.locale || grammarI18n.DEFAULT_LANGUAGE
  const { sectionSlug } = req.params
  const grammarMeta = grammarI18n.getGrammarMeta(locale)
  const sections = grammarI18n.getGrammarSections(locale)
  const section = grammarI18n.getSection(locale, sectionSlug)

  if (!section) {
    return res.status(404).render("errors/404")
  }

  const breadcrumbs = [
    {
      label: grammarMeta.breadcrumbs?.learning || "Learning",
      url: null,
    },
    {
      label: grammarMeta.breadcrumbs?.grammar || grammarMeta.title || "Grammar",
      url: "/learning/grammar",
    },
    {
      label: section.title,
      url: null,
      current: true,
    },
  ]

  res.render("grammar/section", {
    grammar: grammarMeta,
    ui: grammarMeta.ui || {},
    sections,
    section,
    sidebarLabel: grammarMeta.sidebarLabel || grammarMeta.title || "Sections",
    breadcrumbs,
    locale,
  })
})

app.get("/learning/grammar/new", requireAdmin, (req, res) => {
  res.render("learning/grammar-new", {
    error: null,
    success: null,
    values: {
      title: "",
      explanation: "",
    },
  })
})

app.post(
  "/learning/grammar",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const values = {
      title: (req.body.title || "").trim(),
      explanation: (req.body.explanation || "").trim(),
    }

    if (!values.title || !values.explanation) {
      return res.status(400).render("learning/grammar-new", {
        error: "Please provide a title and explanation for the grammar topic.",
        success: null,
        values,
      })
    }

    await createGrammarTopic({
      title: values.title,
      explanation: values.explanation,
      authorId: req.session.user.id,
    })

    res.render("learning/grammar-new", {
      error: null,
      success: "Grammar topic saved successfully.",
      values: {
        title: "",
        explanation: "",
      },
    })
  })
)

app.get("/about", (req, res) => {
  res.render("about")
})

app.get("/signup", (req, res) => {
  if (req.session.user) {
    return res.redirect("/")
  }
  res.render("signup", { error: null, values: { email: "" } })
})

app.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email = "", password = "", confirmPassword = "" } = req.body
    const normalizedEmail = normalizeEmail(email)
    const values = { email }

    if (!normalizedEmail || !password || !confirmPassword) {
      return res.status(400).render("signup", {
        error: "Please fill in all fields.",
        values,
      })
    }

    if (password !== confirmPassword) {
      return res.status(400).render("signup", {
        error: "Passwords do not match.",
        values,
      })
    }

    if (password.length < 8) {
      return res.status(400).render("signup", {
        error: "Password must be at least 8 characters.",
        values,
      })
    }

    const existingUser = await findUserByEmail(normalizedEmail)
    if (existingUser) {
      return res.status(400).render("signup", {
        error: "An account already exists for that email.",
        values,
      })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await db.pool.execute(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [normalizedEmail, passwordHash]
    )

    setLoggedInUser(req, { id: result.insertId, email: normalizedEmail })
    const redirectTo = req.session.returnTo || "/"
    delete req.session.returnTo
    res.redirect(redirectTo)
  })
)

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/")
  }
  res.render("login", { error: null, values: { email: "" } })
})

app.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email = "", password = "" } = req.body
    const normalizedEmail = normalizeEmail(email)
    const values = { email }

    if (!normalizedEmail || !password) {
      return res.status(400).render("login", {
        error: "Please enter your email and password.",
        values,
      })
    }

    const user = await findUserByEmail(normalizedEmail)
    if (!user) {
      return res.status(400).render("login", {
        error: "Email or password is incorrect.",
        values,
      })
    }

    if (!user.password_hash) {
      return res.status(400).render("login", {
        error: "This account uses Google sign-in. Continue with Google instead.",
        values,
      })
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatch) {
      return res.status(400).render("login", {
        error: "Email or password is incorrect.",
        values,
      })
    }

    setLoggedInUser(req, user)
    const redirectTo = req.session.returnTo || "/"
    delete req.session.returnTo
    res.redirect(redirectTo)
  })
)

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
)

app.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    if (err) {
      return next(err)
    }
    if (!user) {
      return res.redirect("/login")
    }
    req.login(user, (loginError) => {
      if (loginError) {
        return next(loginError)
      }
      setLoggedInUser(req, user, { name: user.name, photo: user.photo })
      const redirectTo = req.session.returnTo || "/"
      delete req.session.returnTo
      res.redirect(redirectTo)
    })
  })(req, res, next)
})

app.post("/logout", (req, res) => {
  if (!req.session) {
    return res.redirect("/")
  }

  req.session.destroy(() => {
    res.redirect("/")
  })
})

app.use((err, req, res, next) => {
  console.error(err)
  if (res.headersSent) {
    return next(err)
  }
  res.status(500).render("errors/500")
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
