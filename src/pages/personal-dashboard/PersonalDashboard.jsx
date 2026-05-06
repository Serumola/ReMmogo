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
      console.log('Fetching dashboard data...');
      const response = await reportsAPI.getDashboard();
      console.log('Dashboard response:', response);

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
        console.error('Dashboard response error:', response);
        toast.error(response.error || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error('Unable to load dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

  const getActivityAmount = (item) => {
    if (item.type === 'contribution') {
      return parseFloat(item.amountpaid) || 0;
    }
    if (item.type === 'loan') {
      return parseFloat(item.principalamount) || 0;
    }
    return 0;
  };

  const getActivityDate = (item) => {
    const dateStr = item.type === 'contribution' 
      ? (item.submittedat || item.updatedat || item.createdat)
      : (item.disbursedat || item.requestedat || item.createdat);
    
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: 'numeric' });
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

  const billCards = [
    {
      label: "Total Contributions This Year",
      amount: `P${summary.totalContributions.toLocaleString("en-BW")}`,
      change: `${summary.contributionStatus.paid} months paid`,
      iconBg: "#2c3e1f",
    },
    {
      label: "Current Loan Balance",
      amount: `P${summary.totalLoanBalance.toLocaleString("en-BW")}`,
      change: "20% interest/month",
      iconBg: "#9db88a",
    },
    {
      label: "Interest Raised",
      amount: `P${Math.round(summary.totalInterestRaised).toLocaleString("en-BW")}`,
      change: "↑ across all groups",
      iconBg: "#b5c9a0",
    },
    {
      label: "Available Borrowing Limit",
      amount: `P${Math.round(summary.borrowingLimit).toLocaleString("en-BW")}`,
      change: "Based on contributions",
      iconBg: "#c8d5be",
    },
  ];

  const totalGauge = summary.contributionStatus.paid + summary.contributionStatus.pending + summary.contributionStatus.notPaid;
  const paidAngle = totalGauge > 0 ? (summary.contributionStatus.paid / totalGauge) * 251.3 : 0;
  const pendingAngle = totalGauge > 0 ? (summary.contributionStatus.pending / totalGauge) * 251.3 : 0;

  const groups = dashboardData?.groups || [];
  const loans = dashboardData?.loans?.filter(l => l.status === 'active' || l.status === 'disbursed') || [];
  const activities = dashboardData?.activities || [];

  return (
    <div className="dash">
      <SideBar />

      <div className="main">
        <DashboardNavBar />

        <div className="content">
          {/* Financial Overview */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Financial Overview</span>
              <Link to="/myGroups" className="see-all">See All ›</Link>
            </div>
            <div className="bills-grid">
              {billCards.map((card) => (
                <div key={card.label} className="bill-card">
                  <div className="bill-icon" style={{ background: card.iconBg }} />
                  <div className="bill-label">{card.label}</div>
                  <div className="bill-amount">{card.amount}</div>
                  <div className="bill-change">{card.change}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Contribution Status */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">My Monthly Contribution Status</span>
            </div>
            <div className="budget-legend">
              {[
                ["#2c3e1f", "Paid"],
                ["#9db88a", "Pending Approval"],
                ["#d5dece", "Not Paid"],
              ].map(([color, label]) => (
                <div key={label} className="legend-item">
                  <div className="legend-dot" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
            <div className="gauge-wrap">
              <svg width="200" height="120" viewBox="0 0 200 120">
                <path
                  d="M20,100 A80,80 0 0,1 180,100"
                  fill="none"
                  stroke="#d5dece"
                  strokeWidth="22"
                  strokeLinecap="round"
                />
                <path
                  d="M20,100 A80,80 0 0,1 180,100"
                  fill="none"
                  stroke="#9db88a"
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeDasharray="251.3"
                  strokeDashoffset={251.3 - paidAngle}
                />
                <path
                  d="M20,100 A80,80 0 0,1 180,100"
                  fill="none"
                  stroke="#2c3e1f"
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeDasharray="251.3"
                  strokeDashoffset={251.3 - paidAngle - pendingAngle}
                />
              </svg>
              <div className="gauge-label">
                <div className="gauge-avail">Total Paid</div>
                <div className="gauge-amount">P{(summary.contributionStatus.paid * 1000).toLocaleString()}</div>
                <div className="gauge-daily">{groups.length} groups this month</div>
              </div>
            </div>
          </div>

          {/* Loan Section */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">My Loan Section</span>
              <Link to="/myLoans" className="see-all">See All ›</Link>
            </div>

            <div className="alloc-total">Total Outstanding Loans</div>

            <div>
              <span className="alloc-amount">P{summary.totalLoanBalance.toLocaleString("en-BW")}</span>
              <span className="alloc-change">↑ 20% interest/month</span>
            </div>

            {loans.length > 0 ? (
              <>
                <table className="alloc-table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Status</th>
                      <th>Outstanding Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.loanid}>
                        <td>{loan.groupname || "Unknown Group"}</td>
                        <td>{loan.status === 'active' || loan.status === 'disbursed' ? 'Active' : loan.status}</td>
                        <td>P{(parseFloat(loan.outstandingbalance) || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="empty-state">No active loans</div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="panel">
            <div className="txn-header">
              <span className="panel-title">My Activity</span>
            </div>

            {(() => {
              // Combine contributions and loans into activity feed
              const allActivity = [];
              
              // Add contributions
              (dashboardData?.contributions || []).forEach(c => {
                allActivity.push({
                  type: 'contribution',
                  status: c.status,
                  group: c.groupname,
                  amount: parseFloat(c.amountpaid) || 0,
                  date: c.submittedat || c.createdat
                });
              });
              
              // Add loans
              (dashboardData?.loans || []).forEach(l => {
                allActivity.push({
                  type: 'loan',
                  status: l.status,
                  group: l.groupname,
                  amount: parseFloat(l.principalamount) || 0,
                  date: l.disbursedat || l.requestedat || l.createdat
                });
              });
              
              // Sort by date (most recent first)
              allActivity.sort((a, b) => new Date(b.date) - new Date(a.date));
              
              const recentActivity = allActivity.slice(0, 10);

              if (recentActivity.length > 0) {
                return recentActivity.map((item, idx) => (
                  <div key={idx} className="txn-row">
                    <div
                      className="txn-icon"
                      style={{ 
                        background: item.type === "loan" ? "#fdf0e0" : "#e8f0e0",
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px'
                      }}
                    >
                      {getActivityIcon(item.type, item.status)}
                    </div>
                    <div className="txn-info">
                      <div className="txn-name">{getActivityAction(item)}</div>
                      <div className="txn-cat">{item.group || 'Unknown Group'}</div>
                    </div>
                    <div className="txn-right">
                      <div className={`txn-amount ${item.amount > 0 ? "txn-positive" : ""}`}>
                        P{item.amount.toLocaleString()}
                      </div>
                      <div className="txn-date">
                        {getActivityDate(item)}
                      </div>
                    </div>
                  </div>
                ));
              }
              return <div className="empty-state">No recent activity</div>;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
