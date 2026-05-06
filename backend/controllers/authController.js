const { db } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// REGISTER
exports.register = async (req, res) => {
  const { firstName, lastName, email, password, phoneNumber, nationalID } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: "First name, last name, email and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const checkUser = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (firstname, lastname, email, phonenumber, passwordhash, nationalid)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING userid, firstname, lastname, email`,
      [firstName, lastName, email, phoneNumber || null, hashedPassword, nationalID || null]
    );

    const user = result.rows[0];
    const token = jwt.sign({ 
      id: user.userid, 
      email: user.email,
      firstName: user.firstname,
      lastName: user.lastname
    }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.status(201).json({
      token,
      user: { id: user.userid, firstName: user.firstname, lastName: user.lastname, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1 AND isactive = true", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordhash);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ 
      id: user.userid, 
      email: user.email,
      firstName: user.firstname,
      lastName: user.lastname
    }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.json({
      token,
      user: { id: user.userid, firstName: user.firstname, lastName: user.lastname, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET CURRENT USER PROFILE
exports.getProfile = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT userid, firstname, lastname, email, phonenumber, nationalid, createdat FROM users WHERE userid = $1",
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE USER PROFILE
exports.updateProfile = async (req, res) => {
  const { firstName, lastName, phoneNumber, nationalID } = req.body;

  try {
    const result = await db.query(
      `UPDATE users 
       SET firstname = $1, lastname = $2, phonenumber = $3, nationalid = $4, updatedat = NOW()
       WHERE userid = $5
       RETURNING userid, firstname, lastname, email, phonenumber, nationalid`,
      [firstName || null, lastName || null, phoneNumber || null, nationalID || null, req.user.id]
    );
    res.json({ message: "Profile updated successfully", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE USER PASSWORD
exports.updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Verify current password
    const userResult = await db.query("SELECT passwordhash FROM users WHERE userid = $1", [req.user.id]);
    const user = userResult.rows[0];

    const isMatch = await bcrypt.compare(currentPassword, user.passwordhash);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      "UPDATE users SET passwordhash = $1, updatedat = NOW() WHERE userid = $2",
      [hashedPassword, req.user.id]
    );

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
