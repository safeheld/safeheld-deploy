import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { profileApi } from '../../api/client';
import { Card, Button, Input, Alert, PageHeader, Grid, Badge } from '../../components/ui';

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Profile form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Messages
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.getProfile,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setEmail(profile.email || '');
      setJobTitle(profile.jobTitle || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: Record<string, any>) => profileApi.updateProfile(data),
    onSuccess: () => {
      setProfileSuccess('Profile updated successfully.');
      setProfileError('');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err: any) => {
      setProfileError(err?.response?.data?.error?.message || 'Failed to update profile.');
      setProfileSuccess('');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) => profileApi.changePassword(data),
    onSuccess: () => {
      setPasswordSuccess('Password changed successfully.');
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: any) => {
      setPasswordError(err?.response?.data?.error?.message || 'Failed to change password.');
      setPasswordSuccess('');
    },
  });

  const handleProfileSave = () => {
    setProfileSuccess('');
    setProfileError('');
    updateProfileMutation.mutate({ name, jobTitle, phone });
  };

  const handlePasswordChange = () => {
    setPasswordSuccess('');
    setPasswordError('');

    if (!currentPassword || !newPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-gray-400)' }}>
        Loading...
      </div>
    );
  }

  const mfaEnabled = profile?.mfaEnabled ?? false;

  return (
    <div>
      <PageHeader title="My Profile" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>
        {/* Profile Details */}
        <Card title="Profile Details">
          {profileSuccess && <Alert type="success" message={profileSuccess} />}
          {profileError && <Alert type="error" message={profileError} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: profileSuccess || profileError ? '16px' : '0' }}>
            <Grid cols={2} gap={16}>
              <Input
                label="Display Name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
              />
              <Input
                label="Email"
                value={email}
                disabled
                style={{ background: 'var(--color-gray-50)', cursor: 'not-allowed' }}
              />
            </Grid>
            <Grid cols={2} gap={16}>
              <Input
                label="Job Title"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Compliance Officer"
              />
              <Input
                label="Phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+44 7xxx xxx xxx"
              />
            </Grid>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Button onClick={handleProfileSave} loading={updateProfileMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </div>
        </Card>

        {/* MFA Status */}
        <Card title="Multi-Factor Authentication">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-gray-700)' }}>Status:</span>
            <Badge label={mfaEnabled ? 'Enabled' : 'Disabled'} variant={mfaEnabled ? 'success' : 'danger'} />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', margin: '12px 0 0' }}>
            {mfaEnabled
              ? 'MFA is enabled on your account. You will be prompted for a code on each login.'
              : 'MFA is not enabled. Contact your administrator to set up multi-factor authentication.'}
          </p>
        </Card>

        {/* Change Password */}
        <Card title="Change Password">
          {passwordSuccess && <Alert type="success" message={passwordSuccess} />}
          {passwordError && <Alert type="error" message={passwordError} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: passwordSuccess || passwordError ? '16px' : '0' }}>
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
            <Grid cols={2} gap={16}>
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
              />
            </Grid>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Button onClick={handlePasswordChange} loading={changePasswordMutation.isPending}>
                Change Password
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
