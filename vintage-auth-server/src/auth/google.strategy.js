const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { pool } = require("../db");
const { signToken } = require("../utils/jwt");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;

        if (!email) {
          return done(null, false);
        }

        const [rows] = await pool.execute(
          "SELECT * FROM users WHERE email = ? LIMIT 1",
          [email]
        );

        let user;

        if (rows.length) {
          user = rows[0];
        } else {
          const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'GOOGLE')",
            [name, email]
          );

          user = {
            id: result.insertId,
            name,
            email,
          };
        }

        const token = signToken(user);

        return done(null, { token });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);
