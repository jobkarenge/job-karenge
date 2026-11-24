import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { SkeletonList } from '../components/common/UIPrimitives';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

export function ProtectedRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    const target = user.role === 'admin' ? '/admin' : user.role === 'recruiter' ? '/recruiter' : '/candidate';
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
