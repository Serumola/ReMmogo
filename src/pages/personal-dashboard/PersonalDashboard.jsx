import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SideBar from "../../components/sideBar/sideBar";
import DashboardNavBar from "../../components/NavBar/DashboardNavBar";
import { useToast } from "../../context/ToastContext";
import { reportsAPI } from "../../services/api";
import "./PersonalDashboard.css";

export default function PersonalDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [summary, setSummary] = useState({
    totalContributions: 0,
    totalLoanBalance: 0,
    totalInterestRaised: 0,
    borrowingLimit: 0,
    contributionStatus: { paid: 0, pending: 0, notPaid: 0 }
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await reportsAPI.getDashboard();

      if (response.success && response.data) {
        setDashboardData(response.data);
        setSummary(response.data.summary || {
          totalContributions: 0,
          totalLoanBalance: 0,
          totalInterestRaised: 0,
          borrowingLimit: 0,
          contributionStatus: { paid: 0, pending: 0, notPaid: 0 }
        });
      } else {
        toast.error(response.error || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error('Unable to load dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dash">
        <SideBar />
        <div className="main">
          <DashboardNavBar />
          <div className="content">
            <div className="loading-state">Loading dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  const groups = dashboardData?.groups || [];
  const contributions = dashboardData?.contributions || [];
  const loans = dashboardData?.loans?.filter(l => l.status === 'active' || l.status === 'disbursed') || [];
  
  // Build activity feed from actual data
  const activities = [];
  contributions.forEach(c => {
    activities.push({
      type: 'contribution',
      status: c.status,
      group: c.groupname,
      amount: parseFloat(c.amountpaid) || 0,
      date: c.submittedat || c.createdat
    });
  });
  loans.forEach(l => {
    activities.push({
      type: 'loan',
      status: l.status,
      group: l.groupname,
      amount: parseFloat(l.principalamount) || 0,
      date: l.disbursedat || l.requestedat || l.createdat
    });
  });
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));

  const getActivityIcon = (type, status) => {
    if (type === 'contribution') {
      if (status === 'paid' || status === 'approved') return '💵';
      if (status === 'pending' || status === 'submitted') return '⏳';
      return '📋';
    }
    if (type === 'loan') {
      if (status === 'disbursed' || status === 'active') return '💰';
      if (status === 'approved') return '✅';
      if (status === 'pending_approval' || status === 'pending') return '⏳';
      if (status === 'rejected') return '❌';
      return '📋';
    }
    return '📌';
  };

  const getActivityAction = (item) => {
    if (item.type === 'contribution') {
      if (item.status === 'paid' || item.status === 'approved') return 'Contribution paid';
      if (item.status === 'pending' || item.status === 'submitted') return 'Contribution submitted';
      return 'Contribution recorded';
    }
    if (item.type === 'loan') {
      if (item.status === 'disbursed' || item.status === 'active') return 'Loan disbursed';
      if (item.status === 'approved') return 'Loan approved';
      if (item.status === 'pending_approval' || item.status === 'pending') return 'Loan requested';
      if (item.status === 'rejected') return 'Loan rejected';
      return 'Loan activity';
    }
    return 'Activity';
  };

  const getActivityDate = (item) => {
    const dateStr = item.type === 'contribution' 
      ? (item.submittedat || item.updatedat || item.createdat)
      : (item.disbursedat || item.requestedat || item.createdat);
    
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: 'numeric' });
  };

  return (
    <div className="dash">
      <SideBar />

      <div className="main">
        <DashboardNavBar />

        <div className="content">
          {/* Financial Overview Cards */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Financial Overview</span>
            </div>
            <div className="dashboard-grid-4">
              <div className="stat-card stat-card--primary">
                <div className="stat-card-icon">💰</div>
                <div className="stat-card-label">Total Contributions This Year</div>
                <div className="stat-card-value">P{summary.totalContributions.toLocaleString("en-BW")}</div>
                <div className="stat-card-sub">{summary.contributionStatus.paid} months paid</div>
              </div>

              <div className="stat-card stat-card--secondary">
                <div className="stat-card-icon">📊</div>
                <div className="stat-card-label">Current Loan Balance</div>
                <div className="stat-card-value">P{summary.totalLoanBalance.toLocaleString("en-BW")}</div>
                <div className="stat-card-sub">20% interest/month</div>
              </div>

              <div className="stat-card stat-card--tertiary">
                <div className="stat-card-icon">📈</div>
                <div className="stat-card-label">Interest Raised</div>
                <div className="stat-card-value">P{Math.round(summary.totalInterestRaised).toLocaleString("en-BW")}</div>
                <div className="stat-card-sub">System earnings</div>
              </div>

              <div className="stat-card stat-card--accent">
                <div className="stat-card-icon">💳</div>
                <div className="stat-card-label">Available Borrowing Limit</div>
                <div className="stat-card-value">P{Math.round(summary.borrowingLimit).toLocaleString("en-BW")}</div>
                <div className="stat-card-sub">Based on contributions</div>
              </div>
            </div>
          </div>

          {/* Contribution Status & Monthly Overview */}
          <div className="dashboard-grid-2">
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">My Monthly Contribution Status</span>
              </div>
              <div className="contribution-status-grid">
                <div className="status-card">
                  <div className="status-card-dot status-card-dot--paid"></div>
                  <div className="status-card-label">Paid</div>
                  <div className="status-card-value">{summary.contributionStatus.paid}</div>
                </div>
                <div className="status-card">
                  <div className="status-card-dot status-card-dot--pending"></div>
                  <div className="status-card-label">Pending Approval</div>
                  <div className="status-card-value">{summary.contributionStatus.pending}</div>
                </div>
                <div className="status-card">
                  <div className="status-card-dot status-card-dot--notpaid"></div>
                  <div className="status-card-label">Not Paid</div>
                  <div className="status-card-value">{summary.contributionStatus.notPaid}</div>
                </div>
              </div>
              <div className="gauge-container">
                <div className="gauge">
                  <svg viewBox="0 0 200 120">
                    <path
                      d="M20,100 A80,80 0 0,1 180,100"
                      fill="none"
                      stroke="#e8f0e0"
                      strokeWidth="22"
                      strokeLinecap="round"
                    />
                    <path
                      d="M20,100 A80,80 0 0,1 180,100"
                      fill="none"
                      stroke="#2c3e1f"
                      strokeWidth="22"
                      strokeLinecap="round"
                      strokeDasharray="251.3"
                      strokeDashoffset={251.3 - ((summary.contributionStatus.paid / 12) * 251.3)}
                    />
                  </svg>
                  <div className="gauge-label">
                    <div className="gauge-label-title">Total Paid</div>
                    <div className="gauge-label-value">P{(summary.contributionStatus.paid * 1000).toLocaleString()}</div>
                    <div className="gauge-label-sub">of P12,000 yearly target</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">My Groups</span>
                <Link to="/myGroups" className="see-all">See All ›</Link>
              </div>
              {groups.length > 0 ? (
                <div className="groups-list-compact">
                  {groups.slice(0, 3).map(group => (
                    <Link to={`/GrpDash?id=${group.groupid}`} key={group.groupid} className="group-item-compact">
                      <div className="group-item-avatar">{group.groupname.charAt(0).toUpperCase()}</div>
                      <div className="group-item-info">
                        <div className="group-item-name">{group.groupname}</div>
                        <div className="group-item-role">{group.role}</div>
                      </div>
                      <div className="group-item-arrow">→</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-text">No groups yet</div>
                  <Link to="/explore" className="btn-primary btn-sm">Explore Groups</Link>
                </div>
              )}
            </div>
          </div>

          {/* Loans Section */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">My Active Loans</span>
              <Link to="/myLoans" className="see-all">See All ›</Link>
            </div>
            {loans.length > 0 ? (
              <div className="loans-grid">
                {loans.map(loan => (
                  <div key={loan.loanid} className="loan-card">
                    <div className="loan-card-header">
                      <div className="loan-card-group">{loan.groupname}</div>
                      <span className="loan-card-status loan-card-status--active">Active</span>
                    </div>
                    <div className="loan-card-body">
                      <div className="loan-card-amount">P{(parseFloat(loan.principalamount) || 0).toLocaleString()}</div>
                      <div className="loan-card-details">
                        <span>Balance: P{(parseFloat(loan.outstandingbalance) || 0).toLocaleString()}</span>
                        <span>{(parseFloat(loan.interestrate) * 100).toFixed(0)}% interest/mo</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">💰</div>
                <div className="empty-state-text">No active loans</div>
                <Link to="/myLoans" className="btn-outline btn-sm">Request a Loan</Link>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Recent Activity</span>
            </div>
            {activities.length > 0 ? (
              <div className="activity-feed">
                {activities.slice(0, 8).map((item, idx) => (
                  <div key={idx} className="activity-item">
                    <div className="activity-icon">
                      {getActivityIcon(item.type, item.status)}
                    </div>
                    <div className="activity-info">
                      <div className="activity-title">{getActivityAction(item)}</div>
                      <div className="activity-group">{item.group || 'Unknown Group'}</div>
                    </div>
                    <div className="activity-right">
                      <div className="activity-amount">P{item.amount.toLocaleString()}</div>
                      <div className="activity-date">{getActivityDate(item)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-text">No recent activity</div>
                <div className="empty-state-sub">Start by making a contribution or requesting a loan</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
