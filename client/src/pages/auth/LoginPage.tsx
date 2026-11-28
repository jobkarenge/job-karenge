import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { BrandLogo, PasswordInput } from '../../components/common/UIPrimitives';
import { useAuth } from '../../context/AuthContext';
import { getApiErrorMessage } from '../../services/api';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  if (!loading && user) {
    const target = user.role === 'admin' ? '/admin' : user.role === 'recruiter' ? '/recruiter' : '/candidate';
    return <Navigate to={target} replace />;
  }

  const onSubmit = async (data: LoginForm) => {
    try {
      const user = await login(data.email, data.password);
      toast.success(`Welcome back, ${user.name}`);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'recruiter') navigate('/recruiter');
      else navigate('/candidate');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Invalid credentials'));
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">Sign in to Job Karenge</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Access your candidate, recruiter, or administrator workspace.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email Address</label>
            <input
              type="email"
              {...register('email')}
              placeholder="name@company.com"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Password</label>
              <Link to="/forgot-password" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Forgot Password?
              </Link>
            </div>
            <PasswordInput
              {...register('password')}
              placeholder="Enter your password"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>New to Job Karenge?</span>
          <Link to="/register" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
