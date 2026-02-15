import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';

export const PasswordChangeGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [isRequired, setIsRequired] = useState(false);

  useEffect(() => {
    if (user?.mustChangePassword) {
      setShowModal(true);
      setIsRequired(true);
    }
  }, [user]);

  const handleSuccess = async () => {
    setShowModal(false);
    setIsRequired(false);
    
    // Refresh user data from API to get updated mustChangePassword flag
    if (token) {
      try {
        const res = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // The user state will be updated by the AuthContext
          window.location.reload(); // Force reload to update context
        }
      } catch (err) {
        console.error('Failed to refresh user data', err);
      }
    }
  };

  const handleClose = () => {
    if (!isRequired) {
      setShowModal(false);
    }
  };

  return (
    <>
      {children}
      <ChangePasswordModal
        isOpen={showModal}
        isRequired={isRequired}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    </>
  );
};
