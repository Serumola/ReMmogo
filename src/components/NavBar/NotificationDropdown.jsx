import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import './NotificationDropdown.css';
import { useToast } from '../../context/ToastContext';
import { notificationsAPI } from '../../services/api';

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const [notifRes, countRes] = await Promise.all([
        notificationsAPI.getAll({ limit: 20 }),
        notificationsAPI.getUnreadCount()
      ]);

      if (notifRes.success) {
        setNotifications(notifRes.data || []);
      }
      if (countRes.success) {
        setUnreadCount(countRes.count || 0);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await notificationsAPI.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n.notificationid === notificationId ? { ...n, isread: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleApproveRequest = async (requestId) => {
    try {
      const response = await notificationsAPI.approveRequest(requestId);
      if (response.success) {
        toast.success('Member approved and added to the group successfully');
        fetchNotifications();
      } else {
        toast.error(response.error || 'Failed to approve');
      }
    } catch (err) {
      toast.error('Failed to approve request');
    }
  };

  const handleRejectRequest = async (requestId) => {
    const reason = prompt('Enter reason for rejection (optional):');
    if (reason === null) return;

    try {
      const response = await notificationsAPI.rejectRequest(requestId, reason || undefined);
      if (response.success) {
        toast.success('Request rejected');
        fetchNotifications();
      } else {
        toast.error(response.error || 'Failed to reject');
      }
    } catch (err) {
      toast.error('Failed to reject request');
    }
  };

  const handleApproveLoan = async (loanId) => {
    try {
      const response = await notificationsAPI.approveLoan(loanId);
      if (response.success) {
        toast.success('Loan approved and disbursed');
        fetchNotifications();
      } else {
        toast.error(response.error || 'Failed to approve loan');
      }
    } catch (err) {
      toast.error('Failed to approve loan');
    }
  };

  const handleRejectLoan = async (loanId) => {
    const reason = prompt('Enter reason for rejection (optional):');
    if (reason === null) return;

    try {
      const response = await notificationsAPI.rejectLoan(loanId, reason || undefined);
      if (response.success) {
        toast.success('Loan request rejected');
        fetchNotifications();
      } else {
        toast.error(response.error || 'Failed to reject loan');
      }
    } catch (err) {
      toast.error('Failed to reject loan');
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'join_request':
        return '👤';
      case 'membership_approved':
        return '✅';
      case 'membership_rejected':
        return '❌';
      case 'loan_request':
        return '💰';
      case 'loan_approved':
        return '✅💰';
      case 'loan_rejected':
        return '❌💰';
      case 'contribution_approved':
        return '💵';
      default:
        return '🔔';
    }
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB');
  };

  return (
    <div className="NotificationDropdown">
      <button
        className="nd-toggle"
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="nd-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="nd-dropdown">
          <div className="nd-header">
            <span className="nd-title">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="nd-mark-all"
                onClick={() => {
                  notificationsAPI.markAllAsRead();
                  setUnreadCount(0);
                  setNotifications(prev => prev.map(n => ({ ...n, isread: true })));
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="nd-body">
            {loading ? (
              <div className="nd-loading">Loading notifications...</div>
            ) : notifications.length > 0 ? (
              notifications.map((n) => (
                <div
                  key={n.notificationid}
                  className={`nd-item ${!n.isread ? 'nd-item--unread' : ''}`}
                  onClick={() => handleMarkAsRead(n.notificationid)}
                >
                  <span className="nd-icon">{getNotificationIcon(n.type)}</span>
                  <div className="nd-content">
                    <div className="nd-title-row">
                      <span className="nd-notification-title">{n.title}</span>
                      <span className="nd-time">{getTimeAgo(n.createdat)}</span>
                    </div>
                    <p className="nd-message">{n.message}</p>
                    {n.groupname && (
                      <span className="nd-group-tag">📍 {n.groupname}</span>
                    )}

                    {/* Action buttons for join requests */}
                    {n.type === 'join_request' && !n.isread && (
                      <div className="nd-actions">
                        <button
                          className="nd-approve-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveRequest(n.relatedid);
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="nd-reject-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectRequest(n.relatedid);
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {/* Action buttons for loan requests */}
                    {n.type === 'loan_request' && !n.isread && (
                      <div className="nd-actions">
                        <button
                          className="nd-approve-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveLoan(n.relatedid);
                          }}
                        >
                          Approve Loan
                        </button>
                        <button
                          className="nd-reject-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectLoan(n.relatedid);
                          }}
                        >
                          Reject Loan
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="nd-empty">No notifications</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
