import { Router } from "express";
import nodemailer from "nodemailer";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

function createTransporter() {
  const user = process.env["GMAIL_USER"];
  const pass = process.env["GMAIL_APP_PASSWORD"];
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

router.post("/send-email", upload.array("files", 5), async (req, res) => {
  const transporter = createTransporter();

  if (!transporter) {
    res.status(503).json({ error: "Email not configured — GMAIL_USER and GMAIL_APP_PASSWORD are required." });
    return;
  }

  const { type, owner_email, from_email, ...fields } = req.body as Record<string, string>;
  const files = req.files as Express.Multer.File[] | undefined;

  const isBooking = type === "booking";
  const clientEmail = fields.client_email || fields.collab_email || from_email;
  const clientName = fields.first_name ? `${fields.first_name} ${fields.last_name || ""}`.trim() : (fields.name || "there");

  const subject = isBooking
    ? `New Booking Request from ${clientName}`
    : `New Collab Enquiry from ${clientName}`;

  const rows = Object.entries(fields)
    .filter(([k]) => !["owner_email", "from_email"].includes(k))
    .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;color:#6b3d2e;white-space:nowrap;background:#fdf0ee;">${k.replace(/_/g, " ")}</td><td style="padding:6px 12px;color:#2c1810;">${v || "—"}</td></tr>`)
    .join("");

  const ownerHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.3rem;">${subject}</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">Via The Glam by Ankita website</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">${rows}</table>
      ${files && files.length > 0 ? `<p style="padding:12px 16px;color:#6b3d2e;font-size:0.85rem;">📎 ${files.length} attachment(s) included.</p>` : ""}
    </div>`;

  const confirmationHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fdf8f4;border:1px solid #e8c4bc;border-radius:8px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c9a96e,#9e7c4a);padding:24px 32px;">
        <h2 style="margin:0;color:#fff;font-size:1.3rem;">✨ ${isBooking ? "Booking Request Received!" : "Enquiry Received!"}</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.85rem;">The Glam by Ankita</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:1rem;color:#2c1810;margin:0 0 16px;">Hi ${clientName},</p>
        ${isBooking
          ? `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you so much for your booking request! 💄 I've received all your details and will be in touch within <strong>24–48 hours</strong> to confirm everything.</p>`
          : `<p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 16px;">Thank you for reaching out! ✨ I've received your enquiry and will review it and get back to you within <strong>48 hours</strong>.</p>`
        }
        <p style="font-size:0.95rem;color:#4a2e22;line-height:1.7;margin:0 0 24px;">In the meantime, feel free to follow along on Instagram <a href="https://instagram.com/theglambyankita" style="color:#c9a96e;text-decoration:none;">@theglambyankita</a> for the latest looks.</p>
        <p style="font-size:0.9rem;color:#6b3d2e;margin:0;">With love,<br><strong>Ankita</strong><br>The Glam by Ankita ✦</p>
      </div>
    </div>`;

  const attachments = (files || []).map((f) => ({
    filename: f.originalname,
    content: f.buffer,
    contentType: f.mimetype,
  }));

  try {
    await transporter.sendMail({
      from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
      to: owner_email,
      replyTo: clientEmail,
      subject,
      html: ownerHtml,
      attachments,
    });

    if (clientEmail) {
      await transporter.sendMail({
        from: `"The Glam by Ankita" <${process.env["GMAIL_USER"]}>`,
        to: clientEmail,
        subject: isBooking ? "Your booking request has been received 💄" : "Your enquiry has been received ✨",
        html: confirmationHtml,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Failed to send email." });
  }
});

export default router;
