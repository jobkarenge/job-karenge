import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';
import type { JobRecord } from '../types/domain.ts';

function formatJobSalarySnippet(job: JobRecord): string {
  if (!job.salaryMin && !job.salaryMax) return '';
  const suffix = job.salaryPeriod === 'Monthly' ? '/mo' : '/yr';
  return `${job.currency || 'INR'} ${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()} ${suffix}`;
}

function renderJobListItems(jobs: JobRecord[], clientUrl: string): string {
  return jobs
    .slice(0, 6)
    .map((j) => {
      const salary = formatJobSalarySnippet(j);
      return `<li style="margin-bottom:14px;padding:12px;border:1px solid #E2E8F0;border-radius:8px;list-style:none;">
        <div style="font-weight:700;color:#0F172A;font-size:15px;">${escapeHtml(j.title)}</div>
        <div style="font-size:13px;color:#475569;margin-top:2px;">
          ${escapeHtml(j.companyName)} &middot; ${escapeHtml(j.location)} (${escapeHtml(j.workMode)} &middot; ${escapeHtml(j.employmentType)})
        </div>
        ${salary ? `<div style="font-size:12px;color:#0F172A;margin-top:4px;">Compensation: ${escapeHtml(salary)}</div>` : ''}
        <div style="margin-top:8px;">
          <a href="${escapeHtml(clientUrl)}/jobs/${escapeHtml(j._id)}" style="color:#2563EB;font-weight:600;font-size:13px;text-decoration:none;">View Role &rarr;</a>
        </div>
      </li>`;
    })
    .join('');
}

export function buildPromotionalDigestTemplate(params: {
  candidateName: string;
  jobs: JobRecord[];
  subject: string;
  campaignTitle: string;
  clientUrl: string;
  digestKind?: 'daily_job_digest' | 'weekly_job_digest' | 'new_job_alert' | 'featured_job_announcement' | 'personalized_recommendations' | 'career_updates';
}): EmailTemplatePayload {
  const introMap: Record<string, string> = {
    daily_job_digest: 'Here is your daily summary of open roles matching your preferences on Job Karenge:',
    weekly_job_digest: 'Here is your weekly curated roundup of open roles matching your profile:',
    new_job_alert: 'A newly published opportunity matches your skills and career preferences:',
    featured_job_announcement: 'Check out featured hiring opportunities spotlighted on Job Karenge:',
    personalized_recommendations: 'We selected these personalized job recommendations based on your skills and preferences:',
    career_updates: 'Explore the latest career updates and verified employer openings on Job Karenge:',
  };

  const intro = introMap[params.digestKind || 'personalized_recommendations'] || introMap.personalized_recommendations;
  const listHtml = renderJobListItems(params.jobs, params.clientUrl);

  return {
    subject: params.subject,
    title: params.campaignTitle,
    preheader: `${params.jobs.length} matching role${params.jobs.length === 1 ? '' : 's'} curated for you on Job Karenge.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>${escapeHtml(intro)}</p>
      <ul style="padding:0;margin:16px 0;">${listHtml}</ul>`,
    ctaLabel: 'Browse All Matching Jobs',
    ctaUrl: `${params.clientUrl}/jobs`,
  };
}
