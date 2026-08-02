import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/context/AuthContext";
import useActiveTheme from "@/hooks/useActiveTheme";

const links = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" },
  { to: "/careers", label: "Careers" },
  { to: "/about", label: "About" },
  { to: "/testimonials", label: "Testimonials" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  useActiveTheme();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 z-50 w-full">
      <div className="mx-auto mt-4 max-w-7xl px-4">
        <div className="glass-strong flex items-center justify-between rounded-full px-5 py-2 shadow-[0_8px_30px_-12px_rgba(15,32,66,0.18)]">
          <Logo size={40} />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                data-testid={`nav-${l.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-[#F97316]"
                      : "text-[#0F2042]/75 hover:text-[#0F2042]"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user && user !== false ? (
              <button
                data-testid="nav-go-portal"
                onClick={() => navigate(user.role === "intern" ? "/intern" : "/app")}
                className="btn-primary text-sm"
              >
                Open Portal <ArrowUpRight size={16} />
              </button>
            ) : (
              <a
                href="https://contact.projexino.com/"
                target="_blank"
                rel="noreferrer"
                data-testid="nav-start"
                className="btn-primary text-sm"
              >
                Start Your Project <ArrowUpRight size={16} />
              </a>
            )}
          </div>
          <button
            data-testid="nav-menu-toggle"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[#0F2042]/5 p-2 text-[#0F2042] md:hidden"
            aria-label="menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass-strong mt-2 flex flex-col gap-1 rounded-3xl p-4 md:hidden"
            >
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-4 py-2 text-[#0F2042]/80 hover:bg-[#0F2042]/5"
                >
                  {l.label}
                </Link>
              ))}
              <a
                href="https://contact.projexino.com/"
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="btn-primary mt-2 justify-center"
              >
                Start Your Project
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
