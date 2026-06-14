import { useState, useEffect } from 'react';
import { listTasks } from '../../api';
import type { Task } from '../../types';
import TaskCard from "../../components/tasks/TaskCard";

export default function TasksFeed() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const taskList = await listTasks();
        setTasks(taskList);
      } catch (e) {
        console.warn('Failed to load tasks:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Available Tasks</h1>
      {loading ? <div>Loading...</div> : (
        tasks && tasks.length ? tasks.map(t => (
          <TaskCard key={t._id || t.id} platform={t.platform || ''} action={t.action || ''} reward={(t.rewardPerAction || t.reward || 0) + ' MLPT'} />
        )) : (
          <div className="text-sm text-gray-500">No tasks available</div>
        )
      )}
    </div>
  );
}
