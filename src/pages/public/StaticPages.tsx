import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../services/api';

export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">About Job Karenge</h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Job Karenge is a modern recruitment and career management platform built to bring clarity, speed, and accountability to hiring. Every employer undergoes verification before publishing live positions, and candidates track each application milestone transparently from submission to offer.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">For Job Seekers</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Build one structured professional profile, upload a verified compressed PDF resume under 1 MB, bookmark roles, confirm interview slots, and customize job alert preferences.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">For Hiring Teams</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Publish and schedule openings, manage applicant pipelines with bulk actions and private feedback, schedule interviews with automated Brevo email alerts, and export records to CSV.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [supportEmail, setSupportEmail] = useState('support@jobkarenge.com');

  useEffect(() => {
    api
      .get('/public/settings')
      .then((res) => {
        if (res.data?.data?.supportEmail) setSupportEmail(res.data.data.supportEmail);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await api.post('/contact', form);
      toast.success(res.data.message);
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Contact Support</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Questions about recruiter verification, candidate accounts, or enterprise hiring partnerships? Send our team a direct message or email{' '}
        <a href={`mailto:${supportEmail}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
          {supportEmail}
        </a>.
      </p>

      {sent && (
        <div className="mt-6 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-200">
          Your message has been logged for our platform team. We respond within one business day.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Full Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email Address</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Subject</label>
          <input
            type="text"
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Message</label>
          <textarea
            rows={5}
            required
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={sending}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
        >
          {sending ? 'Sending...' : 'Send Message'}
        </button>
      </form>
    </div>
  );
}

export function FaqPage() {
  const faqs = [
    {
      q: 'What PDF resume requirements does Job Karenge enforce?',
      a: 'Resumes must be valid PDF documents. Our backend validates the PDF signature, automatically optimizes and compresses files, and ensures every stored resume is strictly below 1 MB.',
    },
    {
      q: 'How are recruiters verified before posting jobs?',
      a: 'New recruiter registrations undergo admin verification. Once approved, recruiters can publish live openings, review candidates, and schedule interviews.',
    },
    {
      q: 'Can I withdraw an application after submitting?',
      a: 'Yes. From your Candidate Dashboard under My Applications, you can withdraw any active application that has not yet reached a terminal state.',
    },
    {
      q: 'How do promotional job digests and transactional alerts differ?',
      a: 'Promotional job digests respect your category/location preferences and can be unsubscribed at any time. Essential transactional alerts (such as interview schedules and application updates) keep you informed on active applications.',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h1>
      <div className="mt-8 space-y-4">
        {faqs.map((item) => (
          <div key={item.q} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{item.q}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-5">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        Job Karenge collects only the profile, resume, and contact information necessary to connect candidates with employers. Resumes are stored securely and access-checked so only authorized hiring teams for roles you apply to can view your documents.
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        You may update your promotional email preferences or unsubscribe from digests at any time from your Email Preferences dashboard or via any promotional email footer link.
      </p>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-5">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Terms and Conditions</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        Employers must publish accurate job descriptions, compensation ranges, and application deadlines. Candidates must provide truthful experience and authentic resume documents. Job Karenge reserves the right to suspend accounts violating platform integrity.
      </p>
    </div>
  );
}

export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing unsubscribe token.');
      return;
    }
    api
      .post('/email/unsubscribe', { token })
      .then((res) => {
        setStatus('done');
        setMessage(res.data.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(getApiErrorMessage(err, 'Invalid unsubscribe link.'));
      });
  }, [token]);

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Email Subscription Update</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {status === 'loading' ? 'Processing your request...' : message}
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-blue-600 hover:underline">
          Return to Job Karenge
        </Link>
      </div>
    </div>
  );
}
