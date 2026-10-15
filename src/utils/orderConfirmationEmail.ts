interface OrderConfirmationItem {
  name: string;
  quantity: number;
  price: number;
  itemType?: string;
  clinicName?: string;
  clinicAddress?: string;
}

interface OrderConfirmationInput {
  recipientName: string;
  orderId: string;
  orderType: "product" | "treatment" | "consultation";
  items: OrderConfirmationItem[];
  totalAmount: number;
  discountAmount?: number;
  couponCode?: string;
  createdAt: Date;
}

const ORDER_TYPE_LABEL: Record<OrderConfirmationInput["orderType"], string> = {
  product: "Product Order",
  treatment: "Treatment Booking",
  consultation: "Online Consultation Booking",
};

const formatCurrency = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

const escapeHtml = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const buildOrderConfirmationEmail = (input: OrderConfirmationInput) => {
  const {
    recipientName,
    orderId,
    orderType,
    items,
    totalAmount,
    discountAmount,
    couponCode,
    createdAt,
  } = input;

  const typeLabel = ORDER_TYPE_LABEL[orderType] || "Order";
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Treatment items carry the clinic the user picked at checkout — called
  // out explicitly (not just inline next to the item) so it's obvious this
  // is "your treatment, at this clinic", not just a generic receipt.
  const treatmentClinics: { name: string; address?: string }[] = [];
  items.forEach((item) => {
    if (item.itemType !== "treatment" || !item.clinicName) return;
    if (!treatmentClinics.some((clinic) => clinic.name === item.clinicName)) {
      treatmentClinics.push({ name: item.clinicName, address: item.clinicAddress });
    }
  });

  const textLines = [
    `Hi ${recipientName || "there"},`,
    "",
    `Your ${typeLabel.toLowerCase()} is confirmed! Here are your booking details:`,
    "",
    `Order ID: ${orderId}`,
    `Date: ${formatDate(createdAt)}`,
    `Type: ${typeLabel}`,
    ...(treatmentClinics.length
      ? [
          "",
          treatmentClinics.length === 1
            ? `Your treatment is booked at: ${treatmentClinics[0].name}${
                treatmentClinics[0].address ? ` (${treatmentClinics[0].address})` : ""
              }`
            : "Your treatments are booked at:",
          ...(treatmentClinics.length > 1
            ? treatmentClinics.map(
                (clinic) => `- ${clinic.name}${clinic.address ? ` (${clinic.address})` : ""}`
              )
            : []),
        ]
      : []),
    "",
    "Items:",
    ...items.map(
      (item) =>
        `- ${item.name} x${item.quantity} — ${formatCurrency(item.price * item.quantity)}${
          item.clinicName ? ` (at ${item.clinicName})` : ""
        }`
    ),
    "",
    `Subtotal: ${formatCurrency(subtotal)}`,
    ...(discountAmount
      ? [`Discount${couponCode ? ` (${couponCode})` : ""}: -${formatCurrency(discountAmount)}`]
      : []),
    `Total Paid: ${formatCurrency(totalAmount)}`,
    "",
    "Thank you for choosing Dr Dermat!",
  ];

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;">
            <div style="font-weight:600;color:#163252;">${escapeHtml(item.name)}</div>
            ${
              item.clinicName
                ? `<div style="font-size:12px;color:#6d7f98;margin-top:2px;">at ${escapeHtml(
                    item.clinicName
                  )}</div>`
                : ""
            }
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:center;color:#41556f;">x${
            item.quantity
          }</td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#163252;font-weight:600;">${formatCurrency(
            item.price * item.quantity
          )}</td>
        </tr>`
    )
    .join("");

  const html = `
  <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(23,43,73,0.08);">
      <div style="background:linear-gradient(135deg,#10306b 0%,#1f49be 55%,#2981b7 100%);padding:28px 30px;color:#ffffff;">
        <p style="margin:0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Dr Dermat</p>
        <h1 style="margin:8px 0 0;font-size:22px;">Booking Confirmed 🎉</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${escapeHtml(typeLabel)}</p>
      </div>

      <div style="padding:28px 30px;">
        <p style="margin:0 0 16px;color:#314461;font-size:15px;">
          Hi ${escapeHtml(recipientName || "there")}, thanks for your booking! Your payment was
          received successfully and here's a summary of your order.
        </p>

        ${
          treatmentClinics.length
            ? `<div style="background:#eaf3ff;border:1px solid #cfe3fb;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
                <p style="margin:0 0 6px;font-size:12px;color:#0a4b83;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">${
                  treatmentClinics.length === 1
                    ? "Your Treatment Is Booked At"
                    : "Your Treatments Are Booked At"
                }</p>
                ${treatmentClinics
                  .map(
                    (clinic) => `
                <p style="margin:4px 0 0;color:#10306b;font-size:15px;font-weight:700;">${escapeHtml(
                  clinic.name
                )}</p>
                ${
                  clinic.address
                    ? `<p style="margin:2px 0 0;color:#41556f;font-size:13px;">${escapeHtml(
                        clinic.address
                      )}</p>`
                    : ""
                }`
                  )
                  .join("")}
              </div>`
            : ""
        }

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Order ID</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(
              orderId
            )}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Date</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${formatDate(
              createdAt
            )}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Item</th>
              <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Qty</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr>
            <td style="padding:4px 0;color:#41556f;font-size:14px;">Subtotal</td>
            <td style="padding:4px 0;color:#41556f;font-size:14px;text-align:right;">${formatCurrency(
              subtotal
            )}</td>
          </tr>
          ${
            discountAmount
              ? `<tr>
                  <td style="padding:4px 0;color:#16a34a;font-size:14px;">Discount${
                    couponCode ? ` (${escapeHtml(couponCode)})` : ""
                  }</td>
                  <td style="padding:4px 0;color:#16a34a;font-size:14px;text-align:right;">-${formatCurrency(
                    discountAmount
                  )}</td>
                </tr>`
              : ""
          }
          <tr>
            <td style="padding:12px 0 0;color:#163252;font-size:17px;font-weight:800;border-top:1px solid #eef2f7;">Total Paid</td>
            <td style="padding:12px 0 0;color:#0f9d58;font-size:17px;font-weight:800;text-align:right;border-top:1px solid #eef2f7;">${formatCurrency(
              totalAmount
            )}</td>
          </tr>
        </table>

        <p style="margin:26px 0 0;color:#6d7f98;font-size:13px;line-height:1.6;">
          Thank you for choosing Dr Dermat. If you have any questions about this booking, just
          reply to this email and our team will help you out.
        </p>
      </div>
    </div>
  </div>`;

  return {
    subject: `Booking Confirmed — ${typeLabel} (${formatCurrency(totalAmount)})`,
    text: textLines.join("\n"),
    html,
  };
};

interface ClinicTreatmentNotificationItem {
  name: string;
  quantity: number;
  price: number;
}

interface ClinicTreatmentNotificationInput {
  clinicName: string;
  orderId: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  items: ClinicTreatmentNotificationItem[];
  amountPaid: number;
  paymentId?: string;
  createdAt: Date;
}

// Sent to the clinic a patient picked (via the clinic-selection step at
// checkout) when a treatment booked at that clinic is paid for — so the
// clinic knows who's coming, for what, and what was already paid online.
export const buildClinicTreatmentNotificationEmail = (
  input: ClinicTreatmentNotificationInput
) => {
  const {
    clinicName,
    orderId,
    patientName,
    patientEmail,
    patientPhone,
    items,
    amountPaid,
    paymentId,
    createdAt,
  } = input;

  const textLines = [
    `Hi ${clinicName || "there"},`,
    "",
    "A new treatment has been booked at your clinic through Dr Dermat. Here are the details:",
    "",
    `Order ID: ${orderId}`,
    `Date: ${formatDate(createdAt)}`,
    "",
    "Patient:",
    `- Name: ${patientName || "Not provided"}`,
    ...(patientEmail ? [`- Email: ${patientEmail}`] : []),
    ...(patientPhone ? [`- Phone: ${patientPhone}`] : []),
    "",
    "Treatment(s) Booked:",
    ...items.map(
      (item) => `- ${item.name} x${item.quantity} — ${formatCurrency(item.price * item.quantity)}`
    ),
    "",
    `Amount Paid Online: ${formatCurrency(amountPaid)}`,
    ...(paymentId ? [`Payment ID: ${paymentId}`] : []),
    "",
    "Please expect the patient for this treatment and reach out if you need to confirm a visit slot.",
    "",
    "Thank you for partnering with Dr Dermat!",
  ];

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;color:#163252;font-weight:600;">${escapeHtml(
            item.name
          )}</td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:center;color:#41556f;">x${
            item.quantity
          }</td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#163252;font-weight:600;">${formatCurrency(
            item.price * item.quantity
          )}</td>
        </tr>`
    )
    .join("");

  const html = `
  <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(23,43,73,0.08);">
      <div style="background:linear-gradient(135deg,#10306b 0%,#1f49be 55%,#2981b7 100%);padding:28px 30px;color:#ffffff;">
        <p style="margin:0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Dr Dermat</p>
        <h1 style="margin:8px 0 0;font-size:22px;">New Treatment Booking 🩺</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${escapeHtml(clinicName || "Your Clinic")}</p>
      </div>

      <div style="padding:28px 30px;">
        <p style="margin:0 0 16px;color:#314461;font-size:15px;">
          Hi ${escapeHtml(clinicName || "there")}, a patient has booked a treatment at your clinic
          through Dr Dermat and has already paid online. Please find the booking and patient
          details below.
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Order ID</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(
              orderId
            )}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Date</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${formatDate(
              createdAt
            )}</td>
          </tr>
        </table>

        <div style="background:#f8fafd;border:1px solid #eef2f7;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-size:12px;color:#6d7f98;text-transform:uppercase;letter-spacing:0.06em;">Patient Details</p>
          <p style="margin:0;color:#163252;font-size:14px;font-weight:700;">${escapeHtml(
            patientName || "Not provided"
          )}</p>
          ${
            patientEmail
              ? `<p style="margin:4px 0 0;color:#41556f;font-size:13px;">${escapeHtml(patientEmail)}</p>`
              : ""
          }
          ${
            patientPhone
              ? `<p style="margin:2px 0 0;color:#41556f;font-size:13px;">${escapeHtml(patientPhone)}</p>`
              : ""
          }
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Treatment</th>
              <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Qty</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr>
            <td style="padding:12px 0 0;color:#163252;font-size:17px;font-weight:800;border-top:1px solid #eef2f7;">Amount Paid Online</td>
            <td style="padding:12px 0 0;color:#0f9d58;font-size:17px;font-weight:800;text-align:right;border-top:1px solid #eef2f7;">${formatCurrency(
              amountPaid
            )}</td>
          </tr>
          ${
            paymentId
              ? `<tr>
                  <td style="padding:6px 0 0;color:#6d7f98;font-size:12px;">Payment ID</td>
                  <td style="padding:6px 0 0;color:#6d7f98;font-size:12px;text-align:right;">${escapeHtml(
                    paymentId
                  )}</td>
                </tr>`
              : ""
          }
        </table>

        <p style="margin:26px 0 0;color:#6d7f98;font-size:13px;line-height:1.6;">
          Please expect this patient for the treatment(s) above. If you need to confirm a visit
          slot with them, reach out using the contact details provided.
        </p>
      </div>
    </div>
  </div>`;

  return {
    subject: `New Treatment Booking — ${patientName || "Patient"} (${formatCurrency(amountPaid)})`,
    text: textLines.join("\n"),
    html,
  };
};

interface OrderCancellationInput {
  recipientName: string;
  orderId: string;
  orderType: "product" | "treatment" | "consultation";
  items: OrderConfirmationItem[];
  totalAmount: number;
  cancelledAt: Date;
}

// Sent to the buyer (user, clinic, B2B user, or doctor) when they cancel
// one of their own orders/bookings.
export const buildOrderCancellationEmail = (input: OrderCancellationInput) => {
  const { recipientName, orderId, orderType, items, totalAmount, cancelledAt } = input;
  const typeLabel = ORDER_TYPE_LABEL[orderType] || "Order";

  const textLines = [
    `Hi ${recipientName || "there"},`,
    "",
    `Your ${typeLabel.toLowerCase()} has been cancelled as requested.`,
    "",
    `Order ID: ${orderId}`,
    `Cancelled On: ${formatDate(cancelledAt)}`,
    "",
    "Items:",
    ...items.map(
      (item) =>
        `- ${item.name} x${item.quantity} — ${formatCurrency(item.price * item.quantity)}${
          item.clinicName ? ` (at ${item.clinicName})` : ""
        }`
    ),
    "",
    `Total Amount: ${formatCurrency(totalAmount)}`,
    "",
    "If you didn't request this cancellation or have any questions, please reach out to our support team.",
    "",
    "Thank you for choosing Dr Dermat.",
  ];

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;">
            <div style="font-weight:600;color:#163252;">${escapeHtml(item.name)}</div>
            ${
              item.clinicName
                ? `<div style="font-size:12px;color:#6d7f98;margin-top:2px;">at ${escapeHtml(
                    item.clinicName
                  )}</div>`
                : ""
            }
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:center;color:#41556f;">x${
            item.quantity
          }</td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#163252;font-weight:600;">${formatCurrency(
            item.price * item.quantity
          )}</td>
        </tr>`
    )
    .join("");

  const html = `
  <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(23,43,73,0.08);">
      <div style="background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 55%,#dc2626 100%);padding:28px 30px;color:#ffffff;">
        <p style="margin:0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Dr Dermat</p>
        <h1 style="margin:8px 0 0;font-size:22px;">Order Cancelled</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${escapeHtml(typeLabel)}</p>
      </div>

      <div style="padding:28px 30px;">
        <p style="margin:0 0 16px;color:#314461;font-size:15px;">
          Hi ${escapeHtml(recipientName || "there")}, your ${escapeHtml(
    typeLabel.toLowerCase()
  )} has been cancelled as requested. Here's a summary of what was cancelled.
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Order ID</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(
              orderId
            )}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Cancelled On</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${formatDate(
              cancelledAt
            )}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Item</th>
              <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Qty</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr>
            <td style="padding:12px 0 0;color:#163252;font-size:17px;font-weight:800;border-top:1px solid #eef2f7;">Total Amount</td>
            <td style="padding:12px 0 0;color:#163252;font-size:17px;font-weight:800;text-align:right;border-top:1px solid #eef2f7;">${formatCurrency(
              totalAmount
            )}</td>
          </tr>
        </table>

        <p style="margin:26px 0 0;color:#6d7f98;font-size:13px;line-height:1.6;">
          If you didn't request this cancellation or have any questions, just reply to this email
          and our team will help you out.
        </p>
      </div>
    </div>
  </div>`;

  return {
    subject: `Order Cancelled — ${typeLabel} (${orderId})`,
    text: textLines.join("\n"),
    html,
  };
};

interface ClinicTreatmentCancellationInput {
  clinicName: string;
  orderId: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  items: ClinicTreatmentNotificationItem[];
  cancelledAt: Date;
}

// Sent to the clinic when a treatment booking they were notified about
// earlier gets cancelled by the patient.
export const buildClinicTreatmentCancellationEmail = (
  input: ClinicTreatmentCancellationInput
) => {
  const { clinicName, orderId, patientName, patientEmail, patientPhone, items, cancelledAt } =
    input;

  const textLines = [
    `Hi ${clinicName || "there"},`,
    "",
    "A treatment booking at your clinic has been cancelled by the patient. Here are the details:",
    "",
    `Order ID: ${orderId}`,
    `Cancelled On: ${formatDate(cancelledAt)}`,
    "",
    "Patient:",
    `- Name: ${patientName || "Not provided"}`,
    ...(patientEmail ? [`- Email: ${patientEmail}`] : []),
    ...(patientPhone ? [`- Phone: ${patientPhone}`] : []),
    "",
    "Treatment(s) Cancelled:",
    ...items.map(
      (item) => `- ${item.name} x${item.quantity} — ${formatCurrency(item.price * item.quantity)}`
    ),
    "",
    "Please do not expect this patient for the above booking.",
    "",
    "Thank you for partnering with Dr Dermat!",
  ];

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;color:#163252;font-weight:600;">${escapeHtml(
            item.name
          )}</td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:center;color:#41556f;">x${
            item.quantity
          }</td>
          <td style="padding:12px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#163252;font-weight:600;">${formatCurrency(
            item.price * item.quantity
          )}</td>
        </tr>`
    )
    .join("");

  const html = `
  <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(23,43,73,0.08);">
      <div style="background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 55%,#dc2626 100%);padding:28px 30px;color:#ffffff;">
        <p style="margin:0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Dr Dermat</p>
        <h1 style="margin:8px 0 0;font-size:22px;">Treatment Booking Cancelled</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${escapeHtml(clinicName || "Your Clinic")}</p>
      </div>

      <div style="padding:28px 30px;">
        <p style="margin:0 0 16px;color:#314461;font-size:15px;">
          Hi ${escapeHtml(
            clinicName || "there"
          )}, the patient below has cancelled their treatment booking at your clinic. Please do not
          expect them for this appointment.
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Order ID</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(
              orderId
            )}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6d7f98;font-size:13px;">Cancelled On</td>
            <td style="padding:4px 0;color:#163252;font-size:13px;font-weight:600;text-align:right;">${formatDate(
              cancelledAt
            )}</td>
          </tr>
        </table>

        <div style="background:#f8fafd;border:1px solid #eef2f7;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-size:12px;color:#6d7f98;text-transform:uppercase;letter-spacing:0.06em;">Patient Details</p>
          <p style="margin:0;color:#163252;font-size:14px;font-weight:700;">${escapeHtml(
            patientName || "Not provided"
          )}</p>
          ${
            patientEmail
              ? `<p style="margin:4px 0 0;color:#41556f;font-size:13px;">${escapeHtml(patientEmail)}</p>`
              : ""
          }
          ${
            patientPhone
              ? `<p style="margin:2px 0 0;color:#41556f;font-size:13px;">${escapeHtml(patientPhone)}</p>`
              : ""
          }
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Treatment</th>
              <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Qty</th>
              <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #163252;font-size:12px;color:#6d7f98;text-transform:uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <p style="margin:26px 0 0;color:#6d7f98;font-size:13px;line-height:1.6;">
          No action is needed from you. This is just to keep your clinic's schedule up to date.
        </p>
      </div>
    </div>
  </div>`;

  return {
    subject: `Treatment Booking Cancelled — ${patientName || "Patient"}`,
    text: textLines.join("\n"),
    html,
  };
};
