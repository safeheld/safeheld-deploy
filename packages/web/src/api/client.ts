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
    const url = originalRequest?.url || '';
    const isAuthEndpoint = url.includes('/auth/');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.clear();
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
  exportSafeguardingReport: (firmId: string, periodStart?: string, periodEnd?: string) => {
    const params: Record<string, string> = {};
    if (periodStart) params.period_start = periodStart;
    if (periodEnd) params.period_end = periodEnd;
    return apiClient.get(`/firms/${firmId}/exports/safeguarding-report`, { params, responseType: 'blob' });
  },
  exportReconciliationSummary: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/exports/reconciliation-summary`, { responseType: 'blob' }),
  exportBreachReport: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/exports/breach-report`, { responseType: 'blob' }),
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

// ─── CASS ────────────────────────────────────────────────────────────────────

export const cassApi = {
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/cass/dashboard`).then(r => r.data.data),
  // Assets
  getAssets: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/assets`, { params }).then(r => r.data),
  createAsset: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/assets`, data).then(r => r.data.data),
  // CMAR
  getCmarSubmissions: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/cmar`, { params }).then(r => r.data),
  createCmar: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/cmar`, data).then(r => r.data.data),
  updateCmar: (firmId: string, cmarId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/cmar/${cmarId}`, data).then(r => r.data.data),
  // Risk Controls
  getRiskControls: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/risk-controls`, { params }).then(r => r.data),
  createRiskControl: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/risk-controls`, data).then(r => r.data.data),
  updateRiskControl: (firmId: string, controlId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/risk-controls/${controlId}`, data).then(r => r.data.data),
  // Regulatory Updates
  getRegulatoryUpdates: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/regulatory-updates`, { params }).then(r => r.data),
  createRegulatoryUpdate: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/regulatory-updates`, data).then(r => r.data.data),
  updateRegulatoryUpdate: (firmId: string, updateId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/regulatory-updates/${updateId}`, data).then(r => r.data.data),
  // Impact Assessments
  getImpactAssessments: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/cass/impact-assessments`, { params }).then(r => r.data),
  createImpactAssessment: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/cass/impact-assessments`, data).then(r => r.data.data),
  updateImpactAssessment: (firmId: string, assessmentId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/cass/impact-assessments/${assessmentId}`, data).then(r => r.data.data),
};

// ─── Stablecoin ──────────────────────────────────────────────────────────

export const stablecoinApi = {
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/stablecoin/dashboard`).then(r => r.data.data),
  // Tokens
  getTokens: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/tokens`, { params }).then(r => r.data),
  createToken: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/tokens`, data).then(r => r.data.data),
  updateToken: (firmId: string, tokenId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/stablecoin/tokens/${tokenId}`, data).then(r => r.data.data),
  // Peg Snapshots
  getPegSnapshots: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/peg-snapshots`, { params }).then(r => r.data),
  createPegSnapshot: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/peg-snapshots`, data).then(r => r.data.data),
  // Reserve Assets
  getReserveAssets: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/reserve-assets`, { params }).then(r => r.data),
  createReserveAsset: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/stablecoin/reserve-assets`, data).then(r => r.data.data),
  // Attestations
  getAttestations: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/stablecoin/attestations`, { params }).then(r => r.data),
  generateAttestation: (firmId: string, tokenId: string, snapshotDate: string) =>
    apiClient.post(`/firms/${firmId}/stablecoin/attestations/generate`, { tokenId, snapshotDate }).then(r => r.data.data),
};

// ─── Crypto ──────────────────────────────────────────────────────────────

export const cryptoApi = {
  getDashboard: (firmId: string) =>
    apiClient.get(`/firms/${firmId}/crypto/dashboard`).then(r => r.data.data),
  // Wallets
  getWallets: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/wallets`, { params }).then(r => r.data),
  createWallet: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/crypto/wallets`, data).then(r => r.data.data),
  updateWallet: (firmId: string, walletId: string, data: object) =>
    apiClient.put(`/firms/${firmId}/crypto/wallets/${walletId}`, data).then(r => r.data.data),
  // Balances
  getBalances: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/balances`, { params }).then(r => r.data),
  createBalance: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/crypto/balances`, data).then(r => r.data.data),
  // Entitlements
  getEntitlements: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/entitlements`, { params }).then(r => r.data),
  createEntitlement: (firmId: string, data: object) =>
    apiClient.post(`/firms/${firmId}/crypto/entitlements`, data).then(r => r.data.data),
  // Proof of Reserves
  getProofOfReserves: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/proof-of-reserves`, { params }).then(r => r.data),
  generateProofOfReserves: (firmId: string, snapshotDate: string) =>
    apiClient.post(`/firms/${firmId}/crypto/proof-of-reserves/generate`, { snapshotDate }).then(r => r.data.data),
  // Data Lineage
  getDataLineage: (firmId: string, params?: Record<string, string>) =>
    apiClient.get(`/firms/${firmId}/crypto/data-lineage`, { params }).then(r => r.data),
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
};
