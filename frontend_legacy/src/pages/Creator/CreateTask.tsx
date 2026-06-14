import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, Calendar, Link as LinkIcon,
  ArrowRight, Loader2, Zap
} from 'lucide-react';
import { createTask } from "../../api/task.api";
import { toast } from "sonner";

export default function CreateTask() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    budgetMallpoints: '',
    calculatedReward: 0,
    platform: 'youtube',
    taskRequirement: 'views',
    link: '',
    deadline: ''
  });

  const platforms = [
    { id: 'youtube', name: 'YouTube', color: 'bg-red-500' },
    { id: 'instagram', name: 'Instagram', color: 'bg-pink-500' },
    { id: 'x', name: 'X', color: 'bg-sky-500' },
    { id: 'tiktok', name: 'TikTok', color: 'bg-black border border-white/20' },
    { id: 'twitch', name: 'Twitch', color: 'bg-purple-500' },
    { id: 'telegram', name: 'Telegram', color: 'bg-blue-500' },
    { id: 'patreon', name: 'Patreon', color: 'bg-red-600' },
    { id: 'whatsapp', name: 'WhatsApp', color: 'bg-green-500' }
  ];

  // Platform-specific task requirements and prices (in Mlpts)
  const taskRequirements = {
    youtube: [
      { id: 'views', name: 'Views', pricePerUnit: 0.05 },
      { id: 'likes', name: 'Likes', pricePerUnit: 0.1 },
      { id: 'subscriptions', name: 'Subscriptions', pricePerUnit: 1.0 }
    ],
    instagram: [
      { id: 'follows', name: 'Follows', pricePerUnit: 0.5 },
      { id: 'hearts', name: 'Hearts', pricePerUnit: 0.08 },
      { id: 'comments', name: 'Comments', pricePerUnit: 0.15 }
    ],
    x: [
      { id: 'likes', name: 'Likes', pricePerUnit: 0.02 },
      { id: 'comments', name: 'Comments', pricePerUnit: 0.05 },
      { id: 'follows', name: 'Follows', pricePerUnit: 0.1 },
      { id: 'reposts', name: 'Reposts', pricePerUnit: 0.08 }
    ],
    tiktok: [
      { id: 'views', name: 'Views', pricePerUnit: 0.008 },
      { id: 'likes', name: 'Likes', pricePerUnit: 0.05 },
      { id: 'comments', name: 'Comments', pricePerUnit: 0.1 },
      { id: 'follows', name: 'Follows', pricePerUnit: 0.2 }
    ],
    twitch: [
      { id: 'follows', name: 'Followers', pricePerUnit: 1.5 },
      { id: 'subscriptions', name: 'Subscriptions', pricePerUnit: 5.0 },
      { id: 'watchtime', name: 'Watch Time (hours)', pricePerUnit: 0.5 }
    ],
    telegram: [
      { id: 'follows', name: 'Channel Followers', pricePerUnit: 8.5 },
      { id: 'members', name: 'Group Members', pricePerUnit: 3.0 },
      { id: 'engagements', name: 'Engagements', pricePerUnit: 0.2 }
    ],
    patreon: [
      { id: 'patrons', name: 'Patrons', pricePerUnit: 10.0 },
      { id: 'subscriptions', name: 'Subscriptions', pricePerUnit: 5.0 },
      { id: 'referrals', name: 'Referrals', pricePerUnit: 5.0 }
    ],
    whatsapp: [
      { id: 'community', name: 'Community Members', pricePerUnit: 17.495 },
      { id: 'shares', name: 'Shares', pricePerUnit: 0.5 },
      { id: 'engagements', name: 'Engagements', pricePerUnit: 0.1 }
    ]
  };

  // Get current requirement options for selected platform
  const getCurrentRequirements = () => {
    return taskRequirements[formData.platform as keyof typeof taskRequirements] || [];
  };

  // Calculate expected outcome based on budget and activity price
  const calculateReward = (budget: string) => {
    if (!budget) return 0;
    const budgetNum = Number(budget);
    const requirements = getCurrentRequirements();
    const selectedReq = requirements.find(r => r.id === formData.taskRequirement);
    if (selectedReq) {
      const expectedOutcome = budgetNum / selectedReq.pricePerUnit;
      return Math.round(expectedOutcome * 100) / 100;
    }
    return 0;
  };

  const handleBudgetChange = (newBudget: string) => {
    setFormData({
      ...formData,
      budgetMallpoints: newBudget,
      calculatedReward: calculateReward(newBudget)
    });
  };

  const handleTaskRequirementChange = (newRequirement: string) => {
    setFormData(prev => ({
      ...prev,
      taskRequirement: newRequirement,
      calculatedReward: calculateReward(prev.budgetMallpoints)
    }));
  };

  async function handleSubmit() {
    setLoading(true);
    try {
      const budget = Number(formData.budgetMallpoints);
      await createTask({
        title: formData.title,
        description: formData.description,
        platform: formData.platform,
        action: formData.taskRequirement,
        link: formData.link,
        budget: budget,
        rewardPerAction: formData.calculatedReward,
        expectedOutcome: formData.calculatedReward,
        expiresAt: formData.deadline
      });
      // Export task to mining section by storing in localStorage
      const miningTasks = JSON.parse(localStorage.getItem('miningTasks') || '{}');
      if (!miningTasks[formData.platform]) {
        miningTasks[formData.platform] = [];
      }
      miningTasks[formData.platform].push({
        id: Date.now(),
        title: formData.title,
        description: formData.description,
        reward: `${formData.calculatedReward} ${formData.taskRequirement}`,
        expectedOutcome: formData.calculatedReward
      });
      localStorage.setItem('miningTasks', JSON.stringify(miningTasks));
      
      navigate('/creator/dashboard');
      toast.success("Task published successfully!");
    } catch (error) {
      console.error(error);
      const err = error as any;
      toast.error('Failed to create task: ' + (err.response?.data?.error || err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pb-20 animate-fade-in text-white">
      <h1 className="text-3xl font-black tracking-tight mb-2">Create New Task</h1>
      <p className="text-slate-500 font-medium mb-10">Define your campaign and start getting results.</p>

      <div className="glass-dark p-8 md:p-12 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
        {/* Progress Steps */}
        <div className="flex gap-2 mb-8">
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-purple-500' : 'bg-white/10'}`}></div>
          <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-purple-500' : 'bg-white/10'}`}></div>
        </div>

        {step === 1 ? (
          <div className="space-y-6 animate-slide-up">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Platform</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {platforms.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const newReqs = taskRequirements[p.id as keyof typeof taskRequirements];
                      setFormData({ 
                        ...formData, 
                        platform: p.id,
                        taskRequirement: newReqs[0]?.id || ''
                      });
                    }}
                    className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${formData.platform === p.id
                      ? 'bg-purple-500/10 border-purple-500 text-purple-400'
                      : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                      }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${p.color}`}></div>
                    <span className="text-xs font-bold uppercase tracking-wider">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Task Requirement</label>
              <select
                value={formData.taskRequirement}
                onChange={(e) => handleTaskRequirementChange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600"
              >
                {getCurrentRequirements().map(req => (
                  <option key={req.id} value={req.id} className="bg-slate-900">
                    {req.name} ({req.pricePerUnit} Mlpt per unit)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Budget (Mallpoints)</label>
              <div className="relative">
                <Zap className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="number"
                  value={formData.budgetMallpoints}
                  onChange={(e) => handleBudgetChange(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600"
                  placeholder="e.g. 300"
                />
              </div>
            </div>

            {formData.budgetMallpoints && (
              <div className="p-6 rounded-2xl bg-purple-500/10 border border-purple-500/30">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Expected Outcome</p>
                <p className="text-2xl font-black text-purple-300">
                  {formData.calculatedReward.toLocaleString()} <span className="text-sm text-purple-400">{formData.taskRequirement}</span>
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Task Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600 min-h-[120px]"
                placeholder="Specify the exact action users need to perform for your task..."
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStep(2)}
                disabled={!formData.description || !formData.budgetMallpoints}
                className="px-8 py-4 rounded-2xl bg-white text-black font-black hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                Next Step <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-slide-up">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Action Link</label>
              <div className="relative">
                <LinkIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="url"
                  value={formData.link}
                  onChange={e => setFormData({ ...formData, link: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Budget (Mallpoints)</label>
                <div className="relative">
                  <Zap className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="number"
                    value={formData.budgetMallpoints}
                    disabled
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white outline-none placeholder-slate-600 opacity-75 cursor-not-allowed"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Expected {formData.taskRequirement}</label>
                <div className="relative">
                  <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="number"
                    value={formData.calculatedReward}
                    disabled
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white outline-none placeholder-slate-600 opacity-75 cursor-not-allowed"
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Deadline</label>
              <div className="relative">
                <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white outline-none focus:border-purple-500/50 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-8 py-4 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !formData.budgetMallpoints || !formData.link}
                className="flex-1 px-8 py-4 rounded-2xl bg-purple-500 text-white font-black hover:bg-purple-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Publish Task'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
