import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Progress } from "../ui/progress";
// NEW - present the mandatory side-by-side duplicate decision to the Admin.
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { useParams, useNavigate } from "react-router";
// CHANGED - include the shared comparison type returned by guarded approval.
import { getLead, approveLead, rejectLead, deleteLead, type NearbyLead } from "../../lib/api";
// CHANGED - add a visible warning icon for duplicate review.
import { ArrowLeft, Check, X, MapPin, Phone, User, Calendar, Image, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState("");
  // NEW - retain both leads until the Admin chooses unique or duplicate.
  const [duplicateComparison, setDuplicateComparison] = useState<{
    currentLead: NearbyLead;
    nearbyLead: NearbyLead;
    distanceMeters: number;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    getLead(id)
      .then(setLead)
      .catch(() => setLead(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xl font-semibold text-gray-900 dark:text-white">Lead not found</p>
          <Button onClick={() => navigate("/leads")} className="mt-4">
            Back to Leads
          </Button>
        </div>
      </div>
    );
  }

  const photos = (lead.photos as Record<string, unknown>[]) ?? [];
  const photosByType: Record<string, number> = {};
  photos.forEach(p => {
    const t = String(p.photoType ?? "other");
    photosByType[t] = (photosByType[t] || 0) + 1;
  });

  const handleApprove = async () => {
    try {
      // CHANGED - approval first asks the backend to enforce the exact duplicate check.
      const result = await approveLead(String(lead.id));
      if (result.requiresDuplicateDecision && result.currentLead && result.nearbyLead) {
        setDuplicateComparison({
          currentLead: result.currentLead,
          nearbyLead: result.nearbyLead,
          distanceMeters: Number(result.distanceMeters ?? result.nearbyLead.distanceMeters),
        });
        return;
      }
      toast.success("Lead approved successfully!");
      setTimeout(() => navigate("/leads"), 1000);
    } catch (err) {
      toast.error("Failed to approve lead");
    }
  };

  // NEW - submit the Admin's explicit unique/duplicate resolution to the guarded endpoint.
  const handleDuplicateDecision = async (decision: "approve_unique" | "mark_duplicate") => {
    try {
      await approveLead(String(lead.id), decision);
      setDuplicateComparison(null);
      toast.success(decision === "approve_unique" ? "Lead approved as unique." : "Lead marked as duplicate.");
      setTimeout(() => navigate("/leads"), 1000);
    } catch {
      toast.error("Failed to save duplicate decision");
    }
  };

  const handleReject = async () => {
    if (!reviewNotes.trim()) {
      toast.error("Please add a reason for rejection");
      return;
    }
    try {
      await rejectLead(String(lead.id), reviewNotes);
      toast.error("Lead rejected");
      setTimeout(() => navigate("/leads"), 1000);
    } catch (err) {
      toast.error("Failed to reject lead");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to permanently delete this lead? This cannot be undone.")) return;
    try {
      await deleteLead(String(lead.id));
      toast.success("Lead deleted");
      navigate("/leads");
    } catch (err) {
      toast.error("Failed to delete lead");
    }
  };

  const status = String(lead.status ?? "new");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/leads")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(lead.projectName ?? lead.siteName ?? "Untitled Lead")}
            </h2>
            <p className="text-sm text-gray-500">Lead ID: {String(lead.id).slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === "approved" ? "default" : status === "new" ? "secondary" : "destructive"}
            className="text-base px-4 py-2"
          >
            {status}
          </Badge>
          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={handleDelete}>
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Construction Phase</p>
                  <Badge className="text-sm bg-blue-600">{String(lead.phase ?? "N/A")}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">QC Score</p>
                  <div className="flex items-center gap-2">
                    <Progress value={Number(lead.qualityScore ?? 0)} className="h-2" />
                    <span className="text-sm font-semibold">{Number(lead.qualityScore ?? 0)}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Duplicate Risk</p>
                  <Badge variant={lead.duplicateRisk === "high" ? "destructive" : "secondary"}>
                    {String(lead.duplicateRisk ?? "low")}
                  </Badge>
                  {/* // NEW - expose Driver-submitted different-site overrides to the Admin. */}
                  {Boolean(lead.needsDuplicateReview) && (
                    <Badge variant="destructive" className="ml-2">Needs review</Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">GPS Accuracy</p>
                  <span className="text-sm font-semibold">{lead.gpsAccuracyMeters ? `${Number(lead.gpsAccuracyMeters).toFixed(1)}m` : "N/A"}</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">Location</p>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                  <div>
                    <p className="text-gray-900 dark:text-white">
                      {Number(lead.locationLat).toFixed(6)}, {Number(lead.locationLng).toFixed(6)}
                    </p>
                    {lead.nearestLandmark && (
                      <p className="text-sm text-gray-500">Landmark: {String(lead.nearestLandmark)}</p>
                    )}
                  </div>
                </div>
              </div>

              {(lead.ownerName || lead.contractorName || lead.phoneNumber || lead.engineerName) && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Contact Information</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {lead.ownerName && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-900 dark:text-white">Owner: {String(lead.ownerName)}</p>
                      </div>
                    )}
                    {lead.contractorName && (
                      <p className="text-gray-900 dark:text-white">Contractor: {String(lead.contractorName)}</p>
                    )}
                    {lead.engineerName && (
                      <p className="text-gray-900 dark:text-white">Engineer: {String(lead.engineerName)}</p>
                    )}
                    {lead.phoneNumber && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-900 dark:text-white">{String(lead.phoneNumber)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {lead.notes && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Notes</p>
                  <p className="text-gray-900 dark:text-white">{String(lead.notes)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                Site Photos ({photos.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ["Billboard", photosByType["billboard"] ?? 0],
                  ["Front site", photosByType["front"] ?? 0],
                  ["Side", photosByType["side"] ?? 0],
                  ["Contractor board", photosByType["contractor_board"] ?? 0],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
                    <Image className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="font-semibold text-gray-900 dark:text-white">{count}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Submission Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Submitted By</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {String(lead.driverName ?? "Unknown Driver")}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Submitted At</p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-900 dark:text-white">
                    {lead.createdAt ? new Date(String(lead.createdAt)).toLocaleString() : "N/A"}
                  </p>
                </div>
              </div>
              {lead.reviewedAt && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Reviewed At</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {new Date(String(lead.reviewedAt)).toLocaleString()}
                  </p>
                </div>
              )}
              {lead.rejectReason && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-600">{String(lead.rejectReason)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {status === "new" && (
            <Card>
              <CardHeader>
                <CardTitle>Review Lead</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500 mb-2 block">Review Notes</label>
                  <Textarea
                    placeholder="Add notes (required for rejection)..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Button onClick={handleApprove} className="w-full" size="lg">
                    <Check className="w-5 h-5 mr-2" />
                    Approve Lead
                  </Button>
                  <Button onClick={handleReject} variant="destructive" className="w-full" size="lg">
                    <X className="w-5 h-5 mr-2" />
                    Reject Lead
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* // NEW - compare the submitted lead and nearest approved lead before changing status. */}
      <Dialog open={Boolean(duplicateComparison)} onOpenChange={(open) => { if (!open) setDuplicateComparison(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" /> Similar approved lead found
            </DialogTitle>
            <DialogDescription>
              {duplicateComparison ? `${duplicateComparison.distanceMeters.toFixed(1)} meters apart.` : "Within 100 meters."} Choose whether the new submission is unique or a duplicate.
            </DialogDescription>
          </DialogHeader>
          {duplicateComparison && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Current submission", item: duplicateComparison.currentLead },
                { label: "Existing approved lead", item: duplicateComparison.nearbyLead },
              ].map(({ label, item }) => (
                <div key={label} className="rounded-lg border p-4 space-y-3">
                  <Badge variant={label === "Current submission" ? "secondary" : "default"}>{label}</Badge>
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={label} className="w-full h-52 object-cover rounded-lg border" />
                  ) : (
                    <div className="h-52 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">No photo available</div>
                  )}
                  <div className="text-sm space-y-1">
                    <p className="font-semibold text-base">{item.projectName || item.siteName || item.plotNumber || "Untitled lead"}</p>
                    <p>Phase: {item.phase}</p>
                    <p>GPS: {Number(item.locationLat).toFixed(6)}, {Number(item.locationLng).toFixed(6)}</p>
                    <p>Date submitted: {item.createdAt ? new Date(item.createdAt).toLocaleString() : "N/A"}</p>
                    <p>Driver: {item.driverName || "Unknown Driver"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => void handleDuplicateDecision("approve_unique")}>
              <Check className="w-4 h-4 mr-2" /> Approve as unique
            </Button>
            <Button variant="destructive" onClick={() => void handleDuplicateDecision("mark_duplicate")}>
              <X className="w-4 h-4 mr-2" /> Mark as duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
