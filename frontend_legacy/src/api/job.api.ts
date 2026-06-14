import { api } from '../services/api';

export interface JobListing {
    _id: string;
    employer: {
        _id: string;
        username: string;
        fullName: string;
        avatar?: string;
        bio?: string;
    };
    title: string;
    description: string;
    category: string;
    location: string;
    salaryRange: {
        min: number;
        max: number;
    };
    jobType: 'Full-time' | 'Part-time' | 'Contract' | 'Remote';
    skillsRequired: string[];
    deadline?: string;
    status: 'open' | 'closed' | 'paused' | 'expired';
    premium: boolean;
    applicants: any[];
    createdAt: string;
}

export interface JobApplication {
    _id: string;
    job: string | JobListing;
    applicant: string;
    resumeUrl?: string;
    coverLetter?: string;
    expectedSalary?: number;
    status: 'pending' | 'shortlisted' | 'accepted' | 'rejected';
    appliedAt: string;
}

export const getJobs = async (params?: any) => {
    const response = await api.get<JobListing[]>('/jobs', { params });
    return response.data;
};

export const getJobDetail = async (id: string) => {
    const response = await api.get<JobListing>(`/jobs/${id}`);
    return response.data;
};

export const createJob = async (data: any) => {
    const response = await api.post<JobListing>('/jobs', data);
    return response.data;
};

export const applyForJob = async (id: string, data: any) => {
    const response = await api.post(`/jobs/${id}/apply`, data);
    return response.data;
};

export const getEmployerJobs = async () => {
    const response = await api.get<JobListing[]>('/jobs/employer/my-jobs');
    return response.data;
};

export const getMyApplications = async () => {
    const response = await api.get<JobApplication[]>('/jobs/applicant/my-applications');
    return response.data;
};

export const hireApplicant = async (jobId: string, applicationId: string) => {
    const response = await api.post(`/jobs/${jobId}/hire`, { applicationId });
    return response.data;
};

export const confirmJobDone = async (jobId: string) => {
    const response = await api.post(`/jobs/${jobId}/confirm-done`);
    return response.data;
};

export const releasePayment = async (jobId: string) => {
    const response = await api.post(`/jobs/${jobId}/release-payment`);
    return response.data;
};
