// Task API functions
import { api } from '../services/api';
import type {
    Task,
    CreateTaskRequest,
    TaskListResponse,
    StartTaskResponse,
} from '../types';

/**
 * List available tasks
 */
export async function listTasks(): Promise<Task[]> {
    // Backend mount is /api/tasks and route is '/'
    const response = await api.get<TaskListResponse>('/tasks');
    return response.data.tasks || response.data.data || [];
}

/**
 * Create a new task (creator only)
 */
export async function createTask(data: CreateTaskRequest): Promise<Task> {
    // Creation logic is in tasksCreator.js mounted at /api/tasksCreator
    const response = await api.post<{ task: Task }>('/tasksCreator/create', data);
    return response.data.task || response.data;
}

/**
 * Submit task completion
 */
/**
 * Submit task completion
 */
export async function submitTask(formData: FormData): Promise<void> {
    // Backend expects /complete/:taskId
    // FormData must contain taskId
    const taskId = formData.get('taskId') as string;
    if (!taskId) throw new Error('Task ID is required');
    await api.post(`/tasks/complete/${taskId}`, formData);
}

/**
 * Start a task
 */
export async function startTask(taskId: string): Promise<StartTaskResponse> {
    const response = await api.post<StartTaskResponse>(`/tasks/start/${taskId}`);
    return response.data;
}

/**
 * Get creator's tasks
 */
export async function getCreatorTasks(): Promise<Task[]> {
    const response = await api.get<TaskListResponse>('/tasksCreator/my-tasks');
    return response.data.tasks || response.data.data || [];
}
/**
 * Get creator's statistics
 */
export async function getCreatorStats(): Promise<any> {
    const response = await api.get('/tasksCreator/stats');
    return response.data;
}

/**
 * Get a single task details
 */
export async function getTask(id: string): Promise<Task> {
    const response = await api.get<Task>(`/tasks/${id}`);
    return response.data;
}

/**
 * Get creator's earning history
 */
export async function getCreatorHistory(): Promise<any[]> {
    const response = await api.get('/tasksCreator/history');
    return response.data || [];
}
