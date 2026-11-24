import { Download, Eye, Plus, Trash2, Upload, UserCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SkeletonList } from '../../components/common/UIPrimitives';
import { useAuth } from '../../context/AuthContext';
import { api, getAccessToken, getApiErrorMessage, resolveApiAssetUrl } from '../../services/api';
import type { CandidateProfile } from '../../types';
import { formatShortDate } from '../../utils/formatters';

export function CandidateProfilePage() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [personal, setPersonal] = useState({
    name: '',
    phone: '',
    location: '',
    dob: '',
    gender: '',
    currentLocation: '',
    address: '',
  });
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [newSkill, setNewSkill] = useState({ name: '', proficiency: 'Intermediate' });
  const [newSoftSkill, setNewSoftSkill] = useState('');
  const [newCert, setNewCert] = useState('');
  const [newLang, setNewLang] = useState('');

  useEffect(() => {
    api
      .get('/candidate/profile')
      .then((res) => {
        const u = res.data.data.user;
        const p: CandidateProfile = res.data.data.profile;
        setPersonal({
          name: u.name || '',
          phone: u.phone || '',
          location: u.location || '',
          dob: p.dob || '',
          gender: p.gender || '',
          currentLocation: p.currentLocation || u.location || '',
          address: p.address || '',
        });
        setProfile(p);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const res = await api.put('/candidate/profile', {
        ...personal,
        headline: profile.headline,
        designation: profile.designation,
        objective: profile.objective,
        totalExperienceYears: profile.totalExperienceYears,
        expectedSalary: profile.expectedSalary,
        education: profile.education,
        experience: profile.experience,
        technicalSkills: profile.technicalSkills,
        softSkills: profile.softSkills,
        projects: profile.projects,
        certifications: profile.certifications,
        languages: profile.languages,
        socialLinks: profile.socialLinks,
      });
      setProfile(res.data.data.profile);
      await refreshUser();
      toast.success('Profile updated successfully.');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await api.post('/candidate/photo', fd);
      await refreshUser();
      toast.success('Profile photo updated.');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingResume(true);
    const fd = new FormData();
    fd.append('resume', file);
    try {
      const res = await api.post('/candidate/resume', fd);
      setProfile(res.data.data.profile);
      await refreshUser();
      toast.success(res.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setUploadingResume(false);
      e.target.value = '';
    }
  };

  const handleDeleteResume = async () => {
    try {
      const res = await api.delete('/candidate/resume');
      setProfile(res.data.data.profile);
      await refreshUser();
      toast.success('Resume removed.');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleViewResume = async () => {
    if (!profile?.resumeUrl) return;
    const resolvedUrl = resolveApiAssetUrl(profile.resumeUrl);
    if (profile.resumeUrl.startsWith('http')) {
      const a = document.createElement('a');
      a.href = resolvedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = profile.resumeFileName || 'resume.pdf';
      a.click();
      return;
    }
    try {
      const res = await fetch(resolvedUrl, {
        headers: { Authorization: `Bearer ${getAccessToken() || ''}` },
      });
      if (!res.ok) throw new Error('Unable to download resume');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = profile.resumeFileName || 'resume.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  if (loading || !profile) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Professional Profile</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 tabular-nums">
            Completion Score: {profile.completionPercentage}% · Keep your resume and skills current.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Eye className="w-4 h-4" />
          <span>Preview Public Profile</span>
        </button>
      </div>

      {/* Resume Management Card */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Resume Management (PDF &lt; 1 MB)</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              PDFs are validated and compressed automatically on the server so every stored document stays under 1 MB.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>{uploadingResume ? 'Compressing & Uploading...' : profile.resumeUrl ? 'Replace Resume PDF' : 'Upload Resume PDF'}</span>
            <input type="file" accept="application/pdf" onChange={handleResumeUpload} className="hidden" disabled={uploadingResume} />
          </label>
        </div>

        {profile.resumeUrl && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">{profile.resumeFileName || 'Resume.pdf'}</p>
              <p className="text-xs text-slate-500 tabular-nums">
                Size: {(profile.resumeSizeBytes / 1024).toFixed(0)} KB · Uploaded {formatShortDate(profile.resumeUploadedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleViewResume}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download / View</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteResume}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
      </section>

      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Personal Info & Photo */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              {user?.profileImage ? (
                <img src={resolveApiAssetUrl(user.profileImage)} alt={user.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-9 h-9 text-slate-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Personal Information</h2>
              <label className="mt-1 inline-block text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                {uploadingPhoto ? 'Uploading photo...' : 'Upload profile photo (JPEG, PNG, WebP)'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name</label>
              <input
                type="text"
                value={personal.name}
                onChange={(e) => setPersonal({ ...personal, name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input
                type="text"
                value={personal.phone}
                onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Current Location</label>
              <input
                type="text"
                value={personal.currentLocation}
                onChange={(e) => setPersonal({ ...personal, currentLocation: e.target.value, location: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date of Birth (Optional)</label>
              <input
                type="date"
                value={personal.dob}
                onChange={(e) => setPersonal({ ...personal, dob: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Gender (Optional)</label>
              <select
                value={personal.gender}
                onChange={(e) => setPersonal({ ...personal, gender: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Prefer not to say</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Address</label>
              <input
                type="text"
                value={personal.address}
                onChange={(e) => setPersonal({ ...personal, address: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
        </section>

        {/* Professional Summary */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Professional Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Profile Headline</label>
              <input
                type="text"
                value={profile.headline}
                onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                placeholder="e.g. Full-Stack TypeScript Engineer · 4 Yrs Experience"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Current Designation</label>
              <input
                type="text"
                value={profile.designation}
                onChange={(e) => setProfile({ ...profile, designation: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Total Experience (Years)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={profile.totalExperienceYears}
                onChange={(e) => setProfile({ ...profile, totalExperienceYears: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Career Objective &amp; Introduction</label>
              <textarea
                rows={3}
                value={profile.objective}
                onChange={(e) => setProfile({ ...profile, objective: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expected Salary</label>
              <input
                type="text"
                value={profile.expectedSalary}
                onChange={(e) => setProfile({ ...profile, expectedSalary: e.target.value })}
                placeholder="e.g. ₹22L – ₹28L / yr"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
        </section>

        {/* Skills & Certifications */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Skills, Certifications &amp; Languages</h2>
          <div>
            <label className="block text-xs font-medium mb-2">Technical Skills</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {profile.technicalSkills.map((s, idx) => (
                <span key={idx} className="inline-flex items-center gap-2 px-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700">
                  <span>{s.name} · {s.proficiency}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        technicalSkills: profile.technicalSkills.filter((_, i) => i !== idx),
                      })
                    }
                    className="text-rose-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newSkill.name}
                onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                placeholder="Add skill (e.g. React, MongoDB)"
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              <select
                value={newSkill.proficiency}
                onChange={(e) => setNewSkill({ ...newSkill, proficiency: e.target.value })}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
                <option value="Expert">Expert</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newSkill.name.trim()) return;
                  setProfile({
                    ...profile,
                    technicalSkills: [...profile.technicalSkills, { ...newSkill, name: newSkill.name.trim() }],
                  });
                  setNewSkill({ name: '', proficiency: 'Intermediate' });
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Skill
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium mb-1">Soft Skills</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSoftSkill}
                  onChange={(e) => setNewSoftSkill(e.target.value)}
                  placeholder="Communication, Leadership"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newSoftSkill.trim()) return;
                    setProfile({ ...profile, softSkills: [...profile.softSkills, newSoftSkill.trim()] });
                    setNewSoftSkill('');
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Add
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{profile.softSkills.join(' · ')}</p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Certifications</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCert}
                  onChange={(e) => setNewCert(e.target.value)}
                  placeholder="AWS Solutions Architect"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newCert.trim()) return;
                    setProfile({ ...profile, certifications: [...profile.certifications, newCert.trim()] });
                    setNewCert('');
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Add
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{profile.certifications.join(' · ')}</p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Languages</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLang}
                  onChange={(e) => setNewLang(e.target.value)}
                  placeholder="English, Hindi"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newLang.trim()) return;
                    setProfile({ ...profile, languages: [...profile.languages, newLang.trim()] });
                    setNewLang('');
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Add
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{profile.languages.join(' · ')}</p>
            </div>
          </div>
        </section>

        {/* Work Experience & Education & Projects */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Work Experience</h2>
            <button
              type="button"
              onClick={() =>
                setProfile({
                  ...profile,
                  experience: [
                    ...profile.experience,
                    { company: '', jobTitle: '', employmentType: 'Full-time', startDate: '', endDate: '', current: false, responsibilities: '' },
                  ],
                })
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add Experience
            </button>
          </div>
          {profile.experience.map((exp, idx) => (
            <div key={idx} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Company"
                  value={exp.company}
                  onChange={(e) => {
                    const copy = [...profile.experience];
                    copy[idx] = { ...exp, company: e.target.value };
                    setProfile({ ...profile, experience: copy });
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <input
                  type="text"
                  placeholder="Job Title"
                  value={exp.jobTitle}
                  onChange={(e) => {
                    const copy = [...profile.experience];
                    copy[idx] = { ...exp, jobTitle: e.target.value };
                    setProfile({ ...profile, experience: copy });
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <div className="flex gap-2">
                  <input
                    type="month"
                    value={exp.startDate}
                    onChange={(e) => {
                      const copy = [...profile.experience];
                      copy[idx] = { ...exp, startDate: e.target.value };
                      setProfile({ ...profile, experience: copy });
                    }}
                    className="flex-1 px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                  <input
                    type="month"
                    disabled={exp.current}
                    value={exp.endDate}
                    onChange={(e) => {
                      const copy = [...profile.experience];
                      copy[idx] = { ...exp, endDate: e.target.value };
                      setProfile({ ...profile, experience: copy });
                    }}
                    className="flex-1 px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent disabled:opacity-40"
                  />
                </div>
              </div>
              <textarea
                rows={2}
                placeholder="Key responsibilities and impact"
                value={exp.responsibilities}
                onChange={(e) => {
                  const copy = [...profile.experience];
                  copy[idx] = { ...exp, responsibilities: e.target.value };
                  setProfile({ ...profile, experience: copy });
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exp.current}
                    onChange={(e) => {
                      const copy = [...profile.experience];
                      copy[idx] = { ...exp, current: e.target.checked };
                      setProfile({ ...profile, experience: copy });
                    }}
                  />
                  <span>Currently working here</span>
                </label>
                <button
                  type="button"
                  onClick={() => setProfile({ ...profile, experience: profile.experience.filter((_, i) => i !== idx) })}
                  className="text-rose-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Education</h2>
            <button
              type="button"
              onClick={() =>
                setProfile({
                  ...profile,
                  education: [
                    ...profile.education,
                    { institution: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '', grade: '' },
                  ],
                })
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add Education
            </button>
          </div>
          {profile.education.map((edu, idx) => (
            <div key={idx} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Institution"
                value={edu.institution}
                onChange={(e) => {
                  const copy = [...profile.education];
                  copy[idx] = { ...edu, institution: e.target.value };
                  setProfile({ ...profile, education: copy });
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              <input
                type="text"
                placeholder="Degree (e.g. B.Tech)"
                value={edu.degree}
                onChange={(e) => {
                  const copy = [...profile.education];
                  copy[idx] = { ...edu, degree: e.target.value };
                  setProfile({ ...profile, education: copy });
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Field / Grade"
                  value={edu.fieldOfStudy}
                  onChange={(e) => {
                    const copy = [...profile.education];
                    copy[idx] = { ...edu, fieldOfStudy: e.target.value };
                    setProfile({ ...profile, education: copy });
                  }}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => setProfile({ ...profile, education: profile.education.filter((_, i) => i !== idx) })}
                  className="text-xs text-rose-600 px-2"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </section>

        {/* Social Links */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Projects &amp; Social Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input
              type="url"
              placeholder="LinkedIn URL"
              value={profile.socialLinks.linkedin}
              onChange={(e) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, linkedin: e.target.value } })}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
            <input
              type="url"
              placeholder="GitHub URL"
              value={profile.socialLinks.github}
              onChange={(e) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, github: e.target.value } })}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
            <input
              type="url"
              placeholder="Portfolio URL"
              value={profile.socialLinks.portfolio}
              onChange={(e) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, portfolio: e.target.value } })}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
            <input
              type="url"
              placeholder="Personal Website URL"
              value={profile.socialLinks.website}
              onChange={(e) => setProfile({ ...profile, socialLinks: { ...profile.socialLinks, website: e.target.value } })}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
          >
            {saving ? 'Saving Profile...' : 'Save Profile Changes'}
          </button>
        </div>
      </form>

      {/* Public Profile Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{personal.name}</h2>
                <p className="text-sm text-blue-600 dark:text-blue-400">{profile.headline || profile.designation}</p>
                <p className="text-xs text-slate-500 mt-1">{personal.currentLocation} · {profile.totalExperienceYears} yrs experience</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Close
              </button>
            </div>
            {profile.objective && <p className="text-sm text-slate-700 dark:text-slate-300">{profile.objective}</p>}
            {profile.technicalSkills.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500">Technical Skills</h3>
                <p className="mt-1 text-sm">{profile.technicalSkills.map((s) => `${s.name} (${s.proficiency})`).join(' · ')}</p>
              </div>
            )}
            {profile.experience.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500">Experience</h3>
                <div className="mt-2 space-y-2">
                  {profile.experience.map((e, i) => (
                    <div key={i} className="text-sm">
                      <strong>{e.jobTitle}</strong> at {e.company}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
