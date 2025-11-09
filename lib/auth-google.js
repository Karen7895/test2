const passport = require("passport")
const { Strategy: GoogleStrategy } = require("passport-google-oauth20")

const db = require("./db")

function normalizeEmail(email = "") {
  return email.trim().toLowerCase()
}

async function findUserByEmail(email) {
  const rows = await db.query(
    "SELECT id, email FROM users WHERE email = ? LIMIT 1",
    [email]
  )
  return rows[0] || null
}

async function createUser(email) {
  try {
    const [result] = await db.pool.execute(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [email, null]
    )
    return { id: result.insertId, email }
  } catch (error) {
    if (error && error.code === "ER_BAD_NULL_ERROR") {
      error.message =
        "The users.password_hash column must allow NULL values for Google sign-in accounts."
    }
    throw error
  }
}

function getProfilePhoto(profile) {
  if (!profile || !Array.isArray(profile.photos)) return null
  const entry = profile.photos.find((photo) => Boolean(photo && photo.value))
  return entry ? entry.value : null
}

function configureGoogleAuth() {
  const clientID = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const callbackURL = process.env.GOOGLE_CALLBACK_URL

  if (!clientID || !clientSecret || !callbackURL) {
    console.warn(
      "Google OAuth environment variables are missing; Google login is disabled."
    )
    return
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const primaryEmail = profile?.emails?.[0]?.value
          if (!primaryEmail) {
            return done(null, false, {
              message: "Your Google account does not have a public email.",
            })
          }

          const normalizedEmail = normalizeEmail(primaryEmail)
          let user = await findUserByEmail(normalizedEmail)

          if (!user) {
            user = await createUser(normalizedEmail)
          }

          const userProfile = {
            id: user.id,
            email: normalizedEmail,
            name: profile?.displayName || null,
            photo: getProfilePhoto(profile),
          }

          return done(null, userProfile)
        } catch (error) {
          return done(error)
        }
      }
    )
  )
}

module.exports = configureGoogleAuth
