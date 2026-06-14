// Task types for the task economy system

export interface Task {
    _id?: string;
    id?: string;
    title: string;
    platform?: string;
    action?: string;
    link?: string;
    description?: string;
    rewardPerAction?: number;
    reward?: number;
    budget?: number;
    status?: 'active' | 'completed' | 'paused' | 'cancelled';
    creatorId?: string;
    totalSlots?: number;
    remainingSlots?: number;
    completedCount?: number;
    progress?: number;
    remaining?: number;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    expiresAt?: string | Date;
}

export interface TaskCompletion {
    _id?: string;
    id?: string;
    taskId: string;
    userId: string;
    status: 'pending' | 'approved' | 'rejected';
    proof?: string;
    submittedAt?: string | Date;
    reviewedAt?: string | Date;
    reward?: number;
}

export interface CreateTaskRequest {
    title: string;
    platform?: string;
    action?: string;
    link?: string;
    description?: string;
    rewardPerAction?: number;
    budget: number;
    totalSlots?: number;
    expiresAt?: string | Date;
}

export interface SubmitTaskRequest {
    taskId: string;
    proof?: File | string;
}

export interface TaskListResponse {
    tasks?: Task[];
    data?: Task[];
}

export interface StartTaskResponse {
    token?: string;
    verificationToken?: string;
    campaign?: any;
}
