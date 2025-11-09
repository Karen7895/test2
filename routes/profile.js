const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs/promises")
const sharp = require("sharp")

const AVATAR_LIMIT_BYTES = 200 * 1024
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

function normalizeTheme(theme) {
  if (typeof theme !== "string") {
    return "dark"
  }
  const value = theme.toLowerCase()
  return value === "light" ? "light" : "dark"
}

module.exports = function createProfileRouter({
  requireAuth,
  asyncHandler,
  db,
  storyLevels,
  supportedLanguages,
  avatarUploadDir,
  normalizeLanguage,
}) {
  const router = express.Router()

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_LIMIT_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
        cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "avatar"))
        return
      }
      cb(null, true)
    },
  })

  async function getUserProfileData(userId) {
    const [userRow] = await db.query(
      `SELECT id, email, DATE_FORMAT(created_at, '%Y-%m-%d') AS joined_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    )

    const [settingsRow] = await db.query(
      `SELECT ui_language, ui_theme, level, ai_teacher_id, avatar_path
       FROM user_settings
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    )

    const progressRows = await db.query(
      `SELECT rp.story_id, rp.percentage, DATE_FORMAT(rp.last_read_at, '%Y-%m-%d') AS last_read_at,
              s.title, s.level,
              CEIL(GREATEST(CHAR_LENGTH(s.body) / 900, 1)) AS estimated_minutes
       FROM reading_progress rp
       INNER JOIN stories s ON s.id = rp.story_id
       WHERE rp.user_id = ?
       ORDER BY rp.last_read_at DESC, rp.story_id DESC`,
      [userId]
    )

    const overview = {
      started: progressRows.filter((item) => item.percentage > 0).length,
      finished: progressRows.filter((item) => item.percentage >= 100).length,
      minutes: progressRows.reduce(
        (sum, item) => sum + Number.parseInt(item.estimated_minutes || 0, 10),
        0
      ),
    }

    const recentInProgress = progressRows
      .filter((item) => item.percentage > 0 && item.percentage < 100)
      .slice(0, 10)

    const avatarPath = settingsRow?.avatar_path
      ? settingsRow.avatar_path.startsWith("/")
        ? settingsRow.avatar_path
        : `/${settingsRow.avatar_path}`
      : null

    let plan = "basic"
    if (settingsRow?.level && ["B1", "B2"].includes(settingsRow.level)) {
      plan = "medium"
    } else if (settingsRow?.level && ["C1", "C2"].includes(settingsRow.level)) {
      plan = "advanced"
    }

    const subscription = {
      plan,
      renewal: null,
      payments: [],
    }

    return {
      user: userRow || null,
      settings: settingsRow || null,
      overview,
      inProgress: recentInProgress,
      avatar: avatarPath,
      subscription,
    }
  }

  async function ensureSettingsRow(userId) {
    await db.pool.execute(
      `INSERT INTO user_settings (user_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [userId]
    )
  }

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.session.user.id
      const profileData = await getUserProfileData(userId)

      const currentLanguage =
        (profileData.settings?.ui_language
          ? normalizeLanguage(profileData.settings.ui_language)
          : normalizeLanguage(req.locale)) || supportedLanguages[0]

      const pageTitle = res.__ ? res.__("profile.title") : "Profile"

      res.render("profile/index", {
        pageTitle,
        profile: profileData,
        settingsOptions: {
          languages: supportedLanguages,
          themes: ["dark", "light"],
          levels: storyLevels,
        },
        aiTeacherId: profileData.settings?.ai_teacher_id || null,
        currentLanguage,
      })
    })
  )

  router.post(
    "/avatar",
    requireAuth,
    upload.single("avatar"),
    asyncHandler(async (req, res) => {
      const userId = req.session.user.id

      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" })
      }

      await ensureSettingsRow(userId)

      const [existingRows] = await db.query(
        `SELECT avatar_path FROM user_settings WHERE user_id = ? LIMIT 1`,
        [userId]
      )

      if (existingRows && existingRows.avatar_path) {
        const existingFilename = path.basename(existingRows.avatar_path)
        const oldPath = path.join(avatarUploadDir, existingFilename)
        try {
          await fs.unlink(oldPath)
        } catch (error) {
          if (error.code !== "ENOENT") {
            console.warn("Failed to remove previous avatar", error)
          }
        }
      }

      const filename = `user-${userId}-${Date.now()}.png`
      const destination = path.join(avatarUploadDir, filename)

      await sharp(req.file.buffer)
        .resize(128, 128, { fit: "cover" })
        .png({ quality: 90 })
        .toFile(destination)

      const publicPath = path.posix.join("uploads", "avatars", filename)

      await db.pool.execute(
        `INSERT INTO user_settings (user_id, avatar_path)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE avatar_path = VALUES(avatar_path)`,
        [userId, publicPath]
      )

      const normalized = `/${publicPath}`
      req.session.user.avatar = normalized
      req.session.user.photo = normalized

      res.json({ success: true, avatarUrl: normalized })
    })
  )

  router.post(
    "/settings",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.session.user.id
      const language = normalizeLanguage(req.body.language) || null
      const theme = normalizeTheme(req.body.theme)

      let level = null
      if (typeof req.body.level === "string" && storyLevels.includes(req.body.level)) {
        level = req.body.level
      }

      await ensureSettingsRow(userId)

      await db.pool.execute(
        `UPDATE user_settings
         SET ui_language = ?, ui_theme = ?, level = ?, updated_at = NOW()
         WHERE user_id = ?`,
        [language, theme, level, userId]
      )

      if (language) {
        req.session.locale = language
      }

      if (level) {
        req.session.user.level = level
      } else if (req.session.user.level) {
        delete req.session.user.level
      }

      res.json({ success: true })
    })
  )

  router.post(
    "/subscription/cancel",
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        message: "Cancellation request recorded. Please contact support for assistance.",
      })
    })
  )

  router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: "Invalid avatar upload." })
    }
    return next(error)
  })

  return router
}
