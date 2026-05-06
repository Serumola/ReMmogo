const { db } = require("../config/db");

// GET PERSONALIZED DASHBOARD DATA FOR AUTHENTICATED USER
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📊 Dashboard request for userId:', userId);

    // Get user's groups
    const userGroups = await db.query(
      `SELECT mg.groupid, mg.groupname, mg.monthlycontribution, mg.loaninterestrate,
              gm.memberid, gm.role, gm.joindate
       FROM groupmembers gm
       INNER JOIN motshelogroups mg ON mg.groupid = gm.groupid
       WHERE gm.userid = $1 AND gm.isactive = true AND mg.isactive = true`,
      [userId]
    );
    console.log('✅ User groups:', userGroups.rows.length);

    // Get user's contributions across all groups - FIXED QUERY
    const contributions = await db.query(
      `SELECT mc.*, mg.groupname, gm.memberid, gm.userid
       FROM monthlycontributions mc
       INNER JOIN groupmembers gm ON gm.memberid = mc.memberid
       INNER JOIN motshelogroups mg ON mg.groupid = mc.groupid
       WHERE gm.userid = $1
       ORDER BY COALESCE(mc.submittedat, mc.updatedat, mc.createdat) DESC`,
      [userId]
    );
    console.log('✅ User contributions:', contributions.rows.length);

    // Get user's loans across all groups - FIXED QUERY
    const loans = await db.query(
      `SELECT l.*, mg.groupname, gm.memberid as borrowermemberid, gm.userid
       FROM loans l
       INNER JOIN groupmembers gm ON gm.memberid = l.borrowermemberid
       INNER JOIN motshelogroups mg ON mg.groupid = l.groupid
       WHERE gm.userid = $1
       ORDER BY COALESCE(l.disbursedat, l.requestedat, l.createdat) DESC`,
      [userId]
    );
    console.log('✅ User loans:', loans.rows.length);

    // Calculate totals
    const totalContributions = contributions.rows
      .filter(c => c.status === 'paid' || c.status === 'approved')
      .reduce((sum, c) => sum + (parseFloat(c.amountpaid) || 0), 0);

    const totalLoanBalance = loans.rows
      .filter(l => l.status === 'active' || l.status === 'disbursed')
      .reduce((sum, l) => sum + (parseFloat(l.outstandingbalance) || 0), 0);

    // Calculate interest raised (15% of paid contributions as a simplified calculation)
    const totalInterestRaised = totalContributions * 0.15;

    // Borrowing limit (typically 80% of total contributions or based on group rules)
    const borrowingLimit = totalContributions * 0.8;

    // Contribution status breakdown
    const contributionStatus = {
      paid: contributions.rows.filter(c => c.status === 'paid' || c.status === 'approved').length,
      pending: contributions.rows.filter(c => c.status === 'pending' || c.status === 'submitted').length,
      notPaid: contributions.rows.filter(c => c.status === 'not_paid' || !c.status).length
    };

    // Build recent activity feed
    const activities = [];

    // Add contributions to activity
    contributions.rows.slice(0, 5).forEach(c => {
      activities.push({
        type: 'contribution',
        action: c.status === 'paid' ? 'Made contribution' : 'Submitted contribution',
        group: c.groupname,
        amount: parseFloat(c.amountpaid) || 0,
        date: c.submittedat || c.updatedat || c.createdat,
        status: c.status
      });
    });

    // Add loans to activity
    loans.rows.slice(0, 5).forEach(l => {
      let action = 'Requested loan';
      if (l.status === 'disbursed' || l.status === 'active') action = 'Loan disbursed';
      if (l.status === 'approved') action = 'Loan approved';
      if (l.status === 'rejected') action = 'Loan rejected';

      activities.push({
        type: 'loan',
        action: action,
        group: l.groupname,
        amount: parseFloat(l.principalamount) || 0,
        date: l.disbursedat || l.createdat,
        status: l.status
      });
    });

    // Sort activities by date (most recent first)
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: {
        groups: userGroups.rows,
        contributions: contributions.rows,
        loans: loans.rows,
        summary: {
          totalContributions,
          totalLoanBalance,
          totalInterestRaised,
          borrowingLimit,
          contributionStatus
        },
        activities: activities.slice(0, 10) // Last 10 activities
      }
    });
  } catch (err) {
    console.error("❌ Error fetching dashboard data:", err);
    console.error("Stack trace:", err.stack);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};

// Get year-end report for a group
exports.getYearEndReport = async (req, res) => {
  const { groupId } = req.params;
  
  try {
    const result = await db.query(
      "SELECT * FROM vw_year_end_report WHERE groupid = $1",
      [groupId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching year-end report:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get group summary statistics
exports.getGroupSummary = async (req, res) => {
  const { groupId } = req.params;
  
  try {
    const group = await db.query(
      "SELECT * FROM motshelogroups WHERE groupid = $1",
      [groupId]
    );
    
    if (group.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }
    
    const memberCount = await db.query(
      "SELECT COUNT(*) as count FROM groupmembers WHERE groupid = $1 AND isactive = true",
      [groupId]
    );
    
    const totalContributions = await db.query(
      "SELECT SUM(amountpaid) as total FROM monthlycontributions WHERE groupid = $1 AND status = 'paid'",
      [groupId]
    );
    
    const totalLoans = await db.query(
      "SELECT SUM(outstandingbalance) as total FROM loans WHERE groupid = $1 AND status = 'active'",
      [groupId]
    );
    
    res.json({
      success: true,
      data: {
        group: group.rows[0],
        memberCount: memberCount.rows[0].count,
        totalContributions: totalContributions.rows[0].total || 0,
        totalLoans: totalLoans.rows[0].total || 0
      }
    });
  } catch (err) {
    console.error("Error fetching group summary:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get member statement
exports.getMemberStatement = async (req, res) => {
  const { groupId, memberId } = req.params;
  
  try {
    const result = await db.query(
      "SELECT * FROM vw_member_balances WHERE groupid = $1 AND memberid = $2",
      [groupId, memberId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Error fetching member statement:", err);
    res.status(500).json({ error: err.message });
  }
};
