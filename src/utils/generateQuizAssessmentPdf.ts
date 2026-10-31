import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export interface QuizReportIndicator {
  label: string;
  value: number;
  interpretation: string;
}

export interface QuizReportNextStep {
  title: string;
  description: string;
}

export interface QuizReportQuestionAnswer {
  category: string;
  text: string;
  selectedAnswer: string;
}

export interface QuizReportTreatmentPackage {
  name: string;
  shortDescription: string;
  price: string;
  duration: string;
  inclusions: string;
  url: string;
}

export interface QuizReportProduct {
  name: string;
  purpose: string;
  price: string;
  url: string;
}

export interface QuizReportConsultation {
  serviceName: string;
  shortDescription: string;
  fee: string;
  bookingUrl: string;
}

export interface QuizReportInput {
  reportId: string;
  customerName: string;
  testType: "hair" | "skin";
  status: string;
  startedAt: Date;
  completedAt: Date;
  generatedAt: Date;
  profileTitle: string;
  profileDescription: string;
  mainConcerns: string[];
  primaryNextStep: string;
  indicators: QuizReportIndicator[];
  factors: string;
  interpretation: string;
  nextSteps: QuizReportNextStep[];
  routineTitle: string;
  routineGuidance: string;
  clinicianReview: string;
  followUp: string;
  treatmentPackages: QuizReportTreatmentPackage[];
  products: QuizReportProduct[];
  consultation: QuizReportConsultation | null;
  questions: QuizReportQuestionAnswer[];
  photoUploadStatus: string;
  assessmentEngineVersion: string;
  scoringVersion: string;
  privacyContact: string;
}

const GREEN = "#2f6d33";
const GREEN_LIGHT = "#eaf3e8";
const GRAY_TEXT = "#4b5563";
const DARK_TEXT = "#111827";
const BORDER = "#d8e2d6";

const uploadPath = path.join(process.cwd(), "uploads");

const formatDateTime = (date: Date) =>
  date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");

/** Renders the "Dr Dermat Personalised Assessment Report" as a fixed
 * 5-page PDF matching the approved template, and writes it to the shared
 * uploads/ folder. Returns the generated filename only. */
export const generateQuizAssessmentPdf = (data: QuizReportInput): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filename = `assessment-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const filePath = path.join(uploadPath, filename);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const testLabel = data.testType === "hair" ? "Hair" : "Skin";

    let pageNumber = 1;

    const drawFooter = () => {
      // Stays inside the content area (above the bottom margin line), not
      // below it — pdfkit auto-paginates any .text() call whose position
      // would fall past the margin boundary, even with an explicit y, so
      // writing "below" the margin silently spawns an extra blank page.
      const footerY = doc.page.height - doc.page.margins.bottom - 18;
      doc
        .moveTo(left, footerY - 6)
        .lineTo(left + pageWidth, footerY - 6)
        .lineWidth(0.5)
        .strokeColor(BORDER)
        .stroke();
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(GRAY_TEXT)
        .text("Online self-assessment • Not a medical diagnosis", left, footerY, {
          width: pageWidth * 0.7,
        });
      doc.text(`Page ${pageNumber}`, left, footerY, { width: pageWidth, align: "right" });
      doc.fillColor(DARK_TEXT);
    };

    const drawTopBar = () => {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(GREEN)
        .text("DR DERMAT", left, doc.page.margins.top, { continued: false });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(GRAY_TEXT)
        .text(`${data.reportId} | ${testLabel} assessment`, left, doc.page.margins.top, {
          width: pageWidth,
          align: "right",
        });
      doc
        .moveTo(left, doc.y + 4)
        .lineTo(left + pageWidth, doc.y + 4)
        .lineWidth(0.5)
        .strokeColor(BORDER)
        .stroke();
      doc.y += 14;
      doc.fillColor(DARK_TEXT);
    };

    const newPage = () => {
      drawFooter();
      doc.addPage();
      pageNumber += 1;
      drawTopBar();
    };

    const sectionHeading = (text: string) => {
      doc.font("Helvetica-Bold").fontSize(16).fillColor(GREEN).text(text, left, doc.y, {
        width: pageWidth,
      });
      doc.fillColor(DARK_TEXT);
      doc.moveDown(0.5);
    };

    const subHeading = (text: string) => {
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(DARK_TEXT).text(text, left, doc.y, {
        width: pageWidth,
      });
      doc.moveDown(0.3);
    };

    const bodyText = (text: string, opts: { gray?: boolean } = {}) => {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(opts.gray ? GRAY_TEXT : DARK_TEXT)
        .text(text, left, doc.y, { width: pageWidth });
      doc.fillColor(DARK_TEXT);
    };

    // A simple two-column "label / value" grid with alternating light-green
    // rows, matching the template's metadata block on page 1.
    const drawMetaGrid = (rows: [string, string, string, string][]) => {
      const colWidth = pageWidth / 2;
      rows.forEach((row, index) => {
        const rowTop = doc.y;
        const rowHeight = 34;
        if (index % 2 === 0) {
          doc.rect(left, rowTop, pageWidth, rowHeight).fill(GREEN_LIGHT);
        }
        doc.fillColor(GRAY_TEXT).font("Helvetica-Bold").fontSize(8);
        doc.text(row[0].toUpperCase(), left + 10, rowTop + 6, { width: colWidth - 20 });
        doc.text(row[2].toUpperCase(), left + colWidth + 10, rowTop + 6, {
          width: colWidth - 20,
        });
        doc.fillColor(DARK_TEXT).font("Helvetica").fontSize(10.5);
        doc.text(row[1] || "-", left + 10, rowTop + 18, { width: colWidth - 20 });
        doc.text(row[3] || "-", left + colWidth + 10, rowTop + 18, { width: colWidth - 20 });
        doc.y = rowTop + rowHeight;
      });
      doc.fillColor(DARK_TEXT);
    };

    // ============================= PAGE 1 =============================
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(GRAY_TEXT)
      .text("Online self-assessment • Not a medical diagnosis", left, doc.page.margins.top, {
        width: pageWidth * 0.7,
      });
    doc.text(`Page ${pageNumber}`, left, doc.page.margins.top, {
      width: pageWidth,
      align: "right",
    });

    doc.moveDown(1.2);
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(GREEN)
      .text("DR DERMAT", left, doc.y, { width: pageWidth, align: "center" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY_TEXT)
      .text("PERSONALISED HAIR & SKIN CARE", left, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.4);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .lineWidth(1.4)
      .strokeColor(GREEN)
      .stroke();
    doc.moveDown(0.8);

    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor(DARK_TEXT)
      .text("Your Personalised Assessment Report", left, doc.y, { width: pageWidth });
    doc.moveDown(0.3);
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor(GRAY_TEXT)
      .text("A clear summary of your responses, assessment insights and suggested next steps.", left, doc.y, {
        width: pageWidth,
      });
    doc.fillColor(DARK_TEXT);
    doc.moveDown(0.9);

    drawMetaGrid([
      ["Customer Name", data.customerName, "Report ID", data.reportId],
      ["Assessment Type", `${testLabel} Test`, "Assessment Status", data.status],
      ["Started At", `${formatDateTime(data.startedAt)} IST`, "Completed At", `${formatDateTime(data.completedAt)} IST`],
      ["PDF Generated At", `${formatDateTime(data.generatedAt)} IST`, "Time Zone", "Asia/Kolkata (IST)"],
    ]);

    doc.moveDown(0.8);
    const profileBoxTop = doc.y;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY_TEXT);
    const profileDescHeight = doc.heightOfString(data.profileDescription, { width: pageWidth - 28 });
    const profileBoxHeight = 20 + 20 + profileDescHeight + 16;
    doc.rect(left, profileBoxTop, pageWidth, profileBoxHeight).fillAndStroke(GREEN_LIGHT, BORDER);
    doc.fillColor(GRAY_TEXT).text("YOUR GENERATED ASSESSMENT PROFILE", left + 14, profileBoxTop + 12);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(GREEN).text(data.profileTitle, left + 14, doc.y + 4, {
      width: pageWidth - 28,
    });
    doc.font("Helvetica").fontSize(10).fillColor(DARK_TEXT).text(data.profileDescription, left + 14, doc.y + 4, {
      width: pageWidth - 28,
    });
    doc.y = profileBoxTop + profileBoxHeight + 14;
    doc.fillColor(DARK_TEXT);

    subHeading("Your report at a glance");
    drawMetaGrid([["Main Concerns", data.mainConcerns.join(", ") || "-", "Key Next Step", data.primaryNextStep]]);

    doc.moveDown(0.8);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "This report summarises the answers you provided in an online self-assessment. It is intended to support informed next steps and does not establish a diagnosis or replace consultation with a qualified clinician.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.fillColor(DARK_TEXT);

    // ============================= PAGE 2 =============================
    newPage();
    sectionHeading("01 | Your Assessment Summary");
    bodyText(
      "This section presents the profile and indicators generated by the assessment engine for this completed test."
    );
    doc.moveDown(0.8);

    subHeading("Main concerns identified");
    if (data.mainConcerns.length === 0) {
      bodyText("No specific concerns were flagged.", { gray: true });
    } else {
      data.mainConcerns.forEach((concern) => {
        doc.font("Helvetica").fontSize(10).fillColor(DARK_TEXT).text(`•  ${concern}`, left, doc.y, {
          width: pageWidth,
        });
      });
    }
    doc.moveDown(0.8);

    subHeading("Assessment indicators");
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "Values below are populated directly from the saved assessment output.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.fillColor(DARK_TEXT);
    doc.moveDown(0.5);

    const col1 = left;
    const col2 = left + pageWidth * 0.3;
    const col3 = left + pageWidth * 0.46;
    const tableHeadY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9.5);
    doc.text("INDICATOR", col1, tableHeadY, { width: pageWidth * 0.3 });
    doc.text("VALUE", col2, tableHeadY, { width: pageWidth * 0.15 });
    doc.text("INTERPRETATION", col3, tableHeadY, { width: pageWidth - (col3 - left) });
    doc.moveDown(0.4);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .lineWidth(0.6)
      .strokeColor(BORDER)
      .stroke();
    doc.moveDown(0.4);

    data.indicators.forEach((indicator) => {
      const rowTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).text(indicator.label, col1, rowTop, {
        width: pageWidth * 0.28,
      });
      const labelBottom = doc.y;
      doc.font("Helvetica").fontSize(10).text(`${indicator.value}%`, col2, rowTop, {
        width: pageWidth * 0.14,
      });
      doc.text(indicator.interpretation, col3, rowTop, { width: pageWidth - (col3 - left) });
      doc.y = Math.max(doc.y, labelBottom) + 8;
    });

    doc.moveDown(0.3);
    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "Important: unless clinically validated, percentages are assessment indicators generated by the questionnaire — not probabilities, diagnostic certainty or validated clinical severity scores.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.fillColor(DARK_TEXT);
    doc.moveDown(0.8);

    subHeading("Factors reported in your answers");
    bodyText(data.factors || "No specific factors were reported.");
    doc.moveDown(0.8);

    subHeading("What this may mean");
    bodyText(data.interpretation);
    doc.moveDown(0.8);

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "Please seek timely medical evaluation for sudden or rapidly worsening symptoms, painful/inflamed scalp or skin, significant patchy hair loss, severe reactions or any other urgent concern.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.fillColor(DARK_TEXT);

    // ============================= PAGE 3 =============================
    newPage();
    sectionHeading("02 | Your Personalised Care Roadmap");
    bodyText(
      "The recommendations below are tailored to your saved assessment output and reviewed against Dr Dermat's approved clinical content."
    );
    doc.moveDown(0.8);

    subHeading("Recommended next steps");
    data.nextSteps.forEach((step) => {
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(DARK_TEXT).text(step.title, left, doc.y, {
        width: pageWidth,
      });
      doc.font("Helvetica").fontSize(10).fillColor(GRAY_TEXT).text(step.description, left, doc.y, {
        width: pageWidth,
      });
      doc.fillColor(DARK_TEXT);
      doc.moveDown(0.4);
    });
    doc.moveDown(0.4);

    subHeading("Everyday care guidance");
    doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN).text(data.routineTitle, left, doc.y, {
      width: pageWidth,
    });
    doc.fillColor(DARK_TEXT);
    bodyText(data.routineGuidance);
    doc.moveDown(0.8);

    subHeading("Professional review");
    bodyText(data.clinicianReview);
    doc.moveDown(0.8);

    subHeading("Follow-up plan");
    bodyText(data.followUp);
    doc.moveDown(0.8);

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "Any medicines, supplements, procedures or medical treatment must be assessed for suitability by an appropriately qualified clinician. Do not start or stop prescription medication solely on the basis of this automated report.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.fillColor(DARK_TEXT);

    // ============================= PAGE 4 =============================
    newPage();
    sectionHeading("03 | Your Next Step with Dr Dermat");
    bodyText(
      "Explore relevant services and products selected from the current Dr Dermat catalogue, mapped to your assessment."
    );
    doc.moveDown(0.8);

    subHeading("Recommended treatment packages");
    if (data.treatmentPackages.length === 0) {
      bodyText("No matching treatment packages are currently available in the catalogue.", { gray: true });
    } else {
      data.treatmentPackages.forEach((pkg) => {
        const boxTop = doc.y;
        doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN).text(pkg.name, left + 12, boxTop + 10, {
          width: pageWidth - 24,
        });
        doc.font("Helvetica").fontSize(9.5).fillColor(DARK_TEXT).text(pkg.shortDescription, left + 12, doc.y + 2, {
          width: pageWidth - 24,
        });
        doc.text(`Price: ${pkg.price} | Duration: ${pkg.duration}`, left + 12, doc.y + 4, {
          width: pageWidth - 24,
        });
        if (pkg.inclusions) {
          doc.fillColor(GRAY_TEXT).text(`Includes: ${pkg.inclusions}`, left + 12, doc.y + 2, {
            width: pageWidth - 24,
          });
          doc.fillColor(DARK_TEXT);
        }
        doc.fillColor(GREEN).text(`Book / learn more: ${pkg.url}`, left + 12, doc.y + 4, {
          width: pageWidth - 24,
        });
        doc.fillColor(DARK_TEXT);
        const boxBottom = doc.y + 10;
        doc
          .rect(left, boxTop, pageWidth, boxBottom - boxTop)
          .lineWidth(0.8)
          .strokeColor(BORDER)
          .stroke();
        doc.y = boxBottom + 10;
      });
    }
    doc.moveDown(0.4);

    subHeading("Recommended products");
    if (data.products.length === 0) {
      bodyText("No matching products are currently available in the catalogue.", { gray: true });
    } else {
      const pCol1 = left;
      const pCol2 = left + pageWidth * 0.4;
      const pCol3 = left + pageWidth * 0.62;
      const pCol4 = left + pageWidth * 0.76;
      const headY = doc.y;
      doc.font("Helvetica-Bold").fontSize(9.5);
      doc.text("PRODUCT", pCol1, headY, { width: pageWidth * 0.38 });
      doc.text("PURPOSE", pCol2, headY, { width: pageWidth * 0.2 });
      doc.text("PRICE", pCol3, headY, { width: pageWidth * 0.12 });
      doc.text("LINK", pCol4, headY, { width: pageWidth - (pCol4 - left) });
      doc.moveDown(0.4);
      doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).lineWidth(0.6).strokeColor(BORDER).stroke();
      doc.moveDown(0.4);

      data.products.forEach((product) => {
        const rowTop = doc.y;
        doc.font("Helvetica").fontSize(9.5).fillColor(DARK_TEXT);
        doc.text(product.name, pCol1, rowTop, { width: pageWidth * 0.38 });
        const b1 = doc.y;
        doc.text(product.purpose, pCol2, rowTop, { width: pageWidth * 0.2 });
        const b2 = doc.y;
        doc.text(product.price, pCol3, rowTop, { width: pageWidth * 0.12 });
        const b3 = doc.y;
        doc.fillColor(GREEN).text(product.url, pCol4, rowTop, { width: pageWidth - (pCol4 - left) });
        doc.fillColor(DARK_TEXT);
        doc.y = Math.max(b1, b2, b3, doc.y) + 8;
      });
    }
    doc.moveDown(0.4);

    subHeading("Online consultation");
    if (data.consultation) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor(DARK_TEXT)
        .text(data.consultation.serviceName, left, doc.y, { continued: true })
        .font("Helvetica")
        .text(` — ${data.consultation.shortDescription}`);
      doc.text(`Fee: ${data.consultation.fee} | Book: ${data.consultation.bookingUrl}`, left, doc.y + 2, {
        width: pageWidth,
      });
    } else {
      bodyText("No online consultation service is currently available in the catalogue.", { gray: true });
    }
    doc.moveDown(0.8);

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "Use the clickable links in your digital PDF to explore available services. Only current prices and valid catalogue URLs are shown.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.fillColor(DARK_TEXT);

    // ============================= PAGE 5 =============================
    newPage();
    sectionHeading("04 | Your Complete Test Responses");
    bodyText(
      "The following records the questions and answers submitted for this assessment, shown exactly as captured by the application."
    );
    doc.moveDown(0.6);

    const qCol1 = left;
    const qCol2 = left + 28;
    const qCol3 = left + pageWidth * 0.68;
    const qHeadY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("NO.", qCol1, qHeadY, { width: 24 });
    doc.text("CATEGORY & QUESTION", qCol2, qHeadY, { width: pageWidth * 0.64 });
    doc.text("SELECTED ANSWER", qCol3, qHeadY, { width: pageWidth - (qCol3 - left) });
    doc.moveDown(0.4);
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).lineWidth(0.6).strokeColor(BORDER).stroke();
    doc.moveDown(0.4);

    data.questions.forEach((q, index) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 60) {
        newPage();
        sectionHeading("04 | Your Complete Test Responses (continued)");
      }
      const rowTop = doc.y;
      doc.font("Helvetica").fontSize(9.5).fillColor(DARK_TEXT).text(String(index + 1), qCol1, rowTop, {
        width: 24,
      });
      doc.font("Helvetica-Bold").fontSize(9.5).text(q.category, qCol2, rowTop, { width: pageWidth * 0.64 });
      doc.font("Helvetica").fontSize(9.5).text(q.text, qCol2, doc.y, { width: pageWidth * 0.64 });
      const leftBottom = doc.y;
      doc.font("Helvetica").fontSize(9.5).fillColor(GREEN).text(q.selectedAnswer, qCol3, rowTop, {
        width: pageWidth - (qCol3 - left),
      });
      doc.fillColor(DARK_TEXT);
      doc.y = Math.max(leftBottom, doc.y) + 8;
    });

    doc.moveDown(0.4);
    bodyText(`Photo upload status: ${data.photoUploadStatus}.`, { gray: true });
    bodyText(
      `Assessment engine version: ${data.assessmentEngineVersion} | Scoring version: ${data.scoringVersion}`,
      { gray: true }
    );
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK_TEXT).text("Important notice", left, doc.y, {
      width: pageWidth,
    });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(GRAY_TEXT)
      .text(
        "This report is generated from a self-reported online questionnaire. It is informational only and is not a medical diagnosis, prescription or guarantee of outcomes. Assessment indicators may not be clinically validated. A qualified clinician should evaluate symptoms and determine whether any treatment is appropriate. Product and service availability and prices may change.",
        left,
        doc.y,
        { width: pageWidth }
      );
    doc.moveDown(0.4);
    doc.text(`Privacy: ${data.privacyContact}`, left, doc.y, { width: pageWidth });
    doc.fillColor(DARK_TEXT);

    drawFooter();
    doc.end();

    stream.on("finish", () => resolve(filename));
    stream.on("error", reject);
  });
};
