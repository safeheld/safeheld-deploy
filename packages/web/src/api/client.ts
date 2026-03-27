import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.clear();
        sessionStorage.setItem('session_expired', 'true');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken });
        const newToken = data.data.access_token;
        localStorage.setItem('access_token', newToken);
        apiClient.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err, null);
        localStorage.clear();
        sessionStorage.setItem('session_expired', 'true');
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }).then(r => r.data.data),
  setupMfa: (temp_token: string) =>
    apiClient.post('/auth/mfa/setup', { temp_token }).then(r => r.data.data),
  verifyMfa: (temp_token: string, code: string, is_setup_confirmation = false) =>
    apiClient.post('/auth/mfa/verify', { temp_token, code, is_setup_confirmation }).then(r => r.data.data),
  refresh: (refresh_token: string) =>
    apiClient.post('/auth/refresh', { refresh_token }).then(r => r.data.data),
  logout: (refresh_token: string) =>
    apiClient.post('/auth/logout', { refresh_token }).then(r => r.data.data),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  getFirms: (params?: Record<string, string>) =>
    apiClient.get('/admin/firms', { params }).then(r => r.data),
  createFirm: (data: object) =>
    apiClient.post('/admin/firms', data).then(r => r.data.data),
  getFirm: (id: string) =>
    apiClient.get(`/admin/firms/${id}`).then(r => r.data.data),
  updateFirm: (id: string, data: object) =>
    apiClient.put(`/admin/firms/${id}`, data).then(r => r.data.data),
  createUser: (firmId: string, data: object) =>
    apiClient.post(`/admin/firms/${firmId}/users`, data).then(r => r.data.data),
  getAuditLog: (params?: Record<string, string>) =>
    apiClient.get('/admin/audit-log', { params }).then(r => r.data),
  exportAuditLog: (params?: Record<string, string>) =>
    apiClient.get('/admin/audit-log/export', { params, responseType: 'blob' }),
};

// ─── Regulatory Monitor ──────────────────────────────────────────────────────

export const regMonitorApi = {
  getSources: () =>
    apiClient.get('/admin/reg-monitor/sources').then(r => r.data.data),
  getEvents: (params?: Record<string, string>) =>
    apiClient.get('/admin/reg-monitor/events', { params }).then(r => r.data),
  getProposals: (params?: Record<string, string>) =>
    apiClient.get('/admin/reg-monitor/proposals', { params }).then(r => r.data),
  approveProposal: (id: string) =>
    apiClient.patch(`/admin/reg-monitor/proposals/${id}/approve`).then(r => r.data.data),
  rejectProposal: (id: string, reason: string) =>
    apiClient.patch(`/admin/reg-monitor/proposals/${id}/reject`, { reason }).then(r => r.data.data),
  checkSource: (id: string) =>
    apiClient.post(`/admin/reg-monitor/sources/${id}/check`).then(r => r.data.data),
  runFullMonitor: () =>
    apiClient.post('/admin/reg-monitor/run').then(r => r.data.data),
  getFirmImpact: (proposalId: string) =>
    apiClient.get(`/admin/reg-monitor/firm-impact/${proposalId}`).then(r => r.data.data),
};

// ─── Deep Ingestion ──────────────────────────────────────────────────────────

export const deepIngestionApi = {
  runAll: () =>
    apiClient.post('/admin/deep-ingestion/run').then(r => r.data.data),
  runFramework: (framework: string) =>
    apiClient.post(`/admin/deep-ingestion/run/${framework}`).then(r => r.data.data),
  getStatus: () =>
    apiClient.get('/admin/deep-ingestion/status').then(r => r.data.data),
  getResults: (params?: Record<string, string>) =>
    apiClient.get('/admin/deep-ingestion/results', { params }).then(r => r.data),
  confirmResult: (id: string) =>
    apiClient.patch(`/admin/deep-ingestion/results/${id}/confirm`).then(r => r.data.data),
  rejectResult: (id: string) =>
    apiClient.patch(`/admin/deep-ingestion/results/${id}/reject`).then(r => r.data.data),
};

// ─── Ingestion ────────────────────────────────────────────────────────────────

export const ingestionApi = {
  uploadFile: (firmId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/uploads`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  processUpload: (firmId: string, uploadId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/uploads/${uploadId}/process`, data).then(r => r.data.data),
  getUploads: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/uploads`, { params }).then(r => r.data),
  getUpload: (firmId: string, uploadId: string) =>
    apiClient.get(`/firms/${firmId}/uploads/${uploadId}`).then(r => r.data.data),
  getMappingConfigs: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/mapping-configs`).then(r => r.data.data),
  saveMappingConfig: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/mapping-configs`, data).then(r => r.data.data),
};

// ─── Reconciliation ───────────────────────────────────────────────────────────

export const reconciliationApi = {
  run: (firmId: string, reconciliationDate: string) =>
    apiClient.post(`/firms/${firmId}/reconciliation/run`, { reconciliation_date: reconciliationDate }).then(r => r.data.data),
  getHistory: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/reconciliation/history`, { params }).then(r => r.data),
  getBreaks: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/reconciliation/breaks`, { params }).then(r => r.data),
  resolveBreak: (firmId: string, breakId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/reconciliation/breaks/${breakId}/resolve`, data).then(r => r.data.data),
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/reconciliation/dashboard`).then(r => r.data.data),
  getCalendar: (firmId: string, year: number, month: number) =>
    apiClient.get(`/firms/${firmId}/reconciliation/calendar`, { params: { year, month } }).then(r => r.data.data),
  getNextDue: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/reconciliation/next-due`).then(r => r.data.data),
  importStatement: (firmId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/reconciliation/import-statement`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  getAssetPools: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/reconciliation/asset-pools`).then(r => r.data.data),
  createAssetPool: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/reconciliation/asset-pools`, data).then(r => r.data.data),
};

// ─── Breaches ─────────────────────────────────────────────────────────────────

export const breachApi = {
  getBreaches: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/breaches`, { params }).then(r => r.data),
  getBreach: (firmId: string, breachId: string) =>
    apiClient.get(`/firms/${firmId}/breaches/${breachId}`).then(r => r.data.data),
  acknowledge: (firmId: string, breachId: string, remediationAction: string) =>
    apiClient.post(`/firms/${firmId}/breaches/${breachId}/acknowledge`, { remediation_action: remediationAction }).then(r => r.data.data),
  updateStatus: (firmId: string, breachId: string, status: string, evidence?: string) =>
    apiClient.post(`/firms/${firmId}/breaches/${breachId}/status`, { status, evidence }).then(r => r.data.data),
  createFcaNotification: (firmId: string, breachId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/breaches/${breachId}/fca-notifications`, data).then(r => r.data.data),
  submitFcaNotification: (firmId: string, notificationId: string, fcaReference?: string) =>
    apiClient.post(`/firms/${firmId}/fca-notifications/${notificationId}/submit`, { fca_reference: fcaReference }).then(r => r.data.data),
  getFcaNotifications: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/fca-notifications`).then(r => r.data),
  getRegister: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/breaches/register`, { params }).then(r => r.data),
  createManual: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/breaches/manual`, data).then(r => r.data.data),
  uploadDocument: (firmId: string, breachId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/breaches/${breachId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data.data),
  getFcaTemplate: (firmId: string, breachId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/breaches/${breachId}/fca-notification-template`, data).then(r => r.data.data),
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reportingApi = {
  getSafeguardingReturn: (firmId: string, periodStart: string, periodEnd: string) =>
    apiClient.post(`/firms/${firmId}/reports/safeguarding-return`, { period_start: periodStart, period_end: periodEnd }).then(r => r.data.data),
  generateAssuranceReport: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/reports/assurance`, data).then(r => r.data.data),
  generateBoardPack: (firmId: string, reportMonth: string) =>
    apiClient.post(`/firms/${firmId}/reports/board-pack`, { report_month: reportMonth }).then(r => r.data.data),
  getReports: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/reports`, { params }).then(r => r.data),
  finaliseReport: (firmId: string, reportId: string) =>
    apiClient.post(`/firms/${firmId}/reports/${reportId}/finalise`).then(r => r.data.data),
  shareReport: (firmId: string, reportId: string, expiresInHours = 72) =>
    apiClient.post(`/firms/${firmId}/reports/${reportId}/share`, { expires_in_hours: expiresInHours }).then(r => r.data.data),
  downloadReport: (firmId: string, reportId: string) =>
    `${API_BASE}/firms/${firmId}/reports/${reportId}/download`,
  getReport: (firmId: string, reportId: string) =>
    apiClient.get(`/firms/${firmId}/reports/${reportId}`).then(r => r.data.data),
  getBoardReports: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/board-reports`).then(r => r.data),
};

// ─── Bank Dashboard ───────────────────────────────────────────────────────────

export const bankDashboardApi = {
  getOverview: (params?: Record<string, string>) =>
    apiClient.get('/bank-dashboard/overview', { params }).then(r => r.data.data),
  getFirmSummary: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/bank-dashboard/firms/${firmId}/summary`, { params }).then(r => r.data.data),
  getAlerts: (params?: Record<string, string>) =>
    apiClient.get('/bank-dashboard/alerts', { params }).then(r => r.data.data),
  exportCsv: (params?: Record<string, string>) =>
    apiClient.get('/bank-dashboard/export', { params, responseType: 'blob' }),
};

// ─── Governance ───────────────────────────────────────────────────────────────

export const governanceApi = {
  // Accounts
  getAccounts: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/safeguarding-accounts`, { params }).then(r => r.data),
  createAccount: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/safeguarding-accounts`, data).then(r => r.data.data),
  // Letters
  uploadLetter: (firmId: string, accountId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/safeguarding-accounts/${accountId}/letters`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  getLetters: (firmId: string, accountId: string) =>
    apiClient.get(`/firms/${firmId}/safeguarding-accounts/${accountId}/letters`).then(r => r.data.data),
  // Due Diligence
  getDueDiligence: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/due-diligence`, { params }).then(r => r.data),
  createDueDiligence: (firmId: string, accountId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/safeguarding-accounts/${accountId}/due-diligence`, data).then(r => r.data.data),
  // Policies
  getPolicies: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/policy-documents`, { params }).then(r => r.data),
  uploadPolicy: (firmId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/policy-documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  // Insurance
  getInsurance: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/insurance`).then(r => r.data),
  createInsurance: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/insurance`, data).then(r => r.data.data),
  // Agents
  getAgents: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/agents`).then(r => r.data),
  createAgent: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/agents`, data).then(r => r.data.data),
  // Resolution Pack Health
  checkResolutionPack: (firmId: string) =>
    apiClient.post(`/firms/${firmId}/resolution-pack/check`).then(r => r.data.data),
  getResolutionPackHealth: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/resolution-pack/health`).then(r => r.data.data),
  // Auditor Findings
  getFindings: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/auditor-findings`).then(r => r.data),
  createFinding: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/auditor-findings`, data).then(r => r.data.data),
  respondToFinding: (firmId: string, findingId: string, response: string) =>
    apiClient.post(`/firms/${firmId}/auditor-findings/${findingId}/respond`, { management_response: response }).then(r => r.data.data),
  updateAccount: (firmId: string, accountId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/safeguarding-accounts/${accountId}`, data).then(r => r.data.data),
  getResponsibilities: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/responsibilities`).then(r => r.data),
  createResponsibility: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/responsibilities`, data).then(r => r.data.data),
};

// ─── CASS ─────────────────────────────────────────────────────────────────────

export const cassApi = {
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/cass/dashboard`).then(r => r.data.data),
  getAssets: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/assets`, { params }).then(r => r.data),
  createAsset: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/assets`, data).then(r => r.data.data),
  getCmarSubmissions: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/cmar`, { params }).then(r => r.data),
  createCmar: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/cmar`, data).then(r => r.data.data),
  updateCmar: (firmId: string, cmarId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/cmar/${cmarId}`, data).then(r => r.data.data),
  getRiskControls: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/risk-controls`, { params }).then(r => r.data),
  createRiskControl: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/risk-controls`, data).then(r => r.data.data),
  updateRiskControl: (firmId: string, controlId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/risk-controls/${controlId}`, data).then(r => r.data.data),
  getRegulatoryUpdates: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/regulatory-updates`, { params }).then(r => r.data),
  createRegulatoryUpdate: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/regulatory-updates`, data).then(r => r.data.data),
  updateRegulatoryUpdate: (firmId: string, updateId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/regulatory-updates/${updateId}`, data).then(r => r.data.data),
  getImpactAssessments: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/impact-assessments`, { params }).then(r => r.data),
  createImpactAssessment: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/impact-assessments`, data).then(r => r.data.data),
  updateImpactAssessment: (firmId: string, assessmentId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/impact-assessments/${assessmentId}`, data).then(r => r.data.data),
  runCustodyRecon: (firmId: string) =>
    apiClient.post(`/firms/${firmId}/cass/custody-reconciliation`).then(r => r.data.data),
  getCustodyReconHistory: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/custody-reconciliation/history`, { params }).then(r => r.data),
  getNomineeAccounts: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/cass/nominee-accounts`).then(r => r.data.data),
  getSubCustodianExposure: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/cass/sub-custodian-exposure`).then(r => r.data.data),
  generateCmar: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/cmar/generate`, data).then(r => r.data.data),
  validateCmar: (firmId: string, submissionId: string) =>
    apiClient.post(`/firms/${firmId}/cass/cmar/${submissionId}/validate`).then(r => r.data.data),
  submitCmar: (firmId: string, submissionId: string) =>
    apiClient.post(`/firms/${firmId}/cass/cmar/${submissionId}/submit`).then(r => r.data.data),
  requestSignOff: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/sign-off/request`, data).then(r => r.data.data),
  approveSignOff: (firmId: string, signOffId: string) =>
    apiClient.post(`/firms/${firmId}/cass/sign-off/${signOffId}/approve`).then(r => r.data.data),
  rejectSignOff: (firmId: string, signOffId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/sign-off/${signOffId}/reject`, data).then(r => r.data.data),
};

// ─── AI Assistant ────────────────────────────────────────────────────────────

export const aiAssistantApi = {
  getProactiveAlert: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/ai-assistant/proactive`).then(r => r.data.data),
  getHistory: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/ai-assistant/history`, { params }).then(r => r.data),
  clearHistory: (firmId: string) =>
    apiClient.delete(`/firms/${firmId}/ai-assistant/history`).then(r => r.data.data),
  getAdminUsage: () =>
    apiClient.get('/admin/ai-assistant/usage').then(r => r.data.data),
  getAdminConversations: (params?: Record<string, string>) =>
    apiClient.get('/admin/ai-assistant/conversations', { params }).then(r => r.data),
};

// ─── Billing ─────────────────────────────────────────────────────────────────

export const billingApi = {
  getDashboard: () =>
    apiClient.get('/admin/billing/dashboard').then(r => r.data.data),
  getFirms: (params?: Record<string, string>) =>
    apiClient.get('/admin/billing/firms', { params }).then(r => r.data),
  updateFirm: (firmId: string, data: object) =>
    apiClient.patch(`/admin/billing/firms/${firmId}`, data).then(r => r.data.data),
  getInvoices: (params?: Record<string, string>) =>
    apiClient.get('/admin/billing/invoices', { params }).then(r => r.data),
  triggerInvoice: (firmId: string) =>
    apiClient.post(`/admin/billing/firms/${firmId}/invoice`).then(r => r.data.data),
  extendTrial: (firmId: string, trialEndsAt: string) =>
    apiClient.post(`/admin/billing/firms/${firmId}/trial/extend`, { trialEndsAt }).then(r => r.data.data),
  getFirmBilling: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/billing`).then(r => r.data.data),
  getFirmInvoices: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/billing/invoices`, { params }).then(r => r.data),
};

// ─── Stablecoin ──────────────────────────────────────────────────────────────

export const stablecoinApi = {
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/stablecoin/dashboard`).then(r => r.data.data),
  getTokens: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/tokens`, { params }).then(r => r.data),
  createToken: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/tokens`, data).then(r => r.data.data),
  updateToken: (firmId: string, tokenId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/stablecoin/tokens/${tokenId}`, data).then(r => r.data.data),
  getPegSnapshots: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/peg-snapshots`, { params }).then(r => r.data),
  createPegSnapshot: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/peg-snapshots`, data).then(r => r.data.data),
  getReserveAssets: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/reserve-assets`, { params }).then(r => r.data),
  createReserveAsset: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/reserve-assets`, data).then(r => r.data.data),
  getAttestations: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/attestations`, { params }).then(r => r.data),
  generateAttestation: (firmId: string, tokenId: string, snapshotDate: string) =>
    apiClient.post(`/firms/${firmId}/stablecoin/attestations/generate`, { tokenId, snapshotDate }).then(r => r.data.data),
  checkPeg: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/check-peg`, data).then(r => r.data.data),
  getPegHistory: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/peg-history`, { params }).then(r => r.data),
  getReserveRatio: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/stablecoin/reserve-ratio`).then(r => r.data.data),
};

// ─── Crypto ──────────────────────────────────────────────────────────────────

export const cryptoApi = {
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/crypto/dashboard`).then(r => r.data.data),
  getWallets: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/wallets`, { params }).then(r => r.data),
  createWallet: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/crypto/wallets`, data).then(r => r.data.data),
  updateWallet: (firmId: string, walletId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/crypto/wallets/${walletId}`, data).then(r => r.data.data),
  getBalances: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/balances`, { params }).then(r => r.data),
  createBalance: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/crypto/balances`, data).then(r => r.data.data),
  getEntitlements: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/entitlements`, { params }).then(r => r.data),
  createEntitlement: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/crypto/entitlements`, data).then(r => r.data.data),
  getProofOfReserves: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/proof-of-reserves`, { params }).then(r => r.data),
  generateProofOfReserves: (firmId: string, snapshotDate: string) =>
    apiClient.post(`/firms/${firmId}/crypto/proof-of-reserves/generate`, { snapshotDate }).then(r => r.data.data),
  getDataLineage: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/data-lineage`, { params }).then(r => r.data),
  syncBalances: (firmId: string) =>
    apiClient.post(`/firms/${firmId}/crypto/sync-balances`).then(r => r.data.data),
  reconcile: (firmId: string) =>
    apiClient.post(`/firms/${firmId}/crypto/reconcile`).then(r => r.data.data),
  getOnChainStatus: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/crypto/on-chain-status`).then(r => r.data.data),
};

// ─── Resolution Pack ────────────────────────────────────────────────────────

export const resolutionPackApi = {
  generate: (firmId: string) =>
    apiClient.post(`/firms/${firmId}/resolution-pack`).then(r => r.data.data),
  getHistory: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/resolution-pack/history`).then(r => r.data),
  download: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/resolution-pack/download`, { responseType: 'blob' }),
  getStaleness: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/resolution-pack/staleness`).then(r => r.data.data),
};

// ─── FCA Returns ────────────────────────────────────────────────────────────

export const fcaReturnsApi = {
  generateMonthly: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/fca-returns/monthly`, data).then(r => r.data.data),
  getMonthlyReturns: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/fca-returns/monthly`).then(r => r.data),
  getMonthlyReturn: (firmId: string, returnId: string) =>
    apiClient.get(`/firms/${firmId}/fca-returns/monthly/${returnId}`).then(r => r.data.data),
  finalise: (firmId: string, returnId: string) =>
    apiClient.post(`/firms/${firmId}/fca-returns/monthly/${returnId}/finalise`).then(r => r.data.data),
  validate: (firmId: string, returnId: string) =>
    apiClient.get(`/firms/${firmId}/fca-returns/monthly/${returnId}/validate`).then(r => r.data.data),
  exportPdf: (firmId: string, returnId: string) =>
    apiClient.get(`/firms/${firmId}/fca-returns/monthly/${returnId}/export-pdf`, { responseType: 'blob' }),
  exportData: (firmId: string, returnId: string) =>
    apiClient.get(`/firms/${firmId}/fca-returns/monthly/${returnId}/export-data`).then(r => r.data.data),
};

// ─── FCA Forms ──────────────────────────────────────────────────────────────

export const fcaFormsApi = {
  generate: (firmId: string, formType: string, data: object) =>
    apiClient.post(`/firms/${firmId}/fca-forms/${formType}/generate`, data).then(r => r.data.data),
  getForms: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/fca-forms`).then(r => r.data),
  getForm: (firmId: string, formId: string) =>
    apiClient.get(`/firms/${firmId}/fca-forms/${formId}`).then(r => r.data.data),
  exportPdf: (firmId: string, formId: string) =>
    apiClient.get(`/firms/${firmId}/fca-forms/${formId}/export-pdf`, { responseType: 'blob' }),
  exportData: (firmId: string, formId: string) =>
    apiClient.get(`/firms/${firmId}/fca-forms/${formId}/export-data`).then(r => r.data.data),
};

// ─── Audit Support ──────────────────────────────────────────────────────────

export const auditSupportApi = {
  generateEvidencePack: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/audit-support/evidence-pack`, data).then(r => r.data.data),
  listEvidencePacks: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/audit-support/evidence-pack`).then(r => r.data),
  downloadPack: (firmId: string, packId: string) =>
    apiClient.get(`/firms/${firmId}/audit-support/evidence-pack/${packId}/download`, { responseType: 'blob' }),
  getPeriodInfo: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/audit-support/period-info`).then(r => r.data.data),
  checkThreshold: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/audit-support/threshold-check`).then(r => r.data.data),
  signOffExemption: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/audit-support/exemption-signoff`, data).then(r => r.data.data),
  getAuditorView: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/audit-support/auditor-view`).then(r => r.data.data),
};

// ─── Acknowledgement Letters ────────────────────────────────────────────────

export const acknowledgementLettersApi = {
  generateTemplate: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/acknowledgement-letters/template`, data, { responseType: 'blob' }),
  getTracking: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/acknowledgement-letters/tracking`).then(r => r.data),
  uploadSigned: (firmId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/acknowledgement-letters/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  getAlerts: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/acknowledgement-letters/alerts`).then(r => r.data.data),
};

// ─── Third Party Due Diligence ──────────────────────────────────────────────

export const thirdPartyDdApi = {
  getRegister: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/third-party-dd/register`).then(r => r.data),
  createParty: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/third-party-dd/register`, data).then(r => r.data.data),
  updateParty: (firmId: string, partyId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/third-party-dd/register/${partyId}`, data).then(r => r.data.data),
  createAssessment: (firmId: string, partyId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/third-party-dd/${partyId}/assessment`, data).then(r => r.data.data),
  getDiversification: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/third-party-dd/diversification`).then(r => r.data.data),
  createDiversification: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/third-party-dd/diversification`, data).then(r => r.data.data),
  getAlerts: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/third-party-dd/alerts`).then(r => r.data.data),
};

// ─── Insurance Management ───────────────────────────────────────────────────

export const insuranceManagementApi = {
  getPolicies: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/insurance-management`).then(r => r.data),
  createPolicy: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/insurance-management`, data).then(r => r.data.data),
  getExpiry: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/insurance-management/expiry`).then(r => r.data.data),
  recordDecision: (firmId: string, policyId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/insurance-management/${policyId}/expiry-decision`, data).then(r => r.data.data),
  getFcaNotifications: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/insurance-management/fca-notifications`).then(r => r.data),
};

// ─── Policy Library ─────────────────────────────────────────────────────────

export const policyLibraryApi = {
  getPolicies: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/policy-library`, { params }).then(r => r.data),
  uploadPolicy: (firmId: string, formData: FormData) =>
    apiClient.post(`/firms/${firmId}/policy-library`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  getVersionHistory: (firmId: string, docType: string) =>
    apiClient.get(`/firms/${firmId}/policy-library/versions/${docType}`).then(r => r.data),
  getChecklist: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/policy-library/checklist`).then(r => r.data.data),
  getReviewAlerts: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/policy-library/review-alerts`).then(r => r.data.data),
  chatHistory: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/policy-library/chat/history`).then(r => r.data),
};

// ─── Safeguarding Timing ────────────────────────────────────────────────────

export const safeguardingTimingApi = {
  recordReceived: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/safeguarding-timing/received`, data).then(r => r.data.data),
  recordExited: (firmId: string, obligationId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/safeguarding-timing/${obligationId}/exited`, data).then(r => r.data.data),
  getActive: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/safeguarding-timing/active`, { params }).then(r => r.data),
  tagFx: (firmId: string, obligationId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/safeguarding-timing/${obligationId}/fx-tag`, data).then(r => r.data.data),
  getUnclaimed: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/safeguarding-timing/unclaimed`).then(r => r.data),
  markUnclaimed: (firmId: string, obligationId: string) =>
    apiClient.post(`/firms/${firmId}/safeguarding-timing/${obligationId}/mark-unclaimed`).then(r => r.data.data),
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/safeguarding-timing/dashboard`).then(r => r.data.data),
};

// ─── Monitoring ─────────────────────────────────────────────────────────────

export const monitoringApi = {
  getDetailedHealth: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/monitoring/health/detailed`).then(r => r.data.data),
  getHealthChecks: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/monitoring/health-checks`, { params }).then(r => r.data),
  getAlertSettings: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/monitoring/alert-settings`).then(r => r.data.data),
  createAlertSetting: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/monitoring/alert-settings`, data).then(r => r.data.data),
  updateAlertSetting: (firmId: string, settingId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/monitoring/alert-settings/${settingId}`, data).then(r => r.data.data),
  getEmailLogs: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/monitoring/email-logs`, { params }).then(r => r.data),
};

// ─── Rules Engine ───────────────────────────────────────────────────────────

export const rulesEngineApi = {
  getFindings: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/rules-engine/findings`, { params }).then(r => r.data),
  getComplianceScore: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/rules-engine/compliance-score`).then(r => r.data.data),
  getRemediation: (firmId: string, findingId: string) =>
    apiClient.get(`/firms/${firmId}/rules-engine/findings/${findingId}/remediation`).then(r => r.data.data),
  updateRemediation: (firmId: string, findingId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/rules-engine/findings/${findingId}/remediation`, data).then(r => r.data.data),
};

// ─── Profile ────────────────────────────────────────────────────────────────

export const profileApi = {
  getProfile: () => apiClient.get('/auth/me').then(r => r.data.data),
  updateProfile: (data: Record<string, any>) => apiClient.put('/auth/me', data).then(r => r.data.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    apiClient.put('/auth/me/password', data).then(r => r.data.data),
};

// ─── Notifications ──────────────────────────────────────────────────────────

export const notificationsApi = {
  getUnreadCount: () => apiClient.get('/notifications/unread-count').then(r => r.data.data),
  getNotifications: (params?: Record<string, any>) => apiClient.get('/notifications', { params }).then(r => r.data),
  markRead: (id: string) => apiClient.post(`/notifications/${id}/read`).then(r => r.data.data),
  markAllRead: () => apiClient.post('/notifications/read-all').then(r => r.data.data),
  getPreferences: () => apiClient.get('/users/me/notification-preferences').then(r => r.data.data),
  updatePreferences: (data: Record<string, any>) => apiClient.put('/users/me/notification-preferences', data).then(r => r.data.data),
};
