import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ShoppingBag, Store, Truck, PenTool, Sparkles } from "lucide-react";
import { useUserStore } from "../../store/userStore";
import { api } from "../../services/api";
import LoadingSpinner from "../../components/LoadingSpinner";

const ROLES = [
  {
    id: "buyer",
    title: "Buyer",
    description: "Browse and purchase products with MallCoin",
    icon: ShoppingBag,
    gradient: "from-blue-500 to-cyan-400",
    path: "/buyer"
  },
  {
    id: "seller",
    title: "Seller",
    description: "Sell products and manage your store",
    icon: Store,
    gradient: "from-primary to-yellow-400",
    path: "/seller"
  },
  {
    id: "delivery",
    title: "Delivery",
    description: "Deliver orders and earn rewards",
    icon: Truck,
    gradient: "from-green-500 to-emerald-400",
    path: "/delivery"
  },
  {
    id: "creator",
    title: "Creator",
    description: "Complete tasks and earn MallPoints",
    icon: PenTool,
    gradient: "from-purple-500 to-pink-400",
    path: "/earn"
  },
];

export default function RoleSelection() {
  const navigate = useNavigate();
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRoleSelect(roleId: string, path: string) {
    setLoading(true);
    setError("");

    try {
      // Update user role in backend
      await api.put("/users/role", { role: roleId });

      // Update local user state
      if (user) {
        setUser({ ...user, role: roleId as 'buyer' | 'seller' | 'creator' | 'delivery' });
      }

      // Navigate to role dashboard
      navigate(path);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to update role. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-blue-950 flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]"></div>

      <div className="relative z-10 w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/30 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Choose Your Path
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
            Select Your Role
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Choose how you want to participate in the marketplace ecosystem
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm text-center animate-slide-up">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {/* Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ROLES.map((role, index) => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => handleRoleSelect(role.id, role.path)}
                disabled={loading}
                className="group relative p-8 rounded-2xl glass-dark border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 animate-slide-up text-left"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Gradient Glow on Hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${role.gradient} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-300`}></div>

                <div className="relative">
                  {/* Icon */}
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${role.gradient} p-3 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <Icon className="w-full h-full text-white" />
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-white mb-3">
                    {role.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-400 leading-relaxed text-sm">
                    {role.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass-dark p-8 rounded-2xl">
              <LoadingSpinner size="lg" text="Setting up your role..." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
