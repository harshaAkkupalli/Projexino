import Logo from "./Logo";
import { Github, Twitter, Linkedin, Mail, MapPin, Instagram, Youtube } from "lucide-react";
import { Link } from "react-router-dom";
import useSiteConfig from "@/hooks/useSiteConfig";
import NewsletterSignup from "@/components/NewsletterSignup";

export default function Footer() {
  const site = useSiteConfig();
  const socials = site?.socials || {};
  const socialItems = [
    { Icon: Linkedin, href: socials.linkedin },
    { Icon: Twitter, href: socials.twitter },
    { Icon: Instagram, href: socials.instagram },
    { Icon: Github, href: socials.github },
    { Icon: Youtube, href: socials.youtube },
    { Icon: Mail, href: site?.contact?.email ? `mailto:${site.contact.email}` : "" },
  ].filter((x) => x.href);
  return (
    <footer className="relative mt-32 border-t border-slate-200 bg-gradient-to-b from-white to-[#F8FAFC]">
      <div className="bg-noise pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo size={48} />
            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-600">
              {site?.about?.body || "Projexino delivers next-generation, AI-driven, and cross-platform app development services to transform your business with cutting-edge technology."}
            </p>
            <div className="mt-6 flex gap-3">
              {(socialItems.length ? socialItems : [{ Icon: Github }, { Icon: Twitter }, { Icon: Linkedin }, { Icon: Mail }]).map(({ Icon, href }, i) => (
                <a
                  key={i}
                  href={href || "#"}
                  target={href ? "_blank" : undefined}
                  rel={href ? "noreferrer" : undefined}
                  data-testid={`social-${i}`}
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-[#F97316] hover:text-[#F97316]"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">
              Company
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li><Link to="/services" className="hover:text-[#0F2042]">Services</Link></li>
              <li><Link to="/about" className="hover:text-[#0F2042]">About</Link></li>
              <li><Link to="/contact" className="hover:text-[#0F2042]">Contact</Link></li>
              <li>
                <Link to="/contact" className="hover:text-[#0F2042]">
                  Start a Project
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">
              Reach Us
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Mail size={14} /> {site?.contact?.email || "hello@projexino.com"}</li>
              <li className="flex items-center gap-2"><MapPin size={14} /> {site?.contact?.address || "Global · Remote-first"}</li>
            </ul>
            <div className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">
              Legal
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/privacy" data-testid="footer-privacy" className="hover:text-[#0F2042]">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" data-testid="footer-terms" className="hover:text-[#0F2042]">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link to="/account-deletion" data-testid="footer-account-deletion" className="hover:text-[#0F2042]">
                  Account Deletion
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Newsletter signup strip */}
        <div className="mt-12 rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50/60 via-white to-violet-50/40 p-5 md:flex md:items-center md:justify-between md:gap-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#F97316]">// stay in the loop</div>
            <div className="mt-1 font-display text-base font-semibold text-[#0F2042] md:text-lg">
              Subscribe to the Projexino newsletter.
            </div>
            <div className="text-xs text-slate-500">Fortnightly engineering teardown, AI cost benchmarks, SaaS launch playbooks.</div>
          </div>
          <div className="mt-4 md:mt-0 md:max-w-md md:flex-1">
            <NewsletterSignup variant="footer" source="footer" />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-slate-200 pt-6 text-center text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div>Developed by Projexino Solutions Pvt Ltd · © 2026 Projexino. All rights reserved.</div>
          <div className="flex justify-center gap-4 sm:justify-end">
            <Link to="/privacy" className="hover:text-[#0F2042]">Privacy</Link>
            <span className="text-slate-300">·</span>
            <Link to="/terms" className="hover:text-[#0F2042]">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
