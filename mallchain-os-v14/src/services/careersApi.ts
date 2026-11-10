/**
 * Careers API — wraps backend/src/routes/careers.js. Every opening on the board
 * was published by a verified account; nothing here is seeded or simulated.
 */
import { api, type ApiResult } from './api';

export type EducationLevel = 'none' | 'certificate' | 'diploma' | 'bachelors' | 'masters' | 'doctorate';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship';
export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type PayPeriod = 'hour' | 'month' | 'year';
export type OpeningStatus = 'open' | 'closed' | 'filled';
export type ApplicationStatus = 'submitted' | 'shortlisted' | 'rejected' | 'hired' | 'withdrawn';

/** The full spec of a role. Lists are one line per item, as the server stores them. */
export interface JobSpec {
  title: string;
  workspace: string;
  field: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  preferredSkills: string[];
  benefits: string[];
  educationLevel: EducationLevel;
  experienceYears: number;
  seniority: Seniority;
  employmentType: EmploymentType;
  location: string;
  workMode: WorkMode;
  positions: number;
  payMin: number | null;
  payMax: number | null;
  payCurrency: string;
  payPeriod: PayPeriod;
  equity: string;
  applicationInstructions: string;
  deadline: string | null;
}

export interface JobOpening extends JobSpec {
  id: string;
  authorId: string;
  authorName: string;
  status: OpeningStatus;
  applicationsCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  /** Only on reads that can tell: this account is the author. */
  mine?: boolean;
  myApplication?: { id: string; status: ApplicationStatus; message: string; createdAt: string } | null;
}

export interface BoardResult {
  openings: JobOpening[];
  total: number;
  limit: number;
  offset: number;
  availableWorkspaces: string[];
  availableFields: string[];
}

export interface BoardFilters {
  workspace?: string;
  field?: string;
  workMode?: string;
  employmentType?: string;
  seniority?: string;
  educationLevel?: string;
  q?: string;
  status?: OpeningStatus | 'all';
  limit?: number;
  offset?: number;
}

export interface CareersOptions {
  workspaces: string[];
  fields: string[];
  educationLevels: EducationLevel[];
  seniorities: Seniority[];
  employmentTypes: EmploymentType[];
  workModes: WorkMode[];
  payPeriods: PayPeriod[];
}

/** An application as the opening's author sees it. */
export interface OpeningApplication {
  id: string;
  applicantId: string;
  applicantName: string;
  message: string;
  status: ApplicationStatus;
  authorNote: string;
  createdAt: string;
  respondedAt: string | null;
}

/** An application as the person who sent it sees it. */
export interface MyApplication {
  id: string;
  openingId: string;
  openingTitle: string;
  workspace: string;
  field: string;
  openingStatus: OpeningStatus;
  authorName: string;
  message: string;
  status: ApplicationStatus;
  authorNote: string;
  createdAt: string;
  respondedAt: string | null;
}

interface Envelope<T> { ok: boolean; data?: T; error?: string; }
async function unwrap<T>(promise: Promise<ApiResult<Envelope<T>>>): Promise<ApiResult<T>> {
  const result = await promise;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  if (result.data && result.data.ok === false) return { ok: false, error: result.data.error || 'Request failed' };
  return { ok: true, data: result.data?.data as T };
}

const id = (value: string) => encodeURIComponent(value);

class CareersApi {
  async options(): Promise<ApiResult<CareersOptions>> {
    return unwrap(api.get('/api/careers/options'));
  }

  async board(filters: BoardFilters = {}): Promise<ApiResult<BoardResult>> {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== '' && v !== null) params[k] = v as string | number;
    }
    return unwrap(api.get('/api/careers/openings', params));
  }

  async mine(): Promise<ApiResult<JobOpening[]>> {
    return unwrap(api.get('/api/careers/openings/mine'));
  }

  async get(openingId: string): Promise<ApiResult<JobOpening>> {
    return unwrap(api.get(`/api/careers/openings/${id(openingId)}`));
  }

  async create(spec: JobSpec): Promise<ApiResult<JobOpening>> {
    return unwrap(api.post('/api/careers/openings', spec));
  }

  async update(openingId: string, patch: Partial<JobSpec> & { status?: OpeningStatus }): Promise<ApiResult<JobOpening>> {
    return unwrap(api.patch(`/api/careers/openings/${id(openingId)}`, patch));
  }

  async remove(openingId: string): Promise<ApiResult<{ deleted: boolean }>> {
    return unwrap(api.del(`/api/careers/openings/${id(openingId)}`));
  }

  async apply(openingId: string, message: string): Promise<ApiResult<MyApplication>> {
    return unwrap(api.post(`/api/careers/openings/${id(openingId)}/apply`, { message }));
  }

  async applicationsFor(openingId: string): Promise<ApiResult<OpeningApplication[]>> {
    return unwrap(api.get(`/api/careers/openings/${id(openingId)}/applications`));
  }

  async myApplications(): Promise<ApiResult<MyApplication[]>> {
    return unwrap(api.get('/api/careers/applications/mine'));
  }

  async answer(applicationId: string, status: ApplicationStatus, note?: string): Promise<ApiResult<{ id: string; status: ApplicationStatus; authorNote: string }>> {
    return unwrap(api.patch(`/api/careers/applications/${id(applicationId)}`, { status, note: note || '' }));
  }

  async withdraw(applicationId: string): Promise<ApiResult<{ id: string; status: 'withdrawn' }>> {
    return unwrap(api.post(`/api/careers/applications/${id(applicationId)}/withdraw`, {}));
  }
}

export const careersApi = new CareersApi();

export const EDUCATION_LABEL: Record<EducationLevel, string> = {
  none: 'No formal requirement',
  certificate: 'Certificate',
  diploma: 'Diploma',
  bachelors: "Bachelor's degree",
  masters: "Master's degree",
  doctorate: 'Doctorate',
};

export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: 'Intern', junior: 'Junior', mid: 'Mid-level', senior: 'Senior', lead: 'Lead', principal: 'Principal',
};

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', freelance: 'Freelance', internship: 'Internship',
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: 'Awaiting a response',
  shortlisted: 'Shortlisted',
  rejected: 'Not taken forward',
  hired: 'Accepted',
  withdrawn: 'Withdrawn',
};

export const EMPTY_SPEC: JobSpec = {
  title: '',
  workspace: '',
  field: '',
  description: '',
  responsibilities: [],
  requirements: [],
  skills: [],
  preferredSkills: [],
  benefits: [],
  educationLevel: 'none',
  experienceYears: 0,
  seniority: 'mid',
  employmentType: 'full_time',
  location: '',
  workMode: 'remote',
  positions: 1,
  payMin: null,
  payMax: null,
  payCurrency: 'USD',
  payPeriod: 'month',
  equity: '',
  applicationInstructions: '',
  deadline: null,
};

/** "1,200 – 2,000 USD / month", or the honest absence of a number. */
export function payLine(o: Pick<JobSpec, 'payMin' | 'payMax' | 'payCurrency' | 'payPeriod'>): string {
  const fmt = (n: number) => n.toLocaleString();
  if (o.payMin == null && o.payMax == null) return 'Pay not stated';
  const range = o.payMin != null && o.payMax != null && o.payMin !== o.payMax
    ? `${fmt(o.payMin)} – ${fmt(o.payMax)}`
    : fmt((o.payMin ?? o.payMax) as number);
  const per = { hour: 'hour', month: 'month', year: 'year' }[o.payPeriod] || 'month';
  return `${range} ${o.payCurrency || 'USD'} / ${per}`;
}
