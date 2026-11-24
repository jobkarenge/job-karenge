import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { BrandLogo, PasswordInput } from '../../components/common/UIPrimitives';
import { useAuth } from '../../context/AuthContext';
import { api, getApiErrorMessage } from '../../services/api';

const registerSchema = z
  .object({
    role: z.enum(['candidate', 'recruiter']),
    name: z.string().min(2, 'Full name is required'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().min(6, 'Enter a valid phone number'),
    location: z.string().optional(),
    companyName: z.string().optional(),
    designation: z.string().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    consent: z.boolean().refine((v) => v === true, 'You must agree to the Terms and Privacy Policy'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => (d.role === 'recruiter' ? Boolean(d.companyName?.trim() && d.designation?.trim()) : true), {
    message: 'Company name and designation are required for recruiters',
    path: ['companyName'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'recruiter' ? 'recruiter' : 'candidate';
  const [role, setRole] = useState<'candidate' | 'recruiter'>(initialRole);
  const { register: registerAccount, refreshUser, user: currentUser, loading } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: initialRole, consent: false },
  });

  if (!loading && currentUser) {
    const target =
      currentUser.role === 'admin' ? '/admin' : currentUser.role === 'recruiter' ? '/recruiter' : '/candidate';
    return <Navigate to={target} replace />;
  }

  const switchRole = (next: 'candidate' | 'recruiter') => {
    setRole(next);
    setValue('role', next);
  };

  const onSubmit = async (data: RegisterForm) => {
    try {
      const { user, verificationTokenPreview } = await registerAccount({
        role: data.role,
        name: data.name,
        email: data.email,
        phone: data.phone,
        location: data.location || '',
        companyName: data.companyName || '',
        designation: data.designation || '',
        password: data.password,
      });

      toast.success('Account created! Welcome to Job Karenge.');
      if (verificationTokenPreview) {
        toast.info('Click to verify email in preview', {
          action: {
            label: 'Verify Now',
            onClick: async () => {
              await api.post('/auth/verify-email', { token: verificationTokenPreview });
              await refreshUser();
              toast.success('Email verified!');
            },
          },
        });
      }

      navigate(user.role === 'recruiter' ? '/recruiter' : '/candidate');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">Create your Job Karenge account</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Choose your role to get started with real-time hiring or job discovery.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => switchRole('candidate')}
            className={`py-2 text-sm font-semibold rounded-md transition-colors ${
              role === 'candidate'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Candidate
          </button>
          <button
            type="button"
            onClick={() => switchRole('recruiter')}
            className={`py-2 text-sm font-semibold rounded-md transition-colors ${
              role === 'recruiter'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Recruiter
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name</label>
              <input
                type="text"
                {...register('name')}
                placeholder="Priya Sharma"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                {...register('phone')}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              {errors.phone && <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {role === 'recruiter' ? 'Work Email Address' : 'Email Address'}
            </label>
            <input
              type="email"
              {...register('email')}
              placeholder={role === 'recruiter' ? 'priya@company.com' : 'priya@example.com'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
            {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
          </div>

          {role === 'candidate' ? (
            <div>
              <label className="block text-xs font-medium mb-1">Current Location</label>
              <input
                type="text"
                {...register('location')}
                placeholder="Bengaluru, Karnataka"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Company Name</label>
                <input
                  type="text"
                  {...register('companyName')}
                  placeholder="Acme Tech Pvt Ltd"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                {errors.companyName && <p className="mt-1 text-xs text-rose-600">{errors.companyName.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Your Designation</label>
                <input
                  type="text"
                  {...register('designation')}
                  placeholder="Talent Acquisition Lead"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Password</label>
              <PasswordInput
                {...register('password')}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Confirm Password</label>
              <PasswordInput
                {...register('confirmPassword')}
                placeholder="Re-enter password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword.message}</p>}
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
            <input type="checkbox" {...register('consent')} className="mt-0.5 rounded" />
            <span>
              I agree to the{' '}
              <Link to="/terms" className="text-blue-600 hover:underline">Terms &amp; Conditions</Link> and{' '}
              <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
            </span>
          </label>
          {errors.consent && <p className="text-xs text-rose-600">{errors.consent.message}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? 'Creating account...' : `Register as ${role === 'recruiter' ? 'Recruiter' : 'Candidate'}`}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>Already registered?</span>
          <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
