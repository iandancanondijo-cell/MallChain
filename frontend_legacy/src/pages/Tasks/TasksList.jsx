import React from 'react';
import { Link } from 'react-router-dom';
import TikTok from './Social Icons/TikTok.jpeg';
import YouTube from './Social Icons/YouTube.jpeg';
import Instagram from './Social Icons/Instagram.jpeg';
import X from './Social Icons/X.jpeg';
import Twitch from './Social Icons/Twitch.jpeg';
import Telegram from './Social Icons/Telegram.jpeg';
import Patreon from './Social Icons/Patreon.jpeg';
import Whatsapp from './Social Icons/Whatsapp.jpeg';

export default function TasksList() {
  const scrollContainerRef = React.useRef(null);
  const [userCreatedTasks, setUserCreatedTasks] = React.useState({});

  React.useEffect(() => {
    // Load user-created tasks from localStorage
    const miningTasks = JSON.parse(localStorage.getItem('miningTasks') || '{}');
    setUserCreatedTasks(miningTasks);
  }, []);

  React.useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel);
      // Hide scrollbar
      container.style.scrollbarWidth = 'none';
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  const scrollbarHideStyle = `
    div::-webkit-scrollbar {
      display: none;
    }
    div {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  `;
  const socialLinks = [
    { icon: TikTok, label: 'TikTok', href: '/tasks/tiktok' },
    { icon: YouTube, label: 'YouTube', href: '/tasks/youtube' },
    { icon: Instagram, label: 'Instagram', href: '/tasks/instagram' },
    { icon: X, label: 'X', href: '/tasks/x' },
    { icon: Twitch, label: 'Twitch', href: '/tasks/twitch' },
    { icon: Telegram, label: 'Telegram', href: '/tasks/telegram' },
    { icon: Patreon, label: 'Patreon', href: '/tasks/patreon' },
    { icon: Whatsapp, label: 'Whatsapp', href: '/tasks/whatsapp' },
  ];

  const getPlatformIcon = (platform) => {
    const platformMap = {
      'tiktok': TikTok,
      'youtube': YouTube,
      'instagram': Instagram,
      'x': X,
      'twitch': Twitch,
      'telegram': Telegram,
      'patreon': Patreon,
      'whatsapp': Whatsapp,
    };
    return platformMap[platform?.toLowerCase()] || TikTok;
  };

  const defaultTasks = [
    { platform: 'tiktok', title: 'Watch video and earn Mallpoints', reward: '0.008' },
    { platform: 'youtube', title: 'Subscribe to a channel', reward: '1' },
    { platform: 'tiktok', title: 'Video and earn mallpoints', reward: '0.39' },
    { platform: 'x', title: 'Tweet and earn mallpoints', reward: '0.059' },
    { platform: 'whatsapp', title: 'Follow the Mallcoin channel', reward: '17.495' },
    { platform: 'telegram', title: 'Follow the Mallcoin channel', reward: '8.5' },
    { platform: 'youtube', title: 'Subscribe to Mallcoin channel', reward: '20' },
    { platform: 'instagram', title: 'Follow on Instagram', reward: '13.551' },
  ];

  const getAllTasks = () => {
    const allTasks = [...defaultTasks];
    Object.keys(userCreatedTasks).forEach(platform => {
      if (userCreatedTasks[platform] && Array.isArray(userCreatedTasks[platform])) {
        userCreatedTasks[platform].forEach(task => {
          allTasks.push({
            platform: platform,
            title: task.title || task.description || 'User Created Task',
            reward: task.reward || task.expectedOutcome || '0',
            isUserCreated: true,
          });
        });
      }
    });
    return allTasks;
  };

  return (
    <>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="p-6" style={{ flex: '0 0 auto' }}>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">Mines & Tasks</h1>
          <p className="text-gray-300 text-lg mb-12">Pick a Platform for mining activities</p>
          
          <div style={{ marginTop: '80px', display: 'flex', gap: '72px' }}>
            {socialLinks.map((social, index) => (
              <Link 
                key={index}
                to={social.href}
                className="hover:scale-110 transition-transform duration-200 inline-block"
                title={social.label}
              >
                <img 
                  src={social.icon}
                  alt={social.label}
                  style={{ width: '172px', height: '172px', borderRadius: '50%' }}
                  className="object-cover hover:opacity-80 transition-opacity"
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
      
      <div style={{ flex: '1', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'none', outline: 'none' }}>
        <div className="px-6" style={{ flex: '0 0 auto', borderBottom: 'none', boxShadow: 'none', paddingBottom: '0px', marginBottom: '0px' }}>
          <h2 className="text-2xl font-bold text-white" style={{ marginBottom: '24px', marginTop: '0px', paddingBottom: '0px' }}>Recommended Tasks</h2>
        </div>
        <div ref={scrollContainerRef} style={{ flex: '1', overflowY: 'hidden', overflowX: 'auto', paddingLeft: '24px', paddingRight: '12px', paddingBottom: '0px', border: 'none', outline: 'none', boxShadow: 'none', background: 'transparent', scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="scrollbar-hide">
          <div style={{ display: 'flex', gap: '49px', alignItems: 'flex-start', paddingBottom: '0px', whiteSpace: 'nowrap', paddingTop: '24px' }}>
            {getAllTasks().map((task, index) => (
              <div key={index} style={{ width: '200px' }}>
                <div style={{ width: '200px', height: '165px', overflow: 'hidden', borderRadius: '8px', border: task.isUserCreated ? '2px solid #a78bfa' : '1px solid #475569', position: 'relative', backgroundColor: '#1e293b' }}>
                  <img 
                    src={getPlatformIcon(task.platform)}
                    alt={task.platform}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
                  />
                  <div style={{ position: 'absolute', top: '75px', left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p className="text-white text-sm font-semibold">{task.title}</p>
                    {task.isUserCreated && <p className="text-amber-300 text-xs">• Created by You</p>}
                  </div>
                </div>
                <p className="text-purple-400 font-bold text-sm" style={{ marginTop: '8px' }}>{task.reward} mlpts</p>
              </div>
            ))}
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
    </>
  );
}