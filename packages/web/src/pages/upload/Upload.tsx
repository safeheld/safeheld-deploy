import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { ingestionApi } from '../../api/client';
import { Card, Table, Button, Select, statusBadge, PageHeader, Pagination, Alert, Modal } from '../../components/ui';
import { format } from 'date-fns';

const INPUT_TYPES = [
  { value: 'CLIENT_BALANCES', label: 'Client Balances' },
  { value: 'CLIENT_TRANSACTIONS', label: 'Client Transactions' },
  { value: 'SAFEGUARDING_LEDGER_BALANCES', label: 'Safeguarding Ledger Balances' },
  { value: 'BANK_BALANCES', label: 'Bank Balances' },
  { value: 'BANK_TRANSACTIONS', label: 'Bank Transactions' },
  { value: 'ACCOUNT_REGISTER', label: 'Account Register' },
  { value: 'DD_EVIDENCE', label: 'Due Diligence Evidence' },
  { value: 'SAFEGUARDING_POLICY', label: 'Safeguarding Policy' },
  { value: 'CLIENT_CONTRACT', label: 'Client Contract' },
];

export default function UploadPage() {
  const { user } = useAuth();
  const firmId = user!.firmId;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [inputType, setInputType] = useState('CLIENT_BALANCES');
  const [uploadResult, setUploadResult] = useState<object | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ uploadId: string; headers: string[]; suggested: Record<string, string> } | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});

  const { data: uploadsResp, isLoading } = useQuery({
    queryKey: ['uploads', firmId, page],
    queryFn: () => ingestionApi.getUploads(firmId, { page: String(page) }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('input_type', inputType);
      return ingestionApi.uploadFile(firmId, formData);
    },
    onSuccess: (result) => {
      if (result.csv_preview) {
        setPendingUpload({
          uploadId: result.upload.id,
          headers: result.csv_preview.headers,
          suggested: result.column_mapping.suggested || {},
        });
        setColumnMappings(result.column_mapping.suggested || {});
        setShowMappingModal(true);
      } else {
        setUploadResult(result);
        queryClient.invalidateQueries({ queryKey: ['uploads', firmId] });
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Upload failed.');
    },
  });

  const processMutation = useMutation({
    mutationFn: () => ingestionApi.processUpload(firmId, pendingUpload!.uploadId, {
      column_mappings: columnMappings,
      save_mapping: true,
    }),
    onSuccess: () => {
      setShowMappingModal(false);
      setPendingUpload(null);
      queryClient.invalidateQueries({ queryKey: ['uploads', firmId] });
      setUploadResult({ message: 'File queued for processing.' });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Processing failed.');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadResult(null);
    uploadMutation.mutate(file);
    e.target.value = '';
  };

  const systemFields = ['client_id', 'currency', 'balance', 'balance_date', 'external_account_id',
    'closing_balance', 'external_transaction_id', 'amount', 'direction', 'transaction_date',
    'bank_name', 'designation', 'status', 'opened_date', 'reference', 'counterparty',
    'value_date', 'description', 'sort_code', 'account_number_masked', 'client_name',
    'fund_type', 'prudent_buffer_amount'];

  const uploads = uploadsResp?.data || [];
  const pagination = uploadsResp?.pagination;

  return (
    <div>
      <PageHeader title="Data Upload" />

      {/* Upload Form */}
      <Card title="Upload New File" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Select
            label="Data Type"
            id="inputType"
            value={inputType}
            onChange={e => setInputType(e.target.value)}
            options={INPUT_TYPES}
            style={{ minWidth: '260px' }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            loading={uploadMutation.isPending}
          >
            Choose File &amp; Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf,.docx"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
        <p style={{ color: 'var(--color-navy-400)', fontSize: '12px', marginTop: '14px', marginBottom: 0 }}>
          Accepted: CSV (up to 50MB). PDF/DOCX for documents.
        </p>

        {error && <div style={{ marginTop: '14px' }}><Alert type="error" message={error} /></div>}
        {uploadResult && (
          <div style={{ marginTop: '14px' }}>
            <Alert type="success" message="File uploaded and queued for processing successfully." />
          </div>
        )}
      </Card>

      {/* Upload History */}
      <Card title="Upload History">
        <Table
          loading={isLoading}
          data={uploads}
          columns={[
            { key: 'filename', header: 'Filename', render: (r: any) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-navy-600)' }}>{r.filename}</span> },
            { key: 'inputType', header: 'Type', render: (r: any) => r.inputType.replace(/_/g, ' '), width: '200px' },
            { key: 'status', header: 'Status', render: (r: any) => statusBadge(r.status), width: '110px' },
            { key: 'rowCount', header: 'Rows', render: (r: any) => r.rowCount?.toLocaleString() || '\u2014', width: '80px' },
            {
              key: 'rowsAccepted', header: 'Accepted/Rejected', width: '140px',
              render: (r: any) => r.rowCount > 0 ? (
                <span>
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{r.rowsAccepted}</span>
                  {' / '}
                  <span style={{ color: r.rowsRejected > 0 ? 'var(--color-danger)' : 'var(--color-navy-400)', fontWeight: r.rowsRejected > 0 ? 600 : 400 }}>{r.rowsRejected}</span>
                </span>
              ) : '\u2014',
            },
            { key: 'createdAt', header: 'Uploaded', render: (r: any) => format(new Date(r.createdAt), 'dd MMM yyyy HH:mm'), width: '160px' },
          ]}
          emptyMessage="No uploads yet. Upload a CSV file to get started."
        />
        {pagination && (
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
          />
        )}
      </Card>

      {/* Column Mapping Modal */}
      <Modal
        open={showMappingModal}
        onClose={() => { setShowMappingModal(false); setPendingUpload(null); }}
        title="Map CSV Columns"
        width={600}
      >
        {pendingUpload && (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--color-navy-600)', marginTop: 0, marginBottom: '20px', lineHeight: 1.5 }}>
              Map your CSV columns to the required system fields. Required fields are marked.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
              {pendingUpload.headers.map(header => (
                <div key={header} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px',
                    background: 'var(--color-navy-50)', padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-navy-200)',
                    color: 'var(--color-navy-700)',
                  }}>
                    {header}
                  </div>
                  <span style={{ color: 'var(--color-navy-300)', fontSize: '16px' }}>{'\u2192'}</span>
                  <select
                    value={columnMappings[header] || ''}
                    onChange={e => setColumnMappings(prev => ({ ...prev, [header]: e.target.value }))}
                    style={{
                      flex: 1, padding: '8px 10px',
                      border: '1px solid var(--color-navy-300)', borderRadius: 'var(--radius-sm)',
                      fontSize: '13px', color: 'var(--color-navy-700)',
                      background: 'white',
                    }}
                  >
                    <option value="">{'\u2014'} ignore {'\u2014'}</option>
                    {systemFields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setShowMappingModal(false); setPendingUpload(null); }}>
                Cancel
              </Button>
              <Button onClick={() => processMutation.mutate()} loading={processMutation.isPending}>
                Process File
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
