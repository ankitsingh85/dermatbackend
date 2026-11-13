import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_KEY_SECRET as string,
});

/** Create a Razorpay order for the given amount (in rupees) */
router.post("/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    res.status(200).json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error("❌ Error creating Razorpay order:", err.message);
    res.status(500).json({ message: "Failed to create payment order", error: err.message });
  }
});

// Razorpay's payments.fetch() returns method-specific sub-objects only for
// the method actually used — this turns that into one readable line for
// admin reporting, since nothing downstream can call Razorpay itself.
const describePaymentMethod = (payment: any): string => {
  const method = String(payment?.method || "").toLowerCase();
  switch (method) {
    case "upi":
      return payment?.vpa ? `UPI — ${payment.vpa}` : "UPI";
    case "card": {
      const card = payment?.card || {};
      const network = card.network || "Card";
      const last4 = card.last4 ? ` ••${card.last4}` : "";
      const type = card.type ? ` (${card.type})` : "";
      return `${network}${last4}${type}`;
    }
    case "netbanking":
      return payment?.bank ? `Netbanking — ${payment.bank}` : "Netbanking";
    case "wallet":
      return payment?.wallet ? `Wallet — ${payment.wallet}` : "Wallet";
    case "emi":
      return "EMI";
    default:
      return method ? method.charAt(0).toUpperCase() + method.slice(1) : "Unknown";
  }
};

/** Verify the payment signature returned by Razorpay Checkout after a successful payment */
router.post("/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ verified: false, message: "Missing payment details" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ verified: false, message: "Payment verification failed" });
    }

    // Best-effort — the payment is already verified above, so a failure to
    // fetch its method detail here shouldn't block checkout from completing.
    let method: string | undefined;
    let methodDetails: string | undefined;
    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      method = payment?.method;
      methodDetails = describePaymentMethod(payment);
    } catch (fetchErr: any) {
      console.error("⚠️ Could not fetch payment method details:", fetchErr.message);
    }

    res.status(200).json({ verified: true, method, methodDetails });
  } catch (err: any) {
    console.error("❌ Error verifying payment:", err.message);
    res.status(500).json({ verified: false, message: "Verification error", error: err.message });
  }
});

export default router;
