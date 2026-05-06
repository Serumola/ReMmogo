const { db } = require("../config/db");

// REQUEST TO JOIN GROUP (creates pending membership request)
exports.requestToJoin = async (req, res) => {
  const { groupId } = req.params;
  const { message } = req.body;

  try {
    // Check if group exists
    const groupCheck = await db.query(
      "SELECT groupid, groupname FROM motshelogroups WHERE groupid = $1 AND isactive = true",
      [groupId]
    );
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: "Group not found or inactive" });
    }

    // Check if user is already a member
    const existingMember = await db.query(
      "SELECT memberid FROM groupmembers WHERE groupid = $1 AND userid = $2 AND isactive = true",
      [groupId, req.user.id]
    );
    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: "You are already a member of this group" });
    }

    // Check if there's already a pending request
    const existingRequest = await db.query(
      "SELECT * FROM membershiprequests WHERE groupid = $1 AND userid = $2 AND status = 'pending'",
      [groupId, req.user.id]
    );
    if (existingRequest.rows.length > 0) {
      return res.status(400).json({ error: "You already have a pending request for this group" });
    }

    // Create membership request
    const result = await db.query(
      `INSERT INTO membershiprequests (groupid, userid, message, status, requestedat)
       VALUES ($1, $2, $3, 'pending', NOW()) RETURNING *`,
      [groupId, req.user.id, message || null]
    );

    // Create notification for all signatories of the group
    const signatories = await db.query(
      `SELECT gm.userid FROM groupmembers gm
       WHERE gm.groupid = $1 AND gm.role IN ('signatory', 'admin') AND gm.isactive = true`,
      [groupId]
    );

    // Get user's name (fallback to database if not in JWT)
    const userName = req.user.firstName && req.user.lastName 
      ? `${req.user.firstName} ${req.user.lastName}`
      : await (async () => {
          const userResult = await db.query("SELECT firstname, lastname FROM users WHERE userid = $1", [req.user.id]);
          return userResult.rows[0] ? `${userResult.rows[0].firstname} ${userResult.rows[0].lastname}` : 'A user';
        })();

    const notificationPromises = signatories.rows.map(async (sig) => {
      await db.query(
        `INSERT INTO notifications (userid, type, title, message, relatedid, groupid)
         VALUES ($1, 'join_request', 'New Join Request', $2, $3, $4)`,
        [
          sig.userid,
          `${userName} wants to join ${groupCheck.rows[0].groupname}`,
          result.rows[0].requestid,
          groupId
        ]
      );
    });

    await Promise.all(notificationPromises);

    res.status(201).json({ 
      message: "Join request sent successfully. Signatories will review your request.",
      request: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ENROLL MEMBER INTO GROUP (for direct enrollment by admin)
exports.enrollMember = async (req, res) => {
  const { groupId } = req.params;
  const { userId, role } = req.body;

  if (!userId) return res.status(400).json({ error: "userId is required" });

  const memberRole = role || "member";
  if (!["member", "signatory", "admin"].includes(memberRole)) {
    return res.status(400).json({ error: "Role must be member, signatory or admin" });
  }

  try {
    const userCheck = await db.query("SELECT userid FROM users WHERE userid = $1 AND isactive = true", [userId]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const existingMember = await db.query(
      "SELECT memberid FROM groupmembers WHERE groupid = $1 AND userid = $2",
      [groupId, userId]
    );
    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: "User is already a member of this group" });
    }

    if (memberRole === "signatory") {
      const sigCount = await db.query(
        "SELECT COUNT(*) AS cnt FROM groupmembers WHERE groupid = $1 AND role = 'signatory' AND isactive = true",
        [groupId]
      );
      if (parseInt(sigCount.rows[0].cnt) >= 2) {
        return res.status(400).json({ error: "Group already has 2 signatories" });
      }
    }

    const result = await db.query(
      `INSERT INTO groupmembers (groupid, userid, role, joindate)
       VALUES ($1, $2, $3, CURRENT_DATE) RETURNING *`,
      [groupId, userId, memberRole]
    );

    const member = result.rows[0];

    // Add to groupsignatories table if admin or signatory
    if (memberRole === "signatory" || memberRole === "admin") {
      await db.query(
        "INSERT INTO groupsignatories (groupid, memberid) VALUES ($1, $2) ON CONFLICT (groupid, memberid) DO NOTHING",
        [groupId, member.memberid]
      );
    }

    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL MEMBERS OF A GROUP WITH BALANCE DATA
exports.getGroupMembers = async (req, res) => {
  const { groupId } = req.params;
  try {
    const result = await db.query(
      `SELECT 
        gm.memberid, 
        gm.role, 
        gm.joindate, 
        gm.isactive,
        u.userid, 
        u.firstname, 
        u.lastname, 
        u.email, 
        u.phonenumber,
        COALESCE(mb.totalpaid, 0) AS totalpaid,
        COALESCE(mb.totalcontributions, 0) AS totalcontributions,
        COALESCE(mb.paidcontributions, 0) AS paidcontributions,
        COALESCE(mb.outstandingloans, 0) AS loanbalance,
        COALESCE(mb.totalloanstaken, 0) AS totalloanstaken
       FROM groupmembers gm
       INNER JOIN users u ON u.userid = gm.userid
       LEFT JOIN vw_member_balances mb ON mb.memberid = gm.memberid AND mb.groupid = gm.groupid
       WHERE gm.groupid = $1 AND gm.isactive = true
       ORDER BY gm.role DESC, u.firstname`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET GROUP SIGNATORIES
exports.getGroupSignatories = async (req, res) => {
  const { groupId } = req.params;
  try {
    // Fetch signatories from groupmembers table (admin and signatory roles)
    const result = await db.query(
      `SELECT 
        gm.memberid,
        gm.role,
        u.userid,
        u.firstname,
        u.lastname,
        u.email
       FROM groupmembers gm
       INNER JOIN users u ON u.userid = gm.userid
       WHERE gm.groupid = $1 AND gm.role IN ('signatory', 'admin') AND gm.isactive = true
       ORDER BY 
         CASE gm.role 
           WHEN 'admin' THEN 1 
           WHEN 'signatory' THEN 2 
           ELSE 3 
         END,
         u.firstname`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET MEMBER BALANCE (from view)
exports.getMemberBalance = async (req, res) => {
  const { groupId, memberId } = req.params;
  try {
    const result = await db.query(
      "SELECT * FROM vw_member_balances WHERE groupid = $1 AND memberid = $2",
      [groupId, memberId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Member not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL MEMBER BALANCES FOR A GROUP
exports.getAllMemberBalances = async (req, res) => {
  const { groupId } = req.params;
  try {
    const result = await db.query(
      "SELECT * FROM vw_member_balances WHERE groupid = $1 ORDER BY membername",
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// REMOVE MEMBER
exports.removeMember = async (req, res) => {
  const { groupId, memberId } = req.params;
  try {
    await db.query(
      "UPDATE groupmembers SET isactive = false WHERE memberid = $1 AND groupid = $2",
      [memberId, groupId]
    );
    res.json({ message: "Member removed from group" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
