import { test } from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { extractTextFromFile, parseCvTextToProfile } from "../src/services/cv-parser.js";

test("CV Parser - extracts plain text accurately without inventing facts", () => {
  const sampleCv = `
John Doe
Dhaka, Bangladesh
Email: john.doe.qa@gmail.com
Phone: +8801712345678
LinkedIn: https://linkedin.com/in/johndoeqa
GitHub: https://github.com/johndoeqa

SUMMARY
Passionate Manual QA Engineer with 1 year of experience in web and mobile testing.

SKILLS
Manual Testing, Test Cases, Bug Reporting, Jira, Postman, API Testing, Regression Testing, SQL

EXPERIENCE
Junior SQA Engineer
Tech Solutions Ltd.
Jan 2024 - Present
- Created comprehensive test cases for e-commerce web applications.
- Documented over 80 bugs in Jira with clear steps to reproduce and logs.
- Executed functional, smoke, and regression test suites.

EDUCATION
B.Sc. in Computer Science & Engineering
University of Dhaka
2023
`.trim();

  const parsed = parseCvTextToProfile(sampleCv);

  assert.equal(parsed.extractedProfile.fullName, "John Doe");
  assert.equal(parsed.extractedProfile.email, "john.doe.qa@gmail.com");
  assert.equal(parsed.extractedProfile.phone, "+8801712345678");
  assert.equal(parsed.extractedProfile.location, "Dhaka, Bangladesh");
  assert.equal(parsed.extractedProfile.linkedin, "https://linkedin.com/in/johndoeqa");
  assert.equal(parsed.extractedProfile.github, "https://github.com/johndoeqa");

  // Check detected skills
  const skills = parsed.extractedProfile.keywords || [];
  assert.ok(skills.includes("Manual Testing"));
  assert.ok(skills.includes("Jira"));
  assert.ok(skills.includes("Postman"));
  assert.ok(skills.includes("API Testing"));
  assert.ok(skills.includes("SQL"));

  // Check experience
  const exps = parsed.extractedProfile.experiences || [];
  assert.ok(exps.length >= 1);
  assert.equal(exps[0].role, "Junior SQA Engineer");

  // Check education
  const edus = parsed.extractedProfile.education || [];
  assert.ok(edus.length >= 1);
  assert.match(edus[0].degree, /B\.Sc\./i);
});

test("CV Parser - extracts text from real generated PDF buffer", async () => {
  const pdfDoc = new PDFDocument();
  const chunks: Buffer[] = [];
  pdfDoc.on("data", c => chunks.push(c));

  pdfDoc.fontSize(16).text("Sarah Ahmed");
  pdfDoc.fontSize(10).text("Email: sarah.ahmed@example.com | Phone: +8801811223344");
  pdfDoc.text("Location: Dhaka, Bangladesh");
  pdfDoc.text("Skills: Manual Testing, Jira, Postman, API Testing, Smoke Testing");
  pdfDoc.end();

  const pdfBuffer = await new Promise<Buffer>(resolve => {
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const extractedText = await extractTextFromFile(pdfBuffer, "resume.pdf", "application/pdf");
  assert.ok(extractedText.includes("Sarah Ahmed"));
  assert.ok(extractedText.includes("sarah.ahmed@example.com"));

  const parsed = parseCvTextToProfile(extractedText);
  assert.equal(parsed.extractedProfile.email, "sarah.ahmed@example.com");
  assert.ok(parsed.extractedProfile.keywords?.includes("Postman"));
  assert.ok(parsed.extractedProfile.keywords?.includes("Manual Testing"));
});

test("CV Parser - extracts text from real generated DOCX buffer", async () => {
  const docxDoc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Tanvir Hasan - SQA Specialist", bold: true })]
          }),
          new Paragraph({
            children: [new TextRun({ text: "Email: tanvir.qa@domain.com | Location: Bangladesh" })]
          }),
          new Paragraph({
            children: [new TextRun({ text: "Skills: Manual Testing, Bug Reporting, Jira, Postman" })]
          })
        ]
      }
    ]
  });

  const docxBuffer = await Packer.toBuffer(docxDoc);
  const extractedText = await extractTextFromFile(docxBuffer, "tanvir_cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  assert.ok(extractedText.includes("Tanvir Hasan"));
  assert.ok(extractedText.includes("tanvir.qa@domain.com"));

  const parsed = parseCvTextToProfile(extractedText);
  assert.equal(parsed.extractedProfile.email, "tanvir.qa@domain.com");
});
