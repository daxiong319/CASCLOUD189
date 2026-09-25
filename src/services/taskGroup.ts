import { AppDataSource } from '../database';
import { Task, TaskGroup } from '../entities';

export class TaskGroupService {
    public static async getTaskGroups(): Promise<TaskGroup[]> {
        const repo = AppDataSource.getRepository(TaskGroup);
        return await repo.find({ order: { createdAt: 'DESC' } });
    }

    public static async createTaskGroup(name: string): Promise<TaskGroup> {
        const repo = AppDataSource.getRepository(TaskGroup);
        const group = repo.create({ name });
        return await repo.save(group);
    }

    public static async updateTaskGroup(id: number, name: string): Promise<void> {
        const repo = AppDataSource.getRepository(TaskGroup);
        await repo.update(id, { name });
    }

    public static async deleteTaskGroup(id: number): Promise<void> {
        const repo = AppDataSource.getRepository(TaskGroup);
        const taskRepo = AppDataSource.getRepository(Task);
        await taskRepo.update({ groupId: id }, { groupId: undefined });
        await repo.delete(id);
    }

    public static async updateTasksGroup(taskIds: number[], groupId: number | null): Promise<void> {
        const taskRepo = AppDataSource.getRepository(Task);
        for (const tid of taskIds) {
            await taskRepo.update(tid, { groupId: groupId || undefined });
        }
    }
}

export default TaskGroupService;
