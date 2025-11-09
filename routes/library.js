const express = require("express")

const MAX_PROGRESS_EVENTS_PER_MINUTE = 60

module.exports = function createLibraryRouter({ requireAuth, asyncHandler, db, storyLevels }) {
  const router = express.Router()
  const rateLimit = new Map()

  function normalizeLevel(value) {
    if (typeof value !== "string") {
      return "all"
    }
    const upper = value.toUpperCase()
    return storyLevels.includes(upper) ? upper : "all"
  }

  function registerProgressHit(userId) {
    const now = Date.now()
    const entry = rateLimit.get(userId)
    if (!entry || now - entry.start >= 60_000) {
      rateLimit.set(userId, { count: 1, start: now })
      return true
    }

    entry.count += 1
    if (entry.count > MAX_PROGRESS_EVENTS_PER_MINUTE) {
      return false
    }
    return true
  }

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const activeLevel = normalizeLevel(req.query.level)
      const params = []
      let whereClause = ""

      if (activeLevel !== "all") {
        whereClause = "WHERE s.level = ?"
        params.push(activeLevel)
      }

      const stories = await db.query(
        `SELECT s.id, s.title, s.level, s.summary,
                DATE_FORMAT(s.created_at, '%Y-%m-%d') AS created_at,
                CEIL(GREATEST(CHAR_LENGTH(s.body) / 900, 1)) AS estimated_minutes
         FROM stories s
         ${whereClause}
         ORDER BY s.created_at DESC, s.id DESC`,
        params
      )

      let continueReading = []
      if (req.session.user) {
        continueReading = await db.query(
          `SELECT rp.story_id, rp.percentage, DATE_FORMAT(rp.last_read_at, '%Y-%m-%d') AS last_read_at,
                  s.title, s.level,
                  CEIL(GREATEST(CHAR_LENGTH(s.body) / 900, 1)) AS estimated_minutes
           FROM reading_progress rp
           INNER JOIN stories s ON s.id = rp.story_id
           WHERE rp.user_id = ? AND rp.percentage BETWEEN 1 AND 99
           ORDER BY rp.last_read_at DESC
           LIMIT 5`,
          [req.session.user.id]
        )
      }

      const progressMap = {}
      if (req.session.user) {
        const userProgress = await db.query(
          `SELECT story_id, percentage FROM reading_progress WHERE user_id = ?`,
          [req.session.user.id]
        )
        userProgress.forEach((row) => {
          progressMap[row.story_id] = row.percentage
        })
      }

      res.render("library/index", {
        pageTitle: res.__ ? res.__("library.title") : "Library",
        stories,
        continueReading,
        activeLevel,
        storyLevels,
        progressMap,
      })
    })
  )

  router.post(
    "/progress",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.session.user.id
      if (!registerProgressHit(userId)) {
        return res.status(429).json({ success: false, message: "Too many updates" })
      }

      const storyId = Number.parseInt(req.body.storyId, 10)
      if (!Number.isFinite(storyId) || storyId <= 0) {
        return res.status(400).json({ success: false, message: "Invalid story" })
      }

      let percentage = Number.parseInt(req.body.percentage, 10)
      if (!Number.isFinite(percentage)) {
        percentage = 0
      }
      percentage = Math.max(0, Math.min(100, percentage))

      await db.pool.execute(
        `INSERT INTO reading_progress (user_id, story_id, percentage)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE percentage = VALUES(percentage), last_read_at = CURRENT_TIMESTAMP`,
        [userId, storyId, percentage]
      )

      res.json({ success: true })
    })
  )

  return router
}
