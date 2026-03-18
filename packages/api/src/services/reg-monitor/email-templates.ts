import { config } from '../../config';

function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#0C1445;padding:24px 32px;"><span style="color:#ffffff;font-size:20px;font-weight:700;">Safeheld</span></td></tr>
        <tr><td style="background:#3D3DFF;padding:16px 32px;"><span style="color:#ffffff;font-size:16px;font-weight:600;">${title}</span></td></tr>
        <tr><td style="padding:32px;">${body}</td></tr>
        <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">&copy; ${new Date().getFullYear()} Safeheld Ltd. Automated regulatory monitoring alert.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function severityBadge(severity: string): string {
  const colors: Record<string, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#16a34a' };
  const color = colors[severity] || '#64748b';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${severity}</span>`;
}

export function regulatoryChangeAlertEmail(params: {
  framework: string;
  severity: string;
  summary: string;
  rulesAffected: number;
  eventId: string;
}): string {
  const deadlineDays = params.severity === 'CRITICAL' ? 1 : params.severity === 'HIGH' ? 5 : 30;
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      A regulatory change has been detected that may affect your compliance rules.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Framework</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${params.framework}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Severity</td><td style="padding:6px 0;">${severityBadge(params.severity)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Rules Affected</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${params.rulesAffected}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Review By</td><td style="padding:6px 0;color:#dc2626;font-size:14px;font-weight:600;">${deadlineDays} day(s)</td></tr>
    </table>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
      <p style="margin:0;color:#450a0a;font-size:14px;line-height:1.5;">${params.summary}</p>
    </div>
    <div style="margin-top:24px;">
      <a href="${config.FRONTEND_URL}/admin/reg-monitor" style="display:inline-block;background:#3D3DFF;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Review Proposals</a>
    </div>`;

  return emailLayout(`Regulatory Update Alert — ${params.framework}`, body);
}

export function firmImpactAlertEmail(params: {
  firmName: string;
  framework: string;
  previousScore: number;
  newScore: number;
  ruleCode: string;
  newRemediations: number;
}): string {
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      A regulatory update to <strong>${params.framework}</strong> affects your compliance status.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Firm</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${params.firmName}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Framework</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${params.framework}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">Previous Score</td><td style="padding:6px 0;color:#16a34a;font-size:14px;font-weight:600;">${params.previousScore}/100</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">New Score</td><td style="padding:6px 0;color:#dc2626;font-size:14px;font-weight:600;">${params.newScore}/100</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;">New Requirements</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${params.newRemediations}</td></tr>
    </table>
    <p style="color:#475569;font-size:14px;line-height:1.6;">Log in to review your updated remediation actions and compliance status.</p>
    <div style="margin-top:24px;">
      <a href="${config.FRONTEND_URL}/reconciliation" style="display:inline-block;background:#3D3DFF;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Review Compliance</a>
    </div>`;

  return emailLayout(`Compliance Impact — ${params.framework}`, body);
}

export function weeklyDigestEmail(params: {
  changes: Array<{ framework: string; severity: string; summary: string; proposalCount: number }>;
}): string {
  const rows = params.changes.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${c.framework}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${severityBadge(c.severity)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;">${c.proposalCount}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${c.summary.substring(0, 100)}</td>
    </tr>`).join('');

  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      Weekly summary of regulatory changes detected by Safeheld monitoring.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 12px;font-size:13px;color:#64748b;font-weight:600;">Framework</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;font-weight:600;">Severity</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;font-weight:600;">Proposals</td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;font-weight:600;">Summary</td>
      </tr>
      ${rows}
    </table>
    <div style="margin-top:24px;">
      <a href="${config.FRONTEND_URL}/admin/reg-monitor" style="display:inline-block;background:#3D3DFF;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Review All Proposals</a>
    </div>`;

  return emailLayout('Weekly Regulatory Digest', body);
}
