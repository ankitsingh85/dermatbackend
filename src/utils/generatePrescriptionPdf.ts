import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export interface PrescriptionMedicine {
  name: string;
  composition?: string;
  dosage?: string;
  duration?: string;
}

export interface PrescriptionInput {
  doctorName: string;
  qualification?: string;
  registrationNo?: string;
  doctorEmail?: string;
  clinicName?: string;
  clinicAddress?: string;
  patientName: string;
  patientAge?: string;
  patientSex?: string;
  patientContactNo?: string;
  refNo: string;
  date: Date;
  symptoms?: string;
  diagnosis?: string;
  labTests?: string;
  medicines: PrescriptionMedicine[];
  generalInstructions?: string;
  nextAppointment?: string;
}

const uploadPath = path.join(process.cwd(), "uploads");

const formatDateTime = (date: Date) =>
  date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");

/** Renders the clinic "Rx" letterhead prescription as a PDF and writes it to
 * the shared uploads/ folder, mirroring the filename convention used by
 * multer in middleware/uploads.ts. Returns the generated filename only. */
export const generatePrescriptionPdf = (data: PrescriptionInput): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filename = `prescription-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const filePath = path.join(uploadPath, filename);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // ---- Header: Rx mark + doctor/clinic block ----
    doc.font("Helvetica-Bold").fontSize(34).text("Rx", left, doc.y);

    const headerTop = doc.page.margins.top;
    doc.font("Helvetica-Bold").fontSize(13).text(data.doctorName, left, headerTop, {
      width: pageWidth,
      align: "right",
    });
    doc.font("Helvetica").fontSize(10);
    if (data.qualification) {
      doc.text(data.qualification, { width: pageWidth, align: "right" });
    }
    doc.text("Physician", { width: pageWidth, align: "right" });
    if (data.registrationNo) {
      doc.text(`Registration No: ${data.registrationNo}`, { width: pageWidth, align: "right" });
    }
    if (data.doctorEmail) {
      doc.text(`Email: ${data.doctorEmail}`, { width: pageWidth, align: "right" });
    }
    if (data.clinicName) {
      doc.font("Helvetica-Bold").text(data.clinicName, { width: pageWidth, align: "right" });
    }
    if (data.clinicAddress) {
      doc.font("Helvetica").text(data.clinicAddress, { width: pageWidth, align: "right" });
    }

    doc.moveDown(1.2);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .lineWidth(1)
      .strokeColor("#000000")
      .stroke();
    doc.moveDown(0.8);

    // ---- Patient block (left) + Ref/Date (right) ----
    const patientTop = doc.y;
    doc.font("Helvetica").fontSize(10.5);
    doc.text(`Patient Name: ${data.patientName}`, left, patientTop);
    if (data.patientAge) doc.text(`Patient Age: ${data.patientAge}`);
    if (data.patientSex) doc.text(`Patient Sex: ${data.patientSex}`);
    if (data.patientContactNo) doc.text(`Contact No.: ${data.patientContactNo}`);

    const patientBottom = doc.y;

    doc.font("Helvetica").fontSize(10.5).text(`Ref no: ${data.refNo}`, left, patientTop, {
      width: pageWidth,
      align: "right",
    });
    doc.text(`Date & Time: ${formatDateTime(data.date)}`, {
      width: pageWidth,
      align: "right",
    });

    doc.y = Math.max(patientBottom, doc.y);
    doc.moveDown(1.2);

    // ---- Symptoms / Diagnosis ----
    if (data.symptoms) {
      doc.font("Helvetica-Bold").fontSize(10.5).text("Symptoms:");
      doc.font("Helvetica").text(data.symptoms);
      doc.moveDown(0.6);
    }
    if (data.diagnosis) {
      doc.font("Helvetica-Bold").fontSize(10.5).text("Provisional Diagnosis:");
      doc.font("Helvetica").text(data.diagnosis);
      doc.moveDown(0.6);
    }

    // ---- Lab Tests | Medicines table ----
    const tableTop = doc.y;
    doc
      .moveTo(left, tableTop)
      .lineTo(left + pageWidth, tableTop)
      .stroke();
    doc.moveDown(0.4);

    const colSplit = left + pageWidth * 0.3;
    const headerRowY = doc.y;
    doc.font("Helvetica-Bold").fontSize(10.5);
    doc.text("Lab Tests", left, headerRowY, { width: pageWidth * 0.28 });
    doc.text("Medicines & Treatment Plans", colSplit + 10, headerRowY, {
      width: pageWidth - (colSplit + 10 - left),
    });

    doc.moveDown(0.6);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .stroke();
    doc.moveDown(0.5);

    const rowsTop = doc.y;
    doc.font("Helvetica").fontSize(10).text(data.labTests || "No tests prescribed.", left, rowsTop, {
      width: pageWidth * 0.28,
    });
    const labTestsBottom = doc.y;

    let medY = rowsTop;
    doc.font("Helvetica").fontSize(10);
    if (data.medicines.length === 0) {
      doc.text("No medicines prescribed.", colSplit + 10, medY, {
        width: pageWidth - (colSplit + 10 - left),
      });
    } else {
      data.medicines.forEach((med, index) => {
        doc.font("Helvetica-Bold").text(`${index + 1}. ${med.name}`, colSplit + 10, medY, {
          width: pageWidth - (colSplit + 10 - left),
        });
        doc.font("Helvetica").fontSize(9.5);
        if (med.dosage) doc.text(med.dosage, colSplit + 20);
        if (med.composition) doc.text(med.composition, colSplit + 20);
        if (med.duration) doc.text(med.duration, colSplit + 20);
        doc.fontSize(10);
        medY = doc.y + 6;
        doc.y = medY;
      });
    }

    doc.y = Math.max(doc.y, medY, labTestsBottom) + 10;

    if (data.generalInstructions) {
      doc.font("Helvetica-Bold").fontSize(10.5).text("General Instructions:", left);
      doc.font("Helvetica").text(data.generalInstructions, left, doc.y, { width: pageWidth });
      doc.moveDown(0.6);
    } else {
      doc.font("Helvetica-Bold").fontSize(10.5).text("General Instructions:", left);
      doc.moveDown(0.6);
    }

    doc.font("Helvetica-Bold").fontSize(10.5).text("Next Appointment:", left);
    if (data.nextAppointment) {
      doc.font("Helvetica").text(data.nextAppointment, left);
    }

    doc.moveDown(2);

    // ---- Signature ----
    doc.font("Helvetica-Bold").fontSize(10.5).text(data.doctorName, left, doc.y, {
      width: pageWidth,
      align: "right",
    });
    doc.font("Helvetica").fontSize(9.5);
    if (data.qualification) doc.text(data.qualification, { width: pageWidth, align: "right" });
    doc.text("Physician", { width: pageWidth, align: "right" });

    // ---- Disclaimer ----
    const disclaimerY = doc.page.height - doc.page.margins.bottom - 70;
    doc
      .moveTo(left, disclaimerY - 8)
      .lineTo(left + pageWidth, disclaimerY - 8)
      .stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).text("Disclaimer:", left, disclaimerY);
    doc.font("Helvetica").fontSize(7.5);
    [
      "1. The information and advice provided here is provisional in nature as it is based on the limited information made available by the patient.",
      "2. The patient is advised to visit in person for thorough examination at the earliest.",
      "3. The information is confidential in nature and for recipient's use only.",
      "4. The Prescription is generated on a Teleconsultation.",
      "5. Not valid for medico-legal purpose",
    ].forEach((line) => doc.text(line, left, doc.y, { width: pageWidth }));

    doc.end();

    stream.on("finish", () => resolve(filename));
    stream.on("error", reject);
  });
};
