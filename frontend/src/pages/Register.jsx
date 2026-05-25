import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, User, Mail, Lock } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, register, error } = useAuth();
  const navigate = useNavigate();

  if (user && user !== false) return <Navigate to="/app/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await register(name, email, password);
    setLoading(false);
    if (ok) {
      toast.success("Account created");
      navigate("/app/dashboard");
    } else {
      toast.error("Registration failed");
    }
  };

  return (
    <div data-testid="page-register" className="relative min-h-screen overflow-hidden bg-canvas-mint text-[#0F172A]">
      <div className="absolute inset-0 bg-grid-light opacity-50" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-10 flex justify-center">
          <Logo size={56} />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-soft p-8">
          <h1 className="font-display text-3xl font-medium text-[#0F2042]">Create account</h1>
          <p className="mt-1 text-sm text-slate-500">Spin up your Projexino workspace.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field icon={User} label="Name" type="text" value={name} onChange={setName} testId="register-name" />
            <Field icon={Mail} label="Email" type="email" value={email} onChange={setEmail} testId="register-email" />
            <Field icon={Lock} label="Password" type="password" value={password} onChange={setPassword} testId="register-password" min={6} />
            {error && <div data-testid="register-error" className="text-sm text-red-500">{error}</div>}
            <button type="submit" disabled={loading} data-testid="register-submit-btn" className="btn-primary w-full justify-center disabled:opacity-60">
              {loading ? "Creating…" : "Create account"} <ArrowRight size={18} />
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" data-testid="link-login" className="text-[#F97316] hover:underline">
              Sign in
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, type, value, onChange, testId, min }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <div className="relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          data-testid={testId} type={type} required minLength={min} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        />
      </div>
    </label>
  );
}
