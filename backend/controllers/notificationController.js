const { db } = require("../config/db");

// GET USER NOTIFICATIONS
exports.getNotifications = async (req, res) => {
  const { limit = 50, unreadOnly = false } = req.query;
  
  try {
    let query = `
      SELECT 
        n.notificationid,
        n.type,
        n.title,
        n.message,
        n.relatedid,
        n.groupid,
        n.isread,
        n.createdat,
        mg.groupname
      FROM notifications n
      LEFT JOIN motshelogroups mg ON mg.groupid = n.groupid
      WHERE n.userid = $1
    `;
    
    const params = [req.user.id];
    
    if (unreadOnly === 'true') {
      query += ` AND n.isread = false`;
    }
    
    query += ` ORDER BY n.createdat DESC LIMIT $2`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// MARK NOTIFICATION AS READ
exports.markAsRead = async (req, res) => {
  const { notificationId } = req.params;
  
  try {
    await db.query(
      `UPDATE notifications SET isread = false, readat = NOW() WHERE notificationid = $1 AND userid = $2`,
      [notificationId, req.user.id]
    );
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// MARK ALL NOTIFICATIONS AS READ
exports.markAllAsRead = async (req, res) => {
  try {
    await db.query(
      `UPDATE notifications SET isread = false, readat = NOW() WHERE userid = $1`,
      [req.user.id]
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET UNREAD COUNT
exports.getUnreadCount = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE userid = $1 AND isread = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET PENDING MEMBERSHIP REQUESTS (for signatories)
exports.getPendingMembershipRequests = async (req, res) => {
  const { groupId } = req.params;
  
  try {
    // Check if user is a signatory of this group
    const signatoryCheck = await db.query(
      `SELECT 1 FROM groupmembers 
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );
    
    if (signatoryCheck.rows.length === 0) {
      return res.status(403).json({ error: "Only signatories can view membership requests" });
    }
    
    const result = await db.query(
      `SELECT * FROM vw_pending_membership_requests WHERE groupid = $1`,
      [groupId]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// APPROVE MEMBERSHIP REQUEST
exports.approveMembershipRequest = async (req, res) => {
  const { requestId } = req.params;

  console.log('📝 Approving membership request:', requestId, 'for user:', req.user.id);

  try {
    // Get request details to find group and user
    const requestCheck = await db.query(
      `SELECT groupid, userid FROM membershiprequests WHERE requestid = $1`,
      [requestId]
    );

    console.log('📊 Request check:', requestCheck.rows);

    if (requestCheck.rows.length === 0) {
      console.log('❌ Request not found');
      return res.status(404).json({ error: "Request not found" });
    }

    const groupId = requestCheck.rows[0].groupid;
    const joiningUserId = requestCheck.rows[0].userid;

    // Check if user is a signatory of this group
    const signatoryCheck = await db.query(
      `SELECT 1 FROM groupmembers
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );

    console.log('📊 Signatory check:', signatoryCheck.rows.length > 0);

    if (signatoryCheck.rows.length === 0) {
      console.log('❌ User is not a signatory');
      return res.status(403).json({ error: "Only signatories can approve requests" });
    }

    // Get the joining user's name for the notification
    const joiningUserResult = await db.query(
      `SELECT firstname, lastname FROM users WHERE userid = $1`,
      [joiningUserId]
    );
    const joiningUserName = joiningUserResult.rows[0];

    // Add user as member of the group with role 'member'
    const memberResult = await db.query(
      `INSERT INTO groupmembers (groupid, userid, role, joindate, isactive)
       VALUES ($1, $2, 'member', CURRENT_DATE, true)
       ON CONFLICT (groupid, userid) DO UPDATE SET isactive = true, role = 'member'
       RETURNING memberid`,
      [groupId, joiningUserId]
    );

    console.log('✅ User added to group with memberid:', memberResult.rows[0].memberid);

    // Update request status
    await db.query(
      `UPDATE membershiprequests
       SET status = 'approved', reviewedat = NOW(), reviewedby = $1, reviewnote = 'Approved by signatory'
       WHERE requestid = $2`,
      [req.user.id, requestId]
    );

    // Create group chat conversation for the new member
    try {
      await db.query(
        `INSERT INTO conversations (groupid, createdby, createdat)
         VALUES ($1, $2, NOW())
         ON CONFLICT (groupid) DO NOTHING`,
        [groupId, req.user.id]
      );

      await db.query(
        `INSERT INTO conversation_members (conversationid, userid, joinedat)
         SELECT conversationid, $1, NOW() FROM conversations WHERE groupid = $2
         ON CONFLICT (conversationid, userid) DO NOTHING`,
        [joiningUserId, groupId]
      );
      console.log('✅ Added user to group conversation');
    } catch (chatErr) {
      console.error('⚠️ Could not add to conversation:', chatErr.message);
    }

    // Create notification for the approved user
    await db.query(
      `INSERT INTO notifications (userid, type, title, message, relatedid, groupid)
       VALUES ($1, 'membership_approved', 'Join Request Approved', $2, $3, $4)`,
      [
        joiningUserId,
        `Your request to join the group has been approved! Welcome aboard!`,
        requestId,
        groupId
      ]
    );

    console.log('✅ Membership approved and user notified');

    res.json({ 
      message: "Membership request approved. User has been added to the group.",
      memberId: memberResult.rows[0].memberid
    });
  } catch (err) {
    console.error('❌ Error approving membership:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
};

// REJECT MEMBERSHIP REQUEST
exports.rejectMembershipRequest = async (req, res) => {
  const { requestId } = req.params;
  const { reason } = req.body;

  try {
    // Get request details to find group
    const requestCheck = await db.query(
      `SELECT groupid FROM membershiprequests WHERE requestid = $1`,
      [requestId]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    const groupId = requestCheck.rows[0].groupid;

    // Check if user is a signatory of this group
    const signatoryCheck = await db.query(
      `SELECT 1 FROM groupmembers
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );

    if (signatoryCheck.rows.length === 0) {
      return res.status(403).json({ error: "Only signatories can reject requests" });
    }

    await db.query("SELECT sp_reject_membership_request($1, $2, $3)", [requestId, req.user.id, reason || null]);
    res.json({ message: "Membership request rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// APPROVE LOAN REQUEST
exports.approveLoanRequest = async (req, res) => {
  const { loanId } = req.params;

  console.log('📝 Approving loan:', loanId, 'for user:', req.user.id);

  try {
    // Get loan details to find group
    const loanCheck = await db.query(
      `SELECT groupid, borrowermemberid FROM loans WHERE loanid = $1`,
      [loanId]
    );

    console.log('📊 Loan check result:', loanCheck.rows);

    if (loanCheck.rows.length === 0) {
      console.log('❌ Loan not found');
      return res.status(404).json({ error: "Loan request not found" });
    }

    const groupId = loanCheck.rows[0].groupid;

    // Check if user is a signatory of this group
    const signatoryCheck = await db.query(
      `SELECT 1 FROM groupmembers
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );

    console.log('📊 Signatory check:', signatoryCheck.rows.length > 0);

    if (signatoryCheck.rows.length === 0) {
      console.log('❌ User is not a signatory');
      return res.status(403).json({ error: "Only signatories can approve loan requests" });
    }

    // Check if borrower is trying to approve their own loan
    const borrowerCheck = await db.query(
      `SELECT memberid FROM groupmembers WHERE memberid = $1 AND userid = $2`,
      [loanCheck.rows[0].borrowermemberid, req.user.id]
    );

    if (borrowerCheck.rows.length > 0) {
      console.log('❌ User cannot approve their own loan');
      return res.status(403).json({ error: "You cannot approve your own loan request" });
    }

    // Update loan status to active (disbursed)
    await db.query(
      `UPDATE loans SET status = 'disbursed', disbursedat = NOW(), updatedat = NOW() WHERE loanid = $1`,
      [loanId]
    );

    console.log('✅ Loan approved and disbursed:', loanId);

    // Get borrower info for notification
    const borrowerResult = await db.query(
      `SELECT u.userid, u.firstname, u.lastname FROM groupmembers gm
       JOIN users u ON u.userid = gm.userid
       WHERE gm.memberid = $1`,
      [loanCheck.rows[0].borrowermemberid]
    );

    const borrower = borrowerResult.rows[0];

    // Create notification for borrower
    if (borrower) {
      await db.query(
        `INSERT INTO notifications (userid, type, title, message, relatedid, groupid)
         VALUES ($1, 'loan_approved', 'Loan Approved', $2, $3, $4)`,
        [
          borrower.userid,
          `Your loan request has been approved and disbursed.`,
          loanId,
          groupId
        ]
      );
      console.log('✅ Notification sent to borrower');
    }

    res.json({ message: "Loan request approved and disbursed" });
  } catch (err) {
    console.error('❌ Error approving loan:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
};

// REJECT LOAN REQUEST
exports.rejectLoanRequest = async (req, res) => {
  const { loanId } = req.params;
  const { reason } = req.body;

  try {
    // Get loan details to find group
    const loanCheck = await db.query(
      `SELECT groupid, borrowermemberid FROM loans WHERE loanid = $1`,
      [loanId]
    );

    if (loanCheck.rows.length === 0) {
      return res.status(404).json({ error: "Loan request not found" });
    }

    const groupId = loanCheck.rows[0].groupid;

    // Check if user is a signatory of this group
    const signatoryCheck = await db.query(
      `SELECT 1 FROM groupmembers
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );

    if (signatoryCheck.rows.length === 0) {
      return res.status(403).json({ error: "Only signatories can reject loan requests" });
    }

    // Update loan status to rejected
    await db.query(
      `UPDATE loans SET status = 'rejected', updatedat = NOW() WHERE loanid = $1`,
      [loanId]
    );

    // Create notification for borrower
    await db.query(
      `INSERT INTO notifications (userid, type, title, message, relatedid, groupid)
       VALUES ($1, 'loan_rejected', 'Loan Request Update', $2, $3, $4)`,
      [
        loanCheck.rows[0].borrowermemberid,
        reason || 'Your loan request was not approved.',
        loanId,
        groupId
      ]
    );

    res.json({ message: "Loan request rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
