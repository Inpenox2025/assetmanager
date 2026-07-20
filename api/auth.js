const { getSQL } = require("../shared/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "asset_management_super_secret_key_2026";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sql = getSQL();
  const action = req.query.action || (req.body && req.body.action) || "login";

  try {
    // 1. LOGIN ACTION
    if (action === "login" && req.method === "POST") {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "Username and Password are required" });
      }

      // Check users table
      const users = await sql`SELECT * FROM users WHERE LOWER(username) = LOWER(${username})`;
      
      let user = users[0];

      // Default fallback match for superadmin if setup hasn't run
      if (!user && (username === "superadmin" || username === "admin")) {
        if (password === "admin123") {
          user = {
            id: 1,
            username: "superadmin",
            role: "super_admin",
            email: "admin@inducare.com"
          };
        }
      } else if (user) {
        const passwordMatches = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatches) {
          return res.status(401).json({ error: "Invalid username or password" });
        }
      } else {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role, companyId: user.company_id },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(200).json({
        success: true,
        message: "Login successful!",
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          company_id: user.company_id,
          email: user.email
        }
      });
    }

    // 2. RESET PASSWORD ACTION
    if (action === "reset-password" && req.method === "POST") {
      const { username, newPassword } = req.body || {};
      if (!username || !newPassword) {
        return res.status(400).json({ error: "Username and New Password are required" });
      }

      if (newPassword.length < 4) {
        return res.status(400).json({ error: "New Password must be at least 4 characters long" });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      
      const updated = await sql`
        UPDATE users
        SET password_hash = ${newHash}
        WHERE LOWER(username) = LOWER(${username})
        RETURNING id, username, role
      `;

      if (updated.length === 0) {
        // Create user if not exists yet
        const created = await sql`
          INSERT INTO users (username, password_hash, role)
          VALUES (${username}, ${newHash}, 'super_admin')
          RETURNING id, username, role
        `;
        return res.status(200).json({
          success: true,
          message: `Password reset successfully for user '${username}'!`
        });
      }

      return res.status(200).json({
        success: true,
        message: `Password reset successfully for user '${username}'!`
      });
    }

    // 3. GET CURRENT USER
    if (action === "me" && req.method === "GET") {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "No Authorization token provided" });
      }

      const token = authHeader.replace("Bearer ", "");
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return res.status(200).json({ success: true, user: decoded });
      } catch (err) {
        return res.status(401).json({ error: "Invalid or expired session token" });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Auth API Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
