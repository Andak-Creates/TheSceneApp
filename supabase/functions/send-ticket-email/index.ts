// supabase/functions/send-ticket-email/index.ts
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://thescenehq.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TicketEmailPayload {
  ticketId: string;
  guestEmail: string;
  guestName: string;
  partyTitle: string;
  partyDate: string | null;
  partyLocation: string | null;
  partyCity: string | null;
  tierName: string;
  quantity: number;
  totalPaid: number;
  currency: string;
}

function formatCurrency(amount: number, currencyCode: string): string {
  const symbols: Record<string, string> = {
    NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "₵", KES: "KSh", ZAR: "R",
  };
  const symbol = symbols[currencyCode] ?? currencyCode + " ";
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Date TBA";
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function formatTime(dateString: string | null): string {
  if (!dateString) return "";
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function buildEmailHtml(payload: TicketEmailPayload): string {
  const {
    ticketId, guestName, partyTitle, partyDate, partyLocation,
    partyCity, tierName, quantity, totalPaid, currency,
  } = payload;

  const ticketUrl = `${SITE_URL}/ticket/${ticketId}`;
  // 300px wide QR — rendered on white background for maximum scannability
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${ticketId}&bgcolor=FFFFFF&color=000000&margin=2&qzone=2`;
  const locationDisplay = [partyLocation, partyCity].filter(Boolean).join(", ") || "Location TBA";
  const dateDisplay = formatDate(partyDate);
  const timeDisplay = formatTime(partyDate);

  // Apple logo SVG (inline, white)
  const appleSvg = `<svg width="20" height="20" viewBox="0 0 814 1000" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46 790.7 0 663.2 0 541.8c0-207.8 134.4-318 267.2-318 69.9 0 127.9 40.8 164.7 40.8 35.1 0 107.2-43.8 184.3-43.8zm-17.1-175.9c30.4-36.5 51.5-87.5 51.5-138.5 0-7.1-.6-14.3-1.9-20.1-48.6 1.9-106.6 33.3-141.4 75.5-27.5 31.8-53.1 82.8-53.1 134.5 0 7.7.6 15.4 1.3 18 3.2.6 8.4 1.3 13.6 1.3 43.8 0 97.5-29.8 129.9-70.7z"/></svg>`;

  // Google Play logo SVG (inline, white)
  const playSvg = `<svg width="20" height="20" viewBox="0 0 512 512" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your ticket for ${partyTitle}</title>
</head>
<body style="margin:0;padding:0;background:#0D0118;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0118;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr>
          <td style="text-align:center;padding-bottom:32px;">
            <div style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#a855f7);border-radius:16px;padding:12px 24px;">
              <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">TheScene</span>
            </div>
          </td>
        </tr>

        <!-- Ticket card -->
        <tr>
          <td style="background:linear-gradient(135deg,rgba(124,58,237,0.15),rgba(168,85,247,0.08));border:1px solid rgba(255,255,255,0.08);border-radius:24px;overflow:hidden;">

            <!-- Purple top bar -->
            <div style="height:4px;background:linear-gradient(90deg,#7C3AED,#a855f7);"></div>

            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Headline -->
              <tr>
                <td style="padding:28px 28px 0;">
                  <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#a855f7;letter-spacing:1.5px;text-transform:uppercase;">You're in!</p>
                  <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#fff;line-height:1.2;">${partyTitle}</h1>
                  <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">Hi ${guestName} — here is your ticket.</p>
                </td>
              </tr>

              <!-- Dashed divider -->
              <tr><td style="padding:24px 28px 0;"><div style="border-top:1px dashed rgba(255,255,255,0.12);"></div></td></tr>

              <!-- Event details 2-column grid -->
              <tr>
                <td style="padding:24px 28px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="vertical-align:top;padding-bottom:16px;padding-right:12px;">
                        <p style="margin:0 0 3px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Date</p>
                        <p style="margin:0;font-size:14px;font-weight:600;color:#fff;">${dateDisplay}</p>
                        ${timeDisplay ? `<p style="margin:2px 0 0;font-size:13px;color:rgba(255,255,255,0.5);">${timeDisplay}</p>` : ""}
                      </td>
                      <td width="50%" style="vertical-align:top;padding-bottom:16px;">
                        <p style="margin:0 0 3px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Location</p>
                        <p style="margin:0;font-size:14px;font-weight:600;color:#fff;">${locationDisplay}</p>
                      </td>
                    </tr>
                    <tr>
                      <td width="50%" style="vertical-align:top;">
                        <p style="margin:0 0 3px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Ticket Type</p>
                        <p style="margin:0;font-size:14px;font-weight:600;color:#fff;">${tierName}</p>
                        <p style="margin:2px 0 0;font-size:13px;color:rgba(255,255,255,0.5);">Qty: ${quantity}</p>
                      </td>
                      <td width="50%" style="vertical-align:top;">
                        <p style="margin:0 0 3px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Total Paid</p>
                        <p style="margin:0;font-size:16px;font-weight:700;color:#a855f7;">${formatCurrency(totalPaid, currency)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- QR Code — full width, centred -->
              <tr>
                <td style="padding:28px 28px 8px;text-align:center;">
                  <div style="border-top:1px dashed rgba(255,255,255,0.12);margin-bottom:28px;"></div>
                  <p style="margin:0 0 16px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:1.5px;text-transform:uppercase;">Scan at the door</p>
                  <div style="display:inline-block;background:#ffffff;border-radius:20px;padding:16px;box-shadow:0 0 48px rgba(139,92,246,0.35);">
                    <img src="${qrUrl}" width="260" height="260" alt="Ticket QR Code" style="display:block;border-radius:8px;" />
                  </div>
                  <p style="margin:14px 0 0;font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:0.5px;">Ticket ID: ${ticketId}</p>
                </td>
              </tr>

              <!-- View ticket CTA -->
              <tr>
                <td style="padding:20px 28px 28px;text-align:center;">
                  <a href="${ticketUrl}" style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#a855f7);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:100px;letter-spacing:0.3px;">View Ticket Online &rarr;</a>
                </td>
              </tr>

              <!-- Section divider -->
              <tr><td><div style="height:1px;background:rgba(255,255,255,0.06);"></div></td></tr>

              <!-- App download CTA -->
              <tr>
                <td style="padding:24px 28px;text-align:center;">
                  <p style="margin:0 0 16px;font-size:13px;color:rgba(255,255,255,0.4);">Want to discover more parties?</p>
                  <table cellpadding="0" cellspacing="0" align="center">
                    <tr>
                      <!-- Apple App Store -->
                      <td style="padding-right:10px;">
                        <a href="https://apps.apple.com/app/thescene" style="display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;text-decoration:none;border-radius:10px;padding:8px 16px;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="vertical-align:middle;padding-right:8px;">${appleSvg}</td>
                              <td style="vertical-align:middle;">
                                <div style="font-size:9px;color:rgba(255,255,255,0.6);line-height:1;text-transform:uppercase;letter-spacing:0.5px;">Download on the</div>
                                <div style="font-size:15px;color:#fff;font-weight:600;line-height:1.4;">App Store</div>
                              </td>
                            </tr>
                          </table>
                        </a>
                      </td>
                      <!-- Google Play -->
                      <td>
                        <a href="https://play.google.com/store/apps/details?id=com.thescene" style="display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;text-decoration:none;border-radius:10px;padding:8px 16px;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="vertical-align:middle;padding-right:8px;">${playSvg}</td>
                              <td style="vertical-align:middle;">
                                <div style="font-size:9px;color:rgba(255,255,255,0.6);line-height:1;text-transform:uppercase;letter-spacing:0.5px;">Get it on</div>
                                <div style="font-size:15px;color:#fff;font-weight:600;line-height:1.4;">Google Play</div>
                              </td>
                            </tr>
                          </table>
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="text-align:center;padding-top:28px;">
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">Secured by TheScene &bull; Powered by Paystack</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: TicketEmailPayload = await req.json();

    const { ticketId, guestEmail, guestName, partyTitle } = payload;

    if (!ticketId || !guestEmail || !guestName || !partyTitle) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = buildEmailHtml(payload);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // TODO: Replace with your verified Resend domain address e.g. tickets@thescenehq.com
        from: "TheScene Tickets <onboarding@resend.dev>",
        to: [guestEmail],
        subject: `Your ticket for ${partyTitle}`,
        html,
        reply_to: "support@thescenehq.com",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await res.json();
    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-ticket-email error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
