/**
 * LeadsHub.jsx — Email & Outreach Hub landing.
 *
 * Per user request, the standalone "Leads" sub-tab has been removed. All lead
 * management lives inside the Outreach hub under the "Lead Management" tab,
 * so this component simply renders Outreach directly.
 */
import Outreach from "./Outreach";

export default function LeadsHub() {
  return <Outreach />;
}
