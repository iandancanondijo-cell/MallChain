import { useState, useEffect } from 'react';
import { getCreatorTasks } from '../../api';
import type { Task } from '../../types';

export default function CreatorTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const myTasks = await getCreatorTasks();
        setTasks(myTasks);
      } catch (e) {
        console.warn('Failed to load my tasks', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">My Tasks</h1>
      {loading ? <div>Loading...</div> : (
        <div className="space-y-3">
          {tasks.length === 0 && <div className="text-gray-500">No tasks found</div>}
          {tasks.map(t => (
            <div key={t._id || t.id} className="border p-3 rounded">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-500">{t.platform}</div>
                  <div className="font-semibold">{t.action}</div>
                  <div className="text-xs text-gray-500">Progress: {t.progress || 0}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">Spent: {t.budget}</div>
                  <button className="mt-2 px-3 py-1 bg-gray-100 rounded">View</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
