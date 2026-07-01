import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Building2, Clock, LockKeyhole, MessageCircle, WalletCards } from "lucide-react";

const PLANNED_FEATURES = [
  { icon: LockKeyhole, title: "Client Login Accounts", description: "Unique logins for each client company to view only their assigned leads." },
  { icon: Building2, title: "Lead Assignment", description: "Assign specific leads to client accounts. Clients see only what they're entitled to." },
  { icon: MessageCircle, title: "WhatsApp Report Delivery", description: "Automated daily/weekly lead summaries delivered via WhatsApp Business API." },
  { icon: WalletCards, title: "Billing & Invoicing", description: "Track subscription plans, usage quotas, and generate SAR invoices." },
];

export function ClientPortal() {
  return (
    <div className="space-y-6">
      {/* Phase 2 Notice */}
      <Card className="overflow-hidden border-amber-200 dark:border-amber-800">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Clock className="w-5 h-5" />
                Client Portal — Coming in Phase 2
              </CardTitle>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                This feature is planned but not yet built. The screens below are a design preview only — no real data is shown.
              </p>
            </div>
            <Badge className="bg-amber-600 text-white border-0 shrink-0">Not Live</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PLANNED_FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="flex gap-3 p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                  <div className="shrink-0 mt-0.5">
                    <Icon className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{feat.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{feat.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
            To request this feature, contact your FieldTrack account manager.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
