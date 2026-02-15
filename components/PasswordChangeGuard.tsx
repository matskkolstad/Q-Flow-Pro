import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';

export const PasswordChangeGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useAuth();
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
    await refreshUser();
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
