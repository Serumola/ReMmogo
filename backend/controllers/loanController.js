const { db } = require("../config/db");

// REQUEST A LOAN
exports.requestLoan = async (req, res) => {
  const { groupId, principalAmount, notes } = req.body;

  console.log('📝 Loan request received:', { groupId, principalAmount, notes, userId: req.user?.id });

  if (!groupId || !principalAmount || principalAmount <= 0) {
    return res.status(400).json({ error: "groupId and valid principalAmount are required" });
  }

  try {
    // Check if user is a member of the group
    const memberCheck = await db.query(
      "SELECT memberid FROM groupmembers WHERE userid = $1 AND groupid = $2 AND isactive = true",
      [req.user.id, groupId]
    );
    
    if (memberCheck.rows.length === 0) {
      console.log('❌ User is not a member of this group');
      return res.status(403).json({ error: "You are not a member of this group" });
    }

    const borrowerMemberID = memberCheck.rows[0].memberid;
    console.log('✅ Borrower member ID:', borrowerMemberID);

    // Get group loan interest rate
    const groupCheck = await db.query(
      "SELECT loaninterestrate FROM motshelogroups WHERE groupid = $1",
      [groupId]
    );
    
    if (groupCheck.rows.length === 0) {
      console.log('❌ Group not found');
      return res.status(404).json({ error: "Group not found" });
    }
    
    const interestRate = groupCheck.rows[0].loaninterestrate;
    console.log('✅ Interest rate:', interestRate);

    // Create the loan
    const result = await db.query(
      `INSERT INTO loans (groupid, borrowermemberid, principalamount, interestrate, outstandingbalance, purpose, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval') RETURNING *`,
      [groupId, borrowerMemberID, principalAmount, interestRate, principalAmount, notes || null]
    );

    console.log('✅ Loan created:', result.rows[0].loanid);

    // Create notification for all signatories of the group (optional - don't fail if this fails)
    try {
      const signatories = await db.query(
        `SELECT gm.userid, gm.memberid FROM groupmembers gm
         WHERE gm.groupid = $1 AND gm.role IN ('signatory', 'admin') AND gm.isactive = true`,
        [groupId]
      );

      console.log('📢 Found signatories:', signatories.rows.length);

      const userResult = await db.query(
        "SELECT firstname, lastname FROM users WHERE userid = $1",
        [req.user.id]
      );
      const userName = userResult.rows[0];

      const notificationPromises = signatories.rows.map(async (sig) => {
        try {
          await db.query(
            `INSERT INTO notifications (userid, type, title, message, relatedid, groupid)
             VALUES ($1, 'loan_request', 'New Loan Request', $2, $3, $4)`,
            [
              sig.userid,
              `${userName.firstname} ${userName.lastname} requested a loan of P${principalAmount}`,
              result.rows[0].loanid,
              groupId
            ]
          );
          console.log('✅ Notification sent to signatory:', sig.userid);
        } catch (notifErr) {
          console.error('⚠️ Failed to create notification for signatory:', sig.userid, notifErr.message);
          // Don't fail the whole request if notification fails
        }
      });

      await Promise.all(notificationPromises);
      console.log('✅ All notifications sent');
    } catch (notifErr) {
      console.error('⚠️ Notification creation failed, but loan was created:', notifErr.message);
      // Don't fail the loan request if notifications fail
    }

    console.log('✅ Loan request completed successfully');
    res.status(201).json({ message: "Loan request submitted. Awaiting signatory approval.", loan: result.rows[0] });
  } catch (err) {
    console.error('❌ Loan request failed:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
};

// GET ALL LOANS FOR A GROUP
exports.getGroupLoans = async (req, res) => {
  const { groupId } = req.params;
  const { status } = req.query;

  try {
    let result;
    if (status) {
      result = await db.query(
        `SELECT l.*, u.firstname || ' ' || u.lastname AS borrowername
         FROM loans l
         INNER JOIN groupmembers gm ON gm.memberid = l.borrowermemberid
         INNER JOIN users u ON u.userid = gm.userid
         WHERE l.groupid = $1 AND l.status = $2
         ORDER BY l.requestedat DESC`,
        [groupId, status]
      );
    } else {
      result = await db.query(
        `SELECT l.*, u.firstname || ' ' || u.lastname AS borrowername
         FROM loans l
         INNER JOIN groupmembers gm ON gm.memberid = l.borrowermemberid
         INNER JOIN users u ON u.userid = gm.userid
         WHERE l.groupid = $1
         ORDER BY l.requestedat DESC`,
        [groupId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET MY LOANS
exports.getMyLoans = async (req, res) => {
  const { groupId } = req.params;
  try {
    const result = await db.query(
      `SELECT l.*
       FROM loans l
       INNER JOIN groupmembers gm ON gm.memberid = l.borrowermemberid
       WHERE gm.userid = $1 AND l.groupid = $2
       ORDER BY l.requestedat DESC`,
      [req.user.id, groupId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SIGNATORY APPROVES/REJECTS LOAN
exports.approveLoan = async (req, res) => {
  const { loanId } = req.params;
  const { decision, decisionNote, groupId } = req.body;

  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "Decision must be approved or rejected" });
  }

  try {
    const sigCheck = await db.query(
      `SELECT memberid FROM groupmembers
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );
    if (sigCheck.rows.length === 0) return res.status(403).json({ error: "Signatory access required" });

    const signatoryMemberID = sigCheck.rows[0].memberid;

    const loanCheck = await db.query(
      "SELECT status, borrowermemberid FROM loans WHERE loanid = $1",
      [loanId]
    );
    if (!["pending_approval", "approved"].includes(loanCheck.rows[0].status)) {
      return res.status(400).json({ error: "Loan is not pending approval" });
    }

    // FIX 1: Cannot approve own loan
    if (loanCheck.rows[0].borrowermemberid === signatoryMemberID) {
      return res.status(403).json({ error: "You cannot approve your own loan" });
    }

    // FIX 2: Cannot approve twice
    const alreadyApproved = await db.query(
      "SELECT 1 FROM loanapprovals WHERE loanid = $1 AND signatorymemberid = $2",
      [loanId, signatoryMemberID]
    );
    if (alreadyApproved.rows.length > 0) {
      return res.status(400).json({ error: "You have already approved this loan" });
    }

    await db.query(
      "INSERT INTO loanapprovals (loanid, signatorymemberid, decision, decisionnote) VALUES ($1, $2, $3, $4)",
      [loanId, signatoryMemberID, decision, decisionNote || null]
    );

    if (decision === "rejected") {
      await db.query("UPDATE loans SET status = 'rejected', updatedat = NOW() WHERE loanid = $1", [loanId]);
      return res.json({ message: "Loan rejected" });
    }

    const approvalCount = await db.query(
      "SELECT COUNT(*) AS cnt FROM loanapprovals WHERE loanid = $1 AND decision = 'approved'",
      [loanId]
    );

    if (parseInt(approvalCount.rows[0].cnt) >= 2) {
      await db.query(
        "UPDATE loans SET status = 'disbursed', disbursedat = NOW(), updatedat = NOW() WHERE loanid = $1",
        [loanId]
      );
      return res.json({ message: "Both signatories approved. Loan disbursed!" });
    }

    await db.query("UPDATE loans SET status = 'approved', updatedat = NOW() WHERE loanid = $1", [loanId]);
    res.json({ message: "Your approval recorded. Waiting for second signatory." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// MEMBER SUBMITS REPAYMENT
exports.submitRepayment = async (req, res) => {
  const { loanId } = req.params;
  const { amountPaid, proofOfPayment } = req.body;

  if (!amountPaid || amountPaid <= 0) {
    return res.status(400).json({ error: "Valid amount is required" });
  }

  try {
    const loanCheck = await db.query(
      `SELECT l.loanid, l.status, gm.userid
       FROM loans l
       INNER JOIN groupmembers gm ON gm.memberid = l.borrowermemberid
       WHERE l.loanid = $1`,
      [loanId]
    );
    if (loanCheck.rows.length === 0) return res.status(404).json({ error: "Loan not found" });
    if (loanCheck.rows[0].userid !== req.user.id) return res.status(403).json({ error: "Not your loan" });
    if (loanCheck.rows[0].status !== "disbursed") return res.status(400).json({ error: "Loan is not disbursed" });

    const memberCheck = await db.query(
      `SELECT gm.memberid FROM groupmembers gm
       INNER JOIN loans l ON l.borrowermemberid = gm.memberid
       WHERE l.loanid = $1`,
      [loanId]
    );

    const result = await db.query(
      `INSERT INTO loanrepayments (loanid, memberid, amountpaid, proofofpayment)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [loanId, memberCheck.rows[0].memberid, amountPaid, proofOfPayment || null]
    );

    res.status(201).json({ message: "Repayment submitted. Awaiting signatory approval.", repayment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SIGNATORY APPROVES REPAYMENT
exports.approveRepayment = async (req, res) => {
  const { repaymentId } = req.params;
  const { decision, decisionNote, groupId } = req.body;

  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "Decision must be approved or rejected" });
  }

  try {
    const sigCheck = await db.query(
      `SELECT memberid FROM groupmembers
       WHERE userid = $1 AND groupid = $2 AND role IN ('signatory', 'admin') AND isactive = true`,
      [req.user.id, groupId]
    );
    if (sigCheck.rows.length === 0) return res.status(403).json({ error: "Signatory access required" });

    const signatoryMemberID = sigCheck.rows[0].memberid;

    await db.query("SELECT sp_approve_repayment($1, $2, $3, $4)", [
      repaymentId,
      signatoryMemberID,
      decision,
      decisionNote || null,
    ]);

    res.json({ message: `Repayment ${decision}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET LOAN INTEREST SCHEDULE
exports.getLoanInterest = async (req, res) => {
  const { loanId } = req.params;
  try {
    const result = await db.query(
      "SELECT * FROM loaninterestschedule WHERE loanid = $1 ORDER BY periodmonth",
      [loanId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
