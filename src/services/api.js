// API URL configuration
// Uses VITE_API_URL from environment variables (set in Vercel dashboard)
// Falls back to localhost for development
const API_URL = import.meta.env.VITE_API_URL || "https://remmogo.onrender.com/api";

// Get token from localStorage
const getToken = () => localStorage.getItem('token');

// Generic API request function with JWT auth and better error handling
async function apiRequest(endpoint, options = {}) {
  const token = getToken();

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);

    // Handle 401 unauthorized - token expired
    if (response.status === 401) {
      localStorage.removeItem('token');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please login again.');
    }

    // Handle 403 forbidden
    if (response.status === 403) {
      throw new Error('You do not have permission to perform this action.');
    }

    // Handle 500 server errors
    if (response.status === 500) {
      console.error('Server error - please try again later');
      throw new Error('Server error. Please try again later.');
    }

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed', status: response.status, details: data };
    }

    return { success: true, data, status: response.status };
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      const errorMsg = 'Unable to connect to server. Please ensure the backend is running.';
      console.error('❌ ' + errorMsg);
      return { success: false, error: errorMsg, status: 0 };
    }
    
    if (error.message.includes('CORS') || error.message.includes('preflight')) {
      const errorMsg = 'Connection blocked by CORS policy. Check backend configuration.';
      console.error('❌ ' + errorMsg);
      return { success: false, error: errorMsg, status: 0 };
    }
    
    console.error('❌ API Error:', error.message);
    return { success: false, error: error.message, status: 0 };
  }
}

// Auth API
export const authAPI = {
  register: (data) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getProfile: () => apiRequest('/auth/profile'),
  updateProfile: (data) => apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  updatePassword: (data) => apiRequest('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
};

// Groups API
export const groupsAPI = {
  getAll: () => apiRequest('/groups'),
  getMine: () => apiRequest('/groups/mine'),
  getOne: (id) => apiRequest(`/groups/${id}`),
  create: (group) => apiRequest('/groups', { method: 'POST', body: JSON.stringify(group) }),
  update: (id, group) => apiRequest(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(group) }),
  delete: (id) => apiRequest(`/groups/${id}`, { method: 'DELETE' }),
};

// Members API
export const membersAPI = {
  getAll: (groupId) => apiRequest(`/members/${groupId}`),
  getSignatories: (groupId) => apiRequest(`/members/${groupId}/signatories`),
  getOne: (id) => apiRequest(`/members/${id}`),
  getAllUsers: () => apiRequest('/members/users'),
  invite: (groupId, userId, role) => apiRequest('/members/invite', { method: 'POST', body: JSON.stringify({ groupId, userId, role }) }),
  create: (groupId, action = 'enroll', data) => {
    if (action === 'join') {
      return apiRequest(`/members/${groupId}/join`, { method: 'POST', body: JSON.stringify(data) });
    }
    return apiRequest(`/members/${groupId}/enroll`, { method: 'POST', body: JSON.stringify(data) });
  },
  update: (id, member) => apiRequest(`/members/${id}`, { method: 'PUT', body: JSON.stringify(member) }),
  delete: (groupId, memberId) => apiRequest(`/members/${groupId}/${memberId}`, { method: 'DELETE' }),
};

// Contributions API
export const contributionsAPI = {
  getAll: (groupId) => {
    if (!groupId || groupId === 'undefined') {
      console.warn('contributionsAPI.getAll called with invalid groupId:', groupId);
      return Promise.resolve({ success: false, error: 'Group ID is required' });
    }
    return apiRequest(`/contributions/${groupId}`);
  },
  getMine: (groupId) => {
    if (!groupId || groupId === 'undefined') {
      console.warn('contributionsAPI.getMine called with invalid groupId:', groupId);
      return Promise.resolve({ success: false, error: 'Group ID is required' });
    }
    return apiRequest(`/contributions/${groupId}/mine`);
  },
  create: (contribution) => apiRequest('/contributions', { method: 'POST', body: JSON.stringify(contribution) }),
  update: (id, contribution) => apiRequest(`/contributions/${id}`, { method: 'PUT', body: JSON.stringify(contribution) }),
  updateAmount: (id, data) => apiRequest(`/contributions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`/contributions/${id}`, { method: 'DELETE' }),
};

// Loans API
export const loansAPI = {
  getAll: (groupId) => {
    if (!groupId || groupId === 'undefined') {
      console.warn('loansAPI.getAll called with invalid groupId:', groupId);
      return Promise.resolve({ success: false, error: 'Group ID is required' });
    }
    return apiRequest(`/loans/${groupId}`);
  },
  getMine: (groupId) => {
    if (!groupId || groupId === 'undefined') {
      console.warn('loansAPI.getMine called with invalid groupId:', groupId);
      return Promise.resolve({ success: false, error: 'Group ID is required' });
    }
    return apiRequest(`/loans/${groupId}/mine`);
  },
  getOne: (id) => apiRequest(`/loans/${id}`),
  create: (loan) => apiRequest('/loans', { method: 'POST', body: JSON.stringify(loan) }),
  update: (id, loan) => apiRequest(`/loans/${id}`, { method: 'PUT', body: JSON.stringify(loan) }),
  delete: (id) => apiRequest(`/loans/${id}`, { method: 'DELETE' }),
};

// Reports API
export const reportsAPI = {
  getDashboard: () => apiRequest('/reports/dashboard'),
  getActivity: (limit = 20) => apiRequest(`/reports/activity?limit=${limit}`),
};

// Messages API
export const messagesAPI = {
  getAll: () => apiRequest('/messages'),
  getMessages: (conversationId) => apiRequest(`/messages/${conversationId}/messages`),
  send: (conversationId, content, messagetype = 'text') =>
    apiRequest(`/messages/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, content, messagetype }),
    }),
  markAsRead: (conversationId) => apiRequest(`/messages/${conversationId}/read`, { method: 'POST' }),
  create: (data) => apiRequest('/messages', { method: 'POST', body: JSON.stringify(data) }),
  getGroupConversation: (groupId) => apiRequest(`/messages/group/${groupId}`, { method: 'POST' }),
  getUnreadCount: () => apiRequest('/messages/unread'),
  delete: (messageId) => apiRequest(`/messages/messages/${messageId}`, { method: 'DELETE' }),
};

// Notifications API
export const notificationsAPI = {
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set('limit', params.limit);
    if (params.unreadOnly) queryParams.set('unreadOnly', params.unreadOnly);
    return apiRequest(`/notifications?${queryParams}`);
  },
  getUnreadCount: () => apiRequest('/notifications/unread'),
  markAsRead: (notificationId) => apiRequest(`/notifications/${notificationId}/read`, { method: 'POST' }),
  markAllAsRead: () => apiRequest('/notifications/mark-all-read', { method: 'POST' }),
  getPendingRequests: (groupId) => apiRequest(`/notifications/membership-requests/${groupId}`),
  approveRequest: (requestId, role = 'member') => apiRequest(`/notifications/membership-requests/${requestId}/approve`, { method: 'POST', body: JSON.stringify({ role }) }),
  rejectRequest: (requestId, reason) => apiRequest(`/notifications/membership-requests/${requestId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  approveLoan: (loanId) => apiRequest(`/notifications/loan-requests/${loanId}/approve`, { method: 'POST' }),
  rejectLoan: (loanId, reason) => apiRequest(`/notifications/loan-requests/${loanId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

// Token management
export const setToken = (token) => localStorage.setItem('token', token);
export const removeToken = () => localStorage.removeItem('token');

export const isAuthenticated = () => {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

export default apiRequest;