import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import type { Job, Profile } from "../types.js";

const generatedDir = path.resolve("data", "generated");

function ensureGeneratedDir() {
  fs.mkdirSync(generatedDir, { recursive: true });
}

export interface GeneratedFilePaths {
  tailoredCvPdf: string;
  tailoredCvDocx: string;
  coverLetterPdf: string;
  coverLetterDocx: string;
}

/**
 * Generates ATS-friendly PDF and DOCX files for both tailored CV and Cover Letter.
 */
export async function generateApplicationDocuments(
  job: Job,
  profile: Profile,
  tailoredCvText: string,
  coverLetterText: string
): Promise<GeneratedFilePaths> {
  ensureGeneratedDir();

  const safeJobId = job.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const baseName = `qa-${safeJobId}`;

  const cvPdfPath = path.join(generatedDir, `${baseName}-tailored-cv.pdf`);
  const cvDocxPath = path.join(generatedDir, `${baseName}-tailored-cv.docx`);
  const letterPdfPath = path.join(generatedDir, `${baseName}-cover-letter.pdf`);
  const letterDocxPath = path.join(generatedDir, `${baseName}-cover-letter.docx`);

  await Promise.all([
    generateCvPdf(cvPdfPath, job, profile, tailoredCvText),
    generateCvDocx(cvDocxPath, job, profile, tailoredCvText),
    generateLetterPdf(letterPdfPath, job, profile, coverLetterText),
    generateLetterDocx(letterDocxPath, job, profile, coverLetterText)
  ]);

  return {
    tailoredCvPdf: cvPdfPath,
    tailoredCvDocx: cvDocxPath,
    coverLetterPdf: letterPdfPath,
    coverLetterDocx: letterDocxPath
  };
}

// ==================== CV GENERATORS ====================

function generateCvPdf(
  filePath: string,
  job: Job,
  profile: Profile,
  cvContent: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header: Candidate Name
      doc.fontSize(20).font("Helvetica-Bold").text(profile.fullName, { align: "center" });

      // Contact Line
      const contactParts = [
        profile.email,
        profile.phone,
        profile.location,
        profile.linkedin,
        profile.github
      ].filter(Boolean);
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica").fillColor("#333333").text(contactParts.join(" | "), { align: "center" });
      doc.fillColor("#000000");

      doc.moveDown(0.6);
      doc.strokeColor("#cccccc").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.8);

      // Targeted Role Note
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#1a365d").text(`TARGET ROLE: ${job.title.toUpperCase()} — ${job.company.toUpperCase()}`);
      doc.fillColor("#000000");
      doc.moveDown(0.5);

      // Render the sections of the tailored CV
      const lines = cvContent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          doc.moveDown(0.3);
          continue;
        }

        // Section Headings (ALL CAPS or ending with colon)
        if (/^[A-Z\s/&-]{4,}$/.test(trimmed) && trimmed.length < 40) {
          doc.moveDown(0.5);
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f2942").text(trimmed);
          doc.fillColor("#000000");
          doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
          doc.moveDown(0.3);
        } else if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
          doc.fontSize(9.5).font("Helvetica").text(trimmed, { indent: 15, lineGap: 2 });
        } else {
          doc.fontSize(9.5).font("Helvetica").text(trimmed, { lineGap: 2 });
        }
      }

      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function generateCvDocx(
  filePath: string,
  job: Job,
  profile: Profile,
  cvContent: string
): Promise<void> {
  const paragraphs: Paragraph[] = [];

  // Header
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: profile.fullName, bold: true, size: 32, font: "Calibri" })
      ]
    })
  );

  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedin,
    profile.github
  ].filter(Boolean);

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: contactParts.join(" | "), size: 18, color: "555555", font: "Calibri" })
      ]
    })
  );

  paragraphs.push(
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: `Target Role: ${job.title} at ${job.company}`,
          bold: true,
          color: "1A365D",
          size: 22,
          font: "Calibri"
        })
      ]
    })
  );

  // Body content lines
  const lines = cvContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^[A-Z\s/&-]{4,}$/.test(trimmed) && trimmed.length < 40) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 60 },
          children: [
            new TextRun({ text: trimmed, bold: true, size: 22, color: "0F2942", font: "Calibri" })
          ]
        })
      );
    } else if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: trimmed.replace(/^[•-]\s*/, ""), size: 20, font: "Calibri" })
          ]
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: trimmed, size: 20, font: "Calibri" })
          ]
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}

// ==================== COVER LETTER GENERATORS ====================

function generateLetterPdf(
  filePath: string,
  job: Job,
  profile: Profile,
  letterContent: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header: Sender
      doc.fontSize(16).font("Helvetica-Bold").text(profile.fullName);
      doc.fontSize(9).font("Helvetica").fillColor("#4a5568");
      if (profile.email) doc.text(profile.email);
      if (profile.phone) doc.text(profile.phone);
      if (profile.location) doc.text(profile.location);
      doc.fillColor("#000000");

      doc.moveDown(1);
      doc.strokeColor("#cbd5e0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Date & Recipient
      const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      doc.fontSize(10).font("Helvetica").text(today);
      doc.moveDown(0.5);
      doc.text("Hiring Team");
      doc.text(job.company);
      if (job.location) doc.text(job.location);

      doc.moveDown(1);
      doc.fontSize(10).font("Helvetica-Bold").text(`Subject: Application for ${job.title}`);
      doc.moveDown(1);

      // Body Paragraphs
      const paragraphs = letterContent.split(/\n\s*\n/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        doc.fontSize(10).font("Helvetica").text(trimmed, { align: "justify", lineGap: 3 });
        doc.moveDown(0.8);
      }

      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function generateLetterDocx(
  filePath: string,
  job: Job,
  profile: Profile,
  letterContent: string
): Promise<void> {
  const paragraphs: Paragraph[] = [];

  // Sender info
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: profile.fullName, bold: true, size: 28, font: "Calibri" })]
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: [profile.email, profile.phone, profile.location].filter(Boolean).join(" | "),
          size: 18,
          color: "4A5568",
          font: "Calibri"
        })
      ],
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          size: 20,
          font: "Calibri"
        })
      ]
    }),
    new Paragraph({
      children: [new TextRun({ text: "Hiring Team", size: 20, font: "Calibri" })]
    }),
    new Paragraph({
      children: [new TextRun({ text: job.company, size: 20, font: "Calibri" })],
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Subject: Application for ${job.title}`, bold: true, size: 22, font: "Calibri" })
      ],
      spacing: { after: 200 }
    })
  );

  const bodyParagraphs = letterContent.split(/\n\s*\n/);
  for (const para of bodyParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: trimmed, size: 20, font: "Calibri" })],
        spacing: { after: 160 }
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}
