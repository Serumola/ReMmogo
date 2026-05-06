import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SideBar from '../../components/sideBar/sideBar';
import DashboardNavBar from '../../components/NavBar/DashboardNavBar';
import { useToast } from '../../context/ToastContext';
import { groupsAPI, membersAPI, contributionsAPI, loansAPI, notificationsAPI } from '../../services/api';
import './grp-dash.css';

const STATUS_STYLE = {
  'Good Standing': { bg: '#e8f0e0', color: '#2c3e1f' },
  'Loan Active': { bg: '#fff8e0', color: '#a07800' },
  'Behind': { bg: '#fce8e8', color: '#c0392b' },
};

const TABS = ['Overview', 'Members', 'Approvals', 'Reports'];

export default function GroupDashboard() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('id');
  const toast = useToast();
  
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [signatories, setSignatories] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ userId: '', role: 'member' });
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (groupId) {
      fetchGroupData();
    }
  }, [groupId]);

  const fetchGroupData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch group details
      const groupRes = await groupsAPI.getOne(groupId);
      if (groupRes.success && groupRes.data) {
        setGroup(groupRes.data);
      } else {
        setError('Failed to load group details');
        return;
      }

      // Fetch members with balance data
      const membersRes = await membersAPI.getAll(groupId);
      if (membersRes.success && membersRes.data) {
        setMembers(membersRes.data);
      }

      // Fetch signatories
      const signatoriesRes = await membersAPI.getSignatories(groupId);
      if (signatoriesRes.success && signatoriesRes.data) {
        setSignatories(signatoriesRes.data);
      }

      // Fetch all users for invite modal
      const usersRes = await membersAPI.getAllUsers();
      if (usersRes.success && usersRes.data) {
        setAllUsers(usersRes.data);
      }

      // Fetch contributions
      const contribRes = await contributionsAPI.getAll(groupId);
      if (contribRes.success && contribRes.data) {
        setContributions(contribRes.data);
      }

      // Fetch loans
      const loansRes = await loansAPI.getAll(groupId);
      if (loansRes.success && loansRes.data) {
        setLoans(loansRes.data);
      }

      // Build pending approvals from contributions and loans
      const approvals = [];

      // Add pending loan approvals
      loansRes.data?.forEach(loan => {
        if (loan.status === 'pending_approval' || loan.status === 'pending' || loan.status === 'approved') {
          approvals.push({
            type: 'Loan Request',
            memberId: loan.borrowermemberid,
            member: loan.borrowername || 'Unknown Member',
            amount: loan.principalamount,
            date: loan.requestedat ? new Date(loan.requestedat).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown',
            approvals: 0,
            loanId: loan.loanid,
          });
        }
      });

      // Add pending contribution approvals
      contribRes.data?.forEach(contrib => {
        if (contrib.status === 'submitted' || contrib.status === 'pending') {
          approvals.push({
            type: 'Contribution',
            memberId: contrib.memberid,
            member: contrib.membername || 'Unknown Member',
            amount: contrib.amountpaid,
            date: contrib.updatedat ? new Date(contrib.updatedat).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown',
            approvals: 0,
            contributionId: contrib.contributionid,
          });
        }
      });

      setPendingApprovals(approvals);
    } catch (err) {
      console.error('Error fetching group data:', err);
      setError('Unable to load group data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (approval) => {
    try {
      let response;

      if (approval.type === 'Loan Request') {
        response = await notificationsAPI.approveLoan(approval.loanId);
      } else if (approval.type === 'Contribution') {
        response = await contributionsAPI.update(approval.contributionId, {
          status: 'paid',
        });
      }

      if (response?.success) {
        toast.success(`${approval.type} approved successfully`);
        fetchGroupData();
      } else {
        toast.error(response?.error || 'Failed to approve');
      }
    } catch (err) {
      toast.error('Failed to approve. Please try again.');
    }
  };

  const handleReject = async (approval) => {
    try {
      let response;

      if (approval.type === 'Loan Request') {
        const reason = prompt('Enter reason for rejection (optional):');
        if (reason === null) return; // User cancelled
        response = await notificationsAPI.rejectLoan(approval.loanId, reason || undefined);
      } else if (approval.type === 'Contribution') {
        response = await contributionsAPI.update(approval.contributionId, {
          status: 'not_paid',
        });
      }

      if (response?.success) {
        toast.success(`${approval.type} rejected`);
        fetchGroupData();
      } else {
        toast.error(response?.error || 'Failed to reject');
      }
    } catch (err) {
      toast.error('Failed to reject. Please try again.');
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.userId) {
      toast.error('Please select a user to invite');
      return;
    }

    try {
      setInviting(true);
      const response = await membersAPI.invite(groupId, inviteForm.userId, inviteForm.role);
      
      if (response.success) {
        toast.success(`User invited as ${inviteForm.role}`);
        setShowInvite(false);
        setInviteForm({ userId: '', role: 'member' });
        fetchGroupData(); // Refresh members list
      } else {
        toast.error(response.error || 'Failed to invite user');
      }
    } catch (err) {
      toast.error('Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  // Calculate statistics
  const totalContributions = members.reduce((sum, m) => sum + (m.totalpaid || 0), 0);
  const totalInterest = members.reduce((sum, m) => sum + ((m.paidcontributions || 0) * 0.15), 0); // 15% interest on contributions
  const totalLoans = members.reduce((sum, m) => sum + (m.loanbalance || 0), 0);

  // Format signatories names
  const signatoriesList = signatories.map(s => `${s.firstname} ${s.lastname}`).join(' · ');

  if (loading) {
    return (
      <div className="dash">
        <SideBar />
        <div className="main">
          <DashboardNavBar />
          <div className="gd-content">
            <div className="loading-state">Loading group dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="dash">
        <SideBar />
        <div className="main">
          <DashboardNavBar />
          <div className="gd-content">
            <div className="error-state">
              <h3>Oops! Something went wrong</h3>
              <p>{error || 'Group not found'}</p>
              <button onClick={fetchGroupData} className="gd-retry-btn">Try Again</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      <SideBar />
      <div className="main">
        <DashboardNavBar />
        <div className="gd-content">

          {/* Group header */}
          <div className="gd-group-header">
            <div className="gd-group-avatar">
              {group.groupname.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="gd-group-info">
              <h2 className="gd-group-name">{group.groupname}</h2>
              <p className="gd-group-desc">{group.description || 'A motshelo savings group'}</p>
              <div className="gd-signatories">
                {signatories.length > 0 ? (
                  <>Signatories: {signatoriesList}</>
                ) : (
                  <>Signatories: None assigned</>
                )}
              </div>
            </div>
            <div className="gd-header-badge">
              <span className="gd-active-badge">{group.isactive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="gd-tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={`gd-tab${tab === t ? ' gd-tab--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
                {t === 'Approvals' && pendingApprovals.length > 0 && (
                  <span className="gd-tab-badge">{pendingApprovals.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ===== Overview ===== */}
          {tab === 'Overview' && (
            <div className="gd-tab-content">
              <div className="gd-stats-grid">
                <div className="gd-stat-card">
                  <span className="gd-stat-label">Total Pool</span>
                  <span className="gd-stat-value">P{(group.monthlycontribution || 0 * group.membercount || 0 * 12).toLocaleString()}</span>
                  <span className="gd-stat-sub">{group.membercount || 0} members × 12 months</span>
                </div>
                <div className="gd-stat-card">
                  <span className="gd-stat-label">Contributions Collected</span>
                  <span className="gd-stat-value">P{totalContributions.toLocaleString()}</span>
                  <span className="gd-stat-sub">So far this year</span>
                </div>
                <div className="gd-stat-card">
                  <span className="gd-stat-label">Interest Raised</span>
                  <span className="gd-stat-value">P{totalInterest.toLocaleString()}</span>
                  <span className="gd-stat-sub">Target: P{((group.membercount || 0) * 5000).toLocaleString()}</span>
                </div>
                <div className="gd-stat-card">
                  <span className="gd-stat-label">Outstanding Loans</span>
                  <span className="gd-stat-value gd-loan-val">P{totalLoans.toLocaleString()}</span>
                  <span className="gd-stat-sub">20% interest/month applies</span>
                </div>
              </div>

              <div className="gd-panel">
                <div className="gd-panel-title">Group Rules</div>
                <ul className="gd-rules-list">
                  <li>Only members may borrow from the motshelo</li>
                  <li>Loans attract 20% interest on the outstanding balance each month</li>
                  <li>Each member must contribute P1,000 per month</li>
                  <li>Each member must raise P5,000 in interest by year end</li>
                  <li>Loan disbursement requires approval by both signatories</li>
                  <li>Payment recording and loan repayments require signatory approval to reflect</li>
                </ul>
              </div>
            </div>
          )}

          {/* ===== Members ===== */}
          {tab === 'Members' && (
            <div className="gd-tab-content">
              <div className="gd-panel">
                <div className="gd-panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>All Members ({members.length})</span>
                  {group && (group.role === 'admin' || group.role === 'signatory') && (
                    <button className="gd-btn-primary" onClick={() => setShowInvite(true)} style={{ padding: '8px 16px', fontSize: '12px' }}>
                      + Invite Member
                    </button>
                  )}
                </div>
                <table className="gd-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Contributions</th>
                      <th>Interest Raised</th>
                      <th>Loan Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.length > 0 ? (
                      members.map((m, i) => {
                        const contributionCount = m.totalcontributions || 0;
                        const contributionAmount = m.totalpaid || 0;
                        const interestRaised = (m.paidcontributions || 0) * 0.15; // 15% interest
                        const loanBalance = m.loanbalance || 0;
                        
                        // Determine status based on actual data
                        let status = 'Good Standing';
                        if (loanBalance > 0) {
                          status = 'Loan Active';
                        } else if (contributionCount < 3) {
                          status = 'Behind';
                        }
                        
                        const statusStyle = STATUS_STYLE[status];
                        
                        return (
                          <tr key={m.memberid || i}>
                            <td className="gd-member-name">
                              <span className="gd-member-avatar">
                                {(m.firstname || m.membername || 'M').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                              {m.firstname ? `${m.firstname} ${m.lastname}` : (m.membername || 'Unknown Member')}
                            </td>
                            <td>{m.role || 'Member'}</td>
                            <td>P{contributionAmount.toLocaleString()} ({contributionCount} mo)</td>
                            <td>P{interestRaised.toLocaleString()}</td>
                            <td className={loanBalance > 0 ? 'gd-loan-val' : ''}>
                              {loanBalance > 0 ? `P${loanBalance.toLocaleString()}` : '—'}
                            </td>
                            <td>
                              <span className="gd-status-badge" style={statusStyle}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="gd-empty-cell">No members yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== Approvals ===== */}
          {tab === 'Approvals' && (
            <div className="gd-tab-content">
              <div className="gd-info-note">
                As a signatory, you can approve or reject pending loan requests, contributions, and repayments. Both signatories must approve for items to reflect.
              </div>
              <div className="gd-panel">
                <div className="gd-panel-title">Pending Approvals ({pendingApprovals.length})</div>
                {pendingApprovals.length > 0 ? (
                  pendingApprovals.map((a, i) => (
                    <div key={i} className="gd-approval-row">
                      <div className="gd-approval-info">
                        <span className="gd-approval-type">{a.type}</span>
                        <span className="gd-approval-member">{a.member} · P{(a.amount || 0).toLocaleString()} · {a.date}</span>
                        <span className="gd-approval-approvals">{a.approvals}/2 approvals</span>
                      </div>
                      <div className="gd-approval-actions">
                        <button className="gd-btn-approve" onClick={() => handleApprove(a)}>Approve</button>
                        <button className="gd-btn-reject" onClick={() => handleReject(a)}>Reject</button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="gd-empty-state">No pending approvals</div>
                )}
              </div>
            </div>
          )}

          {/* ===== Reports ===== */}
          {tab === 'Reports' && (
            <div className="gd-tab-content">
              <div className="gd-panel">
                <div className="gd-panel-title">Year-End Report Preview — 2026</div>
                <table className="gd-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Total Contributed</th>
                      <th>Interest Raised</th>
                      <th>Loans Taken</th>
                      <th>Payout (Est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.length > 0 ? (
                      members.map((m, i) => {
                        const contributed = m.totalpaid || 0;
                        const interestRaised = (m.paidcontributions || 0) * 0.15;
                        const loansTaken = m.totalloanstaken || 0;
                        const loanBalance = m.loanbalance || 0;
                        const payout = contributed + interestRaised - loanBalance;
                        
                        return (
                          <tr key={m.memberid || i}>
                            <td>{m.firstname ? `${m.firstname} ${m.lastname}` : (m.membername || 'Unknown Member')}</td>
                            <td>P{contributed.toLocaleString()}</td>
                            <td>P{interestRaised.toLocaleString()}</td>
                            <td className={loansTaken > 0 ? 'gd-loan-val' : ''}>
                              {loansTaken > 0 ? `P${loansTaken.toLocaleString()}` : '—'}
                            </td>
                            <td className="gd-payout-val">P{payout.toLocaleString()}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="gd-empty-cell">No members yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="gd-report-note">
                  Payout = contributions + interest raised – outstanding loan balance. Final figures calculated at year end.
                </div>
              </div>
            </div>
          )}

          {/* Invite Member Modal */}
          {showInvite && (
            <div className="gd-modal-overlay" onClick={() => setShowInvite(false)}>
              <div className="gd-modal" onClick={(e) => e.stopPropagation()}>
                <div className="gd-modal-header">
                  <span>Invite Member</span>
                  <button className="gd-modal-close" onClick={() => setShowInvite(false)}>✕</button>
                </div>
                <div className="gd-modal-body">
                  <div className="form-group">
                    <label>Select User</label>
                    <select 
                      className="form-select"
                      value={inviteForm.userId}
                      onChange={(e) => setInviteForm({ ...inviteForm, userId: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e0ddd5' }}
                    >
                      <option value="">Choose a user to invite...</option>
                      {allUsers.filter(u => !members.find(m => m.userid === u.userid)).map(user => (
                        <option key={user.userid} value={user.userid}>
                          {user.firstname} {user.lastname} ({user.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select 
                      className="form-select"
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e0ddd5' }}
                    >
                      <option value="member">Member</option>
                      <option value="signatory">Signatory</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="gd-modal-actions">
                    <button className="gd-modal-cancel" onClick={() => setShowInvite(false)}>Cancel</button>
                    <button className="gd-modal-submit" onClick={handleInvite} disabled={inviting}>
                      {inviting ? 'Inviting...' : 'Send Invite'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
