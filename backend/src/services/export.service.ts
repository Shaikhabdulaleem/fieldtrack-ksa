import * as XLSX from "xlsx";
import { stringify } from "csv-stringify/sync";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Lead } from "../db/schema";

type LeadRow = Pick<Lead, "id" | "projectName" | "siteName" | "phase" | "status" | "locationLat" | "locationLng" | "cityId" | "createdAt">;

function toRows(leads: LeadRow[]) {
  return leads.map(l => ({
    ID: l.id,
    Project: l.projectName ?? "",
    Site: l.siteName ?? "",
    Phase: l.phase,
    Status: l.status,
    Lat: l.locationLat,
    Lng: l.locationLng,
    City: l.cityId,
    Submitted: l.createdAt?.toISOString() ?? "",
  }));
}

export function toXlsx(leads: LeadRow[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(toRows(leads));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function toCsv(leads: LeadRow[]): string {
  return stringify(toRows(leads), { header: true });
}

export function toPdf(leads: LeadRow[]): Buffer {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text("FieldTrack KSA — Leads Report", 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [["Project", "Site", "Phase", "Status", "Lat", "Lng", "Submitted"]],
    body: leads.map(l => [
      l.projectName ?? "",
      l.siteName ?? "",
      l.phase,
      l.status ?? "",
      String(l.locationLat),
      String(l.locationLng),
      l.createdAt?.toISOString().slice(0, 10) ?? "",
    ]),
    styles: { fontSize: 8 },
  });

  return Buffer.from(doc.output("arraybuffer"));
}
