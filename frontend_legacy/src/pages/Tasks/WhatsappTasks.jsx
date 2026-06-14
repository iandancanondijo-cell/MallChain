import React from 'react';
import { useNavigate } from 'react-router-dom';
import Whatsapp from './Social Icons/Whatsapp.jpeg';

export default function WhatsappTasks() {
  const navigate = useNavigate();
  const [allTasks, setAllTasks] = React.useState([]);

  const defaultTasks = [
    { id: 1, title: 'Follow the Mallcoin channel', reward: '17.495 mlpts' },
    { id: 2, title: 'Join the community', reward: '0.5 mlpts' },
  ];

  React.useEffect(() => {
    // Load default tasks
    let tasks = [...defaultTasks];
    
    // Load user-created tasks from localStorage
    const miningTasks = JSON.parse(localStorage.getItem('miningTasks') || '{}');
    if (miningTasks['whatsapp'] && Array.isArray(miningTasks['whatsapp'])) {
      miningTasks['whatsapp'].forEach(task => {
        tasks.push({
          id: task.id,
          title: task.title || task.description || 'User Created Task',
          reward: task.reward || `${task.expectedOutcome} mlpts`,
          isUserCreated: true,
        });
      });
    }
    
    setAllTasks(tasks);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ flex: '1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="p-6" style={{ flex: '0 0 auto', overflowY: 'auto' }}>
          <div className="max-w-7xl mx-auto">
          <button 
            onClick={() => navigate('/tasks')}
            className="mb-8 inline-flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            ← Back to Tasks
          </button>
          
          <div className="flex items-center gap-6 mb-12">
            <img 
              src={Whatsapp}
              alt="Whatsapp"
              style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">WhatsApp Tasks</h1>
              <p className="text-gray-300 text-lg">Complete tasks and earn Mallpoints</p>
            </div>
          </div>

          <div className="grid gap-6 pb-40" style={{ gridTemplateRows: 'repeat(2, 165px)', gridAutoFlow: 'column', gridAutoColumns: '200px' }}>
            {allTasks.map((task) => (
              <React.Fragment key={task.id}>
                <div 
                  style={{ 
                    width: '200px', 
                    height: '165px', 
                    overflow: 'hidden', 
                    borderRadius: '8px', 
                    border: task.isUserCreated ? '2px solid #a78bfa' : '1px solid #475569', 
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    backgroundColor: '#1e293b'
                  }}
                  className="hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20"
                >
                  <img 
                    src={Whatsapp}
                    alt="Whatsapp"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
                  />
                  <div style={{ position: 'absolute', top: '75px', left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p className="text-white text-sm font-semibold">{task.title}</p>
                    {task.isUserCreated && <p className="text-amber-300 text-xs">• Created by You</p>}
                  </div>
                </div>
                <p className="text-purple-400 font-bold text-sm" style={{ marginTop: '8px' }}>{task.reward}</p>
              </React.Fragment>
            ))}
          </div>
          </div>
        </div>
      </div>

      <div style={{ flex: '0 0 auto', padding: '12px', backgroundColor: '#0088cc' }}>
        <div className="max-w-7xl mx-auto">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '8px' }}>
            <div>
              <h3 className="text-white font-bold mb-2">About</h3>
              <ul className="space-y-1">
                <li><a href="#" className="text-gray-400 hover:text-white transition">About Mallcoin</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition">Careers</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-bold mb-2">Support</h3>
              <ul className="space-y-1">
                <li><a href="#" className="text-gray-400 hover:text-white transition">Help Center</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition">Contact Us</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-bold mb-2">Legal</h3>
              <ul className="space-y-1">
                <li><a href="#" className="text-gray-400 hover:text-white transition">Terms of Service</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition">Privacy Policy</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div style={{ paddingTop: '8px', textAlign: 'center' }}>
            <p className="text-gray-400 text-xs">&copy; 2026 Mallcoin. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
