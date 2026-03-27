import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { fcaReturnsApi, fcaFormsApi } from '../../api/client';
import { Card, Table, Button, PageHeader, Modal, Alert, statusBadge, Badge, LoadingSkeleton, ErrorState } from '../../components/ui';
import { format } from 'date-fns';

export default function FcaReturnsPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const isComplianceOrAdmin = ['COMPLIANCE_OFFICER', 'ADMIN'].includes(user!.role);

  const [activeTab, setActiveTab] = useState<'monthly' | 'forms'>('monthly');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reportingMonth, setReportingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState('');
  const [formPeriodStart, setFormPeriodStart] = useState('');
  const [formPeriodEnd, setFormPeriodEnd] = useState('');
  const [viewReturn, setViewReturn] = useState<any>(null);
  const [validationWarnings, setValidationWarnings] = useState<any[]>([]);

  const { data: returnsData, isLoading: returnsLoading, error: returnsError, refetch: returnsRefetch } = useQuery({
    queryKey: ['fca-monthly-returns', firmId],
    queryFn: () => fcaReturnsApi.getMonthlyReturns(firmId),
    enabled: activeTab === 'monthly',
  });

  const { data: formsData, isLoading: formsLoading, error: formsError, refetch: formsRefetch } = useQuery({
    queryKey: ['fca-forms', firmId],
    queryFn: () => fcaFormsApi.getForms(firmId),
    enabled: activeTab === 'forms',
  });

  const generateReturnMutation = useMutation({
    mutationFn: () => fcaReturnsApi.generateMonthly(firmId, { reporting_month: reportingMonth }),
    onSuccess: () => {
      setShowGenerateModal(false);
      queryClient.invalidateQueries({ queryKey: ['fca-monthly-returns', firmId] });
    },
  });

  const finaliseReturnMutation = useMutation({
    mutationFn: (returnId: string) => fcaReturnsApi.finalise(firmId, returnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fca-monthly-returns', firmId] });
    },
  });

  const generateFormMutation = useMutation({
    mutationFn: () => fcaFormsApi.generate(firmId, selectedFormType, { periodStart: formPeriodStart, periodEnd: formPeriodEnd }),
    onSuccess: () => {
      setShowFormModal(false);
      setSelectedFormType('');
      queryClient.invalidateQueries({ queryKey: ['fca-forms', firmId] });
    },
  });

  const handleViewReturn = async (returnId: string) => {
    try {
      const data = await fcaReturnsApi.getMonthlyReturn(firmId, returnId);
      setViewReturn(data);
      const warnings = await fcaReturnsApi.validate(firmId, returnId);
      setValidationWarnings(warnings?.warnings || warnings || []);
    } catch {
      // silently handled
    }
  };

  const handleExportReturnPdf = async (returnId: string) => {
    try {
      const response = await fcaReturnsApi.exportPdf(firmId, returnId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fca-return-${returnId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* */ }
  };

  const handleExportFormPdf = async (formId: string) => {
    try {
      const response = await fcaFormsApi.exportPdf(firmId, formId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fca-form-${formId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* */ }
  };

  const tabs = [
    { id: 'monthly', label: 'Monthly Returns' },
    { id: 'forms', label: 'FCA Forms' },
  ];

  const returns = returnsData?.data || returnsData || [];
  const forms = formsData?.data || formsData || [];

  return (
    <div>
      <PageHeader title="FCA Returns" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-gray-200)', marginBottom: '20px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-gray-500)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'monthly' && returnsError && (
        <ErrorState message="Failed to load monthly returns." onRetry={() => returnsRefetch()} />
      )}
      {activeTab === 'monthly' && returnsLoading && <LoadingSkeleton type="table" />}
      {activeTab === 'monthly' && !returnsError && !returnsLoading && (
        <Card
          title="Monthly Safeguarding Returns"
          actions={isComplianceOrAdmin ? (
            <Button onClick={() => setShowGenerateModal(true)}>Generate Return</Button>
          ) : undefined}
        >
          {viewReturn && (
            <div style={{ marginBottom: '16px' }}>
              <Alert type="info" message={`Viewing return for ${viewReturn.reportingMonth || 'selected period'}`} />
              {validationWarnings.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {validationWarnings.map((w: any, i: number) => (
                    <Alert key={i} type="warning" message={typeof w === 'string' ? w : w.message || w.warning || JSON.stringify(w)} />
                  ))}
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <Button variant="secondary" size="sm" onClick={() => { setViewReturn(null); setValidationWarnings([]); }}>
                  Close View
                </Button>
              </div>
            </div>
          )}
          <Table
            loading={returnsLoading}
            data={returns}
            columns={[
              { key: 'reportingMonth', header: 'Period', render: (r: any) => r.reportingMonth || '—' },
              { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '120px' },
              { key: 'completenessPercent', header: 'Completeness', render: (r: any) => r.completenessPercent != null ? `${r.completenessPercent}%` : '—', width: '120px' },
              { key: 'createdAt', header: 'Created', render: (r: any) => r.createdAt ? format(new Date(r.createdAt), 'dd MMM yyyy') : '—' },
              {
                key: 'actions', header: '', render: (r: any) => (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleViewReturn(r.id); }}>View</Button>
                    {isComplianceOrAdmin && r.status !== 'FINAL' && r.status !== 'SUBMITTED' && (
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); finaliseReturnMutation.mutate(r.id); }}>
                        Finalise
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleExportReturnPdf(r.id); }}>Export</Button>
                  </div>
                ),
              },
            ]}
            emptyMessage="No monthly returns generated yet."
          />
        </Card>
      )}

      {activeTab === 'forms' && formsError && (
        <ErrorState message="Failed to load FCA forms." onRetry={() => formsRefetch()} />
      )}
      {activeTab === 'forms' && formsLoading && <LoadingSkeleton type="table" />}
      {activeTab === 'forms' && !formsError && !formsLoading && (
        <Card
          title="FCA Regulatory Forms"
          actions={isComplianceOrAdmin ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="sm" onClick={() => { setSelectedFormType('FSA056'); setShowFormModal(true); }}>FSA056</Button>
              <Button size="sm" onClick={() => { setSelectedFormType('FSA057'); setShowFormModal(true); }}>FSA057</Button>
              <Button size="sm" onClick={() => { setSelectedFormType('FIN060A'); setShowFormModal(true); }}>FIN060a</Button>
            </div>
          ) : undefined}
        >
          <Table
            loading={formsLoading}
            data={forms}
            columns={[
              { key: 'formType', header: 'Type', render: (r: any) => <Badge label={r.formType} variant="info" />, width: '100px' },
              { key: 'reportingPeriodStart', header: 'Period Start', render: (r: any) => r.reportingPeriodStart ? format(new Date(r.reportingPeriodStart), 'dd MMM yyyy') : '—' },
              { key: 'reportingPeriodEnd', header: 'Period End', render: (r: any) => r.reportingPeriodEnd ? format(new Date(r.reportingPeriodEnd), 'dd MMM yyyy') : '—' },
              { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status || 'DRAFT'), width: '100px' },
              {
                key: 'actions', header: '', render: (r: any) => (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleExportFormPdf(r.id); }}>Export</Button>
                  </div>
                ),
              },
            ]}
            emptyMessage="No FCA forms generated yet."
          />
        </Card>
      )}

      {/* Generate Monthly Return Modal */}
      <Modal open={showGenerateModal} onClose={() => setShowGenerateModal(false)} title="Generate Monthly Return">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Reporting Month</label>
            <input
              type="month"
              value={reportingMonth}
              onChange={e => setReportingMonth(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
            <Button onClick={() => generateReturnMutation.mutate()} loading={generateReturnMutation.isPending}>
              Generate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Generate FCA Form Modal */}
      <Modal open={showFormModal} onClose={() => setShowFormModal(false)} title={`Generate ${selectedFormType}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period Start</label>
            <input
              type="date"
              value={formPeriodStart}
              onChange={e => setFormPeriodStart(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Period End</label>
            <input
              type="date"
              value={formPeriodEnd}
              onChange={e => setFormPeriodEnd(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-gray-300)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowFormModal(false)}>Cancel</Button>
            <Button
              onClick={() => generateFormMutation.mutate()}
              loading={generateFormMutation.isPending}
              disabled={!formPeriodStart || !formPeriodEnd}
            >
              Generate {selectedFormType}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
